from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class QuarterRow(CamelModel):
    id: str
    label: str
    is_active: bool = False


class VaultItemRow(CamelModel):
    id: str
    quarter_id: str
    name: str
    kind: Literal["syllabus", "webreg", "note"]
    updated_at: str


class StatusChipRow(CamelModel):
    id: str
    label: str
    tone: Literal["cyan", "purple", "green", "muted"]


class ClassConflictRow(CamelModel):
    title: str
    detail: str


class ClassDossierRow(CamelModel):
    id: str
    quarter_id: str
    course_code: str
    course_title: str
    professor_name: str
    professor_initials: str
    condensed_summary: list[str] = []
    tldr: str = ""
    confidence_percent: int = 0
    chips: list[StatusChipRow] = []
    conflict: Optional[ClassConflictRow] = None


class CourseResearchCacheRow(CamelModel):
    id: str
    course_code: str
    professor_name: str
    course_title: str | None = None
    normalized_course_code: str
    normalized_professor_name: str
    logistics: dict[str, Any]
    model: str | None = None
    updated_at: str


class SunsetGradeDistributionRow(CamelModel):
    id: str
    source_row_hash: str
    course_code: str
    professor_name: str | None = None
    term_label: str | None = None
    normalized_course_code: str
    normalized_professor_name: str
    grade_distribution: dict[str, Any]
    recommend_professor_percent: float | None = None
    submission_time: str | None = None
    source_url: str
    raw_row: dict[str, Any]
    raw_user_id: str | None = None
    imported_at: str
    updated_at: str
