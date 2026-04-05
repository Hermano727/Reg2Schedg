import argparse
import asyncio
import mimetypes
import sys
from pathlib import Path

from dotenv import load_dotenv

from app.models.course_parse import CourseEntry
from app.services.course_research import research_courses


load_dotenv()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Parse a schedule screenshot and scrape logistics for each course.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--image", help="Path to a schedule screenshot image")
    group.add_argument("--course", help='Single course code, e.g. "CSE 120"')
    parser.add_argument(
        "--instructor",
        help='Instructor last name or full name for single-course mode, e.g. "Pasquale"',
    )
    parser.add_argument(
        "--model",
        default="claude-sonnet-4.6",
        help="Browser Use model name",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=0,
        help="Number of concurrent Browser Use runs; use 0 to run one per course",
    )
    return parser.parse_args()


def detect_mime_type(image_path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(image_path.name)
    if mime_type and mime_type.startswith("image/"):
        return mime_type
    raise RuntimeError(f"Could not determine an image MIME type for {image_path}")


def parse_courses_from_image(image_path: Path) -> list[CourseEntry]:
    from app.services.screenshot_parser import parse_schedule_image

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    image_bytes = image_path.read_bytes()
    parsed = parse_schedule_image(image_bytes=image_bytes, mime_type=detect_mime_type(image_path))
    return parsed.courses


def build_manual_entry(course: str, instructor: str | None) -> CourseEntry:
    return CourseEntry(
        course_code=course,
        course_title="",
        professor_name=instructor or "",
        meetings=[],
    )


async def main() -> None:
    args = parse_args()

    if args.concurrency < 0:
        raise RuntimeError("--concurrency must be 0 or greater")

    if args.image:
        entries = parse_courses_from_image(Path(args.image))
        input_source = "image"
    else:
        entries = [build_manual_entry(args.course, args.instructor)]
        input_source = "manual"

    if not entries:
        raise RuntimeError("No courses were found to research.")

    payload = await research_courses(
        entries,
        input_source=input_source,
        model=args.model,
        concurrency=args.concurrency,
        progress=lambda message: print(message, file=sys.stderr),
    )
    print(payload.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(main())
