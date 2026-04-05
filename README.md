# Reg2Schedg

Monorepo: **Next.js app** in [`frontend/`](frontend/), **Python services** in [`services/`](services/), **database migrations** in [`supabase/`](supabase/).

## Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev        # localhost:3000 (Turbopack)
npm run build
npm run lint
```

### Authentication

Powered by Supabase Auth:

- **`/login`** — Email/password (`signInWithPassword`) for existing accounts; Google/GitHub OAuth signs in or creates the user.
- **`/signup`** — Email/password (`signUp`) for new accounts; OAuth on this page uses the same provider flow (returning users are signed in).
- **Linking Google to email/password** does **not** happen automatically. A Google-only user has no password until they go through **Create account** or you implement [manual identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

### Deploy (Vercel)

Set the Vercel project **Root Directory** to `frontend`.

## Backend (FastAPI)

See [`services/api/README.md`](services/api/README.md) for full setup. Quick start:

```bash
cd services/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Copy .env.example → .env and fill in values
uvicorn app.main:app --reload --port 8000
```

Required env vars: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`. Optional: `BROWSER_USE_API_KEY`.

Active endpoints: `POST /api/parse-screenshot`, `POST /api/research-screenshot`, `POST /api/fit-analysis`, `GET /api/calendar/oauth`, `POST /plans`.

## Database

Schema: [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Apply via the Supabase dashboard SQL editor or CLI. Tables: `profiles`, `saved_plans`, `vault_items`, `course_research_cache`.
