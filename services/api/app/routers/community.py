from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.deps import get_current_user_access
from app.db.client import get_supabase_for_access_token
from app.db.community import (
    create_community_post,
    create_community_reply,
    delete_community_reply,
    update_community_reply,
    get_community_post_with_replies,
    get_departments,
    get_notifications,
    get_user_posts,
    list_community_posts,
    mark_notifications_read,
    toggle_post_downvote,
    toggle_reply_downvote,
    toggle_reply_upvote,
    toggle_upvote,
)
from app.models.community import (
    CreatePostRequest,
    CreateReplyRequest,
    UpdateReplyRequest,
    NotificationOut,
    PostDetail,
    PostListResponse,
    PostSummary,
    UpvoteResponse,
    VoteResponse,
)

router = APIRouter(prefix="/community", tags=["community"])


@router.get("", response_model=PostListResponse)
def list_posts(
    course_code: Optional[str] = Query(default=None),
    professor_name: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    sort_by: str = Query(default="newest"),
    department: Optional[str] = Query(default=None),
    course_number: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> PostListResponse:
    _, access_token = auth
    client = get_supabase_for_access_token(access_token)
    return list_community_posts(
        client,
        course_code=course_code,
        professor_name=professor_name,
        search=search,
        sort_by=sort_by,
        department=department,
        course_number=course_number,
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
            general_tags=body.general_tags,
            attachment_paths=body.attachment_paths,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# NOTE: /notifications, /departments, and /notifications/read must be declared BEFORE /{post_id}
# so FastAPI does not try to match them as a post_id path param.

@router.get("/departments", response_model=list[str])
def list_departments(
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> list[str]:
    _, access_token = auth
    client = get_supabase_for_access_token(access_token)
    return get_departments(client)


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
    "/{post_id}/downvote",
    response_model=VoteResponse,
    status_code=status.HTTP_200_OK,
)
def downvote_post(
    post_id: str,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> VoteResponse:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        voted, up_count, down_count = toggle_post_downvote(client, post_id, user_id)
        return VoteResponse(voted=voted, upvote_count=up_count, downvote_count=down_count)
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
        create_community_reply(
            client,
            user_id,
            post_id,
            body=body.body,
            parent_reply_id=body.parent_reply_id,
            is_anonymous=body.is_anonymous,
            attachment_paths=body.attachment_paths,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    post = get_community_post_with_replies(client, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.delete(
    "/{post_id}/replies/{reply_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_reply(
    post_id: str,
    reply_id: str,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> None:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        delete_community_reply(client, reply_id, user_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch(
    "/{post_id}/replies/{reply_id}",
    response_model=PostDetail,
    status_code=status.HTTP_200_OK,
)
def edit_reply(
    post_id: str,
    reply_id: str,
    body: UpdateReplyRequest,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> PostDetail:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        update_community_reply(client, reply_id, user_id, body.body)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    post = get_community_post_with_replies(client, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.post(
    "/{post_id}/replies/{reply_id}/upvote",
    response_model=VoteResponse,
    status_code=status.HTTP_200_OK,
)
def upvote_reply(
    post_id: str,
    reply_id: str,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> VoteResponse:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        voted, up_count, down_count = toggle_reply_upvote(client, reply_id, user_id)
        return VoteResponse(voted=voted, upvote_count=up_count, downvote_count=down_count)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{post_id}/replies/{reply_id}/downvote",
    response_model=VoteResponse,
    status_code=status.HTTP_200_OK,
)
def downvote_reply(
    post_id: str,
    reply_id: str,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> VoteResponse:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        voted, up_count, down_count = toggle_reply_downvote(client, reply_id, user_id)
        return VoteResponse(voted=voted, upvote_count=up_count, downvote_count=down_count)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
