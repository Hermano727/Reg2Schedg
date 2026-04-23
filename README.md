# Reg2Schedg

Reg2Schedg is an unofficial academic planning app for UC San Diego students. The core loop is simple: upload a WebReg schedule screenshot or PDF, let the system parse your enrolled courses, and get back a research-backed planning workspace with course intelligence, logistics signals, workload analysis, and a customizable weekly calendar.

This repository is the production codebase for that app. It is not really a turnkey "clone and deploy" starter, because the full product depends on paid APIs, private environment configuration, Supabase infrastructure, and a nontrivial data pipeline. The README is therefore centered on what the app does and how the system is structured, with local run notes moved to the bottom.

## What The App Does

Reg2Schedg turns a raw UCSD schedule into a guided decision workspace. Instead of just showing course blocks on a calendar, it tries to answer the practical questions students actually care about:

- What does this quarter look like as a whole?
- Which classes seem risky, heavy, or unusually manageable?
- What do students say about the course and professor?
- Are there logistics issues like attendance, textbook requirements, podcasts, or awkward campus transitions?
- How does the schedule fit my major, goals, commute, and outside commitments?

The result is a hybrid of schedule parser, course research assistant, and interactive planner.

## Who It's For

Reg2Schedg is currently built around UCSD workflows and data.

- UCSD students uploading WebReg schedule screenshots or exports
- Students comparing multiple saved quarter plans
- Students who want more context than WebReg alone provides
- Students who care about workload fit, transit friction, exam timing, and course logistics

It is advisory software, not an official registrar or audit system.

## Main Product Flow

1. Upload a WebReg schedule screenshot or PDF export
2. Parse the visible course meetings, professor names, and exam slots
3. Enrich each course with research from multiple sources
4. Score the overall quarter for fit, risk, and workload
5. Explore the result in a guided workspace with courses, logistics, review, and calendar views
6. Save the plan, reopen it later, and export to Google Calendar

## Core Features

### Schedule ingestion

- Parses UCSD WebReg screenshots and PDFs
- Handles class meetings, locations, and separate exam entries
- Stores saved plans so students can revisit previous quarter setups

### Course intelligence

- Professor signals from Rate My Professors
- Reddit-sourced student sentiment and quotes
- UCSD course and catalog context
- Structured course logistics such as attendance, podcasts, textbook expectations, and grading breakdowns when available
- SunSET/CAPE-style grade distribution support with fallback handling

### Personalized fit analysis

- Quarter-level fitness score and alert system
- Uses onboarding/profile context like major, career goals, commute, and outside commitments
- Surfaces practical issues, not just generic summaries

### Interactive schedule workspace

- Weekly calendar with drag-to-edit behavior
- Undo/redo and custom personal commitments
- Dedicated exams panel
- Campus map and transition-aware logistics view
- Full course dossier pages for deeper review

### Calendar export

- Syncs class meetings and custom blocks to Google Calendar
- Optional exam-time export with a warning that those slots often change

### Saved plans and profile

- Supabase-authenticated user accounts
- Saved plan persistence
- Profile-based personalization
- Major selection sourced from the UCSD majors catalog table

### Community and supporting systems

- Community discussion features and notifications
- Vault/storage infrastructure for uploaded assets and plan-linked items
- Quota, abuse-throttling, and supporting moderation/reporting systems

## Architecture

Reg2Schedg is a monorepo with three main pieces:

- [`frontend/`](frontend/) - Next.js app
- [`services/api/`](services/api/) - FastAPI backend and research pipeline
- [`supabase/`](supabase/) - database migrations and schema history

### Frontend

The frontend is a Next.js app that handles:

- authentication flows
- onboarding and profile editing
- schedule upload UX
- the main guided dossier/calendar workspace
- Google Calendar sync UX
- saved plans and user-facing settings

Key surfaces include:

- onboarding flow
- command center / ingestion flow
- dossier schedule workspace
- weekly calendar editor
- exams panel
- course dossier pages
- saved plans and profile settings

### Backend

The FastAPI service handles:

- screenshot/PDF schedule parsing
- multi-source course research
- structured logistics synthesis
- schedule fit analysis
- plan expansion/loading
- Google Calendar OAuth and sync
- community APIs

### Data layer

Supabase is used for:

- auth
- persisted plans and user profiles
- supporting app tables
- storage-backed user content
- RLS-protected application data

## Research Pipeline

When a user submits a schedule, the system does more than OCR.

- It parses the schedule into structured course entries
- It checks known cached schedules for a fast path when possible
- It enriches courses with Reddit, Rate My Professors, UCSD source data, and synthesized logistics
- It stores cacheable research so repeated work is reduced
- It converts the result into frontend dossier objects for the main workspace

This is one reason the project is not a lightweight self-host toy: the product value comes from orchestration, caching, paid model access, and ongoing data integration rather than just a static web UI.

## Important Product Notes

- Reg2Schedg is unofficial and advisory
- It is currently tuned for UCSD-specific workflows
- It is not a drop-in degree audit replacement
- Some features depend on external APIs and paid model usage
- Deploying the full stack meaningfully requires infrastructure, secrets, and budget

## Repo Layout

```text
Reg2Schedg/
|- frontend/        Next.js application
|- services/api/    FastAPI backend
|- supabase/        SQL migrations
|- docs/            product specs and notes
`- README.md
```

## Local Development

These notes are here for contributors working on the existing codebase, not as a promise that the full product is easy to self-host.

### Frontend

```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

### Backend

See [`services/api/README.md`](services/api/README.md) for the fuller backend setup.

```bash
cd services/api
python -m venv .venv
# activate the venv
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Environment and services

The app expects a configured Supabase project and backend environment variables. The backend also relies on external model/API credentials for major parts of the research pipeline.

### Database

Schema history lives in [`supabase/migrations/`](supabase/migrations/). Apply migrations through Supabase tooling or the SQL editor as appropriate for your environment.
