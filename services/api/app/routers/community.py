from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.deps import get_current_user_access
from app.db.client import get_supabase_for_access_token
from app.db.service import (
    create_community_post,
    create_community_reply,
    get_community_post_with_replies,
    list_community_posts,
)
from app.models.community import (
    CreatePostRequest,
    CreateReplyRequest,
    PostDetail,
    PostListResponse,
    PostSummary,
)

router = APIRouter(prefix="/community", tags=["community"])


@router.get("", response_model=PostListResponse)
def list_posts(
    course_code: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> PostListResponse:
    _, access_token = auth
    client = get_supabase_for_access_token(access_token)
    return list_community_posts(client, course_code=course_code, page=page)


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
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
