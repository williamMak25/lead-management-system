"""Pivot-style analysis over leads & opportunities (Odoo's Pipeline / Leads analysis)."""

from collections import defaultdict
from collections.abc import Callable, Iterable
from typing import Any

from litestar import Controller, Request, get
from litestar.exceptions import ValidationException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CrmLead, Stage
from app.routes.common import current_user, query_dict, today
from app.schemas import money
from app.services.leads import apply_filters

NONE_KEY = "__none__"


def _month(dt) -> tuple[str, str] | None:
    return (dt.strftime("%Y-%m"), dt.strftime("%b %Y")) if dt else None


def _ref(obj) -> tuple[str, str] | None:
    return (obj.id, obj.name) if obj else None


# dimension -> function returning [(key, label)] for a record (several for tags)
DIMENSIONS: dict[str, tuple[str, Callable[[CrmLead], Iterable[tuple[str, str] | None]]]] = {
    "stage": ("Stage", lambda r: [_ref(r.stage)]),
    "user": ("Salesperson", lambda r: [(r.user.id, r.user.name or r.user.email) if r.user else None]),
    "team": ("Sales team", lambda r: [_ref(r.team)]),
    "type": ("Type", lambda r: [(r.type, r.type.capitalize())]),
    "status": ("Status", lambda r: [(r.won_status, {"won": "Won", "lost": "Lost", "pending": "Open"}[r.won_status])]),
    "source": ("Source", lambda r: [_ref(r.source)]),
    "medium": ("Medium", lambda r: [_ref(r.medium)]),
    "campaign": ("Campaign", lambda r: [_ref(r.campaign)]),
    "lost_reason": ("Lost reason", lambda r: [_ref(r.lost_reason)]),
    "priority": ("Priority", lambda r: [(str(r.priority), "★" * r.priority or "Normal")]),
    "tag": ("Tag", lambda r: [(t.id, t.name) for t in r.tags] or [None]),
    "country": ("Country", lambda r: [(r.country.strip().lower(), r.country.strip())] if r.country.strip() else [None]),
    "created_month": ("Created", lambda r: [_month(r.created_at)]),
    "deadline_month": ("Expected closing", lambda r: [_month(r.date_deadline)]),
    "closed_month": ("Closed", lambda r: [_month(r.date_closed)]),
    "conversion_month": ("Converted", lambda r: [_month(r.date_conversion)]),
}

MEASURES = {
    "count": "Count",
    "expected_revenue": "Expected revenue",
    "prorated_revenue": "Prorated revenue",
    "avg_probability": "Avg. probability",
    "won_count": "Won",
    "lost_count": "Lost",
    "win_rate": "Win rate %",
    "converted_count": "Converted to opportunity",
    "conversion_rate": "Conversion rate %",
    "won_revenue": "Won revenue",
}


class _Acc:
    __slots__ = ("converted", "count", "lost", "probability", "prorated", "revenue", "won", "won_revenue")

    def __init__(self):
        self.count = self.won = self.lost = self.converted = 0
        self.revenue = self.prorated = self.probability = self.won_revenue = 0.0

    def add(self, r: CrmLead) -> None:
        rev, prob = float(r.expected_revenue), float(r.probability)
        self.count += 1
        self.revenue += rev
        self.prorated += rev * prob / 100
        self.probability += prob
        status = r.won_status
        self.won += status == "won"
        self.lost += status == "lost"
        self.won_revenue += rev if status == "won" else 0
        self.converted += r.date_conversion is not None

    def value(self, measure: str) -> float | int:
        match measure:
            case "count":
                return self.count
            case "expected_revenue":
                return money(round(self.revenue, 2))
            case "prorated_revenue":
                return money(round(self.prorated, 2))
            case "avg_probability":
                return round(self.probability / self.count, 1) if self.count else 0
            case "won_count":
                return self.won
            case "lost_count":
                return self.lost
            case "win_rate":
                closed = self.won + self.lost
                return round(self.won * 100 / closed, 1) if closed else 0
            case "converted_count":
                return self.converted
            case "conversion_rate":
                return round(self.converted * 100 / self.count, 1) if self.count else 0
            case "won_revenue":
                return money(round(self.won_revenue, 2))
        raise ValueError(measure)


class ReportController(Controller):
    path = "/api/reports"

    @get("/options")
    async def options(self) -> dict:
        return {
            "dimensions": [{"key": k, "label": v[0]} for k, v in DIMENSIONS.items()],
            "measures": [{"key": k, "label": v} for k, v in MEASURES.items()],
        }

    @get("/leads")
    async def pivot(self, request: Request, db_session: AsyncSession) -> dict[str, Any]:
        """rows/cols: a dimension key (cols optional); measure: a measure key. Accepts every list filter;
        status defaults to "all" here, since reports usually cover won and lost records too."""
        f = query_dict(request)
        f.setdefault("status", "all")
        rows_dim, cols_dim, measure = f.get("rows", "stage"), f.get("cols"), f.get("measure", "count")
        if rows_dim not in DIMENSIONS or (cols_dim and cols_dim not in DIMENSIONS):
            raise ValidationException(f"rows/cols must be one of: {', '.join(DIMENSIONS)}")
        if measure not in MEASURES:
            raise ValidationException(f"measure must be one of: {', '.join(MEASURES)}")

        records = await db_session.scalars(apply_filters(select(CrmLead), f, current_user(request).id, today()))
        labels: dict[str, dict[str, str]] = {"rows": {}, "cols": {}}
        cells: dict[str, dict[str, _Acc]] = defaultdict(lambda: defaultdict(_Acc))
        row_tot: dict[str, _Acc] = defaultdict(_Acc)
        col_tot: dict[str, _Acc] = defaultdict(_Acc)
        total = _Acc()

        def keys(dim: str | None, r: CrmLead, bucket: str) -> list[str]:
            if not dim:
                return ["__all__"]
            out = []
            for kv in DIMENSIONS[dim][1](r):
                key, label = kv if kv else (NONE_KEY, "None")
                labels[bucket][key] = label
                out.append(key)
            return out

        for r in records:
            total.add(r)
            rks, cks = keys(rows_dim, r, "rows"), keys(cols_dim, r, "cols")
            for rk in rks:
                row_tot[rk].add(r)
                for ck in cks:
                    cells[rk][ck].add(r)
            for ck in cks:
                col_tot[ck].add(r)

        def ordered(bucket: str, totals: dict[str, _Acc], dim: str | None) -> list[dict[str, str]]:
            if not dim:
                return [{"key": "__all__", "label": MEASURES[measure]}]
            items = list(labels[bucket].items())
            if dim.endswith("_month") or dim == "priority":
                items.sort(key=lambda kv: (kv[0] == NONE_KEY, kv[0]))
            elif dim == "stage":
                items.sort(key=lambda kv: (kv[0] == NONE_KEY, stage_seq.get(kv[0], 1_000_000)))
            else:
                items.sort(key=lambda kv: (kv[0] == NONE_KEY, -totals[kv[0]].count, kv[1].lower()))
            return [{"key": k, "label": v} for k, v in items]

        stage_seq = dict((await db_session.execute(select(Stage.id, Stage.sequence))).all())
        rows = ordered("rows", row_tot, rows_dim)
        cols = ordered("cols", col_tot, cols_dim)
        return {
            "rows": rows,
            "cols": cols,
            "measure": {"key": measure, "label": MEASURES[measure]},
            "cells": {rk: {ck: acc.value(measure) for ck, acc in cs.items()} for rk, cs in cells.items()},
            "rowTotals": {k: v.value(measure) for k, v in row_tot.items()},
            "colTotals": {k: v.value(measure) for k, v in col_tot.items()},
            "total": total.value(measure),
            "recordCount": total.count,
        }
