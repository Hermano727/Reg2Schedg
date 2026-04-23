# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

---

## What Is Reg2Schedg?

**Reg2Schedg** is an intelligent academic planner for UCSD students. Core loop: upload a WebReg schedule screenshot → get a unified intelligence dashboard per course (professor ratings, grade distributions, Reddit sentiment, workload score, interactive calendar).

---

## Commands

### Frontend (Next.js)
```bash
cd frontend
npm run dev      # Dev server with Turbopack at localhost:3000
npm run build
npm run lint
```

### Backend (FastAPI)
```bash
cd services/api
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
# Docs: http://127.0.0.1:8000/docs
```

---

## Architecture

**Monorepo:** Next.js 15 frontend (`frontend/`) + FastAPI backend (`services/api/`).

### Frontend Component Hierarchy
```
HubShell
└── CommandCenter                    ← phase state machine: idle → processing → dashboard
    ├── IngestionHub                 ← file drop zone + manual research form
    ├── ProcessingModal
    └── DossierScheduleWorkspace     ← 4-phase guided workspace (Overview/Courses/Logistics/Review)
        ├── ClassCard[]              ← landscape split card per course
        ├── DossierDashboardModal    ← full-screen bento-grid course detail (keyboard ←/→ nav)
        ├── WeeklyCalendar           ← drag-reschedulable grid (undo/redo via useScheduleEditor)
        ├── CampusPathMap            ← Leaflet map with geocoded building markers
        ├── DifficultyScoreHud       ← AI fitness score + alerts
        ├── ExamsPanel
        ├── CommitmentsPanel
        └── modals/ (AddCommitmentModal, EditBlockModal)
```

**Key orchestrators:**
- `CommandCenter` — owns ingestion flow + calls `usePlanSync` for all Supabase plan CRUD
- `RightSidebar` — saved plans list + vault items
- `Header` + `CommandPalette` (Cmd+K)

### Data Flow
```
User uploads screenshot
  → POST /api/research-screenshot
  → Gemini parses image → CourseEntry[]
  → compute_schedule_signature() checks known_schedules (fast path)
  → If miss: tiered pipeline per course (Reddit → RMP → UCSD catalog → Gemini synthesis)
  → Results cached in course_research_cache + known_schedules snapshot
  → POST /api/fit-analysis → ScheduleEvaluation
  → courseResearchResultToDossier() → ClassDossier[]
  → DossierScheduleWorkspace renders
```

### Key Types (`frontend/src/types/dossier.ts`)
- `ClassDossier` — core domain model for a course card
- `CourseLogistics` — research output (attendance, grade_breakdown, evidence[], professor_info_found, overviews)
- `SunsetGradeDistribution` — CAPE/SunSET grade data (`is_cross_course_fallback`, `source_course_code`)
- `ScheduleEvaluation` — fitness score + alerts + recommendation
- `EvidenceItem` — verbatim quote with URL + relevance_score

### Key Frontend Hooks
- `useScheduleEditor` — calendar state with undo/redo; re-hydrates on `hydrateKey` change
- `usePlanSync` — all Supabase auth + plan CRUD; handles v1 (full payload) and v2 (cache references)

---

### Backend Module Layout
```
services/api/app/
├── main.py, config.py
├── models/domain.py          ← DB row models (CamelModel base = camelCase aliases)
├── models/research.py        ← ALL research Pydantic models (snake_case, plain BaseModel)
├── models/course_parse.py    ← CourseEntry, SectionMeeting
├── services/
│   ├── course_research.py    ← batch orchestrator, known-schedule fast path
│   ├── screenshot_parser.py  ← Gemini multimodal parse
│   ├── reddit_client.py      ← Tier 0 + Tier 0.5 (relevance scoring)
│   ├── rmp_client.py         ← Tier 1 RateMyProfessors GraphQL
│   ├── ucsd_scraper.py       ← Tier 2 UCSD catalog/syllabus
│   ├── logistics_synthesizer.py ← Tier 3 Gemini synthesis → CourseLogistics
│   ├── sunset.py             ← build_sunset_grade_distribution() from DB row
│   └── fit_analysis.py       ← schedule fitness scoring
├── db/
│   ├── service.py            ← cache CRUD, plan CRUD, normalization helpers
│   ├── sunset_db.py          ← get_sunset_grade_distribution() with cross-course fallback
│   └── community.py          ← posts/replies/votes/notifications
├── auth/deps.py, auth/jwt.py ← Bearer JWT validation via SUPABASE_JWT_SECRET
├── routers/                  ← parse.py, fit_analysis.py, plans.py, calendar.py, community.py
└── utils/normalize.py        ← normalize_course_code, normalize_professor_name, compute_schedule_signature
```

### Research Pipeline (Tiered)

Tiers 0, 1, 2 run **concurrently**. Tier 0.5 runs after Tier 0. Tier 3 runs last.

- **Tier 0** — Reddit r/ucsd: 4 concurrent queries (course code, no-space, prof+num, prof alone); PullPush fallback if < 3 posts
- **Tier 0.5** — Gemini Flash relevance scoring (0–1); drops < 0.3, extracts EvidenceItem quotes > 0.6
- **Tier 1** — RateMyProfessors unofficial GraphQL (school ID `U2Nob29sLTExMg==`)
- **Tier 2** — UCSD catalog HTML scrape (BeautifulSoup)
- **Tier 3** — Gemini synthesis → structured `CourseLogistics`

**Known-schedule fast path:** SHA-256 signature over `(course_code, professor_name)` pairs → `known_schedules` table (TTL 14 days). On hit, meetings are always re-freshened from the current parse.

**Per-course cache:** `course_research_cache` keyed by normalized code+prof. Three-stage professor lookup: exact → middle-initial strip → name-order swap (handles "Last, First" ↔ "First Last").

---

### Active Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/research-screenshot` | Parse + tiered pipeline + cache |
| `POST` | `/api/fit-analysis` | Schedule fitness scoring |
| `GET`  | `/plans/{id}/expanded` | Expand plan: v1 passthrough, v2 joins course_research_cache + sunset_grade_distributions |
| `GET`  | `/api/community` | List community posts |
| `POST` | `/api/community` | Create post |
| `GET`  | `/api/community/{id}` | Get post + replies |
| `POST` | `/api/community/{id}/replies` | Create reply |
| `POST` | `/api/community/{id}/upvote` | Toggle upvote |

---

### Environment Variables (`services/api/.env`)

Required: `SUPABASE_URL`, `SUPABASE_KEY` (service-role), `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`

Optional: `ENABLE_BROWSER_USE=true` (+ `BROWSER_USE_API_KEY`) — off by default

---

### Backend Patterns

- **Model conventions:** DB row models use `CamelModel` (camelCase aliases). Research models (`research.py`) use plain `BaseModel` — snake_case throughout.
- **Normalization:** Always via `app/utils/normalize.py`, never inline — cache keys must be identical everywhere.
- **SunSET fallback:** If professor hasn't taught the requested course, falls back to any course they taught (`is_cross_course_fallback=True`).

---

### Database

| Table | Purpose |
|-------|---------|
| `saved_plans` | Quarter plans — `payload_version` 1 (full dossiers) or 2 (class refs only) |
| `saved_plan_classes` | v2 join rows: one row per course per plan |
| `course_research_cache` | Tiered-pipeline results (normalized code+prof key, `logistics` JSONB) |
| `known_schedules` | Signature-keyed snapshot for zero-call fast path |
| `sunset_grade_distributions` | Pre-seeded CAPE/SunSET grade data |
| `campus_buildings` | Building code → lat/lng geocode |
| `vault_items` | Uploaded files linked to plans |
| `profiles` | User metadata |
| `community_posts/replies/notifications` | Community feature |

---

### Plan Payload Versioning

- **v1** — `payload` JSONB contains full `ClassDossier[]` under `classes` key (large, self-contained)
- **v2** — `payload` contains `class_refs[]` (`course_cache_id` + `meetings` + `overrides`); full dossiers assembled at `/plans/{id}/expanded` by joining `course_research_cache` + fetching `sunset_grade_distributions`

**Auto-save behavior (`handleAutoSave` in `usePlanSync`):** After a fresh research run all classes have `cacheId` set, so `canSaveAsV2()` returns true and the plan is saved as **v2**. `persistCompletedSession` (legacy path) always writes v1.

**v2 expansion:** `GET /plans/{id}/expanded` → `_expand_from_class_refs()` in `routers/plans.py` fetches `course_research_cache` for logistics AND calls `get_sunset_grade_distribution()` per course so sunset data survives plan reloads.

**Frontend loading:** v1 plans are read directly from `remotePlans` (no server fetch). v2 plans call `fetchExpandedPlan()` which handles `payload_version === 1` responses without double-mapping (returns ClassDossier[] as-is; only v2 responses go through `courseResearchResultToDossier`).

---

### Design System

Dark navy. CSS variables in `frontend/src/app/globals.css`:

```
--hub-bg:               #0a192f   (page canvas)
--hub-surface:          #112240   (cards, panels)
--hub-surface-elevated: #162a45   (dropdowns, modals)
--hub-cyan:             #00d4ff   (primary accent)
--hub-gold:             #e3b12f   (ratings, warnings)
--hub-text:             #e6f1ff
--hub-text-secondary:   rgba(230,241,255,0.72)
--hub-text-muted:       rgba(230,241,255,0.48)
--hub-danger:           #ff6b6b
--hub-success:          #5eead4
```

**Fonts:** `--font-ibm-plex-sans` (body), `--font-outfit` (headings), `--font-jetbrains-mono` (data/numbers).

**UI rule — no boxes inside boxes:** Modal panels are already elevated surfaces. Use whitespace, dividers (`border-t border-white/[0.06]`), and typography hierarchy for structure inside them — not nested cards. Exception: data-dense components like grade charts.

**Leaflet CSS** must be imported in `globals.css` (`@import "leaflet/dist/leaflet.css"`), not inside dynamic modules — Turbopack won't load it otherwise.

**Path alias:** `@/*` → `./src/*`

---

## Key Gotchas

**Professor not found:** When no professor data is found, `professor_info_found = false` in `CourseLogistics`. Frontend shows amber notice + `general_course_overview`/`general_professor_overview` instead.

**Cross-course SunSET fallback:** `get_sunset_grade_distribution()` may return data from a different course taught by the same professor. `is_cross_course_fallback=True` and `source_course_code` are set; the UI disclaims this.

**SunSET source URLs:** `source_url` in `sunset_grade_distributions` may be a CSV export link. `DossierDashboardModal` uses `normalizeSunsetUrl()` to replace it with a proper UCSD search URL.

**Professor name formats:** WebReg gives "Last, First"; Gemini gives "First Last". Cache lookups do a three-stage match (exact → strip middle initial → swap order). `compute_schedule_signature()` uses the same logic so signatures are stable across both formats.
