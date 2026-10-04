"""Configuration endpoints: stages, tags, lost reasons, UTM values, sales teams, users, settings, saved filters."""

from datetime import timedelta

from litestar import Controller, Request, delete, get, post, put
from litestar.exceptions import (
    HTTPException,
    PermissionDeniedException,
    ValidationException,
)
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import ACTIVITY_TYPES, SCORING_FIELDS
from app.db.models import (
    CrmLead,
    LostReason,
    SalesTeam,
    SavedFilter,
    Stage,
    Tag,
    TeamMember,
    User,
    UtmValue,
    utcnow,
)
from app.routes.common import current_user, get_or_404
from app.schemas import (
    LostReasonIn,
    LostReasonOut,
    LostReasonPatch,
    ReorderIn,
    SavedFilterIn,
    SavedFilterOut,
    SettingsIn,
    StageIn,
    StageOut,
    StagePatch,
    TagIn,
    TagOut,
    TagPatch,
    TeamIn,
    TeamOut,
    TeamPatch,
    UserRef,
    UtmIn,
    UtmOut,
    UtmPatch,
    changes,
)
from app.services.scoring import rescore
from app.services.settings import get_settings, save_settings


async def _flush_unique(db: AsyncSession, what: str) -> None:
    try:
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"A {what} with that name already exists") from exc


async def team_load(db: AsyncSession) -> dict[str, int]:
    since = utcnow() - timedelta(days=30)
    rows = await db.execute(
        select(CrmLead.user_id, func.count())
        .where(CrmLead.user_id.is_not(None), CrmLead.date_open >= since)
        .group_by(CrmLead.user_id)
    )
    return dict(rows.all())


async def _stages(db: AsyncSession) -> list[StageOut]:
    return [StageOut.of(s) for s in await db.scalars(select(Stage).order_by(Stage.sequence, Stage.name))]


class MetaController(Controller):
    """Everything the UI needs for dropdowns, in one request."""

    path = "/api/meta"

    @get("/")
    async def meta(self, db_session: AsyncSession) -> dict:
        utm = list(await db_session.scalars(select(UtmValue).order_by(UtmValue.name)))
        teams = await db_session.scalars(select(SalesTeam).order_by(SalesTeam.sequence, SalesTeam.name))
        return {
            "stages": await _stages(db_session),
            "tags": [TagOut.of(t) for t in await db_session.scalars(select(Tag).order_by(Tag.name))],
            "lostReasons": [
                LostReasonOut.of(r) for r in await db_session.scalars(select(LostReason).order_by(LostReason.name))
            ],
            "teams": [{"id": t.id, "name": t.name, "active": t.active} for t in teams],
            "users": [UserRef.of(u) for u in await db_session.scalars(select(User).order_by(User.name))],
            "utm": {k: [UtmOut.of(u) for u in utm if u.kind == k] for k in ("source", "medium", "campaign")},
            "activityTypes": ACTIVITY_TYPES,
            "scoringFields": [{"key": k, "label": v} for k, v in SCORING_FIELDS.items()],
        }


class StageController(Controller):
    path = "/api/stages"

    @get("/")
    async def list_stages(self, db_session: AsyncSession) -> list[StageOut]:
        return await _stages(db_session)

    @post("/")
    async def create_stage(self, db_session: AsyncSession, data: StageIn) -> StageOut:
        seq = data.sequence
        if seq is None:
            seq = (await db_session.scalar(select(func.max(Stage.sequence))) or 0) + 10
        stage = Stage(name=data.name, is_won=data.is_won, fold=data.fold, requirements=data.requirements, sequence=seq)
        db_session.add(stage)
        await db_session.flush()
        return StageOut.of(stage)

    @put("/{stage_id:str}")
    async def update_stage(self, db_session: AsyncSession, stage_id: str, data: StagePatch) -> StageOut:
        stage = await get_or_404(db_session, Stage, stage_id, "Stage")
        upd = changes(data)
        for field, value in upd.items():
            setattr(stage, field, value)
        await db_session.flush()
        if "is_won" in upd:
            await rescore(db_session)
        return StageOut.of(stage)

    @post("/reorder", status_code=200)
    async def reorder(self, db_session: AsyncSession, data: ReorderIn) -> list[StageOut]:
        for i, stage_id in enumerate(data.ids):
            stage = await db_session.get(Stage, stage_id)
            if stage:
                stage.sequence = (i + 1) * 10
        await db_session.flush()
        return await _stages(db_session)

    @delete("/{stage_id:str}")
    async def delete_stage(self, db_session: AsyncSession, stage_id: str) -> None:
        in_use = await db_session.scalar(select(func.count()).where(CrmLead.stage_id == stage_id))
        if in_use:
            raise HTTPException(
                status_code=409, detail=f"{in_use} records are in this stage. Move them to another stage first."
            )
        stage = await db_session.get(Stage, stage_id)
        if stage:
            await db_session.delete(stage)


class TagController(Controller):
    path = "/api/tags"

    @get("/")
    async def list_tags(self, db_session: AsyncSession) -> list[TagOut]:
        return [TagOut.of(t) for t in await db_session.scalars(select(Tag).order_by(Tag.name))]

    @post("/")
    async def create_tag(self, db_session: AsyncSession, data: TagIn) -> TagOut:
        tag = Tag(name=data.name.strip(), color=data.color)
        db_session.add(tag)
        await _flush_unique(db_session, "tag")
        return TagOut.of(tag)

    @put("/{tag_id:str}")
    async def update_tag(self, db_session: AsyncSession, tag_id: str, data: TagPatch) -> TagOut:
        tag = await get_or_404(db_session, Tag, tag_id, "Tag")
        for field, value in changes(data).items():
            setattr(tag, field, value)
        await _flush_unique(db_session, "tag")
        return TagOut.of(tag)

    @delete("/{tag_id:str}")
    async def delete_tag(self, db_session: AsyncSession, tag_id: str) -> None:
        tag = await db_session.get(Tag, tag_id)
        if tag:
            await db_session.delete(tag)


class LostReasonController(Controller):
    path = "/api/lost-reasons"

    @get("/")
    async def list_reasons(self, db_session: AsyncSession) -> list[LostReasonOut]:
        return [LostReasonOut.of(r) for r in await db_session.scalars(select(LostReason).order_by(LostReason.name))]

    @post("/")
    async def create_reason(self, db_session: AsyncSession, data: LostReasonIn) -> LostReasonOut:
        reason = LostReason(name=data.name, active=data.active)
        db_session.add(reason)
        await db_session.flush()
        return LostReasonOut.of(reason)

    @put("/{reason_id:str}")
    async def update_reason(self, db_session: AsyncSession, reason_id: str, data: LostReasonPatch) -> LostReasonOut:
        reason = await get_or_404(db_session, LostReason, reason_id, "Lost reason")
        for field, value in changes(data).items():
            setattr(reason, field, value)
        return LostReasonOut.of(reason)

    @delete("/{reason_id:str}")
    async def delete_reason(self, db_session: AsyncSession, reason_id: str) -> None:
        reason = await db_session.get(LostReason, reason_id)
        if reason:
            await db_session.delete(reason)


class UtmController(Controller):
    path = "/api/utm"

    @get("/")
    async def list_utm(self, db_session: AsyncSession, kind: str | None = None) -> list[UtmOut]:
        stmt = select(UtmValue).order_by(UtmValue.kind, UtmValue.name)
        if kind:
            stmt = stmt.where(UtmValue.kind == kind)
        return [UtmOut.of(u) for u in await db_session.scalars(stmt)]

    @post("/")
    async def create_utm(self, db_session: AsyncSession, data: UtmIn) -> UtmOut:
        if data.kind not in ("source", "medium", "campaign"):
            raise ValidationException("kind must be source, medium or campaign")
        utm = UtmValue(kind=data.kind, name=data.name.strip())
        db_session.add(utm)
        await _flush_unique(db_session, data.kind)
        return UtmOut.of(utm)

    @put("/{utm_id:str}")
    async def update_utm(self, db_session: AsyncSession, utm_id: str, data: UtmPatch) -> UtmOut:
        utm = await get_or_404(db_session, UtmValue, utm_id, "UTM value")
        utm.name = data.name.strip()
        await _flush_unique(db_session, utm.kind)
        return UtmOut.of(utm)

    @delete("/{utm_id:str}")
    async def delete_utm(self, db_session: AsyncSession, utm_id: str) -> None:
        utm = await db_session.get(UtmValue, utm_id)
        if utm:
            await db_session.delete(utm)


class TeamController(Controller):
    path = "/api/teams"

    @get("/")
    async def list_teams(self, db_session: AsyncSession) -> list[TeamOut]:
        load = await team_load(db_session)
        teams = await db_session.scalars(select(SalesTeam).order_by(SalesTeam.sequence, SalesTeam.name))
        return [TeamOut.of(t, load) for t in teams]

    async def _apply(self, db: AsyncSession, team: SalesTeam, values: dict) -> None:
        members = values.pop("members", None)
        if values.get("leader_id") and await db.get(User, values["leader_id"]) is None:
            raise ValidationException("leaderId: no such user")
        for field, value in values.items():
            setattr(team, field, value)
        if members is not None:
            for m in members:
                if await db.get(User, m.user_id) is None:
                    raise ValidationException(f"members: no such user {m.user_id}")
            existing = {m.user_id: m for m in team.members}
            team.members = [existing.get(m.user_id) or TeamMember(team_id=team.id, user_id=m.user_id) for m in members]
            for row, m in zip(team.members, members, strict=True):
                row.max_leads, row.active = m.max_leads, m.active
        await db.flush()

    @post("/")
    async def create_team(self, db_session: AsyncSession, data: TeamIn) -> TeamOut:
        team = SalesTeam(name=data.name, members=[])  # initialised so _apply never lazy-loads
        db_session.add(team)
        await db_session.flush()
        await self._apply(db_session, team, {k: v for k, v in changes(data).items() if k != "name"})
        team = await get_or_404(db_session, SalesTeam, team.id, "Team")
        return TeamOut.of(team, await team_load(db_session))

    @put("/{team_id:str}")
    async def update_team(self, db_session: AsyncSession, team_id: str, data: TeamPatch) -> TeamOut:
        team = await get_or_404(db_session, SalesTeam, team_id, "Team")
        await self._apply(db_session, team, changes(data))
        team = await get_or_404(db_session, SalesTeam, team_id, "Team")
        return TeamOut.of(team, await team_load(db_session))

    @delete("/{team_id:str}")
    async def delete_team(self, db_session: AsyncSession, team_id: str) -> None:
        team = await db_session.get(SalesTeam, team_id)
        if team:
            await db_session.delete(team)


class UserController(Controller):
    path = "/api/users"

    @get("/")
    async def list_users(self, db_session: AsyncSession) -> list[UserRef]:
        return [UserRef.of(u) for u in await db_session.scalars(select(User).order_by(User.name))]


class SettingsController(Controller):
    path = "/api/settings"

    @get("/")
    async def read(self, db_session: AsyncSession) -> dict:
        s = await get_settings(db_session)
        return {"scoringFields": s["scoring_fields"], "autoAssignOnCreate": s["auto_assign_on_create"]}

    @put("/")
    async def write(self, db_session: AsyncSession, data: SettingsIn) -> dict:
        upd = changes(data)
        if "scoring_fields" in upd:
            unknown = set(upd["scoring_fields"]) - set(SCORING_FIELDS)
            if unknown:
                raise ValidationException(f"Unknown scoring fields: {', '.join(sorted(unknown))}")
        s = await save_settings(db_session, upd)
        if "scoring_fields" in upd:
            await rescore(db_session)
        return {"scoringFields": s["scoring_fields"], "autoAssignOnCreate": s["auto_assign_on_create"]}


class SavedFilterController(Controller):
    path = "/api/filters"

    @get("/")
    async def list_filters(self, request: Request, db_session: AsyncSession, view: str) -> list[SavedFilterOut]:
        me = current_user(request).id
        rows = await db_session.scalars(
            select(SavedFilter)
            .where(SavedFilter.view == view, or_(SavedFilter.user_id == me, SavedFilter.shared.is_(True)))
            .order_by(SavedFilter.name)
        )
        out = []
        for f in rows:
            owner = await db_session.get(User, f.user_id)
            out.append(
                SavedFilterOut(
                    id=f.id,
                    view=f.view,
                    name=f.name,
                    params=f.params,
                    is_default=f.is_default and f.user_id == me,
                    shared=f.shared,
                    owner=UserRef.of(owner),
                    mine=f.user_id == me,
                )
            )
        return out

    @post("/")
    async def create_filter(self, request: Request, db_session: AsyncSession, data: SavedFilterIn) -> SavedFilterOut:
        me = current_user(request)
        if data.is_default:
            for other in await db_session.scalars(
                select(SavedFilter).where(SavedFilter.user_id == me.id, SavedFilter.view == data.view)
            ):
                other.is_default = False
        f = SavedFilter(
            user_id=me.id,
            view=data.view,
            name=data.name,
            params=data.params,
            is_default=data.is_default,
            shared=data.shared,
        )
        db_session.add(f)
        await db_session.flush()
        return SavedFilterOut(
            id=f.id,
            view=f.view,
            name=f.name,
            params=f.params,
            is_default=f.is_default,
            shared=f.shared,
            owner=UserRef.of(me),
            mine=True,
        )

    @delete("/{filter_id:str}")
    async def delete_filter(self, request: Request, db_session: AsyncSession, filter_id: str) -> None:
        f = await db_session.get(SavedFilter, filter_id)
        if f is None:
            return
        if f.user_id != current_user(request).id:
            raise PermissionDeniedException("You can only delete your own filters")
        await db_session.delete(f)
