from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


API_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]


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

    model_config = SettingsConfigDict(
        env_file=(API_DIR / ".env", REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
