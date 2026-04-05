from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.models.community import PostDetail, PostListResponse, PostSummary, ReplyOut
from app.models.domain import CourseResearchCacheRow
from app.models.plan import SavedPlanCreate


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
