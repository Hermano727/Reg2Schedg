"""
Fit-analysis calibration tests.

These are *integration* tests — they call the real Gemini API and verify that
fitness_score lands within the expected range for canonical schedule scenarios.

Run with:
    cd services/api
    python -m pytest tests/test_fit_calibration.py -v -m calibration

Each scenario documents:
  - What courses are in the schedule
  - Why the expected range is what it is
  - What failure would mean (prompt regression, rubric drift, etc.)

Add new scenarios whenever a real-world mis-score is reported.
"""

import os

import pytest

from app.models.course_parse import SectionMeeting
from app.models.research import CourseLogistics, CourseResearchResult, RateMyProfessorStats
from app.services.fit_analysis import analyze_fit

# Skip the entire module when GEMINI_API_KEY is absent (e.g. CI without secrets).
# To run locally: ensure GEMINI_API_KEY is set in your .env or shell.
# To run in CI: add GEMINI_API_KEY as a repository secret and pass it to the job.
pytestmark = pytest.mark.skipif(
    not os.getenv("GEMINI_API_KEY"),
    reason="GEMINI_API_KEY not set — skipping Gemini integration tests",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _meeting(section_type: str, days: str, start: str, end: str) -> SectionMeeting:
    return SectionMeeting(
        section_type=section_type,
        days=days,
        start_time=start,
        end_time=end,
        location="TBD",
    )


def _logistics(
    rmp_difficulty: float | None = None,
    attendance: bool | None = None,
    textbook: bool | None = None,
    podcasts: bool | None = None,
    grade_breakdown: str | None = None,
) -> CourseLogistics:
    rmp = RateMyProfessorStats(difficulty=rmp_difficulty) if rmp_difficulty is not None else RateMyProfessorStats()
    return CourseLogistics(
        rate_my_professor=rmp,
        attendance_required=attendance,
        textbook_required=textbook,
        podcasts_available=podcasts,
        grade_breakdown=grade_breakdown,
    )


def _course(
    code: str,
    professor: str,
    meetings: list[SectionMeeting],
    logistics: CourseLogistics | None = None,
) -> CourseResearchResult:
    return CourseResearchResult(
        course_code=code,
        professor_name=professor,
        meetings=meetings,
        logistics=logistics,
    )


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

# Scenario A: The user-reported mis-score.
# CSE 120 (OS) + MATH 103B (Modern Algebra) + CSE 123 (Networks)
# All are notoriously hard upper-div UCSD courses with RMP difficulty ~4.2+
# Expected: 5–7. Getting 3.5 was a regression caused by career alignment
# deflating the score. This test guards against that.
SCENARIO_A_HARD_3 = [
    _course(
        "CSE 120",
        "Voelker",
        [
            _meeting("Lecture", "TuTh", "11:00 AM", "12:20 PM"),
            _meeting("Discussion", "F", "10:00 AM", "10:50 AM"),
        ],
        _logistics(rmp_difficulty=4.3, attendance=False, textbook=True, podcasts=True,
                   grade_breakdown="PA 30%, Midterm 30%, Final 40%"),
    ),
    _course(
        "MATH 103B",
        "Rogalski",
        [
            _meeting("Lecture", "MWF", "09:00 AM", "09:50 AM"),
        ],
        _logistics(rmp_difficulty=4.1, attendance=False, textbook=True, podcasts=False,
                   grade_breakdown="HW 20%, Midterm 40%, Final 40%"),
    ),
    _course(
        "CSE 123",
        "Schulman",
        [
            _meeting("Lecture", "MWF", "02:00 PM", "02:50 PM"),
            _meeting("Discussion", "W", "04:00 PM", "04:50 PM"),
        ],
        _logistics(rmp_difficulty=4.0, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="PA 40%, Midterm 25%, Final 35%"),
    ),
]

# Scenario B: Same hard 3-course schedule but student has CS major + industry
# career goal. Career alignment must NOT reduce the score vs scenario A.
SCENARIO_B_HARD_3_WITH_CS_PROFILE = SCENARIO_A_HARD_3  # same courses
CS_INDUSTRY_CONTEXT = {
    "major": "Computer Science",
    "careerPath": "Software Engineering",
    "skillPreference": "hands-on / applied",
    "biggestConcerns": ["heavy workload", "gpa protection"],
}

# Scenario C: 3 easy courses — should land 1–3.
SCENARIO_C_EASY_3 = [
    _course(
        "HUM 1",
        "Staff",
        [_meeting("Lecture", "MWF", "10:00 AM", "10:50 AM")],
        _logistics(rmp_difficulty=2.1, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="Essays 60%, Participation 40%"),
    ),
    _course(
        "ANTH 2",
        "Staff",
        [_meeting("Lecture", "TuTh", "09:30 AM", "10:50 AM")],
        _logistics(rmp_difficulty=1.9, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="Quizzes 30%, Final 70%"),
    ),
    _course(
        "TDGE 11",
        "Staff",
        [_meeting("Lecture", "TuTh", "12:30 PM", "01:50 PM")],
        _logistics(rmp_difficulty=2.0, attendance=True, textbook=False, podcasts=True,
                   grade_breakdown="Participation 50%, Project 50%"),
    ),
]

# Scenario D: 4 moderate courses, student-friendly logistics — should land 4–6.
# All courses have podcasts available and no mandatory attendance. RMP avg ~3.3.
# ECE 101 has a lab but otherwise forgiving policies, representing a genuinely moderate load.
SCENARIO_D_MODERATE_4 = [
    _course(
        "CSE 100",
        "Larkins",
        [
            _meeting("Lecture", "MWF", "11:00 AM", "11:50 AM"),
            _meeting("Discussion", "Tu", "12:00 PM", "12:50 PM"),
        ],
        _logistics(rmp_difficulty=3.4, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="PA 30%, Midterms 35%, Final 35%"),
    ),
    _course(
        "COGS 108",
        "Voytek",
        [_meeting("Lecture", "TuTh", "03:30 PM", "04:50 PM")],
        _logistics(rmp_difficulty=3.1, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="Labs 50%, Project 30%, HW 20%"),
    ),
    _course(
        "MATH 180A",
        "Fan",
        [_meeting("Lecture", "MWF", "01:00 PM", "01:50 PM")],
        _logistics(rmp_difficulty=3.5, attendance=False, textbook=True, podcasts=True,
                   grade_breakdown="HW 20%, Midterm 40%, Final 40%"),
    ),
    _course(
        "ECON 100A",
        "Staff",
        [_meeting("Lecture", "TuTh", "09:30 AM", "10:50 AM")],
        _logistics(rmp_difficulty=3.2, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="HW 30%, Midterm 35%, Final 35%"),
    ),
]

# Scenario D2: 4 courses with harsh logistics — lab course, no podcasts, mandatory attendance.
# This is a legitimately harder 4-course load despite moderate RMP (~3.3).
# Expected: 6–8. The ECE 101 lab (3h) + no podcasts + attendance pushes well past baseline.
SCENARIO_D2_HARSH_LOGISTICS_4 = [
    _course(
        "CSE 100",
        "Larkins",
        [
            _meeting("Lecture", "MWF", "11:00 AM", "11:50 AM"),
            _meeting("Discussion", "Tu", "12:00 PM", "12:50 PM"),
        ],
        _logistics(rmp_difficulty=3.4, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="PA 30%, Midterms 35%, Final 35%"),
    ),
    _course(
        "COGS 108",
        "Voytek",
        [_meeting("Lecture", "TuTh", "03:30 PM", "04:50 PM")],
        _logistics(rmp_difficulty=3.1, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="Labs 50%, Project 30%, HW 20%"),
    ),
    _course(
        "MATH 180A",
        "Fan",
        [_meeting("Lecture", "MWF", "01:00 PM", "01:50 PM")],
        _logistics(rmp_difficulty=3.6, attendance=False, textbook=True, podcasts=False,
                   grade_breakdown="HW 20%, Midterm 40%, Final 40%"),
    ),
    _course(
        "ECE 101",
        "Staff",
        [
            _meeting("Lecture", "TuTh", "08:00 AM", "09:20 AM"),
            _meeting("Lab", "W", "01:00 PM", "03:50 PM"),
        ],
        _logistics(rmp_difficulty=3.2, attendance=True, textbook=True, podcasts=False,
                   grade_breakdown="Lab 40%, Midterm 25%, Final 35%"),
    ),
]

# Scenario E: 5 hard courses — should land 7–9.
SCENARIO_E_HEAVY_5 = [
    _course(
        "CSE 130",
        "Jhala",
        [
            _meeting("Lecture", "MWF", "10:00 AM", "10:50 AM"),
            _meeting("Discussion", "Tu", "10:00 AM", "10:50 AM"),
        ],
        _logistics(rmp_difficulty=4.5, attendance=False, textbook=False, podcasts=True,
                   grade_breakdown="PA 40%, Midterm 30%, Final 30%"),
    ),
    _course(
        "CSE 101",
        "Impagliazzo",
        [_meeting("Lecture", "MWF", "11:00 AM", "11:50 AM")],
        _logistics(rmp_difficulty=4.2, attendance=False, textbook=True, podcasts=False,
                   grade_breakdown="HW 30%, Midterms 35%, Final 35%"),
    ),
    _course(
        "MATH 102",
        "Tesler",
        [_meeting("Lecture", "MWF", "02:00 PM", "02:50 PM")],
        _logistics(rmp_difficulty=4.0, attendance=False, textbook=True, podcasts=False,
                   grade_breakdown="HW 25%, Midterm 35%, Final 40%"),
    ),
    _course(
        "CSE 110",
        "Griswold",
        [
            _meeting("Lecture", "TuTh", "12:30 PM", "01:50 PM"),
            _meeting("Discussion", "F", "02:00 PM", "02:50 PM"),
        ],
        _logistics(rmp_difficulty=3.8, attendance=True, textbook=False, podcasts=True,
                   grade_breakdown="Project 50%, HW 25%, Final 25%"),
    ),
    _course(
        "PHIL 28",
        "Staff",
        [_meeting("Lecture", "TuTh", "09:30 AM", "10:50 AM")],
        _logistics(rmp_difficulty=2.8, attendance=False, textbook=True, podcasts=True,
                   grade_breakdown="Essays 70%, Participation 30%"),
    ),
]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.calibration
class TestFitScoreCalibration:
    """
    Each test calls the real Gemini API. Run with -m calibration.
    Allowed tolerance is ±0.5 beyond the stated range boundary.
    """

    TOLERANCE = 0.5

    def _check(self, score: float, lo: float, hi: float, label: str) -> None:
        lo_t = lo - self.TOLERANCE
        hi_t = hi + self.TOLERANCE
        assert lo_t <= score <= hi_t, (
            f"{label}: fitness_score {score:.1f} outside [{lo_t:.1f}, {hi_t:.1f}] "
            f"(target {lo}–{hi}, tolerance ±{self.TOLERANCE})"
        )

    def test_hard_3_courses_no_profile(self):
        """
        CSE 120 + MATH 103B + CSE 123 without any user profile.
        Avg RMP ~4.1 → expect 5–7 per calibration rubric row '3, ≥4.0 (hard)'.
        Regression guard: previously returned 3.5.
        """
        result = analyze_fit(SCENARIO_A_HARD_3)
        self._check(result.fitness_score, lo=5.0, hi=7.0, label="hard_3_no_profile")
        assert result.user_input_feedback is None

    def test_hard_3_courses_career_alignment_does_not_reduce_score(self):
        """
        Same courses with a CS/industry profile that aligns perfectly.
        Score must be within ±1.0 of the no-profile score — career alignment
        must not deflate fitness_score.
        """
        no_profile = analyze_fit(SCENARIO_B_HARD_3_WITH_CS_PROFILE)
        with_profile = analyze_fit(SCENARIO_B_HARD_3_WITH_CS_PROFILE, user_context=CS_INDUSTRY_CONTEXT)
        self._check(with_profile.fitness_score, lo=5.0, hi=7.0,
                    label="hard_3_cs_profile")
        delta = abs(with_profile.fitness_score - no_profile.fitness_score)
        assert delta <= 1.0, (
            f"Career alignment changed score by {delta:.1f} — "
            f"no_profile={no_profile.fitness_score:.1f}, "
            f"with_profile={with_profile.fitness_score:.1f}"
        )
        assert with_profile.user_input_feedback is not None

    def test_easy_3_courses(self):
        """
        3 low-RMP (~2.0) gen-ed courses → expect 1–3.
        """
        result = analyze_fit(SCENARIO_C_EASY_3)
        self._check(result.fitness_score, lo=1.0, hi=3.0, label="easy_3")

    def test_moderate_4_courses(self):
        """
        4 courses, avg RMP ~3.3, all with podcasts and no mandatory attendance.
        Logistics are student-friendly → expect 4–6.
        """
        result = analyze_fit(SCENARIO_D_MODERATE_4)
        self._check(result.fitness_score, lo=4.0, hi=6.0, label="moderate_4")

    def test_harsh_logistics_4_courses(self):
        """
        Same 4-course RMP profile (~3.3) but ECE 101 has a 3h lab, mandatory
        attendance, required textbook, and no podcasts. MATH 180A also has no
        podcasts. Logistics burden pushes well past the moderate baseline → 6–8.
        This validates that logistics signals (not just RMP) affect the score.
        """
        result = analyze_fit(SCENARIO_D2_HARSH_LOGISTICS_4)
        self._check(result.fitness_score, lo=6.0, hi=8.0, label="harsh_logistics_4")

    def test_heavy_5_courses(self):
        """
        5 courses, avg RMP ~3.9, mix of hard CS + 1 easier course → expect 7–9.
        """
        result = analyze_fit(SCENARIO_E_HEAVY_5)
        self._check(result.fitness_score, lo=7.0, hi=9.0, label="heavy_5")

    def test_5_always_outscores_3_hard(self):
        """
        Monotonicity: 5-course heavy schedule must score higher than 3-course hard schedule.
        """
        score_3 = analyze_fit(SCENARIO_A_HARD_3).fitness_score
        score_5 = analyze_fit(SCENARIO_E_HEAVY_5).fitness_score
        assert score_5 > score_3, (
            f"Monotonicity violated: 5-course ({score_5:.1f}) ≤ 3-course ({score_3:.1f})"
        )

    def test_categories_present_and_labeled(self):
        """
        All 5 category labels must be returned in correct order.
        """
        result = analyze_fit(SCENARIO_D_MODERATE_4)
        expected_labels = ["Workload", "Schedule Fit", "GPA Risk", "Life Balance", "Commute Load"]
        actual_labels = [c.label for c in result.categories]
        assert actual_labels == expected_labels, f"Category labels wrong: {actual_labels}"

    def test_study_hours_range_is_positive(self):
        """
        study_hours_min and study_hours_max must be positive and min < max.
        """
        result = analyze_fit(SCENARIO_A_HARD_3)
        assert result.study_hours_min > 0
        assert result.study_hours_max > result.study_hours_min

    def test_user_feedback_structure_with_profile(self):
        """
        With a profile, user_input_feedback must be a non-null object with non-empty lists.
        """
        result = analyze_fit(SCENARIO_B_HARD_3_WITH_CS_PROFILE, user_context=CS_INDUSTRY_CONTEXT)
        assert result.user_input_feedback is not None
        assert len(result.user_input_feedback.academic_alignment) >= 1
        assert len(result.user_input_feedback.practical_risks) >= 1
