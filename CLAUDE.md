# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Next.js)
```bash
npm run dev      # Dev server with Turbopack at localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

### Backend (FastAPI)
```bash
cd services/api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Health: GET http://127.0.0.1:8000/health
```

## Architecture

**Monorepo** with a Next.js 15 frontend (`src/`) and Python backend services (`services/`).

### Frontend

Next.js App Router with two route groups:
- `src/app/(hub)/` — main application shell (dashboard, profile, settings)
- `src/app/layout.tsx` — root layout

**Component hierarchy:**
- `HubShell` → wraps everything; includes Header + Sidebar + main content
- `CommandCenter` — top-level orchestrator managing UI phase state: `idle → processing → dashboard`
  - `IngestionHub` — file drop zone + manual research form (entry point)
  - `ProcessingModal` / `TerminalModal` — shown during processing phase
  - `ScheduleDashboard` — final output view with class cards
- `RightSidebar` — quarter selector + vault (syllabus/WebReg/notes)

**Data flow:** User uploads files/fills form → CommandCenter triggers processing (mock terminal script) → on completion, renders `ClassDossier[]` objects in dashboard.

**Types:** `src/types/dossier.ts` defines core domain types (`ClassDossier`, evaluation data, etc.)

**Mock data:** `src/lib/mock/` — used for demo/development; all current data is mocked.

### Backend Services

- `services/api/` — FastAPI scaffold; planned: JWT verification (Supabase), ingest job orchestration, Google Calendar OAuth, agent execution
  - Requires `services/api/.env` with `SUPABASE_URL` and `SUPABASE_KEY` (see `.env.example`)
  - Pydantic models in `app/models/domain.py` use camelCase aliasing (`CamelModel` base) — all DB row models live here
  - DB client singleton in `app/db/client.py`; service layer in `app/db/service.py`
- `services/worker/` — placeholder for async queue (Redis RQ/Celery TBD) for long-running tasks: ingestion parsing, embeddings, browser automation

### Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 + React 19 + TypeScript 5 |
| Styling | Tailwind CSS v4 + PostCSS |
| Animations | Framer Motion |
| Icons | Lucide React |
| UI Primitives | Radix UI |
| Backend | FastAPI + Uvicorn (Python) |

### Path Alias

`@/*` → `./src/*` (configured in `tsconfig.json`)

### Design System

Dark theme with cyan/gold accent palette defined in `src/app/globals.css` as CSS variables. Glass-panel and grid-background utilities are custom Tailwind classes defined there.
