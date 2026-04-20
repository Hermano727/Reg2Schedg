from google import genai
from google.genai import types

from app.config import settings
from app.models.course_parse import ParseScreenshotResponse


def resolve_gemini_api_key() -> str:
    api_key = getattr(settings, "gemini_api_key", None)
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY in your environment or .env file.")
    return api_key


def parse_schedule_image(image_bytes: bytes, mime_type: str) -> ParseScreenshotResponse:
    client = genai.Client(api_key=resolve_gemini_api_key())
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            (
                "First, determine whether this image is a UCSD WebReg course schedule. "
                "A valid schedule shows enrolled courses with course codes (e.g. 'CSE 120'), "
                "instructors, meeting times, and days. Both the list view and calendar/weekly view "
                "from WebReg are valid. If the image is NOT a schedule (e.g. a photo, meme, "
                "random document, blank image, or anything unrelated to a UCSD course schedule), "
                "set is_valid_schedule to false and return an empty courses list immediately. "
                "If it IS a valid schedule, set is_valid_schedule to true and extract every course. "
                "For each course return: course_code (e.g. 'CSE 110'), "
                "course_title (full name), professor_name (full name, or empty string if not shown), "
                "and meetings — one entry per section type (Lecture, Discussion, Lab, etc.) with: "
                "section_type, days (e.g. 'MWF' or 'TuTh'), start_time (e.g. '10:00 AM'), "
                "end_time (e.g. '10:50 AM'), and location/building (empty string if not shown). "
                "IMPORTANT: If the screenshot shows final exam slots or midterm sessions, still include them "
                "as meetings but use section_type exactly 'FI' for finals and 'MI' for midterms. "
                "Do NOT omit them — they will be displayed in a separate Exams panel, not on the main calendar."
            ),
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParseScreenshotResponse,
        ),
    )

    return ParseScreenshotResponse.model_validate_json(response.text)
