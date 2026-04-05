from pydantic import BaseModel


class SectionMeeting(BaseModel):
    section_type: str
    days: str
    start_time: str
    end_time: str
    location: str


class CourseEntry(BaseModel):
    course_code: str
    course_title: str
    professor_name: str
    meetings: list[SectionMeeting]


class ParseScreenshotResponse(BaseModel):
    courses: list[CourseEntry]
