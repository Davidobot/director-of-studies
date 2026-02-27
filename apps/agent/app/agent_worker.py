from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

import aiohttp
from livekit import rtc
from livekit.agents import llm
from livekit.agents.voice import Agent, AgentSession, room_io
from livekit.plugins import deepgram, openai as lk_openai, silero

from .db import get_course_topic_names, upsert_transcript
from .prompts import build_system_prompt
from .rag import retrieve_chunks

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "ws://livekit:7880")
AGENT_OPENAI_MODEL = os.environ.get("AGENT_OPENAI_MODEL", "gpt-4o")
DEEPGRAM_STT_MODEL = os.environ.get("DEEPGRAM_STT_MODEL", "flux")
DEEPGRAM_TTS_MODEL = os.environ.get("DEEPGRAM_TTS_MODEL", "aura-2-draco-en")
SILENCE_NUDGE_AFTER_S = float(os.environ.get("SILENCE_NUDGE_AFTER_S", "3.0"))


def _resolve_stt_model(model: str) -> str:
    normalized = model.strip().lower()
    if normalized == "flux":
        return "flux-general-en"
    return model


def _resolve_tts_model(model: str) -> str:
    normalized = model.strip().lower()
    if normalized in {"aura-2", "aura-2-draco", "draco"}:
        return "aura-2-draco-en"
    return model.strip()


def _build_stt(http_session: aiohttp.ClientSession, model: str) -> Any:
    resolved = _resolve_stt_model(model)
    normalized = resolved.strip().lower()

    if normalized.startswith("flux"):
        stt_v2 = getattr(deepgram, "STTv2", None)
        if stt_v2 is not None:
            try:
                return stt_v2(model=resolved, http_session=http_session)
            except TypeError:
                return stt_v2(model=resolved)

        return None

    return deepgram.STT(model=resolved, http_session=http_session)


class TutorAgent(Agent):
    def __init__(self, *, course_id: int, topic_id: int, course_name: str, topic_name: str) -> None:
        super().__init__(
            instructions=(
                f"You are a Director of Studies tutor for {course_name} and topic {topic_name}. "
                "Use concise, clear explanations and ask follow-up questions where useful."
            )
        )
        self._course_id = course_id
        self._topic_id = topic_id
        self._course_name = course_name
        self._topic_name = topic_name

    @staticmethod
    def _format_references(chunks: list[dict[str, Any]]) -> str:
        if not chunks:
            return "No strong matches found. Ask clarifying questions."
        return "\n\n".join([f"[{c['doc_title']}:{c['chunk_id']}]\n{c['content']}" for c in chunks])

    async def on_user_turn_completed(self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage) -> None:
        latest_user = new_message.text_content or ""
        chunks = retrieve_chunks(latest_user, self._course_id, self._topic_id)
        references = self._format_references(chunks)
        system_prompt = build_system_prompt(self._course_name, self._topic_name, references)

        filtered_items = [
            item
            for item in turn_ctx.items
            if not (isinstance(item, llm.ChatMessage) and item.role in ("system", "developer"))
        ]
        turn_ctx.items = [llm.ChatMessage(role="system", content=[system_prompt])] + filtered_items


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_agent_session(
    room_name: str,
    token: str,
    session_id: str,
    course_id: int,
    topic_id: int,
    *,
    agent_openai_model: str | None = None,
    deepgram_stt_model: str | None = None,
    deepgram_tts_model: str | None = None,
    silence_nudge_after_s: float | None = None,
) -> None:
    room = rtc.Room()
    transcript_items: list[dict[str, Any]] = []
    http_session = aiohttp.ClientSession()
    persist_lock = asyncio.Lock()
    session: AgentSession | None = None
    _watchdog_task: asyncio.Task[None] | None = None

    try:
        loop = asyncio.get_running_loop()
        # Resolve per-call model overrides, falling back to module-level env defaults.
        _openai_model = agent_openai_model or AGENT_OPENAI_MODEL
        _stt_model = deepgram_stt_model or DEEPGRAM_STT_MODEL
        _tts_model = deepgram_tts_model or DEEPGRAM_TTS_MODEL
        _silence_nudge = silence_nudge_after_s if silence_nudge_after_s is not None else SILENCE_NUDGE_AFTER_S
        # Tracks when agent last finished speaking and when student last replied,
        # used by the silence watchdog to prompt unresponsive students.
        _silence_state: dict[str, float | None] = {"last_agent": None, "last_student": 0.0}

        await room.connect(LIVEKIT_URL, token)

        participant: rtc.RemoteParticipant | None = None
        while participant is None:
            remotes = list(room.remote_participants.values())
            if remotes:
                participant = remotes[0]
                break
            await asyncio.sleep(0.2)
        student_identity = participant.identity

        async def _persist_transcript_snapshot() -> None:
            try:
                async with persist_lock:
                    snapshot = list(transcript_items)
                    await asyncio.to_thread(upsert_transcript, session_id, snapshot)
            except Exception:
                return

        course_name, topic_name = get_course_topic_names(course_id, topic_id)

        tutor_agent = TutorAgent(
            course_id=course_id,
            topic_id=topic_id,
            course_name=course_name,
            topic_name=topic_name,
        )

        session = AgentSession(
            stt=_build_stt(http_session, _stt_model),
            vad=silero.VAD.load(),
            llm=lk_openai.LLM(model=_openai_model),
            tts=deepgram.TTS(model=_resolve_tts_model(_tts_model), http_session=http_session),
            turn_detection="stt",
        )

        close_fut: asyncio.Future[None] = asyncio.get_running_loop().create_future()

        async def _publish_transcript_item(item: dict[str, Any]) -> None:
            try:
                payload = json.dumps(item).encode("utf-8")
                await room.local_participant.publish_data(payload, reliable=True)
            except Exception:
                return

        @session.on("conversation_item_added")
        def _on_conversation_item(event: Any) -> None:
            message = event.item
            if not isinstance(message, llm.ChatMessage):
                return

            text = message.text_content
            if not text:
                return

            speaker: str | None = None
            if message.role == "user":
                speaker = "Student"
                _silence_state["last_student"] = loop.time()
            elif message.role == "assistant":
                speaker = "TutorBot"
                _silence_state["last_agent"] = loop.time()

            if speaker is None:
                return

            timestamp = datetime.fromtimestamp(message.created_at, tz=timezone.utc).isoformat()
            item = {"speaker": speaker, "text": text, "timestamp": timestamp}
            transcript_items.append(item)
            asyncio.create_task(_publish_transcript_item(item))
            asyncio.create_task(_persist_transcript_snapshot())

        async def _silence_watchdog() -> None:
            """Nudge the student if they haven't replied within _silence_nudge seconds."""
            while True:
                await asyncio.sleep(0.5)
                last_agent = _silence_state["last_agent"]
                if last_agent is None:
                    continue
                elapsed = loop.time() - last_agent
                last_student = _silence_state["last_student"] or 0.0
                if elapsed >= _silence_nudge and last_agent > last_student:
                    _silence_state["last_agent"] = None  # prevent repeated nudges
                    try:
                        await session.say(  # type: ignore[union-attr]
                            "Are you still there? Feel free to answer in your own words, or ask me to rephrase.",
                            allow_interruptions=True,
                        )
                    except Exception:
                        pass

        @session.on("close")
        def _on_session_close(_: Any) -> None:
            if not close_fut.done():
                close_fut.set_result(None)

        await session.start(
            tutor_agent,
            room=room,
            room_options=room_io.RoomOptions(
                participant_identity=student_identity,
                close_on_disconnect=True,
            ),
        )

        _watchdog_task = asyncio.create_task(_silence_watchdog())

        await session.say(
            f"Hi! I'm your Director of Studies tutor for {course_name}, topic {topic_name}. What would you like to focus on first?",
            allow_interruptions=True,
        )

        await close_fut
    finally:
        if _watchdog_task is not None:
            _watchdog_task.cancel()
        await asyncio.to_thread(upsert_transcript, session_id, list(transcript_items))
        if session is not None:
            try:
                await session.aclose()
            except Exception:
                pass
        if room.connection_state == rtc.ConnectionState.CONN_CONNECTED:
            await room.disconnect()
        await http_session.close()
