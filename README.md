# TritonHub

Monorepo-style layout: **Next.js app** in [`frontend/`](frontend/), **Python services** in [`services/`](services/).

## Frontend (Next.js)

All npm scripts live in [`frontend/package.json`](frontend/package.json). Run everything from `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

### Authentication

- **`/login`** — Email/password uses `signInWithPassword` only (existing password accounts). **Google/GitHub** use OAuth; the first successful OAuth login **creates** the user if they are new, which is standard for social login.
- **`/signup`** — Email/password uses `signUp` only (creates the email identity). OAuth on this page uses the same provider flow; returning users are signed in.
- **Linking Google to email/password** does **not** happen automatically in Supabase. A Google-only user does not get a password until they register via **Create account** or you implement [manual identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking) in the dashboard / app.

### Deploy (Vercel)

Set the Vercel project **Root Directory** to `frontend` so builds use the Next.js app.

## Backend (scaffold)

See [`services/api/README.md`](services/api/README.md) for the FastAPI health check service.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
