import logging
import secrets
from typing import Annotated
from urllib.parse import urlencode

import httpx
from litestar import Controller, Request, Response, get, post
from litestar.exceptions import (
    HTTPException,
    NotAuthorizedException,
    PermissionDeniedException,
)
from litestar.params import Parameter
from litestar.response import Redirect
from litestar.status_codes import (
    HTTP_201_CREATED,
    HTTP_204_NO_CONTENT,
    HTTP_409_CONFLICT,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import SESSION_USER_KEY, hash_password, load_session_user, verify_password
from app.config import settings
from app.db.models import User, utcnow
from app.db.seed import ensure_team_membership
from app.schemas import LoginIn, SignupIn, UserEnvelope, UserOut

log = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
OAUTH_STATE_KEY = "google_oauth_state"

NOT_ALLOWED = "This email is not authorized to access this CRM."


def start_session(request: Request, user: User) -> None:
    request.set_session({SESSION_USER_KEY: user.id})


class AuthController(Controller):
    path = "/api/auth"

    @get("/config")
    async def config(self) -> dict:
        return {"googleEnabled": settings.google_enabled}

    @get("/me")
    async def me(self, request: Request) -> UserEnvelope:
        user = await load_session_user(request)
        return UserEnvelope(user=UserOut.of(user) if user else None)

    @post("/signup", status_code=HTTP_201_CREATED)
    async def signup(self, request: Request, db_session: AsyncSession, data: SignupIn) -> UserEnvelope:
        if len(data.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        if not settings.has_allowlist:
            raise HTTPException(
                status_code=500, detail="Sign-in is not configured yet. Set ALLOWED_EMAILS on the server."
            )
        email = data.email.strip().lower()
        if not settings.is_allowed_email(email):
            raise PermissionDeniedException(NOT_ALLOWED)
        if await db_session.scalar(select(User.id).where(User.email == email)):
            raise HTTPException(status_code=HTTP_409_CONFLICT, detail="An account with this email already exists.")

        user = User(
            email=email, name=data.name, password_hash=await hash_password(data.password), last_login_at=utcnow()
        )
        db_session.add(user)
        await db_session.flush()
        await ensure_team_membership(db_session)
        start_session(request, user)
        return UserEnvelope(user=UserOut.of(user))

    @post("/login", status_code=200)
    async def login(self, request: Request, db_session: AsyncSession, data: LoginIn) -> UserEnvelope:
        email = data.email.strip().lower()
        if not settings.is_allowed_email(email):
            raise PermissionDeniedException(NOT_ALLOWED)
        user = await db_session.scalar(select(User).where(User.email == email))
        if not user or not user.password_hash or not await verify_password(data.password, user.password_hash):
            raise NotAuthorizedException("Invalid email or password.")

        user.last_login_at = utcnow()
        start_session(request, user)
        return UserEnvelope(user=UserOut.of(user))

    @post("/logout", status_code=HTTP_204_NO_CONTENT)
    async def logout(self, request: Request) -> None:
        request.clear_session()

    @get("/google")
    async def google_start(self, request: Request) -> Redirect:
        if not settings.google_enabled:
            raise HTTPException(status_code=501, detail="Google sign-in is not configured on this server.")
        state = secrets.token_urlsafe(24)
        request.set_session({**request.session, OAUTH_STATE_KEY: state})
        query = urlencode(
            {
                "client_id": settings.google_client_id,
                "redirect_uri": settings.google_callback_url,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
            }
        )
        return Redirect(f"{GOOGLE_AUTH_URL}?{query}")

    @get("/google/callback")
    async def google_callback(
        self,
        request: Request,
        db_session: AsyncSession,
        code: str | None = None,
        oauth_state: Annotated[str | None, Parameter(query="state")] = None,
    ) -> Response:
        if not settings.google_enabled:
            return Response("Google sign-in is not configured on this server.", status_code=501)

        def fail(reason: str) -> Redirect:
            return Redirect(f"{settings.frontend_url}/login?error={reason}")

        expected_state = request.session.pop(OAUTH_STATE_KEY, None) if isinstance(request.session, dict) else None
        if not code or not oauth_state or not expected_state or not secrets.compare_digest(oauth_state, expected_state):
            return fail("google_failed")

        try:
            profile = await fetch_google_profile(code)
        except httpx.HTTPError:
            log.exception("Google token exchange failed")
            return fail("google_failed")

        email = (profile.get("email") or "").lower()
        if not email or not profile.get("email_verified", False):
            return fail("google_failed")
        if not settings.is_allowed_email(email):
            return fail("not_allowed")

        google_id = profile["sub"]
        avatar_url = profile.get("picture")
        user = await db_session.scalar(select(User).where(User.google_id == google_id))
        if user is None:
            user = await db_session.scalar(select(User).where(User.email == email))
            if user is not None:
                user.google_id = google_id
                user.avatar_url = avatar_url or user.avatar_url
            else:
                user = User(email=email, name=profile.get("name") or email, avatar_url=avatar_url, google_id=google_id)
                db_session.add(user)
        user.last_login_at = utcnow()
        await db_session.flush()
        await ensure_team_membership(db_session)

        start_session(request, user)
        return Redirect(settings.frontend_url)


async def fetch_google_profile(code: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        token = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_callback_url,
                "grant_type": "authorization_code",
            },
        )
        token.raise_for_status()
        userinfo = await client.get(
            GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {token.json()['access_token']}"}
        )
        userinfo.raise_for_status()
        return userinfo.json()
