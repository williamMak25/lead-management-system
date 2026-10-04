# Ledgerline CRM

A full-stack CRM built for small sales teams: companies, contacts, a
drag-and-drop deal pipeline, tasks, notes, and a dashboard with charts.

- **Backend:** Python + [Litestar](https://litestar.dev/), SQLAlchemy 2 (async, via [Advanced Alchemy](https://docs.advanced-alchemy.litestar.dev/)) on PostgreSQL
- **Frontend:** [Next.js](https://nextjs.org/) 16 (App Router) + React 19 + Tailwind CSS v4 + Recharts

The original Express + Vite version lives in `legacy/` for reference.

Comes pre-loaded with realistic sample data (companies, contacts, deals across
every pipeline stage, tasks, and notes) so it's usable immediately.

## Features

Lead management follows Odoo CRM: a lead and an opportunity are the same record, and a lead
becomes an opportunity when it's qualified.

- **Authentication**: email/password and "Continue with Google", gated by an email allowlist
- **Leads**: list view with search, filters, group-by and saved searches (favorites, optionally shared or set as default); CSV import with a preview step and CSV export
- **Pipeline**: kanban by stage (drag between stages, folded stages, per-column totals and an activity bar) or a list view; priority stars, tags, expected revenue and probability
- **Records**: one form for leads and opportunities, with a clickable stage bar, Won / Lost (with a lost reason) / Restore, and convert to opportunity (create or link the customer, assign, merge duplicates)
- **Duplicates & merging**: similar-record warnings by email, phone, company or contact; merge from the list or the record (fields are filled in, tags and notes combined, history moved)
- **Activities**: schedule calls, emails, meetings and to-dos with a due date and an assignee; mark them done with feedback; a "My activities" page and overdue/today/planned badges everywhere
- **History**: each record's timeline of notes, completed activities and tracked field changes (stage, salesperson, revenue, probability…)
- **Sales teams & auto-assignment**: per-team rules (record type, source, tags, country, minimum revenue) and per-member capacity; new leads are assigned automatically, or on demand
- **Predictive lead scoring**: win probability learned from your won/lost history (naive Bayes over the fields you choose, like Odoo's); hand-set probabilities are respected
- **Reports**: pivot table + chart over any two dimensions and a measure (count, revenue, weighted revenue, win rate, conversion rate…), with presets for pipeline, forecast, win/loss, lost reasons and conversion; CSV download
- **Calendar**: month view of activities and expected closing dates
- **Settings**: stages (order, won stage, folding, requirements), teams, tags, lost reasons, UTM campaigns/mediums/sources, scoring fields
- **Companies & contacts**: directories linked to their opportunities and activities
- **Dashboard**: open pipeline and weighted value, won revenue, win rate, your overdue/today activities, revenue by month, stage breakdown, recent activity

## Project structure

```
crm-project/
├── docker-compose.yml  Postgres service for local dev (optional)
├── backend/            Litestar API (port 4000)
│   ├── pyproject.toml   dependencies, managed with uv
│   └── app/
│       ├── main.py       app assembly: routes, sessions, CORS, error handlers
│       ├── config.py     settings from .env, stage/type/source/status lists
│       ├── auth.py       password hashing, session user lookup, auth guard
│       ├── schemas.py    request/response structs (camelCase JSON)
│       ├── db/           schema.sql, SQLAlchemy models, v1→v2 migration, defaults + seed data
│       ├── services/     lead rules (tracking, won/lost, convert, merge, duplicates), assignment,
│       │                 predictive scoring, CSV import/export, settings
│       └── routes/       auth, leads, activities & notes, reports, config, dashboard, companies, contacts
├── frontend/           Next.js app (port 3000)
│   ├── app/             App Router routes (thin wrappers around views/) + root layout
│   ├── views/           Dashboard, RecordsView (Leads + Pipeline), LeadDetail, Activities, Calendar,
│   │                    Reports, Settings, Companies, Contacts, Login
│   ├── components/      AppShell, Sidebar, Kanban, LeadTable, SearchBar, Chatter, LeadModals, ui
│   ├── context/         AuthContext (session), MetaContext (stages, users, tags… for dropdowns)
│   └── lib/             fetch wrapper for the API, filter/group-by definitions, formatting
└── legacy/             previous Express backend and Vite frontend
```

## Getting started

You'll need [Node.js](https://nodejs.org) 20.9 or newer, Python 3.13 with
[uv](https://docs.astral.sh/uv/), and a PostgreSQL server.

### 1. Start Postgres

Use the bundled Docker Compose file:

```bash
docker compose up -d
```

Or point at any existing Postgres server — just create a database and a role
that can connect to it.

### 2. Start the backend

```bash
cd backend
uv sync
cp .env.example .env   # edit DATABASE_URL if you're not using docker compose
uv run litestar --app app.main:app run --port 4000 --reload
```

The API runs at `http://localhost:4000`, with interactive OpenAPI docs at
`http://localhost:4000/api/schema`. On startup it creates the schema
(`backend/app/db/schema.sql`) and seeds the tables with sample data if they're
empty — safe to restart any time, it won't reseed once data exists. It works
against a database created by the old Express backend too: same tables, and
existing bcrypt password hashes still verify.

**Upgrading from v1** (separate Deals / Leads / Tasks): on first start the backend
migrates the data automatically. Deals become opportunities and open leads become
leads, keeping their ids, so old `/deals/<id>` links redirect to the right record.
Tasks become activities, and notes are re-linked. The pipeline keeps your stage names
("Lost" becomes a status with a lost reason), and old lead statuses are kept as tags.
The old tables are renamed to `legacy_deals`, `legacy_leads` and `legacy_tasks`, not
dropped. A database created from scratch gets Odoo-style defaults instead: stages,
lost reasons, tags, sources and two sales teams. Every user is put in a sales team
when they sign up.

Edit `ALLOWED_EMAILS` in `.env` before you try to sign in — it's a
comma-separated list of the only emails allowed to sign up or log in (email/password
or Google). Leave it empty and no one, including you, can log in.

### 3. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. Next.js proxies `/api/*`
requests to the backend (see `rewrites` in `frontend/next.config.mjs`), so
the browser only ever talks to one origin.

### Production build

```bash
cd frontend
npm run build
BACKEND_URL=https://your-backend.internal npm start
```

`BACKEND_URL` (default `http://localhost:4000`) tells the Next.js server where
to proxy `/api/*`. Set it at build time as well, since rewrites are resolved
when the app is built.

## Authentication

Every API route except `/api/auth/*`, `/api/health`, and the API docs
requires a logged-in session (cookie-based; Litestar server-side sessions
stored in the `litestar_session` Postgres table). Two ways in:

- **Email/password** — signup and login, passwords hashed with bcrypt.
- **Google OAuth** — a "Continue with Google" button, hidden automatically
  until it's configured (see below).

Both are gated by `ALLOWED_EMAILS` in `backend/.env` — a comma-separated
allowlist. An email not on the list is rejected by both signup and Google
sign-in, regardless of whether an account already exists for it, so removing
an email from the list revokes access immediately — including sessions that
are already signed in, since the allowlist is re-checked on every request.

### Setting up Google OAuth

Google sign-in is off until you provide credentials — nothing else in the app
is affected while it's off, the button just doesn't appear. To turn it on:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   and create a project (or pick an existing one).
2. **OAuth consent screen** — set it up as "External," add an app name, and
   add your own email under "test users" if it stays in Testing mode (fine
   for a small team; no Google review needed unless you publish it).
3. **Credentials → Create Credentials → OAuth client ID** — application type
   **Web application**. Add an authorized redirect URI:
   - Dev: `http://localhost:4000/api/auth/google/callback`
   - Production: `https://your-backend-domain.com/api/auth/google/callback`
4. Copy the **Client ID** and **Client Secret** it gives you.
5. In `backend/.env`, set:
   ```
   GOOGLE_CLIENT_ID=<the client ID>
   GOOGLE_CLIENT_SECRET=<the client secret>
   GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
   ```
6. Restart the backend. The "Continue with Google" button appears on the
   login page automatically.

A Google account still has to match `ALLOWED_EMAILS` to get in — OAuth
only proves *which* Google account someone is, not that they're allowed.

In production, run behind HTTPS and set `APP_ENV=production` in
`backend/.env` (the session cookie is then marked `secure`). Set
`FRONTEND_URL` to the public URL of the Next.js app — Google sign-in
redirects back there.

## Design notes

The visual identity ("Ledgerline") is intentionally styled like a physical
sales ledger / card-catalog: a dark ink sidebar, warm paper background, deep
green as the primary working color, and gold/brick used sparingly for
priority and at-risk states. Deal cards in the pipeline are styled like index
cards, and higher-value deals get a gold top edge instead of green.
