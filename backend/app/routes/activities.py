from datetime import date
from typing import Annotated

from litestar import Controller, Request, delete, get, post, put
from litestar.exceptions import ValidationException
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import ACTIVITY_TYPES
from app.db.models import Contact, CrmLead, Note, ScheduledActivity, User, utcnow
from app.db.setup import log_activity
from app.routes.common import ContactIdQ, LeadIdQ, current_user, get_or_404, today
from app.schemas import (
    ActivityDoneIn,
    ActivityIn,
    ActivityPatch,
    NoteIn,
    NoteOut,
    ScheduledActivityOut,
    changes,
)


async def _check_refs(db: AsyncSession, lead_id: str | None, contact_id: str | None, user_id: str | None) -> None:
    for model, value, label in (
        (CrmLead, lead_id, "leadId"),
        (Contact, contact_id, "contactId"),
        (User, user_id, "userId"),
    ):
        if value and await db.get(model, value) is None:
            raise ValidationException(f"{label}: no such record")


class ActivityController(Controller):
    path = "/api/activities"

    @get("/types")
    async def types(self) -> list[str]:
        return ACTIVITY_TYPES

    @get("/")
    async def list_activities(
        self,
        request: Request,
        db_session: AsyncSession,
        user_id: Annotated[str | None, Parameter(query="userId")] = None,
        which: Annotated[str | None, Parameter(query="state")] = None,
        lead_id: LeadIdQ = None,
        contact_id: ContactIdQ = None,
        activity_type: Annotated[str | None, Parameter(query="type")] = None,
        due_from: Annotated[date | None, Parameter(query="from")] = None,
        due_to: Annotated[date | None, Parameter(query="to")] = None,
    ) -> list[ScheduledActivityOut]:
        """state: open (default) | overdue | today | planned | done | all. userId: id | me."""
        t = today()
        stmt = select(ScheduledActivity)
        state = which or "open"
        if state == "done":
            stmt = stmt.where(ScheduledActivity.done.is_(True))
        elif state != "all":
            stmt = stmt.where(ScheduledActivity.done.is_(False))
            if state == "overdue":
                stmt = stmt.where(ScheduledActivity.due_date < t)
            elif state == "today":
                stmt = stmt.where(ScheduledActivity.due_date == t)
            elif state == "planned":
                stmt = stmt.where(ScheduledActivity.due_date > t)
        if user_id:
            stmt = stmt.where(ScheduledActivity.user_id == (current_user(request).id if user_id == "me" else user_id))
        if lead_id:
            stmt = stmt.where(ScheduledActivity.lead_id == lead_id)
        if contact_id:
            stmt = stmt.where(ScheduledActivity.contact_id == contact_id)
        if activity_type:
            stmt = stmt.where(ScheduledActivity.activity_type == activity_type)
        if due_from:
            stmt = stmt.where(ScheduledActivity.due_date >= due_from)
        if due_to:
            stmt = stmt.where(ScheduledActivity.due_date <= due_to)
        order = ScheduledActivity.done_at.desc() if state == "done" else ScheduledActivity.due_date.asc()
        rows = await db_session.scalars(stmt.order_by(order).limit(2000))
        return [ScheduledActivityOut.of(a, t) for a in rows]

    @post("/")
    async def create_activity(
        self, request: Request, db_session: AsyncSession, data: ActivityIn
    ) -> ScheduledActivityOut:
        if not data.lead_id and not data.contact_id:
            raise ValidationException("An activity needs a leadId or contactId")
        actor = current_user(request)
        await _check_refs(db_session, data.lead_id, data.contact_id, data.user_id)
        act = ScheduledActivity(
            lead_id=data.lead_id,
            contact_id=data.contact_id,
            activity_type=data.activity_type,
            summary=data.summary,
            note=data.note,
            due_date=data.due_date,
            user_id=data.user_id or actor.id,
            created_by=actor.id,
        )
        db_session.add(act)
        await db_session.flush()
        act = await get_or_404(db_session, ScheduledActivity, act.id, "Activity")
        return ScheduledActivityOut.of(act, today())

    @put("/{activity_id:str}")
    async def update_activity(
        self, db_session: AsyncSession, activity_id: str, data: ActivityPatch
    ) -> ScheduledActivityOut:
        act = await get_or_404(db_session, ScheduledActivity, activity_id, "Activity")
        updates = changes(data)
        await _check_refs(db_session, None, None, updates.get("user_id"))
        for field, value in updates.items():
            setattr(act, field, value)
        await db_session.flush()
        act = await get_or_404(db_session, ScheduledActivity, activity_id, "Activity")
        return ScheduledActivityOut.of(act, today())

    @post("/{activity_id:str}/done", status_code=200)
    async def mark_done(
        self, request: Request, db_session: AsyncSession, activity_id: str, data: ActivityDoneIn
    ) -> ScheduledActivityOut:
        act = await get_or_404(db_session, ScheduledActivity, activity_id, "Activity")
        if not act.done:
            act.done = True
            act.done_at = utcnow()
            act.feedback = data.feedback
            if act.user_id is None:
                act.user_id = current_user(request).id
            label = act.summary or act.activity_type
            log_activity(db_session, "activity_done", f'{act.activity_type} "{label}" done', "activity", act.id)
        await db_session.flush()
        return ScheduledActivityOut.of(act, today())

    @delete("/{activity_id:str}")
    async def delete_activity(self, db_session: AsyncSession, activity_id: str) -> None:
        act = await db_session.get(ScheduledActivity, activity_id)
        if act is not None:
            await db_session.delete(act)


class NoteController(Controller):
    path = "/api/notes"

    @get("/")
    async def list_notes(
        self, db_session: AsyncSession, lead_id: LeadIdQ = None, contact_id: ContactIdQ = None
    ) -> list[NoteOut]:
        stmt = select(Note).order_by(Note.created_at.desc())
        if lead_id:
            stmt = stmt.where(Note.lead_id == lead_id)
        if contact_id:
            stmt = stmt.where(Note.contact_id == contact_id)
        return [NoteOut.of(n) for n in await db_session.scalars(stmt)]

    @post("/")
    async def create_note(self, request: Request, db_session: AsyncSession, data: NoteIn) -> NoteOut:
        await _check_refs(db_session, data.lead_id, data.contact_id, None)
        note = Note(
            body=data.body, lead_id=data.lead_id, contact_id=data.contact_id, author_id=current_user(request).id
        )
        db_session.add(note)
        await db_session.flush()
        log_activity(db_session, "note_added", "Note added", "note", note.id)
        return NoteOut.of(await get_or_404(db_session, Note, note.id, "Note"))

    @delete("/{note_id:str}")
    async def delete_note(self, db_session: AsyncSession, note_id: str) -> None:
        note = await db_session.get(Note, note_id)
        if note is not None:
            await db_session.delete(note)
