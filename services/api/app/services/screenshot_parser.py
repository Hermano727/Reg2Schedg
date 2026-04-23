from google import genai
from google.genai import types

from app.config import settings
from app.models.course_parse import ParseScreenshotResponse

_SUPPORTED_MIME_TYPES = frozenset([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
])

_PARSE_PROMPT = (
    "First, determine whether this file contains a UCSD WebReg course schedule. "
    "A valid schedule shows enrolled courses with course codes (e.g. 'CSE 120'), "
    "instructors, meeting times, and days. Both the list view and calendar/weekly view "
    "from WebReg are valid, whether provided as a screenshot or a PDF export. "
    "If the file does NOT contain a schedule (e.g. a photo, meme, random document, "
    "blank file, or anything unrelated to a UCSD course schedule), "
    "set is_valid_schedule to false and return an empty courses list immediately. "
    "If it IS a valid schedule, set is_valid_schedule to true and extract every course. "
    "For each course return: course_code (e.g. 'CSE 110'), "
    "course_title (full name), professor_name (full name, or empty string if not shown), "
    "and meetings — one entry per section type (Lecture, Discussion, Lab, etc.) with: "
    "section_type, days (e.g. 'MWF' or 'TuTh'), start_time (e.g. '10:00 AM'), "
    "end_time (e.g. '10:50 AM'), and location/building (empty string if not shown). "
    "IMPORTANT: If the file shows final exam slots or midterm sessions, still include them "
    "as meetings but use section_type exactly 'FI' for finals and 'MI' for midterms. "
    "Do NOT omit them — they will be displayed in a separate Exams panel, not on the main calendar."
)


def resolve_gemini_api_key() -> str:
    api_key = getattr(settings, "gemini_api_key", None)
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY in your environment or .env file.")
    return api_key


def is_supported_mime_type(mime_type: str) -> bool:
    base = mime_type.split(";")[0].strip().lower()
    return base in _SUPPORTED_MIME_TYPES or base.startswith("image/")


def parse_schedule_file(file_bytes: bytes, mime_type: str) -> ParseScreenshotResponse:
    client = genai.Client(api_key=resolve_gemini_api_key())
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            _PARSE_PROMPT,
            types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParseScreenshotResponse,
        ),
    )

    return ParseScreenshotResponse.model_validate_json(response.text)


# Backward-compatible alias
parse_schedule_image = parse_schedule_file
