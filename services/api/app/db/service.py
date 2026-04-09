"""
Supabase service layer: plan CRUD, course research cache, and campus building lookup.
Community operations live in app.db.community.
SunSET queries live in app.db.sunset_db.
"""

from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.models.domain import CourseResearchCacheRow
from app.models.plan import SavedPlanCreate


def normalize_course_code(course_code: str) -> str:
    return " ".join(course_code.upper().split())


def normalize_professor_name(professor_name: str | None) -> str:
    return " ".join((professor_name or "").upper().split())


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


def upsert_course_research_cache(
    client: Client,
    *,
    course_code: str,
    professor_name: str | None,
    course_title: str | None,
    logistics: dict[str, Any],
    model: str | None,
) -> CourseResearchCacheRow:
    row = {
        "course_code": course_code,
        "professor_name": professor_name or "",
        "course_title": course_title or None,
        "normalized_course_code": normalize_course_code(course_code),
        "normalized_professor_name": normalize_professor_name(professor_name),
        "logistics": logistics,
        "model": model,
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
