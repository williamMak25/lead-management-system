"""Request/response shapes. Everything is camelCase on the wire."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any

import msgspec
from litestar.exceptions import ValidationException
from msgspec import UNSET, Meta, UnsetType

from app.db import models

Required = Annotated[str, Meta(min_length=1)]


class Schema(msgspec.Struct, rename="camel"):
    pass


def parse_datetime(value: str | None) -> datetime | None:
    """Accept full ISO timestamps or bare `YYYY-MM-DD` dates (from <input type="date">)."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValidationException(f"Invalid date: {value}") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def money(value: Decimal | float) -> float | int:
    number = float(value)
    return int(number) if number.is_integer() else number


def changes(patch: msgspec.Struct) -> dict:
    """Fields actually present in an update payload, keyed by snake_case attribute name."""
    return {f: v for f in patch.__struct_fields__ if (v := getattr(patch, f)) is not UNSET}


def extend[S: msgspec.Struct](cls: type[S], base: msgspec.Struct, **extra) -> S:
    """Build a richer response (e.g. CompanyDetail) from its base struct plus extra fields."""
    return cls(**{f: getattr(base, f) for f in base.__struct_fields__}, **extra)


# ---- small references ------------------------------------------------------


class Ref(Schema):
    id: str
    name: str

    @classmethod
    def of(cls, obj: Any) -> "Ref | None":
        return cls(id=obj.id, name=obj.name) if obj is not None else None


class UserRef(Schema):
    id: str
    name: str
    email: str
    avatar_url: str | None

    @classmethod
    def of(cls, u: models.User | None) -> "UserRef | None":
        return cls(id=u.id, name=u.name or u.email, email=u.email, avatar_url=u.avatar_url) if u else None


class StageOut(Schema):
    id: str
    name: str
    sequence: int
    is_won: bool
    fold: bool
    requirements: str

    @classmethod
    def of(cls, s: models.Stage | None) -> "StageOut | None":
        if s is None:
            return None
        return cls(id=s.id, name=s.name, sequence=s.sequence, is_won=s.is_won, fold=s.fold, requirements=s.requirements)


class TagOut(Schema):
    id: str
    name: str
    color: int

    @classmethod
    def of(cls, t: models.Tag) -> "TagOut":
        return cls(id=t.id, name=t.name, color=t.color)


class LostReasonOut(Schema):
    id: str
    name: str
    active: bool

    @classmethod
    def of(cls, r: models.LostReason) -> "LostReasonOut":
        return cls(id=r.id, name=r.name, active=r.active)


class UtmOut(Schema):
    id: str
    kind: str
    name: str

    @classmethod
    def of(cls, u: models.UtmValue) -> "UtmOut":
        return cls(id=u.id, kind=u.kind, name=u.name)


class TeamMemberOut(Schema):
    user: UserRef
    max_leads: int
    active: bool
    assigned_30d: int = 0


class TeamOut(Schema):
    id: str
    name: str
    leader: UserRef | None
    sequence: int
    active: bool
    assign_enabled: bool
    assign_domain: dict[str, Any]
    members: list[TeamMemberOut]

    @classmethod
    def of(cls, t: models.SalesTeam, load: dict[str, int] | None = None) -> "TeamOut":
        load = load or {}
        return cls(
            id=t.id,
            name=t.name,
            leader=UserRef.of(t.leader),
            sequence=t.sequence,
            active=t.active,
            assign_enabled=t.assign_enabled,
            assign_domain=t.assign_domain or {},
            members=[
                TeamMemberOut(
                    user=UserRef.of(m.user), max_leads=m.max_leads, active=m.active, assigned_30d=load.get(m.user_id, 0)
                )
                for m in sorted(t.members, key=lambda m: m.user.name)
            ],
        )


# ---- users -------------------------------------------------------------------


class UserOut(Schema):
    id: str
    email: str
    name: str
    avatar_url: str | None
    has_password: bool
    has_google: bool
    created_at: datetime | None
    last_login_at: datetime | None

    @classmethod
    def of(cls, u: models.User) -> "UserOut":
        return cls(
            id=u.id,
            email=u.email,
            name=u.name,
            avatar_url=u.avatar_url,
            has_password=bool(u.password_hash),
            has_google=bool(u.google_id),
            created_at=u.created_at,
            last_login_at=u.last_login_at,
        )


class UserEnvelope(Schema):
    user: UserOut | None


# ---- companies & contacts ----------------------------------------------------


class CompanyOut(Schema):
    id: str
    name: str
    industry: str
    website: str
    size: str
    created_at: datetime

    @classmethod
    def of(cls, c: models.Company) -> "CompanyOut":
        return cls(id=c.id, name=c.name, industry=c.industry, website=c.website, size=c.size, created_at=c.created_at)


class CompanyListItem(CompanyOut):
    contact_count: int = 0
    opportunity_count: int = 0


class ContactOut(Schema):
    id: str
    name: str
    email: str
    phone: str
    title: str
    company_id: str | None
    tags: list[str]
    created_at: datetime
    company: Ref | None = None

    @classmethod
    def of(cls, c: models.Contact) -> "ContactOut":
        return cls(
            id=c.id,
            name=c.name,
            email=c.email,
            phone=c.phone,
            title=c.title,
            company_id=c.company_id,
            tags=list(c.tags or []),
            created_at=c.created_at,
            company=Ref.of(c.company),
        )


# ---- activities, notes, timeline ---------------------------------------------


class LeadRef(Schema):
    id: str
    name: str
    type: str


def activity_state(due: date, done: bool, today: date) -> str:
    if done:
        return "done"
    if due < today:
        return "overdue"
    return "today" if due == today else "planned"


class ScheduledActivityOut(Schema):
    id: str
    activity_type: str
    summary: str
    note: str
    due_date: date
    state: str
    done: bool
    done_at: datetime | None
    feedback: str
    user: UserRef | None
    lead: LeadRef | None
    contact: Ref | None
    created_at: datetime

    @classmethod
    def of(cls, a: models.ScheduledActivity, today: date) -> "ScheduledActivityOut":
        return cls(
            id=a.id,
            activity_type=a.activity_type,
            summary=a.summary,
            note=a.note,
            due_date=a.due_date,
            state=activity_state(a.due_date, a.done, today),
            done=a.done,
            done_at=a.done_at,
            feedback=a.feedback,
            user=UserRef.of(a.user),
            lead=LeadRef(id=a.lead.id, name=a.lead.name, type=a.lead.type) if a.lead else None,
            contact=Ref.of(a.contact),
            created_at=a.created_at,
        )


class NoteOut(Schema):
    id: str
    body: str
    lead_id: str | None
    contact_id: str | None
    author: UserRef | None
    created_at: datetime

    @classmethod
    def of(cls, n: models.Note) -> "NoteOut":
        return cls(
            id=n.id,
            body=n.body,
            lead_id=n.lead_id,
            contact_id=n.contact_id,
            author=UserRef.of(n.author),
            created_at=n.created_at,
        )


class TimelineItem(Schema):
    kind: str  # note | tracking | activity_done
    id: str
    created_at: datetime
    user: UserRef | None = None
    body: str | None = None
    field: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    activity_type: str | None = None
    summary: str | None = None
    feedback: str | None = None


class FeedItemOut(Schema):
    id: str
    type: str
    message: str
    entity_type: str | None
    entity_id: str | None
    created_at: datetime

    @classmethod
    def of(cls, a: models.Activity) -> "FeedItemOut":
        return cls(
            id=a.id,
            type=a.type,
            message=a.message,
            entity_type=a.entity_type,
            entity_id=a.entity_id,
            created_at=a.created_at,
        )


# ---- leads & opportunities ---------------------------------------------------


class NextActivity(Schema):
    id: str
    activity_type: str
    summary: str
    due_date: date
    state: str
    user: UserRef | None


class LeadOut(Schema):
    id: str
    type: str
    name: str
    active: bool
    won_status: str
    contact: Ref | None
    company: Ref | None
    contact_name: str
    partner_name: str
    function: str
    email: str
    phone: str
    website: str
    city: str
    country: str
    user: UserRef | None
    team: Ref | None
    stage: StageOut | None
    priority: int
    expected_revenue: float | int
    probability: float | int
    automated_probability: float | int
    is_automated_probability: bool
    prorated_revenue: float | int
    date_deadline: datetime | None
    date_open: datetime | None
    date_closed: datetime | None
    date_conversion: datetime | None
    date_last_stage_update: datetime | None
    lost_reason: Ref | None
    lost_feedback: str
    campaign: Ref | None
    medium: Ref | None
    source: Ref | None
    tags: list[TagOut]
    description: str
    activity_state: str | None
    next_activity: NextActivity | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, lead: models.CrmLead, next_act: models.ScheduledActivity | None, today: date) -> "LeadOut":
        state = activity_state(next_act.due_date, False, today) if next_act else None
        return cls(
            id=lead.id,
            type=lead.type,
            name=lead.name,
            active=lead.active,
            won_status=lead.won_status,
            contact=Ref.of(lead.contact),
            company=Ref.of(lead.company),
            contact_name=lead.contact_name,
            partner_name=lead.partner_name,
            function=lead.function,
            email=lead.email,
            phone=lead.phone,
            website=lead.website,
            city=lead.city,
            country=lead.country,
            user=UserRef.of(lead.user),
            team=Ref.of(lead.team),
            stage=StageOut.of(lead.stage),
            priority=lead.priority,
            expected_revenue=money(lead.expected_revenue),
            probability=money(lead.probability),
            automated_probability=money(lead.automated_probability),
            is_automated_probability=lead.is_automated_probability,
            prorated_revenue=money(round(lead.expected_revenue * lead.probability / 100, 2)),
            date_deadline=lead.date_deadline,
            date_open=lead.date_open,
            date_closed=lead.date_closed,
            date_conversion=lead.date_conversion,
            date_last_stage_update=lead.date_last_stage_update,
            lost_reason=Ref.of(lead.lost_reason),
            lost_feedback=lead.lost_feedback,
            campaign=Ref.of(lead.campaign),
            medium=Ref.of(lead.medium),
            source=Ref.of(lead.source),
            tags=[TagOut.of(t) for t in lead.tags],
            description=lead.description,
            activity_state=state,
            next_activity=NextActivity(
                id=next_act.id,
                activity_type=next_act.activity_type,
                summary=next_act.summary,
                due_date=next_act.due_date,
                state=state,
                user=UserRef.of(next_act.user),
            )
            if next_act
            else None,
            created_at=lead.created_at,
            updated_at=lead.updated_at,
        )


class DuplicateOut(Schema):
    lead: LeadOut
    reasons: list[str]


class LeadDetail(LeadOut):
    activities: list[ScheduledActivityOut] = []
    timeline: list[TimelineItem] = []
    duplicate_count: int = 0


class CompanyDetail(CompanyOut):
    contacts: list[ContactOut] = []
    opportunities: list[LeadOut] = []


class ContactDetail(ContactOut):
    opportunities: list[LeadOut] = []
    notes: list[NoteOut] = []
    activities: list[ScheduledActivityOut] = []


# ---- requests --------------------------------------------------------------
# Update payloads use UNSET so a PUT only touches the fields that were sent.


class SignupIn(Schema):
    name: Required
    email: Required
    password: Required


class LoginIn(Schema):
    email: Required
    password: Required


class CompanyIn(Schema):
    name: Required
    industry: str = ""
    website: str = ""
    size: str = ""


class CompanyPatch(Schema):
    name: Required | UnsetType = UNSET
    industry: str | UnsetType = UNSET
    website: str | UnsetType = UNSET
    size: str | UnsetType = UNSET


class ContactIn(Schema):
    name: Required
    email: str = ""
    phone: str = ""
    title: str = ""
    company_id: str | None = None
    tags: list[str] = []


class ContactPatch(Schema):
    name: Required | UnsetType = UNSET
    email: str | UnsetType = UNSET
    phone: str | UnsetType = UNSET
    title: str | UnsetType = UNSET
    company_id: str | None | UnsetType = UNSET
    tags: list[str] | UnsetType = UNSET


Priority = Annotated[int, Meta(ge=0, le=3)]
Percent = Annotated[float, Meta(ge=0, le=100)]
Money = Annotated[float, Meta(ge=0)]


class LeadIn(Schema):
    name: Required
    type: str = "lead"
    contact_id: str | None = None
    company_id: str | None = None
    contact_name: str = ""
    partner_name: str = ""
    function: str = ""
    email: str = ""
    phone: str = ""
    website: str = ""
    city: str = ""
    country: str = ""
    user_id: str | None = None
    team_id: str | None = None
    stage_id: str | None = None
    priority: Priority = 0
    expected_revenue: Money = 0
    probability: Percent | None = None
    date_deadline: str | None = None
    campaign_id: str | None = None
    medium_id: str | None = None
    source_id: str | None = None
    tag_ids: list[str] = []
    description: str = ""


class LeadPatch(Schema):
    name: Required | UnsetType = UNSET
    type: str | UnsetType = UNSET
    contact_id: str | None | UnsetType = UNSET
    company_id: str | None | UnsetType = UNSET
    contact_name: str | UnsetType = UNSET
    partner_name: str | UnsetType = UNSET
    function: str | UnsetType = UNSET
    email: str | UnsetType = UNSET
    phone: str | UnsetType = UNSET
    website: str | UnsetType = UNSET
    city: str | UnsetType = UNSET
    country: str | UnsetType = UNSET
    user_id: str | None | UnsetType = UNSET
    team_id: str | None | UnsetType = UNSET
    stage_id: str | None | UnsetType = UNSET
    priority: Priority | UnsetType = UNSET
    expected_revenue: Money | UnsetType = UNSET
    probability: Percent | UnsetType = UNSET
    date_deadline: str | None | UnsetType = UNSET
    lost_feedback: str | UnsetType = UNSET
    campaign_id: str | None | UnsetType = UNSET
    medium_id: str | None | UnsetType = UNSET
    source_id: str | None | UnsetType = UNSET
    tag_ids: list[str] | UnsetType = UNSET
    description: str | UnsetType = UNSET


class LostIn(Schema):
    lost_reason_id: str | None = None
    lost_feedback: str = ""


class ConvertIn(Schema):
    customer: str = "create"  # create | link | nothing
    contact_id: str | None = None
    user_id: str | None = None
    team_id: str | None = None
    merge_ids: list[str] = []


class MergeIn(Schema):
    ids: list[str]
    target_id: str | None = None


class BulkIn(Schema):
    ids: Annotated[list[str], Meta(min_length=1)]
    action: str  # assign | stage | tag | lost | won | restore | convert | delete | auto_assign
    user_id: str | None = None
    team_id: str | None = None
    stage_id: str | None = None
    tag_ids: list[str] = []
    lost_reason_id: str | None = None
    lost_feedback: str = ""


class ActivityIn(Schema):
    activity_type: str
    due_date: date
    lead_id: str | None = None
    contact_id: str | None = None
    summary: str = ""
    note: str = ""
    user_id: str | None = None


class ActivityPatch(Schema):
    activity_type: str | UnsetType = UNSET
    due_date: date | UnsetType = UNSET
    summary: str | UnsetType = UNSET
    note: str | UnsetType = UNSET
    user_id: str | None | UnsetType = UNSET


class ActivityDoneIn(Schema):
    feedback: str = ""


class NoteIn(Schema):
    body: Required
    lead_id: str | None = None
    contact_id: str | None = None


class StageIn(Schema):
    name: Required
    is_won: bool = False
    fold: bool = False
    requirements: str = ""
    sequence: int | None = None


class StagePatch(Schema):
    name: Required | UnsetType = UNSET
    is_won: bool | UnsetType = UNSET
    fold: bool | UnsetType = UNSET
    requirements: str | UnsetType = UNSET
    sequence: int | UnsetType = UNSET


class ReorderIn(Schema):
    ids: list[str]


class TagIn(Schema):
    name: Required
    color: Annotated[int, Meta(ge=0, le=11)] = 0


class TagPatch(Schema):
    name: Required | UnsetType = UNSET
    color: Annotated[int, Meta(ge=0, le=11)] | UnsetType = UNSET


class LostReasonIn(Schema):
    name: Required
    active: bool = True


class LostReasonPatch(Schema):
    name: Required | UnsetType = UNSET
    active: bool | UnsetType = UNSET


class UtmIn(Schema):
    kind: str
    name: Required


class UtmPatch(Schema):
    name: Required


class TeamMemberIn(Schema):
    user_id: str
    max_leads: Annotated[int, Meta(ge=0)] = 30
    active: bool = True


class TeamIn(Schema):
    name: Required
    leader_id: str | None = None
    sequence: int = 10
    active: bool = True
    assign_enabled: bool = True
    assign_domain: dict[str, Any] = {}
    members: list[TeamMemberIn] = []


class TeamPatch(Schema):
    name: Required | UnsetType = UNSET
    leader_id: str | None | UnsetType = UNSET
    sequence: int | UnsetType = UNSET
    active: bool | UnsetType = UNSET
    assign_enabled: bool | UnsetType = UNSET
    assign_domain: dict[str, Any] | UnsetType = UNSET
    members: list[TeamMemberIn] | UnsetType = UNSET


class SavedFilterIn(Schema):
    view: Required
    name: Required
    params: dict[str, Any] = {}
    is_default: bool = False
    shared: bool = False


class SavedFilterOut(Schema):
    id: str
    view: str
    name: str
    params: dict[str, Any]
    is_default: bool
    shared: bool
    owner: UserRef | None
    mine: bool


class SettingsIn(Schema):
    scoring_fields: list[str] | UnsetType = UNSET
    auto_assign_on_create: bool | UnsetType = UNSET
