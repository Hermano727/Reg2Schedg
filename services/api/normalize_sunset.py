import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from typing import Any

from app.db.client import get_supabase_client


DEFAULT_RAW_TABLE = "sunset_grade_distributions_raw"
DEFAULT_NORMALIZED_TABLE = "sunset_grade_distributions"
DEFAULT_SOURCE_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vQ6KhjyiPM-rof6fqjBcmp7ygy4Dqr1LQ8uJiAOtR2IoihzQEumx-SHX_KKxLpmYGZksN6QsPPk0DNb/"
    "pub?output=csv&single=true"
)

DEFAULT_SUBMISSION_TIME_COLUMN = "Submission time"
DEFAULT_USER_ID_COLUMN = "User ID"
DEFAULT_TERM_COLUMN = "Term"
DEFAULT_COURSE_COLUMN = "Course"
DEFAULT_PROFESSOR_COLUMN = "Professor"
DEFAULT_GRADE_DISTRIBUTION_COLUMN = "Grade distribution"
DEFAULT_RECOMMEND_COLUMN = "Recommend professor?"
DEFAULT_GPA_COLUMN = "Average GPA"
DEFAULT_TOTAL_STUDENTS_COLUMN = "Total students"

GRADE_KEYS = [
    "A+",
    "A",
    "A-",
    "B+",
    "B",
    "B-",
    "C+",
    "C",
    "C-",
    "D",
    "F",
    "P",
    "NP",
    "S",
    "U",
    "W",
    "EW",
    "I",
]
GRADE_KEY_PATTERN = "|".join(re.escape(key) for key in sorted(GRADE_KEYS, key=len, reverse=True))
GRADE_PAIR_PATTERN = re.compile(
    rf"(?<![A-Za-z0-9])({GRADE_KEY_PATTERN})(?![A-Za-z0-9])\s*[:=]?\s*(-?\d+(?:\.\d+)?)"
)
COURSE_PATTERN = re.compile(r"\b[A-Z&]{2,5}\s*\d+[A-Z]?\b")
AVERAGE_GPA_PATTERN = re.compile(
    r"(?:average|avg|class)?\s*gpa\s*[:=]?\s*(-?\d+(?:\.\d+)?)",
    re.IGNORECASE,
)
TOTAL_STUDENTS_PATTERN = re.compile(
    r"(?:total\s+students|students)\s*[:=]?\s*(-?\d+(?:\.\d+)?)",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize a raw SunSET CSV import table into a query-friendly table.",
    )
    parser.add_argument("--raw-table", default=DEFAULT_RAW_TABLE)
    parser.add_argument("--table", default=DEFAULT_NORMALIZED_TABLE)
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--submission-time-column", default=DEFAULT_SUBMISSION_TIME_COLUMN)
    parser.add_argument("--user-id-column", default=DEFAULT_USER_ID_COLUMN)
    parser.add_argument("--term-column", default=DEFAULT_TERM_COLUMN)
    parser.add_argument("--course-column", default=DEFAULT_COURSE_COLUMN)
    parser.add_argument("--professor-column", default=DEFAULT_PROFESSOR_COLUMN)
    parser.add_argument("--grade-distribution-column", default=DEFAULT_GRADE_DISTRIBUTION_COLUMN)
    parser.add_argument("--recommend-column", default=DEFAULT_RECOMMEND_COLUMN)
    parser.add_argument("--gpa-column", default=DEFAULT_GPA_COLUMN)
    parser.add_argument("--total-students-column", default=DEFAULT_TOTAL_STUDENTS_COLUMN)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def normalize_whitespace(value: str | None) -> str:
    return " ".join((value or "").split())


def normalize_course_code(value: str | None) -> str:
    return normalize_whitespace(value).upper()


def normalize_professor_name(value: str | None) -> str:
    return normalize_whitespace(value).upper()


def parse_number(value: str | int | float | None) -> int | float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value) if isinstance(value, float) and value.is_integer() else value
    stripped = value.strip().replace(",", "").replace("%", "")
    if not stripped:
        return None
    try:
        number = float(stripped)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def extract_course_code(raw_course: str) -> str | None:
    match = COURSE_PATTERN.search(raw_course.upper())
    if not match:
        return None
    return normalize_whitespace(match.group(0))


def parse_grade_distribution(raw_distribution: str | None) -> dict[str, int | float]:
    text = normalize_whitespace(raw_distribution)
    if not text:
        return {}

    try:
        parsed_json = json.loads(text)
    except json.JSONDecodeError:
        parsed_json = None

    if isinstance(parsed_json, dict):
        parsed_distribution: dict[str, int | float] = {}
        for key, value in parsed_json.items():
            number = parse_number(value)
            if number is not None:
                parsed_distribution[key] = number
        if parsed_distribution:
            return parsed_distribution

    distribution: dict[str, int | float] = {}
    for match in GRADE_PAIR_PATTERN.finditer(text):
        grade_key = match.group(1)
        number = parse_number(match.group(2))
        if number is not None:
            distribution[grade_key] = number

    if distribution:
        return distribution

    # Fallback: keep the raw string if we cannot confidently parse it yet.
    return {"raw": text}


def extract_summary_stat(pattern: re.Pattern[str], raw_distribution: str | None) -> int | float | None:
    text = normalize_whitespace(raw_distribution)
    if not text:
        return None
    match = pattern.search(text)
    if not match:
        return None
    return parse_number(match.group(1))


def build_grade_payload(
    raw_distribution: str | None,
    *,
    average_gpa: int | float | None,
    total_students: int | float | None,
) -> dict[str, Any]:
    derived_average_gpa = average_gpa
    if derived_average_gpa is None:
        derived_average_gpa = extract_summary_stat(AVERAGE_GPA_PATTERN, raw_distribution)

    derived_total_students = total_students
    if derived_total_students is None:
        derived_total_students = extract_summary_stat(TOTAL_STUDENTS_PATTERN, raw_distribution)

    payload: dict[str, Any] = {
        "distribution": parse_grade_distribution(raw_distribution),
    }
    if derived_average_gpa is not None:
        payload["average_gpa"] = derived_average_gpa
    if derived_total_students is not None:
        payload["total_students"] = derived_total_students
    return payload


def build_source_row_hash(raw_row: dict[str, Any]) -> str:
    stable_json = json.dumps(raw_row, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(stable_json.encode("utf-8")).hexdigest()


def fetch_raw_rows(table_name: str, limit: int | None) -> list[dict[str, Any]]:
    client = get_supabase_client()
    rows: list[dict[str, Any]] = []
    batch_size = 1000
    start = 0

    while True:
        end = start + batch_size - 1
        response = client.table(table_name).select("*").range(start, end).execute()
        batch = response.data or []
        if not batch:
            break
        rows.extend(batch)
        if limit is not None and len(rows) >= limit:
            return rows[:limit]
        if len(batch) < batch_size:
            break
        start += batch_size

    return rows


def build_normalized_rows(raw_rows: list[dict[str, Any]], args: argparse.Namespace) -> tuple[list[dict[str, Any]], list[str]]:
    normalized_rows: list[dict[str, Any]] = []
    skipped: list[str] = []
    imported_at = datetime.now(timezone.utc).isoformat()

    for index, raw_row in enumerate(raw_rows, start=1):
        course_value = normalize_whitespace(str(raw_row.get(args.course_column, "") or ""))
        course_code = extract_course_code(course_value) or course_value
        if not course_code:
            skipped.append(f"row {index}: missing course code")
            continue

        professor_name = normalize_whitespace(str(raw_row.get(args.professor_column, "") or ""))
        term_label = normalize_whitespace(str(raw_row.get(args.term_column, "") or ""))
        submission_time = raw_row.get(args.submission_time_column)
        user_id = normalize_whitespace(str(raw_row.get(args.user_id_column, "") or ""))
        raw_distribution = str(raw_row.get(args.grade_distribution_column, "") or "")
        recommend_value = parse_number(raw_row.get(args.recommend_column))
        average_gpa = parse_number(raw_row.get(args.gpa_column))
        total_students = parse_number(raw_row.get(args.total_students_column))

        normalized_rows.append(
            {
                "source_row_hash": build_source_row_hash(raw_row),
                "course_code": course_code,
                "professor_name": professor_name,
                "term_label": term_label or None,
                "normalized_course_code": normalize_course_code(course_code),
                "normalized_professor_name": normalize_professor_name(professor_name),
                "grade_distribution": build_grade_payload(
                    raw_distribution,
                    average_gpa=average_gpa,
                    total_students=total_students,
                ),
                "recommend_professor_percent": recommend_value,
                "submission_time": submission_time,
                "source_url": args.source_url,
                "raw_row": raw_row,
                "imported_at": imported_at,
                "updated_at": imported_at,
                "raw_user_id": user_id or None,
            }
        )

    return normalized_rows, skipped


def upsert_normalized_rows(table_name: str, rows: list[dict[str, Any]]) -> None:
    client = get_supabase_client()
    batch_size = 250
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        client.table(table_name).upsert(
            batch,
            on_conflict="source_row_hash",
        ).execute()


def main() -> None:
    args = parse_args()
    raw_rows = fetch_raw_rows(args.raw_table, args.limit)
    print(f"Fetched {len(raw_rows)} raw rows from {args.raw_table}.", file=sys.stderr)

    normalized_rows, skipped = build_normalized_rows(raw_rows, args)
    print(f"Prepared {len(normalized_rows)} normalized rows for {args.table}.", file=sys.stderr)
    if skipped:
        print(f"Skipped {len(skipped)} rows.", file=sys.stderr)
        for sample in skipped[:10]:
            print(f"  - {sample}", file=sys.stderr)

    if normalized_rows:
        sample = normalized_rows[0]
        print(
            json.dumps(
                {
                    "sample_course_code": sample["course_code"],
                    "sample_professor_name": sample["professor_name"],
                    "sample_term_label": sample["term_label"],
                    "sample_grade_distribution": sample["grade_distribution"],
                    "sample_recommend_professor_percent": sample["recommend_professor_percent"],
                },
                indent=2,
                default=str,
            ),
            file=sys.stderr,
        )

    if args.dry_run:
        print("Dry run only; no normalized rows were written.", file=sys.stderr)
        return

    upsert_normalized_rows(args.table, normalized_rows)
    print(f"Normalized {len(normalized_rows)} rows into {args.table}.", file=sys.stderr)


if __name__ == "__main__":
    main()
