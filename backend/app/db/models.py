"""ORM models mirroring db/schema.sql (the schema file stays the source of truth for DDL)."""

import secrets
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from advanced_alchemy.extensions.litestar.store import StoreModelMixin
from sqlalchemy import ARRAY, Column, ForeignKey, Numeric, Table, Text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict"


def new_id(size: int = 8) -> str:
    """nanoid-compatible id, same shape as the ids already in the database."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(size))


def utcnow() -> datetime:
    return datetime.now(UTC)


Timestamp = TIMESTAMP(timezone=True)


class Base(DeclarativeBase):
    type_annotation_map = {datetime: Timestamp, str: Text, dict[str, Any]: JSONB}  # noqa: RUF012


class SessionStore(StoreModelMixin):
    """Server-side session rows for Litestar's session middleware."""

    __tablename__ = "litestar_session"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column(default="")
    avatar_url: Mapped[str | None]
    password_hash: Mapped[str | None]
    google_id: Mapped[str | None] = mapped_column(unique=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_login_at: Mapped[datetime | None]


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    name: Mapped[str]
    industry: Mapped[str] = mapped_column(default="")
    website: Mapped[str] = mapped_column(default="")
    size: Mapped[str] = mapped_column(default="")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    name: Mapped[str]
    email: Mapped[str] = mapped_column(default="")
    phone: Mapped[str] = mapped_column(default="")
    title: Mapped[str] = mapped_column(default="")
    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"))
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    company: Mapped[Company | None] = relationship(lazy="joined")


# ---- configuration ----------------------------------------------------------


class SalesTeam(Base):
    __tablename__ = "sales_teams"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    name: Mapped[str]
    leader_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    sequence: Mapped[int] = mapped_column(default=10)
    active: Mapped[bool] = mapped_column(default=True)
    assign_enabled: Mapped[bool] = mapped_column(default=True)
    assign_domain: Mapped[dict[str, Any]] = mapped_column(default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    leader: Mapped[User | None] = relationship(lazy="joined")
    members: Mapped[list["TeamMember"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", back_populates="team"
    )


class TeamMember(Base):
    __tablename__ = "team_members"

    team_id: Mapped[str] = mapped_column(ForeignKey("sales_teams.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    max_leads: Mapped[int] = mapped_column(default=30)
    active: Mapped[bool] = mapped_column(default=True)

    team: Mapped[SalesTeam] = relationship(back_populates="members")
    user: Mapped[User] = relationship(lazy="joined")


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    name: Mapped[str]
    sequence: Mapped[int] = mapped_column(default=10)
    is_won: Mapped[bool] = mapped_column(default=False)
    fold: Mapped[bool] = mapped_column(default=False)
    requirements: Mapped[str] = mapped_column(default="")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class LostReason(Base):
    __tablename__ = "lost_reasons"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    name: Mapped[str]
    active: Mapped[bool] = mapped_column(default=True)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(unique=True)
    color: Mapped[int] = mapped_column(default=0)


class UtmValue(Base):
    __tablename__ = "utm_values"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    kind: Mapped[str]
    name: Mapped[str]


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)


# ---- leads & opportunities --------------------------------------------------

lead_tags = Table(
    "lead_tags",
    Base.metadata,
    Column("lead_id", ForeignKey("crm_leads.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class CrmLead(Base):
    """A lead or an opportunity — one record that moves from one to the other, as in Odoo."""

    __tablename__ = "crm_leads"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    type: Mapped[str] = mapped_column(default="lead")
    name: Mapped[str]
    active: Mapped[bool] = mapped_column(default=True)

    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id", ondelete="SET NULL"))
    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"))
    contact_name: Mapped[str] = mapped_column(default="")
    partner_name: Mapped[str] = mapped_column(default="")
    function: Mapped[str] = mapped_column(default="")
    email: Mapped[str] = mapped_column(default="")
    phone: Mapped[str] = mapped_column(default="")
    website: Mapped[str] = mapped_column(default="")
    city: Mapped[str] = mapped_column(default="")
    country: Mapped[str] = mapped_column(default="")

    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    team_id: Mapped[str | None] = mapped_column(ForeignKey("sales_teams.id", ondelete="SET NULL"))
    stage_id: Mapped[str | None] = mapped_column(ForeignKey("stages.id", ondelete="SET NULL"))
    priority: Mapped[int] = mapped_column(default=0)

    expected_revenue: Mapped[Decimal] = mapped_column(Numeric, default=0)
    probability: Mapped[Decimal] = mapped_column(Numeric, default=0)
    automated_probability: Mapped[Decimal] = mapped_column(Numeric, default=0)
    is_automated_probability: Mapped[bool] = mapped_column(default=True)

    date_deadline: Mapped[datetime | None]
    date_open: Mapped[datetime | None]
    date_closed: Mapped[datetime | None]
    date_conversion: Mapped[datetime | None]
    date_last_stage_update: Mapped[datetime | None]

    lost_reason_id: Mapped[str | None] = mapped_column(ForeignKey("lost_reasons.id", ondelete="SET NULL"))
    lost_feedback: Mapped[str] = mapped_column(default="")

    campaign_id: Mapped[str | None] = mapped_column(ForeignKey("utm_values.id", ondelete="SET NULL"))
    medium_id: Mapped[str | None] = mapped_column(ForeignKey("utm_values.id", ondelete="SET NULL"))
    source_id: Mapped[str | None] = mapped_column(ForeignKey("utm_values.id", ondelete="SET NULL"))

    description: Mapped[str] = mapped_column(default="")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow)

    contact: Mapped[Contact | None] = relationship(lazy="joined")
    company: Mapped[Company | None] = relationship(lazy="joined")
    user: Mapped[User | None] = relationship(lazy="joined")
    team: Mapped[SalesTeam | None] = relationship(lazy="joined")
    stage: Mapped[Stage | None] = relationship(lazy="joined")
    lost_reason: Mapped[LostReason | None] = relationship(lazy="joined")
    campaign: Mapped[UtmValue | None] = relationship(foreign_keys=[campaign_id], lazy="joined")
    medium: Mapped[UtmValue | None] = relationship(foreign_keys=[medium_id], lazy="joined")
    source: Mapped[UtmValue | None] = relationship(foreign_keys=[source_id], lazy="joined")
    tags: Mapped[list[Tag]] = relationship(secondary=lead_tags, lazy="selectin", order_by=Tag.name)

    @property
    def won_status(self) -> str:
        if self.active and self.stage is not None and self.stage.is_won:
            return "won"
        if not self.active:
            return "lost"
        return "pending"


class ScheduledActivity(Base):
    __tablename__ = "scheduled_activities"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("crm_leads.id", ondelete="CASCADE"))
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"))
    activity_type: Mapped[str] = mapped_column(default="To-Do")
    summary: Mapped[str] = mapped_column(default="")
    note: Mapped[str] = mapped_column(default="")
    due_date: Mapped[date]
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    done: Mapped[bool] = mapped_column(default=False)
    done_at: Mapped[datetime | None]
    feedback: Mapped[str] = mapped_column(default="")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    lead: Mapped[CrmLead | None] = relationship(lazy="joined")
    contact: Mapped[Contact | None] = relationship(lazy="joined")
    user: Mapped[User | None] = relationship(foreign_keys=[user_id], lazy="joined")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    body: Mapped[str]
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("crm_leads.id", ondelete="CASCADE"))
    contact_id: Mapped[str | None] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"))
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    author: Mapped[User | None] = relationship(lazy="joined")


class LeadTracking(Base):
    __tablename__ = "lead_tracking"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    lead_id: Mapped[str] = mapped_column(ForeignKey("crm_leads.id", ondelete="CASCADE"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    field: Mapped[str]
    old_value: Mapped[str | None]
    new_value: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    user: Mapped[User | None] = relationship(lazy="joined")


class Activity(Base):
    """Global feed entry for the dashboard's "Recent activity" list."""

    __tablename__ = "activity"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    type: Mapped[str]
    message: Mapped[str]
    entity_type: Mapped[str | None]
    entity_id: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class SavedFilter(Base):
    __tablename__ = "saved_filters"

    id: Mapped[str] = mapped_column(primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    view: Mapped[str]
    name: Mapped[str]
    params: Mapped[dict[str, Any]] = mapped_column(default=dict)
    is_default: Mapped[bool] = mapped_column(default=False)
    shared: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
