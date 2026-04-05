import re
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.models.community import PostDetail, PostListResponse, PostSummary, ReplyOut
from app.models.domain import CourseResearchCacheRow, SunsetGradeDistributionRow
from app.models.plan import SavedPlanCreate


TERM_LABEL_PATTERN = re.compile(r"\b(winter|spring|summer|fall)\s+(?:qtr\s+)?(\d{4})\b", re.IGNORECASE)
TERM_ORDER = {
    "winter": 1,
    "spring": 2,
    "summer": 3,
    "fall": 4,
}


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


def normalize_course_code(course_code: str) -> str:
    return " ".join(course_code.upper().split())


def normalize_professor_name(professor_name: str | None) -> str:
    return " ".join((professor_name or "").upper().split())


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


def list_community_posts(
    client: Client,
    course_code: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PostListResponse:
    offset = (page - 1) * page_size
    query = client.table("community_posts_with_author").select("*", count="exact")
    if course_code:
        query = query.eq("course_code", course_code)
    response = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    posts = [PostSummary.model_validate(row) for row in (response.data or [])]
    total = response.count or 0
    return PostListResponse(posts=posts, total=total, page=page, page_size=page_size)


def create_community_post(
    client: Client,
    user_id: str,
    title: str,
    body: str,
    course_code: str | None = None,
) -> PostSummary:
    row = {"user_id": user_id, "title": title, "body": body}
    if course_code:
        row["course_code"] = course_code
    insert_resp = client.table("community_posts").insert(row).execute()
    post_id = insert_resp.data[0]["id"]
    fetch_resp = (
        client.table("community_posts_with_author")
        .select("*")
        .eq("id", post_id)
        .single()
        .execute()
    )
    return PostSummary.model_validate(fetch_resp.data)


def get_community_post_with_replies(client: Client, post_id: str) -> PostDetail | None:
    post_resp = (
        client.table("community_posts_with_author")
        .select("*")
        .eq("id", post_id)
        .limit(1)
        .execute()
    )
    if not post_resp.data:
        return None
    replies_resp = (
        client.table("community_replies_with_author")
        .select("*")
        .eq("post_id", post_id)
        .order("created_at")
        .execute()
    )
    replies = [ReplyOut.model_validate(r) for r in (replies_resp.data or [])]
    return PostDetail(**PostSummary.model_validate(post_resp.data[0]).model_dump(), replies=replies)


def create_community_reply(client: Client, user_id: str, post_id: str, body: str) -> None:
    check = client.table("community_posts").select("id").eq("id", post_id).limit(1).execute()
    if not check.data:
        raise LookupError(f"Post {post_id} not found")
    client.table("community_replies").insert(
        {"user_id": user_id, "post_id": post_id, "body": body}
    ).execute()


def _split_professor_name(value: str | None) -> tuple[str, str]:
    normalized = normalize_professor_name(value)
    if not normalized:
        return "", ""

    if "," in normalized:
        last_name, remainder = normalized.split(",", 1)
        first_name = remainder.strip().split()[0] if remainder.strip() else ""
        return last_name.strip(), first_name

    parts = normalized.split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[-1], parts[0]


def _professor_match_score(requested: str | None, candidate: str | None) -> int:
    requested_normalized = normalize_professor_name(requested)
    candidate_normalized = normalize_professor_name(candidate)

    if not requested_normalized:
        return 1 if candidate_normalized else 0
    if not candidate_normalized:
        return 0
    if requested_normalized == candidate_normalized:
        return 4

    requested_last, requested_first = _split_professor_name(requested_normalized)
    candidate_last, candidate_first = _split_professor_name(candidate_normalized)

    if requested_last and requested_last == candidate_last:
        if requested_first and candidate_first:
            if requested_first == candidate_first:
                return 3
            if requested_first.startswith(candidate_first) or candidate_first.startswith(requested_first):
                return 2
            if requested_first[0] == candidate_first[0]:
                return 1
        return 1

    return 0


def _sunset_recency_key(term_label: str | None, submission_time: str | None) -> tuple[int, int, str]:
    year = 0
    season = 0
    if term_label:
        match = TERM_LABEL_PATTERN.search(term_label)
        if match:
            season = TERM_ORDER.get(match.group(1).lower(), 0)
            year = int(match.group(2))
    return year, season, submission_time or ""


def get_sunset_grade_distribution(
    client: Client,
    *,
    course_code: str,
    professor_name: str | None,
) -> SunsetGradeDistributionRow | None:
    response = (
        client.table("sunset_grade_distributions")
        .select("*")
        .eq("normalized_course_code", normalize_course_code(course_code))
        .limit(200)
        .execute()
    )
    if not response.data:
        return None

    rows = [SunsetGradeDistributionRow.model_validate(row) for row in response.data]
    exact_or_close_matches: list[tuple[int, tuple[int, int, str], SunsetGradeDistributionRow]] = []
    fallback_matches: list[tuple[int, tuple[int, int, str], SunsetGradeDistributionRow]] = []

    for row in rows:
        score = _professor_match_score(professor_name, row.professor_name)
        scored_row = (score, _sunset_recency_key(row.term_label, row.submission_time), row)
        if score > 0:
            exact_or_close_matches.append(scored_row)
        elif not normalize_professor_name(professor_name):
            fallback_matches.append(scored_row)

    ranked_matches = exact_or_close_matches or fallback_matches
    if not ranked_matches:
        return None

    ranked_matches.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return ranked_matches[0][2]
