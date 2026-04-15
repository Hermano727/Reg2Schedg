import hashlib
import logging

from fastapi import APIRouter, HTTPException, UploadFile

from app.db.client import get_supabase_client
from app.db.service import get_image_parse_cache, upsert_image_parse_cache
from app.models.course_parse import ParseScreenshotResponse
from app.models.research import BatchResearchResponse
from app.services.course_research import research_courses
from app.services.screenshot_parser import parse_schedule_image

_log = logging.getLogger(__name__)

router = APIRouter()


def _parse_with_cache(image_bytes: bytes, mime_type: str) -> ParseScreenshotResponse:
    """
    Parse a schedule image, using image_parse_cache to skip Gemini on exact re-uploads.
    SHA-256 of the raw image bytes is used as the cache key.
    """
    image_hash = hashlib.sha256(image_bytes).hexdigest()
    cache_client = get_supabase_client()

    try:
        cached = get_image_parse_cache(cache_client, image_hash)
        if cached is not None:
            _log.info("[image-parse-cache] hit for hash %s", image_hash[:16])
            return ParseScreenshotResponse.model_validate(cached)
    except Exception as exc:
        _log.warning("[image-parse-cache] lookup failed: %s", exc)

    parsed = parse_schedule_image(image_bytes=image_bytes, mime_type=mime_type)

    try:
        upsert_image_parse_cache(cache_client, image_hash, parsed.model_dump(mode="json"))
        _log.info("[image-parse-cache] stored hash %s", image_hash[:16])
    except Exception as exc:
        _log.warning("[image-parse-cache] write failed: %s", exc)

    return parsed


@router.post("/parse-screenshot", response_model=ParseScreenshotResponse)
async def parse_screenshot(file: UploadFile) -> ParseScreenshotResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    return _parse_with_cache(image_bytes, file.content_type)


@router.post("/research-screenshot", response_model=BatchResearchResponse)
async def research_screenshot(
    file: UploadFile,
    model: str = "claude-sonnet-4.6",
    concurrency: int = 0,
    force_refresh: bool = False,
) -> BatchResearchResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    if concurrency < 0:
        raise HTTPException(status_code=400, detail="concurrency must be 0 or greater")

    image_bytes = await file.read()
    # Skip Gemini vision entirely for exact duplicate images unless force_refresh.
    if force_refresh:
        parsed = parse_schedule_image(image_bytes=image_bytes, mime_type=file.content_type)
    else:
        parsed = _parse_with_cache(image_bytes, file.content_type)

    return await research_courses(
        parsed.courses,
        input_source="image",
        model=model,
        concurrency=concurrency,
        force_refresh=force_refresh,
    )
