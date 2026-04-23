"""
Regression tests for professor-name resolution in the research pipeline.

Run with:
    cd services/api
    python -m pytest tests/test_professor_resolution.py -v
"""

from app.db.service import (
    _choose_canonical_professor_name,
    _professor_match_score,
    _select_best_cache_row,
)
from app.models.domain import CourseResearchCacheRow
from app.services.rmp_client import _last_name, _name_overlap_score
from app.utils.normalize import normalize_course_code, normalize_professor_name


def _make_cache_row(
    *,
    row_id: str,
    professor_name: str,
    updated_at: str,
    rmp_rating: float | None = None,
    evidence_count: int = 0,
) -> CourseResearchCacheRow:
    return CourseResearchCacheRow(
        id=row_id,
        course_code="CSE 123",
        professor_name=professor_name,
        course_title="Computer Networks",
        normalized_course_code=normalize_course_code("CSE 123"),
        normalized_professor_name=normalize_professor_name(professor_name),
        logistics={
            "rate_my_professor": {
                "rating": rmp_rating,
                "difficulty": 3 if rmp_rating is not None else None,
                "would_take_again_percent": 100 if rmp_rating is not None else None,
                "url": "https://www.ratemyprofessors.com/professor/3050657" if rmp_rating is not None else None,
            },
            "evidence": [{"source": "Reddit Insight", "content": "Helpful"}] * evidence_count,
            "professor_info_found": rmp_rating is not None,
            "course_webpage_url": "https://example.com/cse123",
        },
        model="claude-sonnet-4.6",
        updated_at=updated_at,
        data_source="tiered_pipeline",
    )


class TestProfessorCacheResolution:
    def test_professor_match_score_handles_missing_middle_initial(self):
        assert _professor_match_score("Shalev, Aaron", "Shalev, Aaron D") == 4

    def test_select_best_cache_row_prefers_richer_equivalent_professor(self):
        richer = _make_cache_row(
            row_id="rich",
            professor_name="Shalev, Aaron D",
            updated_at="2026-01-01T00:00:00+00:00",
            rmp_rating=5.0,
            evidence_count=3,
        )
        poorer = _make_cache_row(
            row_id="poor",
            professor_name="Shalev, Aaron",
            updated_at="2026-02-01T00:00:00+00:00",
            rmp_rating=None,
            evidence_count=0,
        )

        selected = _select_best_cache_row([poorer, richer], "Shalev, Aaron")

        assert selected is not None
        assert selected.id == "rich"
        assert selected.professor_name == "Shalev, Aaron D"

    def test_choose_canonical_professor_name_keeps_more_complete_existing_name(self):
        assert _choose_canonical_professor_name("Shalev, Aaron D", "Shalev, Aaron") == "Shalev, Aaron D"


class TestRateMyProfessorNameParsing:
    def test_last_name_uses_surname_for_webreg_format(self):
        assert _last_name("Shalev, Aaron") == "Shalev"

    def test_name_overlap_score_handles_commas(self):
        assert _name_overlap_score("Shalev, Aaron", "Aaron", "Shalev") == 2
