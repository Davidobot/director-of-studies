from __future__ import annotations

import asyncio
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from livekit.api import AccessToken, VideoGrants
from pydantic import BaseModel

from .agent_worker import run_agent_session

app = FastAPI(title="Director of Studies Agent")

LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")


class JoinRequest(BaseModel):
    roomName: str
    sessionId: str
    courseId: int
    topicId: int
    agentOpenAIModel: str | None = None
    deepgramSttModel: str | None = None
    deepgramTtsModel: str | None = None
    silenceNudgeAfterS: float | None = None


def build_agent_token(room_name: str, identity: str = "TutorBot") -> str:
    token = AccessToken(api_key=LIVEKIT_API_KEY, api_secret=LIVEKIT_API_SECRET)
    token.identity = identity
    token.name = identity
    token.with_grants(
        VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
            can_update_own_metadata=True,
        )
    )
    return token.to_jwt()


def _validate_agent_runtime_config() -> list[str]:
    required = ["OPENAI_API_KEY", "DEEPGRAM_API_KEY"]
    return [name for name in required if not os.environ.get(name)]


def _on_agent_task_done(task: asyncio.Task[None]) -> None:
    try:
        task.result()
    except Exception:
        import traceback

        traceback.print_exc()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/join")
async def join_room(payload: JoinRequest) -> dict[str, Any]:
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit credentials missing")

    missing_config = _validate_agent_runtime_config()
    if missing_config:
        names = ", ".join(missing_config)
        raise HTTPException(status_code=500, detail=f"Missing required agent env vars: {names}")

    token = build_agent_token(payload.roomName)

    task = asyncio.create_task(
        run_agent_session(
            room_name=payload.roomName,
            token=token,
            session_id=payload.sessionId,
            course_id=payload.courseId,
            topic_id=payload.topicId,
            agent_openai_model=payload.agentOpenAIModel,
            deepgram_stt_model=payload.deepgramSttModel,
            deepgram_tts_model=payload.deepgramTtsModel,
            silence_nudge_after_s=payload.silenceNudgeAfterS,
        )
    )
    task.add_done_callback(_on_agent_task_done)

    return {"ok": True}
