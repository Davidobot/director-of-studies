# Agent Memory: Discoveries & Implementation Notes

Use this file as shared working memory across tasks.

## How to use

- Read the latest entries before starting work.
- Append new entries (do not rewrite history unless correcting facts).
- Keep notes concrete: decisions, discoveries, blockers, file paths, and follow-ups.

## Entry template

### YYYY-MM-DD HH:MM (agent/task)
- **Context:**
- **Discovery:**
- **Decision:**
- **Files touched:**
- **Follow-up:**

### 2026-02-27 14:43 (deepgram http session + metadata grant)
- **Context:** Agent connected to LiveKit, but speech recognition/synthesis failed at runtime with `Attempted to use an http session outside of a job context`.
- **Discovery:** Current architecture uses `VoicePipelineAgent` directly from FastAPI/background task, not LiveKit worker job context. Deepgram STT/TTS defaults to `utils.http_context.http_session()` unless `http_session` is provided.
- **Decision:** Inject and manage explicit `aiohttp.ClientSession` in `run_agent_session` and pass it to both `deepgram.STT(..., http_session=...)` and `deepgram.TTS(..., http_session=...)`; close session in `finally`. Also set `can_update_own_metadata=True` in agent token grants to prevent metadata-update warning.
- **Files touched:** `.github/memory/agent-notes.md`, `apps/agent/app/agent_worker.py`, `apps/agent/app/main.py`.
- **Follow-up:** Rebuild/restart `agent` container and verify no `_recognize_task` / `_str_synthesis_task` http-context runtime errors in logs during a test call.

### 2026-02-27 14:51 (deepgram tts bad request model compatibility)
- **Context:** Agent logs showed repeated `failed to synthesize speech` with Deepgram `APIStatusError: Bad Request` and eventual `failed to synthesize speech after 4 attempts`.
- **Discovery:** Runtime/default TTS model was `aura-2`; with pinned `livekit-plugins-deepgram==0.6.16`, this can yield 400 on `/v1/speak` whereas legacy model IDs like `aura-2-draco-en` are accepted.
- **Decision:** Change project defaults from `aura-2` to `aura-2-draco-en` and add backward-compatible alias mapping (`aura-2` -> `aura-2-draco-en`) in agent runtime.
- **Files touched:** `.github/memory/agent-notes.md`, `apps/agent/app/agent_worker.py`, `.env.example`, `infra/docker-compose.yml`, `README.md`.
- **Follow-up:** Rebuild agent and confirm no new TTS 400 errors; optionally expose a dedicated env var validation endpoint for model sanity checks.

### 2026-02-27 14:58 (stt websocket 400 + livekit publish_data enum mismatch)
- **Context:** New runtime errors: Deepgram STT websocket handshake 400 when using `model=flux`, and `AttributeError` for `rtc.DataPacketKind.RELIABLE` during transcript publish events.
- **Discovery:** Pinned Deepgram plugin does not accept `flux` for websocket STT in this setup; installed `livekit` SDK `LocalParticipant.publish_data` uses `reliable=` flag only and does not expose a `kind` enum argument.
- **Decision:** Add STT alias mapping (`flux` -> `flux-general-en`) and change transcript data publishing to `publish_data(payload, reliable=True)` with guarded async helper.
- **Files touched:** `.github/memory/agent-notes.md`, `apps/agent/app/agent_worker.py`, `.env.example`, `infra/docker-compose.yml`, `README.md`.
- **Follow-up:** Restart `agent` and validate absence of `_recognize_task` 400 handshake errors and `DataPacketKind.RELIABLE` attribute errors.

### 2026-02-27 15:07 (stt fallback correction for flux variants)
- **Context:** Subsequent logs showed STT still failing websocket handshake 400 with `model=flux-general-en`.
- **Discovery:** Prior alias (`flux` -> `flux-general-en`) was still incompatible in this pinned stack; any `flux*` value needs fallback to `nova-2-general`.
- **Decision:** Update runtime resolver to map all `flux`-prefixed values to `nova-2-general`, and update defaults/docs (`.env.example`, compose, README) accordingly.
- **Files touched:** `.github/memory/agent-notes.md`, `apps/agent/app/agent_worker.py`, `.env.example`, `infra/docker-compose.yml`, `README.md`.
- **Follow-up:** Rebuild/restart containers and confirm Deepgram STT websocket URL now uses `model=nova-2-general`.

### 2026-02-27 15:18 (proper Flux integration path on legacy plugin)
- **Context:** User reported Deepgram docs indicate `flux-general-en` should be correct and asked to use it properly.
- **Discovery:** Deepgram Flux requires `/v2/listen`; existing plugin code path (`deepgram.STT`) defaults to `/v1/listen`, which explains 400 handshakes for Flux models.
- **Decision:** Implement Flux-specific STT builder in agent runtime: for Flux models, use `deepgram.STT(..., base_url=https://api.deepgram.com/v2/listen, language=None, endpointing_ms=0, filler_words=False, no_delay=False)`. Restore project defaults/docs to `DEEPGRAM_STT_MODEL=flux-general-en`.
- **Files touched:** `.github/memory/agent-notes.md`, `apps/agent/app/agent_worker.py`, `.env.example`, `infra/docker-compose.yml`, `README.md`.
- **Follow-up:** Rebuild and verify agent log URL switches to `wss://api.deepgram.com/v2/listen?model=flux-general-en...`; if STT still fails, next step is upgrading to `livekit-plugins-deepgram>=1.4` and using `deepgram.STTv2` directly.

### 2026-02-27 15:26 (aura-2-draco-en tts normalization)
- **Context:** User requested ensuring `aura-2-draco-en` is the working TTS model path.
- **Discovery:** Defaults were already set to `aura-2-draco-en`, but runtime normalization only handled exact `aura-2` and not common shorthand forms.
- **Decision:** Harden `_resolve_tts_model` to normalize `aura-2`, `aura-2-draco`, and `draco` to `aura-2-draco-en`, while preserving explicit full model strings.
- **Files touched:** `.github/memory/agent-notes.md`, `apps/agent/app/agent_worker.py`.
- **Follow-up:** Rebuild `agent` and confirm no Deepgram TTS 400s when `.env` uses either `aura-2-draco-en` or shorthand aliases.

### 2026-02-27 15:35 (transcript only visible after restart)
- **Context:** User reported session transcript appears on session page only after Docker restart.
- **Discovery:** Transcript persistence previously happened only in `run_agent_session` shutdown `finally`; if room task stayed connected, DB row remained stale/missing until process termination.
- **Decision:** Persist transcript snapshots incrementally on each committed user/agent utterance (threaded DB upsert behind async lock), and end session loop when tracked student participant has left for 2 seconds.
- **Files touched:** `.github/memory/agent-notes.md`, `apps/agent/app/agent_worker.py`.
- **Follow-up:** Rebuild `agent`, run a short call, end call, and verify transcript appears immediately on `/sessions/:id` without container restart.

### 2026-02-27 15:45 (end-call transcript retry + Flux compatibility guard)
- **Context:** User requested a small retry on session end and reported continued Flux STT websocket 400 errors on `/v2/listen` with legacy plugin stack.
- **Discovery:** `livekit-plugins-deepgram==0.6.16` does not expose `STTv2`; forcing Flux through legacy `STT` path can still handshake-fail. Also summary endpoint read transcript immediately without waiting for latest snapshot.
- **Decision:** Add short transcript retry window in end-session API (6 attempts, 400ms interval). Make STT builder version-aware: use `deepgram.STTv2` when available for Flux; otherwise log and fall back to configurable `DEEPGRAM_STT_FALLBACK_MODEL` (default `nova-2-general`).
- **Files touched:** `.github/memory/agent-notes.md`, `apps/web/src/app/api/session/end/route.ts`, `apps/agent/app/agent_worker.py`, `.env.example`, `infra/docker-compose.yml`, `README.md`.
- **Follow-up:** Rebuild and verify transcript appears immediately after end-call and agent no longer emits Flux websocket 400 tracebacks on legacy plugin.

### 2026-02-27 16:06 (true Flux migration on LiveKit 1.4)
- **Context:** User asked for real Flux support, not fallback behavior.
- **Discovery:** Upgrading `livekit-plugins-deepgram` alone is insufficient; `1.4.x` plugins require `livekit-agents>=1.4.3`, and `VoicePipelineAgent` API is removed in that stack.
- **Decision:** Upgrade agent dependencies to LiveKit/Agents/plugin `1.4.3` line and migrate worker runtime from `VoicePipelineAgent` to `AgentSession` + `Agent` subclass hooks. Use native `deepgram.STTv2` for Flux models (verified runtime type), preserve RAG prompt injection via `Agent.on_user_turn_completed`, and preserve transcript persistence via `conversation_item_added` events.
- **Files touched:** `.github/memory/agent-notes.md`, `apps/agent/pyproject.toml`, `apps/agent/app/agent_worker.py`.
- **Follow-up:** End-to-end call verification in browser (join call, speak, confirm transcript + audio response) after rebuilding containers; local editor type checker may still show import warnings if not using upgraded container env.

### 2026-02-27 (libgobject missing in slim image)
- **Context:** After upgrading to `livekit-agents>=1.4.3` + `livekit-rtc`, agent container crashed on startup with `ImportError: failed to load liblivekit_ffi.so: libgobject-2.0.so.0: cannot open shared object file`.
- **Discovery:** `python:3.11-slim` does not include GLib; `livekit-rtc` (native FFI library) requires `libgobject-2.0.so.0` which ships in the `libglib2.0-0` apt package.
- **Decision:** Add `libglib2.0-0` to the `apt-get install` line in `apps/agent/Dockerfile`.
- **Files touched:** `apps/agent/Dockerfile`.
- **Follow-up:** None — container boots cleanly and health endpoint responds.



### 2026-02-27 (voice-tutor prompt tightening + silence watchdog)
- **Context:** Tutor responses were too long (risking student attention loss), included citation brackets `[DocTitle:chunk_id]` and potential markdown that would be read aloud verbatim by TTS.
- **Decision (30 s cap):** Prompt-only heuristic: instruct the LLM to target ~65 words per turn (~30 s at 130 wpm) and split into Socratic Q&A if more is needed. No hard interrupt in code.
- **Decision (silence nudge):** Added `_silence_watchdog()` asyncio task in `run_agent_session`. Polls every 0.5 s; fires `session.say(...)` once when `SILENCE_NUDGE_AFTER_S` seconds have elapsed since the last assistant message without a student reply. `_silence_state` dict shared with `_on_conversation_item` — no locks needed (single-threaded event loop). Watchdog cancelled in `finally` block.
- **Decision (plain speech):** Removed the citation rule from `build_system_prompt` entirely; added an explicit rule forbidding all markdown/citation punctuation.
- **Files touched:** `apps/agent/app/prompts.py`, `apps/agent/app/agent_worker.py`, `infra/docker-compose.yml`.
- **Follow-up:** `SILENCE_NUDGE_AFTER_S` defaults to 3.0 s; tune via env var. If LLM still produces markdown, consider a post-processing strip step on LLM output before TTS.

### 2026-02-27 (STT topic vocabulary hints)
- **Context:** Deepgram STT confused "Lenin" with "Lennon" — common proper nouns specific to GCSE/A-level content aren't in the base acoustic model vocabulary.
- **Discovery:** `deepgram.STTv2` (Flux) accepts `keyterm: list[str]`; `deepgram.STT` (nova-2) accepts `keywords: list[tuple[str, float]]`. Both are set at construction time and emitted in the WebSocket URL query string.
- **Decision:** Added `get_topic_vocabulary(course_id, topic_id)` to `db.py`: fetches all chunk content for the topic and extracts unique capitalized mid-sentence words (proper nouns) via regex. Called in `run_agent_session` after `get_course_topic_names`, result passed to `_build_stt` as `keywords: list[str]`. Capped at 60 terms. `_build_stt` maps to the correct Deepgram parameter (`keyterm` for Flux, `keywords` tuples for STT).
- **Files touched:** `apps/agent/app/db.py`, `apps/agent/app/agent_worker.py`.
- **Follow-up:** Rebuild `agent` container and verify Deepgram WS URL contains `keyterm=Lenin` (or similar) after joining a Russia/Soviet topic session.

### 2026-02-27 (STT vocabulary — explicit keywords.txt structure)
- **Context:** Previous regex approach was fragile and non-deterministic. User wanted a predictable, authoritative vocabulary source.
- **Decision:** Replaced regex heuristic with an explicit file-and-DB pipeline:
  1. `content/{courseId}/{topicId}/keywords.txt` — one term per line, `#` lines ignored. This is where content authors add names and specialist terms.
  2. `ingest.py` reads `keywords.txt` per topic dir (skipped from chunk ingestion) and upserts the list into `topics.stt_keywords jsonb`.
  3. `get_topic_vocabulary` in `db.py` now just queries `topics.stt_keywords` — no regex, no chunk scanning.
  4. `init.sql` adds the column with `ALTER TABLE IF EXISTS … ADD COLUMN IF NOT EXISTS` (safe for re-runs).
  5. `make db-migrate` applies the ALTER TABLE to a running Postgres instance.
- **Files touched:** `content/1/1/keywords.txt` (new), `content/1/2/keywords.txt` (new), `infra/db/init.sql`, `apps/web/src/db/schema.ts`, `apps/agent/scripts/ingest.py`, `apps/agent/app/db.py`, `Makefile`.
- **Follow-up:** Run `make db-migrate` then `make ingest` on existing environments. New environments get the column from `init.sql` automatically.

### 2026-02-27 (account system phase 1 — auth + student ownership)
- **Context:** Started implementation of the account system with two account types (student and parent/guardian), prioritising student-scoped access to sessions and onboarding.
- **Discovery:** Existing app was fully anonymous; all sessions/transcripts were globally visible and session create/start/end routes lacked ownership checks.
- **Decision:** Added Supabase Cloud auth integration in `apps/web` (middleware + login/signup/callback), introduced account schema (`profiles`, `students`, `parents`, `parent_student_links`), and added `sessions.student_id` ownership. All session APIs now require an authenticated student and scope by `student_id`. Student onboarding captures UK student data (`date_of_birth`, `school_year`), while parent accounts are supported for sign-in with a placeholder home view.
- **Files touched:** `apps/web/package.json`, `apps/web/src/middleware.ts`, `apps/web/src/lib/supabase/{client.ts,server.ts}`, `apps/web/src/lib/{auth.ts,student.ts}`, `apps/web/src/components/{AuthForm.tsx,SignOutButton.tsx}`, `apps/web/src/app/{layout.tsx,page.tsx,login/page.tsx,signup/page.tsx,onboarding/page.tsx,auth/callback/route.ts}`, `apps/web/src/app/api/session/{create,end,start-agent}/route.ts`, `apps/web/src/app/api/sessions/{route.ts,[id]/route.ts}`, `apps/web/src/app/sessions/{page.tsx,[id]/page.tsx}`, `apps/web/src/db/schema.ts`, `.env.example`, `README.md`.
- **Follow-up:** Apply DB migration (`drizzle-kit push`) before running, then implement phase 2+ entities: exam board/subject enrolments, per-subject tutor configs, parent-student linking UX, Director of Studies dashboard/chat, and scheduling tables/API/UI.

### 2026-02-27 (account system phase 2 continuation — parent linking + enum hardening)
- **Context:** Continued Phase 2 to close remaining account/profile gaps after initial auth rollout.
- **Discovery:** Parent accounts could be created but had no way to link to students during onboarding; account type was free-text in DB schema.
- **Decision:** Added DB enum for `profiles.account_type` and implemented parent-to-student linking by student email in onboarding with relationship metadata and duplicate-safe inserts. Also exposed parent link management API (`GET/POST /api/parent/links`) for immediate integration with parent dashboard work.
- **Files touched:** `apps/web/src/db/schema.ts`, `apps/web/src/app/onboarding/page.tsx`, `apps/web/src/app/api/parent/links/route.ts`, `README.md`.
- **Follow-up:** Run `npm run db:push` in `apps/web` to apply enum/table/column updates, then build parent dashboard pages against `/api/parent/links`; move from email-linking to invite-code linking in a later phase for stronger consent flow.

### 2026-02-27 (phases 3-7 implementation sweep)
- **Context:** User requested continuing from Phase 2 through Phase 7 in one pass.
- **Discovery:** Existing stack needed broad schema and API expansion to support enrolments, tutor persona/voice, DoS planning chat, calendar scheduling, and parent restrictions; agent needed new payload/context fields.
- **Decision:** Implemented a full MVP sweep across web + agent with explicit UK-oriented subject/board modeling and parent/student multi-account workflows:
  - Schema added: `exam_boards`, `subjects`, `board_subjects`, `student_enrolments`, `tutor_configs`, `progress_snapshots`, `repeat_flags`, `dos_chat_threads`, `dos_chat_messages`, `scheduled_tutorials`, `restrictions`, `student_invite_codes`; `courses` now references `subject_id` and `exam_board_id`; `sessions` now includes `enrolment_id`.
  - Student flow: onboarding now routes to `/onboarding/subjects`; home filters courses/topics to enrolled subjects; session creation enforces enrolment membership.
  - Tutor config: per-enrolment tutor name/personality/voice API + settings page (`/settings/tutors`), and start-agent route now forwards this context.
  - Progress/DoS: end-session now generates progress snapshots + repeat flags; dashboard and `/api/progress/overview` added; DoS chat API + UI (`/api/dos-chat`, `DoSChat`) added.
  - Calendar: scheduling APIs (`/api/calendar`, `/api/calendar/:id`) and `/calendar` page added; recurrence + sync placeholders in `lib/calendar-sync.ts`.
  - Parent tools: parent dashboard + settings pages, restrictions API (`/api/parent/restrictions`), mandatory revision injection into repeat flags.
  - Parent linking: both email-based and invite-code linking supported (`/api/student/invite-code`, `/api/parent/link-code`).
  - Agent wiring: `/join` payload extended (student/enrolment/tutor/recommendation fields), agent runtime prompt now includes tutor personality + DoS focus context via new DB helper.
- **Files touched:** Major updates across `apps/web/src/db/schema.ts`, `apps/web/src/db/{seed.ts,seed-reference.ts}`, multiple `apps/web/src/app/api/**` routes (`session/*`, `student/*`, `reference/*`, `tutor-config`, `progress/overview`, `dos-chat`, `calendar/*`, `parent/*`), UI pages (`dashboard`, `calendar`, `onboarding/subjects`, `settings/tutors`, `parent/dashboard`, `parent/settings`), components (`EnrolmentWizard`, `TutorConfigManager`, `DoSChat`, `CalendarPlanner`, `ParentRestrictionsManager`, `StudentInviteCode`), and agent files (`apps/agent/app/{main.py,agent_worker.py,db.py,prompts.py}`), plus `README.md`.
- **Follow-up:** Run DB push + seed commands before runtime (`npm run db:push`, `npm run db:seed:reference`, `npm run db:seed` in `apps/web`), then rebuild/restart containers for agent/web compatibility and validate end-to-end auth/session calendar flows in browser.
