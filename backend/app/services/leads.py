"""Business rules for leads & opportunities: tracked edits, won/lost, conversion, duplicates, merging."""

import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from litestar.exceptions import HTTPException, ValidationException
from sqlalchemy import Select, and_, delete, exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Company,
    Contact,
    CrmLead,
    LeadTracking,
    LostReason,
    Note,
    SalesTeam,
    ScheduledActivity,
    Stage,
    Tag,
    User,
    UtmValue,
    utcnow,
)
from app.db.setup import log_activity

# FK fields: model used to validate ids and to show a readable name in the timeline
FK_FIELDS: dict[str, type] = {
    "stage_id": Stage,
    "user_id": User,
    "team_id": SalesTeam,
    "contact_id": Contact,
    "company_id": Company,
    "lost_reason_id": LostReason,
    "campaign_id": UtmValue,
    "medium_id": UtmValue,
    "source_id": UtmValue,
}
TRACKED = {
    "name",
    "type",
    "stage_id",
    "user_id",
    "team_id",
    "contact_id",
    "company_id",
    "expected_revenue",
    "probability",
    "priority",
    "date_deadline",
    "email",
    "phone",
    "partner_name",
    "contact_name",
    "lost_reason_id",
}
EDITABLE = {
    "name", "type", "contact_id", "company_id", "contact_name", "partner_name", "function", "email", "phone",
    "website", "city", "country", "user_id", "team_id", "stage_id", "priority", "expected_revenue", "probability",
    "date_deadline", "lost_feedback", "campaign_id", "medium_id", "source_id", "description",
}  # fmt: skip


def _display(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, Decimal):
        return f"{value.normalize():f}"
    if hasattr(value, "name"):
        return value.name
    return str(value)


async def _fk_display(db: AsyncSession, field: str, value: str | None) -> str | None:
    if value is None:
        return None
    obj = await db.get(FK_FIELDS[field], value)
    return _display(obj) if obj else value


def track(db: AsyncSession, lead_id: str, actor_id: str | None, field: str, old: Any, new: Any) -> None:
    old_s, new_s = _display(old), _display(new)
    if old_s != new_s:
        db.add(LeadTracking(lead_id=lead_id, user_id=actor_id, field=field, old_value=old_s, new_value=new_s))


async def first_stage(db: AsyncSession) -> Stage | None:
    return await db.scalar(select(Stage).where(Stage.is_won.is_(False)).order_by(Stage.sequence).limit(1))


async def won_stage(db: AsyncSession) -> Stage | None:
    return await db.scalar(select(Stage).where(Stage.is_won.is_(True)).order_by(Stage.sequence).limit(1))


async def set_tags(db: AsyncSession, lead: CrmLead, tag_ids: list[str]) -> None:
    tags = list(await db.scalars(select(Tag).where(Tag.id.in_(tag_ids)))) if tag_ids else []
    if len(tags) != len(set(tag_ids)):
        raise ValidationException("Unknown tag id")
    lead.tags = tags


async def apply_changes(db: AsyncSession, lead: CrmLead, changes: dict[str, Any], actor_id: str | None) -> None:
    """Apply an edit with Odoo's side effects and record tracked fields in the timeline."""
    changes = {k: v for k, v in changes.items() if k in EDITABLE or k == "tag_ids"}
    for field, value in changes.items():
        if field in FK_FIELDS and value is not None and await db.get(FK_FIELDS[field], value) is None:
            raise ValidationException(f"{field}: no such record")
    if "type" in changes and changes["type"] not in ("lead", "opportunity"):
        raise ValidationException("type must be 'lead' or 'opportunity'")
    if "priority" in changes and not 0 <= int(changes["priority"]) <= 3:
        raise ValidationException("priority must be between 0 and 3")

    now = utcnow()
    was_lead = lead.type == "lead"
    for field, value in changes.items():
        if field == "tag_ids":
            await set_tags(db, lead, value)
            continue
        old = getattr(lead, field)
        if field in ("expected_revenue", "probability"):
            value = Decimal(str(value or 0))
        if field in TRACKED and old != value:
            if field in FK_FIELDS:
                track(
                    db, lead.id, actor_id, field, await _fk_display(db, field, old), await _fk_display(db, field, value)
                )
            else:
                track(db, lead.id, actor_id, field, old, value)
        setattr(lead, field, value)
        if field in FK_FIELDS:
            # keep the relationship in step with the id, so won_status & co. see the new value
            setattr(lead, field.removesuffix("_id"), await db.get(FK_FIELDS[field], value) if value else None)

    if was_lead and lead.type == "opportunity" and lead.date_conversion is None:
        lead.date_conversion = now
    if "probability" in changes:
        lead.is_automated_probability = False
    if changes.get("user_id"):
        lead.date_open = now
    if "stage_id" in changes:
        lead.date_last_stage_update = now
        stage = await db.get(Stage, lead.stage_id) if lead.stage_id else None
        if stage and stage.is_won and lead.active:
            lead.probability = Decimal(100)
            lead.date_closed = now
            log_activity(db, "lead_won", f'"{lead.name}" won', "lead", lead.id)
        elif lead.date_closed and lead.active:
            lead.date_closed = None  # moved back out of the won stage
    if "contact_id" in changes and lead.contact_id:
        contact = await db.get(Contact, lead.contact_id)
        if contact and "company_id" not in changes and contact.company_id:
            lead.company_id = contact.company_id
    lead.updated_at = now
    await db.flush()


async def mark_won(db: AsyncSession, lead: CrmLead, actor_id: str | None) -> None:
    stage = await won_stage(db)
    if stage is None:
        raise HTTPException(status_code=400, detail="No stage is marked as 'won'. Configure one in Settings → Stages.")
    if not lead.active:
        await restore(db, lead, actor_id)
    await apply_changes(db, lead, {"stage_id": stage.id, "type": "opportunity"}, actor_id)


async def mark_lost(
    db: AsyncSession, lead: CrmLead, actor_id: str | None, reason_id: str | None, feedback: str = ""
) -> None:
    if reason_id and await db.get(LostReason, reason_id) is None:
        raise ValidationException("lost_reason_id: no such record")
    track(db, lead.id, actor_id, "status", lead.won_status, "lost")
    track(db, lead.id, actor_id, "lost_reason_id", None, await _fk_display(db, "lost_reason_id", reason_id))
    lead.active = False
    lead.lost_reason_id = reason_id
    lead.lost_reason = await db.get(LostReason, reason_id) if reason_id else None
    lead.lost_feedback = feedback
    lead.probability = Decimal(0)
    lead.date_closed = utcnow()
    lead.updated_at = utcnow()
    log_activity(db, "lead_lost", f'"{lead.name}" marked as lost', "lead", lead.id)
    await db.flush()


async def restore(db: AsyncSession, lead: CrmLead, actor_id: str | None) -> None:
    track(db, lead.id, actor_id, "status", "lost", "pending")
    lead.active = True
    lead.lost_reason_id = None
    lead.lost_reason = None
    lead.lost_feedback = ""
    lead.date_closed = None
    lead.is_automated_probability = True
    lead.updated_at = utcnow()
    await db.flush()


# ---- duplicates & merging ----------------------------------------------------

_DIGITS = re.compile(r"\D")


def _phone_key(phone: str) -> str:
    digits = _DIGITS.sub("", phone or "")
    return digits[-9:] if len(digits) >= 7 else ""


async def find_duplicates(
    db: AsyncSession,
    *,
    email: str = "",
    phone: str = "",
    partner_name: str = "",
    contact_id: str | None = None,
    company_id: str | None = None,
    exclude_ids: list[str] | None = None,
) -> list[tuple[CrmLead, list[str]]]:
    """Records that look like the same customer: same email, phone, company or contact."""
    email, partner_name, phone_key = email.strip().lower(), partner_name.strip().lower(), _phone_key(phone)
    conds = []
    if email:
        conds.append(func.lower(CrmLead.email) == email)
    if phone_key:
        conds.append(func.right(func.regexp_replace(CrmLead.phone, r"\D", "", "g"), len(phone_key)) == phone_key)
    if partner_name:
        conds.append(func.lower(CrmLead.partner_name) == partner_name)
    if contact_id:
        conds.append(CrmLead.contact_id == contact_id)
    if company_id:
        conds.append(CrmLead.company_id == company_id)
    if not conds:
        return []
    stmt = select(CrmLead).where(or_(*conds)).order_by(CrmLead.created_at.desc()).limit(50)
    if exclude_ids:
        stmt = stmt.where(CrmLead.id.not_in(exclude_ids))
    out = []
    for lead in await db.scalars(stmt):
        reasons = []
        if email and lead.email.strip().lower() == email:
            reasons.append("email")
        if phone_key and _phone_key(lead.phone)[-len(phone_key) :] == phone_key:
            reasons.append("phone")
        if partner_name and lead.partner_name.strip().lower() == partner_name:
            reasons.append("company")
        if (contact_id and lead.contact_id == contact_id) or (company_id and lead.company_id == company_id):
            reasons.append("customer")
        out.append((lead, reasons))
    return out


MERGE_FILL_FIELDS = [
    "contact_id", "company_id", "contact_name", "partner_name", "function", "email", "phone", "website", "city",
    "country", "user_id", "team_id", "date_deadline", "campaign_id", "medium_id", "source_id",
]  # fmt: skip


def merge_target(leads: list[CrmLead]) -> CrmLead:
    """Odoo picks the most advanced record: opportunities before leads, later stage first, then oldest."""

    def key(lead: CrmLead):
        return (
            0 if lead.type == "opportunity" else 1,
            0 if lead.active else 1,
            -(lead.stage.sequence if lead.stage else -1),
            lead.created_at,
        )

    return min(leads, key=key)


async def merge(db: AsyncSession, leads: list[CrmLead], target: CrmLead, actor_id: str | None) -> CrmLead:
    others = [lead for lead in leads if lead.id != target.id]
    if not others:
        raise ValidationException("Select at least two records to merge")
    ordered = [target, *others]

    for field in MERGE_FILL_FIELDS:
        if not getattr(target, field):
            value = next((getattr(r, field) for r in others if getattr(r, field)), None)
            if value:
                setattr(target, field, value)
    if not target.expected_revenue:
        target.expected_revenue = next((r.expected_revenue for r in others if r.expected_revenue), Decimal(0))
    target.priority = max(r.priority for r in ordered)
    if any(r.type == "opportunity" for r in others):
        target.type = "opportunity"
    descriptions = [r.description.strip() for r in ordered if r.description.strip()]
    target.description = "\n\n".join(dict.fromkeys(descriptions))
    target.tags = list({t.id: t for r in ordered for t in r.tags}.values())

    other_ids = [r.id for r in others]
    for model in (ScheduledActivity, Note, LeadTracking):
        await db.execute(update(model).where(model.lead_id.in_(other_ids)).values(lead_id=target.id))
    db.add(
        LeadTracking(
            lead_id=target.id,
            user_id=actor_id,
            field="merged",
            old_value=", ".join(r.name for r in others),
            new_value=target.name,
        )
    )
    log_activity(db, "lead_merged", f'{len(ordered)} records merged into "{target.name}"', "lead", target.id)
    target.updated_at = utcnow()
    await db.flush()
    await db.execute(delete(CrmLead).where(CrmLead.id.in_(other_ids)))
    await db.flush()
    return target


# ---- conversion --------------------------------------------------------------


async def convert(
    db: AsyncSession,
    lead: CrmLead,
    actor_id: str | None,
    *,
    customer: str = "create",
    contact_id: str | None = None,
    user_id: str | None = None,
    team_id: str | None = None,
    merge_ids: list[str] | None = None,
) -> CrmLead:
    """Lead → opportunity, optionally creating or linking the customer and merging duplicates (Odoo's convert wizard)."""
    if lead.type == "opportunity":
        raise HTTPException(status_code=400, detail="This record is already an opportunity")

    changes: dict[str, Any] = {"type": "opportunity"}
    if customer == "link":
        contact = await db.get(Contact, contact_id) if contact_id else None
        if contact is None:
            raise ValidationException("Choose an existing contact to link")
        changes |= {"contact_id": contact.id, "company_id": contact.company_id}
    elif customer == "create":
        company = None
        if lead.company_id:
            company = await db.get(Company, lead.company_id)
        elif lead.partner_name.strip():
            company = await db.scalar(
                select(Company).where(func.lower(Company.name) == lead.partner_name.strip().lower())
            ) or Company(name=lead.partner_name.strip(), website=lead.website)
            db.add(company)
            await db.flush()
        if lead.contact_id is None and (lead.contact_name.strip() or lead.email.strip()):
            contact = Contact(
                name=lead.contact_name.strip() or lead.email.strip(),
                email=lead.email,
                phone=lead.phone,
                title=lead.function,
                company_id=company.id if company else None,
            )
            db.add(contact)
            await db.flush()
            changes["contact_id"] = contact.id
        if company:
            changes["company_id"] = company.id
    elif customer != "nothing":
        raise ValidationException("customer must be 'create', 'link' or 'nothing'")

    if user_id is not None:
        changes["user_id"] = user_id or None
    if team_id is not None:
        changes["team_id"] = team_id or None
    if lead.stage_id is None and (stage := await first_stage(db)):
        changes["stage_id"] = stage.id

    await apply_changes(db, lead, changes, actor_id)
    lead.date_conversion = utcnow()
    log_activity(db, "lead_converted", f'Lead "{lead.name}" converted to an opportunity', "lead", lead.id)

    if merge_ids:
        others = list(await db.scalars(select(CrmLead).where(CrmLead.id.in_(merge_ids), CrmLead.id != lead.id)))
        if others:
            await merge(db, [lead, *others], lead, actor_id)
    await db.flush()
    return lead


# ---- list filtering ----------------------------------------------------------


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError as exc:
        raise ValidationException(f"Invalid date: {value}") from exc


SEARCH_COLUMNS = (CrmLead.name, CrmLead.contact_name, CrmLead.partner_name, CrmLead.email, CrmLead.phone, CrmLead.city)


def apply_filters(stmt: Select, f: dict[str, Any], actor_id: str | None, today: date) -> Select:
    """Shared by the list, export, kanban and report endpoints. `f` holds camelCase query params."""
    status = f.get("status") or "active"
    won_stage_ids = select(Stage.id).where(Stage.is_won.is_(True))
    if status == "active":
        stmt = stmt.where(CrmLead.active.is_(True))
    elif status == "open":
        stmt = stmt.where(
            CrmLead.active.is_(True), or_(CrmLead.stage_id.is_(None), CrmLead.stage_id.not_in(won_stage_ids))
        )
    elif status == "won":
        stmt = stmt.where(CrmLead.active.is_(True), CrmLead.stage_id.in_(won_stage_ids))
    elif status == "lost":
        stmt = stmt.where(CrmLead.active.is_(False))
    elif status != "all":
        raise ValidationException("status must be active, open, won, lost or all")

    if t := f.get("type"):
        stmt = stmt.where(CrmLead.type == t)
    if q := (f.get("q") or "").strip():
        pattern = f"%{q.lower()}%"
        stmt = stmt.where(or_(*(func.lower(c).like(pattern) for c in SEARCH_COLUMNS)))
    if user := f.get("userId"):
        if user == "none":
            stmt = stmt.where(CrmLead.user_id.is_(None))
        else:
            stmt = stmt.where(CrmLead.user_id == (actor_id if user == "me" else user))
    for param, col in (
        ("teamId", CrmLead.team_id),
        ("stageId", CrmLead.stage_id),
        ("sourceId", CrmLead.source_id),
        ("mediumId", CrmLead.medium_id),
        ("campaignId", CrmLead.campaign_id),
        ("lostReasonId", CrmLead.lost_reason_id),
        ("contactId", CrmLead.contact_id),
        ("companyId", CrmLead.company_id),
    ):
        if value := f.get(param):
            stmt = stmt.where(col == value)
    if tag := f.get("tagId"):
        stmt = stmt.where(CrmLead.tags.any(Tag.id == tag))
    if (priority := f.get("priority")) not in (None, ""):
        stmt = stmt.where(CrmLead.priority >= int(priority))
    for param, col, end in (
        ("createdFrom", CrmLead.created_at, False),
        ("createdTo", CrmLead.created_at, True),
        ("deadlineFrom", CrmLead.date_deadline, False),
        ("deadlineTo", CrmLead.date_deadline, True),
        ("closedFrom", CrmLead.date_closed, False),
        ("closedTo", CrmLead.date_closed, True),
    ):
        if d := _parse_date(f.get(param)):
            stmt = stmt.where(col < d + timedelta(days=1) if end else col >= d)

    if state := f.get("activity"):
        open_acts = and_(ScheduledActivity.lead_id == CrmLead.id, ScheduledActivity.done.is_(False))
        if state == "overdue":
            stmt = stmt.where(exists().where(open_acts, ScheduledActivity.due_date < today))
        elif state == "today":
            stmt = stmt.where(exists().where(open_acts, ScheduledActivity.due_date == today))
        elif state == "planned":
            stmt = stmt.where(exists().where(open_acts, ScheduledActivity.due_date > today))
        elif state == "none":
            stmt = stmt.where(~exists().where(open_acts))
        if state in ("overdue", "today", "planned") and f.get("activityUserId") == "me":
            stmt = stmt.where(exists().where(open_acts, ScheduledActivity.user_id == actor_id))
    return stmt


async def next_activities(db: AsyncSession, lead_ids: list[str]) -> dict[str, ScheduledActivity]:
    """Earliest open activity per record, used for the activity state badge."""
    if not lead_ids:
        return {}
    rows = await db.scalars(
        select(ScheduledActivity)
        .where(ScheduledActivity.lead_id.in_(lead_ids), ScheduledActivity.done.is_(False))
        .order_by(ScheduledActivity.lead_id, ScheduledActivity.due_date)
        .distinct(ScheduledActivity.lead_id)
    )
    return {a.lead_id: a for a in rows}
