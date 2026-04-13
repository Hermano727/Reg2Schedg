"""
Canonical normalization helpers shared across the entire backend.

All modules that need to normalize course codes or professor names must import
from here — never reimplement locally — so that cache keys, signature hashes,
and DB lookups are always identical.
"""

from __future__ import annotations

import hashlib


def normalize_course_code(course_code: str) -> str:
    """
    'cse  110 ' → 'CSE 110'
    Collapses internal whitespace and upper-cases.
    """
    return " ".join(course_code.upper().split())


def normalize_professor_name(professor_name: str | None) -> str:
    """
    'Bryan  chin' → 'BRYAN CHIN'
    Accepts None → returns ''.
    """
    return " ".join((professor_name or "").upper().split())


def compute_schedule_signature(entries: list[tuple[str, str | None]]) -> str:
    """
    Deterministically hash a list of (course_code, professor_name) pairs into a
    hex SHA-256 signature.

    Input is first normalized and lexicographically sorted so that the same set of
    courses always produces the same signature regardless of upload order.

    Args:
        entries: list of (course_code, professor_name_or_None) tuples.

    Returns:
        64-char lowercase hex SHA-256 digest.

    Example:
        >>> compute_schedule_signature([("CSE 110", "Smith"), ("MATH 20C", None)])
        'abc123...'
    """
    normalized = sorted(
        f"{normalize_course_code(code)}|{normalize_professor_name(prof)}"
        for code, prof in entries
    )
    raw = "|".join(normalized)
    return hashlib.sha256(raw.encode()).hexdigest()
