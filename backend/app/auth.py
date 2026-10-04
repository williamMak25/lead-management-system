import asyncio

import bcrypt
from litestar.connection import ASGIConnection
from litestar.exceptions import NotAuthorizedException
from litestar.handlers import BaseRouteHandler
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import User
from app.db.setup import db_config

SESSION_USER_KEY = "user_id"


async def hash_password(password: str) -> str:
    hashed = await asyncio.to_thread(bcrypt.hashpw, password.encode(), bcrypt.gensalt(12))
    return hashed.decode()


async def verify_password(password: str, password_hash: str) -> bool:
    # bcryptjs wrote $2a$/$2b$ hashes, which the bcrypt package verifies as-is
    return await asyncio.to_thread(bcrypt.checkpw, password.encode(), password_hash.encode())


async def load_session_user(connection: ASGIConnection) -> User | None:
    """User for the current session cookie, or None. Re-checks the allowlist on every request,
    so removing an email from ALLOWED_EMAILS also ends sessions that are already open."""
    session = connection.scope.get("session")
    user_id = session.get(SESSION_USER_KEY) if isinstance(session, dict) else None
    if not user_id:
        return None
    db: AsyncSession = db_config.provide_session(connection.app.state, connection.scope)
    user = await db.get(User, user_id)
    if user is None or not settings.is_allowed_email(user.email):
        return None
    return user


async def requires_user(connection: ASGIConnection, _: BaseRouteHandler) -> None:
    user = await load_session_user(connection)
    if user is None:
        raise NotAuthorizedException("Authentication required")
    connection.state.user = user
