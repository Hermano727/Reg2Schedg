import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

from app.models.course_parse import ParseScreenshotResponse


load_dotenv()


def resolve_gemini_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY in your environment or .env file.")
    return api_key


def parse_schedule_image(image_bytes: bytes, mime_type: str) -> ParseScreenshotResponse:
    client = genai.Client(api_key=resolve_gemini_api_key())
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            (
                "Extract every course listed in this screenshot. "
                "For each course return: course_code (e.g. 'CSE 110'), "
                "course_title (full name), professor_name (full name, or empty string if not shown), "
                "and meetings — one entry per section type (Lecture, Discussion, Lab, etc.) with: "
                "section_type, days (e.g. 'MWF' or 'TuTh'), start_time (e.g. '10:00 AM'), "
                "end_time (e.g. '10:50 AM'), and location/building (empty string if not shown)."
            ),
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParseScreenshotResponse,
        ),
    )

    return ParseScreenshotResponse.model_validate_json(response.text)
