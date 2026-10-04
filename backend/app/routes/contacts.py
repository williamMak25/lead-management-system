from litestar import Controller, delete, get, post, put
from sqlalchemy import delete as sql_delete
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Contact, CrmLead, Note, ScheduledActivity
from app.db.setup import log_activity
from app.routes.common import CompanyIdQ, get_or_404, today
from app.routes.leads import lead_list
from app.schemas import (
    ContactDetail,
    ContactIn,
    ContactOut,
    ContactPatch,
    NoteOut,
    ScheduledActivityOut,
    changes,
    extend,
)


class ContactController(Controller):
    path = "/api/contacts"

    @get("/")
    async def list_contacts(
        self, db_session: AsyncSession, q: str | None = None, company_id: CompanyIdQ = None
    ) -> list[ContactOut]:
        stmt = select(Contact).order_by(Contact.created_at.desc())
        if company_id:
            stmt = stmt.where(Contact.company_id == company_id)
        if q:
            pattern = f"%{q.lower()}%"
            stmt = stmt.where(or_(func.lower(Contact.name).like(pattern), func.lower(Contact.email).like(pattern)))
        return [ContactOut.of(c) for c in await db_session.scalars(stmt)]

    @get("/{contact_id:str}")
    async def get_contact(self, db_session: AsyncSession, contact_id: str) -> ContactDetail:
        contact = await get_or_404(db_session, Contact, contact_id, "Contact")
        opps = await db_session.scalars(
            select(CrmLead).where(CrmLead.contact_id == contact_id).order_by(CrmLead.created_at.desc())
        )
        notes = await db_session.scalars(
            select(Note).where(Note.contact_id == contact_id).order_by(Note.created_at.desc())
        )
        acts = await db_session.scalars(
            select(ScheduledActivity)
            .where(
                ScheduledActivity.done.is_(False),
                or_(
                    ScheduledActivity.contact_id == contact_id,
                    ScheduledActivity.lead_id.in_(select(CrmLead.id).where(CrmLead.contact_id == contact_id)),
                ),
            )
            .order_by(ScheduledActivity.due_date)
        )
        t = today()
        return extend(
            ContactDetail,
            ContactOut.of(contact),
            opportunities=await lead_list(db_session, list(opps)),
            notes=[NoteOut.of(n) for n in notes],
            activities=[ScheduledActivityOut.of(a, t) for a in acts],
        )

    @post("/")
    async def create_contact(self, db_session: AsyncSession, data: ContactIn) -> ContactOut:
        contact = Contact(
            name=data.name,
            email=data.email,
            phone=data.phone,
            title=data.title,
            company_id=data.company_id,
            tags=data.tags,
        )
        db_session.add(contact)
        await db_session.flush()
        log_activity(db_session, "contact_created", f'Contact "{data.name}" added', "contact", contact.id)
        return ContactOut.of(await get_or_404(db_session, Contact, contact.id, "Contact"))

    @put("/{contact_id:str}")
    async def update_contact(self, db_session: AsyncSession, contact_id: str, data: ContactPatch) -> ContactOut:
        contact = await get_or_404(db_session, Contact, contact_id, "Contact")
        for field, value in changes(data).items():
            setattr(contact, field, value)
        await db_session.flush()
        return ContactOut.of(await get_or_404(db_session, Contact, contact_id, "Contact"))

    @delete("/{contact_id:str}")
    async def delete_contact(self, db_session: AsyncSession, contact_id: str) -> None:
        await db_session.execute(sql_delete(Contact).where(Contact.id == contact_id))
