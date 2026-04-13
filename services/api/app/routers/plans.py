"""
Plans router: save, load, and expand saved plans.

GET /plans/{id}/expanded
    Server-side join: reads saved_plan_classes (or v2 payload class_refs) and
    fetches each course's logistics from course_research_cache.  Returns the
    same structure the frontend currently expects from a saved plan — no Browser
    Use, no Gemini calls — guaranteed.

POST /plans
    (Also lives in main.py as a simple inline handler; kept there for now.)

The STALE_AFTER_DAYS constant controls when a cached course is flagged as stale
in the expanded response.  Stale courses can be force-refreshed individually.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import get_current_user_access
from app.db.client import get_supabase_for_access_token
from app.db.service import (
    get_saved_plan,
    get_saved_plan_classes,
    get_course_research_cache_by_id,
)
from app.models.research import CourseLogistics

_log = logging.getLogger(__name__)
router = APIRouter()

STALE_AFTER_DAYS = 30


def _is_stale(updated_at_str: str | None) -> bool:
    """Return True if a cache row's updated_at is older than STALE_AFTER_DAYS."""
    if not updated_at_str:
        return False
    try:
        updated = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
        return datetime.now(timezone.utc) - updated > timedelta(days=STALE_AFTER_DAYS)
    except Exception:
        return False


def _expand_from_class_refs(
    class_refs: list[dict[str, Any]],
    client: Any,
) -> list[dict[str, Any]]:
    """
    Fetch logistics from course_research_cache for each class_ref.
    Returns a list of assembled class dicts with logistics + meetings + overrides.
    """
    assembled: list[dict[str, Any]] = []
    for ref in class_refs:
        cache_id = ref.get("course_cache_id")
        if not cache_id:
            continue

        row = get_course_research_cache_by_id(client, cache_id)
        if row is None:
            _log.warning("[expand] cache_id %s not found in course_research_cache", cache_id)
            assembled.append({
                "course_code": ref.get("course_code", ""),
                "professor_name": ref.get("professor_name"),
                "meetings": ref.get("meetings", []),
                "logistics": None,
                "cache_id": cache_id,
                "stale": False,
                "missing": True,
            })
            continue

        try:
            logistics = CourseLogistics.model_validate(row.logistics)
            logistics_dict = logistics.model_dump(mode="json")
        except Exception:
            logistics_dict = row.logistics  # fallback: raw dict

        assembled.append({
            "course_code": row.course_code,
            "professor_name": row.professor_name or None,
            "course_title": row.course_title,
            "meetings": ref.get("meetings", []),
            "overrides": ref.get("overrides", {}),
            "logistics": logistics_dict,
            "cache_id": cache_id,
            "cached_at": row.updated_at,
            "stale": _is_stale(row.updated_at),
            "missing": False,
            "data_source": row.data_source,
        })

    return assembled


@router.get("/plans/{plan_id}/expanded")
def get_expanded_plan(
    plan_id: str,
    auth: Annotated[tuple[str, str], Depends(get_current_user_access)],
) -> dict[str, Any]:
    """
    Assemble a full plan payload from stored class references.

    Supports two plan shapes:
    - v2: payload has class_refs list OR saved_plan_classes join rows exist.
    - v1: payload has full 'classes' array (backwards compat — returned as-is).

    Response shape (identical to what the frontend currently expects):
    {
      "plan_id": str,
      "payload_version": int,
      "classes": [...],   // assembled ClassDossier-like objects
      "evaluation": {...} | null,
      "commitments": [...],
      "stale_count": int,  // number of courses with stale cache data
    }
    """
    _, access_token = auth
    client = get_supabase_for_access_token(access_token)

    plan = get_saved_plan(client, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")

    payload_version = plan.get("payload_version", 1)
    raw_payload = plan.get("payload") or {}
    evaluation = raw_payload.get("evaluation") or None
    commitments = raw_payload.get("commitments") or []

    # ── v1 plan: payload already contains full dossiers ──────────────────────
    if payload_version == 1:
        classes = raw_payload.get("classes") or []
        return {
            "plan_id": plan_id,
            "payload_version": 1,
            "classes": classes,
            "evaluation": evaluation,
            "commitments": commitments,
            "stale_count": 0,
        }

    # ── v2 plan: resolve via saved_plan_classes join rows first ───────────────
    join_rows = get_saved_plan_classes(client, plan_id)
    if join_rows:
        class_refs = [
            {
                "course_cache_id": row["course_cache_id"],
                "course_code": row["course_code"],
                "professor_name": row.get("professor_name"),
                "meetings": row.get("meetings") or [],
                "overrides": row.get("overrides") or {},
            }
            for row in join_rows
        ]
    else:
        # Fall back to payload.class_refs (alternative v2 storage)
        class_refs = raw_payload.get("class_refs") or []
        # Also check top-level payload_class_refs column
        if not class_refs:
            class_refs = plan.get("payload_class_refs") or []

    if not class_refs:
        # v2 plan but no class refs — return empty
        return {
            "plan_id": plan_id,
            "payload_version": 2,
            "classes": [],
            "evaluation": evaluation,
            "commitments": commitments,
            "stale_count": 0,
        }

    assembled = _expand_from_class_refs(class_refs, client)
    stale_count = sum(1 for c in assembled if c.get("stale"))

    return {
        "plan_id": plan_id,
        "payload_version": 2,
        "classes": assembled,
        "evaluation": evaluation,
        "commitments": commitments,
        "stale_count": stale_count,
    }
