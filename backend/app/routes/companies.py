from litestar import Controller, delete, get, post, put
from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Company, Contact, CrmLead
from app.db.setup import log_activity
from app.routes.common import get_or_404
from app.routes.leads import lead_list
from app.schemas import (
    CompanyDetail,
    CompanyIn,
    CompanyListItem,
    CompanyOut,
    CompanyPatch,
    ContactOut,
    changes,
    extend,
)


class CompanyController(Controller):
    path = "/api/companies"

    @get("/")
    async def list_companies(self, db_session: AsyncSession, q: str | None = None) -> list[CompanyListItem]:
        contact_count = select(func.count()).where(Contact.company_id == Company.id).scalar_subquery()
        opp_count = (
            select(func.count())
            .where(CrmLead.company_id == Company.id, CrmLead.type == "opportunity", CrmLead.active.is_(True))
            .scalar_subquery()
        )
        stmt = select(Company, contact_count, opp_count).order_by(Company.created_at.desc())
        if q:
            stmt = stmt.where(Company.name.ilike(f"%{q}%"))
        rows = await db_session.execute(stmt)
        return [extend(CompanyListItem, CompanyOut.of(c), contact_count=cc, opportunity_count=oc) for c, cc, oc in rows]

    @get("/{company_id:str}")
    async def get_company(self, db_session: AsyncSession, company_id: str) -> CompanyDetail:
        company = await get_or_404(db_session, Company, company_id, "Company")
        contacts = await db_session.scalars(select(Contact).where(Contact.company_id == company_id))
        opps = await db_session.scalars(
            select(CrmLead).where(CrmLead.company_id == company_id).order_by(CrmLead.created_at.desc())
        )
        return extend(
            CompanyDetail,
            CompanyOut.of(company),
            contacts=[ContactOut.of(c) for c in contacts],
            opportunities=await lead_list(db_session, list(opps)),
        )

    @post("/")
    async def create_company(self, db_session: AsyncSession, data: CompanyIn) -> CompanyOut:
        company = Company(name=data.name, industry=data.industry, website=data.website, size=data.size)
        db_session.add(company)
        await db_session.flush()
        log_activity(db_session, "company_created", f'Company "{data.name}" added', "company", company.id)
        return CompanyOut.of(company)

    @put("/{company_id:str}")
    async def update_company(self, db_session: AsyncSession, company_id: str, data: CompanyPatch) -> CompanyOut:
        company = await get_or_404(db_session, Company, company_id, "Company")
        for field, value in changes(data).items():
            setattr(company, field, value)
        return CompanyOut.of(company)

    @delete("/{company_id:str}")
    async def delete_company(self, db_session: AsyncSession, company_id: str) -> None:
        await db_session.execute(sql_delete(Company).where(Company.id == company_id))
