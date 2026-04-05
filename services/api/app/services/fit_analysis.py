import os
from datetime import datetime
from typing import Literal

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

from app.services.course_research import CourseResearchResult


load_dotenv()


class FitAlert(BaseModel):
    id: str
    severity: Literal["critical", "warning", "info"]
    title: str
    detail: str


class FitAnalysisResult(BaseModel):
    fitness_score: float
    fitness_max: float = 10.0
    trend_label: str
    alerts: list[FitAlert]
    recommendation: str


class FitAnalysisRequest(BaseModel):
    results: list[CourseResearchResult]


def resolve_gemini_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY in your environment or .env file.")
    return api_key


def parse_days(days_str: str) -> set[str]:
    """Parse a days string like 'MWF', 'TuTh', 'MWThF' into a set of day codes."""
    result: set[str] = set()
    two_char = {"Tu", "Th", "Sa", "Su"}
    i = 0
    s = days_str.strip()
    while i < len(s):
        if i + 1 < len(s) and s[i : i + 2] in two_char:
            result.add(s[i : i + 2])
            i += 2
        else:
            result.add(s[i])
            i += 1
    return result


def parse_minutes(time_str: str) -> int | None:
    """Convert '10:00 AM' → minutes since midnight."""
    try:
        t = datetime.strptime(time_str.strip(), "%I:%M %p")
        return t.hour * 60 + t.minute
    except ValueError:
        return None


def find_time_conflicts(results: list[CourseResearchResult]) -> list[dict]:
    """Return pairwise conflicts where days overlap and time windows overlap."""
    meetings_list = []
    for r in results:
        for m in r.meetings:
            if m.section_type.lower() not in ("lecture", "lab", "discussion"):
                continue
            days = parse_days(m.days)
            start = parse_minutes(m.start_time)
            end = parse_minutes(m.end_time)
            if days and start is not None and end is not None:
                meetings_list.append({
                    "course": r.course_code,
                    "days": days,
                    "start": start,
                    "end": end,
                    "time_range": f"{m.start_time}–{m.end_time}",
                })

    conflicts = []
    for i in range(len(meetings_list)):
        for j in range(i + 1, len(meetings_list)):
            a = meetings_list[i]
            b = meetings_list[j]
            if a["course"] == b["course"]:
                continue
            if not a["days"].intersection(b["days"]):
                continue
            if a["start"] < b["end"] and b["start"] < a["end"]:
                conflicts.append({
                    "course_a": a["course"],
                    "course_b": b["course"],
                    "time_range": f"{a['time_range']} / {b['time_range']}",
                })
    return conflicts


def compute_workload_signals(results: list[CourseResearchResult]) -> dict:
    """Aggregate logistics flags across all courses."""
    attendance_required = 0
    textbook_required = 0
    no_podcasts = 0
    difficulties: list[float] = []
    missing_logistics: list[str] = []

    for r in results:
        if r.logistics is None:
            missing_logistics.append(r.course_code)
            continue
        if r.logistics.attendance_required:
            attendance_required += 1
        if r.logistics.textbook_required:
            textbook_required += 1
        if r.logistics.podcasts_available is False:
            no_podcasts += 1
        diff = r.logistics.rate_my_professor.difficulty if r.logistics.rate_my_professor else None
        if diff is not None:
            difficulties.append(diff)

    avg_difficulty = round(sum(difficulties) / len(difficulties), 2) if difficulties else None
    return {
        "attendance_required": attendance_required,
        "textbook_required": textbook_required,
        "no_podcasts": no_podcasts,
        "avg_rmp_difficulty": avg_difficulty,
        "missing_logistics": missing_logistics,
        "total": len(results),
    }


def build_fit_prompt(
    results: list[CourseResearchResult],
    conflicts: list[dict],
    workload: dict,
) -> str:
    course_lines = []
    for r in results:
        meetings_str = "; ".join(
            f"{m.section_type}: {m.days} {m.start_time}–{m.end_time} @ {m.location}"
            for m in r.meetings
        ) or "No meeting times listed"
        logistics_summary = "No logistics data"
        if r.logistics:
            parts = []
            if r.logistics.attendance_required is not None:
                parts.append(f"attendance={'required' if r.logistics.attendance_required else 'optional'}")
            if r.logistics.textbook_required is not None:
                parts.append(f"textbook={'required' if r.logistics.textbook_required else 'not required'}")
            if r.logistics.podcasts_available is not None:
                parts.append(f"podcasts={'yes' if r.logistics.podcasts_available else 'no'}")
            if r.logistics.grade_breakdown:
                parts.append(f"grading={r.logistics.grade_breakdown}")
            logistics_summary = ", ".join(parts) if parts else "Partial data"
        prof = r.professor_name or "Unknown"
        course_lines.append(f"- {r.course_code} ({prof}): {meetings_str} | {logistics_summary}")

    courses_block = "\n".join(course_lines)

    if conflicts:
        conflict_lines = "\n".join(
            f"- {c['course_a']} ↔ {c['course_b']} overlap at {c['time_range']}"
            for c in conflicts
        )
        conflicts_block = conflict_lines
    else:
        conflicts_block = "No hard time conflicts detected."

    avg_diff = workload["avg_rmp_difficulty"]
    diff_str = str(avg_diff) if avg_diff is not None else "N/A"
    missing = workload["missing_logistics"]
    missing_str = ", ".join(missing) if missing else "none"

    return (
        "You are a UCSD academic advisor performing a schedule feasibility analysis.\n\n"
        "## Courses under review\n"
        f"{courses_block}\n\n"
        "## Detected time conflicts (programmatic)\n"
        f"{conflicts_block}\n\n"
        "## Workload signals\n"
        f"- Courses requiring attendance: {workload['attendance_required']} of {workload['total']}\n"
        f"- Courses requiring textbook: {workload['textbook_required']}\n"
        f"- Courses without podcast recordings: {workload['no_podcasts']}\n"
        f"- Average RateMyProfessor difficulty: {diff_str}\n"
        f"- Courses with missing logistics: {missing_str}\n\n"
        "## Task\n"
        "Return JSON with: fitness_score (0–10), fitness_max (10.0), trend_label (short phrase like "
        "'Manageable' or 'Heavy Load'), alerts (up to 5, each: id like 'a1', severity, title, detail), "
        "recommendation (2–4 sentence paragraph). "
        "Rules: any time conflict must produce a critical alert; hedge if data is missing; "
        "no markdown fences in your response."
    )


def analyze_fit(results: list[CourseResearchResult]) -> FitAnalysisResult:
    conflicts = find_time_conflicts(results)
    workload = compute_workload_signals(results)
    prompt = build_fit_prompt(results, conflicts, workload)
    client = genai.Client(api_key=resolve_gemini_api_key())
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=FitAnalysisResult,
        ),
    )
    return FitAnalysisResult.model_validate_json(response.text)
