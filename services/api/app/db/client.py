from functools import lru_cache

from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from app.config import settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    return create_client(
        settings.supabase_url,
        settings.supabase_service_key or settings.supabase_key,
    )


def get_supabase_for_access_token(access_token: str) -> Client:
    """Anon key + user JWT so PostgREST applies RLS as that user."""
    return create_client(
        settings.supabase_url,
        settings.supabase_anon_key or settings.supabase_key,
        options=ClientOptions(
            headers={"Authorization": f"Bearer {access_token}"},
        ),
    )
