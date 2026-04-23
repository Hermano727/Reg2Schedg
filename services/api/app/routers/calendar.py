"""Google Calendar OAuth + sync routes."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import secrets
import time
from html import escape
from typing import Any
from urllib.parse import urlsplit

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

from app.auth.deps import get_current_user_access
from app.config import get_settings

router = APIRouter(prefix="/calendar", tags=["calendar"])

logger = logging.getLogger(__name__)

# In-memory stores — sufficient for development.
# In production, persist these in the database.
_pending_auth: dict[str, dict[str, str]] = {}  # oauth_state -> {user_id, code_verifier}
_token_store: dict[str, dict[str, Any]] = {}  # user_id -> google credentials dict

OAUTH_MESSAGE_TYPE = "reg2schedg-google-calendar-oauth"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0"}


def _split_forwarded_header(value: str | None) -> str | None:
    if not value:
        return None
    first = value.split(",", 1)[0].strip()
    return first or None


def _normalize_origin(value: str | None) -> str:
    if not value:
        return ""

    candidate = value.strip().rstrip("/")
    if not candidate:
        return ""
    if candidate.startswith("//"):
        candidate = f"https:{candidate}"
    elif "://" not in candidate:
        scheme = "http" if any(candidate.startswith(f"{host}:") or candidate == host for host in LOCAL_HOSTS) else "https"
        candidate = f"{scheme}://{candidate}"

    parsed = urlsplit(candidate)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _origin_looks_local(origin: str) -> bool:
    parsed = urlsplit(origin)
    return (parsed.hostname or "") in LOCAL_HOSTS


def _request_origin(request: Request) -> str:
    proto = _split_forwarded_header(request.headers.get("x-forwarded-proto")) or request.url.scheme
    host = (
        _split_forwarded_header(request.headers.get("x-forwarded-host"))
        or request.headers.get("host")
        or request.url.netloc
    )
    return _normalize_origin(f"{proto}://{host}")


def _resolve_google_redirect_uri(request: Request) -> str:
    settings = get_settings()
    configured = _normalize_origin(settings.google_redirect_uri)
    request_origin = _request_origin(request)
    if configured and not (_origin_looks_local(configured) and not _origin_looks_local(request_origin)):
        return f"{configured}/api/calendar/callback" if not configured.endswith("/api/calendar/callback") else configured
    return f"{request_origin}/api/calendar/callback"


def _resolve_frontend_origin(request: Request) -> str:
    settings = get_settings()
    configured = _normalize_origin(settings.frontend_origin)
    request_origin = _request_origin(request)
    if configured and not (_origin_looks_local(configured) and not _origin_looks_local(request_origin)):
        return configured

    header_origin = _normalize_origin(request.headers.get("origin"))
    if header_origin:
        return header_origin

    referer = request.headers.get("referer")
    referer_origin = _normalize_origin(referer)
    if referer_origin:
        return referer_origin

    return configured or request_origin


def _make_flow(redirect_uri: str | None = None):  # type: ignore[return]
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
    resolved_redirect_uri = redirect_uri or settings.google_redirect_uri

    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uris": [resolved_redirect_uri],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=["https://www.googleapis.com/auth/calendar"],
        redirect_uri=resolved_redirect_uri,
    )


def _popup_response(
    status: str,
    message: str,
    *,
    frontend_origin: str | None = None,
    status_code: int = 200,
) -> HTMLResponse:
    """Return a tiny HTML page that reports OAuth status to the opener and closes."""
    fallback_origin = _normalize_origin(get_settings().frontend_origin) or "http://localhost:3000"
    resolved_frontend_origin = frontend_origin or fallback_origin
    payload = {
        "type": OAUTH_MESSAGE_TYPE,
        "status": status,
        "message": message,
    }
    payload_json = json.dumps(payload).replace("</", "<\\/")
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reg2Schedg Calendar Sync</title>
    <style>
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0a192f;
        color: #e6f1ff;
        font-family: Arial, sans-serif;
      }}
      main {{
        width: min(440px, calc(100vw - 32px));
        padding: 24px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        background: rgba(17, 34, 64, 0.96);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      }}
      h1 {{
        margin: 0 0 8px;
        font-size: 18px;
      }}
      p {{
        margin: 0;
        line-height: 1.5;
        color: rgba(230, 241, 255, 0.76);
      }}
    </style>
  </head>
  <body>
    <main>
      <h1>{escape("Google Calendar connected" if status == "success" else "Google Calendar connection failed")}</h1>
      <p>{escape(message)}</p>
    </main>
    <script>
      const payload = {payload_json};
      if (window.opener && !window.opener.closed) {{
        window.opener.postMessage(payload, "*");
      }}
      window.setTimeout(() => window.close(), 120);
      window.setTimeout(() => {{
        window.location.replace({json.dumps(resolved_frontend_origin)});
      }}, 1200);
    </script>
  </body>
</html>
"""
    return HTMLResponse(content=html, status_code=status_code)


def _extract_google_error_detail(exc: Exception) -> tuple[int | None, str]:
    """Return a friendly error detail from a Google API exception when possible."""
    status_code = getattr(getattr(exc, "resp", None), "status", None)
    raw_content = getattr(exc, "content", b"")
    detail = str(exc)

    if isinstance(raw_content, bytes):
        try:
            payload = json.loads(raw_content.decode("utf-8"))
        except Exception:
            payload = None
    else:
        payload = None

    if isinstance(payload, dict):
        error_payload = payload.get("error")
        if isinstance(error_payload, dict):
            message = error_payload.get("message")
            if isinstance(message, str) and message.strip():
                detail = message.strip()

            errors = error_payload.get("errors")
            if isinstance(errors, list):
                for item in errors:
                    if not isinstance(item, dict):
                        continue
                    reason = item.get("reason")
                    if reason == "accessNotConfigured":
                        project_match = re.search(r"project (\d+)", detail)
                        project_suffix = f" for project {project_match.group(1)}" if project_match else ""
                        return (
                            503,
                            "Google Calendar API is disabled"
                            f"{project_suffix}. Enable the Google Calendar API in Google Cloud Console, "
                            "wait a few minutes for propagation, then try syncing again.",
                        )

    return status_code, detail


def _make_signed_state(
    user_id: str,
    code_verifier: str | None = None,
    frontend_origin: str | None = None,
    expires_seconds: int = 300,
) -> str:
    """Create a signed state token (JWT) containing the user id and OAuth metadata.

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
    if frontend_origin:
        payload["fo"] = frontend_origin
    return jwt.encode(payload, secret, algorithm="HS256")


def _verify_signed_state(state: str) -> tuple[str, str | None, str | None] | None:
    """Verify and decode a signed state token.

    Returns a tuple `(user_id, code_verifier, frontend_origin)` or `None` if invalid.
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
    frontend_origin = payload.get("fo")
    if frontend_origin is not None and not isinstance(frontend_origin, str):
        frontend_origin = None
    return uid, cv, frontend_origin


@router.get("/authorize")
def authorize(
    request: Request,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> dict[str, str]:
    """Return a Google OAuth URL for the authenticated user to visit."""
    user_id, _ = auth
    redirect_uri = _resolve_google_redirect_uri(request)
    frontend_origin = _resolve_frontend_origin(request)
    flow = _make_flow(redirect_uri)

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
        state = _make_signed_state(
            user_id,
            code_verifier=code_verifier,
            frontend_origin=frontend_origin,
        )
    else:
        state = secrets.token_urlsafe(32)
        _pending_auth[state] = {
            "user_id": user_id,
            "code_verifier": code_verifier,
            "frontend_origin": frontend_origin,
        }

    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="false",
        prompt="select_account consent",
        state=state,
        code_challenge=code_challenge,
        code_challenge_method="S256",
    )
    return {"url": url}


@router.get("/status")
def calendar_status(
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> dict[str, bool]:
    """Return whether the current user has Google Calendar credentials on file."""
    user_id, _ = auth
    return {"authorized": user_id in _token_store}


@router.get("/callback")
def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    """Handle the OAuth callback from Google and store the user's tokens."""
    if error:
        return _popup_response(
            "error",
            f"Google returned an authorization error: {error}. Please try again.",
            status_code=400,
        )

    if not code or not state:
        return _popup_response(
            "error",
            "Google did not provide the required authorization response.",
            status_code=400,
        )

    # Try stateless signed state first (may carry the code_verifier), then
    # fall back to the in-memory map which stores the verifier.
    signed = _verify_signed_state(state)
    if signed:
        user_id, code_verifier, frontend_origin = signed
    else:
        mapping = _pending_auth.pop(state, None)
        if not mapping:
            return _popup_response(
                "error",
                "The Google Calendar connection expired before it finished. Please try again.",
                status_code=400,
            )
        user_id = mapping.get("user_id")
        code_verifier = mapping.get("code_verifier")
        frontend_origin = mapping.get("frontend_origin")

    flow = _make_flow(_resolve_google_redirect_uri(request))
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

    try:
        flow.fetch_token(code=code)
    except Exception as exc:  # pragma: no cover - network / external error
        logger.exception("Failed to fetch token from Google OAuth")
        return _popup_response(
            "error",
            f"Failed to finish the Google Calendar connection: {exc}",
            frontend_origin=frontend_origin,
            status_code=502,
        )

    creds = flow.credentials
    _token_store[user_id] = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
    }

    return _popup_response(
        "success",
        "Google Calendar is connected. You can close this window.",
        frontend_origin=frontend_origin,
    )


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
        from google.auth.transport.requests import Request  # type: ignore[import-untyped]
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="google-api-python-client is not installed. Run: pip install -r requirements.txt",
        ) from exc

    creds = Credentials(**_token_store[user_id])

    # Attempt to refresh expired tokens if a refresh_token is available.
    try:
        if not creds.valid:
            if creds.expired and creds.refresh_token:
                logger.info("Refreshing expired Google credentials for user %s", user_id)
                creds.refresh(Request())
                # persist refreshed token back to in-memory store so subsequent calls use it
                _token_store[user_id]["token"] = creds.token
                if creds.refresh_token:
                    _token_store[user_id]["refresh_token"] = creds.refresh_token
            else:
                logger.info("Google credentials not valid and cannot be refreshed (no refresh_token)")
                _token_store.pop(user_id, None)
                raise HTTPException(
                    status_code=401,
                    detail="Google Calendar authorization expired. Please reconnect your account.",
                )
    except Exception as exc:  # pragma: no cover - external network
        if isinstance(exc, HTTPException):
            raise
        logger.exception("Failed to refresh Google credentials")
        _token_store.pop(user_id, None)
        raise HTTPException(
            status_code=401,
            detail="Google Calendar authorization expired. Please reconnect your account.",
        ) from exc

    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    created_ids: list[str] = []
    results: list[dict[str, Any]] = []
    first_error_status: int | None = None
    first_error_detail: str | None = None
    for event in events:
        try:
            result = service.events().insert(calendarId="primary", body=event).execute()
            created_ids.append(result.get("id", ""))
            results.append({"id": result.get("id"), "status": "inserted"})
        except Exception as exc:  # pragma: no cover - external error
            error_status, error_detail = _extract_google_error_detail(exc)
            if first_error_detail is None:
                first_error_status = error_status
                first_error_detail = error_detail

            if error_status == 503:
                logger.warning(
                    "Google Calendar insert blocked by project configuration for user %s: %s",
                    user_id,
                    error_detail,
                )
                raise HTTPException(status_code=503, detail=error_detail) from exc

            logger.exception("Failed to insert calendar event for user %s", user_id)
            results.append({"error": error_detail})

    logger.info("Inserted %d events for user %s", len(created_ids), user_id)
    failed_count = len(results) - len(created_ids)
    if created_ids == [] and failed_count > 0:
        raise HTTPException(
            status_code=first_error_status or 502,
            detail=first_error_detail or "Google Calendar rejected the sync request.",
        )
    return {
        "created": created_ids,
        "count": len(created_ids),
        "failed": failed_count,
        "results": results,
    }
