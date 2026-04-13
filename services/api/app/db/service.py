"""
Supabase service layer: plan CRUD, course research cache, known_schedules,
saved_plan_classes, and campus building lookup.
Community operations live in app.db.community.
SunSET queries live in app.db.sunset_db.

Normalization is always performed through app.utils.normalize — never inline —
so that cache keys are identical everywhere.
"""

from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.models.domain import CourseResearchCacheRow
from app.models.plan import SavedPlanCreate
from app.utils.normalize import normalize_course_code, normalize_professor_name


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

def get_course_research_cache(
    client: Client,
    *,
    course_code: str,
    professor_name: str | None,
) -> CourseResearchCacheRow | None:
    response = (
        client.table("course_research_cache")
        .select("*")
        .eq("normalized_course_code", normalize_course_code(course_code))
        .eq("normalized_professor_name", normalize_professor_name(professor_name))
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return CourseResearchCacheRow.model_validate(response.data[0])


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
    row = {
        "course_code": course_code,
        "professor_name": professor_name or "",
        "course_title": course_title or None,
        "normalized_course_code": normalize_course_code(course_code),
        "normalized_professor_name": normalize_professor_name(professor_name),
        "logistics": logistics,
        "model": model,
        "data_source": data_source,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    client.table("course_research_cache").upsert(
        row,
        on_conflict="normalized_course_code,normalized_professor_name",
    ).execute()

    saved_row = get_course_research_cache(
        client,
        course_code=course_code,
        professor_name=professor_name,
    )
    if saved_row is None:
        raise RuntimeError("course_research_cache upsert succeeded but lookup returned no row")
    return saved_row


# ---------------------------------------------------------------------------
# Known schedules (zero-call fast path)
# ---------------------------------------------------------------------------

def get_known_schedule(
    client: Client,
    signature: str,
) -> dict[str, Any] | None:
    """
    Return the assembled_payload for a known schedule signature, or None.

    The assembled_payload is a serialized BatchResearchResponse (dict).
    """
    resp = (
        client.table("known_schedules")
        .select("assembled_payload,updated_at")
        .eq("signature", signature)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None
    return resp.data[0]


def upsert_known_schedule(
    client: Client,
    signature: str,
    assembled_payload: dict[str, Any],
    plan_id: str | None = None,
) -> None:
    """Write or overwrite a known_schedules row."""
    row: dict[str, Any] = {
        "signature": signature,
        "assembled_payload": assembled_payload,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if plan_id is not None:
        row["plan_id"] = plan_id
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
