"""
Supabase service layer: plan CRUD, course research cache, known_schedules,
saved_plan_classes, and campus building lookup.
Community operations live in app.db.community.
SunSET queries live in app.db.sunset_db.

Normalization is always performed through app.utils.normalize — never inline —
so that cache keys are identical everywhere.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

_log = logging.getLogger(__name__)

# How long a known_schedules snapshot is trusted before we fall through to
# per-course cache lookups. Keep this at or below STALE_AFTER_DAYS in
# course_research.py so the underlying cache entries always outlive the snapshot.
KNOWN_SCHEDULE_TTL_DAYS = 14

from supabase import Client

from app.models.domain import CourseResearchCacheRow
from app.models.plan import SavedPlanCreate
from app.utils.normalize import normalize_course_code, normalize_professor_name, normalize_professor_name_loose


# ---------------------------------------------------------------------------
# Campus building search
# ---------------------------------------------------------------------------

def search_campus_building(client: Client, raw_location: str) -> dict[str, Any] | None:
    """
    Search campus_buildings table for a building matching the raw location string.

    Resolution order:
      1. Exact code match (e.g. 'CENTR', 'WLH')
      2. display_name ILIKE match, tried token-by-token (e.g. 'Peterson Hall 110')
    """
    import re
    normalized = re.sub(r"[^\w\s]", "", raw_location.upper()).strip()
    tokens = normalized.split()

    # 1. Exact code match on each token (building codes are short uppercase strings)
    for token in tokens:
        resp = (
            client.table("campus_buildings")
            .select("code,display_name,lat,lng")
            .eq("code", token)
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0]

    # 2. display_name ILIKE match, token-by-token (skip short tokens)
    for token in tokens:
        if len(token) < 4:
            continue
        resp = (
            client.table("campus_buildings")
            .select("code,display_name,lat,lng")
            .ilike("display_name", f"%{token}%")
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0]

    return None


# Keep old name as alias for any callers not yet updated
def search_campus_building_by_name(client: Client, raw_location: str) -> dict[str, Any] | None:
    return search_campus_building(client, raw_location)


# ---------------------------------------------------------------------------
# Saved plans
# ---------------------------------------------------------------------------

def insert_saved_plan(client: Client, user_id: str, body: SavedPlanCreate) -> dict[str, Any]:
    row = {
        "user_id": user_id,
        "title": body.title,
        "quarter_label": body.quarter_label,
        "status": body.status,
        "payload_version": body.payload_version,
        "payload": body.payload,
        "source_image_path": body.source_image_path,
    }
    response = client.table("saved_plans").insert(row).execute()
    if not response.data:
        raise RuntimeError("saved_plans insert returned no data")
    return response.data[0]


def get_saved_plan(client: Client, plan_id: str) -> dict[str, Any] | None:
    """Fetch a single saved_plan row by ID (RLS enforced by client auth)."""
    resp = (
        client.table("saved_plans")
        .select("*")
        .eq("id", plan_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None
    return resp.data[0]


# ---------------------------------------------------------------------------
# Course research cache
# ---------------------------------------------------------------------------

def _swap_name_order(norm_prof: str) -> str | None:
    """
    If norm_prof is in 'LAST, FIRST' format, return 'FIRST LAST' (no comma).
    If it's already 'FIRST LAST' (no comma), return 'LAST, FIRST' equivalent attempt.
    Returns None if no useful swap can be produced.

    This handles the mismatch between WebReg-style 'Krishnan, Viswanathan'
    (normalises to 'KRISHNAN, VISWANATHAN') and scraped/stored 'Viswanathan Krishnan'
    (normalises to 'VISWANATHAN KRISHNAN').
    """
    if "," in norm_prof:
        # "KRISHNAN, VISWANATHAN" → "VISWANATHAN KRISHNAN"
        last, rest = norm_prof.split(",", 1)
        rest = rest.strip()
        last = last.strip()
        if rest:
            return f"{rest} {last}"
    else:
        # "VISWANATHAN KRISHNAN" — try "KRISHNAN, VISWANATHAN" swap
        parts = norm_prof.split()
        if len(parts) >= 2:
            return f"{parts[-1]}, {' '.join(parts[:-1])}"
    return None


def _split_professor_name(value: str | None) -> tuple[str, str]:
    normalized = normalize_professor_name(value)
    if not normalized:
        return "", ""
    if "," in normalized:
        last_name, remainder = normalized.split(",", 1)
        parts = [part.rstrip(".") for part in remainder.strip().split() if part]
        first_name = parts[0] if parts else ""
        return last_name.strip(), first_name
    parts = [part.rstrip(".") for part in normalized.split() if part]
    if len(parts) == 1:
        return parts[0], ""
    return parts[-1], parts[0]


def _professor_match_score(requested: str | None, candidate: str | None) -> int:
    req = normalize_professor_name(requested)
    cand = normalize_professor_name(candidate)
    if not req:
        return 4 if not cand else 0
    if not cand:
        return 0

    req_loose = normalize_professor_name_loose(req)
    cand_loose = normalize_professor_name_loose(cand)
    if req_loose and req_loose == cand_loose:
        return 4

    req_last, req_first = _split_professor_name(req_loose or req)
    cand_last, cand_first = _split_professor_name(cand_loose or cand)
    if req_last and req_last == cand_last:
        if req_first and cand_first:
            if req_first == cand_first:
                return 3
            if req_first.startswith(cand_first) or cand_first.startswith(req_first):
                return 2
            if req_first[0] == cand_first[0]:
                return 1
        return 1
    return 0


def _cache_row_quality_key(row: CourseResearchCacheRow) -> tuple[int, int, int, int]:
    logistics = row.logistics if isinstance(row.logistics, dict) else {}
    rmp = logistics.get("rate_my_professor") or {}
    has_rmp = any(
        rmp.get(field) not in (None, "")
        for field in ("rating", "difficulty", "would_take_again_percent", "url")
    )
    evidence = logistics.get("evidence") or []
    professor_info_found = logistics.get("professor_info_found")
    has_course_page = bool(logistics.get("course_webpage_url"))
    return (
        1 if has_rmp else 0,
        1 if professor_info_found is not False else 0,
        len(evidence),
        1 if has_course_page else 0,
    )


def _select_best_cache_row(
    rows: list[CourseResearchCacheRow],
    professor_name: str | None,
) -> CourseResearchCacheRow | None:
    ranked: list[tuple[int, tuple[int, int, int, int], str, CourseResearchCacheRow]] = []
    for row in rows:
        score = _professor_match_score(professor_name, row.professor_name)
        if score <= 0:
            continue
        ranked.append((score, _cache_row_quality_key(row), row.updated_at or "", row))
    if not ranked:
        return None
    ranked.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    return ranked[0][3]


def _choose_canonical_professor_name(
    existing: str | None,
    incoming: str | None,
) -> str:
    existing_norm = normalize_professor_name(existing)
    incoming_norm = normalize_professor_name(incoming)
    if not existing_norm:
        return incoming or ""
    if not incoming_norm:
        return existing or ""
    if normalize_professor_name_loose(existing_norm) != normalize_professor_name_loose(incoming_norm):
        return existing or incoming or ""
    return (incoming or "") if len(incoming_norm) > len(existing_norm) else (existing or "")


def get_course_research_cache(
    client: Client,
    *,
    course_code: str,
    professor_name: str | None,
) -> CourseResearchCacheRow | None:
    norm_code = normalize_course_code(course_code)
    norm_prof = normalize_professor_name(professor_name)

    if not norm_prof:
        response = (
            client.table("course_research_cache")
            .select("*")
            .eq("normalized_course_code", norm_code)
            .eq("normalized_professor_name", "")
            .limit(1)
            .execute()
        )
        if response.data:
            return CourseResearchCacheRow.model_validate(response.data[0])
        return None

    response = (
        client.table("course_research_cache")
        .select("*")
        .eq("normalized_course_code", norm_code)
        .order("updated_at", desc=True)
        .limit(200)
        .execute()
    )
    rows = [CourseResearchCacheRow.model_validate(row) for row in (response.data or [])]
    return _select_best_cache_row(rows, professor_name)


def get_course_research_cache_by_id(
    client: Client,
    cache_id: str,
) -> CourseResearchCacheRow | None:
    """Fetch a cache row by its UUID — used for plan expansion."""
    resp = (
        client.table("course_research_cache")
        .select("*")
        .eq("id", cache_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None
    return CourseResearchCacheRow.model_validate(resp.data[0])


def search_course_research_cache(
    client: Client,
    *,
    course_code: str,
    professor_name: str | None = None,
    limit: int = 30,
) -> list[CourseResearchCacheRow]:
    """Return cached entries for a normalized course code or prefix.

    If professor_name is given, applies an ILIKE filter on normalized_professor_name
    so partial names (e.g. "smith") still match.
    """
    norm_code = normalize_course_code(course_code)
    query = (
        client.table("course_research_cache")
        .select("id,course_code,course_title,professor_name,normalized_professor_name,updated_at,data_source,normalized_course_code,model,logistics")
        .neq("professor_name", "")
        .not_.is_("professor_name", "null")
        .order("updated_at", desc=True)
        .limit(limit)
    )
    if " " in norm_code:
        query = query.eq("normalized_course_code", norm_code)
    else:
        query = query.ilike("normalized_course_code", f"{norm_code}%")

    if professor_name:
        norm_prof = normalize_professor_name(professor_name)
        query = query.ilike("normalized_professor_name", f"%{norm_prof}%")

    resp = query.execute()
    return [CourseResearchCacheRow.model_validate(row) for row in (resp.data or [])]


def upsert_course_research_cache(
    client: Client,
    *,
    course_code: str,
    professor_name: str | None,
    course_title: str | None,
    logistics: dict[str, Any],
    model: str | None,
    data_source: str = "tiered_pipeline",
) -> CourseResearchCacheRow:
    existing = get_course_research_cache(
        client,
        course_code=course_code,
        professor_name=professor_name,
    )

    canonical_professor_name = _choose_canonical_professor_name(
        existing.professor_name if existing else None,
        professor_name,
    )
    row = {
        "course_code": course_code,
        "professor_name": canonical_professor_name,
        "course_title": course_title or None,
        "normalized_course_code": normalize_course_code(course_code),
        "normalized_professor_name": normalize_professor_name(canonical_professor_name),
        "logistics": logistics,
        "model": model,
        "data_source": data_source,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing is not None:
        response = (
            client.table("course_research_cache")
            .update(row)
            .eq("id", existing.id)
            .execute()
        )
        if response.data:
            return CourseResearchCacheRow.model_validate(response.data[0])
        saved_row = get_course_research_cache_by_id(client, existing.id)
        if saved_row is None:
            raise RuntimeError("course_research_cache update succeeded but lookup returned no row")
        return saved_row

    client.table("course_research_cache").upsert(
        row,
        on_conflict="normalized_course_code,normalized_professor_name",
    ).execute()

    saved_row = get_course_research_cache(
        client,
        course_code=course_code,
        professor_name=canonical_professor_name,
    )
    if saved_row is None:
        raise RuntimeError("course_research_cache upsert succeeded but lookup returned no row")
    return saved_row


# ---------------------------------------------------------------------------
# Known schedules (zero-call fast path)
# ---------------------------------------------------------------------------

def get_image_parse_cache(
    client: Client,
    image_hash: str,
) -> dict[str, Any] | None:
    """Return the cached parse_result dict for an image hash, or None."""
    resp = (
        client.table("image_parse_cache")
        .select("parse_result")
        .eq("image_hash", image_hash)
        .limit(1)
        .execute()
    )
    return resp.data[0]["parse_result"] if resp.data else None


def upsert_image_parse_cache(
    client: Client,
    image_hash: str,
    parse_result: dict[str, Any],
) -> None:
    """Store a ParseScreenshotResponse dict keyed by image SHA-256 hash."""
    client.table("image_parse_cache").upsert(
        {"image_hash": image_hash, "parse_result": parse_result},
        on_conflict="image_hash",
    ).execute()


# ---------------------------------------------------------------------------
# Invalid file detection + rate limiting
# ---------------------------------------------------------------------------

INVALID_RATE_LIMIT_WINDOW_MINUTES = 10
INVALID_RATE_LIMIT_COUNT = 3


def is_file_invalid(client: Client, file_hash: str) -> bool:
    """Return True if this file hash is already known to be invalid."""
    resp = (
        client.table("invalid_images")
        .select("image_hash")
        .eq("image_hash", file_hash)
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def mark_file_invalid(client: Client, file_hash: str) -> None:
    """Record a new known-invalid file hash (ignores duplicates)."""
    client.table("invalid_images").upsert(
        {"image_hash": file_hash},
        on_conflict="image_hash",
    ).execute()


# Backward-compatible aliases
is_image_invalid = is_file_invalid
mark_image_invalid = mark_file_invalid


def log_invalid_submission(
    client: Client,
    client_ip: str,
    file_hash: str | None,
    user_id: str | None = None,
) -> None:
    """Append one invalid-submission entry for rate-limit tracking.
    Stores user_id when available so per-account limits apply instead of per-IP.
    """
    client.table("invalid_submission_log").insert(
        {"client_ip": client_ip, "image_hash": file_hash, "user_id": user_id or None}
    ).execute()


def get_timeout_remaining_seconds(
    client: Client,
    client_ip: str,
    user_id: str | None = None,
) -> int:
    """
    Return seconds remaining in the 10-minute timeout, or 0 if not timed out.

    When user_id is provided, limits are scoped to that account (preferred).
    Falls back to client_ip for unauthenticated requests.

    Timeout kicks in when INVALID_RATE_LIMIT_COUNT invalids exist within the
    window; expires 10 minutes after the most recent one in that group.
    """
    cutoff = (
        datetime.now(timezone.utc) - timedelta(minutes=INVALID_RATE_LIMIT_WINDOW_MINUTES)
    ).isoformat()

    q = (
        client.table("invalid_submission_log")
        .select("submitted_at")
        .gte("submitted_at", cutoff)
        .order("submitted_at", desc=True)
        .limit(INVALID_RATE_LIMIT_COUNT)
    )
    if user_id:
        q = q.eq("user_id", user_id)
    else:
        q = q.eq("client_ip", client_ip)

    resp = q.execute()
    rows = resp.data or []
    if len(rows) < INVALID_RATE_LIMIT_COUNT:
        return 0

    most_recent_str = rows[0]["submitted_at"]
    try:
        most_recent = datetime.fromisoformat(most_recent_str.replace("Z", "+00:00"))
    except ValueError:
        return 0
    timeout_until = most_recent + timedelta(minutes=INVALID_RATE_LIMIT_WINDOW_MINUTES)
    remaining = (timeout_until - datetime.now(timezone.utc)).total_seconds()
    return max(0, int(remaining))


def get_known_schedule(
    client: Client,
    signature: str,
) -> dict[str, Any] | None:
    """
    Return the assembled_payload (and fit_evaluation if present) for a known
    schedule signature, or None.

    The assembled_payload is a serialized BatchResearchResponse (dict).
    Returns None if the entry is older than KNOWN_SCHEDULE_TTL_DAYS.
    """
    resp = (
        client.table("known_schedules")
        .select("assembled_payload,fit_evaluation,updated_at")
        .eq("signature", signature)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None

    row = resp.data[0]
    updated_at_str = row.get("updated_at")
    if updated_at_str:
        try:
            updated_dt = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
            age = datetime.now(timezone.utc) - updated_dt
            if age > timedelta(days=KNOWN_SCHEDULE_TTL_DAYS):
                _log.info(
                    "known_schedules entry expired (%d days old, TTL=%d) for signature %s",
                    age.days, KNOWN_SCHEDULE_TTL_DAYS, signature[:16],
                )
                return None
        except Exception:
            pass

    return row


def upsert_known_schedule(
    client: Client,
    signature: str,
    assembled_payload: dict[str, Any],
    plan_id: str | None = None,
    fit_evaluation: dict[str, Any] | None = None,
) -> None:
    """Write or overwrite a known_schedules row."""
    row: dict[str, Any] = {
        "signature": signature,
        "assembled_payload": assembled_payload,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if plan_id is not None:
        row["plan_id"] = plan_id
    if fit_evaluation is not None:
        row["fit_evaluation"] = fit_evaluation
    client.table("known_schedules").upsert(row, on_conflict="signature").execute()


# ---------------------------------------------------------------------------
# Saved plan classes (v2 join rows)
# ---------------------------------------------------------------------------

def get_saved_plan_classes(
    client: Client,
    plan_id: str,
) -> list[dict[str, Any]]:
    """
    Return all saved_plan_classes rows for a given plan, ordered by created_at.
    Each row includes: id, plan_id, course_cache_id, course_code, professor_name,
    meetings, overrides, created_at.
    """
    resp = (
        client.table("saved_plan_classes")
        .select("*")
        .eq("plan_id", plan_id)
        .order("created_at", desc=False)
        .execute()
    )
    return resp.data or []


def replace_saved_plan_classes(
    client: Client,
    plan_id: str,
    class_rows: list[dict[str, Any]],
) -> None:
    """
    Atomically replace all saved_plan_classes rows for a plan.
    Deletes existing rows, then inserts new ones.

    Each dict in class_rows must have:
        course_cache_id: str (UUID)
        course_code: str
        professor_name: str | None
        meetings: list (will be stored as JSONB)
        overrides: dict (optional, defaults to {})
    """
    # Delete existing
    client.table("saved_plan_classes").delete().eq("plan_id", plan_id).execute()

    if not class_rows:
        return

    rows_to_insert = [
        {
            "plan_id": plan_id,
            "course_cache_id": row["course_cache_id"],
            "course_code": row["course_code"],
            "professor_name": row.get("professor_name") or None,
            "meetings": row.get("meetings", []),
            "overrides": row.get("overrides", {}),
        }
        for row in class_rows
    ]
    client.table("saved_plan_classes").insert(rows_to_insert).execute()
