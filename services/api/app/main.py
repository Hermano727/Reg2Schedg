from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.auth.deps import get_current_user_access
from app.db.client import get_supabase_client, get_supabase_for_access_token
from app.db.service import insert_saved_plan
from app.models.plan import SavedPlanCreate
from app.routers.parse import router as parse_router

app = FastAPI(title="TritonHub API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/db-health")
def db_health() -> dict[str, str]:
    client = get_supabase_client()
    try:
        client.table("profiles").select("id").limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"DB unreachable: {exc}") from exc
    return {"status": "ok", "db": "connected"}


@app.post("/plans")
def create_plan(
    body: SavedPlanCreate,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> dict:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        return insert_saved_plan(client, user_id, body)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not create plan: {exc}",
        ) from exc
