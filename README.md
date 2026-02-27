# Director of Studies

Simple local-first MVP for a voice-first AI tutor for GCSE/A-level Humanities.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- LiveKit Server (self-hosted in Docker)
- Python 3.11 agent service (FastAPI + LiveKit Agents + Deepgram + OpenAI)
- Postgres 16 + pgvector
- Drizzle ORM (web app)

## Repo layout

```
apps/
	web/      # Next.js app + API routes + Drizzle schema
	agent/    # FastAPI + LiveKit agent worker + ingestion script
infra/
	docker-compose.yml
	livekit.yaml
	db/init.sql
content/
	<courseId>/<topicId>/*.md
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
| `AGENT_OPENAI_MODEL` | No | `gpt-4o` |
| `SUMMARY_OPENAI_MODEL` | No | `gpt-4o-mini` |
| `DEEPGRAM_STT_MODEL` | No | `flux-general-en` |
| `DEEPGRAM_TTS_MODEL` | No | `aura-2-draco-en` |
| `SILENCE_NUDGE_AFTER_S` | No | `3.0` |

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

1. On Home page, choose Course and Topic.
2. Click **Join Call**.
3. Browser joins LiveKit room; agent joins as `TutorBot`.
4. Speak into mic and receive voice responses.
5. Live transcript appears on call page.
6. Click **End Call** to finalize transcript and generate summary.
7. Go to **Session History** (`/sessions`) and open session details.

## Ingestion (RAG)

Content files live at:

```bash
content/{courseId}/{topicId}/*.md
```

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

- `POST /api/session/create` -> create session, ensure room, return participant token
- `POST /api/session/start-agent` -> ask agent service to join room
- `POST /api/session/end` -> end session and generate summary
- `GET /api/sessions` -> list sessions
- `GET /api/sessions/:id` -> session detail (transcript + summary)

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
