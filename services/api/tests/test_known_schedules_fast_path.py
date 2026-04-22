"""
Integration tests for the known-schedules fast path.

These tests verify that when a schedule signature is already in known_schedules,
research_courses() returns the pre-assembled payload without calling Browser Use
or the tiered pipeline.

Run with:
    cd services/api
    python -m pytest tests/test_known_schedules_fast_path.py -v

NOTE: Tests mock Supabase and the tiered pipeline — no external calls are made.
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.course_parse import CourseEntry, SectionMeeting
from app.models.research import (
    BatchResearchResponse,
    BatchCostSummary,
    CourseResearchResult,
)
from app.utils.normalize import compute_schedule_signature


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_entry(course_code: str, professor_name: str = "Smith") -> CourseEntry:
    return CourseEntry(
        course_code=course_code,
        course_title=course_code,
        professor_name=professor_name,
        meetings=[
            SectionMeeting(
                section_type="Lecture",
                days="MWF",
                start_time="10:00 AM",
                end_time="10:50 AM",
                location="CENTR 115",
            )
        ],
    )


def _make_prebuilt_response(entries: list[CourseEntry]) -> BatchResearchResponse:
    """Build a fake pre-assembled BatchResearchResponse (simulates what's in known_schedules)."""
    results = [
        CourseResearchResult(
            course_code=e.course_code,
            course_title=e.course_title,
            professor_name=e.professor_name,
            meetings=e.meetings,
            cache_hit=True,
            cache_id="fake-cache-id-" + e.course_code.replace(" ", ""),
        )
        for e in entries
    ]
    return BatchResearchResponse(
        input_source="known_schedules",
        course_count=len(results),
        results=results,
        cost_summary=BatchCostSummary(run_count=len(results)),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestKnownSchedulesFastPath:
    def test_signature_is_stable_for_known_schedule(self):
        """Verify the signature used as the cache key is deterministic."""
        entries = [_make_entry("CSE 110"), _make_entry("MATH 20C")]
        sig1 = compute_schedule_signature([(e.course_code, e.professor_name) for e in entries])
        sig2 = compute_schedule_signature([(e.course_code, e.professor_name) for e in reversed(entries)])
        assert sig1 == sig2

    @pytest.mark.asyncio
    async def test_fast_path_returns_prebuilt_without_pipeline(self):
        """
        When known_schedules has a matching row, research_courses() should return
        the stored payload and never invoke the tiered pipeline or Browser Use.
        """
        entries = [_make_entry("CSE 110"), _make_entry("MATH 20C", "Jones")]
        prebuilt = _make_prebuilt_response(entries)
        sig = compute_schedule_signature([(e.course_code, e.professor_name) for e in entries])

        # The stored row returns a serialized BatchResearchResponse
        cached_fit = {
            "fitness_score": 6.8,
            "fitness_max": 10.0,
            "trend_label": "Manageable",
            "categories": [],
            "alerts": [],
            "recommendation": ["Keep your current load balance"],
            "study_hours_min": 12,
            "study_hours_max": 18,
            "user_input_feedback": None,
        }
        mock_known_row = {
            "assembled_payload": prebuilt.model_dump(mode="json"),
            "fit_evaluation": cached_fit,
            "updated_at": "2026-01-01T00:00:00+00:00",
        }

        with (
            patch("app.services.course_research.get_supabase_client") as mock_client_fn,
            patch("app.services.course_research.get_known_schedule", return_value=mock_known_row) as mock_get_known,
            patch("app.services.course_research._research_via_tiered_pipeline") as mock_tiered,
            patch("app.services.course_research.create_browser_use_client") as mock_bu,
        ):
            mock_client_fn.return_value = MagicMock()

            from app.services.course_research import research_courses

            result = await research_courses(
                entries,
                input_source="test",
                force_refresh=False,
            )

        # Fast path was used — signature was looked up
        mock_get_known.assert_called_once_with(mock_client_fn.return_value, sig)
        # Tiered pipeline and Browser Use were NOT called
        mock_tiered.assert_not_called()
        mock_bu.assert_not_called()
        # Result matches the prebuilt payload
        assert result.input_source == "known_schedules"
        assert result.course_count == 2
        assert result.fit_evaluation == cached_fit

    @pytest.mark.asyncio
    async def test_fast_path_backfills_missing_fit_evaluation(self):
        """
        If a known_schedules row exists but has no fit_evaluation (older rows),
        fast-path should compute and persist it once, then return it.
        """
        entries = [_make_entry("CSE 110"), _make_entry("MATH 20C", "Jones")]
        prebuilt = _make_prebuilt_response(entries)

        mock_known_row = {
            "assembled_payload": prebuilt.model_dump(mode="json"),
            "fit_evaluation": None,
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        fit_payload = {
            "fitness_score": 6.8,
            "fitness_max": 10.0,
            "trend_label": "Manageable",
            "categories": [],
            "alerts": [],
            "recommendation": ["Keep your current load balance"],
            "study_hours_min": 12,
            "study_hours_max": 18,
            "user_input_feedback": None,
        }
        mock_fit = MagicMock()
        mock_fit.model_dump.return_value = fit_payload

        with (
            patch("app.services.course_research.get_supabase_client") as mock_client_fn,
            patch("app.services.course_research.get_known_schedule", return_value=mock_known_row),
            patch("app.services.fit_analysis.analyze_fit", return_value=mock_fit) as mock_analyze_fit,
            patch("app.services.course_research.upsert_known_schedule") as mock_upsert_known,
            patch("app.services.course_research._research_via_tiered_pipeline") as mock_tiered,
            patch("app.services.course_research.create_browser_use_client") as mock_bu,
        ):
            mock_client_fn.return_value = MagicMock()

            from app.services.course_research import research_courses

            result = await research_courses(
                entries,
                input_source="test",
                force_refresh=False,
            )

        mock_analyze_fit.assert_called_once()
        mock_upsert_known.assert_called_once()
        mock_tiered.assert_not_called()
        mock_bu.assert_not_called()
        assert result.fit_evaluation == fit_payload

    @pytest.mark.asyncio
    async def test_force_refresh_bypasses_fast_path(self):
        """force_refresh=True must skip known_schedules entirely."""
        entries = [_make_entry("CSE 110")]

        with (
            patch("app.services.course_research.get_supabase_client") as mock_client_fn,
            patch("app.services.course_research.get_known_schedule") as mock_get_known,
            patch("app.services.course_research.research_course", new_callable=AsyncMock) as mock_rc,
        ):
            mock_client_fn.return_value = MagicMock()
            mock_rc.return_value = CourseResearchResult(
                course_code="CSE 110",
                cache_hit=False,
                cache_id="abc",
            )

            from app.services.course_research import research_courses

            await research_courses(entries, input_source="test", force_refresh=True)

        # known_schedules was NOT consulted
        mock_get_known.assert_not_called()

    @pytest.mark.asyncio
    async def test_cache_miss_calls_pipeline(self):
        """When known_schedules misses, research_course() is invoked normally."""
        entries = [_make_entry("CSE 110")]

        with (
            patch("app.services.course_research.get_supabase_client") as mock_client_fn,
            patch("app.services.course_research.get_known_schedule", return_value=None),
            patch("app.services.course_research.research_course", new_callable=AsyncMock) as mock_rc,
        ):
            mock_client_fn.return_value = MagicMock()
            mock_rc.return_value = CourseResearchResult(
                course_code="CSE 110",
                cache_hit=False,
                cache_id="abc",
            )

            from app.services.course_research import research_courses

            result = await research_courses(entries, input_source="test", force_refresh=False)

        # research_course was called for the one course
        mock_rc.assert_called_once()
        assert result.course_count == 1
