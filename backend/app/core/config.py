"""Configuration — environment-driven, validated at startup (Phase 2 §28)."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://miyone:miyone_dev@localhost:5432/miyone"
    env: str = "dev"
    session_cookie: str = "miy_session"
    session_ttl_days: int = 30
    session_absolute_cap_days: int = 90
    cookie_secure: bool = False  # True behind TLS in production

    model_config = {"env_prefix": "MIYONE_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
