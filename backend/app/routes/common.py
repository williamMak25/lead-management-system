from datetime import date, datetime
from typing import Annotated

from litestar import Request
from litestar.exceptions import NotFoundException
from litestar.params import Parameter
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


async def get_or_404[M](db: AsyncSession, model: type[M], id: str, label: str) -> M:
    # populate_existing re-runs the joined loads, so relationships reflect any FK just changed
    obj = await db.get(model, id, populate_existing=True)
    if obj is None:
        raise NotFoundException(f"{label} not found")
    return obj


def current_user(request: Request) -> User:
    """Set by the `requires_user` guard on every protected route."""
    return request.state.user


def today() -> date:
    # server-local calendar day, which is what due dates and "overdue" are judged against
    return datetime.now().astimezone().date()


def query_dict(request: Request) -> dict[str, str]:
    return {k: v for k, v in request.query_params.items() if v not in ("", None)}


CompanyIdQ = Annotated[str | None, Parameter(query="companyId")]
ContactIdQ = Annotated[str | None, Parameter(query="contactId")]
LeadIdQ = Annotated[str | None, Parameter(query="leadId")]
