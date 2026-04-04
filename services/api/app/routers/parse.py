from google import genai
from google.genai import types
from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel
from app.config import settings

router = APIRouter()


class SectionMeeting(BaseModel):
    section_type: str   # e.g. "Lecture", "Discussion", "Lab"
    days: str           # e.g. "MWF", "Tu", "TuTh"
    start_time: str     # e.g. "10:00 AM"
    end_time: str       # e.g. "10:50 AM"
    location: str       # e.g. "PETER 110" or empty string if not shown


class CourseEntry(BaseModel):
    course_code: str
    course_title: str
    professor_name: str
    meetings: list[SectionMeeting]


class ParseScreenshotResponse(BaseModel):
    courses: list[CourseEntry]


@router.post("/parse-screenshot", response_model=ParseScreenshotResponse)
async def parse_screenshot(file: UploadFile) -> ParseScreenshotResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()

    client = genai.Client(api_key=settings.gemini_api_key)
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
            types.Part.from_bytes(data=image_bytes, mime_type=file.content_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParseScreenshotResponse,
        ),
    )

    return ParseScreenshotResponse.model_validate_json(response.text)
