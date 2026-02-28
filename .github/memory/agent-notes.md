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

### 2026-02-27 (UI fixes — nav, home page, dropdowns, tutors, calendar)
- **Context:** UX review identified 5 issues: duplicate nav links, no user name in nav, empty course/topic dropdowns, unexpected "Oxbridge tutor" default in tutor settings, no real calendar view.
- **Discovery:**
  - Nav had both "Home" (`/`) and "Profile" (`/onboarding`) links plus the brand title — redundant. Supabase `user.email` is available as fallback when `displayName` is unset.
  - Duplicate "Dashboard / Calendar / Tutor settings" quick-link buttons on home page duplicated the nav.
  - Empty dropdowns occur when the student is enrolled in a subject (e.g. "Oxbridge Admissions") that has no matching entry in the `courses` table. The page doesn't redirect in this case (it redirects only when `enrolmentRows.length === 0`).
  - The "Oxbridge tutor" the user saw is the `tutorConfigs.tutorName` field defaulting to `"TutorBot"` for the "Oxbridge Admissions" enrolment, plus the fact that there was no `make seed` command to explain how to populate courses.
  - `TutorConfigManager` pre-filled name/personality/speed with hard-coded defaults giving the impression a tutor was already configured.
  - `CalendarPlanner` was a plain list — no monthly grid.
- **Decisions:**
  - `layout.tsx`: brand title becomes a `<Link href="/">` (clicking logo = home); "Home" link removed; "Profile" text replaced with user's `displayName` (or email as fallback) linking to `/onboarding`.
  - `page.tsx`: removed duplicate quick-button row; added meaningful "No courses available" empty state with `make seed` instructions when `filteredCourses.length === 0`; added server-side courseId→tutorName lookup passed down to `CourseTopicSelector`.
  - `CourseTopicSelector.tsx`: accept `tutorNameByCourseId` prop and display which tutor will be used for the selected course with an "Edit tutor settings →" link.
  - `TutorConfigManager.tsx`: replaced pre-filled `?? "TutorBot"` / `?? "Be warm…"` / `?? "1.0"` with empty strings and placeholder attributes so new configs start blank.
  - `CalendarPlanner.tsx`: full monthly grid calendar — Mon-first 7-column layout, prev/next month navigation, coloured dots per status, day-click opens detail panel showing tutorials and direct status actions, schedule form pre-fills date when a day is clicked.
  - `Makefile`: added `make seed` target that runs `npm run db:seed:reference` then `npm run db:seed` in `apps/web` against `NATIVE_DATABASE_URL`.
- **Files touched:** `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/components/CourseTopicSelector.tsx`, `apps/web/src/components/TutorConfigManager.tsx`, `apps/web/src/components/CalendarPlanner.tsx`, `Makefile`.
- **Follow-up:** Run `make seed` on any environment with an empty `courses` table. Verify nav shows user's name in the header. Verify calendar grid renders correctly. If multiple tutor personas per subject are needed in future, the `tutorConfigs` schema needs a named-preset model.

### 2026-02-27 (nav account menu + profile settings page)
- **Context:** User requested the student's name in the nav bar open a dropdown with settings links (tutor settings, personal settings, enrolment settings); and move the parent-link invite code out of the dashboard into a dedicated personal settings page.
- **Decision:**
  - Created `AccountMenu` client component: shows a chevron-tagged name button; toggles a dropdown with `Personal settings → /settings/profile`, `Enrolment settings → /onboarding/subjects`, `Tutor settings → /settings/tutors` (student only), and `Log out`. Closes on outside click via `useEffect` mousedown listener. Receives `displayName` and `accountType` as props from server layout.
  - Created `/settings/profile` page: display name (editable), email (read-only from Supabase), DOB + school year (student only), enrolment shortcut link, and `StudentInviteCode` component. Has a server action to save changes and redirects with `?saved=1`.
  - `layout.tsx`: removed `SignOutButton` import, replaced the plain Link + SignOutButton with `<AccountMenu>`. Removed the standalone "Tutors" nav link (reachable from dropdown).
  - `dashboard/page.tsx`: removed `StudentInviteCode` import and `<StudentInviteCode />` usage; removed the "Tutor settings" quick-link button (accessible from dropdown).
- **Files touched:** `apps/web/src/components/AccountMenu.tsx` (new), `apps/web/src/app/settings/profile/page.tsx` (new), `apps/web/src/app/layout.tsx`, `apps/web/src/app/dashboard/page.tsx`.
- **Follow-up:** None — all four files pass type-check cleanly. If parent personal settings are needed (display name, linked students), extend the `AccountMenu` PARENT_ITEMS list and add a parent-specific section to `/settings/profile`.

### 2026-02-27 (tutor personas refactor — completed)
- **Context:** User requested tutors be reusable across subjects. Session was interrupted mid-refactor; this entry records the completed state.
- **Schema changes:**
  - Old `tutorConfigs` had `tutorName/personalityPrompt/ttsVoiceModel/ttsSpeed` inline. These columns are removed.
  - New `tutorPersonas` table: `(id, studentId, name, personalityPrompt, ttsVoiceModel, ttsSpeed, createdAt, updatedAt)` with unique index on `(studentId, name)`.
  - New slim `tutorConfigs`: `(id, studentId, enrolmentId, personaId FK→tutorPersonas)` — assignment-only.
  - DB migration required: `cd apps/web && npm run db:push`
- **API routes:**
  - `GET/POST /api/tutor-personas` — list and create personas
  - `PUT/DELETE /api/tutor-personas/[id]` — update and delete personas (ownership validated)
  - `GET /api/tutor-config` — returns enrolments with joined personaId/personaName
  - `PUT /api/tutor-config` — assigns persona (nullable) to an enrolment
- **Component:** `TutorConfigManager.tsx` fully rewritten. Two sections:
  1. "Your tutors" — persona cards with inline edit/delete + "+ New tutor" creation form
  2. "Subject assignments" — per-enrolment `<select>` dropdown of all personas + "— No tutor —"
  - Uses `useReducer` for state; fetches from both `/api/tutor-personas` and `/api/tutor-config` on mount.
- **Other files updated:** `apps/web/src/app/page.tsx` (tutorNameByCourseId now joins through tutorPersonas.name), `apps/web/src/app/api/session/start-agent/route.ts` (fetches tutorPersonas fields via leftJoin).
- **Watch out:** Both files had duplicate old code appended (the `replace_string_in_file` tool prepended the new content without removing what it replaced). Fixed by truncating with `head -N`. Also `tutor-config/route.ts` needed a closing `}` added after the truncation.
- **Files touched:** `apps/web/src/db/schema.ts`, `apps/web/src/app/api/tutor-personas/route.ts` (new), `apps/web/src/app/api/tutor-personas/[id]/route.ts` (new), `apps/web/src/app/api/tutor-config/route.ts`, `apps/web/src/components/TutorConfigManager.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/api/session/start-agent/route.ts`.
- **Follow-up:** Run `cd apps/web && npm run db:push` to apply schema to Postgres. The `tutor_personas` table will be created and `tutor_configs` will be altered (removing the old text columns, adding `persona_id`).

### 2026-02-27 (python API consolidation phase 1 — session end)
- **Context:** User asked to start implementation of moving API work from Next.js routes toward the Python/FastAPI service to reduce perceived slowness and simplify runtime architecture.
- **Discovery:** `POST /api/session/end` in Next.js was a high-latency path with transcript polling, two sequential OpenAI calls, and per-item repeat-flag inserts.
- **Decision:** Added a new FastAPI endpoint `POST /api/session/end` in `apps/agent/app/main.py` and moved summarization/progress generation there. Implemented parallel OpenAI work via `asyncio.gather` (`asyncio.to_thread` wrappers around sync SDK calls), and switched repeat flag writes to batched `executemany` insert. Updated Next.js `apps/web/src/app/api/session/end/route.ts` to become an authenticated proxy to the agent endpoint while preserving student ownership checks. Added optional internal shared-secret header validation via `AGENT_INTERNAL_API_KEY` on both sides.
- **Files touched:** `apps/agent/app/main.py`, `apps/web/src/app/api/session/end/route.ts`, `.env.example`, `.github/memory/agent-notes.md`.
- **Follow-up:** Continue phase 2 by migrating `session/start-agent` and `session/create` into FastAPI (with equivalent restrictions/enrolment checks), then convert Next.js routes into proxies and add integration tests for parity.

### 2026-02-27 (python API consolidation phase 2 — full session domain)
- **Context:** Continued implementation after phase 1 to complete session-domain migration from Next.js API routes to Python/FastAPI.
- **Discovery:** Session domain includes five API routes (`/api/session/create`, `/api/session/start-agent`, `/api/session/end`, `/api/sessions`, `/api/sessions/:id`) and powers most call lifecycle UX paths.
- **Decision:** Added FastAPI internal endpoints for all remaining session routes and converted Next.js handlers to thin student-authenticated proxies. Python `create` now enforces existing restrictions/enrolment rules, ensures LiveKit room existence, generates participant token, and inserts session row. Python `start-agent` now loads tutor/repeat/focus context from DB, starts `run_agent_session` task directly (no HTTP hop), then updates session status to `live`. Added Python list/detail endpoints for session history and detail retrieval. Standardized internal endpoint protection behind optional `AGENT_INTERNAL_API_KEY` header validation helper.
- **Files touched:** `apps/agent/app/main.py`, `apps/web/src/app/api/session/create/route.ts`, `apps/web/src/app/api/session/start-agent/route.ts`, `apps/web/src/app/api/sessions/route.ts`, `apps/web/src/app/api/sessions/[id]/route.ts`, `.github/memory/agent-notes.md`.
- **Follow-up:** Next migration targets are non-session domains (`progress`, `dos-chat`, `calendar`, `tutor-*`, `student/*`, `parent/*`, `reference/*`, `auth/guest-login`) plus introducing explicit FastAPI auth dependencies and async DB pooling to remove remaining per-request DB connection overhead.

### 2026-02-27 (python API consolidation phase 3 — remaining domains + python db bootstrap)
- **Context:** User requested continuing migration for all remaining API domains and wanted DB creation/seed owned by Python instead of TS scripts.
- **Discovery:** All non-session routes still had business logic in `apps/web/src/app/api/**`; schema/data bootstrap depended on TS (`drizzle` schema + seed scripts) and Makefile `seed` used npm scripts.
- **Decision:** Implemented remaining FastAPI internal endpoints in `apps/agent/app/main.py` for: calendar (`GET/POST/PUT/DELETE`), DoS chat (`GET/POST`), progress overview (`GET`), reference board-subjects (`GET`), student enrolments/invite (`GET/POST/DELETE + GET invite-code`), tutor personas/config (`GET/POST/PUT/DELETE + GET/PUT`), parent links/link-code/restrictions (`GET/POST`, `POST`, `GET/PUT`), and guest login (`POST`). Replaced all corresponding web API routes with thin auth-preserving forwarders to Python and removed remaining TS DB/OpenAI/Supabase business logic from API route files. Added Python DB ownership scripts: `apps/agent/scripts/bootstrap_db.py` (schema/extensions/tables creation) and `apps/agent/scripts/seed_db.py` (reference + course/topic seeds). Updated `Makefile` so `db-migrate` and `seed` now run Python scripts.
- **Files touched:** `apps/agent/app/main.py`, `apps/agent/scripts/bootstrap_db.py`, `apps/agent/scripts/seed_db.py`, all remaining `apps/web/src/app/api/**/route.ts` files (calendar, dos-chat, parent, progress, reference, student, tutor, auth/guest-login, plus existing session proxies), `Makefile`, `.github/memory/agent-notes.md`.
- **Follow-up:** If desired, next step is removing the web route wrappers entirely and having UI call Python API directly with bearer token auth; this requires adding FastAPI JWT auth dependencies + CORS and updating client/server fetch patterns.

### 2026-02-27 (phase 4 — direct frontend to python api + bearer auth)
- **Context:** User approved the next step to stop relying on TS API wrappers and have client-facing flows call Python API directly.
- **Discovery:** Client components used relative `/api/*` fetches; without wrappers they need browser-side auth headers and explicit API base URL config. FastAPI also needed CORS and token validation.
- **Decision:** Added browser API helper `apps/web/src/lib/api-client.ts` that pulls Supabase access token from session and sends `Authorization: Bearer ...`, plus optional automatic `studentId`/`parentId` injection. Updated all client-side API consumers (session start/end/create, dos-chat, enrolments, calendar, parent restrictions, tutor config/personas, student invite, guest login) to use direct calls to `NEXT_PUBLIC_API_URL` (Python API). Added FastAPI CORS middleware (`WEB_ORIGIN`) and Supabase bearer token validation in `apps/agent/app/main.py` (`_get_user_id_from_bearer`, `_validate_internal_api_key` supporting internal-key OR bearer mode with expected user-id matching). Kept guest-login unauthenticated for demo bootstrap. Added env/make wiring for direct browser API URL (`NEXT_PUBLIC_API_URL`) and CORS origin (`WEB_ORIGIN`).
- **Files touched:** `apps/agent/app/main.py`, `apps/web/src/lib/api-client.ts`, client components (`CourseTopicSelector`, `CallControls`, `DoSChat`, `EnrolmentWizard`, `CalendarPlanner`, `ParentRestrictionsManager`, `StudentInviteCode`, `TutorConfigManager`, `AuthForm`), `.env.example`, `Makefile`, `.github/memory/agent-notes.md`.
- **Follow-up:** TS route wrappers still exist in `apps/web/src/app/api/**` but are no longer required by client components; they can be removed in a cleanup pass once all server-side consumers are migrated.

### 2026-02-27 (phase 5 — db pool layer)
- **Context:** User asked to continue with the next step after direct frontend-to-python API migration.
- **Discovery:** Agent DB access still created new psycopg connections per call via `get_conn()`, adding handshake overhead under request load.
- **Decision:** Added pooled DB layer in `apps/agent/app/db.py` using `psycopg_pool` with both sync and async pools. `get_conn()` now leases connections from a shared sync pool; added `init_async_pool()`/`close_async_pool()` lifecycle APIs and wired them into FastAPI startup/shutdown hooks in `apps/agent/app/main.py`. Added pool-size env vars and dependency declarations.
- **Files touched:** `apps/agent/app/db.py`, `apps/agent/app/main.py`, `apps/agent/pyproject.toml`, `apps/agent/requirements.txt`, `.env.example`, `.github/memory/agent-notes.md`.
- **Follow-up:** Run `make venv` or reinstall agent deps to pull `psycopg-pool`. Optional next cleanup: remove no-longer-needed TS API wrapper routes in `apps/web/src/app/api/**`.

### 2026-02-27 (phase 6 — remove TS API wrapper layer)
- **Context:** User requested cleanup pass so there is no TypeScript API layer acting as an intermediary.
- **Discovery:** Client components were already switched to direct Python API calls; `apps/web/src/app/api/**` route handlers and `apps/web/src/lib/auth.ts` were now redundant.
- **Decision:** Deleted all Next route handlers under `apps/web/src/app/api/**` and removed `apps/web/src/lib/auth.ts`. Updated `apps/web/src/middleware.ts` public paths to drop `/api/auth/guest-login` since that route no longer exists. Verified no web code imports `@/lib/auth` and no `apps/web/src/app/api/**` files remain.
- **Files touched:** `apps/web/src/app/api/**` (all deleted route files), `apps/web/src/lib/auth.ts` (deleted), `apps/web/src/middleware.ts`, `.github/memory/agent-notes.md`.
- **Follow-up:** `AGENT_INTERNAL_API_KEY` is now optional; keep it for server-to-server hardening / non-browser callers, but it is no longer required for normal browser flows using bearer auth.

### 2026-02-27 (phase 6b — remove empty api directories)
- **Context:** User asked to remove empty TypeScript API folders after deleting wrapper route files.
- **Discovery:** Empty directory structure under `apps/web/src/app/api/**` still remained.
- **Decision:** Removed the full empty tree bottom-up using `find ... -depth -type d -empty -delete`, including `apps/web/src/app/api` root.
- **Files touched:** `.github/memory/agent-notes.md`.
- **Follow-up:** None.

### 2026-02-27 (phase 7 — env/docs cleanup for direct python api)
- **Context:** User requested final cleanup of stale wrapper-era env/docs after removing TS API layer.
- **Discovery:** `.env.example` and `README.md` still contained wording from mixed TS+Python API architecture and TS-driven DB seeding steps.
- **Decision:** Updated docs/config to reflect the current architecture: direct frontend-to-Python API (`NEXT_PUBLIC_API_URL`), Python API CORS origin (`WEB_ORIGIN`), Python DB pool env vars, and Python bootstrap/seed workflow via `make seed`. Clarified `AGENT_INTERNAL_API_KEY` is optional and intended for trusted non-browser callers.
- **Files touched:** `.env.example`, `README.md`, `.github/memory/agent-notes.md`.
- **Follow-up:** Optional: remove legacy drizzle seed scripts/docs entirely if they are no longer intended for any workflow.

### 2026-02-27 (phase 8 — final prune of legacy web seed artifacts)
- **Context:** User asked to complete the final prune after API consolidation to Python.
- **Discovery:** `apps/web` still had legacy TS seed scripts/files (`src/db/seed.ts`, `src/db/seed-reference.ts`), package scripts (`db:seed*`), and `entrypoint.sh` still invoked `npm run db:seed`.
- **Decision:** Removed both seed files and `db:seed` scripts from `apps/web/package.json`, dropped now-unused `tsx` dev dependency, and updated `apps/web/entrypoint.sh` to stop running web-side DB push/seed commands. Python remains the single DB bootstrap/seed path via `make seed` / `apps/agent/scripts/*.py`.
- **Files touched:** `apps/web/src/db/seed.ts` (deleted), `apps/web/src/db/seed-reference.ts` (deleted), `apps/web/package.json`, `apps/web/entrypoint.sh`, `.github/memory/agent-notes.md`.
- **Follow-up:** Refresh web lockfile (`apps/web/package-lock.json`) after dependency/script removal if this workspace uses committed lockfiles.

### 2026-02-27 (agent startup fix — missing psycopg_pool in local venv)
- **Context:** Runtime crashed on startup with `ModuleNotFoundError: No module named 'psycopg_pool'` from `apps/agent/app/db.py` import path.
- **Discovery:** Repo dependency files already include `psycopg-pool==3.2.4` (`apps/agent/requirements.txt`, `apps/agent/pyproject.toml`); local `apps/agent/.venv` was stale and had not installed that package yet.
- **Decision:** Installed/updated agent dependencies in-place using `apps/agent/.venv/bin/python -m pip install -r apps/agent/requirements.txt`; verified imports with `apps/agent/.venv/bin/python -c "from psycopg_pool import AsyncConnectionPool, ConnectionPool"` and `apps/agent/.venv/bin/python -c "import app.main"`.
- **Files touched:** `.github/memory/agent-notes.md`.
- **Follow-up:** If this reappears after dependency changes, rerun `make venv` (or re-run pip install in `apps/agent/.venv`) before starting `make agent`/`make local`.

### 2026-02-27 (Next 16 params Promise fix on call/session pages)
- **Context:** Runtime error in call route: `params` accessed synchronously (`params.sessionId`) under Next 16 dynamic APIs, plus call page requested `/api/sessions/undefined`.
- **Discovery:** `apps/web/src/app/call/[sessionId]/page.tsx` was typed with sync `params` and still used removed TS API route path (`/api/sessions/:id`). `apps/web/src/app/sessions/[id]/page.tsx` also used sync `params` in server component.
- **Decision:** Updated call page to unwrap params via `use(params)` (`params: Promise<{ sessionId: string }>`), switched session fetch to direct Python API using `apiFetch(..., { userScope: 'studentId' })`, and updated session detail page to `await params` (`params: Promise<{ id: string }>`).
- **Files touched:** `apps/web/src/app/call/[sessionId]/page.tsx`, `apps/web/src/app/sessions/[id]/page.tsx`, `.github/memory/agent-notes.md`.
- **Follow-up:** If similar errors appear on other dynamic routes, apply the same Promise-unwrapping pattern (`use(params)` in client components, `await params` in server components).

### 2026-02-28 (tutor interaction humanization pass)
- **Context:** User requested implementing the interaction-profile recommendations to improve pacing, pedagogy, trust, and conversational naturalness for Humanities tutoring.
- **Discovery:** Existing flow used a fixed scripted greeting and fixed 3-second silence nudge, while prompt rules were optimized for short technical turns rather than adaptive cognitive pacing.
- **Decision:** Upgraded prompt architecture in `build_system_prompt` with Two-Strike pedagogy, RAG honesty fallback, spoken prosody guidance, structured correction/praise/frustration behavior, and mandatory `<PACE:short|long>` metadata tags. In runtime, added `TutorAgent.llm_node` post-processing to strip pace tags before TTS/transcript, map pace tags to adaptive silence thresholds, randomize supportive nudges, and replace fixed first utterance with `session.generate_reply(...)` dynamic greeting.
- **Files touched:** `apps/agent/app/prompts.py`, `apps/agent/app/agent_worker.py`, `.env.example`, `infra/docker-compose.yml`, `.github/memory/agent-notes.md`.
- **Follow-up:** Validate in a live call that first-turn greeting is context-aware and that long analytical questions wait for `SILENCE_NUDGE_LONG_S` before nudging; tune short/long defaults after classroom trials.

### 2026-02-28 (remove SILENCE_NUDGE_AFTER_S fallback)
- **Context:** User requested removing the legacy `SILENCE_NUDGE_AFTER_S` fallback path entirely.
- **Discovery:** Legacy key existed in runtime env parsing, `.env.example`, docker compose agent env, web page defaults, and README env table.
- **Decision:** Removed `SILENCE_NUDGE_AFTER_S` as an env fallback and standardized defaults on `SILENCE_NUDGE_SHORT_S` + `SILENCE_NUDGE_LONG_S`. Kept per-session API payload override (`silenceNudgeAfterS`) unchanged.
- **Files touched:** `apps/agent/app/agent_worker.py`, `.env.example`, `infra/docker-compose.yml`, `apps/web/src/app/page.tsx`, `README.md`, `.github/memory/agent-notes.md`.
- **Follow-up:** Optional cleanup later: rename API field `silenceNudgeAfterS` to `silenceNudgeShortS` across web/agent payload contracts for naming consistency.

### 2026-02-28 (spec pipeline topic auto-discovery)
- **Context:** User requested removal of hardcoded topics from `specs.yaml` and automatic topic population during extraction/beautification.
- **Discovery:** Initial pipeline implementation required `spec.topics` for `extract`, `beautify`, `keywords`, and manifest-backed ingestion mapping. With empty topic lists, no downstream content/keyword generation occurred.
- **Decision:** Switched pipeline to spec-level raw extraction when topics are omitted (`{spec_key}.txt` in `content/.cache/raw/...`), then auto-discover topics in beautify via GPT JSON output and persist discovered topics in `content/.cache/discovered_topics.json`. Updated keywords generation and ingestion to discover topic folders from disk instead of manifest topic entries; ingestion now auto-creates missing `topics` DB rows from markdown title/slug.
- **Files touched:** `specs.yaml`, `apps/agent/scripts/pipeline/{manifest.py,extract_specs.py,prompts.py,beautify_specs.py,keywords_specs.py}`, `apps/agent/scripts/{seed_db.py,ingest.py}`, `README.md`.
- **Follow-up:** Fix invalid/404 spec URLs in `specs.yaml` (currently `aqa-alevel-history-7042`) so full end-to-end pipeline can run without per-spec download errors; optionally add a `discover-topics` stage to make topic generation independently runnable.

### 2026-02-28 (dedicated discover-topics stage + approval gate)
- **Context:** User requested a separate topic-discovery command so topic lists can be inspected/approved before content generation.
- **Discovery:** `beautify_specs.py` still performed discovery internally, so discovery and generation were coupled.
- **Decision:** Added standalone `scripts.pipeline.discover_topics` (Make target `discover-topics`) that writes editable approvals to `content/.cache/discovered_topics.yaml`; refactored `beautify_specs.py` to consume only approved topics (manifest topics or approved catalog topics) and skip otherwise with a clear message. Added shared catalog helpers in `discovered_topics.py` and updated pipeline docs/Makefile order (`download -> extract -> discover-topics -> beautify -> keywords`).
- **Files touched:** `apps/agent/scripts/pipeline/{discover_topics.py,discovered_topics.py,beautify_specs.py}`, `Makefile`, `README.md`, `.github/memory/agent-notes.md`.
- **Follow-up:** Runtime smoke test of `discover-topics` requires `OPENAI_API_KEY` in the executing shell; once set, run `make discover-topics` and review the generated approval file before running `make beautify`.

