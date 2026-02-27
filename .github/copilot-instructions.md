# Director of Studies — Project Overview & Memory Workflow

## Project overview

Director of Studies is a local-first MVP voice tutor for GCSE/A-level Humanities.

### Core architecture
- **Web app:** Next.js 14 (App Router, TypeScript, Tailwind) in `apps/web`
- **Realtime audio:** Self-hosted LiveKit in Docker
- **Tutor agent:** Python 3.11 FastAPI + LiveKit Agents in `apps/agent`
- **Storage:** Postgres 16 + pgvector
- **RAG:** content ingestion from `content/{courseId}/{topicId}/*` and retrieval filtered by course/topic
- **Persistence:** sessions, transcript, and summary data in Postgres

### Runtime model
- Local development via `infra/docker-compose.yml`
- Browser joins LiveKit room from web UI
- Agent joins same room as `TutorBot`
- Transcript updates flow during call; transcript + summary saved and exposed via session pages

## Planning prompt for agents
Agents when in planning mode should refer to:

`/.github/memory/review-plan.prompt.md`

To structure their approach and answer.

## Shared memory location (required)

Use this file for cross-task memory:

`/.github/memory/agent-notes.md`

This is the single source for discoveries, implementation notes, decisions, and follow-ups.

## Required memory behavior for agents

1. **Before starting any task**
   - Read `/.github/memory/agent-notes.md` and use relevant prior discoveries.

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
