from datetime import UTC, datetime, time
from typing import Annotated, Any

from litestar import Controller, Request, Response, delete, get, post, put
from litestar.datastructures import UploadFile
from litestar.enums import RequestEncodingType
from litestar.exceptions import ValidationException
from litestar.params import Body, Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CrmLead, LeadTracking, Note, ScheduledActivity, Stage, utcnow
from app.db.setup import log_activity
from app.routes.common import current_user, get_or_404, query_dict, today
from app.schemas import (
    BulkIn,
    ConvertIn,
    DuplicateOut,
    LeadDetail,
    LeadIn,
    LeadOut,
    LeadPatch,
    LostIn,
    MergeIn,
    ScheduledActivityOut,
    TimelineItem,
    UserRef,
    changes,
    extend,
)
from app.services import leads as svc
from app.services.assignment import assign
from app.services.csv_io import export_csv, parse_import, resolve_lookups
from app.services.scoring import rescore
from app.services.settings import get_settings

ORDERS = {
    "created": [CrmLead.created_at.asc()],
    "-created": [CrmLead.created_at.desc()],
    "revenue": [CrmLead.expected_revenue.asc()],
    "-revenue": [CrmLead.expected_revenue.desc()],
    "probability": [CrmLead.probability.asc()],
    "-probability": [CrmLead.probability.desc()],
    "deadline": [CrmLead.date_deadline.asc().nulls_last()],
    "-deadline": [CrmLead.date_deadline.desc().nulls_last()],
    "name": [CrmLead.name.asc()],
    "-priority": [CrmLead.priority.desc(), CrmLead.created_at.desc()],
}


def _deadline(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        d = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValidationException(f"Invalid date: {value}") from exc
    if len(value) <= 10:
        d = datetime.combine(d.date(), time(12), tzinfo=UTC)  # midday keeps the calendar day in any timezone
    return d if d.tzinfo else d.replace(tzinfo=UTC)


async def lead_list(db: AsyncSession, leads: list[CrmLead]) -> list[LeadOut]:
    nxt = await svc.next_activities(db, [lead.id for lead in leads])
    t = today()
    return [LeadOut.of(lead, nxt.get(lead.id), t) for lead in leads]


async def lead_out(db: AsyncSession, lead_id: str) -> LeadOut:
    lead = await get_or_404(db, CrmLead, lead_id, "Record")
    return (await lead_list(db, [lead]))[0]


async def filtered(db: AsyncSession, request: Request, limit: int = 5000) -> list[CrmLead]:
    f = query_dict(request)
    stmt = svc.apply_filters(select(CrmLead), f, current_user(request).id, today())
    order = ORDERS.get(
        f.get("order", ""), ORDERS["-priority"] if f.get("type") == "opportunity" else ORDERS["-created"]
    )
    return list(await db.scalars(stmt.order_by(*order).limit(limit)))


class LeadController(Controller):
    path = "/api/leads"

    @get("/")
    async def list_leads(self, request: Request, db_session: AsyncSession) -> list[LeadOut]:
        """Filters: type, q, status (active|open|won|lost|all), userId (id|me|none), teamId, stageId, tagId,
        sourceId, mediumId, campaignId, lostReasonId, contactId, companyId, priority (min),
        createdFrom/To, deadlineFrom/To, closedFrom/To, activity (overdue|today|planned|none), order."""
        return await lead_list(db_session, await filtered(db_session, request))

    @get("/export.csv")
    async def export(self, request: Request, db_session: AsyncSession) -> Response:
        body = export_csv(await filtered(db_session, request, limit=100_000))
        name = f"{request.query_params.get('type') or 'leads'}-{today().isoformat()}.csv"
        return Response(body, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})

    @post("/import", status_code=200)
    async def import_csv(
        self,
        request: Request,
        db_session: AsyncSession,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.MULTI_PART)],
        dry_run: Annotated[bool, Parameter(query="dryRun")] = True,
        type_: Annotated[str, Parameter(query="type")] = "lead",
    ) -> dict:
        upload = data.get("file")
        if not isinstance(upload, UploadFile):
            raise ValidationException("Attach a CSV file as 'file'")
        try:
            text = (await upload.read()).decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValidationException("The file must be UTF-8 encoded CSV") from exc
        result, records = await parse_import(db_session, text, "opportunity" if type_ == "opportunity" else "lead")

        if not dry_run and not result.errors:
            actor = current_user(request)
            first = await svc.first_stage(db_session)
            created = []
            for rec in records:
                rec = await resolve_lookups(db_session, rec)
                tags = rec.pop("tags")
                if rec.get("date_deadline"):
                    rec["date_deadline"] = datetime.combine(rec["date_deadline"], time(12), tzinfo=UTC)
                lead = CrmLead(**rec, stage_id=rec.get("stage_id") or (first.id if first else None))
                lead.is_automated_probability = "probability" not in rec
                if lead.user_id:
                    lead.date_open = utcnow()
                if lead.type == "opportunity":
                    lead.date_conversion = utcnow()
                lead.tags = tags
                db_session.add(lead)
                created.append(lead)
            await db_session.flush()
            created = list(
                await db_session.scalars(
                    select(CrmLead)
                    .where(CrmLead.id.in_([lead.id for lead in created]))
                    .execution_options(populate_existing=True)
                )
            )
            for lead in created:
                db_session.add(LeadTracking(lead_id=lead.id, user_id=actor.id, field="created", new_value="Imported"))
            if (await get_settings(db_session))["auto_assign_on_create"]:
                await assign(db_session, created, actor.id)
            await rescore(db_session, created)
            log_activity(db_session, "lead_imported", f"{len(created)} records imported from CSV", "lead", "")
            result.created = len(created)
        return {
            "columns": result.columns,
            "preview": result.rows,
            "errors": result.errors[:200],
            "validCount": len(records),
            "created": result.created,
        }

    @get("/duplicates")
    async def duplicates_for(
        self,
        db_session: AsyncSession,
        email: str = "",
        phone: str = "",
        partner_name: Annotated[str, Parameter(query="partnerName")] = "",
        contact_id: Annotated[str | None, Parameter(query="contactId")] = None,
        company_id: Annotated[str | None, Parameter(query="companyId")] = None,
    ) -> list[DuplicateOut]:
        """Check a customer before creating a record (used by the New lead form)."""
        found = await svc.find_duplicates(
            db_session,
            email=email,
            phone=phone,
            partner_name=partner_name,
            contact_id=contact_id,
            company_id=company_id,
        )
        outs = await lead_list(db_session, [lead for lead, _ in found])
        return [DuplicateOut(lead=o, reasons=r) for o, (_, r) in zip(outs, found, strict=True)]

    @get("/{lead_id:str}")
    async def get_lead(self, db_session: AsyncSession, lead_id: str) -> LeadDetail:
        lead = await get_or_404(db_session, CrmLead, lead_id, "Record")
        t = today()
        acts = list(
            await db_session.scalars(
                select(ScheduledActivity)
                .where(ScheduledActivity.lead_id == lead_id)
                .order_by(ScheduledActivity.due_date)
            )
        )
        notes = await db_session.scalars(select(Note).where(Note.lead_id == lead_id))
        tracking = await db_session.scalars(select(LeadTracking).where(LeadTracking.lead_id == lead_id))

        timeline = [
            TimelineItem(kind="note", id=n.id, created_at=n.created_at, user=UserRef.of(n.author), body=n.body)
            for n in notes
        ]
        timeline += [
            TimelineItem(
                kind="tracking",
                id=tr.id,
                created_at=tr.created_at,
                user=UserRef.of(tr.user),
                field=tr.field,
                old_value=tr.old_value,
                new_value=tr.new_value,
            )
            for tr in tracking
        ]
        timeline += [
            TimelineItem(
                kind="activity_done",
                id=a.id,
                created_at=a.done_at or a.created_at,
                user=UserRef.of(a.user),
                activity_type=a.activity_type,
                summary=a.summary,
                feedback=a.feedback,
            )
            for a in acts
            if a.done
        ]
        timeline.sort(key=lambda item: item.created_at, reverse=True)

        open_acts = [a for a in acts if not a.done]
        base = LeadOut.of(lead, open_acts[0] if open_acts else None, t)
        dupes = await svc.find_duplicates(
            db_session,
            email=lead.email,
            phone=lead.phone,
            partner_name=lead.partner_name,
            contact_id=lead.contact_id,
            exclude_ids=[lead.id],
        )
        return extend(
            LeadDetail,
            base,
            activities=[ScheduledActivityOut.of(a, t) for a in open_acts],
            timeline=timeline,
            duplicate_count=len(dupes),
        )

    @get("/{lead_id:str}/duplicates")
    async def duplicates(self, db_session: AsyncSession, lead_id: str) -> list[DuplicateOut]:
        lead = await get_or_404(db_session, CrmLead, lead_id, "Record")
        found = await svc.find_duplicates(
            db_session,
            email=lead.email,
            phone=lead.phone,
            partner_name=lead.partner_name,
            contact_id=lead.contact_id,
            exclude_ids=[lead.id],
        )
        outs = await lead_list(db_session, [d for d, _ in found])
        return [DuplicateOut(lead=o, reasons=r) for o, (_, r) in zip(outs, found, strict=True)]

    @post("/")
    async def create_lead(self, request: Request, db_session: AsyncSession, data: LeadIn) -> LeadOut:
        actor = current_user(request)
        if data.type not in ("lead", "opportunity"):
            raise ValidationException("type must be 'lead' or 'opportunity'")
        stage_id = data.stage_id
        if stage_id is None and (first := await svc.first_stage(db_session)):
            stage_id = first.id
        lead = CrmLead(name=data.name, type=data.type, stage_id=stage_id, date_last_stage_update=utcnow(), tags=[])
        db_session.add(lead)
        await db_session.flush()
        # reload so relationships are populated; async sessions can't lazy-load them later
        lead = await get_or_404(db_session, CrmLead, lead.id, "Record")

        fields = {
            k: getattr(data, k)
            for k in svc.EDITABLE
            if hasattr(data, k) and k not in ("name", "type", "stage_id", "date_deadline", "probability")
        }
        fields["date_deadline"] = _deadline(data.date_deadline)
        fields["tag_ids"] = data.tag_ids
        if data.probability is not None:
            fields["probability"] = data.probability
        # apply through the normal path so FK validation and side effects match edits — but don't
        # flood the new record's timeline with "changed from empty" entries
        await svc.apply_changes(db_session, lead, fields, None)
        await db_session.execute(LeadTracking.__table__.delete().where(LeadTracking.lead_id == lead.id))
        db_session.add(LeadTracking(lead_id=lead.id, user_id=actor.id, field="created", new_value=lead.type))
        if lead.type == "opportunity":
            lead.date_conversion = utcnow()
        lead = await get_or_404(db_session, CrmLead, lead.id, "Record")

        if not lead.user_id and (await get_settings(db_session))["auto_assign_on_create"]:
            await assign(db_session, [lead], actor.id)
        await rescore(db_session, [lead])
        label = "Opportunity" if lead.type == "opportunity" else "Lead"
        log_activity(db_session, "lead_created", f'{label} "{lead.name}" created', "lead", lead.id)
        await db_session.flush()
        return await lead_out(db_session, lead.id)

    @put("/{lead_id:str}")
    async def update_lead(self, request: Request, db_session: AsyncSession, lead_id: str, data: LeadPatch) -> LeadOut:
        lead = await get_or_404(db_session, CrmLead, lead_id, "Record")
        updates = changes(data)
        if "date_deadline" in updates:
            updates["date_deadline"] = _deadline(updates["date_deadline"])
        await svc.apply_changes(db_session, lead, updates, current_user(request).id)
        # a stage change can close the record, which changes the won/lost history every score learns from
        await rescore(db_session, None if "stage_id" in updates else [lead])
        await db_session.flush()
        return await lead_out(db_session, lead_id)

    @post("/{lead_id:str}/won", status_code=200)
    async def won(self, request: Request, db_session: AsyncSession, lead_id: str) -> LeadOut:
        lead = await get_or_404(db_session, CrmLead, lead_id, "Record")
        await svc.mark_won(db_session, lead, current_user(request).id)
        await rescore(db_session)
        return await lead_out(db_session, lead_id)

    @post("/{lead_id:str}/lost", status_code=200)
    async def lost(self, request: Request, db_session: AsyncSession, lead_id: str, data: LostIn) -> LeadOut:
        lead = await get_or_404(db_session, CrmLead, lead_id, "Record")
        await svc.mark_lost(db_session, lead, current_user(request).id, data.lost_reason_id, data.lost_feedback)
        await rescore(db_session)
        return await lead_out(db_session, lead_id)

    @post("/{lead_id:str}/restore", status_code=200)
    async def restore(self, request: Request, db_session: AsyncSession, lead_id: str) -> LeadOut:
        lead = await get_or_404(db_session, CrmLead, lead_id, "Record")
        await svc.restore(db_session, lead, current_user(request).id)
        await rescore(db_session)
        return await lead_out(db_session, lead_id)

    @post("/{lead_id:str}/probability/auto", status_code=200)
    async def automated_probability(self, db_session: AsyncSession, lead_id: str) -> LeadOut:
        lead = await get_or_404(db_session, CrmLead, lead_id, "Record")
        lead.is_automated_probability = True
        await rescore(db_session, [lead])
        await db_session.flush()
        return await lead_out(db_session, lead_id)

    @post("/{lead_id:str}/convert", status_code=200)
    async def convert(self, request: Request, db_session: AsyncSession, lead_id: str, data: ConvertIn) -> LeadOut:
        lead = await get_or_404(db_session, CrmLead, lead_id, "Record")
        await svc.convert(
            db_session,
            lead,
            current_user(request).id,
            customer=data.customer,
            contact_id=data.contact_id,
            user_id=data.user_id,
            team_id=data.team_id,
            merge_ids=data.merge_ids,
        )
        await rescore(db_session, [lead])
        await db_session.flush()
        return await lead_out(db_session, lead_id)

    @post("/merge", status_code=200)
    async def merge(self, request: Request, db_session: AsyncSession, data: MergeIn) -> LeadOut:
        records = list(await db_session.scalars(select(CrmLead).where(CrmLead.id.in_(data.ids))))
        if len(records) < 2:
            raise ValidationException("Select at least two existing records to merge")
        target = next((r for r in records if r.id == data.target_id), None) or svc.merge_target(records)
        target = await svc.merge(db_session, records, target, current_user(request).id)
        await rescore(db_session, [target])
        await db_session.flush()
        return await lead_out(db_session, target.id)

    @post("/bulk", status_code=200)
    async def bulk(self, request: Request, db_session: AsyncSession, data: BulkIn) -> dict:
        actor = current_user(request).id
        records = list(await db_session.scalars(select(CrmLead).where(CrmLead.id.in_(data.ids))))
        for lead in records:
            match data.action:
                case "assign":
                    upd = {}
                    if data.user_id is not None:
                        upd["user_id"] = data.user_id or None
                    if data.team_id is not None:
                        upd["team_id"] = data.team_id or None
                    await svc.apply_changes(db_session, lead, upd, actor)
                case "stage":
                    if not data.stage_id or await db_session.get(Stage, data.stage_id) is None:
                        raise ValidationException("Choose a stage")
                    await svc.apply_changes(db_session, lead, {"stage_id": data.stage_id}, actor)
                case "tag":
                    ids = list(dict.fromkeys([t.id for t in lead.tags] + data.tag_ids))
                    await svc.apply_changes(db_session, lead, {"tag_ids": ids}, actor)
                case "lost":
                    if lead.active:
                        await svc.mark_lost(db_session, lead, actor, data.lost_reason_id, data.lost_feedback)
                case "won":
                    await svc.mark_won(db_session, lead, actor)
                case "restore":
                    if not lead.active:
                        await svc.restore(db_session, lead, actor)
                case "convert":
                    if lead.type == "lead":
                        await svc.convert(db_session, lead, actor, customer="create")
                case "delete":
                    await db_session.delete(lead)
                case "auto_assign":
                    pass
                case _:
                    raise ValidationException(f"Unknown action: {data.action}")
        count = len(records)
        if data.action == "auto_assign":
            count = await assign(db_session, records, actor)
        await db_session.flush()
        if data.action != "delete":
            await rescore(db_session)
        return {"count": count}

    @post("/auto-assign", status_code=200)
    async def auto_assign_all(self, request: Request, db_session: AsyncSession) -> dict:
        records = list(
            await db_session.scalars(
                select(CrmLead).where(CrmLead.user_id.is_(None), CrmLead.active.is_(True)).order_by(CrmLead.created_at)
            )
        )
        return {"assigned": await assign(db_session, records, current_user(request).id)}

    @post("/rescore", status_code=200)
    async def rescore_all(self, db_session: AsyncSession) -> dict:
        return {"updated": await rescore(db_session)}

    @delete("/{lead_id:str}")
    async def delete_lead(self, db_session: AsyncSession, lead_id: str) -> None:
        lead = await db_session.get(CrmLead, lead_id)
        if lead is not None:
            await db_session.delete(lead)
