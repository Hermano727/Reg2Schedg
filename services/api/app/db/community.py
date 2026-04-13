"""
Community posts and replies: Supabase CRUD operations.
"""

from supabase import Client

from app.models.community import (
    NotificationOut,
    PostDetail,
    PostListResponse,
    PostSummary,
    ReplyOut,
)


def list_community_posts(
    client: Client,
    course_code: str | None = None,
    professor_name: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PostListResponse:
    offset = (page - 1) * page_size
    query = client.table("community_posts_with_author").select("*", count="exact")
    if course_code:
        query = query.eq("course_code", course_code)
    if professor_name:
        query = query.ilike("professor_name", f"%{professor_name}%")
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
    professor_name: str | None = None,
    is_anonymous: bool = False,
) -> PostSummary:
    row: dict = {
        "user_id": user_id,
        "title": title,
        "body": body,
        "is_anonymous": is_anonymous,
    }
    if course_code:
        row["course_code"] = course_code
    if professor_name:
        row["professor_name"] = professor_name
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


def toggle_upvote(client: Client, post_id: str, user_id: str) -> tuple[bool, int]:
    """Toggle an upvote. Returns (upvoted, new_count)."""
    existing = (
        client.table("community_post_upvotes")
        .select("post_id")
        .eq("post_id", post_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        # Remove upvote
        client.table("community_post_upvotes").delete().eq("post_id", post_id).eq(
            "user_id", user_id
        ).execute()
        upvoted = False
    else:
        # Add upvote
        client.table("community_post_upvotes").insert(
            {"post_id": post_id, "user_id": user_id}
        ).execute()
        upvoted = True

        # Notify post author (skip self-upvote)
        post_resp = (
            client.table("community_posts")
            .select("user_id, title")
            .eq("id", post_id)
            .limit(1)
            .execute()
        )
        if post_resp.data:
            post_data = post_resp.data[0]
            if post_data["user_id"] != user_id:
                client.table("notifications").insert(
                    {
                        "user_id": post_data["user_id"],
                        "type": "upvote",
                        "payload": {"post_id": post_id, "post_title": post_data["title"]},
                    }
                ).execute()

    # Return fresh count
    count_resp = (
        client.table("community_post_upvotes")
        .select("*", count="exact")
        .eq("post_id", post_id)
        .execute()
    )
    return upvoted, count_resp.count or 0


def get_notifications(
    client: Client, user_id: str, limit: int = 20
) -> list[NotificationOut]:
    resp = (
        client.table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [NotificationOut.model_validate(row) for row in (resp.data or [])]


def mark_notifications_read(client: Client, user_id: str) -> None:
    client.table("notifications").update({"read": True}).eq("user_id", user_id).eq(
        "read", False
    ).execute()


def get_user_posts(client: Client, user_id: str) -> list[PostSummary]:
    resp = (
        client.table("community_posts_with_author")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return [PostSummary.model_validate(row) for row in (resp.data or [])]
