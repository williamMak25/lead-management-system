from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AppSetting,
    Company,
    Contact,
    CrmLead,
    LostReason,
    Note,
    SalesTeam,
    ScheduledActivity,
    Stage,
    Tag,
    TeamMember,
    User,
    UtmValue,
    new_id,
    utcnow,
)
from app.db.setup import log_activity

DEFAULT_STAGES = [("New", False), ("Qualified", False), ("Proposition", False), ("Negotiation", False), ("Won", True)]
DEFAULT_LOST_REASONS = [
    "Too expensive",
    "Went with a competitor",
    "No budget",
    "No response",
    "Not a fit",
    "Disqualified",
]
DEFAULT_TAGS = [("Enterprise", 1), ("SMB", 2), ("Renewal", 3), ("Upsell", 4), ("Hot", 9), ("Partner", 6)]
DEFAULT_UTM = {
    "source": ["Website", "Referral", "Cold Call", "Event", "Advertisement", "Newsletter", "LinkedIn", "Search engine"],
    "medium": ["Email", "Phone", "Website", "Social", "Banner", "Direct"],
    "campaign": ["Spring Webinar", "Trade Show Q3", "October Newsletter"],
}
CONFIG_FLAG = "_config_seeded"


async def _count(session: AsyncSession, model) -> int:
    return await session.scalar(select(func.count()).select_from(model)) or 0


async def seed_config(session: AsyncSession) -> None:
    """Configuration every install needs. Runs once (a v1 upgrade keeps its own stage names)."""
    if await session.get(AppSetting, CONFIG_FLAG):
        await ensure_team_membership(session)
        return

    if not await _count(session, Stage):
        session.add_all(
            Stage(name=name, sequence=(i + 1) * 10, is_won=won) for i, (name, won) in enumerate(DEFAULT_STAGES)
        )
    existing = set(await session.scalars(select(LostReason.name)))
    session.add_all(LostReason(name=n) for n in DEFAULT_LOST_REASONS if n not in existing)
    existing = set(await session.scalars(select(Tag.name)))
    session.add_all(Tag(name=n, color=c) for n, c in DEFAULT_TAGS if n not in existing)
    existing = set((await session.execute(select(UtmValue.kind, UtmValue.name))).all())
    session.add_all(
        UtmValue(kind=kind, name=name)
        for kind, names in DEFAULT_UTM.items()
        for name in names
        if (kind, name) not in existing
    )
    if not await _count(session, SalesTeam):
        session.add(SalesTeam(name="Direct Sales", sequence=10))
        session.add(SalesTeam(name="Inbound", sequence=20, assign_enabled=False, assign_domain={"types": ["lead"]}))
    session.add(AppSetting(key=CONFIG_FLAG, value=True))
    await session.flush()
    await ensure_team_membership(session)


async def ensure_team_membership(session: AsyncSession) -> None:
    """Users who aren't in any team join the first one, so assignment and "my team" have someone to use."""
    team = await session.scalar(select(SalesTeam).where(SalesTeam.active.is_(True)).order_by(SalesTeam.sequence))
    if team is None:
        return
    orphans = await session.scalars(
        select(User).where(~select(TeamMember).where(TeamMember.user_id == User.id).exists())
    )
    for user in orphans:
        session.add(TeamMember(team_id=team.id, user_id=user.id))
        if team.leader_id is None:
            team.leader_id = user.id
    await session.flush()


def _days(n: int):
    return utcnow() + timedelta(days=n)


async def seed_sample_data(session: AsyncSession) -> bool:
    """Demo records for a brand-new database. Returns True if anything was created."""
    if await _count(session, Company) or await _count(session, CrmLead):
        return False

    stages = {s.name: s for s in await session.scalars(select(Stage))}
    reasons = {r.name: r for r in await session.scalars(select(LostReason))}
    tags = {t.name: t for t in await session.scalars(select(Tag))}
    utm = {(u.kind, u.name): u for u in await session.scalars(select(UtmValue))}
    team = await session.scalar(select(SalesTeam).order_by(SalesTeam.sequence))

    companies = [
        Company(id=new_id(), name=name, industry=industry, website=website, size=size, created_at=_days(-ago))
        for name, industry, website, size, ago in [
            ("Aurora Freight Co.", "Logistics", "aurorafreight.com", "51-200", 80),
            ("Basalt Robotics", "Manufacturing", "basaltrobotics.io", "11-50", 64),
            ("Fernwood Health", "Healthcare", "fernwoodhealth.com", "201-500", 120),
            ("Cobalt & Vine Retail", "Retail", "cobaltvine.com", "1-10", 30),
            ("Meridian Legal Group", "Legal", "meridianlegal.com", "11-50", 45),
            ("Northstar Analytics", "Software", "northstaranalytics.dev", "51-200", 200),
        ]
    ]
    session.add_all(companies)

    contact_seeds = [
        ("Priya Nandakumar", "priya.n@aurorafreight.com", "+1 415 555 0148", "VP Operations", 0),
        ("Diego Marchetti", "d.marchetti@aurorafreight.com", "+1 415 555 0149", "Logistics Manager", 0),
        ("Wren Okafor", "wren@basaltrobotics.io", "+1 212 555 0110", "Founder", 1),
        ("Sana Blythe", "sana.blythe@fernwoodhealth.com", "+1 617 555 0177", "Director of IT", 2),
        ("Tomas Reyes", "t.reyes@fernwoodhealth.com", "+1 617 555 0178", "Procurement Lead", 2),
        ("Iris Falk", "iris@cobaltvine.com", "+1 312 555 0192", "Owner", 3),
        ("Malcolm Deveraux", "malcolm@meridianlegal.com", "+1 646 555 0133", "Managing Partner", 4),
        ("Yuki Tanaka", "yuki.tanaka@northstaranalytics.dev", "+1 206 555 0166", "Head of Sales", 5),
        ("Odette Villanueva", "odette@northstaranalytics.dev", "+1 206 555 0167", "CFO", 5),
    ]
    contacts = [
        Contact(
            id=new_id(),
            name=name,
            email=email,
            phone=phone,
            title=title,
            company_id=companies[ci].id,
            tags=["decision-maker"] if i % 3 == 0 else [],
            created_at=_days(-(70 - i * 3)),
        )
        for i, (name, email, phone, title, ci) in enumerate(contact_seeds)
    ]
    session.add_all(contacts)
    await session.flush()

    # title, contact idx, revenue, stage, close in days, priority, tags, source, status
    opp_seeds = [
        ("Fleet tracking platform rollout", 0, 42000, "Negotiation", 15, 2, ["Enterprise"], "Referral", None),
        ("Warehouse IoT sensors — Phase 1", 1, 18500, "Proposition", 22, 1, ["Upsell"], "Website", None),
        ("Robotics arm service contract", 2, 76000, "Qualified", 40, 3, ["Hot", "Enterprise"], "Event", None),
        ("EMR integration package", 3, 125000, "Won", -5, 2, ["Enterprise"], "Referral", None),
        ("Patient portal add-on", 4, 31000, "New", 60, 0, ["Upsell"], "Website", None),
        ("POS system refresh", 5, 8600, "New", 12, 1, ["SMB"], "Cold Call", None),
        ("Contract review automation", 6, 27500, "Proposition", 18, 1, ["SMB"], "LinkedIn", None),
        ("Analytics dashboard seats — annual", 7, 54000, "Won", -90, 2, ["Renewal"], "Referral", None),
        (
            "Data warehouse migration",
            8,
            61000,
            "Proposition",
            -30,
            1,
            ["Enterprise"],
            "Event",
            "Went with a competitor",
        ),
        ("Courier route optimisation", 1, 23000, "Qualified", -45, 0, ["SMB"], "Cold Call", "Too expensive"),
        ("Clinic scheduling pilot", 4, 12000, "Won", -60, 1, ["SMB"], "Website", None),
    ]
    opps = []
    for i, (title, ci, revenue, stage, close_in, prio, tag_names, source, lost) in enumerate(opp_seeds):
        contact = contacts[ci]
        opp = CrmLead(
            id=new_id(),
            type="opportunity",
            name=title,
            contact_id=contact.id,
            company_id=contact.company_id,
            contact_name=contact.name,
            partner_name=companies[contact_seeds[ci][4]].name,
            function=contact.title,
            email=contact.email,
            phone=contact.phone,
            team_id=team.id if team else None,
            stage_id=stages[stage].id,
            priority=prio,
            expected_revenue=revenue,
            date_deadline=_days(close_in),
            source_id=utm[("source", source)].id,
            active=lost is None,
            lost_reason_id=reasons[lost].id if lost else None,
            date_closed=_days(close_in) if lost or stage == "Won" else None,
            date_conversion=_days(-(85 - i * 5)),
            date_last_stage_update=_days(-max(1, 20 - i * 2)),
            created_at=_days(-(90 - i * 5)),
            updated_at=_days(-max(1, 20 - i * 2)),
        )
        opp.tags = [tags[n] for n in tag_names]
        session.add(opp)
        opps.append(opp)
        log_activity(session, "lead_created", f'Opportunity "{title}" created', "lead", opp.id)

    # name, email, phone, company, job, source, revenue, days ago, city, country, lost reason
    lead_seeds = [
        ("Harper Voss", "harper.voss@brightlanefinance.com", "+1 503 555 0121", "Brightlane Finance", "Ops Director", "Website", 15000, 2, "Portland", "United States", None),
        ("Callum Reid", "callum@ridgeportbrew.com", "+1 971 555 0134", "Ridgeport Brewing Co.", "Owner", "Referral", 9000, 5, "Salem", "United States", None),
        ("Nadia Farouk", "nadia.farouk@stellarhealth.io", "+1 720 555 0187", "Stellar Health", "VP Engineering", "Event", 48000, 9, "Denver", "United States", None),
        ("Owen Blackwood", "owen.b@ferrousmetal.com", "+1 314 555 0165", "Ferrous Metalworks", "Plant Manager", "Cold Call", 22000, 1, "St. Louis", "United States", None),
        ("Simone Achterberg", "simone@lumen-creative.studio", "+31 20 555 0198", "Lumen Creative Studio", "Founder", "Advertisement", 4000, 20, "Amsterdam", "Netherlands", "Not a fit"),
        ("Priya N.", "priya.n@aurorafreight.com", "+1 (415) 555-0148", "Aurora Freight Co.", "VP Operations", "Newsletter", 12000, 3, "Oakland", "United States", None),
    ]  # fmt: skip
    for name, email, phone, company, job, source, revenue, ago, city, country, lost in lead_seeds:
        lead = CrmLead(
            id=new_id(),
            type="lead",
            name=f"{name} — {company}",
            contact_name=name,
            partner_name=company,
            function=job,
            email=email,
            phone=phone,
            city=city,
            country=country,
            expected_revenue=revenue,
            stage_id=stages["New"].id,
            source_id=utm[("source", source)].id,
            medium_id=utm[("medium", "Website" if source == "Website" else "Email")].id,
            active=lost is None,
            lost_reason_id=reasons[lost].id if lost else None,
            date_closed=_days(-ago) if lost else None,
            created_at=_days(-ago),
            updated_at=_days(-ago),
        )
        session.add(lead)
        log_activity(session, "lead_created", f'Lead "{lead.name}" added', "lead", lead.id)
    await session.flush()

    activity_seeds = [
        ("Call", "Confirm rollout timeline", 0, 1, False),
        ("Email", "Send updated proposal PDF", 1, -1, False),
        ("Meeting", "Discovery call with Wren", 2, 2, False),
        ("To-Do", "Check in on EMR go-live", 3, 5, False),
        ("Meeting", "Demo for patient portal", 4, 0, False),
        ("Call", "Follow up on POS quote", 5, -2, False),
        ("To-Do", "Review contract redlines", 6, 3, False),
        ("Call", "Renewal call — annual seats", 7, -10, True),
    ]
    today = datetime.now().astimezone().date()
    session.add_all(
        ScheduledActivity(
            lead_id=opps[oi].id,
            activity_type=t,
            summary=summary,
            due_date=today + timedelta(days=due_in),
            done=done,
            done_at=_days(due_in) if done else None,
            feedback="Renewed for another year." if done else "",
            created_at=_days(-(10 - i)),
        )
        for i, (t, summary, oi, due_in, done) in enumerate(activity_seeds)
    )
    note_seeds = [
        (0, "Priya wants a pilot with 5 trucks before committing to the full fleet."),
        (2, "Wren is comparing us against two competitors, price sensitive."),
        (3, "Sana confirmed budget is approved for Q3."),
        (7, "Yuki mentioned they may expand seats by 20% next renewal."),
    ]
    session.add_all(
        Note(body=body, lead_id=opps[oi].id, contact_id=opps[oi].contact_id, created_at=_days(-(15 - i * 3)))
        for i, (oi, body) in enumerate(note_seeds)
    )
    await session.flush()
    return True
