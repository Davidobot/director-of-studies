# Director of Studies

Simple local-first MVP for a voice-first AI tutor for GCSE/A-level Humanities.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- LiveKit Server (self-hosted in Docker)
- Python 3.11 API + agent service (FastAPI + LiveKit Agents + Deepgram + OpenAI)
- Postgres 16 + pgvector
- Drizzle ORM query builder in web + Python-owned database schema bootstrap

## Repo layout

```
apps/
	web/      # Next.js app (frontend)
	agent/    # FastAPI API + LiveKit agent worker + ingestion/bootstrap scripts
infra/
	docker-compose.yml
	livekit.yaml
	db/init.sql
content/
	{board}/{level}-{subject}/{topic-slug}/
specs.yaml  # exam-board spec manifest (PDF URLs)
```

## Agent memory

- Project guidance prompt: `.github/copilot-instructions.md`
- Shared memory notes: `.github/memory/agent-notes.md`
- Planning/review instructions: `.github/prompts/review-plan.prompt.md`

Agents should read memory notes before starting work and append discoveries/implementation notes after completing tasks.

## Prerequisites

- Docker + Docker Compose
- Node.js 20+ and npm (for native dev)
- Python 3.11+ (for native dev)
- OpenAI API key
- Deepgram API key

## Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Fill in secrets in `.env`:

| Variable | Required | Default |
|---|---|---|
| `OPENAI_API_KEY` | Yes | — |
| `DEEPGRAM_API_KEY` | Yes | — |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (used for demo guest provisioning endpoint) | — |
| `GUEST_DEMO_EMAIL` | No | `guest@director.local` |
| `GUEST_DEMO_PASSWORD` | No | `GuestDemo123!` |
| `GUEST_DEMO_NAME` | No | `Guest Student` |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:8000` |
| `WEB_ORIGIN` | Yes | `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | Yes (for billing) | — |
| `STRIPE_WEBHOOK_SECRET` | Yes (for billing webhook verification) | — |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes (for billing UI) | — |
| `STRIPE_PRODUCT_STANDARD_MONTHLY` | Yes (Stripe Product ID used to resolve paid monthly price) | — |
| `STRIPE_PRODUCT_SCHOOL_MONTHLY` | Yes (Stripe Product ID used to resolve school monthly price) | — |
| `STRIPE_PRODUCT_STANDARD_ANNUAL` | Yes (Stripe Product ID used to resolve paid annual price) | — |
| `STRIPE_PRODUCT_SCHOOL_ANNUAL` | Yes (Stripe Product ID used to resolve school annual price) | — |
| `STRIPE_PRODUCT_CREDIT_1H` | Yes (Stripe Product ID used to resolve 1h credit-pack price) | — |
| `STRIPE_PRODUCT_CREDIT_2H` | Yes (Stripe Product ID used to resolve 2h credit-pack price) | — |
| `STRIPE_PRODUCT_CREDIT_10H` | Yes (Stripe Product ID used to resolve 10h credit-pack price) | — |
| `DB_POOL_MIN_SIZE` | No | `2` |
| `DB_POOL_MAX_SIZE` | No | `12` |
| `AGENT_OPENAI_MODEL` | No | `gpt-4o` |
| `SUMMARY_OPENAI_MODEL` | No | `gpt-4o-mini` |
| `DEEPGRAM_STT_MODEL` | No | `flux-general-en` |
| `DEEPGRAM_TTS_MODEL` | No | `aura-2-draco-en` |
| `SILENCE_NUDGE_SHORT_S` | No | `3.0` |
| `SILENCE_NUDGE_LONG_S` | No | `8.0` |

4. Bootstrap and seed DB via Python:

```bash
make seed
```

Database migrations/schema updates are managed by Python via `apps/agent/scripts/bootstrap_db.py`.
The agent container runs this bootstrap script automatically on startup, and you can apply it manually with:

```bash
make db-migrate
```

To sync Stripe pricing into the `plans` table from product IDs, run:

```bash
make billing-sync-prices
```

The sync selects the most recent active matching price for each configured product (`month`/`year` recurring for subscriptions, one-time for credit packs).

To copy products/prices from live Stripe to test Stripe:

```bash
# Dry-run preview
make billing-copy-live-to-test

# Apply (creates/updates in test account)
make billing-copy-live-to-test APPLY=1
```

> Model settings can also be changed per-session on the home page UI.

---

## Running locally

### Option A — one command (recommended for development)

Runs Postgres + LiveKit in Docker and starts Next.js (HMR) and the agent (auto-reload) as native processes. File saves reflect immediately with no container rebuilds.

**Install dependencies first (once):**

```bash
# Web
cd apps/web && npm install && cd ../..

# Agent — creates apps/agent/.venv with Python 3.11 or 3.12
# (livekit-agents 1.4.x does NOT support Python 3.13+)
make venv
```

**Install [overmind](https://github.com/DarthSim/overmind) for the best experience (optional but recommended):**

```bash
brew install overmind
```

**Start everything:**

```bash
make local
```

With overmind you get labelled, colour-coded output and can restart individual processes:

```bash
overmind restart web    # hot-swap Next.js without touching the agent
overmind restart agent
overmind connect web    # attach to a single process's output
```

Without overmind, `make local` falls back to shell background jobs — a single Ctrl-C stops all processes.

### Option B — split terminals

```bash
make infra    # Terminal 1 — Postgres + LiveKit
make web      # Terminal 2 — Next.js http://localhost:3000
make agent    # Terminal 3 — FastAPI http://localhost:8000
```

### Option C — full Docker stack (original)

All services in containers. Requires a full rebuild after code changes.

```bash
make up       # build + start all containers
make down     # stop
make logs     # tail all logs
```

---

3. Open:

- Web app: http://localhost:3000
- Agent health: http://localhost:8000/health

## Usage flow

1. Create an account at `/signup` and choose Student or Parent/Guardian.
2. Complete onboarding at `/onboarding`.
	- Students provide date of birth and UK school year.
	- Parents/guardians can optionally link a student immediately using the student account email.
3. Student accounts: choose Course and Topic on Home, then click **Join Call**.
4. Browser joins LiveKit room; the tutor agent joins the same room.
5. Speak into mic and receive voice responses.
6. Live transcript appears on call page.
7. Click **End Call** to finalize transcript and generate summary.
8. Open **Session History** (`/sessions`) for your own sessions.

## New user flows

- Student dashboard: `/dashboard`
- Student subject enrolment: `/onboarding/subjects`
- Tutor per-subject voice/personality: `/settings/tutors`
- Calendar scheduling: `/calendar`
- Parent dashboard: `/parent/dashboard`
- Parent controls/restrictions: `/parent/settings`

The login page includes a **Log in as Guest** button that provisions/updates a deterministic demo student account via Supabase admin API and signs in automatically.

## Ingestion (RAG)

Content files live at:

```bash
content/{board}/{level}-{subject}/{topic-slug}/{topic-slug}.md
content/{board}/{level}-{subject}/{topic-slug}/keywords.txt
```

The source-of-truth mapping for exam boards/specs lives in `specs.yaml`.
Topic lists are generated separately via `make discover-topics`, then manually reviewed/approved in `content/.cache/discovered_topics.yaml` before `make beautify`.

### Specification PDF pipeline

The staged pipeline downloads exam-board PDFs, extracts text, rewrites content via GPT, and generates STT keywords:

```bash
make download    # fetch PDFs from specs.yaml into content/.cache/pdfs
make extract     # extract PDF text into content/.cache/raw
make discover-topics  # generate editable topic catalog at content/.cache/discovered_topics.yaml
make beautify    # generate topic markdown into content/{board}/{level}-{subject}/{topic-slug}
make keywords    # generate keywords.txt alongside markdown
make content-pipeline  # run all five stages
```

If any PDF URL fails during `make download`, the pipeline writes `content/.cache/download_errors.json`
with the failing `spec_key`, `pdf_url`, and error message so you can patch `specs.yaml` quickly.

### Extras / supercurricular subjects

Subjects like Debating and Oxbridge Admissions (per target subject) are defined in `specs.yaml` under
`board: extras` with `category: supercurricular`. They use the same pipeline but PDFs are placed manually
instead of downloaded:

1. Add or enable an entry in `specs.yaml` (see the `extras-*` examples at the bottom).
2. Place the source PDF at `content/.cache/pdfs/<key>.pdf` (or set `pdf_file:` to use a custom filename).
3. Set `enabled: true` on the spec entry.
4. Run the normal pipeline: `make extract discover-topics beautify keywords`.
5. `make ingest` embeds the generated markdown into the database.

Generated content lands in `content/extras/{level}-{subject-slug}/{topic-slug}/`. For example,
`extras-oxbridge-history` produces content at `content/extras/enrichment-oxbridge-admissions-history/`.

To add a new extras subject, add a new entry to `specs.yaml`:

```yaml
- key: extras-my-subject
  enabled: true
  board: extras
  level: Enrichment
  subject: My Subject
  category: supercurricular
  course_name: My Subject Display Name
  pdf_url: ""
  # pdf_file: custom-source.pdf  # optional: override default {key}.pdf naming
```

`make ingest` then embeds generated markdown into `documents/chunks`.

Ingestion runs automatically on agent startup (Docker). To run it manually:

```bash
# Native (make local / make agent workflow)
make ingest

# Inside Docker container
docker compose -f infra/docker-compose.yml exec agent python scripts/ingest.py
```

The script stores:

- `documents`
- `chunks` with `vector(1536)` embeddings (`text-embedding-3-small`)

Retrieval filters by `course_id` and `topic_id` and returns top `k=5` chunks.

## API endpoints

All endpoints are served by the Python FastAPI service on `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
Representative endpoints:

- `POST /api/session/create`
- `POST /api/session/start-agent`
- `POST /api/session/end`
- `GET /api/sessions`
- `GET /api/sessions/{id}`
- `GET /api/reference/board-subjects`
- `GET|POST|DELETE /api/student/enrolments`
- `GET|POST /api/calendar` and `PUT|DELETE /api/calendar/{id}`
- `GET|POST /api/dos-chat`
- `GET /api/progress/overview`
- `GET|POST /api/parent/links`, `POST /api/parent/link-code`, `GET|PUT /api/parent/restrictions`
- `GET|POST|PUT|DELETE /api/tutor-personas*`, `GET|PUT /api/tutor-config`

## Troubleshooting

- LiveKit connection fails
	- Verify `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`.
	- Ensure `infra/livekit.yaml` keys match `.env` API key/secret.

- Microphone/audio issues
	- Grant microphone permission in browser.
	- Confirm system input device is correct.
	- Check agent logs for Deepgram auth errors.

- Agent does not join
	- `docker compose -f infra/docker-compose.yml logs agent`
	- Verify `LIVEKIT_URL=ws://livekit:7880` in container env.

- Transcript/summary missing
	- Ensure `OPENAI_API_KEY` is set.
	- Check `session_transcripts` and `session_summaries` tables in Postgres.
