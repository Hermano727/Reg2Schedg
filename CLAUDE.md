# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

---

## What Is Reg2Schedg?

**Reg2Schedg** is an intelligent academic planner built for UCSD students experiencing the "quarterly crisis" — the hours spent toggling between WebReg, RateMyProfessors, Reddit, and CAPE trying to figure out whether a 16-unit schedule is survivable.

**Core loop:** User takes a screenshot of their planned WebReg schedule → uploads it → the app produces a unified intelligence dashboard for every course: professor ratings, grade distributions, Reddit student sentiment, course logistics, and a workload fitness score.

**Target user:** UCSD undergraduate planning their quarter. They care about GPA impact, workload, and whether the professor is any good. They don't want to do the detective work manually.

**What makes it distinct:**
- One screenshot → full course dossier for every class
- Multi-tier research pipeline: Reddit (live scraping), RateMyProfessors (GraphQL), UCSD catalog (HTTP scraper), Gemini synthesis — no Browser Use dependency in the default path
- Known-schedule fast path: signature-hashed cache means re-uploading the same schedule is near-instant
- SunSET/CAPE grade distribution data from a pre-seeded Supabase table
- AI "Intensity Score" predicting actual quarter difficulty
- Interactive weekly calendar with drag-able class blocks and custom commitment blocks
- Community center for student discussion (posts, replies, upvotes)

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

**Component hierarchy:**
```
HubShell
└── CommandCenter                    ← phase state machine: idle → processing → dashboard
    ├── IngestionHub                 ← file drop zone + manual research form
    ├── ProcessingModal              ← shown during research phase
    └── DossierScheduleWorkspace     ← main output: 4-phase guided workspace
        ├── Phase nav (Overview / Courses / Logistics / Review)
        ├── ClassCard[]              ← compact card per course (opens DossierDashboardModal)
        ├── DossierDashboardModal    ← full-screen bento-grid course intelligence panel
        ├── WeeklyCalendar           ← drag-reschedulable weekly grid (undo/redo via useScheduleEditor)
        ├── CampusPathMap            ← Leaflet map with geocoded building markers
        ├── DifficultyScoreHud       ← AI fitness score + alerts
        ├── ExamsPanel               ← FI/MI exam section list
        ├── CommitmentsPanel         ← user-added schedule blocks
        ├── ScheduleToolbar          ← undo/redo/add controls
        └── modals/
            ├── AddCommitmentModal
            └── EditBlockModal
```

**Other layout components:**
- `RightSidebar` — saved plans list + vault items (right side of workspace)
- `CommandPalette` — Cmd+K navigation modal
- `Header` — top nav with user account menu
- `calendar-state-context` — tracks whether WeeklyCalendar is in viewport; drives "View Calendar" FAB
- `calendar-sync-context` — Google Calendar sync handler

**Key orchestrators:**
- `CommandCenter` (`frontend/src/components/command-center/`) — owns ingestion flow, calls `usePlanSync` hook for all Supabase plan CRUD
- `SaveMenu` — inline save dropdown (Overwrite / Save as new)

**Data flow:**
```
User uploads screenshot
  → POST /api/research-screenshot
  → Gemini (gemini-2.5-flash) parses schedule image → CourseEntry[]
  → compute_schedule_signature() checks known_schedules (fast path)
  → If miss: tiered pipeline per course (Reddit → RMP → UCSD catalog → Gemini synthesis)
  → Results cached in course_research_cache + known_schedules snapshot
  → POST /api/fit-analysis → ScheduleEvaluation (fitness score)
  → courseResearchResultToDossier() mapper → ClassDossier[]
  → DossierScheduleWorkspace renders cards + calendar
```

**Key types** — all in `frontend/src/types/dossier.ts`:
- `ClassDossier` — core domain model for a course card
- `CourseLogistics` — research output (attendance, grade_breakdown, evidence[], professor_info_found, general_course_overview, general_professor_overview)
- `SunsetGradeDistribution` — CAPE/SunSET grade data (includes `is_cross_course_fallback` + `source_course_code`)
- `ScheduleEvaluation` — fitness score + alerts + recommendation
- `EvidenceItem` — verbatim quote from a source with URL + relevance_score

**Frontend hooks:**
- `useScheduleEditor` (`frontend/src/hooks/`) — calendar state with undo/redo history; re-hydrates on `hydrateKey` change
- `useScheduleFingerprint` — stable fingerprint of viewClasses meetings, used to detect when HYDRATE should fire
- `usePlanSync` (`frontend/src/hooks/`) — all Supabase auth + plan loading/saving/deleting; handles v1 (full payload) and v2 (cache references) plan formats

**Mock data:** `frontend/src/lib/mock/dossier.ts` — realistic mock for demo/development, includes evidence arrays and logistics. Shown in idle state and as fallback.

---

### Backend Services

`services/api/` — FastAPI app. Full module layout:

```
app/
├── main.py               ← FastAPI app, CORS, router registration
├── config.py             ← settings (reads .env)
├── models/
│   ├── domain.py         ← DB row models (CamelModel base with camelCase aliasing)
│   ├── research.py       ← ALL research Pydantic models (CourseLogistics, EvidenceItem,
│   │                        SunsetGradeDistribution, CourseResearchResult, BatchResearchResponse,
│   │                        ResearchRawData, RedditPost, RateMyProfessorStats…)
│   ├── course_parse.py   ← CourseEntry, SectionMeeting (Gemini parse output)
│   ├── plan.py           ← SavedPlanCreate
│   └── community.py      ← community post/reply models
├── services/
│   ├── course_research.py    ← Batch orchestrator: known-schedule fast path,
│   │                            per-course cache lookup, tiered pipeline dispatch,
│   │                            geocode enrichment, known_schedules snapshot write
│   ├── screenshot_parser.py  ← parse_schedule_image() — Gemini multimodal parse
│   ├── reddit_client.py      ← Tier 0: Reddit multi-query search + PullPush fallback
│   │                            Tier 0.5: Gemini Flash relevance scoring
│   ├── rmp_client.py         ← Tier 1: RateMyProfessors unofficial GraphQL client
│   ├── ucsd_scraper.py       ← Tier 2: UCSD catalog + syllabus HTTP scraper (BeautifulSoup)
│   ├── logistics_synthesizer.py ← Tier 3: Gemini synthesis → CourseLogistics
│   ├── browser_use.py        ← Optional Browser Use client (disabled by default)
│   ├── sunset.py             ← build_sunset_grade_distribution() from DB row
│   ├── fit_analysis.py       ← Schedule fitness scoring (Gemini)
│   └── geocode.py            ← Building code → lat/lng resolution (campus_buildings DB)
├── db/
│   ├── client.py        ← Supabase client singleton + per-token client factory
│   ├── service.py       ← cache CRUD, known_schedules CRUD, plan CRUD,
│   │                       campus_buildings lookup, normalization helpers
│   ├── sunset_db.py     ← get_sunset_grade_distribution() with cross-course professor fallback
│   └── community.py     ← community posts/replies/votes/notifications CRUD
├── auth/
│   ├── deps.py          ← FastAPI dependency: get_current_user_access (Bearer JWT)
│   └── jwt.py           ← JWT validation against SUPABASE_JWT_SECRET
├── routers/
│   ├── parse.py         ← /api/parse-screenshot, /api/research-screenshot
│   ├── fit_analysis.py  ← /api/fit-analysis
│   ├── plans.py         ← /plans/{id}/expanded (v1 passthrough + v2 join expansion)
│   ├── calendar.py      ← /api/calendar/oauth
│   └── community.py     ← /api/community/* (posts, replies, votes, notifications)
└── utils/
    └── normalize.py     ← normalize_course_code, normalize_professor_name,
                            normalize_professor_name_loose, compute_schedule_signature
```

---

### Research Pipeline (Tiered)

The default research path is a 4-tier pipeline that runs **without Browser Use**. Browser Use is an optional overlay controlled by the `ENABLE_BROWSER_USE=true` env var.

```
Tier 0   — Reddit (reddit_client.py)
           Multi-query r/ucsd search via public JSON API:
             1. "CSE 120"  (as-written)
             2. "CSE120"   (no-space — students write this)
             3. "Voelker 120"  (professor last name + course number, if known)
             4. "Voelker"      (professor last name alone)
           Queries run concurrently with 0.6s stagger to avoid 429s.
           Falls back to PullPush (api.pullpush.io) if < 3 posts returned.

Tier 0.5 — Gemini Flash relevance scoring (reddit_client.py)
           After Tier 0 returns raw posts, Gemini Flash scores each post's
           relevance to (course, professor) on a 0.0-1.0 scale.
           Posts below 0.3 are dropped. Posts above 0.6 have a verbatim
           evidence quote extracted as an EvidenceItem.
           Falls back to unfiltered posts on any Gemini error.

Tier 1   — RateMyProfessors (rmp_client.py)
           Unofficial GraphQL endpoint (school ID U2Nob29sLTExMg== = UCSD).
           Searches by professor last name, disambiguates by token overlap.
           Returns RateMyProfessorStats + profile URL.

Tier 2   — UCSD HTTP scraper (ucsd_scraper.py)
           Fetches catalog.ucsd.edu HTML with BeautifulSoup.
           fetch_ucsd_course_description() — extracts course description block.
           fetch_ucsd_syllabus_snippets() — extracts attendance/grading keywords.

Tier 3   — Gemini synthesis (logistics_synthesizer.py)
           All Tier 0-2 data fed into gemini-2.5-flash with response_schema=CourseLogistics.
           Pre-scored Reddit evidence from Tier 0.5 is surfaced first in the prompt.
           Output: fully structured CourseLogistics (attendance, grade breakdown,
           sentiment summary, evidence[], professor_info_found, etc.)
```

Tiers 0, 1, and 2 run **concurrently** via `asyncio.gather`. Tier 0.5 runs sequentially after Tier 0 (depends on its output). Tier 3 runs last.

**Known-schedule fast path** (`course_research.py` + `known_schedules` DB table):
- On every call to `research_courses()`, a SHA-256 signature is computed from the normalized `(course_code, professor_name)` pairs.
- If a matching snapshot exists in `known_schedules` (TTL: 14 days) and all results have valid `cache_id` + no errors, the snapshot is returned immediately — no API calls.
- Before returning, meetings are always re-freshened from the current Gemini parse (so old snapshots missing meetings don't break the calendar).
- After a full research run where all courses were cached successfully, the assembled `BatchResearchResponse` is written to `known_schedules` for future fast-path hits.

**Per-course cache** (`course_research_cache` DB table):
- Keyed by `normalized_course_code + normalized_professor_name`.
- Cache hit returns stored `CourseLogistics` without any API calls (meetings still re-geocoded fresh).
- Three-stage professor name lookup: exact → middle-initial strip fallback → name-order swap fallback (handles "Krishnan, Viswanathan" ↔ "Viswanathan Krishnan").

---

### Active Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/parse-screenshot` | Multipart image → Gemini → structured courses JSON |
| `POST` | `/api/research-screenshot` | Parse + tiered pipeline research + Supabase cache |
| `POST` | `/api/fit-analysis` | Schedule fitness scoring (Gemini) |
| `GET`  | `/api/calendar/oauth` | Google Calendar OAuth flow |
| `POST` | `/plans` | Create saved plan (Bearer JWT required) |
| `GET`  | `/plans/{id}/expanded` | Expand saved plan: v1 passthrough, v2 joins course_research_cache |
| `GET`  | `/api/community` | List community posts (filterable by course/professor/dept) |
| `POST` | `/api/community` | Create community post |
| `GET`  | `/api/community/{id}` | Get post + replies |
| `POST` | `/api/community/{id}/replies` | Create reply |
| `POST` | `/api/community/{id}/upvote` | Toggle upvote on post |

---

### Environment Variables

`services/api/.env` — required:
- `SUPABASE_URL`
- `SUPABASE_KEY` (service-role key for server-side operations)
- `SUPABASE_JWT_SECRET` (for Bearer token validation)
- `GEMINI_API_KEY` (powers Tier 0.5, Tier 3, screenshot parsing, fit analysis)

Optional:
- `ENABLE_BROWSER_USE=true` — enables Browser Use overlay (disabled by default; `BROWSER_USE_API_KEY` also needed if enabled, key starts with `bu_`)

---

### Backend Patterns

- All DB row models use `CamelModel` base (camelCase alias + `populate_by_name=True`) — Supabase returns snake_case, JSON responses use camelCase. **Research models (`research.py`) use plain `BaseModel` — snake_case throughout.**
- Normalization is always done through `app/utils/normalize.py` — never inline — so cache keys are identical everywhere.
- `course_research_cache` upsert uses `ON CONFLICT (normalized_course_code, normalized_professor_name)`.
- `known_schedules` upsert uses `ON CONFLICT (signature)`.
- SunSET cross-course fallback: if professor has never taught the requested course, `get_sunset_grade_distribution()` falls back to any course taught by that professor, sets `is_cross_course_fallback=True` + `source_course_code`.

---

### Database

Schema in `supabase/migrations/`. Key tables (RLS by `auth.uid()` where applicable):

| Table | Purpose |
|-------|---------|
| `profiles` | User metadata (display_name, college, expected_grad_term) |
| `saved_plans` | Quarter plans — `payload_version` 1 (full dossiers) or 2 (class refs only) |
| `saved_plan_classes` | v2 join rows: one row per course per plan, stores meetings + overrides |
| `vault_items` | Uploaded files linked to plans |
| `course_research_cache` | Shared tiered-pipeline results (normalized code+prof key, stores `logistics` JSONB) |
| `known_schedules` | Signature-keyed snapshot of full `BatchResearchResponse` for zero-call fast path |
| `sunset_grade_distributions` | Pre-seeded CAPE/SunSET grade data |
| `campus_buildings` | Building code → lat/lng geocode table |
| `community_posts` | Student discussion posts (course_code, professor_name, body, upvotes) |
| `community_replies` | Replies to posts (upvotes, downvotes) |
| `community_notifications` | Per-user notification rows for reply activity |

**Saved plan versioning:**
- **v1** — `payload` JSONB contains full `ClassDossier[]` (large, self-contained)
- **v2** — `payload` contains `class_refs[]` (each a `course_cache_id` + `meetings` + `overrides`); full dossiers assembled server-side at `/plans/{id}/expanded` by joining `course_research_cache`
- `persistCompletedSession` (auto-save after upload) always writes v1. Manual save via `SaveMenu` writes v2 if all classes have `cacheId`, otherwise v1.

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
| AI | Gemini API — gemini-2.5-flash (screenshot parsing, Tier 0.5 scoring, Tier 3 synthesis, fit analysis) |
| HTTP scraping | httpx + BeautifulSoup4 (UCSD catalog, RateMyProfessors GraphQL) |
| Browser Automation | Browser Use SDK v3 — optional overlay only, off by default |

---

### Design System

Dark navy theme. All tokens defined as CSS variables in `frontend/src/app/globals.css`:

```
--hub-bg:               #0a192f  (page canvas)
--hub-surface:          #112240  (cards, panels)
--hub-surface-elevated: #162a45  (dropdowns, modals)
--hub-cyan:             #00d4ff  (primary accent — data, links, active states)
--hub-gold:             #e3b12f  (secondary accent — ratings, warnings)
--hub-text:             #e6f1ff  (primary text)
--hub-text-secondary:   rgba(230,241,255,0.72)
--hub-text-muted:       rgba(230,241,255,0.48)
--hub-danger:           #ff6b6b
--hub-success:          #5eead4
```

**Fonts** (loaded via `next/font` in layout):
- `--font-ibm-plex-sans` — body text
- `--font-outfit` — display/headings (`font-[family-name:var(--font-outfit)]`)
- `--font-jetbrains-mono` — data, numbers, code (`font-[family-name:var(--font-jetbrains-mono)]`)

**Tailwind utilities:** `hub-scroll` (thin scrollbar), `scrollbar-hide`. Borders consistently use `border-white/[0.08]` (subtle) — never solid grays.

**UI composition rule — no boxes inside boxes:** Avoid placing a bordered/bg container directly inside another bordered/bg container. Modal panels are already elevated surfaces (`hub-surface-elevated`); content inside them should use whitespace, dividers (`border-t border-white/[0.06]`), and typography hierarchy to create structure — not nested cards or additional rounded containers. The one exception is data-dense components (e.g. grade distribution charts) where a distinct inner region is functionally required.

**Leaflet CSS** is imported at the global level in `globals.css` (`@import "leaflet/dist/leaflet.css"`) — do NOT import it inside dynamic modules or Turbopack will fail to load the CSS chunk.

---

### Path Alias

`@/*` → `./src/*` (configured in `frontend/tsconfig.json`)

---

## Key Design Decisions & Gotchas

**Research pipeline default:** Browser Use is **disabled by default** (`ENABLE_BROWSER_USE` not set). All research goes through the tiered pipeline (Reddit → RMP → UCSD catalog → Gemini). Browser Use is wired as an optional overlay for environments where it's enabled.

**Known-schedule fast path meetings bug (fixed):** Old `known_schedules` snapshots may have been stored before `meetings` was reliably included in `CourseResearchResult`. On fast-path hit, meetings are now always re-freshened from the current Gemini parse (`enrich_meetings_with_geocode(entry.meetings)`) before returning — so old snapshots can't produce an empty calendar.

**SunSET source URLs:** The `source_url` stored in `sunset_grade_distributions` may be a CSV export link, not a web page. The frontend (`DossierDashboardModal`) uses `normalizeSunsetUrl()` to detect and replace these with a proper UCSD search URL.

**Professor not found fallback:** When no professor-specific data is found (no Reddit posts, no RMP match, no syllabus), `professor_info_found` is set to `false` in `CourseLogistics`. The frontend shows an amber notice + renders `general_course_overview` and `general_professor_overview` instead.

**Cross-course SunSET fallback:** If a professor has never taught a requested course (e.g., Bryan Chin has only taught CSE 30, not CSE 120), `get_sunset_grade_distribution()` returns a row from a different course they DID teach, with `is_cross_course_fallback=True`. The UI disclaims this prominently.

**`DossierDashboardModal`** is a full-screen bento-grid dashboard (not a tabbed modal). It renders Professor/RMP, Grade Distribution, and Evidence columns simultaneously. Left/right arrows + keyboard `←/→` navigate between courses. It is rendered once in `DossierScheduleWorkspace` and receives the full `ClassDossier[]` array for navigation.

**`DossierScheduleWorkspace` phases (desktop):** The workspace uses a 4-tab phase nav — Overview (difficulty HUD + exams), Courses (hero-sized cards), Logistics (map + calendar split), Review (full bento). Mobile uses a simple dossier/schedule tab switcher.

**Plan payload versioning:** `saved_plans.payload` is either v1 `{ version:1, classes: ClassDossier[], evaluation, commitments }` or v2 `{ version:2, class_refs: ClassRef[], evaluation, commitments }`. Parsed by `parsePlanPayload()` in `frontend/src/lib/hub/plan-payload.ts`. v2 classes are resolved server-side via `/plans/{id}/expanded`.

**Professor name normalization order:** WebReg often gives "Last, First" format; Gemini sometimes normalizes to "First Last". Three-stage lookup in `get_course_research_cache()`: exact match → middle-initial strip → name-order swap. The same logic exists in `compute_schedule_signature()` so signatures are stable across both formats.
