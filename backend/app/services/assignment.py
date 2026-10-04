"""Automatic lead assignment, after Odoo's: teams claim leads matching their rules, then the
team member with the most spare capacity (leads assigned in the last 30 days vs. their maximum)
gets each one."""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CrmLead, SalesTeam, User, utcnow
from app.services.leads import track


def team_matches(team: SalesTeam, lead: CrmLead) -> bool:
    rule = team.assign_domain or {}
    if (types := rule.get("types")) and lead.type not in types:
        return False
    if (sources := rule.get("sourceIds")) and lead.source_id not in sources:
        return False
    if (tags := rule.get("tagIds")) and not {t.id for t in lead.tags} & set(tags):
        return False
    if (countries := rule.get("countries")) and lead.country.strip().lower() not in {c.lower() for c in countries}:
        return False
    min_rev = rule.get("minRevenue")
    return not min_rev or lead.expected_revenue >= Decimal(str(min_rev))


async def assign(db: AsyncSession, leads: list[CrmLead], actor_id: str | None) -> int:
    """Assign a team and salesperson to each unassigned, open record. Returns how many got a salesperson."""
    teams = list(
        await db.scalars(
            select(SalesTeam)
            .where(SalesTeam.active.is_(True), SalesTeam.assign_enabled.is_(True))
            .order_by(SalesTeam.sequence, SalesTeam.name)
        )
    )
    if not teams:
        return 0
    since = utcnow() - timedelta(days=30)
    load: dict[str, int] = dict(
        (
            await db.execute(
                select(CrmLead.user_id, func.count())
                .where(CrmLead.user_id.is_not(None), CrmLead.date_open >= since)
                .group_by(CrmLead.user_id)
            )
        ).all()
    )
    teams_by_id = {t.id: t for t in teams}
    assigned = 0
    for lead in leads:
        if lead.user_id or not lead.active or lead.won_status == "won":
            continue
        team = (
            teams_by_id.get(lead.team_id) if lead.team_id else next((t for t in teams if team_matches(t, lead)), None)
        )
        if team is None:
            continue
        if lead.team_id != team.id:
            track(db, lead.id, actor_id, "team_id", None, team.name)
            lead.team_id = team.id
            lead.team = team

        candidates = [
            m for m in team.members if m.active and (m.max_leads == 0 or load.get(m.user_id, 0) < m.max_leads)
        ]
        if not candidates:
            continue
        # most spare capacity first; unlimited members count as nearly empty
        member = min(
            candidates,
            key=lambda m: (
                load.get(m.user_id, 0) / m.max_leads if m.max_leads else 0,
                load.get(m.user_id, 0),
                m.user.name,
            ),
        )
        lead.user_id = member.user_id
        lead.user = member.user
        lead.date_open = utcnow()
        load[member.user_id] = load.get(member.user_id, 0) + 1
        track(db, lead.id, actor_id, "user_id", None, (await db.get(User, member.user_id)).name)
        assigned += 1
    await db.flush()
    return assigned
