import logging
from pathlib import Path

from advanced_alchemy.extensions.litestar import (
    AsyncSessionConfig,
    SQLAlchemyAsyncConfig,
)
from litestar import Litestar
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import Activity, SessionStore

log = logging.getLogger(__name__)

SCHEMA_SQL = Path(__file__).with_name("schema.sql")

db_config = SQLAlchemyAsyncConfig(
    connection_string=settings.database_url,
    session_config=AsyncSessionConfig(expire_on_commit=False),
    before_send_handler="autocommit_include_redirects",
    set_default_exception_handler=False,
)


def log_activity(session: AsyncSession, type_: str, message: str, entity_type: str, entity_id: str) -> None:
    session.add(Activity(type=type_, message=message, entity_type=entity_type, entity_id=entity_id))


async def init_db(app: Litestar) -> None:
    """Create/upgrade the schema, then fill in configuration defaults and (on a fresh database) sample data."""
    from app.db.migrate import migrate_v1
    from app.db.seed import seed_config, seed_sample_data
    from app.services.scoring import rescore

    engine = db_config.get_engine()
    async with engine.begin() as conn:
        raw = (await conn.get_raw_connection()).driver_connection
        # schema.sql is multi-statement, which only the plain asyncpg protocol accepts
        await raw.execute(SCHEMA_SQL.read_text())
        migrated = await migrate_v1(raw)
        await conn.run_sync(SessionStore.metadata.create_all, tables=[SessionStore.__table__])

    async with db_config.get_session() as session:
        await seed_config(session)
        seeded = await seed_sample_data(session)
        if migrated or seeded:
            await session.flush()
            await rescore(session)
        await session.commit()
    if migrated:
        log.warning("v1 data migrated; the old tables were kept as legacy_deals, legacy_leads and legacy_tasks")
