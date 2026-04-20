from pydantic import BaseModel, Field


class SectionMeeting(BaseModel):
    section_type: str
    days: str
    start_time: str
    end_time: str
    location: str
    building_code: str | None = None
    lat: float | None = None
    lng: float | None = None
    geocode_status: str | None = None  # "resolved" | "ambiguous" | "unresolved"


class CourseEntry(BaseModel):
    course_code: str
    course_title: str
    professor_name: str
    meetings: list[SectionMeeting]


class ParseScreenshotResponse(BaseModel):
    courses: list[CourseEntry]
    is_valid_schedule: bool = Field(
        default=True,
        description=(
            "False if the image does not appear to be a UCSD WebReg schedule "
            "(e.g. a photo, meme, unrelated document, or blank image). "
            "When False, courses must be an empty list."
        ),
    )
