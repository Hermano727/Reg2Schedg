import asyncio
import json
import os
import re
from typing import Any, Callable

from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

from app.db.client import get_supabase_client
from app.db.service import get_course_research_cache, upsert_course_research_cache
from app.models.course_parse import CourseEntry, SectionMeeting


load_dotenv()


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


class CourseRunCost(BaseModel):
    session_id: str | None = None
    status: str | None = None
    llm_cost_usd: float | None = None
    browser_cost_usd: float | None = None
    proxy_cost_usd: float | None = None
    total_cost_usd: float | None = None


class CourseResearchResult(BaseModel):
    course_code: str
    course_title: str | None = None
    professor_name: str | None = None
    meetings: list[SectionMeeting] = Field(default_factory=list)
    logistics: CourseLogistics | None = None
    cache_hit: bool = False
    cached_at: str | None = None
    cache_error: str | None = None
    cost: CourseRunCost | None = None
    error: str | None = None


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


class CourseRunOutcome(BaseModel):
    logistics: CourseLogistics
    cost: CourseRunCost


class CourseResearchRunError(RuntimeError):
    def __init__(self, message: str, *, cost: CourseRunCost | None = None) -> None:
        super().__init__(message)
        self.cost = cost


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


def normalize_param(value: str | None, *, fallback: str) -> str:
    cleaned = " ".join((value or "").split())
    return cleaned or fallback


def parse_cost(value: Any) -> float | None:
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
        llm_cost_usd=parse_cost(getattr(result, "llm_cost_usd", None)),
        browser_cost_usd=parse_cost(getattr(result, "browser_cost_usd", None)),
        proxy_cost_usd=parse_cost(getattr(result, "proxy_cost_usd", None)),
        total_cost_usd=parse_cost(getattr(result, "total_cost_usd", None)),
    )


def summarize_costs(results: list[CourseResearchResult]) -> BatchCostSummary:
    summary = BatchCostSummary(run_count=len(results))
    for result in results:
        if not result.cost:
            continue
        summary.llm_cost_usd += result.cost.llm_cost_usd or 0.0
        summary.browser_cost_usd += result.cost.browser_cost_usd or 0.0
        summary.proxy_cost_usd += result.cost.proxy_cost_usd or 0.0
        summary.total_cost_usd += result.cost.total_cost_usd or 0.0
    return summary


def summarize_output(output: Any) -> str:
    if output is None:
        return "None"
    if isinstance(output, str):
        return repr(output[:200])
    return repr(output)[:200]


def extract_first_json_object(text: str) -> str | None:
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
                return text[start : index + 1]

    return None


def iter_json_candidates(text: str) -> list[str]:
    stripped = text.strip()
    candidates: list[str] = [stripped]

    for match in re.finditer(r"```(?:json)?\s*(.*?)```", stripped, re.DOTALL | re.IGNORECASE):
        block = match.group(1).strip()
        if block:
            candidates.append(block)

    extracted = extract_first_json_object(stripped)
    if extracted:
        candidates.append(extracted)

    # Keep order but avoid retrying the same exact candidate.
    unique_candidates: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            unique_candidates.append(candidate)
    return unique_candidates


def parse_course_logistics_output(raw_output: Any) -> CourseLogistics:
    if isinstance(raw_output, CourseLogistics):
        return raw_output
    if isinstance(raw_output, str):
        last_error: ValidationError | None = None
        for candidate in iter_json_candidates(raw_output):
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


def build_task(course: str, instructor: str | None) -> str:
    subject = normalize_param(course, fallback="unknown course")
    normalized_instructor = normalize_param(instructor, fallback="unknown")
    if normalized_instructor == "unknown":
        instructor_rule = (
            "- The instructor is unknown, so leave Rate My Professors fields null unless an exact "
            "UCSD match is obvious.\n"
        )
    else:
        instructor_rule = (
            f"- The instructor is {normalized_instructor}. Use that exact UCSD instructor for Rate "
            "My Professors.\n"
        )

    return (
        f"Find a fast, minimal data snapshot for {subject}.\n\n"
        "Priority sources:\n"
        "1. Official UCSD course webpage, syllabus, department page, or podcast/lecture page.\n"
        "2. Rate My Professors page for the UCSD instructor.\n"
        "3. Relevant Reddit discussions about the class or professor.\n"
        "4. Other public web pages only if the first three source types do not answer a field.\n\n"
        "Goal:\n"
        "Return only these fields:\n"
        "- attendance_required as true or false\n"
        "- grade_breakdown as one short string\n"
        "- course_webpage_url\n"
        "- textbook_required as true or false\n"
        "- podcasts_available as true or false\n"
        "- student_sentiment_summary as one short sentence based only on Reddit and Rate My Professors\n"
        "- rate_my_professor.rating\n"
        "- rate_my_professor.would_take_again_percent\n"
        "- rate_my_professor.difficulty\n"
        "- rate_my_professor.url\n\n"
        "Rules:\n"
        "- Prefer official UCSD pages for attendance, grading, textbook, podcasts, and course webpage.\n"
        "- Prefer Rate My Professors only for the instructor stats fields.\n"
        "- Use Reddit and Rate My Professors for student_sentiment_summary, not official UCSD pages.\n"
        "- Keep student_sentiment_summary concise and balanced, summarizing common opinions rather than a single extreme review.\n"
        f"{instructor_rule}"
        "- Only use an official course page or syllabus if the page clearly matches both the course code and the requested instructor.\n"
        "- If an official page is for the same course code but a different instructor, do not use it for course_webpage_url or any logistics fields.\n"
        "- Verify the instructor from the page header, syllabus, or another explicit page element before using that source.\n"
        "- If you cannot find an official UCSD page that matches the requested instructor, return null for course_webpage_url and any official-page-only fields you cannot confirm.\n"
        "- If multiple official UCSD pages match both the course and instructor, choose the most recent quarter.\n"
        "- Compare quarter recency chronologically. Example: Spring 2026 is newer than Winter 2026, which is newer than Fall 2025.\n"
        "- Prefer the most recent official UCSD offering that matches both the course and instructor, but instructor match is more important than quarter recency.\n"
        "- Use null for any field you cannot confirm quickly.\n"
        "- Keep the run short and stop once the requested fields are filled or confirmed unavailable.\n"
        "- Return raw JSON only. Do not include markdown fences, explanations, or extra text.\n"
    )


def dedupe_courses(courses: list[CourseEntry]) -> list[CourseEntry]:
    deduped: dict[tuple[str, str], CourseEntry] = {}
    for course in courses:
        key = (
            " ".join(course.course_code.upper().split()),
            " ".join(course.professor_name.upper().split()),
        )
        deduped.setdefault(key, course)
    return list(deduped.values())


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
            f"output={summarize_output(raw_output)}). Validation error: {exc}",
            cost=cost,
        ) from exc

    return CourseRunOutcome(logistics=logistics, cost=cost)


async def research_course(
    client: Any,
    cache_client: Any,
    entry: CourseEntry,
    model: str,
    semaphore: asyncio.Semaphore,
    index: int,
    total: int,
    progress: Callable[[str], None] | None = None,
) -> CourseResearchResult:
    label = entry.course_code if not entry.professor_name else f"{entry.course_code} / {entry.professor_name}"
    cache_error: str | None = None
    if progress:
        progress(f"[{index}/{total}] Researching {label}")

    try:
        cache_row = get_course_research_cache(
            cache_client,
            course_code=entry.course_code,
            professor_name=entry.professor_name or None,
        )
    except Exception as exc:
        cache_row = None
        cache_error = f"Cache lookup failed: {exc}"
        if progress:
            progress(f"[{index}/{total}] Cache lookup failed for {label}: {exc}")

    if cache_row is not None:
        try:
            cached_logistics = CourseLogistics.model_validate(cache_row.logistics)
            if progress:
                progress(f"[{index}/{total}] Cache hit for {label}")
            return CourseResearchResult(
                course_code=entry.course_code,
                course_title=entry.course_title or None,
                professor_name=entry.professor_name or None,
                meetings=entry.meetings,
                logistics=cached_logistics,
                cache_hit=True,
                cached_at=cache_row.updated_at,
                cache_error=cache_error,
            )
        except ValidationError as exc:
            cache_error = f"Invalid cache row: {exc}"
            if progress:
                progress(f"[{index}/{total}] Ignoring invalid cache row for {label}: {exc}")

    try:
        async with semaphore:
            outcome = await run_course_logistics(
                client=client,
                course_code=entry.course_code,
                instructor=entry.professor_name or None,
                model=model,
            )
    except CourseResearchRunError as exc:
        if progress:
            progress(f"[{index}/{total}] Failed {label}: {exc}")
        return CourseResearchResult(
            course_code=entry.course_code,
            course_title=entry.course_title or None,
            professor_name=entry.professor_name or None,
            meetings=entry.meetings,
            cache_error=cache_error,
            cost=exc.cost,
            error=str(exc),
        )
    except Exception as exc:
        if progress:
            progress(f"[{index}/{total}] Failed {label}: {exc}")
        return CourseResearchResult(
            course_code=entry.course_code,
            course_title=entry.course_title or None,
            professor_name=entry.professor_name or None,
            meetings=entry.meetings,
            cache_error=cache_error,
            error=str(exc),
        )

    cached_at: str | None = None
    try:
        saved_row = upsert_course_research_cache(
            cache_client,
            course_code=entry.course_code,
            professor_name=entry.professor_name or None,
            course_title=entry.course_title or None,
            logistics=outcome.logistics.model_dump(mode="json"),
            model=model,
        )
        cached_at = saved_row.updated_at
    except Exception as exc:
        cache_error = f"Cache write failed: {exc}"
        if progress:
            progress(f"[{index}/{total}] Cache write failed for {label}: {exc}")

    if progress:
        progress(f"[{index}/{total}] Finished {label}")

    return CourseResearchResult(
        course_code=entry.course_code,
        course_title=entry.course_title or None,
        professor_name=entry.professor_name or None,
        meetings=entry.meetings,
        logistics=outcome.logistics,
        cache_hit=False,
        cached_at=cached_at,
        cache_error=cache_error,
        cost=outcome.cost,
    )


async def research_courses(
    entries: list[CourseEntry],
    *,
    input_source: str,
    model: str = "claude-sonnet-4.6",
    concurrency: int = 0,
    progress: Callable[[str], None] | None = None,
) -> BatchResearchResponse:
    if concurrency < 0:
        raise RuntimeError("Concurrency must be 0 or greater.")

    unique_entries = dedupe_courses(entries)
    if not unique_entries:
        raise RuntimeError("No courses were found to research.")

    effective_concurrency = len(unique_entries) if concurrency == 0 else min(concurrency, len(unique_entries))
    client = create_browser_use_client(resolve_browser_use_api_key())
    cache_client = get_supabase_client()
    semaphore = asyncio.Semaphore(effective_concurrency)
    tasks = [
        research_course(
            client=client,
            cache_client=cache_client,
            entry=entry,
            model=model,
            semaphore=semaphore,
            index=index,
            total=len(unique_entries),
            progress=progress,
        )
        for index, entry in enumerate(unique_entries, start=1)
    ]
    results = await asyncio.gather(*tasks)
    return BatchResearchResponse(
        input_source=input_source,
        course_count=len(results),
        results=results,
        cost_summary=summarize_costs(results),
    )
