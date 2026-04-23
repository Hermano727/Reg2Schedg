import hashlib
import logging

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.auth.jwt import verify_access_token
from app.db.client import get_supabase_client
from app.db.service import (
    get_course_research_cache_by_id,
    get_image_parse_cache,
    get_timeout_remaining_seconds,
    is_file_invalid,
    log_invalid_submission,
    mark_file_invalid,
    search_course_research_cache,
    upsert_image_parse_cache,
    INVALID_RATE_LIMIT_WINDOW_MINUTES,
)
from app.models.course_parse import CourseEntry, ParseScreenshotResponse
from app.models.research import BatchResearchResponse, CourseLogistics, CourseResearchResult
from app.services.course_research import research_courses
from app.services.sunset import build_sunset_grade_distribution
from app.db.sunset_db import get_sunset_grade_distribution
from app.services.screenshot_parser import parse_schedule_file, is_supported_mime_type

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


def _handle_invalid_file(
    db_client, client_ip: str, user_id: str | None, file_hash: str
) -> None:
    """Record an invalid submission, then re-check for timeout threshold and raise."""
    try:
        mark_file_invalid(db_client, file_hash)
        log_invalid_submission(db_client, client_ip, file_hash, user_id)
    except Exception as exc:
        _log.warning("[invalid-file] db write failed: %s", exc)

    try:
        remaining = get_timeout_remaining_seconds(db_client, client_ip, user_id)
        if remaining > 0:
            minutes = (remaining + 59) // 60
            who = "account" if user_id else "IP"
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "RATE_LIMITED",
                    "message": (
                        f"Too many invalid uploads. Your {who} has been temporarily blocked "
                        f"for {minutes} minute(s). Upload a valid WebReg schedule to continue."
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
                "The uploaded file doesn't appear to contain a UCSD WebReg schedule. "
                "Please upload a WebReg schedule screenshot or PDF export (list view or calendar view)."
            ),
        },
    )


def _parse_with_cache(
    file_bytes: bytes,
    mime_type: str,
    client_ip: str,
    user_id: str | None,
    db_client,
) -> ParseScreenshotResponse:
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    # Known-invalid hash → skip Gemini entirely.
    try:
        if is_file_invalid(db_client, file_hash):
            _log.info("[invalid-file] known-bad hash %s — rejecting early", file_hash[:16])
            _handle_invalid_file(db_client, client_ip, user_id, file_hash)
    except HTTPException:
        raise
    except Exception as exc:
        _log.warning("[invalid-file] pre-check failed: %s", exc)

    # Valid parse cache hit.
    try:
        cached = get_image_parse_cache(db_client, file_hash)
        if cached is not None:
            _log.info("[file-parse-cache] hit for hash %s", file_hash[:16])
            return ParseScreenshotResponse.model_validate(cached)
    except Exception as exc:
        _log.warning("[file-parse-cache] lookup failed: %s", exc)

    # Call Gemini.
    parsed = parse_schedule_file(file_bytes=file_bytes, mime_type=mime_type)

    if not parsed.is_valid_schedule:
        _log.info("[invalid-file] Gemini flagged hash %s as non-schedule", file_hash[:16])
        _handle_invalid_file(db_client, client_ip, user_id, file_hash)

    try:
        upsert_image_parse_cache(db_client, file_hash, parsed.model_dump(mode="json"))
    except Exception as exc:
        _log.warning("[file-parse-cache] write failed: %s", exc)

    return parsed


def _validate_upload_mime_type(content_type: str | None) -> None:
    if not content_type or not is_supported_mime_type(content_type):
        raise HTTPException(
            status_code=400,
            detail="File must be an image (PNG, JPEG, WebP, etc.) or a PDF.",
        )


@router.post("/parse-screenshot", response_model=ParseScreenshotResponse)
async def parse_screenshot(request: Request, file: UploadFile) -> ParseScreenshotResponse:
    _validate_upload_mime_type(file.content_type)

    client_ip = _get_client_ip(request)
    user_id = _get_optional_user_id(request)
    db_client = get_supabase_client()

    _check_rate_limit(db_client, client_ip, user_id)

    file_bytes = await file.read()
    return _parse_with_cache(file_bytes, file.content_type, client_ip, user_id, db_client)


@router.post("/research-screenshot", response_model=BatchResearchResponse)
async def research_screenshot(
    request: Request,
    file: UploadFile,
    model: str = "claude-sonnet-4.6",
    concurrency: int = 0,
    force_refresh: bool = False,
) -> BatchResearchResponse:
    _validate_upload_mime_type(file.content_type)
    if concurrency < 0:
        raise HTTPException(status_code=400, detail="concurrency must be 0 or greater")

    client_ip = _get_client_ip(request)
    user_id = _get_optional_user_id(request)
    db_client = get_supabase_client()

    _check_rate_limit(db_client, client_ip, user_id)

    file_bytes = await file.read()

    if force_refresh:
        parsed = parse_schedule_file(file_bytes=file_bytes, mime_type=file.content_type)
        if not parsed.is_valid_schedule:
            _handle_invalid_file(
                db_client, client_ip, user_id, hashlib.sha256(file_bytes).hexdigest()
            )
    else:
        parsed = _parse_with_cache(file_bytes, file.content_type, client_ip, user_id, db_client)

    return await research_courses(
        parsed.courses,
        input_source="file",
        model=model,
        concurrency=concurrency,
        force_refresh=force_refresh,
    )


class CourseLookupSearchResult(BaseModel):
    cache_id: str
    course_code: str
    course_title: str | None
    professor_name: str
    updated_at: str


class CourseLookupResearchRequest(BaseModel):
    course_code: str
    professor_name: str | None = None


@router.get("/lookup-course/search", response_model=list[CourseLookupSearchResult])
def lookup_course_search(
    course_code: str,
    professor_name: str | None = None,
) -> list[CourseLookupSearchResult]:
    """Return all cached entries for a course code (fast, no pipeline)."""
    code = course_code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="course_code is required.")
    client = get_supabase_client()
    rows = search_course_research_cache(
        client,
        course_code=code,
        professor_name=professor_name.strip() if professor_name else None,
    )
    return [
        CourseLookupSearchResult(
            cache_id=r.id,
            course_code=r.course_code,
            course_title=r.course_title,
            professor_name=r.professor_name or "TBA",
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.get("/lookup-course/{cache_id}", response_model=CourseResearchResult)
def lookup_course_by_id(cache_id: str) -> CourseResearchResult:
    """Expand a cache entry into a full CourseResearchResult (logistics + sunset)."""
    client = get_supabase_client()
    row = get_course_research_cache_by_id(client, cache_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Cache entry not found.")

    try:
        logistics = CourseLogistics.model_validate(row.logistics)
    except Exception:
        logistics = None

    professor_name = row.professor_name or None
    try:
        sunset_row, is_fallback = get_sunset_grade_distribution(
            client,
            course_code=row.course_code,
            professor_name=professor_name,
        )
        sunset_dist = build_sunset_grade_distribution(
            sunset_row,
            is_cross_course_fallback=is_fallback,
            source_course_code=row.course_code if is_fallback else None,
        )
    except Exception:
        sunset_dist = None

    return CourseResearchResult(
        course_code=row.course_code,
        course_title=row.course_title,
        professor_name=professor_name,
        meetings=[],
        logistics=logistics,
        sunset_grade_distribution=sunset_dist,
        cache_hit=True,
        cached_at=row.updated_at,
        cache_id=row.id,
    )


@router.post("/lookup-course/research", response_model=CourseResearchResult)
async def lookup_course_research(body: CourseLookupResearchRequest) -> CourseResearchResult:
    """Run the full research pipeline for a course not yet in cache."""
    course_code = body.course_code.strip()
    if not course_code:
        raise HTTPException(status_code=400, detail="course_code is required.")

    entry = CourseEntry(
        course_code=course_code,
        course_title=course_code,
        professor_name=body.professor_name or "",
        meetings=[],
    )
    batch = await research_courses([entry], input_source="lookup")
    if not batch.results:
        raise HTTPException(status_code=404, detail="No research results returned.")
    return batch.results[0]
