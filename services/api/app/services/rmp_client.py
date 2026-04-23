"""
Tier 1: RateMyProfessors unofficial GraphQL client.

Uses the RMP GraphQL endpoint that community projects have relied on for years.
No auth token required — the endpoint is public.

School ID for UCSD is hardcoded (base64 "School-112") to avoid an extra round-trip.
Returns (None, None) on any error — callers must tolerate absence.
"""

from __future__ import annotations

import logging
import re

import httpx

from app.models.research import RateMyProfessorStats

_log = logging.getLogger(__name__)

# Base64("School-112") — UCSD's stable RMP school node ID
_UCSD_SCHOOL_ID = "U2Nob29sLTExMg=="

_RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"

_QUERY = """
query TeacherSearchQuery($query: TeacherSearchQuery!) {
  newSearch {
    teachers(query: $query, first: 8) {
      edges {
        node {
          id
          firstName
          lastName
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          numRatings
          department
          school { id name }
        }
      }
    }
  }
}
"""

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Content-Type": "application/json",
    "Referer": "https://www.ratemyprofessors.com/",
}


def _last_name(full_name: str) -> str:
    normalized = full_name.strip()
    if not normalized:
        return full_name
    if "," in normalized:
        return normalized.split(",", 1)[0].strip()
    parts = normalized.replace(".", " ").split()
    return parts[-1] if parts else full_name


def _name_tokens(value: str) -> set[str]:
    return {token for token in re.split(r"[\s,\.]+", value.upper()) if token}


def _name_overlap_score(requested: str, candidate_first: str, candidate_last: str) -> int:
    """Score token overlap between requested name and candidate."""
    req_tokens = _name_tokens(requested)
    cand_tokens = _name_tokens(f"{candidate_first} {candidate_last}")
    return len(req_tokens & cand_tokens)


async def fetch_rmp_stats(
    professor_name: str,
    *,
    timeout_seconds: float = 5.0,
) -> tuple[RateMyProfessorStats | None, str | None]:
    """
    Return (RateMyProfessorStats, profile_url) or (None, None) on failure.
    Searches by last name, disambiguates by name token overlap.
    """
    if not professor_name or not professor_name.strip():
        return None, None

    last = _last_name(professor_name)
    payload = {
        "query": _QUERY,
        "variables": {
            "query": {
                "text": last,
                "schoolID": _UCSD_SCHOOL_ID,
            }
        },
    }

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.post(_RMP_GRAPHQL_URL, json=payload, headers=_HEADERS)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        _log.warning("[rmp] request failed for %r: %s", professor_name, exc)
        return None, None

    try:
        edges = data["data"]["newSearch"]["teachers"]["edges"]
    except (KeyError, TypeError) as exc:
        _log.warning("[rmp] unexpected response shape for %r: %s", professor_name, exc)
        return None, None

    if not edges:
        _log.debug("[rmp] no results for %r", professor_name)
        return None, None

    # Pick best match by name token overlap, prefer nodes with more ratings
    best = max(
        edges,
        key=lambda e: (
            _name_overlap_score(professor_name, e["node"]["firstName"], e["node"]["lastName"]),
            e["node"].get("numRatings") or 0,
        ),
    )
    node = best["node"]

    # Require at least some name overlap — don't return a random professor
    if _name_overlap_score(professor_name, node["firstName"], node["lastName"]) == 0:
        _log.debug("[rmp] no name overlap for %r, skipping", professor_name)
        return None, None

    # Build profile URL from the base64 node ID
    # RMP IDs decode to e.g. "Teacher-123456"; the URL uses the numeric part
    try:
        import base64
        raw_id = base64.b64decode(node["id"]).decode()
        numeric_id = raw_id.split("-")[-1]
        profile_url = f"https://www.ratemyprofessors.com/professor/{numeric_id}"
    except Exception:
        profile_url = None

    stats = RateMyProfessorStats(
        rating=node.get("avgRating"),
        difficulty=node.get("avgDifficulty"),
        would_take_again_percent=node.get("wouldTakeAgainPercent"),
        url=profile_url,
    )
    return stats, profile_url
