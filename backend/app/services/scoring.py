"""Predictive lead scoring, modelled on Odoo's: naive Bayes over the won/lost history.

For each scoring field we count how often each value appears among won and among lost records,
then combine the per-field likelihoods for an open record into a win probability. Stage gets
special treatment, as in Odoo: a won record passed through every stage, while a lost record only
reached the stages up to the one it was lost in.
"""

import math
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CrmLead, Stage
from app.services.settings import get_settings

NONE = "∅"


@dataclass
class Frequencies:
    won_total: int = 0
    lost_total: int = 0
    # field -> value -> [won, lost]
    counts: dict[str, dict[str, list[int]]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(lambda: [0, 0]))
    )
    # stage id -> [won, lost] where lost = lost records that reached at least this stage
    stage_counts: dict[str, list[int]] = field(default_factory=dict)


def _features(lead: CrmLead, fields: list[str]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for f in fields:
        if f == "team":
            out.append((f, lead.team_id or NONE))
        elif f == "source":
            out.append((f, lead.source_id or NONE))
        elif f == "medium":
            out.append((f, lead.medium_id or NONE))
        elif f == "campaign":
            out.append((f, lead.campaign_id or NONE))
        elif f == "country":
            out.append((f, lead.country.strip().lower() or NONE))
        elif f == "email_state":
            out.append((f, "yes" if lead.email.strip() else "no"))
        elif f == "phone_state":
            out.append((f, "yes" if lead.phone.strip() else "no"))
        elif f == "tags":
            out.extend((f, t.id) for t in lead.tags)
    return out


async def _stages(db: AsyncSession) -> list[Stage]:
    return list(await db.scalars(select(Stage).order_by(Stage.sequence, Stage.name)))


async def compute_frequencies(db: AsyncSession, fields: list[str], stages: list[Stage]) -> Frequencies:
    freq = Frequencies()
    seq = {s.id: i for i, s in enumerate(stages)}
    closed = await db.scalars(
        select(CrmLead).where((CrmLead.active.is_(False)) | CrmLead.stage.has(Stage.is_won.is_(True)))
    )
    lost_reached = [0] * len(stages)
    for lead in closed:
        won = lead.won_status == "won"
        idx = 0 if won else 1
        if won:
            freq.won_total += 1
        else:
            freq.lost_total += 1
            if lead.stage_id in seq:
                for i in range(seq[lead.stage_id] + 1):
                    lost_reached[i] += 1
        for f, v in _features(lead, fields):
            freq.counts[f][v][idx] += 1
    freq.stage_counts = {s.id: [freq.won_total, lost_reached[i]] for i, s in enumerate(stages)}
    return freq


def _fallback(lead: CrmLead, stages: list[Stage]) -> float:
    """No won *and* lost history yet: grow probability with pipeline position instead."""
    open_stages = [s for s in stages if not s.is_won]
    if not open_stages or lead.stage_id is None:
        return 10.0
    pos = next((i for i, s in enumerate(open_stages) if s.id == lead.stage_id), 0)
    return round(10 + 70 * pos / max(1, len(open_stages) - 1), 2)


def predict(lead: CrmLead, freq: Frequencies, fields: list[str], stages: list[Stage]) -> float:
    if freq.won_total == 0 or freq.lost_total == 0:
        return _fallback(lead, stages)

    log_won = math.log(freq.won_total / (freq.won_total + freq.lost_total))
    log_lost = math.log(freq.lost_total / (freq.won_total + freq.lost_total))

    def add(won_n: int, lost_n: int) -> None:
        nonlocal log_won, log_lost
        # Laplace smoothing keeps unseen values from zeroing out the product
        log_won += math.log((won_n + 1) / (freq.won_total + 2))
        log_lost += math.log((lost_n + 1) / (freq.lost_total + 2))

    if "stage" in fields and lead.stage_id in freq.stage_counts:
        add(*freq.stage_counts[lead.stage_id])
    for f, v in _features(lead, fields):
        won_n, lost_n = freq.counts[f].get(v, [0, 0])
        add(won_n, lost_n)

    p = 1 / (1 + math.exp(log_lost - log_won))
    return round(min(max(p * 100, 0.01), 99.99), 2)


async def rescore(db: AsyncSession, leads: list[CrmLead] | None = None) -> int:
    """Refresh automated_probability (and probability, unless set by hand) for the given records,
    or for every open record when `leads` is None. Returns the number of records touched."""
    fields = (await get_settings(db))["scoring_fields"]
    stages = await _stages(db)
    freq = await compute_frequencies(db, fields, stages)
    if leads is None:
        leads = list(await db.scalars(select(CrmLead)))
    for lead in leads:
        status = lead.won_status
        if status == "won":
            auto = 100.0
        elif status == "lost":
            auto = 0.0
        else:
            auto = predict(lead, freq, fields, stages)
        lead.automated_probability = Decimal(str(auto))
        if lead.is_automated_probability or status != "pending":
            lead.probability = Decimal(str(auto))
    return len(leads)
