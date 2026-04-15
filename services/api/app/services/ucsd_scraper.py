"""
Tier 2: UCSD HTTP scraper.

Fetches plain-HTML pages from the UCSD course catalog and schedule of classes
using httpx + BeautifulSoup4.  No JavaScript rendering needed.

Returns (None, None) / ([], None) on any error — callers must tolerate absence.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

import httpx

_log = logging.getLogger(__name__)

_CATALOG_BASE = "https://catalog.ucsd.edu/courses"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}


def _split_course_code(course_code: str) -> tuple[str, str]:
    """
    'CSE 110' → ('CSE', '110')
    'COGS 108' → ('COGS', '108')
    'MAE 140' → ('MAE', '140')
    """
    parts = course_code.strip().upper().split()
    if len(parts) >= 2:
        # dept = everything before the last token (handles multi-word depts)
        return " ".join(parts[:-1]), parts[-1]
    return parts[0] if parts else course_code, ""


async def fetch_ucsd_course_description(
    course_code: str,
    *,
    timeout_seconds: float = 6.0,
) -> tuple[str | None, str | None]:
    """
    Return (description_text, catalog_url) or (None, None).
    Fetches https://catalog.ucsd.edu/courses/{DEPT}/ and extracts the
    description block for the given course number.
    """
    try:
        from bs4 import BeautifulSoup  # noqa: PLC0415
    except ImportError:
        _log.debug("[ucsd] beautifulsoup4 not installed — Tier 2 catalog disabled")
        return None, None

    dept, number = _split_course_code(course_code)
    if not dept or not number:
        return None, None

    # UCSD catalog uses uppercase dept slug with .html extension
    dept_slug = dept.replace(" ", "").upper()
    url = f"{_CATALOG_BASE}/{dept_slug}.html"

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
            resp = await client.get(url, headers=_HEADERS)
            if resp.status_code != 200:
                _log.debug("[ucsd] catalog %s returned %s", url, resp.status_code)
                return None, None
            html = resp.text
    except Exception as exc:
        _log.warning("[ucsd] catalog fetch failed for %s: %s", course_code, exc)
        return None, None

    try:
        soup = BeautifulSoup(html, "lxml")

        # Each course block is typically: <p class="course-name"> then <p class="course-descriptions">
        # We search for any element that contains the course code and number
        search_text = f"{dept} {number}"
        for el in soup.find_all(string=re.compile(re.escape(search_text), re.IGNORECASE)):
            parent = el.parent
            # Walk siblings to find the description paragraph
            sibling = parent.find_next_sibling()
            for _ in range(5):  # look at next 5 siblings
                if sibling is None:
                    break
                text = sibling.get_text(separator=" ", strip=True)
                if len(text) > 40:  # non-trivial text = description
                    return text[:800], url
                sibling = sibling.find_next_sibling()

        _log.debug("[ucsd] course %s not found in catalog page %s", course_code, url)
        return None, url
    except Exception as exc:
        _log.warning("[ucsd] catalog parse failed for %s: %s", course_code, exc)
        return None, None


async def fetch_ucsd_syllabus_snippets(
    course_code: str,
    professor_name: str | None,
    *,
    timeout_seconds: float = 6.0,
) -> tuple[list[str], str | None]:
    """
    Return (snippets, syllabus_url) or ([], None).

    Attempts to find a syllabus by searching the UCSD course schedule page.
    Extracts text snippets relevant to attendance, grading, and textbook.
    """
    try:
        from bs4 import BeautifulSoup  # noqa: PLC0415
    except ImportError:
        _log.debug("[ucsd] beautifulsoup4 not installed — Tier 2 syllabus disabled")
        return [], None

    dept, number = _split_course_code(course_code)
    if not dept:
        return [], None

    # Try the UCSD course offering page: https://catalog.ucsd.edu/courses/{dept}/
    # For a syllabus, we also try the class's linked course website if present
    # This is a best-effort scan; the catalog page sometimes has prerequisites
    # and grading structure inline.
    _, catalog_url = await fetch_ucsd_course_description(course_code, timeout_seconds=timeout_seconds)
    if catalog_url is None:
        return [], None

    snippets: list[str] = []
    keywords = re.compile(
        r"\b(attendance|grading|grade|homework|midterm|final|textbook|required|podcast|canvas|piazza)\b",
        re.IGNORECASE,
    )

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
            resp = await client.get(catalog_url, headers=_HEADERS)
            if resp.status_code != 200:
                return [], None
            html = resp.text

        from bs4 import BeautifulSoup  # noqa: PLC0415
        soup = BeautifulSoup(html, "lxml")
        for p in soup.find_all(["p", "li", "div"]):
            text = p.get_text(separator=" ", strip=True)
            if keywords.search(text) and 20 < len(text) < 500:
                snippets.append(text)
                if len(snippets) >= 8:
                    break

        return snippets, catalog_url
    except Exception as exc:
        _log.warning("[ucsd] syllabus fetch failed for %s: %s", course_code, exc)
        return [], None
