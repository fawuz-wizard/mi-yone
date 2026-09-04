"""Configuration — environment-driven, validated at startup (Phase 2 §28)."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://miyone:miyone_dev@localhost:5432/miyone"
    env: str = "dev"
    session_cookie: str = "miy_session"
    session_ttl_days: int = 30
    session_absolute_cap_days: int = 90
    cookie_secure: bool = False  # True behind TLS in production

    # Partner AI (Phase 2: provider-swappable, never the source of truth)
    ai_provider: str = "local"  # "local" (built-in composer) | "anthropic"
    ai_api_key: str = ""
    ai_model: str = "claude-sonnet-5"

    # Market research (Phase 2 research boundary). Separate switch from the
    # Partner composer: an owner may want grounded phrasing without paying for
    # web search, or web search without changing the composer.
    research_provider: str = "none"  # "none" (honestly unavailable) | "anthropic"
    research_model: str = "claude-sonnet-5"

    # File storage (product photos) — local disk now, object storage later
    upload_dir: str = "./var/uploads"

    # WhatsApp catalog integration (Phase 2 integration layer)
    wa_mode: str = "test"  # "test" (labeled sample adapter) | "live" (Meta Graph API)
    wa_access_token: str = ""
    wa_business_account_id: str = ""

    model_config = {"env_prefix": "MIYONE_", "env_file": ".env", "extra": "ignore"}


settings = Settings()

# A deployment that sets MIYONE_ENV but forgets MIYONE_COOKIE_SECURE would ship
# session cookies that travel in the clear. Outside dev, secure is the floor —
# the environment can only ever turn it ON, never off.
if settings.env != "dev":
    settings.cookie_secure = True
