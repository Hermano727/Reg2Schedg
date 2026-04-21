"""
Community posts and replies: Supabase CRUD operations.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from supabase import Client

from app.db.client import get_supabase_client
from app.models.community import (
    NotificationOut,
    PostAttachment,
    PostDetail,
    PostListResponse,
    PostSummary,
    ReplyOut,
)

ATTACHMENT_SIGNED_URL_TTL = 3600  # seconds
COMMUNITY_RATE_LIMIT_WINDOW_MINUTES = 10
COMMUNITY_RATE_LIMIT_COUNT = 3


def _sign_attachments(rows: list[dict]) -> list[PostAttachment]:
    """Convert community_attachments rows into PostAttachment with signed URLs."""
    if not rows:
        return []
    service = get_supabase_client()
    result = []
    for row in rows:
        signed_url: str | None = None
        try:
            sign_resp = service.storage.from_("user-content").create_signed_url(
                row["storage_path"], ATTACHMENT_SIGNED_URL_TTL
            )
            signed_url = sign_resp.get("signedURL") or sign_resp.get("signed_url")
        except Exception:
            pass
        result.append(
            PostAttachment(
                id=row["id"],
                storage_path=row["storage_path"],
                name=row["name"],
                mime_type=row["mime_type"],
                size_bytes=row["size_bytes"],
                signed_url=signed_url,
            )
        )
    return result


def _insert_attachments(
    client: Client,
    user_id: str,
    attachment_paths: list[str],
    post_id: str | None = None,
    reply_id: str | None = None,
) -> None:
    if not attachment_paths:
        return
    rows = []
    for path in attachment_paths:
        filename = path.split("/")[-1]
        # Strip leading timestamp_ prefix if present for display name
        name = "_".join(filename.split("_")[1:]) if "_" in filename else filename
        row: dict = {
            "user_id": user_id,
            "storage_path": path,
            "name": name,
            "mime_type": _guess_mime(filename),
            "size_bytes": 0,
        }
        if post_id:
            row["post_id"] = post_id
        if reply_id:
            row["reply_id"] = reply_id
        rows.append(row)
    client.table("community_attachments").insert(rows).execute()


def _guess_mime(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".gif"):
        return "image/gif"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".pdf"):
        return "application/pdf"
    if lower.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


def _rate_limit_action_label(action_type: str) -> str:
    if action_type == "post_create":
        return "posting"
    if action_type == "reply_create":
        return "commenting"
    if action_type == "reply_attachment_upload":
        return "uploading comment attachments"
    return action_type.replace("_", " ")


def _rate_limit_message(action_type: str, remaining_seconds: int) -> str:
    minutes = (remaining_seconds + 59) // 60
    label = _rate_limit_action_label(action_type)
    return f"Too many attempts at {label}. Please wait {minutes} minute(s) before trying again."


def log_community_action(
    client: Client,
    user_id: str,
    action_type: str,
    metadata: dict | None = None,
) -> None:
    client.table("community_action_log").insert(
        {
            "user_id": user_id,
            "action_type": action_type,
            "metadata": metadata or {},
        }
    ).execute()


def get_community_timeout_remaining_seconds(
    client: Client,
    user_id: str,
    action_type: str,
) -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=COMMUNITY_RATE_LIMIT_WINDOW_MINUTES)).isoformat()

    resp = (
        client.table("community_action_log")
        .select("created_at")
        .eq("user_id", user_id)
        .eq("action_type", action_type)
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(COMMUNITY_RATE_LIMIT_COUNT)
        .execute()
    )
    rows = resp.data or []
    if len(rows) < COMMUNITY_RATE_LIMIT_COUNT:
        return 0

    most_recent_str = rows[0]["created_at"]
    try:
        most_recent = datetime.fromisoformat(most_recent_str.replace("Z", "+00:00"))
    except ValueError:
        return 0

    timeout_until = most_recent + timedelta(minutes=COMMUNITY_RATE_LIMIT_WINDOW_MINUTES)
    remaining = (timeout_until - datetime.now(timezone.utc)).total_seconds()
    return max(0, int(remaining))


def check_community_action_rate_limit(
    client: Client,
    user_id: str,
    action_type: str,
) -> None:
    remaining = get_community_timeout_remaining_seconds(client, user_id, action_type)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "RATE_LIMITED",
                "message": _rate_limit_message(action_type, remaining),
                "retry_after_seconds": remaining,
            },
        )


def record_community_action(
    client: Client,
    user_id: str,
    action_type: str,
    metadata: dict | None = None,
) -> None:
    """Record an action attempt, then enforce the rolling timeout window."""
    log_community_action(client, user_id, action_type, metadata=metadata)
    remaining = get_community_timeout_remaining_seconds(client, user_id, action_type)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "RATE_LIMITED",
                "message": _rate_limit_message(action_type, remaining),
                "retry_after_seconds": remaining,
            },
        )


def list_community_posts(
    client: Client,
    course_code: str | None = None,
    professor_name: str | None = None,
    search: str | None = None,
    sort_by: str = "newest",
    department: str | None = None,
    course_number: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PostListResponse:
    offset = (page - 1) * page_size
    query = client.table("community_posts_with_author").select("*", count="exact")

    # Legacy exact filters (kept for any direct API usage)
    if course_code:
        query = query.eq("course_code", course_code)
    if professor_name:
        query = query.ilike("professor_name", f"%{professor_name}%")

    # Department / course-number hierarchical filter
    if department and course_number:
        query = query.ilike("course_code", f"{department} {course_number}")
    elif department:
        query = query.ilike("course_code", f"{department} %")
    elif course_number:
        query = query.ilike("course_code", f"% {course_number}")

    # Full-text search across title + body
    if search:
        query = query.ilike("title", f"%{search}%")

    # Ordering
    if sort_by == "best":
        # Supabase PostgREST doesn't support computed order; order by upvote_count desc as proxy.
        # downvote_count is available but composite expressions need raw SQL / RPC.
        query = query.order("upvote_count", desc=True).order("created_at", desc=True)
    else:
        query = query.order("created_at", desc=True)

    response = query.range(offset, offset + page_size - 1).execute()
    posts = [PostSummary.model_validate(row) for row in (response.data or [])]
    total = response.count or 0
    return PostListResponse(posts=posts, total=total, page=page, page_size=page_size)


def get_departments(client: Client) -> list[str]:
    """Return distinct department prefixes (e.g. CSE, MATH) from posts with a course_code."""
    resp = (
        client.table("community_posts")
        .select("course_code")
        .not_.is_("course_code", "null")
        .execute()
    )
    seen: set[str] = set()
    for row in resp.data or []:
        code = (row.get("course_code") or "").strip()
        if " " in code:
            dept = code.split(" ")[0].upper()
            seen.add(dept)
    return sorted(seen)


def create_community_post(
    client: Client,
    user_id: str,
    title: str,
    body: str,
    course_code: str | None = None,
    professor_name: str | None = None,
    is_anonymous: bool = False,
    general_tags: list[str] | None = None,
    attachment_paths: list[str] | None = None,
) -> PostSummary:
    row: dict = {
        "user_id": user_id,
        "title": title,
        "body": body,
        "is_anonymous": is_anonymous,
        "general_tags": general_tags or [],
    }
    if course_code:
        row["course_code"] = course_code
    if professor_name:
        row["professor_name"] = professor_name
    insert_resp = client.table("community_posts").insert(row).execute()
    post_id = insert_resp.data[0]["id"]
    _insert_attachments(client, user_id, attachment_paths or [], post_id=post_id)
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
    raw_replies = replies_resp.data or []

    # Fetch all attachments for this post and its replies in one query
    reply_ids = [r["id"] for r in raw_replies]
    att_query = (
        client.table("community_attachments")
        .select("*")
        .eq("post_id", post_id)
    )
    post_att_resp = att_query.execute()
    post_attachments = _sign_attachments(post_att_resp.data or [])

    reply_attachments_map: dict[str, list[PostAttachment]] = {}
    if reply_ids:
        reply_att_resp = (
            client.table("community_attachments")
            .select("*")
            .in_("reply_id", reply_ids)
            .execute()
        )
        for row in (reply_att_resp.data or []):
            rid = row["reply_id"]
            if rid not in reply_attachments_map:
                reply_attachments_map[rid] = []
            reply_attachments_map[rid].append(row)
        # Sign per-reply
        reply_attachments_map = {
            rid: _sign_attachments(rows)
            for rid, rows in reply_attachments_map.items()
        }

    replies = [
        ReplyOut.model_validate({**r, "attachments": reply_attachments_map.get(r["id"], [])})
        for r in raw_replies
    ]
    return PostDetail(
        **PostSummary.model_validate(post_resp.data[0]).model_dump(),
        replies=replies,
        attachments=post_attachments,
    )


def create_community_reply(
    client: Client,
    user_id: str,
    post_id: str,
    body: str,
    parent_reply_id: str | None = None,
    is_anonymous: bool = False,
    attachment_paths: list[str] | None = None,
) -> None:
    check = client.table("community_posts").select("id").eq("id", post_id).limit(1).execute()
    if not check.data:
        raise LookupError(f"Post {post_id} not found")
    row: dict = {
        "user_id": user_id,
        "post_id": post_id,
        "body": body,
        "is_anonymous": is_anonymous,
    }
    if parent_reply_id:
        row["parent_reply_id"] = parent_reply_id
    reply_resp = client.table("community_replies").insert(row).execute()
    reply_id = reply_resp.data[0]["id"]
    _insert_attachments(client, user_id, attachment_paths or [], reply_id=reply_id)


# ---------------------------------------------------------------------------
# Reply delete
# ---------------------------------------------------------------------------

def _get_reply_owned(client: Client, reply_id: str, user_id: str) -> dict:
    resp = (
        client.table("community_replies")
        .select("id, user_id, is_deleted")
        .eq("id", reply_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise LookupError(f"Reply {reply_id} not found")
    if resp.data[0]["user_id"] != user_id:
        raise PermissionError("Not allowed to modify this reply")
    return resp.data[0]


def delete_community_reply(client: Client, reply_id: str, user_id: str) -> None:
    """Soft-delete a reply by setting is_deleted=true."""
    _get_reply_owned(client, reply_id, user_id)
    client.table("community_replies").update({"is_deleted": True}).eq("id", reply_id).execute()


def delete_community_post(client: Client, post_id: str, user_id: str) -> None:
    """Soft-delete a post by setting is_deleted=true."""
    resp = (
        client.table("community_posts")
        .select("id, user_id")
        .eq("id", post_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise LookupError(f"Post {post_id} not found")
    if resp.data[0]["user_id"] != user_id:
        raise PermissionError("Not allowed to delete this post")
    client.table("community_posts").update({"is_deleted": True}).eq("id", post_id).execute()


def update_community_reply(client: Client, reply_id: str, user_id: str, body: str) -> None:
    """Edit a reply body. Sets edited_at to now()."""
    row = _get_reply_owned(client, reply_id, user_id)
    if row.get("is_deleted"):
        raise ValueError("Cannot edit a deleted reply")
    import datetime
    client.table("community_replies").update({
        "body": body,
        "edited_at": datetime.datetime.utcnow().isoformat(),
    }).eq("id", reply_id).execute()


# ---------------------------------------------------------------------------
# Post votes
# ---------------------------------------------------------------------------

def toggle_upvote(client: Client, post_id: str, user_id: str) -> tuple[bool, int]:
    """Toggle an upvote on a post. Returns (upvoted, new_upvote_count)."""
    existing = (
        client.table("community_post_upvotes")
        .select("post_id")
        .eq("post_id", post_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        client.table("community_post_upvotes").delete().eq("post_id", post_id).eq(
            "user_id", user_id
        ).execute()
        upvoted = False
    else:
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

    count_resp = (
        client.table("community_post_upvotes")
        .select("*", count="exact")
        .eq("post_id", post_id)
        .execute()
    )
    return upvoted, count_resp.count or 0


def toggle_post_downvote(
    client: Client, post_id: str, user_id: str
) -> tuple[bool, int, int]:
    """Toggle a downvote on a post. Returns (downvoted, upvote_count, downvote_count)."""
    existing = (
        client.table("community_post_downvotes")
        .select("post_id")
        .eq("post_id", post_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        client.table("community_post_downvotes").delete().eq("post_id", post_id).eq(
            "user_id", user_id
        ).execute()
        downvoted = False
    else:
        client.table("community_post_downvotes").insert(
            {"post_id": post_id, "user_id": user_id}
        ).execute()
        downvoted = True

    up_resp = (
        client.table("community_post_upvotes")
        .select("*", count="exact")
        .eq("post_id", post_id)
        .execute()
    )
    down_resp = (
        client.table("community_post_downvotes")
        .select("*", count="exact")
        .eq("post_id", post_id)
        .execute()
    )
    return downvoted, up_resp.count or 0, down_resp.count or 0


# ---------------------------------------------------------------------------
# Reply votes
# ---------------------------------------------------------------------------

def toggle_reply_upvote(
    client: Client, reply_id: str, user_id: str
) -> tuple[bool, int, int]:
    """Toggle an upvote on a reply. Returns (upvoted, upvote_count, downvote_count)."""
    existing = (
        client.table("community_reply_upvotes")
        .select("reply_id")
        .eq("reply_id", reply_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        client.table("community_reply_upvotes").delete().eq("reply_id", reply_id).eq(
            "user_id", user_id
        ).execute()
        upvoted = False
    else:
        client.table("community_reply_upvotes").insert(
            {"reply_id": reply_id, "user_id": user_id}
        ).execute()
        upvoted = True

    up_resp = (
        client.table("community_reply_upvotes")
        .select("*", count="exact")
        .eq("reply_id", reply_id)
        .execute()
    )
    down_resp = (
        client.table("community_reply_downvotes")
        .select("*", count="exact")
        .eq("reply_id", reply_id)
        .execute()
    )
    return upvoted, up_resp.count or 0, down_resp.count or 0


def toggle_reply_downvote(
    client: Client, reply_id: str, user_id: str
) -> tuple[bool, int, int]:
    """Toggle a downvote on a reply. Returns (downvoted, upvote_count, downvote_count)."""
    existing = (
        client.table("community_reply_downvotes")
        .select("reply_id")
        .eq("reply_id", reply_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        client.table("community_reply_downvotes").delete().eq("reply_id", reply_id).eq(
            "user_id", user_id
        ).execute()
        downvoted = False
    else:
        client.table("community_reply_downvotes").insert(
            {"reply_id": reply_id, "user_id": user_id}
        ).execute()
        downvoted = True

    up_resp = (
        client.table("community_reply_upvotes")
        .select("*", count="exact")
        .eq("reply_id", reply_id)
        .execute()
    )
    down_resp = (
        client.table("community_reply_downvotes")
        .select("*", count="exact")
        .eq("reply_id", reply_id)
        .execute()
    )
    return downvoted, up_resp.count or 0, down_resp.count or 0


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

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
