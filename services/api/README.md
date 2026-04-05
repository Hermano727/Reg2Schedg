# Reg2Schedg API (FastAPI)

Supabase-backed API: **JWT-verified saved plans**, **Gemini screenshot parsing**, **Browser Use course research**, and DB health checks. CORS allows `http://localhost:3000` for the Next.js app.

## Prerequisites

- **Python 3.11+** (3.14 on Windows is OK). `supabase` is **pinned to 2.12.0** so `pip` does not pull `storage3` 2.x → `pyiceberg` (which often fails to build on Windows without Visual C++ Build Tools). To use the latest `supabase` package, prefer **Python 3.12** and/or install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
- A **Supabase** project with the schema applied (see below).
- A **Gemini API key** if you want screenshot parsing to run (get one at [Google AI Studio](https://aistudio.google.com/apikey)).
- A **Browser Use API key** if you want `/api/research-screenshot` or `test_scraper.py` to run.

## 1. Virtual environment

From the **repo root**:

```bash
cd services/api
python -m venv .venv
```

Activate:

| OS | Command |
|----|---------|
| Windows (cmd) | `.venv\Scripts\activate.bat` |
| Windows (PowerShell) | `.venv\Scripts\Activate.ps1` |
| macOS / Linux | `source .venv/bin/activate` |

Install dependencies:

```bash
pip install -r requirements.txt
```

## 2. Environment variables

```bash
cp .env.example .env
```

Edit **`services/api/.env`** and set:

| Variable | Where to find it |
|----------|------------------|
| `SUPABASE_URL` | Supabase **Settings → API → Project URL** (must look like `https://xxxxx.supabase.co`) |
| `SUPABASE_KEY` | **anon public** key (same page). Used for PostgREST with RLS. |
| `SUPABASE_JWT_SECRET` | **Settings → API → JWT Settings → JWT Secret** |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `BROWSER_USE_API_KEY` | Browser Use Cloud API key |

> **Note:** `SUPABASE_KEY` should be the **anon** key when using user JWTs on `/plans`. Do not put the **service_role** key in a file that ships to clients; it is only for trusted server-only tools.

## 3. Database schema (Supabase)

Do **not** use the old `quarters` / `class_dossiers` snippet. Apply the real migration once:

**File:** [`../../supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql)

1. Open the Supabase dashboard → **SQL Editor**.
2. Paste the full contents of that file and run it.

This creates `profiles`, `saved_plans`, `vault_items`, RLS, the `auth.users` → `profiles` trigger, and Storage policies for the `user-content` bucket.

For shared course research caching, also create:

```sql
create table if not exists public.course_research_cache (
  id uuid primary key default gen_random_uuid(),
  course_code text not null,
  professor_name text not null default '',
  course_title text,
  normalized_course_code text not null,
  normalized_professor_name text not null default '',
  logistics jsonb not null,
  model text,
  updated_at timestamptz not null default now()
);

create unique index if not exists course_research_cache_lookup_idx
  on public.course_research_cache (normalized_course_code, normalized_professor_name);
```

## 4. Run locally

Still inside **`services/api`** with the venv activated:

```bash
uvicorn app.main:app --reload --port 8000
```

Quick checks:

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok"}

curl http://127.0.0.1:8000/db-health
# {"status":"ok","db":"connected"}
```

Open **http://127.0.0.1:8000/docs** for interactive OpenAPI.

### Test parse endpoint (optional)

Send a small PNG/JPEG (replace path):

```bash
curl -X POST http://127.0.0.1:8000/api/parse-screenshot -F "file=@C:\path\to\screenshot.png"
```

Expect JSON with a `courses` array. If `GEMINI_API_KEY` is missing or invalid, this route will error.

### Test research endpoint (optional)

```bash
curl -X POST "http://127.0.0.1:8000/api/research-screenshot?concurrency=1" \
  -F "file=@/path/to/screenshot.png"
```

Expect a JSON response with one result per deduped course. The backend checks Supabase cache first and only calls Browser Use on cache miss.

### Import SunSET grade data (optional)

If you want to import directly from the public SunSET CSV into a normalized table, create:

```sql
create table if not exists public.sunset_grade_distributions (
  id uuid primary key default gen_random_uuid(),
  source_row_hash text unique not null,
  course_code text not null,
  professor_name text,
  term_label text,
  normalized_course_code text not null,
  normalized_professor_name text not null default '',
  grade_distribution jsonb not null,
  recommend_professor_percent numeric,
  submission_time timestamptz,
  source_url text not null,
  raw_row jsonb not null,
  raw_user_id text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sunset_grade_distributions_course_idx
  on public.sunset_grade_distributions (normalized_course_code, normalized_professor_name);
```

Then you can import the public SunSET CSV with:

```bash
cd services/api
python import_sunset.py --dry-run
python import_sunset.py
```

The importer uses the published Google Sheets CSV export by default and upserts by `source_row_hash`. If the CSV uses unexpected column names, you can override them:

```bash
python import_sunset.py --course-column "Course" --professor-column "Professor" --term-column "Quarter"
```

If you already imported the CSV into a raw table first, create a raw table such as `sunset_grade_distributions_raw` with the original CSV columns, then normalize it into the app table:

```bash
cd services/api
python normalize_sunset.py --dry-run
python normalize_sunset.py
```

### Test `/plans` (optional)

Requires a valid Supabase **access token** (same JWT the browser gets after sign-in):

```bash
curl -X POST http://127.0.0.1:8000/plans ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"Test\",\"quarter_label\":\"Spring 2026\",\"status\":\"draft\",\"payload_version\":1,\"payload\":{}}"
```

(PowerShell: use `` ` `` for line continuation instead of `^` if you prefer a single line.)

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness — no DB |
| `GET` | `/db-health` | Hits `profiles` via Supabase |
| `GET` | `/docs` | Swagger UI |
| `POST` | `/api/parse-screenshot` | Multipart image → Gemini structured `courses` |
| `POST` | `/api/research-screenshot` | Multipart image → parse + Browser Use research + shared Supabase cache |
| `POST` | `/plans` | Create `saved_plans` row (Bearer = Supabase user JWT) |

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `Failed building wheel for pyiceberg` / MSVC error | Stay on pinned `supabase==2.12.0` in `requirements.txt`, or install Visual C++ Build Tools, or use Python 3.12 with a newer supabase (not pinned). |
| `ModuleNotFoundError` / other pip failures | `python -m pip install -U pip` then `pip install -r requirements.txt` again |
| `db-health` 503 | Wrong `SUPABASE_URL` / `SUPABASE_KEY`, or migration not applied |
| CORS errors from the app | Frontend must use `http://localhost:3000` (or add your origin in `app/main.py`) |
| Parse returns 4xx/5xx | Confirm `GEMINI_API_KEY` and image `Content-Type` is an image |
