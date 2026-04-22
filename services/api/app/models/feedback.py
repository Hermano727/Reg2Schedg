from typing import Any, Literal
from pydantic import Field

from app.models.domain import CamelModel


ReportType = Literal["bug", "feature", "ux", "general"]
ProductArea = Literal["command_center", "profile", "community", "calendar", "lookup", "other"]


class CreateFeedbackRequest(CamelModel):
    report_type: ReportType
    product_area: ProductArea
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=4000)
    expected_behavior: str | None = Field(default=None, max_length=2000)
    page_path: str | None = Field(default=None, max_length=500)
    user_agent: str | None = Field(default=None, max_length=1000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FeedbackSubmissionOut(CamelModel):
    id: str
    created_at: str
