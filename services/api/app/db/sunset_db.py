"""
SunSET grade distribution DB queries and professor name matching logic.
"""

from __future__ import annotations

import re

from supabase import Client

from app.models.domain import SunsetGradeDistributionRow
from app.utils.normalize import normalize_professor_name as _normalize_professor_name  # noqa: F401

TERM_LABEL_PATTERN = re.compile(r"\b(winter|spring|summer|fall)\s+(?:qtr\s+)?(\d{4})\b", re.IGNORECASE)
TERM_ORDER = {"winter": 1, "spring": 2, "summer": 3, "fall": 4}


def _split_professor_name(value: str | None) -> tuple[str, str]:
    normalized = _normalize_professor_name(value)
    if not normalized:
        return "", ""
    if "," in normalized:
        last_name, remainder = normalized.split(",", 1)
        first_name = remainder.strip().split()[0] if remainder.strip() else ""
        return last_name.strip(), first_name
    parts = normalized.split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[-1], parts[0]


def _professor_match_score(requested: str | None, candidate: str | None) -> int:
    req = _normalize_professor_name(requested)
    cand = _normalize_professor_name(candidate)
    if not req:
        return 1 if cand else 0
    if not cand:
        return 0
    if req == cand:
        return 4
    req_last, req_first = _split_professor_name(req)
    cand_last, cand_first = _split_professor_name(cand)
    if req_last and req_last == cand_last:
        if req_first and cand_first:
            if req_first == cand_first:
                return 3
            if req_first.startswith(cand_first) or cand_first.startswith(req_first):
                return 2
            if req_first[0] == cand_first[0]:
                return 1
        return 1
    return 0


def _sunset_recency_key(term_label: str | None, submission_time: str | None) -> tuple[int, int, str]:
    year = season = 0
    if term_label:
        match = TERM_LABEL_PATTERN.search(term_label)
        if match:
            season = TERM_ORDER.get(match.group(1).lower(), 0)
            year = int(match.group(2))
    return year, season, submission_time or ""


def get_sunset_grade_distribution(
    client: Client,
    *,
    course_code: str,
    professor_name: str | None,
) -> tuple[SunsetGradeDistributionRow, bool] | tuple[None, bool]:
    """
    Returns (row, is_cross_course_fallback).
    First tries to find a row for (course_code, professor_name).
    If no professor-matching row exists for that course, falls back to any course
    taught by the same professor (cross-course fallback).
    """
    from app.utils.normalize import normalize_course_code

    response = (
        client.table("sunset_grade_distributions")
        .select("*")
        .eq("normalized_course_code", normalize_course_code(course_code))
        .limit(200)
        .execute()
    )

    if response.data:
        rows = [SunsetGradeDistributionRow.model_validate(row) for row in response.data]
        exact_or_close: list[tuple[int, tuple[int, int, str], SunsetGradeDistributionRow]] = []
        any_course_fallback: list[tuple[int, tuple[int, int, str], SunsetGradeDistributionRow]] = []

        for row in rows:
            score = _professor_match_score(professor_name, row.professor_name)
            entry = (score, _sunset_recency_key(row.term_label, row.submission_time), row)
            if score > 0:
                exact_or_close.append(entry)
            elif not _normalize_professor_name(professor_name):
                any_course_fallback.append(entry)

        ranked = exact_or_close or any_course_fallback
        if ranked:
            ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
            return ranked[0][2], False

    # No match for this course — try any course taught by this professor
    if professor_name:
        norm_prof = _normalize_professor_name(professor_name)
        if norm_prof:
            prof_response = (
                client.table("sunset_grade_distributions")
                .select("*")
                .eq("normalized_professor_name", norm_prof)
                .limit(100)
                .execute()
            )
            if prof_response.data:
                prof_rows = [SunsetGradeDistributionRow.model_validate(r) for r in prof_response.data]
                # Pick the most recent row (any course)
                prof_rows.sort(
                    key=lambda r: _sunset_recency_key(r.term_label, r.submission_time),
                    reverse=True,
                )
                return prof_rows[0], True

    return None, False
