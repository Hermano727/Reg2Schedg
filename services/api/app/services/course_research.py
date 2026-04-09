"""
Course research orchestration: geocoding, cache lookup, Browser Use runs,
and batch coordination. All Pydantic models live in app.models.research;
Browser Use logic lives in app.services.browser_use; SunSET computation
lives in app.services.sunset.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from dotenv import load_dotenv
from pydantic import ValidationError

from app.db.client import get_supabase_client
from app.db.service import get_course_research_cache, upsert_course_research_cache
from app.db.sunset_db import get_sunset_grade_distribution
from app.models.course_parse import CourseEntry, SectionMeeting
from app.models.research import (
    BatchCostSummary,
    BatchResearchResponse,
    CourseResearchResult,
    CourseResearchRunError,
    CourseLogistics,
)
from app.services.browser_use import (
    create_browser_use_client,
    resolve_browser_use_api_key,
    run_course_logistics,
)
from app.services.geocode import geocode_location
from app.services.sunset import build_sunset_grade_distribution

load_dotenv()

_log = logging.getLogger(__name__)

_REMOTE_LOCATION_PREFIXES = ("RCLAS", "REMOTE", "ONLINE")


def _is_remote_location(location: str) -> bool:
    upper = location.strip().upper()
    return any(upper.startswith(prefix) for prefix in _REMOTE_LOCATION_PREFIXES)


def enrich_meetings_with_geocode(meetings: list[SectionMeeting]) -> list[SectionMeeting]:
    """Attach lat/lng/building_code to each meeting that has a non-empty location string."""
    enriched = []
    for meeting in meetings:
        if meeting.location and _is_remote_location(meeting.location):
            _log.info(
                "[geocode] remote     location=%r section_type=%r — no physical pin",
                meeting.location, meeting.section_type,
            )
            meeting = meeting.model_copy(update={"geocode_status": "remote"})
        elif meeting.location and meeting.lat is None:
            _log.info("[geocode] resolving meeting location=%r section_type=%r", meeting.location, meeting.section_type)
            result = geocode_location(meeting.location)
            if result:
                _log.info(
                    "[geocode] resolved  location=%r → code=%s provider=%s (%.5f, %.5f)",
                    meeting.location, result.building_code, result.provider, result.lat, result.lng,
                )
                meeting = meeting.model_copy(update={
                    "building_code": result.building_code,
                    "lat": result.lat,
                    "lng": result.lng,
                    "geocode_status": result.status,
                })
            else:
                _log.warning("[geocode] FAILED    location=%r section_type=%r — marker will be hidden", meeting.location, meeting.section_type)
                meeting = meeting.model_copy(update={"geocode_status": "unresolved"})
        elif meeting.lat is not None:
            _log.info("[geocode] skipped   location=%r — lat/lng already set by backend", meeting.location)
        enriched.append(meeting)
    return enriched


def dedupe_courses(courses: list[CourseEntry]) -> list[CourseEntry]:
    deduped: dict[tuple[str, str], CourseEntry] = {}
    for course in courses:
        key = (
            " ".join(course.course_code.upper().split()),
            " ".join(course.professor_name.upper().split()),
        )
        deduped.setdefault(key, course)
    return list(deduped.values())


def summarize_costs(results: list[CourseResearchResult]) -> BatchCostSummary:
    summary = BatchCostSummary(run_count=len(results))
    for result in results:
        if not result.cost:
            continue
        summary.llm_cost_usd += result.cost.llm_cost_usd or 0.0
        summary.browser_cost_usd += result.cost.browser_cost_usd or 0.0
        summary.proxy_cost_usd += result.cost.proxy_cost_usd or 0.0
        summary.total_cost_usd += result.cost.total_cost_usd or 0.0
    return summary


async def research_course(
    client: Any,
    cache_client: Any,
    entry: CourseEntry,
    model: str,
    semaphore: asyncio.Semaphore,
    index: int,
    total: int,
    progress: Callable[[str], None] | None = None,
    force_refresh: bool = False,
) -> CourseResearchResult:
    label = entry.course_code if not entry.professor_name else f"{entry.course_code} / {entry.professor_name}"
    cache_error: str | None = None

    if progress:
        progress(f"[{index}/{total}] Researching {label}")

    geocoded_meetings = enrich_meetings_with_geocode(list(entry.meetings))

    sunset_grade_distribution = None
    try:
        sunset_row, is_cross_course = get_sunset_grade_distribution(
            cache_client,
            course_code=entry.course_code,
            professor_name=entry.professor_name or None,
        )
        sunset_grade_distribution = build_sunset_grade_distribution(
            sunset_row,
            is_cross_course_fallback=is_cross_course,
            source_course_code=sunset_row.course_code if (is_cross_course and sunset_row) else None,
        )
        if is_cross_course and sunset_row and progress:
            progress(
                f"[{index}/{total}] SunSET cross-course fallback for {label}: "
                f"using {sunset_row.course_code} / {sunset_row.professor_name}"
            )
    except Exception as exc:
        if progress:
            progress(f"[{index}/{total}] SunSET lookup failed for {label}: {exc}")

    cache_row = None
    try:
        cache_row = get_course_research_cache(
            cache_client,
            course_code=entry.course_code,
            professor_name=entry.professor_name or None,
        )
    except Exception as exc:
        cache_error = f"Cache lookup failed: {exc}"
        if progress:
            progress(f"[{index}/{total}] Cache lookup failed for {label}: {exc}")

    if cache_row is not None and not force_refresh:
        try:
            cached_logistics = CourseLogistics.model_validate(cache_row.logistics)
            if progress:
                progress(f"[{index}/{total}] Cache hit for {label}")
            return CourseResearchResult(
                course_code=entry.course_code,
                course_title=entry.course_title or None,
                professor_name=entry.professor_name or None,
                meetings=geocoded_meetings,
                logistics=cached_logistics,
                sunset_grade_distribution=sunset_grade_distribution,
                cache_hit=True,
                cached_at=cache_row.updated_at,
                cache_error=cache_error,
            )
        except ValidationError as exc:
            cache_error = f"Invalid cache row: {exc}"
            if progress:
                progress(f"[{index}/{total}] Ignoring invalid cache row for {label}: {exc}")

    try:
        async with semaphore:
            outcome = await run_course_logistics(
                client=client,
                course_code=entry.course_code,
                instructor=entry.professor_name or None,
                model=model,
            )
    except CourseResearchRunError as exc:
        if progress:
            progress(f"[{index}/{total}] Failed {label}: {exc}")
        return CourseResearchResult(
            course_code=entry.course_code,
            course_title=entry.course_title or None,
            professor_name=entry.professor_name or None,
            meetings=geocoded_meetings,
            sunset_grade_distribution=sunset_grade_distribution,
            cache_error=cache_error,
            cost=exc.cost,
            error=str(exc),
        )
    except Exception as exc:
        if progress:
            progress(f"[{index}/{total}] Failed {label}: {exc}")
        return CourseResearchResult(
            course_code=entry.course_code,
            course_title=entry.course_title or None,
            professor_name=entry.professor_name or None,
            meetings=geocoded_meetings,
            sunset_grade_distribution=sunset_grade_distribution,
            cache_error=cache_error,
            error=str(exc),
        )

    cached_at: str | None = None
    try:
        saved_row = upsert_course_research_cache(
            cache_client,
            course_code=entry.course_code,
            professor_name=entry.professor_name or None,
            course_title=entry.course_title or None,
            logistics=outcome.logistics.model_dump(mode="json"),
            model=model,
        )
        cached_at = saved_row.updated_at
    except Exception as exc:
        cache_error = f"Cache write failed: {exc}"
        if progress:
            progress(f"[{index}/{total}] Cache write failed for {label}: {exc}")

    if progress:
        progress(f"[{index}/{total}] Finished {label}")

    return CourseResearchResult(
        course_code=entry.course_code,
        course_title=entry.course_title or None,
        professor_name=entry.professor_name or None,
        meetings=geocoded_meetings,
        logistics=outcome.logistics,
        sunset_grade_distribution=sunset_grade_distribution,
        cache_hit=False,
        cached_at=cached_at,
        cache_error=cache_error,
        cost=outcome.cost,
    )


async def research_courses(
    entries: list[CourseEntry],
    *,
    input_source: str,
    model: str = "claude-sonnet-4.6",
    concurrency: int = 0,
    progress: Callable[[str], None] | None = None,
    force_refresh: bool = False,
) -> BatchResearchResponse:
    if concurrency < 0:
        raise RuntimeError("Concurrency must be 0 or greater.")

    unique_entries = dedupe_courses(entries)
    if not unique_entries:
        raise RuntimeError("No courses were found to research.")

    effective_concurrency = len(unique_entries) if concurrency == 0 else min(concurrency, len(unique_entries))
    client = create_browser_use_client(resolve_browser_use_api_key())
    cache_client = get_supabase_client()
    semaphore = asyncio.Semaphore(effective_concurrency)
    tasks = [
        research_course(
            client=client,
            cache_client=cache_client,
            entry=entry,
            model=model,
            semaphore=semaphore,
            index=index,
            total=len(unique_entries),
            progress=progress,
            force_refresh=force_refresh,
        )
        for index, entry in enumerate(unique_entries, start=1)
    ]
    results = await asyncio.gather(*tasks)
    return BatchResearchResponse(
        input_source=input_source,
        course_count=len(results),
        results=list(results),
        cost_summary=summarize_costs(list(results)),
    )
