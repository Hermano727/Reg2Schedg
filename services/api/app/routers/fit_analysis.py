from fastapi import APIRouter, HTTPException

from app.services.fit_analysis import FitAnalysisRequest, FitAnalysisResult, analyze_fit

router = APIRouter(prefix="/fit-analysis", tags=["fit-analysis"])


@router.post("", response_model=FitAnalysisResult)
async def fit_analysis(body: FitAnalysisRequest) -> FitAnalysisResult:
    if not body.results:
        raise HTTPException(422, "results list must not be empty")
    try:
        return analyze_fit(body.results)
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc
