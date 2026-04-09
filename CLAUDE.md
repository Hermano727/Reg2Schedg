# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

---

## What Is Reg2Schedg?

**Reg2Schedg** is an intelligent academic planner built for UCSD students experiencing the "quarterly crisis" — the hours spent toggling between WebReg, RateMyProfessors, Reddit, and CAPE trying to figure out whether a 16-unit schedule is survivable.

**Core loop:** User takes a screenshot of their planned WebReg schedule → uploads it → the app produces a unified intelligence dashboard for every course: professor ratings, grade distributions, Reddit student sentiment, course logistics, and a workload fitness score.

**Target user:** UCSD undergraduate planning their quarter. They care about GPA impact, workload, and whether the professor is any good. They don't want to do the detective work manually.

**What makes it distinct:**
- One screenshot → full course dossier for every class
- Real-time Browser Use scraping (RateMyProfessors, Reddit r/ucsd, course pages) rather than static data
- SunSET/CAPE grade distribution data from a pre-seeded Supabase table
- AI "Intensity Score" predicting actual quarter difficulty
- Interactive weekly calendar with drag-able class blocks and custom commitment blocks

---

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

---

## Architecture

**Monorepo** with a Next.js 15 frontend (`frontend/`) and Python backend (`services/api/`).

### Frontend

Next.js App Router (`frontend/src/app/`) with two route groups:
- `(hub)/` — main application shell; protected routes
- Auth pages: `login/`, `signup/`, `auth/callback/` (Supabase OAuth callback)

**Component hierarchy (accurate as of latest refactor):**
```
HubShell
└── CommandCenter                    ← phase state machine: idle → processing → dashboard
    ├── IngestionHub                 ← file drop zone + manual research form
    ├── ProcessingModal              ← shown during scraping/research phase
    └── DossierScheduleWorkspace     ← main output: cards + calendar + map
        ├── ClassCard[]              ← compact card per course (opens DossierDashboardModal)
        ├── DossierDashboardModal    ← full-screen bento-grid course intelligence panel
        ├── WeeklyCalendar           ← drag-reschedulable weekly grid
        ├── CampusPathMap            ← Leaflet map with geocoded building markers
        ├── DifficultyScoreHud       ← AI fitness score + alerts
        ├── ExamsPanel               ← FI/MI exam section list
        ├── CommitmentsPanel         ← user-added schedule blocks
        ├── ScheduleToolbar          ← undo/redo/add controls
        └── modals/
            ├── AddCommitmentModal
            └── EditBlockModal
```

**Key orchestrators:**
- `CommandCenter` (`frontend/src/components/command-center/`) — owns ingestion flow, calls `usePlanSync` hook for all Supabase plan CRUD
- `SaveMenu` — inline save dropdown (Overwrite / Save as new)

**Data flow:**
```
User uploads screenshot
  → POST /api/research-screenshot
  → Gemini parses schedule image → CourseEntry[]
  → Browser Use researches each course (RMP, Reddit, course page)
  → Results cached in Supabase course_research_cache
  → POST /api/fit-analysis → ScheduleEvaluation (fitness score)
  → courseResearchResultToDossier() mapper → ClassDossier[]
  → DossierScheduleWorkspace renders cards + calendar
```

**Key types** — all in `frontend/src/types/dossier.ts`:
- `ClassDossier` — core domain model for a course card
- `CourseLogistics` — Browser Use research output (attendance, grade_breakdown, evidence[], professor_info_found, general_course_overview, general_professor_overview)
- `SunsetGradeDistribution` — CAPE/SunSET grade data (includes `is_cross_course_fallback` + `source_course_code` for cross-course fallback)
- `ScheduleEvaluation` — fitness score + alerts + recommendation
- `EvidenceItem` — verbatim quote from a source with URL + relevance_score

**Frontend hooks:**
- `useScheduleEditor` (`frontend/src/hooks/`) — calendar state with undo/redo history
- `usePlanSync` (`frontend/src/hooks/`) — all Supabase auth + plan loading/saving/deleting

**Mock data:** `frontend/src/lib/mock/dossier.ts` — realistic mock for demo/development, includes evidence arrays and logistics.

---

### Backend Services

`services/api/` — FastAPI app. Module layout after refactor:

```
app/
├── main.py
├── models/
│   ├── domain.py        ← DB row models (CamelModel base with camelCase aliasing)
│   ├── research.py      ← ALL research Pydantic models (CourseLogistics, EvidenceItem,
│   │                       SunsetGradeDistribution, CourseResearchResult, BatchResearchResponse…)
│   └── course_parse.py  ← CourseEntry, SectionMeeting (Gemini parse output)
├── services/
│   ├── course_research.py  ← Orchestrator: geocode + SunSET + cache + Browser Use per course
│   ├── browser_use.py      ← Browser Use client setup, build_task() prompt, JSON parsing
│   ├── sunset.py           ← build_sunset_grade_distribution() from DB row
│   ├── fit_analysis.py     ← Schedule fitness scoring
│   └── geocode.py          ← Building code → lat/lng resolution
├── db/
│   ├── client.py        ← Supabase client singleton
│   ├── service.py       ← normalize_course_code, search_campus_building, cache CRUD, plan CRUD
│   ├── sunset_db.py     ← get_sunset_grade_distribution() with cross-course professor fallback
│   └── community.py     ← Community posts/replies CRUD
└── routers/
    ├── parse.py         ← /api/parse-screenshot, /api/research-screenshot
    ├── fit.py           ← /api/fit-analysis
    ├── calendar.py      ← /api/calendar/oauth
    └── community.py     ← community endpoints
```

**Active endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/parse-screenshot` | Multipart image → Gemini → structured courses JSON |
| `POST` | `/api/research-screenshot` | Parse + Browser Use research + Supabase cache |
| `POST` | `/api/fit-analysis` | Schedule fitness scoring |
| `GET` | `/api/calendar/oauth` | Google Calendar OAuth flow |
| `POST` | `/plans` | Create saved plan (requires Bearer JWT) |

**Environment:** `services/api/.env` needs `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`. `BROWSER_USE_API_KEY` is required for live research (keys start with `bu_`).

**Important backend patterns:**
- All DB row models use `CamelModel` base (camelCase alias + `populate_by_name=True`) — Supabase returns snake_case, JSON responses use camelCase
- Browser Use prompt is in `browser_use.py → build_task()` — this is where research instructions live; update here to change what gets scraped
- `course_research_cache` table keyed by normalized course code + professor — re-research clears stale cache
- SunSET cross-course fallback: if professor has never taught the requested course, `get_sunset_grade_distribution()` falls back to any course taught by that professor, sets `is_cross_course_fallback=True` + `source_course_code`

---

### Database

Schema in `supabase/migrations/0001_init.sql`. Key tables (RLS by `auth.uid()`):
- `profiles` — user metadata (display_name, college, expected_grad_term)
- `saved_plans` — quarter plans (title, quarter_label, status, payload JSON containing ClassDossier[] + ScheduleEvaluation + commitments)
- `vault_items` — uploaded files linked to plans
- `course_research_cache` — shared Browser Use research cache (normalized course code + professor key)
- `sunset_grade_distributions` — pre-seeded CAPE/SunSET grade data (queried by normalized_course_code + normalized_professor_name)
- `campus_buildings` — geocode table for building code → lat/lng resolution

---

### Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 + React 19 + TypeScript 5 |
| Styling | Tailwind CSS v4 + PostCSS |
| Animations | Framer Motion |
| Icons | Lucide React |
| Maps | Leaflet + React Leaflet (loaded via `next/dynamic` with `ssr: false`) |
| Auth/DB | Supabase (Auth + Postgres) |
| Backend | FastAPI + Uvicorn (Python 3.11+) |
| AI | Gemini API (screenshot parsing + synthesis) |
| Browser Automation | Browser Use SDK v3 (`AsyncBrowserUse`) |

---

### Design System

Dark navy theme. All tokens defined as CSS variables in `frontend/src/app/globals.css`:

```
--hub-bg:           #0a192f  (page canvas)
--hub-surface:      #112240  (cards, panels)
--hub-surface-elevated: #162a45  (dropdowns, modals)
--hub-cyan:         #00d4ff  (primary accent — data, links, active states)
--hub-gold:         #e3b12f  (secondary accent — ratings, warnings)
--hub-text:         #e6f1ff  (primary text)
--hub-text-secondary: rgba(230,241,255,0.72)
--hub-text-muted:   rgba(230,241,255,0.48)
--hub-danger:       #ff6b6b
--hub-success:      #5eead4
```

**Fonts** (loaded via `next/font` in layout):
- `--font-ibm-plex-sans` — body text
- `--font-outfit` — display/headings (`font-[family-name:var(--font-outfit)]`)
- `--font-jetbrains-mono` — data, numbers, code (`font-[family-name:var(--font-jetbrains-mono)]`)

**Tailwind utilities:** `hub-scroll` (thin scrollbar), `scrollbar-hide`. Borders consistently use `border-white/[0.08]` (subtle) — never solid grays.

**Leaflet CSS** is imported at the global level in `globals.css` (`@import "leaflet/dist/leaflet.css"`) — do NOT import it inside dynamic modules or Turbopack will fail to load the CSS chunk.

---

### Path Alias

`@/*` → `./src/*` (configured in `frontend/tsconfig.json`)

---

## Key Design Decisions & Gotchas

**SunSET source URLs:** The `source_url` stored in `sunset_grade_distributions` may be a CSV export link, not a web page. The frontend (`DossierDashboardModal`) uses `normalizeSunsetUrl()` to detect and replace these with a proper UCSD search URL. The Browser Use prompt also instructs the agent never to use download/export URLs.

**Professor not found fallback:** When Browser Use finds no professor-specific data (no Reddit posts, no syllabus, no RMP for this specific course), `professor_info_found` is set to `false` in `CourseLogistics`. The frontend shows an amber notice + renders `general_course_overview` and `general_professor_overview` instead.

**Cross-course SunSET fallback:** If a professor has never taught a requested course (e.g., Bryan Chin has only taught CSE 30, not CSE 120), `get_sunset_grade_distribution()` returns a row from a different course they DID teach, with `is_cross_course_fallback=True`. The UI disclaims this prominently.

**`DossierDashboardModal`** is a full-screen bento-grid dashboard (not a tabbed modal). It renders Professor/RMP, Grade Distribution, and Evidence columns simultaneously. Left/right arrows + keyboard `←/→` navigate between courses. It is rendered once in `DossierScheduleWorkspace` and receives the full `ClassDossier[]` array for navigation.

**Plan payload:** `saved_plans.payload` is a JSON blob containing `{ version, activeQuarterId, classes: ClassDossier[], evaluation: ScheduleEvaluation, commitments: ScheduleCommitment[] }`. Parsed by `parsePlanPayload()` in `frontend/src/lib/hub/plan-payload.ts`.
