from __future__ import annotations

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
        )
    )
    return token.to_jwt()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/join")
async def join_room(payload: JoinRequest) -> dict[str, Any]:
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit credentials missing")

    token = build_agent_token(payload.roomName)

    import asyncio

    asyncio.create_task(
        run_agent_session(
            room_name=payload.roomName,
            token=token,
            session_id=payload.sessionId,
            course_id=payload.courseId,
            topic_id=payload.topicId,
        )
    )

    return {"ok": True}
