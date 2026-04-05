# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev      # Dev server with Turbopack at localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

### Backend (FastAPI)
```bash
cd services/api
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Health: GET http://127.0.0.1:8000/health
# DB health: GET http://127.0.0.1:8000/db-health
# Docs: GET http://127.0.0.1:8000/docs
```

## Architecture

**Monorepo** with a Next.js 15 frontend (`frontend/`) and Python backend services (`services/`).

### Frontend

Next.js App Router (`frontend/src/app/`) with two route groups:
- `(hub)/` — main application shell (dashboard, profile, settings); protected routes
- Auth pages: `login/`, `signup/`, `auth/callback/` (Supabase OAuth callback)

**Component hierarchy:**
- `HubShell` → wraps everything; includes Header + Sidebar + main content
- `CommandCenter` — top-level orchestrator managing UI phase state: `idle → processing → dashboard`
  - `IngestionHub` — file drop zone + manual research form (entry point)
  - `ProcessingModal` / `TerminalModal` — shown during processing phase
  - `ScheduleDashboard` — final output view with class cards
- `RightSidebar` — quarter selector + vault (syllabus/WebReg/notes)

**Data flow:** User uploads files/fills form → CommandCenter triggers `/api/parse-screenshot` + `/api/research-screenshot` → `courseEntryToDossier` mapper converts response → renders `ClassDossier[]` in dashboard.

**Key types:** `frontend/src/types/dossier.ts` — `ClassDossier` and all evaluation data types (core domain model).

**Mock data:** `frontend/src/lib/mock/` — used for demo/development.

### Backend Services

`services/api/` — FastAPI app with these active endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/parse-screenshot` | Multipart image → Gemini → structured courses JSON |
| `POST` | `/api/research-screenshot` | Parse + Browser Use research + Supabase cache |
| `POST` | `/api/fit-analysis` | Schedule fitness scoring |
| `GET` | `/api/calendar/oauth` | Google Calendar OAuth flow |
| `POST` | `/plans` | Create saved plan (requires Bearer JWT) |

- Requires `services/api/.env` with `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`, and `GEMINI_API_KEY` (see `.env.example`; `BROWSER_USE_API_KEY` optional)
- Pydantic models in `app/models/domain.py` use camelCase aliasing (`CamelModel` base) — all DB row models live here
- DB client singleton in `app/db/client.py`; query/mutation service layer in `app/db/service.py`
- Course research results are cached in Supabase (`course_research_cache` table, keyed by normalized course code + professor)

`services/worker/` — placeholder for async queue (Redis RQ/Celery TBD).

### Database

Schema in `supabase/migrations/0001_init.sql`. Key tables (all with RLS by `auth.uid()`):
- `profiles` — user metadata (display_name, college, expected_grad_term)
- `saved_plans` — degree plans (title, quarter_label, status, payload JSON)
- `vault_items` — uploaded files linked to plans
- `course_research_cache` — shared cache for Browser Use research results

### Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 + React 19 + TypeScript 5 |
| Styling | Tailwind CSS v4 + PostCSS |
| Animations | Framer Motion |
| Icons | Lucide React |
| UI Primitives | Radix UI |
| Maps | Leaflet + React Leaflet |
| Auth/DB | Supabase (Auth + Postgres) |
| Backend | FastAPI + Uvicorn (Python 3.11+) |
| AI | Gemini API (screenshot parsing) |
| Browser Automation | Browser Use SDK |

### Path Alias

`@/*` → `./src/*` (configured in `frontend/tsconfig.json`)

### Design System

Dark theme with cyan/gold accent palette defined in `frontend/src/app/globals.css` as CSS variables. `glass-panel` and `grid-background` are custom Tailwind utility classes defined there.
