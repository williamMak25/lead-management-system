"""CSV export of leads/opportunities, and import with header matching like Odoo's import screen."""

import csv
import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CrmLead, SalesTeam, Stage, Tag, User, UtmValue

EXPORT_COLUMNS = [
    ("Type", lambda r: r.type),
    ("Name", lambda r: r.name),
    ("Contact Name", lambda r: r.contact.name if r.contact else r.contact_name),
    ("Company", lambda r: r.company.name if r.company else r.partner_name),
    ("Job Position", lambda r: r.function),
    ("Email", lambda r: r.email),
    ("Phone", lambda r: r.phone),
    ("Website", lambda r: r.website),
    ("City", lambda r: r.city),
    ("Country", lambda r: r.country),
    ("Salesperson", lambda r: r.user.email if r.user else ""),
    ("Sales Team", lambda r: r.team.name if r.team else ""),
    ("Stage", lambda r: r.stage.name if r.stage else ""),
    ("Status", lambda r: r.won_status),
    ("Priority", lambda r: r.priority),
    ("Expected Revenue", lambda r: f"{r.expected_revenue:f}"),
    ("Probability", lambda r: f"{r.probability:f}"),
    ("Expected Closing", lambda r: r.date_deadline.date().isoformat() if r.date_deadline else ""),
    ("Tags", lambda r: ", ".join(t.name for t in r.tags)),
    ("Source", lambda r: r.source.name if r.source else ""),
    ("Medium", lambda r: r.medium.name if r.medium else ""),
    ("Campaign", lambda r: r.campaign.name if r.campaign else ""),
    ("Lost Reason", lambda r: r.lost_reason.name if r.lost_reason else ""),
    ("Created On", lambda r: r.created_at.date().isoformat()),
    ("Notes", lambda r: r.description),
]


def export_csv(leads: list[CrmLead]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([name for name, _ in EXPORT_COLUMNS])
    for lead in leads:
        writer.writerow([get(lead) for _, get in EXPORT_COLUMNS])
    return buf.getvalue()


# header aliases (lower-cased) -> field
IMPORT_FIELDS = {
    "name": ["name", "title", "opportunity", "lead", "subject"],
    "type": ["type"],
    "contact_name": ["contact name", "contact", "full name", "person"],
    "partner_name": ["company", "company name", "customer", "organization", "organisation", "account"],
    "function": ["job position", "job title", "position", "title (job)", "function"],
    "email": ["email", "e-mail", "email address"],
    "phone": ["phone", "telephone", "mobile", "phone number"],
    "website": ["website", "url", "web"],
    "city": ["city", "town"],
    "country": ["country"],
    "user": ["salesperson", "owner", "assigned to", "user"],
    "team": ["sales team", "team"],
    "stage": ["stage"],
    "priority": ["priority", "stars"],
    "expected_revenue": ["expected revenue", "revenue", "value", "amount", "deal value"],
    "probability": ["probability", "probability (%)"],
    "date_deadline": ["expected closing", "close date", "deadline", "expected close date"],
    "tags": ["tags", "tag", "labels"],
    "source": ["source", "lead source"],
    "medium": ["medium"],
    "campaign": ["campaign"],
    "description": ["notes", "description", "internal notes", "comment"],
}


@dataclass
class ImportResult:
    columns: dict[str, str]  # csv header -> field (or "" when ignored)
    rows: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    created: int = 0


def match_headers(headers: list[str]) -> dict[str, str]:
    lookup = {alias: f for f, aliases in IMPORT_FIELDS.items() for alias in aliases}
    out, used = {}, set()
    for h in headers:
        f = lookup.get(h.strip().lower(), "")
        if f in used:
            f = ""
        used.add(f)
        out[h] = f
    return out


async def _by_name(db: AsyncSession, model, name: str, **where):
    stmt = select(model).where(func.lower(model.name) == name.strip().lower())
    for k, v in where.items():
        stmt = stmt.where(getattr(model, k) == v)
    return await db.scalar(stmt.limit(1))


async def parse_import(db: AsyncSession, text: str, default_type: str) -> tuple[ImportResult, list[dict[str, Any]]]:
    """Validate a CSV. Returns the preview result and the field values ready to create records from."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    headers = reader.fieldnames or []
    result = ImportResult(columns=match_headers(headers))
    if not any(result.columns.values()):
        result.errors.append(
            "None of the columns were recognised. Use headers like Name, Email, Company, Expected Revenue."
        )
        return result, []

    records: list[dict[str, Any]] = []
    for line_no, row in enumerate(reader, start=2):
        values = {f: (row.get(h) or "").strip() for h, f in result.columns.items() if f}
        if not any(values.values()):
            continue
        rec: dict[str, Any] = {"type": default_type, "tag_names": []}
        errs: list[str] = []
        for f, v in values.items():
            if not v:
                continue
            if f in (
                "contact_name",
                "partner_name",
                "function",
                "email",
                "phone",
                "website",
                "city",
                "country",
                "description",
                "name",
            ):
                rec[f] = v
            elif f == "type":
                t = v.lower()
                if t in ("lead", "opportunity"):
                    rec["type"] = t
                else:
                    errs.append(f"type '{v}' must be lead or opportunity")
            elif f in ("expected_revenue", "probability"):
                try:
                    num = Decimal(v.replace(",", "").replace("$", "").replace("%", ""))
                    if num < 0 or (f == "probability" and num > 100):
                        raise InvalidOperation
                    rec[f] = num
                except InvalidOperation:
                    errs.append(f"{f.replace('_', ' ')} '{v}' is not a valid number")
            elif f == "priority":
                p = v.count("★") or v.count("*") or (int(v) if v.isdigit() else -1)
                if 0 <= p <= 3:
                    rec["priority"] = p
                else:
                    errs.append(f"priority '{v}' must be 0–3")
            elif f == "date_deadline":
                try:
                    rec["date_deadline"] = date.fromisoformat(v[:10])
                except ValueError:
                    errs.append(f"expected closing '{v}' must be YYYY-MM-DD")
            elif f == "user":
                user = await db.scalar(
                    select(User).where((func.lower(User.email) == v.lower()) | (func.lower(User.name) == v.lower()))
                )
                if user:
                    rec["user_id"] = user.id
                else:
                    errs.append(f"salesperson '{v}' not found")
            elif f == "team":
                team = await _by_name(db, SalesTeam, v)
                if team:
                    rec["team_id"] = team.id
                else:
                    errs.append(f"sales team '{v}' not found")
            elif f == "stage":
                stage = await _by_name(db, Stage, v)
                if stage:
                    rec["stage_id"] = stage.id
                else:
                    errs.append(f"stage '{v}' not found")
            elif f in ("source", "medium", "campaign"):
                rec[f"{f}_name"] = v
            elif f == "tags":
                rec["tag_names"] = [t.strip() for t in v.replace(";", ",").split(",") if t.strip()]
        if not rec.get("name"):
            rec["name"] = " — ".join(x for x in (rec.get("contact_name"), rec.get("partner_name")) if x) or rec.get(
                "email", ""
            )
        if not rec["name"]:
            errs.append("needs a name, contact, company or email")
        if errs:
            result.errors.extend(f"Line {line_no}: {e}" for e in errs)
        else:
            records.append(rec)
        if len(result.rows) < 10:
            result.rows.append(
                {
                    "line": line_no,
                    **{k: str(v) for k, v in rec.items() if k != "tag_names"},
                    "tags": ", ".join(rec["tag_names"]),
                }
            )
    return result, records


async def resolve_lookups(db: AsyncSession, rec: dict[str, Any]) -> dict[str, Any]:
    """Create-if-missing for tags and UTM values (what Odoo's importer does for many2one names)."""
    rec = dict(rec)
    for kind in ("source", "medium", "campaign"):
        if name := rec.pop(f"{kind}_name", None):
            utm = await _by_name(db, UtmValue, name, kind=kind)
            if utm is None:
                utm = UtmValue(kind=kind, name=name)
                db.add(utm)
                await db.flush()
            rec[f"{kind}_id"] = utm.id
    tags = []
    for name in rec.pop("tag_names", []):
        tag = await _by_name(db, Tag, name)
        if tag is None:
            tag = Tag(name=name, color=len(name) % 12)
            db.add(tag)
            await db.flush()
        tags.append(tag)
    rec["tags"] = tags
    return rec
