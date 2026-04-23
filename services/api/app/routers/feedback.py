from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.deps import get_current_user_access
from app.db.client import get_supabase_for_access_token
from app.db.feedback import create_feedback_submission
from app.models.feedback import CreateFeedbackRequest, FeedbackSubmissionOut

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackSubmissionOut, status_code=status.HTTP_201_CREATED)
def submit_feedback(
    body: CreateFeedbackRequest,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> FeedbackSubmissionOut:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        return create_feedback_submission(client, user_id, body)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
