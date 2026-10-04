import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _asyncpg_url(url: str) -> str:
    """Accept the same postgresql:// URL the Node backend used and point SQLAlchemy at asyncpg."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix) :]
    return url


@dataclass(frozen=True)
class Settings:
    database_url: str = _asyncpg_url(
        os.getenv("DATABASE_URL", "postgresql://crm:crm_dev_password@localhost:5432/crm_dev")
    )
    port: int = int(os.getenv("PORT", "4000"))
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    production: bool = os.getenv("APP_ENV", "development") == "production"

    allowed_emails: frozenset[str] = field(
        default_factory=lambda: frozenset(
            e.strip().lower() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()
        )
    )

    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_callback_url: str = os.getenv("GOOGLE_CALLBACK_URL", "http://localhost:4000/api/auth/google/callback")

    @property
    def has_allowlist(self) -> bool:
        return bool(self.allowed_emails)

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    def is_allowed_email(self, email: str) -> bool:
        return self.has_allowlist and email.lower() in self.allowed_emails


settings = Settings()

ACTIVITY_TYPES = ["Email", "Call", "Meeting", "To-Do", "Upload Document"]
LEAD_TYPES = ["lead", "opportunity"]

# Fields predictive lead scoring can learn from (Odoo's "crm.lead.scoring.frequency" fields).
SCORING_FIELDS = {
    "stage": "Stage",
    "team": "Sales team",
    "source": "Source",
    "medium": "Medium",
    "campaign": "Campaign",
    "tags": "Tags",
    "country": "Country",
    "email_state": "Has email",
    "phone_state": "Has phone",
}
DEFAULT_SETTINGS = {
    "scoring_fields": ["stage", "team", "source", "tags", "email_state", "phone_state", "country"],
    "auto_assign_on_create": True,
}
