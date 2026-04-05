from typing import Optional
from pydantic import Field

from app.models.domain import CamelModel


class CreatePostRequest(CamelModel):
    title: str
    body: str
    course_code: Optional[str] = None


class CreateReplyRequest(CamelModel):
    body: str


class PostSummary(CamelModel):
    id: str
    user_id: str
    title: str
    body: str
    course_code: Optional[str] = None
    author_display_name: str
    created_at: str
    updated_at: str
    reply_count: int = 0


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
