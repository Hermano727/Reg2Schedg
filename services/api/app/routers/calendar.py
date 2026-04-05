"""Google Calendar OAuth + sync routes."""

from __future__ import annotations

import secrets
import time
import logging
import hashlib
import base64
from typing import Any

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from app.auth.deps import get_current_user_access
from app.config import get_settings

router = APIRouter(prefix="/calendar", tags=["calendar"])

logger = logging.getLogger(__name__)

# In-memory stores — sufficient for development.
# In production, persist these in the database.
_pending_auth: dict[str, dict[str, str]] = {}  # oauth_state -> {user_id, code_verifier}
_token_store: dict[str, dict[str, Any]] = {}  # user_id -> google credentials dict


def _make_flow():  # type: ignore[return]
    """Build a google_auth_oauthlib Flow, or raise 503 if Google is not configured."""
    try:
        from google_auth_oauthlib.flow import Flow  # type: ignore[import-untyped]
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="google-auth-oauthlib is not installed. Run: pip install -r requirements.txt",
        ) from exc

    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google Calendar not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to services/api/.env",
        )

    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uris": [settings.google_redirect_uri],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=["https://www.googleapis.com/auth/calendar"],
        redirect_uri=settings.google_redirect_uri,
    )


def _make_signed_state(user_id: str, code_verifier: str | None = None, expires_seconds: int = 300) -> str:
    """Create a signed state token (JWT) containing the user id and optional code_verifier.

    If `SUPABASE_JWT_SECRET` is not configured, the caller should persist the
    `code_verifier` in `_pending_auth` instead.
    """
    settings = get_settings()
    secret = settings.supabase_jwt_secret
    if not secret:
        # Legacy fallback: generate a random state and return it.
        return secrets.token_urlsafe(32)

    payload: dict[str, object] = {"uid": user_id, "exp": int(time.time()) + expires_seconds}
    if code_verifier:
        payload["cv"] = code_verifier
    return jwt.encode(payload, secret, algorithm="HS256")


def _verify_signed_state(state: str) -> tuple[str, str | None] | None:
    """Verify and decode a signed state token.

    Returns a tuple `(user_id, code_verifier)` or `None` if invalid.
    """
    settings = get_settings()
    secret = settings.supabase_jwt_secret
    if not secret:
        return None
    try:
        payload = jwt.decode(state, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        logger.debug("Failed to decode signed OAuth state", exc_info=True)
        return None
    uid = payload.get("uid")
    if not uid or not isinstance(uid, str):
        return None
    cv = payload.get("cv")
    if cv is not None and not isinstance(cv, str):
        cv = None
    return uid, cv


@router.get("/authorize")
def authorize(
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> dict[str, str]:
    """Return a Google OAuth URL for the authenticated user to visit."""
    user_id, _ = auth
    flow = _make_flow()

    settings = get_settings()

    # Generate a PKCE code_verifier and S256 code_challenge.
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode("utf-8")).digest()
    ).rstrip(b"=").decode("ascii")

    # Create a state value. When possible, embed the code_verifier inside a
    # signed JWT so the callback can be handled statelessly. Otherwise persist
    # the verifier in the in-memory map.
    if settings.supabase_jwt_secret:
        state = _make_signed_state(user_id, code_verifier=code_verifier)
    else:
        state = secrets.token_urlsafe(32)
        _pending_auth[state] = {"user_id": user_id, "code_verifier": code_verifier}

    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
        code_challenge=code_challenge,
        code_challenge_method="S256",
    )
    return {"url": url}


@router.get("/callback")
def callback(code: str, state: str) -> RedirectResponse:
    """Handle the OAuth callback from Google and store the user's tokens."""
    # Try stateless signed state first (may carry the code_verifier), then
    # fall back to the in-memory map which stores the verifier.
    signed = _verify_signed_state(state)
    if signed:
        user_id, code_verifier = signed
    else:
        mapping = _pending_auth.pop(state, None)
        if not mapping:
            raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")
        user_id = mapping.get("user_id")
        code_verifier = mapping.get("code_verifier")

    flow = _make_flow()
    # Re-attach the state so the library accepts it
    flow.oauth2session.state = state  # type: ignore[attr-defined]
    # Restore PKCE verifier so oauthlib can include it in the token request
    if code_verifier:
        try:
            flow.code_verifier = code_verifier  # type: ignore[attr-defined]
        except Exception:
            try:
                flow.oauth2session._client.code_verifier = code_verifier  # type: ignore[attr-defined]
            except Exception:
                logger.debug("Failed to attach code_verifier to flow; token exchange may fail")

    flow.fetch_token(code=code)

    creds = flow.credentials
    _token_store[user_id] = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
    }

    frontend_origin = get_settings().frontend_origin
    return RedirectResponse(url=f"{frontend_origin}/?calendar_connected=true")


@router.post("/sync")
def sync_calendar(
    events: list[dict[str, Any]],
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> dict[str, Any]:
    """Insert a list of Google Calendar event objects for the authenticated user."""
    user_id, _ = auth
    if user_id not in _token_store:
        raise HTTPException(
            status_code=401,
            detail="Google Calendar not authorized. Visit /api/calendar/authorize first.",
        )

    try:
        from google.oauth2.credentials import Credentials  # type: ignore[import-untyped]
        from googleapiclient.discovery import build  # type: ignore[import-untyped]
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="google-api-python-client is not installed. Run: pip install -r requirements.txt",
        ) from exc

    creds = Credentials(**_token_store[user_id])
    service = build("calendar", "v3", credentials=creds)

    created_ids: list[str] = []
    for event in events:
        result = service.events().insert(calendarId="primary", body=event).execute()
        created_ids.append(result.get("id", ""))

    return {"created": created_ids, "count": len(created_ids)}
