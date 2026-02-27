from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

from livekit import rtc
from livekit.agents.llm import ChatContext, ChatMessage
from livekit.agents.pipeline import VoicePipelineAgent
from livekit.plugins import deepgram, openai as lk_openai, silero

from .db import get_course_topic_names, upsert_transcript
from .prompts import build_system_prompt
from .rag import retrieve_chunks

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "ws://livekit:7880")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_agent_session(
    room_name: str,
    token: str,
    session_id: str,
    course_id: int,
    topic_id: int,
) -> None:
    room = rtc.Room()
    transcript_items: list[dict[str, Any]] = []

    await room.connect(LIVEKIT_URL, token)

    participant: rtc.RemoteParticipant | None = None
    while participant is None:
        remotes = list(room.remote_participants.values())
        if remotes:
            participant = remotes[0]
            break
        await asyncio.sleep(0.2)

    course_name, topic_name = get_course_topic_names(course_id, topic_id)

    def format_references(chunks: list[dict[str, Any]]) -> str:
        if not chunks:
            return "No strong matches found. Ask clarifying questions."
        return "\n\n".join(
            [f"[{c['doc_title']}:{c['chunk_id']}]\n{c['content']}" for c in chunks]
        )

    async def before_llm_cb(agent: VoicePipelineAgent, chat_ctx: ChatContext) -> ChatContext:
        latest_user = ""
        for message in reversed(chat_ctx.messages):
            if message.role == "user":
                latest_user = message.content if isinstance(message.content, str) else str(message.content)
                break

        chunks = retrieve_chunks(latest_user, course_id, topic_id)
        references = format_references(chunks)
        system_prompt = build_system_prompt(course_name, topic_name, references)

        chat_ctx.messages = [m for m in chat_ctx.messages if m.role != "system"]
        chat_ctx.messages.insert(0, ChatMessage(role="system", content=system_prompt))
        return chat_ctx

    agent = VoicePipelineAgent(
        vad=silero.VAD.load(),
        stt=deepgram.STT(),
        llm=lk_openai.LLM(model="gpt-4o-mini"),
        tts=deepgram.TTS(),
        before_llm_cb=before_llm_cb,
    )

    @agent.on("user_speech_committed")
    def _on_user_speech(msg: ChatMessage) -> None:
        text = msg.content if isinstance(msg.content, str) else str(msg.content)
        item = {"speaker": "Student", "text": text, "timestamp": _iso_now()}
        transcript_items.append(item)
        payload = json.dumps(item).encode("utf-8")
        asyncio.create_task(room.local_participant.publish_data(payload, reliable=True, kind=rtc.DataPacketKind.RELIABLE))

    @agent.on("agent_speech_committed")
    def _on_agent_speech(msg: ChatMessage) -> None:
        text = msg.content if isinstance(msg.content, str) else str(msg.content)
        item = {"speaker": "TutorBot", "text": text, "timestamp": _iso_now()}
        transcript_items.append(item)
        payload = json.dumps(item).encode("utf-8")
        asyncio.create_task(room.local_participant.publish_data(payload, reliable=True, kind=rtc.DataPacketKind.RELIABLE))

    agent.start(room, participant)
    await agent.say(
        f"Hi! I'm your Director of Studies tutor for {course_name}, topic {topic_name}. What would you like to focus on first?",
        allow_interruptions=True,
    )

    try:
        while room.connection_state == rtc.ConnectionState.CONN_CONNECTED:
            await asyncio.sleep(0.5)
    finally:
        upsert_transcript(session_id, transcript_items)
        await room.disconnect()
