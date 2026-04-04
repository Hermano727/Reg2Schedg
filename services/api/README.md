# TritonHub API (FastAPI)

Minimal service scaffold. Will verify Supabase JWTs and orchestrate ingest, calendar sync, and agent jobs.

## Run locally

```bash
cd services/api
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- Health check: `GET http://127.0.0.1:8000/health`
- OpenAPI docs: `http://127.0.0.1:8000/docs`
