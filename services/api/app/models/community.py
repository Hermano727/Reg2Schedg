from typing import Optional
from pydantic import Field

from app.models.domain import CamelModel


class CreatePostRequest(CamelModel):
    title: str
    body: str
    course_code: Optional[str] = None
    professor_name: Optional[str] = None
    is_anonymous: bool = False


class CreateReplyRequest(CamelModel):
    body: str


class PostSummary(CamelModel):
    id: str
    user_id: str
    title: str
    body: str
    course_code: Optional[str] = None
    professor_name: Optional[str] = None
    is_anonymous: bool = False
    author_display_name: str
    created_at: str
    updated_at: str
    reply_count: int = 0
    upvote_count: int = 0
    user_has_upvoted: bool = False


class ReplyOut(CamelModel):
    id: str
    post_id: str
    user_id: str
    body: str
    author_display_name: str
    created_at: str
    updated_at: str


class PostDetail(PostSummary):
    replies: list[ReplyOut] = Field(default_factory=list)


class PostListResponse(CamelModel):
    posts: list[PostSummary]
    total: int
    page: int
    page_size: int


class UpvoteResponse(CamelModel):
    upvoted: bool
    upvote_count: int


class NotificationOut(CamelModel):
    id: str
    user_id: str
    type: str
    payload: Optional[dict] = None
    read: bool
    created_at: str
