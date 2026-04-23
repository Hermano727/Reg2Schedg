from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


API_DIR = Path(__file__).resolve().parents[1]
# In local dev, API_DIR is <repo>/services/api; in Railway containers it's often /app.
# Guard against shallow paths so startup never crashes on import.
REPO_ROOT = API_DIR.parents[1] if len(API_DIR.parents) > 1 else API_DIR


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str = Field(
        validation_alias=AliasChoices(
            "SUPABASE_KEY",
            "SUPABASE_SECRET_KEY",
            "SUPABASE_ANON_PUBLIC",
            "SUPABASE_ANON_KEY",
        ),
    )
    supabase_anon_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "SUPABASE_ANON_PUBLIC",
            "SUPABASE_ANON_KEY",
            "SUPABASE_KEY",
        ),
    )
    supabase_service_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_SECRET_KEY"),
    )
    supabase_jwt_secret: str | None = None
    gemini_api_key: str

    # Google Calendar OAuth (optional — omit to disable the integration)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://127.0.0.1:8000/api/calendar/callback"
    frontend_origin: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("FRONTEND_ORIGIN"),
    )
    frontend_origins: str = Field(
        default="",
        validation_alias=AliasChoices("FRONTEND_ORIGINS"),
    )

    model_config = SettingsConfigDict(
        env_file=(API_DIR / ".env", REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


class SettingsProxy:
    """Resolve settings lazily so imports stay side-effect free in tests."""

    def __getattr__(self, name: str):
        return getattr(get_settings(), name)


settings = SettingsProxy()


def get_allowed_frontend_origins(cfg: Settings) -> set[str]:
    origins = {cfg.frontend_origin.rstrip("/")}
    extra = [
        origin.strip().rstrip("/")
        for origin in cfg.frontend_origins.split(",")
        if origin.strip()
    ]
    origins.update(extra)
    return origins
