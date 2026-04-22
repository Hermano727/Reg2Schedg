from supabase import Client

from app.models.feedback import CreateFeedbackRequest, FeedbackSubmissionOut


def create_feedback_submission(
    client: Client,
    user_id: str,
    payload: CreateFeedbackRequest,
) -> FeedbackSubmissionOut:
    row = {
        "user_id": user_id,
        "report_type": payload.report_type,
        "product_area": payload.product_area,
        "title": payload.title.strip(),
        "description": payload.description.strip(),
        "expected_behavior": payload.expected_behavior.strip() if payload.expected_behavior else None,
        "page_path": payload.page_path,
        "user_agent": payload.user_agent,
        "metadata": payload.metadata or {},
    }
    response = client.table("feedback_reports").insert(row).execute()
    inserted = (response.data or [None])[0]
    if not inserted:
        raise RuntimeError("Failed to create feedback submission")
    return FeedbackSubmissionOut.model_validate(inserted)
