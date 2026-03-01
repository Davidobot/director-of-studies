# Director of Studies — Project Overview & Memory Workflow

## Project overview (current)

Director of Studies is a local-first MVP voice tutor for GCSE/A-level Humanities.

### Core architecture
- **Web app:** Next.js 16 (App Router, TypeScript, Tailwind) in `apps/web`
- **Realtime audio:** Self-hosted LiveKit in Docker
- **Tutor agent:** Python 3.11 FastAPI + LiveKit Agents in `apps/agent`
- **Storage:** Postgres 16 + pgvector
- **RAG:** content ingestion from `content/{board}/{level}-{subject}/{topic-slug}/*` and retrieval filtered by course/topic
- **Persistence:** sessions, transcript, and summary data in Postgres

### Runtime model
- Local development via `infra/docker-compose.yml`
- Browser joins LiveKit room from web UI
- Agent joins same room as `TutorBot`
- Transcript updates flow during call; transcript + summary saved and exposed via session pages
- Frontend calls Python API directly (`NEXT_PUBLIC_API_URL`); no Next.js API wrapper layer is required for core flows

## Fast navigation map for agents (read this first)

When a task starts, locate the likely file by domain before searching broadly:

- **Auth gates and request interception (web):** `apps/web/src/proxy.ts`
- **Web app routes/pages/components:** `apps/web/src/app/**`, `apps/web/src/components/**`
- **API endpoints (FastAPI):** `apps/agent/app/main.py`
- **Voice tutoring runtime:** `apps/agent/app/agent_worker.py`, `apps/agent/app/prompts.py`
- **DB access helpers:** `apps/agent/app/db.py`
- **DB schema/bootstrap/seed:** `apps/agent/scripts/bootstrap_db.py`, `apps/agent/scripts/seed_db.py`
- **Content pipeline:** `apps/agent/scripts/pipeline/**` and `specs.yaml`
- **Ops shortcuts:** `Makefile`

## Common task entry points

- **Reset + seed DB:** `make db-reset` (optional, destructive) then `make seed`
- **Apply schema changes:** `make db-migrate`
- **Run content ingest:** `make ingest`
- **Run full content pipeline:** `make content-pipeline`
- **Verify web compile:** `cd apps/web && npm run build`

## Planning prompt for agents (required)
Agents when in planning mode should refer to:

`/.github/prompts/review-plan.prompt.md`

To structure their approach and answer.

## Shared memory location (required)

Use this file for cross-task memory:

`/.github/memory/agent-notes.md`

This is the single source for discoveries, implementation notes, decisions, and follow-ups.

## Required memory behavior for agents

1. **Before starting any task**
   - Read `/.github/memory/agent-notes.md` and use relevant prior discoveries.
   - Check if you're in planning mode and refer to `/.github/prompts/review-plan.prompt.md` if so.

2. **While working**
   - Record important findings (dependency quirks, runtime issues, API constraints, edge cases).

3. **After completing work**
   - Append a concise entry with:
     - context
     - discovery
     - decision
     - files touched
     - follow-up items

4. **When revisiting related work**
   - Reference earlier entries explicitly and avoid rediscovering the same issues.

## Notes quality standard
- Prefer concrete facts over narrative.
- Include exact file paths and commands when useful.
- Capture trade-offs and chosen direction when decisions are made.
- Keep entries short but actionable.
