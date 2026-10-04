import logging

from advanced_alchemy.extensions.litestar import SQLAlchemyPlugin
from advanced_alchemy.extensions.litestar.store import SQLAlchemyStore
from litestar import Litestar, Request, Response, Router, get
from litestar.config.cors import CORSConfig
from litestar.exceptions import HTTPException, ValidationException
from litestar.middleware.session.server_side import ServerSideSessionConfig
from litestar.openapi import OpenAPIConfig
from litestar.status_codes import HTTP_500_INTERNAL_SERVER_ERROR

from app.auth import requires_user
from app.config import settings
from app.db.models import SessionStore
from app.db.setup import db_config, init_db
from app.routes.activities import ActivityController, NoteController
from app.routes.auth import AuthController
from app.routes.companies import CompanyController
from app.routes.config import (
    LostReasonController,
    MetaController,
    SavedFilterController,
    SettingsController,
    StageController,
    TagController,
    TeamController,
    UserController,
    UtmController,
)
from app.routes.contacts import ContactController
from app.routes.dashboard import DashboardController
from app.routes.leads import LeadController
from app.routes.reports import ReportController

log = logging.getLogger("app")


@get("/api/health")
async def health() -> dict:
    return {"ok": True}


def http_error(_: Request, exc: HTTPException) -> Response:
    """Errors keep the `{"error": "..."}` shape the frontend reads."""
    message = exc.detail
    if isinstance(exc, ValidationException) and exc.extra:
        message = "; ".join(f"{e.get('key')}: {e.get('message')}" if isinstance(e, dict) else str(e) for e in exc.extra)
    return Response({"error": message}, status_code=exc.status_code)


def server_error(_: Request, exc: Exception) -> Response:
    log.exception("Unhandled error", exc_info=exc)
    return Response({"error": "Internal server error"}, status_code=HTTP_500_INTERNAL_SERVER_ERROR)


protected = Router(
    path="/",
    guards=[requires_user],
    route_handlers=[
        CompanyController,
        ContactController,
        LeadController,
        ActivityController,
        NoteController,
        DashboardController,
        ReportController,
        MetaController,
        StageController,
        TagController,
        LostReasonController,
        UtmController,
        TeamController,
        UserController,
        SettingsController,
        SavedFilterController,
    ],
)

app = Litestar(
    route_handlers=[health, AuthController, protected],
    plugins=[SQLAlchemyPlugin(config=db_config)],
    on_startup=[init_db],
    stores={"sessions": SQLAlchemyStore(db_config, model=SessionStore, namespace="sessions")},
    middleware=[
        ServerSideSessionConfig(
            key="crm_session",
            max_age=30 * 24 * 60 * 60,
            secure=settings.production,
            samesite="lax",
            httponly=True,
        ).middleware
    ],
    cors_config=CORSConfig(allow_origins=[settings.frontend_url], allow_credentials=True),
    exception_handlers={HTTPException: http_error, HTTP_500_INTERNAL_SERVER_ERROR: server_error},
    openapi_config=OpenAPIConfig(title="Ledgerline CRM API", version="1.0.0", path="/api/schema"),
)
