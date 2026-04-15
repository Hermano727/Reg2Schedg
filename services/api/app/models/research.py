"""
Pydantic models for course research: logistics, evidence, grade distributions,
Browser Use cost tracking, and batch response shapes.
"""

from typing import Any

from pydantic import BaseModel, Field

from app.models.course_parse import SectionMeeting


class RateMyProfessorStats(BaseModel):
    rating: float | None = Field(
        default=None,
        description="Overall professor rating from Rate My Professors, on a 5-point scale",
    )
    would_take_again_percent: float | None = Field(
        default=None,
        description="Percentage from Rate My Professors, for example 78 for 78%",
    )
    difficulty: float | None = Field(
        default=None,
        description="Difficulty score from Rate My Professors",
    )
    url: str | None = Field(default=None, description="Direct Rate My Professors page URL")


class EvidenceItem(BaseModel):
    source: str = Field(
        ...,
        description="Source type: 'Reddit Insight', 'Syllabus Snippet', 'Course Page', etc.",
    )
    content: str = Field(
        ...,
        description="Verbatim quote extracted from the source — do NOT paraphrase",
    )
    url: str | None = Field(
        default=None,
        description="Direct permalink URL to the specific post, comment, or page section",
    )
    relevance_score: float = Field(
        default=0.5,
        description="0.0 to 1.0 — how directly relevant this quote is to the course",
    )


class CourseLogistics(BaseModel):
    attendance_required: bool | None = Field(
        default=None,
        description="True if attendance is explicitly required or graded, false if optional",
    )
    grade_breakdown: str | None = Field(
        default=None,
        description='Compact grading breakdown such as "Homework 20%, Midterm 30%, Final 50%"',
    )
    course_webpage_url: str | None = Field(
        default=None,
        description="Direct link to the main course page, syllabus, or official class website",
    )
    textbook_required: bool | None = Field(
        default=None,
        description="True if a textbook or paid course platform is required, false otherwise",
    )
    podcasts_available: bool | None = Field(
        default=None,
        description="True if lectures are podcasted or officially recorded, false otherwise",
    )
    student_sentiment_summary: str | None = Field(
        default=None,
        description=(
            "One short summary of what students commonly say about the class or professor, "
            "based on Reddit and Rate My Professors"
        ),
    )
    rate_my_professor: RateMyProfessorStats = Field(default_factory=RateMyProfessorStats)
    evidence: list[EvidenceItem] = Field(
        default_factory=list,
        description=(
            "Verbatim quotes from Reddit threads, syllabus pages, or other sources. "
            "Each item must be a direct quote — never paraphrase."
        ),
    )
    professor_info_found: bool = Field(
        default=True,
        description=(
            "Set to false if no specific information was found for this exact professor "
            "teaching this course. True if professor-specific RMP, syllabus, or Reddit data was found."
        ),
    )
    general_course_overview: str | None = Field(
        default=None,
        description=(
            "Only populate when professor_info_found is false. "
            "2-3 sentence description of the course's content and learning objectives "
            "from the UCSD catalog, department page, or any official UCSD source."
        ),
    )
    general_professor_overview: str | None = Field(
        default=None,
        description=(
            "Only populate when professor_info_found is false. "
            "1-2 sentence summary of the professor's research area, background, or teaching style "
            "from their UCSD faculty page, department bio, or any public academic profile."
        ),
    )


class RedditPost(BaseModel):
    title: str
    body: str
    url: str
    score: int = 0
    top_comments: list[str] = Field(default_factory=list)


class ResearchRawData(BaseModel):
    """Intermediate bag-of-text from Tiers 0-2, fed into Gemini synthesis (Tier 3)."""
    course_code: str
    professor_name: str | None
    reddit_posts: list[RedditPost] = Field(default_factory=list)
    rmp_stats: RateMyProfessorStats | None = None
    rmp_url: str | None = None
    ucsd_course_description: str | None = None
    ucsd_catalog_url: str | None = None
    ucsd_syllabus_snippets: list[str] = Field(default_factory=list)
    ucsd_syllabus_url: str | None = None
    tier_coverage: dict[str, bool] = Field(default_factory=dict)
    # e.g. {"reddit": True, "rmp": True, "ucsd_catalog": False, "ucsd_syllabus": False}
    # Pre-scored by Tier 0.5 (Gemini Flash) — synthesizer should prefer these for evidence[].
    pre_extracted_reddit_evidence: list[EvidenceItem] = Field(default_factory=list)


class CourseRunCost(BaseModel):
    session_id: str | None = None
    status: str | None = None
    llm_cost_usd: float | None = None
    browser_cost_usd: float | None = None
    proxy_cost_usd: float | None = None
    total_cost_usd: float | None = None
    data_source: str = "tiered_pipeline"


class SetSummary(BaseModel):
    average_gpa: float | None = None
    median_gpa: float | None = None
    pass_rate_percent: float | None = None
    sample_size: int | None = None
    grade_counts: dict[str, int] = Field(default_factory=dict)


class SunsetGradeDistribution(BaseModel):
    term_label: str | None = None
    professor_name: str | None = None
    grade_distribution: dict[str, Any] = Field(default_factory=dict)
    recommend_professor_percent: float | None = None
    submission_time: str | None = None
    source_url: str | None = None
    set_summary: SetSummary | None = None
    # Cross-course fallback fields
    is_cross_course_fallback: bool = Field(
        default=False,
        description=(
            "True when this grade distribution is from a DIFFERENT course taught by the same professor, "
            "because no data was found for the requested course+professor combination."
        ),
    )
    source_course_code: str | None = Field(
        default=None,
        description="The actual course code this grade distribution row came from when is_cross_course_fallback is True.",
    )


class CourseResearchResult(BaseModel):
    course_code: str
    course_title: str | None = None
    professor_name: str | None = None
    meetings: list[SectionMeeting] = Field(default_factory=list)
    logistics: CourseLogistics | None = None
    sunset_grade_distribution: SunsetGradeDistribution | None = None
    cache_hit: bool = False
    cached_at: str | None = None
    cache_error: str | None = None
    cost: CourseRunCost | None = None
    error: str | None = None
    # Canonical ID from course_research_cache — lets the frontend reference
    # research by ID instead of duplicating full logistics into saved_plans.
    cache_id: str | None = None


class BatchCostSummary(BaseModel):
    llm_cost_usd: float = 0.0
    browser_cost_usd: float = 0.0
    proxy_cost_usd: float = 0.0
    total_cost_usd: float = 0.0
    run_count: int = 0


class BatchResearchResponse(BaseModel):
    input_source: str
    course_count: int
    results: list[CourseResearchResult]
    cost_summary: BatchCostSummary
    # Present on known-schedule fast-path hits where fit analysis was previously
    # cached. Frontend should use this directly and skip the /api/fit-analysis call.
    fit_evaluation: dict[str, Any] | None = None


class CourseRunOutcome(BaseModel):
    logistics: CourseLogistics
    cost: CourseRunCost


class CourseResearchRunError(RuntimeError):
    def __init__(self, message: str, *, cost: CourseRunCost | None = None) -> None:
        super().__init__(message)
        self.cost = cost
