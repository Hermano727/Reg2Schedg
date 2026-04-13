from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.deps import get_current_user_access
from app.db.client import get_supabase_for_access_token
from app.db.community import (
    create_community_post,
    create_community_reply,
    get_community_post_with_replies,
    get_notifications,
    get_user_posts,
    list_community_posts,
    mark_notifications_read,
    toggle_upvote,
)
from app.models.community import (
    CreatePostRequest,
    CreateReplyRequest,
    NotificationOut,
    PostDetail,
    PostListResponse,
    PostSummary,
    UpvoteResponse,
)

router = APIRouter(prefix="/community", tags=["community"])


@router.get("", response_model=PostListResponse)
def list_posts(
    course_code: Optional[str] = Query(default=None),
    professor_name: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> PostListResponse:
    _, access_token = auth
    client = get_supabase_for_access_token(access_token)
    return list_community_posts(
        client,
        course_code=course_code,
        professor_name=professor_name,
        page=page,
    )


@router.post("", response_model=PostSummary, status_code=status.HTTP_201_CREATED)
def create_post(
    body: CreatePostRequest,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> PostSummary:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        return create_community_post(
            client,
            user_id,
            title=body.title,
            body=body.body,
            course_code=body.course_code,
            professor_name=body.professor_name,
            is_anonymous=body.is_anonymous,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# NOTE: /notifications and /notifications/read must be declared BEFORE /{post_id}
# so FastAPI does not try to match "notifications" as a post_id path param.

@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> list[NotificationOut]:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    return get_notifications(client, user_id)


@router.post("/notifications/read", status_code=status.HTTP_204_NO_CONTENT)
def read_notifications(
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> None:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    mark_notifications_read(client, user_id)


@router.get("/{post_id}", response_model=PostDetail)
def get_post(
    post_id: str,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> PostDetail:
    _, access_token = auth
    client = get_supabase_for_access_token(access_token)
    post = get_community_post_with_replies(client, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.post(
    "/{post_id}/upvote",
    response_model=UpvoteResponse,
    status_code=status.HTTP_200_OK,
)
def upvote_post(
    post_id: str,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> UpvoteResponse:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        upvoted, count = toggle_upvote(client, post_id, user_id)
        return UpvoteResponse(upvoted=upvoted, upvote_count=count)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{post_id}/replies",
    response_model=PostDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_reply(
    post_id: str,
    body: CreateReplyRequest,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> PostDetail:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        create_community_reply(client, user_id, post_id, body=body.body)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    post = get_community_post_with_replies(client, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post
