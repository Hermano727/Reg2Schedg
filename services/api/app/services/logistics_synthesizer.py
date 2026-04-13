"""
Tier 3: Gemini synthesis.

Converts raw data gathered from Tiers 0-2 (Reddit, RMP, UCSD catalog) into a
structured CourseLogistics object using Gemini with response_schema.

Uses the same google-genai SDK and pattern as fit_analysis.py.
Cost: ~$0.0003-0.0005 per course at gemini-2.5-flash pricing — orders of
magnitude cheaper than Browser Use.
"""

from __future__ import annotations

import logging
import os

from google import genai
from google.genai import types

from app.models.research import CourseLogistics, ResearchRawData

_log = logging.getLogger(__name__)


def _resolve_gemini_api_key() -> str:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("Missing GEMINI_API_KEY in your environment or .env file.")
    return key


def _build_synthesis_prompt(raw: ResearchRawData) -> str:
    course = raw.course_code
    prof = raw.professor_name or "an unknown instructor"

    # Reddit section
    if raw.reddit_posts:
        reddit_lines = []
        for post in raw.reddit_posts[:10]:
            comments_block = "\n".join(f"  COMMENT: {c}" for c in post.top_comments[:5])
            reddit_lines.append(
                f"POST (score={post.score}): {post.title}\n"
                f"BODY: {post.body[:500]}\n"
                f"URL: {post.url}\n"
                f"{comments_block}"
            )
        reddit_section = "\n\n".join(reddit_lines)
    else:
        reddit_section = "No Reddit posts found."

    # RMP section
    if raw.rmp_stats:
        s = raw.rmp_stats
        rmp_section = (
            f"Rating: {s.rating}/5 | Difficulty: {s.difficulty} | "
            f"Would Take Again: {s.would_take_again_percent}%\n"
            f"URL: {raw.rmp_url or 'N/A'}"
        )
    else:
        rmp_section = "No RMP data found."

    # UCSD catalog section
    catalog_section = raw.ucsd_course_description or "Not found."

    # Syllabus snippets
    if raw.ucsd_syllabus_snippets:
        syllabus_section = "\n".join(f"- {s}" for s in raw.ucsd_syllabus_snippets[:8])
    else:
        syllabus_section = "Not found."

    tier_summary = ", ".join(
        f"{k}={'✓' if v else '✗'}" for k, v in raw.tier_coverage.items()
    )

    return (
        f"You are a UCSD course research assistant synthesizing raw data about "
        f"{course} taught by {prof}.\n\n"
        f"Data coverage: {tier_summary}\n\n"
        f"=== REDDIT DATA ({len(raw.reddit_posts)} posts) ===\n"
        f"{reddit_section}\n\n"
        f"=== RATE MY PROFESSORS ===\n"
        f"{rmp_section}\n\n"
        f"=== UCSD COURSE DESCRIPTION ===\n"
        f"{catalog_section}\n\n"
        f"=== UCSD SYLLABUS SNIPPETS ===\n"
        f"{syllabus_section}\n\n"
        "=== SYNTHESIS RULES ===\n"
        "- attendance_required: true/false only if Reddit or syllabus explicitly confirms it. null if ambiguous.\n"
        "- grade_breakdown: compact string like 'HW 30%, Midterm 30%, Final 40%'. "
        "  Extract from syllabus first. NEVER fabricate percentages not in the source data.\n"
        "- textbook_required: true only if 'required textbook' or 'buy' appears in syllabus or Reddit.\n"
        "- podcasts_available: true only if podcasts.ucsd.edu or 'podcast'/'recorded' appears explicitly.\n"
        "- student_sentiment_summary: 1 balanced sentence from Reddit + RMP. "
        "  Do not be purely negative or positive unless overwhelming evidence.\n"
        "- evidence: up to 5 items. Prefer verbatim Reddit quotes with post URLs. "
        "  For RMP, create one EvidenceItem with source='RMP' summarizing the stats.\n"
        "  content must be a direct quote — never paraphrase.\n"
        "- professor_info_found: set false ONLY if no Reddit posts AND no RMP data "
        "  AND no syllabus matched this instructor. Otherwise true.\n"
        "- general_course_overview: 2-3 sentence summary from the UCSD catalog description. "
        "  Populate regardless of professor_info_found.\n"
        "- general_professor_overview: 1-2 sentences about the professor's background if any source "
        "  mentions them. Populate regardless of professor_info_found. null if no data at all.\n"
        "- rate_my_professor: populate from RMP data if available, else leave all fields null.\n"
        "- Return null for any field where no evidence exists — never fabricate.\n"
    )


async def synthesize_logistics(
    raw: ResearchRawData,
    *,
    gemini_model: str = "gemini-2.5-flash",
) -> CourseLogistics:
    """
    Call Gemini with the raw data and return a validated CourseLogistics.
    Raises RuntimeError if the Gemini call itself fails.
    """
    prompt = _build_synthesis_prompt(raw)
    client = genai.Client(api_key=_resolve_gemini_api_key())

    response = client.models.generate_content(
        model=gemini_model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=CourseLogistics,
        ),
    )

    try:
        return CourseLogistics.model_validate_json(response.text)
    except Exception as exc:
        _log.error("[synthesizer] Gemini returned invalid CourseLogistics for %s: %s", raw.course_code, exc)
        raise RuntimeError(
            f"Gemini synthesis returned invalid output for {raw.course_code}: {exc}"
        ) from exc
