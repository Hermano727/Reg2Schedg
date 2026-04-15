"""
Course research orchestration: geocoding, cache lookup, Browser Use runs,
tiered pipeline, known-schedule fast path, and batch coordination.

All Pydantic models live in app.models.research;
Browser Use logic lives in app.services.browser_use;
SunSET computation lives in app.services.sunset;
Normalization lives in app.utils.normalize.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Callable

from dotenv import load_dotenv
from pydantic import ValidationError

from app.db.client import get_supabase_client
from app.db.service import (
    get_course_research_cache,
    get_known_schedule,
    upsert_course_research_cache,
    upsert_known_schedule,
)
from app.db.sunset_db import get_sunset_grade_distribution
from app.models.course_parse import CourseEntry, SectionMeeting
from app.models.research import (
    BatchCostSummary,
    BatchResearchResponse,
    CourseResearchResult,
    CourseResearchRunError,
    CourseLogistics,
    CourseRunCost,
    CourseRunOutcome,
)
from app.services.browser_use import (
    create_browser_use_client,
    resolve_browser_use_api_key,
    run_course_logistics,
)
from app.services.geocode import geocode_location
from app.services.sunset import build_sunset_grade_distribution
from app.utils.normalize import (
    normalize_course_code,
    normalize_professor_name,
    compute_schedule_signature,
)

load_dotenv()

_log = logging.getLogger(__name__)

_REMOTE_LOCATION_PREFIXES = ("RCLAS", "REMOTE", "ONLINE")

# How many days before a cache row is considered stale.
STALE_AFTER_DAYS = 30


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
            normalize_course_code(course.course_code),
            normalize_professor_name(course.professor_name),
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


# ---------------------------------------------------------------------------
# Tiered pipeline (Tier 0-3: free/cheap alternatives to Browser Use)
# ---------------------------------------------------------------------------

async def _no_rmp() -> tuple[None, None]:
    """Placeholder coroutine for when professor_name is unknown."""
    return (None, None)


async def _research_via_tiered_pipeline(
    course_code: str,
    professor_name: str | None,
) -> CourseRunOutcome:
    """
    Execute Tiers 0-3 concurrently (Reddit, RMP, UCSD scrape, Gemini synthesis),
    then Tier 0.5 (Gemini Reddit scoring) sequentially after Tier 0 returns.

    All data-gathering tiers catch their own errors and return empty values — they
    never propagate exceptions.  Only Tier 3 (Gemini synthesis) can raise.
    """
    from app.services.reddit_client import search_reddit_ucsd, score_and_filter_reddit_posts
    from app.services.rmp_client import fetch_rmp_stats
    from app.services.ucsd_scraper import fetch_ucsd_course_description, fetch_ucsd_syllabus_snippets
    from app.services.logistics_synthesizer import synthesize_logistics
    from app.models.research import ResearchRawData

    # Tiers 0-2: run concurrently
    reddit_posts, rmp_result, catalog_result, syllabus_result = await asyncio.gather(
        search_reddit_ucsd(course_code, professor_name=professor_name),
        fetch_rmp_stats(professor_name) if professor_name else _no_rmp(),
        fetch_ucsd_course_description(course_code),
        fetch_ucsd_syllabus_snippets(course_code, professor_name),
    )

    # Tier 0.5: Gemini relevance scoring on Reddit results (sequential — depends on Tier 0)
    reddit_posts, pre_extracted_evidence = await score_and_filter_reddit_posts(
        reddit_posts,
        course_code=course_code,
        professor_name=professor_name,
    )

    rmp_stats, rmp_url = rmp_result if rmp_result else (None, None)
    course_description, catalog_url = catalog_result if catalog_result else (None, None)
    syllabus_snippets, syllabus_url = syllabus_result if syllabus_result else ([], None)

    raw = ResearchRawData(
        course_code=course_code,
        professor_name=professor_name,
        reddit_posts=reddit_posts,
        pre_extracted_reddit_evidence=pre_extracted_evidence,
        rmp_stats=rmp_stats,
        rmp_url=rmp_url,
        ucsd_course_description=course_description,
        ucsd_catalog_url=catalog_url,
        ucsd_syllabus_snippets=syllabus_snippets,
        ucsd_syllabus_url=syllabus_url,
        tier_coverage={
            "reddit": len(reddit_posts) > 0,
            "rmp": rmp_stats is not None,
            "ucsd_catalog": course_description is not None,
            "ucsd_syllabus": len(syllabus_snippets) > 0,
        },
    )

    logistics = await synthesize_logistics(raw)
    return CourseRunOutcome(
        logistics=logistics,
        cost=CourseRunCost(data_source="tiered_pipeline"),
    )


# ---------------------------------------------------------------------------
# Per-course research (cache hit fast path, then tiered or Browser Use)
# ---------------------------------------------------------------------------

async def research_course(
    client: Any,
    cache_client: Any,
    entry: CourseEntry,
    model: str,
    semaphore: asyncio.Semaphore,
    index: int,
    total: int,
    use_browser_use: bool = False,
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

    # --- Cache lookup ---
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
                cache_id=cache_row.id,  # ← canonical ID for v2 plan references
            )
        except ValidationError as exc:
            cache_error = f"Invalid cache row: {exc}"
            if progress:
                progress(f"[{index}/{total}] Ignoring invalid cache row for {label}: {exc}")

    # --- Research (tiered pipeline or Browser Use) ---
    try:
        async with semaphore:
            if use_browser_use and client is not None:
                outcome = await run_course_logistics(
                    client=client,
                    course_code=entry.course_code,
                    instructor=entry.professor_name or None,
                    model=model,
                )
            else:
                outcome = await _research_via_tiered_pipeline(
                    course_code=entry.course_code,
                    professor_name=entry.professor_name or None,
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

    # --- Cache write ---
    cached_at: str | None = None
    saved_cache_id: str | None = None
    try:
        saved_row = upsert_course_research_cache(
            cache_client,
            course_code=entry.course_code,
            professor_name=entry.professor_name or None,
            course_title=entry.course_title or None,
            logistics=outcome.logistics.model_dump(mode="json"),
            model=model,
            data_source=outcome.cost.data_source,
        )
        cached_at = saved_row.updated_at
        saved_cache_id = saved_row.id
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
        cache_id=saved_cache_id,  # ← set after successful upsert
    )


# ---------------------------------------------------------------------------
# Batch orchestration with known-schedule fast path
# ---------------------------------------------------------------------------

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

    cache_client = get_supabase_client()

    # --- Known-schedule fast path ---
    if not force_refresh:
        signature = compute_schedule_signature(
            [(e.course_code, e.professor_name or None) for e in unique_entries]
        )
        try:
            known = get_known_schedule(cache_client, signature)
            if known is not None:
                try:
                    cached_response = BatchResearchResponse.model_validate(known["assembled_payload"])
                    # Validate every result has a cache_id and no error.
                    # A missing cache_id means the course wasn't cached when the snapshot was
                    # taken (e.g. a failed or empty research run). An error field means the
                    # previous run failed. In either case fall through so we re-research with
                    # whatever is now in course_research_cache.
                    all_valid = all(
                        r.cache_id is not None and not r.error
                        for r in cached_response.results
                    )
                    if all_valid:
                        _log.info("[fast-path] known_schedules hit for signature %s", signature[:16])
                        # Re-apply freshly-geocoded meetings from the current parse.
                        # Old snapshots may have been stored before meetings were
                        # included in CourseResearchResult, leaving meetings=[].
                        # Even for up-to-date snapshots this is cheap: enrich_meetings_with_geocode
                        # skips meetings that already have lat/lng, and ensures the
                        # calendar always receives meeting data for the current upload.
                        entry_by_code: dict[str, CourseEntry] = {
                            normalize_course_code(e.course_code): e
                            for e in unique_entries
                        }
                        refreshed: list[CourseResearchResult] = []
                        for r in cached_response.results:
                            entry = entry_by_code.get(normalize_course_code(r.course_code))
                            if entry is not None:
                                geocoded = enrich_meetings_with_geocode(list(entry.meetings))
                                r = r.model_copy(update={"meetings": geocoded})
                            refreshed.append(r)
                        cached_fit = known.get("fit_evaluation")
                        return cached_response.model_copy(update={
                            "results": refreshed,
                            "fit_evaluation": cached_fit,
                        })
                    else:
                        stale = [
                            r.course_code for r in cached_response.results
                            if r.cache_id is None or r.error
                        ]
                        _log.info(
                            "[fast-path] known_schedules snapshot stale for signature %s "
                            "— missing/errored entries: %s — falling through",
                            signature[:16], stale,
                        )
                except Exception as exc:
                    _log.warning("[fast-path] known_schedules validation failed: %s", exc)
        except Exception as exc:
            _log.warning("[fast-path] known_schedules lookup failed: %s", exc)
    else:
        signature = None

    # --- Per-course research ---
    use_browser_use = os.getenv("ENABLE_BROWSER_USE", "false").lower() == "true"
    browser_client = None
    if use_browser_use:
        browser_client = create_browser_use_client(resolve_browser_use_api_key())

    effective_concurrency = len(unique_entries) if concurrency == 0 else min(concurrency, len(unique_entries))
    semaphore = asyncio.Semaphore(effective_concurrency)

    tasks = [
        research_course(
            client=browser_client,
            cache_client=cache_client,
            entry=entry,
            model=model,
            semaphore=semaphore,
            index=index,
            total=len(unique_entries),
            use_browser_use=use_browser_use,
            progress=progress,
            force_refresh=force_refresh,
        )
        for index, entry in enumerate(unique_entries, start=1)
    ]
    results = await asyncio.gather(*tasks)

    response = BatchResearchResponse(
        input_source=input_source,
        course_count=len(results),
        results=list(results),
        cost_summary=summarize_costs(list(results)),
    )

    # --- Write known_schedules for future fast path (only when all courses cached) ---
    if signature is not None and all(r.cache_id is not None for r in results):
        try:
            # Run fit analysis so the difficulty score is cached with the snapshot.
            # This makes the score deterministic for the same set of courses and
            # allows the frontend to skip the /api/fit-analysis Gemini call on hits.
            fit_eval_dict: dict[str, Any] | None = None
            try:
                from app.services.fit_analysis import analyze_fit
                fit_result = analyze_fit(list(results))
                fit_eval_dict = fit_result.model_dump(mode="json")
                _log.info("[fast-path] fit evaluation cached for signature %s", signature[:16])
            except Exception as fit_exc:
                _log.warning("[fast-path] fit evaluation failed, snapshot stored without it: %s", fit_exc)

            upsert_known_schedule(
                cache_client,
                signature=signature,
                assembled_payload=response.model_dump(mode="json"),
                fit_evaluation=fit_eval_dict,
            )
            _log.info("[fast-path] wrote known_schedules signature %s", signature[:16])
        except Exception as exc:
            _log.warning("[fast-path] known_schedules write failed: %s", exc)

    return response
