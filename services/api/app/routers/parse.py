from fastapi import APIRouter, HTTPException, UploadFile

from app.models.course_parse import ParseScreenshotResponse
from app.services.course_research import BatchResearchResponse, research_courses
from app.services.screenshot_parser import parse_schedule_image

router = APIRouter()

@router.post("/parse-screenshot", response_model=ParseScreenshotResponse)
async def parse_screenshot(file: UploadFile) -> ParseScreenshotResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    return parse_schedule_image(image_bytes=image_bytes, mime_type=file.content_type)


@router.post("/research-screenshot", response_model=BatchResearchResponse)
async def research_screenshot(
    file: UploadFile,
    model: str = "claude-sonnet-4.6",
    concurrency: int = 0,
) -> BatchResearchResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    if concurrency < 0:
        raise HTTPException(status_code=400, detail="concurrency must be 0 or greater")

    image_bytes = await file.read()
    parsed = parse_schedule_image(image_bytes=image_bytes, mime_type=file.content_type)
    return await research_courses(
        parsed.courses,
        input_source="image",
        model=model,
        concurrency=concurrency,
    )
