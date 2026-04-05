import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, status


# Lazily initialised — fetches Supabase's JWKS once and caches the signing keys.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        from app.config import settings
        _jwks_client = PyJWKClient(
            f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
        )
    return _jwks_client


def verify_access_token(token: str) -> str:
    """Verify a Supabase JWT using the project's public JWKS.

    Works with both ES256 (newer Supabase projects) and RS256 tokens.
    The signing key is fetched from the JWKS endpoint on first call and
    cached in memory — no per-request network round-trip after warm-up.
    """
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        ) from exc

    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )
    return sub
