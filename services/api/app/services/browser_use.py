"""
Browser Use Cloud integration: client setup, task prompt construction,
JSON output parsing, and single-course logistics execution.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from pydantic import ValidationError

from app.models.research import (
    CourseLogistics,
    CourseRunCost,
    CourseRunOutcome,
    CourseResearchRunError,
)
from app.utils.normalize import normalize_course_code, normalize_professor_name


# ---------------------------------------------------------------------------
# Client setup
# ---------------------------------------------------------------------------

def resolve_browser_use_api_key() -> str:
    for env_name in ("BROWSER_USE_API_KEY", "BROWSERUSE_API_KEY", "BROWSER_USE_KEY"):
        api_key = os.getenv(env_name)
        if api_key:
            if not api_key.startswith("bu_"):
                raise RuntimeError(
                    f"{env_name} was found, but Browser Use Cloud keys should start with 'bu_'."
                )
            os.environ["BROWSER_USE_API_KEY"] = api_key
            return api_key
    raise RuntimeError(
        "Missing Browser Use API key. Set BROWSER_USE_API_KEY in your environment or .env file."
    )


def create_browser_use_client(api_key: str) -> Any:
    try:
        from browser_use_sdk.v3 import AsyncBrowserUse
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Browser Use Cloud SDK v3 is not available in this environment. "
            "Run `pip install --upgrade browser-use-sdk` and try again."
        ) from exc
    return AsyncBrowserUse(api_key=api_key)


# ---------------------------------------------------------------------------
# Task prompt
# ---------------------------------------------------------------------------

def _normalize_param(value: str | None, *, fallback: str) -> str:
    # Delegates to canonical normalizers; keeps fallback for unknown values.
    cleaned = normalize_course_code(value) if value else ""
    return cleaned or fallback


def build_task(course: str, instructor: str | None) -> str:
    subject = _normalize_param(course, fallback="unknown course")
    normalized_instructor = _normalize_param(instructor, fallback="unknown")
    if normalized_instructor == "unknown":
        instructor_line = "The instructor is unknown."
        instructor_rule = (
            "- The instructor is unknown, so leave Rate My Professors fields null unless an exact "
            "UCSD match is obvious.\n"
        )
    else:
        instructor_line = f"The instructor is {normalized_instructor} at UCSD."
        instructor_rule = (
            f"- The instructor is {normalized_instructor}. Use that exact UCSD instructor for Rate "
            "My Professors.\n"
        )

    return (
        f"Research {subject} at UCSD. {instructor_line}\n\n"
        "Your primary goal is to find real student opinions and course details. "
        "Do NOT stop early — work through all source types before returning.\n\n"
        "=== STEP 1: Reddit (do this first) ===\n"
        f"Search Google for: site:reddit.com/r/ucsd {subject}\n"
        f"Also try: \"{subject} ucsd\" site:reddit.com\n"
        "- If either search returns thread titles, CLICK the most relevant ones and read them.\n"
        "- If no results on first try, search directly at reddit.com/r/ucsd using the search bar.\n"
        "- Try alternate queries: just the course number (e.g. 'CSE 123'), or the course topic.\n"
        "- When you open a thread: read the post body AND the top 3 upvoted comments.\n"
        "- If a sign-in or age-gate appears, close/dismiss it and scroll to the content.\n"
        "- Collect verbatim quotes — exact words from the post or comment, not a paraphrase.\n"
        "- Record the direct thread URL (permalink) for each quote.\n"
        "- AIM FOR AT LEAST 2 Reddit evidence items if any threads exist.\n\n"
        "=== STEP 2: Official UCSD sources ===\n"
        f"Search Google for: {subject} UCSD syllabus site:ucsd.edu\n"
        "Also try searching for lecture slides, course pages, or podcast pages.\n"
        "- If you find a course page matching both the course code AND the instructor, record it.\n"
        "- Extract a verbatim quote from any syllabus, course page, or lecture slide you open.\n\n"
        "=== STEP 3: Rate My Professors ===\n"
        f"Search Rate My Professors for \"{normalized_instructor} UCSD\" if instructor is known.\n"
        "- Record rating, difficulty, would_take_again_percent, and the RMP page URL.\n\n"
        "=== OUTPUT FIELDS ===\n"
        "Return ONLY a JSON object with these fields:\n"
        "- attendance_required: true or false or null\n"
        "- grade_breakdown: one compact string like 'HW 20%, Midterm 30%, Final 50%' or null\n"
        "- course_webpage_url: URL of the human-readable course/syllabus page, or null\n"
        "- textbook_required: true or false or null\n"
        "- podcasts_available: true or false or null\n"
        "- student_sentiment_summary: one balanced sentence summarizing Reddit + RMP opinions\n"
        "- rate_my_professor: { rating, would_take_again_percent, difficulty, url } — use null for unknown fields\n"
        "- evidence: array of objects. Each object:\n"
        "    { source, content, url, relevance_score }\n"
        "    source: one of 'Reddit Insight', 'Syllabus Snippet', 'Course Page', 'RMP'\n"
        "    content: EXACT verbatim quote — never paraphrase\n"
        "    url: permalink URL to the source (null if unavailable)\n"
        "    relevance_score: 0.0 to 1.0\n"
        "  IMPORTANT: If you read any Reddit thread, evidence MUST have at least one Reddit entry.\n"
        "  If you found 0 evidence items but saw relevant thread titles, go back and click them.\n"
        "- professor_info_found: false ONLY if you found zero Reddit posts, zero RMP data, AND\n"
        "  zero syllabus/course pages specifically mentioning this instructor. Otherwise true.\n"
        "- general_course_overview: 2-3 sentences about course content from the UCSD catalog\n"
        "  (populate regardless of professor_info_found — always useful context).\n"
        "- general_professor_overview: 1-2 sentences about the professor's background\n"
        "  (populate regardless of professor_info_found).\n\n"
        "=== FALLBACK when professor_info_found would be false ===\n"
        "Before setting professor_info_found=false, try these extra searches:\n"
        f"1. Google: \"{subject} ucsd reddit\" (without site: restriction)\n"
        f"2. Google: \"{subject} professor review ucsd\"\n"
        f"3. Rate My Professors: search by professor last name only.\n"
        "4. UCSD course catalog page for the course description.\n"
        "5. UCSD faculty page for the instructor.\n"
        "Even if professor_info_found ends up false, always populate general_course_overview "
        "and general_professor_overview, and try to get at least one evidence item from any source.\n\n"
        "=== RULES ===\n"
        "- Prefer official UCSD pages for attendance, grading, textbook, podcasts.\n"
        "- For course_webpage_url: must be a human-readable page (not .csv/.xlsx/export/download links).\n"
        "- Use Reddit + RMP for student_sentiment_summary — never official pages.\n"
        f"{instructor_rule}"
        "- Only use an official page for logistics if it matches BOTH the course code AND the instructor.\n"
        "- If a page matches the course but a different instructor, skip it for logistics; still ok for general course info.\n"
        "- Prefer the most recent quarter for official pages, but instructor match > recency.\n"
        "- Return raw JSON only. No markdown fences, no explanations, no extra text.\n"
    )


# ---------------------------------------------------------------------------
# Output parsing
# ---------------------------------------------------------------------------

def _summarize_output(output: Any) -> str:
    if output is None:
        return "None"
    if isinstance(output, str):
        return repr(output[:200])
    return repr(output)[:200]


def _extract_first_json_object(text: str) -> str | None:
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start: index + 1]
    return None


def _iter_json_candidates(text: str) -> list[str]:
    stripped = text.strip()
    candidates: list[str] = [stripped]
    for match in re.finditer(r"```(?:json)?\s*(.*?)```", stripped, re.DOTALL | re.IGNORECASE):
        block = match.group(1).strip()
        if block:
            candidates.append(block)
    extracted = _extract_first_json_object(stripped)
    if extracted:
        candidates.append(extracted)
    seen: set[str] = set()
    unique: list[str] = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    return unique


def parse_course_logistics_output(raw_output: Any) -> CourseLogistics:
    if isinstance(raw_output, CourseLogistics):
        return raw_output
    if isinstance(raw_output, str):
        last_error: ValidationError | None = None
        for candidate in _iter_json_candidates(raw_output):
            try:
                return CourseLogistics.model_validate_json(candidate)
            except ValidationError as exc:
                last_error = exc
            try:
                return CourseLogistics.model_validate(json.loads(candidate))
            except (ValidationError, json.JSONDecodeError):
                continue
        if last_error is not None:
            raise last_error
        return CourseLogistics.model_validate_json(raw_output)
    return CourseLogistics.model_validate(raw_output)


# ---------------------------------------------------------------------------
# Cost helpers
# ---------------------------------------------------------------------------

def _parse_cost(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_cost_metadata(result: Any) -> CourseRunCost:
    return CourseRunCost(
        session_id=str(getattr(result, "id", "")) or None,
        status=str(getattr(result, "status", "")) or None,
        llm_cost_usd=_parse_cost(getattr(result, "llm_cost_usd", None)),
        browser_cost_usd=_parse_cost(getattr(result, "browser_cost_usd", None)),
        proxy_cost_usd=_parse_cost(getattr(result, "proxy_cost_usd", None)),
        total_cost_usd=_parse_cost(getattr(result, "total_cost_usd", None)),
        data_source="browser_use",
    )


# ---------------------------------------------------------------------------
# Single-course execution
# ---------------------------------------------------------------------------

async def run_course_logistics(
    client: Any,
    course_code: str,
    instructor: str | None,
    model: str,
) -> CourseRunOutcome:
    run = client.run(build_task(course_code, instructor), model=model)
    async for _ in run:
        pass

    if run.result is None:
        raise CourseResearchRunError("Browser Use run completed without a result.")

    cost = build_cost_metadata(run.result)
    raw_output = getattr(run.result, "output", None)

    try:
        logistics = parse_course_logistics_output(raw_output)
    except ValidationError as exc:
        status = getattr(run.result, "status", None)
        last_step_summary = getattr(run.result, "last_step_summary", None)
        raise CourseResearchRunError(
            "Browser Use returned non-structured output "
            f"(status={status!r}, last_step_summary={last_step_summary!r}, "
            f"output={_summarize_output(raw_output)}). Validation error: {exc}",
            cost=cost,
        ) from exc

    return CourseRunOutcome(logistics=logistics, cost=cost)
