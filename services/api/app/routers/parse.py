import hashlib
import logging

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import verify_access_token
from app.db.client import get_supabase_client
from app.db.service import (
    get_image_parse_cache,
    get_timeout_remaining_seconds,
    is_image_invalid,
    log_invalid_submission,
    mark_image_invalid,
    upsert_image_parse_cache,
    INVALID_RATE_LIMIT_WINDOW_MINUTES,
)
from app.models.course_parse import ParseScreenshotResponse
from app.models.research import BatchResearchResponse
from app.services.course_research import research_courses
from app.services.screenshot_parser import parse_schedule_image

_log = logging.getLogger(__name__)

router = APIRouter()
_bearer = HTTPBearer(auto_error=False)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _get_optional_user_id(request: Request) -> str | None:
    """Extract user_id from Bearer token if present; return None if missing or invalid."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        return verify_access_token(token)
    except Exception:
        return None


def _check_rate_limit(db_client, client_ip: str, user_id: str | None) -> None:
    """Raise 429 if this account/IP is currently in a timeout window."""
    try:
        remaining = get_timeout_remaining_seconds(db_client, client_ip, user_id)
        if remaining > 0:
            minutes = (remaining + 59) // 60
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "RATE_LIMITED",
                    "message": (
                        f"Too many invalid uploads. Please wait {minutes} minute(s) before trying again."
                    ),
                    "retry_after_seconds": remaining,
                },
            )
    except HTTPException:
        raise
    except Exception as exc:
        _log.warning("[rate-limit] check failed: %s", exc)


def _handle_invalid_image(
    db_client, client_ip: str, user_id: str | None, image_hash: str
) -> None:
    """Record an invalid submission, then re-check for timeout threshold and raise."""
    try:
        mark_image_invalid(db_client, image_hash)
        log_invalid_submission(db_client, client_ip, image_hash, user_id)
    except Exception as exc:
        _log.warning("[invalid-image] db write failed: %s", exc)

    try:
        remaining = get_timeout_remaining_seconds(db_client, client_ip, user_id)
        if remaining > 0:
            minutes = (remaining + 59) // 60
            who = f"account" if user_id else f"IP"
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "RATE_LIMITED",
                    "message": (
                        f"Too many invalid uploads. Your {who} has been temporarily blocked "
                        f"for {minutes} minute(s). Upload a WebReg schedule screenshot to continue."
                    ),
                    "retry_after_seconds": remaining,
                },
            )
    except HTTPException:
        raise
    except Exception as exc:
        _log.warning("[rate-limit] post-log check failed: %s", exc)

    raise HTTPException(
        status_code=422,
        detail={
            "code": "INVALID_SCHEDULE",
            "message": (
                "The uploaded image doesn't appear to be a UCSD WebReg schedule. "
                "Please upload a screenshot of your WebReg schedule (list view or calendar view)."
            ),
        },
    )


def _parse_with_cache(
    image_bytes: bytes,
    mime_type: str,
    client_ip: str,
    user_id: str | None,
    db_client,
) -> ParseScreenshotResponse:
    image_hash = hashlib.sha256(image_bytes).hexdigest()

    # Known-invalid hash → skip Gemini entirely.
    try:
        if is_image_invalid(db_client, image_hash):
            _log.info("[invalid-image] known-bad hash %s — rejecting early", image_hash[:16])
            _handle_invalid_image(db_client, client_ip, user_id, image_hash)
    except HTTPException:
        raise
    except Exception as exc:
        _log.warning("[invalid-image] pre-check failed: %s", exc)

    # Valid parse cache hit.
    try:
        cached = get_image_parse_cache(db_client, image_hash)
        if cached is not None:
            _log.info("[image-parse-cache] hit for hash %s", image_hash[:16])
            return ParseScreenshotResponse.model_validate(cached)
    except Exception as exc:
        _log.warning("[image-parse-cache] lookup failed: %s", exc)

    # Call Gemini.
    parsed = parse_schedule_image(image_bytes=image_bytes, mime_type=mime_type)

    if not parsed.is_valid_schedule:
        _log.info("[invalid-image] Gemini flagged hash %s as non-schedule", image_hash[:16])
        _handle_invalid_image(db_client, client_ip, user_id, image_hash)

    try:
        upsert_image_parse_cache(db_client, image_hash, parsed.model_dump(mode="json"))
    except Exception as exc:
        _log.warning("[image-parse-cache] write failed: %s", exc)

    return parsed


@router.post("/parse-screenshot", response_model=ParseScreenshotResponse)
async def parse_screenshot(request: Request, file: UploadFile) -> ParseScreenshotResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    client_ip = _get_client_ip(request)
    user_id = _get_optional_user_id(request)
    db_client = get_supabase_client()

    _check_rate_limit(db_client, client_ip, user_id)

    image_bytes = await file.read()
    return _parse_with_cache(image_bytes, file.content_type, client_ip, user_id, db_client)


@router.post("/research-screenshot", response_model=BatchResearchResponse)
async def research_screenshot(
    request: Request,
    file: UploadFile,
    model: str = "claude-sonnet-4.6",
    concurrency: int = 0,
    force_refresh: bool = False,
) -> BatchResearchResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    if concurrency < 0:
        raise HTTPException(status_code=400, detail="concurrency must be 0 or greater")

    client_ip = _get_client_ip(request)
    user_id = _get_optional_user_id(request)
    db_client = get_supabase_client()

    _check_rate_limit(db_client, client_ip, user_id)

    image_bytes = await file.read()

    if force_refresh:
        parsed = parse_schedule_image(image_bytes=image_bytes, mime_type=file.content_type)
        if not parsed.is_valid_schedule:
            _handle_invalid_image(
                db_client, client_ip, user_id, hashlib.sha256(image_bytes).hexdigest()
            )
    else:
        parsed = _parse_with_cache(image_bytes, file.content_type, client_ip, user_id, db_client)

    return await research_courses(
        parsed.courses,
        input_source="image",
        model=model,
        concurrency=concurrency,
        force_refresh=force_refresh,
    )
