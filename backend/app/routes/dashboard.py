from collections import defaultdict
from datetime import UTC, date, datetime

from litestar import Controller, Request, get
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Activity, Company, Contact, CrmLead, ScheduledActivity, Stage
from app.routes.common import current_user, today
from app.schemas import FeedItemOut, money


class DashboardController(Controller):
    path = "/api/dashboard"

    @get("/summary")
    async def summary(self, request: Request, db_session: AsyncSession) -> dict:
        me = current_user(request).id
        t = today()
        stages = list(await db_session.scalars(select(Stage).order_by(Stage.sequence)))
        records = list(await db_session.scalars(select(CrmLead)))

        leads = [r for r in records if r.type == "lead"]
        opps = [r for r in records if r.type == "opportunity"]
        open_opps = [r for r in opps if r.won_status == "pending"]
        won = [r for r in records if r.won_status == "won"]
        lost_opps = [r for r in opps if r.won_status == "lost"]

        by_stage: dict[str, list[CrmLead]] = defaultdict(list)
        for r in opps:
            if r.active and r.stage_id:
                by_stage[r.stage_id].append(r)
        stage_breakdown = [
            {
                "stage": s.name,
                "isWon": s.is_won,
                "count": len(by_stage[s.id]),
                "value": money(sum(r.expected_revenue for r in by_stage[s.id])),
            }
            for s in stages
        ]
        stage_breakdown.append(
            {
                "stage": "Lost",
                "isWon": False,
                "count": len(lost_opps),
                "value": money(sum(r.expected_revenue for r in lost_opps)),
            }
        )

        months = []
        for i in range(5, -1, -1):
            year, month = divmod(t.year * 12 + t.month - 1 - i, 12)
            months.append(date(year, month + 1, 1))
        won_by_month: dict[str, float] = defaultdict(float)
        for r in won:
            if r.date_closed:
                won_by_month[r.date_closed.astimezone(UTC).strftime("%Y-%m")] += float(r.expected_revenue)
        revenue_by_month = [
            {"month": m.strftime("%b"), "value": money(won_by_month[m.strftime("%Y-%m")])} for m in months
        ]

        acts = (
            await db_session.execute(
                select(
                    func.count().filter(ScheduledActivity.due_date < t),
                    func.count().filter(ScheduledActivity.due_date == t),
                    func.count().filter(ScheduledActivity.due_date > t),
                    func.count().filter(ScheduledActivity.due_date < t, ScheduledActivity.user_id == me),
                    func.count().filter(ScheduledActivity.due_date == t, ScheduledActivity.user_id == me),
                ).where(ScheduledActivity.done.is_(False))
            )
        ).one()

        closed = len(won) + len(lost_opps)
        month_start = datetime(t.year, t.month, 1, tzinfo=UTC)
        feed = await db_session.scalars(select(Activity).order_by(Activity.created_at.desc()).limit(12))
        return {
            "counts": {
                "companies": await db_session.scalar(select(func.count()).select_from(Company)),
                "contacts": await db_session.scalar(select(func.count()).select_from(Contact)),
                "openLeads": sum(1 for r in leads if r.active),
                "totalLeads": len(leads),
                "unassignedLeads": sum(1 for r in leads if r.active and not r.user_id),
                "openDeals": len(open_opps),
                "totalDeals": len(opps),
                "myOpenDeals": sum(1 for r in open_opps if r.user_id == me),
                "newThisMonth": sum(1 for r in records if r.created_at >= month_start),
            },
            "pipelineValue": money(sum(r.expected_revenue for r in open_opps)),
            "weightedPipeline": money(round(sum(r.expected_revenue * r.probability / 100 for r in open_opps), 2)),
            "wonValue": money(sum(r.expected_revenue for r in won)),
            "winRate": int(len(won) * 100 / closed + 0.5) if closed else 0,  # Math.round semantics
            "stageBreakdown": stage_breakdown,
            "overdueTasks": acts[0],
            "todayTasks": acts[1],
            "upcomingTasks": acts[2],
            "myOverdue": acts[3],
            "myToday": acts[4],
            "revenueByMonth": revenue_by_month,
            "recentActivity": [FeedItemOut.of(a) for a in feed],
        }
