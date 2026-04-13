"""
Unit tests for app.utils.normalize.

Run with:
    cd services/api
    python -m pytest tests/test_normalize.py -v
"""

import pytest
from app.utils.normalize import (
    normalize_course_code,
    normalize_professor_name,
    compute_schedule_signature,
)


class TestNormalizeCourseCode:
    def test_basic(self):
        assert normalize_course_code("cse 110") == "CSE 110"

    def test_extra_whitespace(self):
        assert normalize_course_code("  CSE   110  ") == "CSE 110"

    def test_already_normalized(self):
        assert normalize_course_code("MATH 20C") == "MATH 20C"

    def test_mixed_case(self):
        assert normalize_course_code("Cogs 108") == "COGS 108"

    def test_single_token(self):
        assert normalize_course_code("physics") == "PHYSICS"


class TestNormalizeProfessorName:
    def test_basic(self):
        assert normalize_professor_name("Bryan Chin") == "BRYAN CHIN"

    def test_none(self):
        assert normalize_professor_name(None) == ""

    def test_empty_string(self):
        assert normalize_professor_name("") == ""

    def test_extra_whitespace(self):
        assert normalize_professor_name("  Smith   John  ") == "SMITH JOHN"

    def test_mixed_case(self):
        assert normalize_professor_name("jane doe") == "JANE DOE"


class TestComputeScheduleSignature:
    def test_deterministic(self):
        entries = [("CSE 110", "Smith"), ("MATH 20C", None)]
        sig1 = compute_schedule_signature(entries)
        sig2 = compute_schedule_signature(entries)
        assert sig1 == sig2

    def test_order_independent(self):
        """Same courses in different order → same signature."""
        e1 = [("CSE 110", "Smith"), ("MATH 20C", "Jones")]
        e2 = [("MATH 20C", "Jones"), ("CSE 110", "Smith")]
        assert compute_schedule_signature(e1) == compute_schedule_signature(e2)

    def test_normalized_inputs(self):
        """Unnormalized inputs should produce same signature as normalized."""
        e1 = [("cse  110", "smith"), ("math 20c", None)]
        e2 = [("CSE 110", "SMITH"), ("MATH 20C", None)]
        assert compute_schedule_signature(e1) == compute_schedule_signature(e2)

    def test_different_courses(self):
        """Different course sets → different signatures."""
        e1 = [("CSE 110", "Smith")]
        e2 = [("CSE 120", "Smith")]
        assert compute_schedule_signature(e1) != compute_schedule_signature(e2)

    def test_different_professors(self):
        """Same course, different professor → different signature."""
        e1 = [("CSE 110", "Smith")]
        e2 = [("CSE 110", "Jones")]
        assert compute_schedule_signature(e1) != compute_schedule_signature(e2)

    def test_none_professor_vs_empty(self):
        """None professor normalized to '' same as explicit ''."""
        e1 = [("CSE 110", None)]
        e2 = [("CSE 110", "")]
        assert compute_schedule_signature(e1) == compute_schedule_signature(e2)

    def test_returns_hex_string(self):
        """Signature is a 64-char lowercase hex string."""
        sig = compute_schedule_signature([("CSE 110", "Smith")])
        assert len(sig) == 64
        assert all(c in "0123456789abcdef" for c in sig)

    def test_empty_list(self):
        """Empty list produces a stable hash."""
        sig = compute_schedule_signature([])
        assert len(sig) == 64

    def test_large_schedule(self):
        """Works correctly with a typical 5-course schedule."""
        entries = [
            ("CSE 110", "Smith"),
            ("MATH 20C", "Jones"),
            ("COGS 108", "Brown"),
            ("PHYS 2C", "Wilson"),
            ("BILD 1", "Taylor"),
        ]
        sig = compute_schedule_signature(entries)
        # Same result regardless of order
        import random
        shuffled = entries.copy()
        random.shuffle(shuffled)
        assert compute_schedule_signature(shuffled) == sig
