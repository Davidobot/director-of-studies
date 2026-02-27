from __future__ import annotations

import asyncio
import datetime
import json
import os
import random
import uuid
from urllib import error as urllib_error
from urllib import request as urllib_request
from typing import Any

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from livekit import api as lk_api
from livekit.api import AccessToken, VideoGrants
from livekit.protocol import room as proto_room
from pydantic import BaseModel

from .agent_worker import run_agent_session
from .db import close_async_pool, get_conn, init_async_pool

app = FastAPI(title="Director of Studies Agent")

WEB_ORIGIN = os.environ.get("WEB_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[WEB_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup_db() -> None:
    await init_async_pool()


@app.on_event("shutdown")
async def _shutdown_db() -> None:
    await close_async_pool()

LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")
AGENT_INTERNAL_API_KEY = os.environ.get("AGENT_INTERNAL_API_KEY", "")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")


class JoinRequest(BaseModel):
    roomName: str
    sessionId: str
    courseId: int
    topicId: int
    studentId: str | None = None
    enrolmentId: int | None = None
    tutorName: str | None = None
    personalityPrompt: str | None = None
    tutorVoiceModel: str | None = None
    tutorTtsSpeed: str | None = None
    repeatFlags: list[dict[str, Any]] | None = None
    recommendedFocus: list[str] | None = None
    agentOpenAIModel: str | None = None
    deepgramSttModel: str | None = None
    deepgramTtsModel: str | None = None
    silenceNudgeAfterS: float | None = None


class SessionEndRequest(BaseModel):
    sessionId: str
    studentId: str


class SessionCreateRequest(BaseModel):
    courseId: int
    topicId: int
    studentId: str


class SessionCreateResponse(BaseModel):
    sessionId: str
    roomName: str
    participantToken: str


class SessionStartAgentRequest(BaseModel):
    sessionId: str
    studentId: str
    agentOpenAIModel: str | None = None
    deepgramSttModel: str | None = None
    deepgramTtsModel: str | None = None
    silenceNudgeAfterS: float | None = None


class SessionListItem(BaseModel):
    id: str
    status: str
    roomName: str
    createdAt: datetime.datetime | None = None
    startedAt: datetime.datetime | None = None
    endedAt: datetime.datetime | None = None
    courseName: str
    topicName: str


class SessionDetail(BaseModel):
    id: str
    roomName: str
    participantToken: str | None = None
    status: str
    startedAt: datetime.datetime | None = None
    endedAt: datetime.datetime | None = None
    createdAt: datetime.datetime | None = None
    courseId: int
    topicId: int
    courseName: str
    topicName: str
    transcriptJson: Any = None
    transcriptText: str | None = None
    summaryMd: str | None = None
    keyTakeawaysJson: Any = None
    citationsJson: Any = None


class CalendarCreateRequest(BaseModel):
    studentId: str
    createdBy: str
    enrolmentId: int | None = None
    topicId: int | None = None
    title: str
    scheduledAt: str
    durationMinutes: int = 30
    recurrenceRule: str | None = None


class CalendarUpdateRequest(BaseModel):
    studentId: str
    title: str | None = None
    scheduledAt: str | None = None
    durationMinutes: int | None = None
    status: str | None = None
    recurrenceRule: str | None = None


class StudentEnrolmentUpsertRequest(BaseModel):
    studentId: str
    boardSubjectId: int
    examYear: int
    currentYearOfStudy: int


class StudentEnrolmentDeleteRequest(BaseModel):
    studentId: str
    enrolmentId: int


class TutorPersonaCreateRequest(BaseModel):
    studentId: str
    name: str
    personalityPrompt: str | None = None
    ttsVoiceModel: str | None = None
    ttsSpeed: str | None = None


class TutorPersonaUpdateRequest(BaseModel):
    studentId: str
    name: str
    personalityPrompt: str | None = None
    ttsVoiceModel: str | None = None
    ttsSpeed: str | None = None


class TutorConfigUpdateRequest(BaseModel):
    studentId: str
    enrolmentId: int
    personaId: int | None = None


class ParentLinkCreateRequest(BaseModel):
    parentId: str
    studentEmail: str
    relationship: str | None = None


class ParentLinkCodeRequest(BaseModel):
    parentId: str
    code: str
    relationship: str | None = None


class ParentRestrictionsUpsertRequest(BaseModel):
    parentId: str
    studentId: str
    maxDailyMinutes: int | None = None
    maxWeeklyMinutes: int | None = None
    blockedTimes: list[dict[str, Any]] | None = None
    mandatoryRevision: list[dict[str, Any]] | None = None


class DosChatRequest(BaseModel):
    studentId: str
    message: str
    threadId: str | None = None


class SummaryPayload(BaseModel):
    summaryMd: str
    keyTakeaways: list[str]
    citations: list[str]


class RepeatPayload(BaseModel):
    concept: str
    reason: str
    priority: str


class ProgressPayload(BaseModel):
    confidenceScore: float
    strengths: list[str]
    improvements: list[str]
    focus: list[str]
    repeat: list[RepeatPayload]


SUMMARY_OPENAI_MODEL = os.environ.get("SUMMARY_OPENAI_MODEL", "gpt-4o")


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


def _get_user_id_from_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="Supabase auth config missing")

    token = authorization.replace("Bearer ", "", 1).strip()
    req = urllib_request.Request(
        f"{SUPABASE_URL}/auth/v1/user",
        method="GET",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
        },
    )

    try:
        with urllib_request.urlopen(req, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
            user_id = payload.get("id")
            if not user_id:
                raise HTTPException(status_code=401, detail="Unauthorized")
            return str(user_id)
    except urllib_error.HTTPError as exc:
        raise HTTPException(status_code=401, detail="Unauthorized") from exc


def _validate_internal_api_key(
    x_internal_api_key: str | None,
    authorization: str | None = None,
    expected_user_id: str | None = None,
) -> str | None:
    if AGENT_INTERNAL_API_KEY and x_internal_api_key == AGENT_INTERNAL_API_KEY:
        return expected_user_id

    user_id = _get_user_id_from_bearer(authorization)
    if expected_user_id and user_id != expected_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user_id


async def _ensure_room(room_name: str) -> None:
    async with lk_api.LiveKitAPI() as livekit_api:
        try:
            await livekit_api.room.create_room(proto_room.CreateRoomRequest(name=room_name))
            return
        except Exception:
            pass

        rooms = await livekit_api.room.list_rooms(proto_room.ListRoomsRequest(names=[room_name]))
        if not any(room.name == room_name for room in rooms.rooms):
            raise HTTPException(status_code=500, detail="Failed to ensure room")


def _build_participant_token(room_name: str, identity: str) -> str:
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


def _is_now_blocked(blocked_times: Any) -> bool:
    if not isinstance(blocked_times, list):
        return False

    now = datetime.datetime.now()
    day_of_week = (now.weekday() + 1) % 7
    current_time = now.strftime("%H:%M")

    for blocked in blocked_times:
        if not isinstance(blocked, dict):
            continue
        blocked_day = int(blocked.get("dayOfWeek") or -1)
        start_time = str(blocked.get("startTime") or "00:00")
        end_time = str(blocked.get("endTime") or "00:00")
        if blocked_day == day_of_week and start_time <= current_time <= end_time:
            return True
    return False


def _load_tutor_runtime_context(
    student_id: str,
    enrolment_id: int | None,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]], list[str]]:
    if not enrolment_id:
        return None, [], []

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT tp.name, tp.personality_prompt, tp.tts_voice_model, tp.tts_speed
            FROM tutor_configs tc
            LEFT JOIN tutor_personas tp ON tp.id = tc.persona_id
            WHERE tc.student_id = %s AND tc.enrolment_id = %s
            LIMIT 1
            """,
            (student_id, enrolment_id),
        )
        tutor_row = cur.fetchone()

        cur.execute(
            """
            SELECT concept, reason, priority
            FROM repeat_flags
            WHERE student_id = %s AND enrolment_id = %s AND status = 'active'
            """,
            (student_id, enrolment_id),
        )
        repeat_rows = cur.fetchall()

        cur.execute(
            """
            SELECT recommended_focus
            FROM progress_snapshots
            WHERE student_id = %s AND enrolment_id = %s
            ORDER BY generated_at DESC
            LIMIT 1
            """,
            (student_id, enrolment_id),
        )
        focus_row = cur.fetchone()

    tutor_config = None
    if tutor_row:
        tutor_config = {
            "tutorName": tutor_row[0],
            "personalityPrompt": tutor_row[1],
            "ttsVoiceModel": tutor_row[2],
            "ttsSpeed": tutor_row[3],
        }

    repeat_flags: list[dict[str, Any]] = [
        {
            "concept": str(row[0]),
            "reason": str(row[1]),
            "priority": str(row[2]),
        }
        for row in repeat_rows
        if row and row[0] and row[1] and row[2]
    ]

    recommended_focus: list[str] = []
    if focus_row and focus_row[0]:
        value = focus_row[0]
        if isinstance(value, list):
            recommended_focus = [str(v) for v in value if v]
        elif isinstance(value, str):
            recommended_focus = [str(v) for v in json.loads(value) if v]

    return tutor_config, repeat_flags, recommended_focus


async def _start_agent_join(payload: JoinRequest) -> None:
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
            student_id=payload.studentId,
            enrolment_id=payload.enrolmentId,
            tutor_name=payload.tutorName,
            personality_prompt=payload.personalityPrompt,
            tutor_voice_model=payload.tutorVoiceModel,
            tutor_tts_speed=payload.tutorTtsSpeed,
            repeat_flags=payload.repeatFlags,
            recommended_focus=payload.recommendedFocus,
            agent_openai_model=payload.agentOpenAIModel,
            deepgram_stt_model=payload.deepgramSttModel,
            deepgram_tts_model=payload.deepgramTtsModel,
            silence_nudge_after_s=payload.silenceNudgeAfterS,
        )
    )
    task.add_done_callback(_on_agent_task_done)


def _create_session_sync(course_id: int, topic_id: int, student_id: str) -> SessionCreateResponse:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT subject_id, exam_board_id FROM courses WHERE id = %s", (course_id,))
        course_row = cur.fetchone()

        cur.execute("SELECT id FROM topics WHERE id = %s AND course_id = %s", (topic_id, course_id))
        topic_row = cur.fetchone()

        if not course_row or not topic_row:
            raise HTTPException(status_code=400, detail="Invalid course/topic")

        cur.execute(
            """
            SELECT max_daily_minutes, max_weekly_minutes, blocked_times
            FROM restrictions
            WHERE student_id = %s
            """,
            (student_id,),
        )
        restriction_rows = cur.fetchall()

        now = datetime.datetime.now()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - datetime.timedelta(days=7)

        cur.execute(
            """
            SELECT
              COALESCE(SUM(CASE WHEN started_at >= %s THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60 ELSE 0 END), 0),
              COALESCE(SUM(CASE WHEN started_at >= %s THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60 ELSE 0 END), 0)
            FROM sessions
            WHERE student_id = %s AND status = 'summarized' AND started_at >= %s
            """,
            (day_start, week_start, student_id, week_start),
        )
        durations = cur.fetchone() or (0, 0)
        total_daily_minutes = float(durations[0] or 0)
        total_weekly_minutes = float(durations[1] or 0)

        for max_daily_minutes, max_weekly_minutes, blocked_times in restriction_rows:
            if max_daily_minutes is not None and total_daily_minutes >= float(max_daily_minutes):
                raise HTTPException(status_code=403, detail="Daily tutorial limit reached by parent/guardian restrictions")
            if max_weekly_minutes is not None and total_weekly_minutes >= float(max_weekly_minutes):
                raise HTTPException(status_code=403, detail="Weekly tutorial limit reached by parent/guardian restrictions")
            if _is_now_blocked(blocked_times):
                raise HTTPException(status_code=403, detail="Tutorials are blocked at this time by parent/guardian restrictions")

        subject_id = course_row[0]
        exam_board_id = course_row[1]
        enrolment_id: int | None = None

        if subject_id is not None:
            cur.execute(
                """
                SELECT se.id, bs.exam_board_id
                FROM student_enrolments se
                INNER JOIN board_subjects bs ON bs.id = se.board_subject_id
                WHERE se.student_id = %s
                """,
                (student_id,),
            )
            enrolments = cur.fetchall()

            for row in enrolments:
                if exam_board_id is None or row[1] == exam_board_id:
                    enrolment_id = int(row[0])
                    break

            if enrolment_id is None:
                raise HTTPException(status_code=403, detail="You are not enrolled in this subject/exam board")

        session_id = str(uuid.uuid4())
        room_name = f"dos-{session_id}"
        participant_token = _build_participant_token(room_name, student_id)

        asyncio.run(_ensure_room(room_name))

        cur.execute(
            """
            INSERT INTO sessions (id, student_id, enrolment_id, course_id, topic_id, room_name, participant_token, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
            """,
            (session_id, student_id, enrolment_id, course_id, topic_id, room_name, participant_token),
        )
        conn.commit()

    return SessionCreateResponse(sessionId=session_id, roomName=room_name, participantToken=participant_token)


def _get_session_by_id_and_student_sync(session_id: str, student_id: str) -> tuple[str, int, int, int | None] | None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT room_name, course_id, topic_id, enrolment_id
            FROM sessions
            WHERE id = %s AND student_id = %s
            """,
            (session_id, student_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        return str(row[0]), int(row[1]), int(row[2]), int(row[3]) if row[3] is not None else None


def _list_sessions_sync(student_id: str) -> list[SessionListItem]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              s.id,
              s.status,
              s.room_name,
              s.created_at,
              s.started_at,
              s.ended_at,
              c.name,
              t.name
            FROM sessions s
            INNER JOIN courses c ON c.id = s.course_id
            INNER JOIN topics t ON t.id = s.topic_id
            WHERE s.student_id = %s
            ORDER BY s.created_at DESC
            """,
            (student_id,),
        )
        rows = cur.fetchall()

    return [
        SessionListItem(
            id=str(row[0]),
            status=str(row[1]),
            roomName=str(row[2]),
            createdAt=row[3],
            startedAt=row[4],
            endedAt=row[5],
            courseName=str(row[6]),
            topicName=str(row[7]),
        )
        for row in rows
    ]


def _get_session_detail_sync(session_id: str, student_id: str) -> SessionDetail | None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              s.id,
              s.room_name,
              s.participant_token,
              s.status,
              s.started_at,
              s.ended_at,
              s.created_at,
              s.course_id,
              s.topic_id,
              c.name,
              t.name,
              st.transcript_json,
              st.transcript_text,
              ss.summary_md,
              ss.key_takeaways_json,
              ss.citations_json
            FROM sessions s
            INNER JOIN courses c ON c.id = s.course_id
            INNER JOIN topics t ON t.id = s.topic_id
            LEFT JOIN session_transcripts st ON st.session_id = s.id
            LEFT JOIN session_summaries ss ON ss.session_id = s.id
            WHERE s.id = %s AND s.student_id = %s
            LIMIT 1
            """,
            (session_id, student_id),
        )
        row = cur.fetchone()

    if not row:
        return None

    return SessionDetail(
        id=str(row[0]),
        roomName=str(row[1]),
        participantToken=str(row[2]) if row[2] is not None else None,
        status=str(row[3]),
        startedAt=row[4],
        endedAt=row[5],
        createdAt=row[6],
        courseId=int(row[7]),
        topicId=int(row[8]),
        courseName=str(row[9]),
        topicName=str(row[10]),
        transcriptJson=row[11],
        transcriptText=str(row[12]) if row[12] is not None else None,
        summaryMd=str(row[13]) if row[13] is not None else None,
        keyTakeawaysJson=row[14],
        citationsJson=row[15],
    )


def _calendar_list_sync(student_id: str, from_iso: str | None, to_iso: str | None) -> list[dict[str, Any]]:
    clauses = ["student_id = %s"]
    args: list[Any] = [student_id]
    if from_iso:
        clauses.append("scheduled_at >= %s")
        args.append(datetime.datetime.fromisoformat(from_iso))
    if to_iso:
        clauses.append("scheduled_at <= %s")
        args.append(datetime.datetime.fromisoformat(to_iso))

    query = f"""
        SELECT id, student_id, enrolment_id, topic_id, title, scheduled_at, duration_minutes,
               recurrence_rule, status, session_id, created_by, sync_provider,
               external_calendar_id, created_at, updated_at
        FROM scheduled_tutorials
        WHERE {' AND '.join(clauses)}
        ORDER BY scheduled_at ASC
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(query, tuple(args))
        rows = cur.fetchall()

    return [
        {
            "id": str(r[0]),
            "studentId": str(r[1]),
            "enrolmentId": r[2],
            "topicId": r[3],
            "title": r[4],
            "scheduledAt": r[5],
            "durationMinutes": r[6],
            "recurrenceRule": r[7],
            "status": r[8],
            "sessionId": str(r[9]) if r[9] else None,
            "createdBy": str(r[10]),
            "syncProvider": r[11],
            "externalCalendarId": r[12],
            "createdAt": r[13],
            "updatedAt": r[14],
        }
        for r in rows
    ]


def _calendar_create_sync(payload: CalendarCreateRequest) -> str:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO scheduled_tutorials (
              student_id, enrolment_id, topic_id, title, scheduled_at,
              duration_minutes, recurrence_rule, status, created_by
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'scheduled', %s)
            RETURNING id
            """,
            (
                payload.studentId,
                payload.enrolmentId,
                payload.topicId,
                payload.title,
                datetime.datetime.fromisoformat(payload.scheduledAt),
                payload.durationMinutes,
                payload.recurrenceRule,
                payload.createdBy,
            ),
        )
        row = cur.fetchone()
        conn.commit()
    return str(row[0])


def _calendar_update_sync(tutorial_id: str, payload: CalendarUpdateRequest) -> None:
    fields: list[str] = []
    values: list[Any] = []
    if payload.title is not None:
        fields.append("title = %s")
        values.append(payload.title)
    if payload.scheduledAt is not None:
        fields.append("scheduled_at = %s")
        values.append(datetime.datetime.fromisoformat(payload.scheduledAt))
    if payload.durationMinutes is not None:
        fields.append("duration_minutes = %s")
        values.append(payload.durationMinutes)
    if payload.status is not None:
        fields.append("status = %s")
        values.append(payload.status)
    if payload.recurrenceRule is not None:
        fields.append("recurrence_rule = %s")
        values.append(payload.recurrenceRule)

    fields.append("updated_at = NOW()")
    values.extend([tutorial_id, payload.studentId])

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE scheduled_tutorials SET {', '.join(fields)} WHERE id = %s AND student_id = %s",
            tuple(values),
        )
        conn.commit()


def _calendar_delete_sync(tutorial_id: str, student_id: str) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM scheduled_tutorials WHERE id = %s AND student_id = %s",
            (tutorial_id, student_id),
        )
        conn.commit()


def _reference_board_subjects_sync() -> list[dict[str, Any]]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT bs.id, eb.id, eb.code, eb.name, s.id, s.name, s.level, s.category, bs.syllabus_code
            FROM board_subjects bs
            INNER JOIN subjects s ON s.id = bs.subject_id
            LEFT JOIN exam_boards eb ON eb.id = bs.exam_board_id
            ORDER BY s.category ASC, s.name ASC, s.level ASC
            """
        )
        rows = cur.fetchall()
    return [
        {
            "boardSubjectId": r[0],
            "boardId": r[1],
            "boardCode": r[2],
            "boardName": r[3],
            "subjectId": r[4],
            "subjectName": r[5],
            "level": r[6],
            "category": r[7],
            "syllabusCode": r[8],
        }
        for r in rows
    ]


def _student_enrolments_list_sync(student_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT se.id, se.board_subject_id, se.exam_year, se.current_year_of_study,
                   s.name, s.level, s.category, eb.code, eb.name, bs.syllabus_code
            FROM student_enrolments se
            INNER JOIN board_subjects bs ON bs.id = se.board_subject_id
            INNER JOIN subjects s ON s.id = bs.subject_id
            LEFT JOIN exam_boards eb ON eb.id = bs.exam_board_id
            WHERE se.student_id = %s
            ORDER BY s.category ASC, s.name ASC, s.level ASC
            """,
            (student_id,),
        )
        rows = cur.fetchall()
    return [
        {
            "enrolmentId": r[0],
            "boardSubjectId": r[1],
            "examYear": r[2],
            "currentYearOfStudy": r[3],
            "subjectName": r[4],
            "level": r[5],
            "category": r[6],
            "boardCode": r[7],
            "boardName": r[8],
            "syllabusCode": r[9],
        }
        for r in rows
    ]


def _student_enrolment_upsert_sync(payload: StudentEnrolmentUpsertRequest) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO student_enrolments (student_id, board_subject_id, exam_year, current_year_of_study)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (student_id, board_subject_id)
            DO UPDATE SET exam_year = EXCLUDED.exam_year,
                          current_year_of_study = EXCLUDED.current_year_of_study
            """,
            (payload.studentId, payload.boardSubjectId, payload.examYear, payload.currentYearOfStudy),
        )
        conn.commit()


def _student_enrolment_delete_sync(payload: StudentEnrolmentDeleteRequest) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM student_enrolments WHERE id = %s AND student_id = %s",
            (payload.enrolmentId, payload.studentId),
        )
        conn.commit()


def _generate_code(length: int = 6) -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(chars) for _ in range(length))


def _student_invite_code_sync(student_id: str) -> dict[str, Any]:
    now = datetime.datetime.now(datetime.timezone.utc)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT code, expires_at
            FROM student_invite_codes
            WHERE student_id = %s AND used_at IS NULL AND expires_at > %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (student_id, now),
        )
        existing = cur.fetchone()
        if existing:
            return {"code": existing[0], "expiresAt": existing[1]}

        code = _generate_code()
        expires_at = now + datetime.timedelta(hours=24)
        cur.execute(
            "INSERT INTO student_invite_codes (student_id, code, expires_at) VALUES (%s, %s, %s)",
            (student_id, code, expires_at),
        )
        conn.commit()
        return {"code": code, "expiresAt": expires_at}


def _tutor_personas_list_sync(student_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, personality_prompt, tts_voice_model, tts_speed
            FROM tutor_personas
            WHERE student_id = %s
            ORDER BY name
            """,
            (student_id,),
        )
        rows = cur.fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "personalityPrompt": r[2],
            "ttsVoiceModel": r[3],
            "ttsSpeed": r[4],
        }
        for r in rows
    ]


def _tutor_persona_create_sync(payload: TutorPersonaCreateRequest) -> dict[str, Any]:
    personality = (payload.personalityPrompt or "Be warm, concise, and Socratic.").strip() or "Be warm, concise, and Socratic."
    voice = (payload.ttsVoiceModel or "aura-2-draco-en").strip() or "aura-2-draco-en"
    speed = (payload.ttsSpeed or "1.0").strip() or "1.0"
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO tutor_personas (student_id, name, personality_prompt, tts_voice_model, tts_speed)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, name, personality_prompt, tts_voice_model, tts_speed
            """,
            (payload.studentId, payload.name.strip(), personality, voice, speed),
        )
        row = cur.fetchone()
        conn.commit()
    return {
        "id": row[0],
        "name": row[1],
        "personalityPrompt": row[2],
        "ttsVoiceModel": row[3],
        "ttsSpeed": row[4],
    }


def _tutor_persona_update_sync(persona_id: int, payload: TutorPersonaUpdateRequest) -> dict[str, Any] | None:
    personality = (payload.personalityPrompt or "Be warm, concise, and Socratic.").strip() or "Be warm, concise, and Socratic."
    voice = (payload.ttsVoiceModel or "aura-2-draco-en").strip() or "aura-2-draco-en"
    speed = (payload.ttsSpeed or "1.0").strip() or "1.0"
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE tutor_personas
            SET name = %s, personality_prompt = %s, tts_voice_model = %s, tts_speed = %s, updated_at = NOW()
            WHERE id = %s AND student_id = %s
            RETURNING id, name, personality_prompt, tts_voice_model, tts_speed
            """,
            (payload.name.strip(), personality, voice, speed, persona_id, payload.studentId),
        )
        row = cur.fetchone()
        conn.commit()
    if not row:
        return None
    return {
        "id": row[0],
        "name": row[1],
        "personalityPrompt": row[2],
        "ttsVoiceModel": row[3],
        "ttsSpeed": row[4],
    }


def _tutor_persona_delete_sync(persona_id: int, student_id: str) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM tutor_personas WHERE id = %s AND student_id = %s", (persona_id, student_id))
        conn.commit()


def _tutor_config_list_sync(student_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT se.id, s.name, s.level, tc.persona_id, tp.name
            FROM student_enrolments se
            INNER JOIN board_subjects bs ON bs.id = se.board_subject_id
            INNER JOIN subjects s ON s.id = bs.subject_id
            LEFT JOIN tutor_configs tc ON tc.enrolment_id = se.id AND tc.student_id = %s
            LEFT JOIN tutor_personas tp ON tp.id = tc.persona_id
            WHERE se.student_id = %s
            """,
            (student_id, student_id),
        )
        rows = cur.fetchall()
    return [
        {
            "enrolmentId": r[0],
            "subjectName": r[1],
            "level": r[2],
            "personaId": r[3],
            "personaName": r[4],
        }
        for r in rows
    ]


def _tutor_config_update_sync(payload: TutorConfigUpdateRequest) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM student_enrolments WHERE id = %s AND student_id = %s",
            (payload.enrolmentId, payload.studentId),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Enrolment not found")

        if payload.personaId is not None:
            cur.execute(
                "SELECT id FROM tutor_personas WHERE id = %s AND student_id = %s",
                (payload.personaId, payload.studentId),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Persona not found")

        cur.execute(
            """
            INSERT INTO tutor_configs (student_id, enrolment_id, persona_id)
            VALUES (%s, %s, %s)
            ON CONFLICT (student_id, enrolment_id)
            DO UPDATE SET persona_id = EXCLUDED.persona_id, updated_at = NOW()
            """,
            (payload.studentId, payload.enrolmentId, payload.personaId),
        )
        conn.commit()


def _parent_links_list_sync(parent_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT psl.student_id, psl.relationship, p.display_name, p.email, s.school_year
            FROM parent_student_links psl
            INNER JOIN students s ON s.id = psl.student_id
            INNER JOIN profiles p ON p.id = s.id
            WHERE psl.parent_id = %s
            """,
            (parent_id,),
        )
        rows = cur.fetchall()
    return [
        {
            "studentId": r[0],
            "relationship": r[1],
            "studentName": r[2],
            "studentEmail": r[3],
            "schoolYear": r[4],
        }
        for r in rows
    ]


def _parent_link_student_sync(payload: ParentLinkCreateRequest) -> None:
    email = payload.studentEmail.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="studentEmail is required")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.id
            FROM students s
            INNER JOIN profiles p ON p.id = s.id
            WHERE p.email = %s AND p.account_type = 'student'
            LIMIT 1
            """,
            (email,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Student not found")

        cur.execute(
            """
            INSERT INTO parent_student_links (parent_id, student_id, relationship)
            VALUES (%s, %s, %s)
            ON CONFLICT (parent_id, student_id) DO NOTHING
            """,
            (payload.parentId, row[0], (payload.relationship or "guardian").strip() or "guardian"),
        )
        conn.commit()


def _parent_link_code_sync(payload: ParentLinkCodeRequest) -> str:
    code = payload.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Invite code is required")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, student_id
            FROM student_invite_codes
            WHERE code = %s AND used_at IS NULL AND expires_at > NOW()
            LIMIT 1
            """,
            (code,),
        )
        invite = cur.fetchone()
        if not invite:
            raise HTTPException(status_code=404, detail="Invalid or expired invite code")

        cur.execute(
            """
            INSERT INTO parent_student_links (parent_id, student_id, relationship)
            VALUES (%s, %s, %s)
            ON CONFLICT (parent_id, student_id) DO NOTHING
            """,
            (payload.parentId, invite[1], payload.relationship or "guardian"),
        )
        cur.execute("UPDATE student_invite_codes SET used_at = NOW() WHERE id = %s", (invite[0],))
        conn.commit()
        return str(invite[1])


def _parent_restrictions_get_sync(parent_id: str, student_id: str) -> dict[str, Any] | None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT student_id FROM parent_student_links WHERE parent_id = %s AND student_id = %s",
            (parent_id, student_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Student not linked to this parent account")

        cur.execute(
            """
            SELECT id, parent_id, student_id, max_daily_minutes, max_weekly_minutes, blocked_times, created_at, updated_at
            FROM restrictions
            WHERE parent_id = %s AND student_id = %s
            LIMIT 1
            """,
            (parent_id, student_id),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "parentId": row[1],
        "studentId": row[2],
        "maxDailyMinutes": row[3],
        "maxWeeklyMinutes": row[4],
        "blockedTimes": row[5],
        "createdAt": row[6],
        "updatedAt": row[7],
    }


def _parent_restrictions_upsert_sync(payload: ParentRestrictionsUpsertRequest) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT student_id FROM parent_student_links WHERE parent_id = %s AND student_id = %s",
            (payload.parentId, payload.studentId),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Student not linked to this parent account")

        cur.execute(
            """
            INSERT INTO restrictions (parent_id, student_id, max_daily_minutes, max_weekly_minutes, blocked_times)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (parent_id, student_id)
            DO UPDATE SET
              max_daily_minutes = EXCLUDED.max_daily_minutes,
              max_weekly_minutes = EXCLUDED.max_weekly_minutes,
              blocked_times = EXCLUDED.blocked_times,
              updated_at = NOW()
            """,
            (
                payload.parentId,
                payload.studentId,
                payload.maxDailyMinutes,
                payload.maxWeeklyMinutes,
                json.dumps(payload.blockedTimes or []),
            ),
        )

        mandatory = payload.mandatoryRevision or []
        for item in mandatory:
            concept = str(item.get("concept") or "").strip()
            reason = str(item.get("reason") or "").strip()
            enrolment_id = int(item.get("enrolmentId") or 0)
            if not concept or not reason or enrolment_id <= 0:
                continue

            cur.execute(
                "SELECT id FROM student_enrolments WHERE id = %s AND student_id = %s",
                (enrolment_id, payload.studentId),
            )
            if not cur.fetchone():
                continue

            cur.execute(
                """
                INSERT INTO repeat_flags (student_id, enrolment_id, concept, reason, priority, status, parent_assigned)
                VALUES (%s, %s, %s, %s, 'high', 'active', 1)
                """,
                (payload.studentId, enrolment_id, concept, reason),
            )

        conn.commit()


def _progress_overview_sync(student_id: str) -> dict[str, Any]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              COUNT(*) AS total_sessions,
              COUNT(*) FILTER (WHERE created_at >= NOW() - interval '7 days') AS sessions_this_week
            FROM sessions
            WHERE student_id = %s
            """,
            (student_id,),
        )
        stats = cur.fetchone() or (0, 0)

        cur.execute(
            """
            SELECT se.id, s.name, s.level, COALESCE(AVG((ps.confidence_score)::numeric), 0)
            FROM student_enrolments se
            INNER JOIN board_subjects bs ON bs.id = se.board_subject_id
            INNER JOIN subjects s ON s.id = bs.subject_id
            LEFT JOIN progress_snapshots ps ON ps.student_id = %s AND ps.enrolment_id = se.id
            WHERE se.student_id = %s
            GROUP BY se.id, s.name, s.level
            ORDER BY s.name
            """,
            (student_id, student_id),
        )
        subject_progress = [
            {
                "enrolmentId": r[0],
                "subjectName": r[1],
                "level": r[2],
                "avgConfidence": float(r[3]),
            }
            for r in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT rf.id, rf.concept, rf.reason, rf.priority, s.name
            FROM repeat_flags rf
            INNER JOIN student_enrolments se ON se.id = rf.enrolment_id
            INNER JOIN board_subjects bs ON bs.id = se.board_subject_id
            INNER JOIN subjects s ON s.id = bs.subject_id
            WHERE rf.student_id = %s AND rf.status = 'active'
            ORDER BY rf.priority, rf.flagged_at DESC
            """,
            (student_id,),
        )
        active_repeat = [
            {
                "id": r[0],
                "concept": r[1],
                "reason": r[2],
                "priority": r[3],
                "subjectName": r[4],
            }
            for r in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT id, title, scheduled_at, status
            FROM scheduled_tutorials
            WHERE student_id = %s AND status = 'scheduled'
            ORDER BY scheduled_at
            LIMIT 5
            """,
            (student_id,),
        )
        upcoming = [
            {"id": str(r[0]), "title": r[1], "scheduledAt": r[2], "status": r[3]}
            for r in cur.fetchall()
        ]

    return {
        "stats": {"totalSessions": int(stats[0]), "sessionsThisWeek": int(stats[1])},
        "subjectProgress": subject_progress,
        "activeRepeatFlags": active_repeat,
        "upcoming": upcoming,
    }


def _dos_chat_threads_sync(student_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, created_at
            FROM dos_chat_threads
            WHERE student_id = %s
            ORDER BY created_at DESC
            LIMIT 10
            """,
            (student_id,),
        )
        rows = cur.fetchall()
    return [{"id": str(r[0]), "createdAt": r[1]} for r in rows]


def _dos_chat_post_sync(payload: DosChatRequest) -> dict[str, Any]:
    from openai import OpenAI

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    with get_conn() as conn, conn.cursor() as cur:
        thread_id = payload.threadId
        if not thread_id:
            cur.execute("INSERT INTO dos_chat_threads (student_id) VALUES (%s) RETURNING id", (payload.studentId,))
            thread_id = str(cur.fetchone()[0])

        cur.execute(
            "INSERT INTO dos_chat_messages (thread_id, role, content) VALUES (%s, 'user', %s)",
            (thread_id, message),
        )

        cur.execute(
            """
            SELECT role, content
            FROM dos_chat_messages
            WHERE thread_id = %s
            ORDER BY created_at DESC
            LIMIT 12
            """,
            (thread_id,),
        )
        recent_messages = cur.fetchall()

        cur.execute(
            """
            SELECT s.name, s.level
            FROM student_enrolments se
            INNER JOIN board_subjects bs ON bs.id = se.board_subject_id
            INNER JOIN subjects s ON s.id = bs.subject_id
            WHERE se.student_id = %s
            """,
            (payload.studentId,),
        )
        enrolments = [{"subjectName": r[0], "level": r[1]} for r in cur.fetchall()]

        cur.execute(
            """
            SELECT concept, reason, priority
            FROM repeat_flags
            WHERE student_id = %s AND status = 'active'
            ORDER BY flagged_at DESC
            LIMIT 12
            """,
            (payload.studentId,),
        )
        repeats = [{"concept": r[0], "reason": r[1], "priority": r[2]} for r in cur.fetchall()]

        cur.execute(
            """
            SELECT confidence_score, areas_to_improve, recommended_focus
            FROM progress_snapshots
            WHERE student_id = %s
            ORDER BY generated_at DESC
            LIMIT 6
            """,
            (payload.studentId,),
        )
        snapshots = [
            {"confidenceScore": r[0], "areasToImprove": r[1], "recommendedFocus": r[2]}
            for r in cur.fetchall()
        ]

        cur.execute("SELECT COUNT(*) FROM sessions WHERE student_id = %s", (payload.studentId,))
        session_total = int((cur.fetchone() or [0])[0])

        openai_key = os.environ.get("OPENAI_API_KEY")
        assistant_reply = "I can help plan your next steps. Please set OPENAI_API_KEY to enable AI recommendations."

        if openai_key:
            client = OpenAI(api_key=openai_key)
            completion = client.chat.completions.create(
                model=os.environ.get("SUMMARY_OPENAI_MODEL", "gpt-5-mini"),
                messages=[
                    {
                        "role": "system",
                        "content": "You are a Director of Studies planning assistant. Give concise UK-school-focused tutoring guidance. Be practical and specific.",
                    },
                    {
                        "role": "system",
                        "content": (
                            f"Student context:\nSubjects: {json.dumps(enrolments)}\n"
                            f"Active repeats: {json.dumps(repeats)}\n"
                            f"Recent snapshots: {json.dumps(snapshots)}\n"
                            f"Total sessions tracked: {session_total}"
                        ),
                    },
                    *[
                        {"role": "assistant" if r[0] == "assistant" else "user", "content": r[1]}
                        for r in reversed(recent_messages)
                    ],
                ],
            )
            assistant_reply = completion.choices[0].message.content.strip() if completion.choices[0].message.content else assistant_reply

        cur.execute(
            "INSERT INTO dos_chat_messages (thread_id, role, content) VALUES (%s, 'assistant', %s)",
            (thread_id, assistant_reply),
        )
        conn.commit()

    return {"threadId": thread_id, "reply": assistant_reply}


def _supabase_admin_request(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    service_role = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_role:
        raise HTTPException(status_code=500, detail="Supabase admin config missing")

    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib_request.Request(
        f"{supabase_url}{path}",
        method=method,
        data=data,
        headers={
            "apikey": service_role,
            "Authorization": f"Bearer {service_role}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib_request.urlopen(req, timeout=30) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else {}
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise HTTPException(status_code=500, detail=f"Supabase admin request failed: {detail}") from exc


def _guest_login_sync() -> dict[str, Any]:
    guest_email = os.environ.get("GUEST_DEMO_EMAIL", "guest@director.local")
    guest_password = os.environ.get("GUEST_DEMO_PASSWORD", "GuestDemo123!")
    guest_name = os.environ.get("GUEST_DEMO_NAME", "Guest Student")

    users_response = _supabase_admin_request("GET", "/auth/v1/admin/users?page=1&per_page=200")
    users = users_response.get("users", []) if isinstance(users_response, dict) else []
    existing = next((u for u in users if str(u.get("email", "")).lower() == guest_email.lower()), None)

    metadata = {"displayName": guest_name, "accountType": "student", "isDemo": True}
    if existing:
        user_id = existing.get("id")
        _supabase_admin_request(
            "PUT",
            f"/auth/v1/admin/users/{user_id}",
            {
                "password": guest_password,
                "email_confirm": True,
                "user_metadata": metadata,
            },
        )
    else:
        created = _supabase_admin_request(
            "POST",
            "/auth/v1/admin/users",
            {
                "email": guest_email,
                "password": guest_password,
                "email_confirm": True,
                "user_metadata": metadata,
            },
        )
        user_obj = created.get("user") if isinstance(created, dict) else None
        user_id = user_obj.get("id") if isinstance(user_obj, dict) else None

    if not user_id:
        raise HTTPException(status_code=500, detail="Failed to create or update guest user")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO profiles (id, account_type, display_name, email, country)
            VALUES (%s, 'student', %s, %s, 'GB')
            ON CONFLICT (id)
            DO UPDATE SET
              account_type = 'student',
              display_name = EXCLUDED.display_name,
              email = EXCLUDED.email,
              country = 'GB',
              updated_at = NOW()
            """,
            (user_id, guest_name, guest_email),
        )
        cur.execute(
            """
            INSERT INTO students (id, date_of_birth, school_year)
            VALUES (%s, '2010-09-01', 10)
            ON CONFLICT (id)
            DO UPDATE SET
              date_of_birth = EXCLUDED.date_of_birth,
              school_year = EXCLUDED.school_year
            """,
            (user_id,),
        )

        cur.execute("SELECT id FROM student_enrolments WHERE student_id = %s LIMIT 1", (user_id,))
        if not cur.fetchone():
            cur.execute("SELECT id FROM board_subjects ORDER BY id DESC LIMIT 1")
            board_subject = cur.fetchone()
            if board_subject:
                cur.execute(
                    """
                    INSERT INTO student_enrolments (student_id, board_subject_id, exam_year, current_year_of_study)
                    VALUES (%s, %s, %s, 1)
                    """,
                    (user_id, board_subject[0], datetime.datetime.now().year + 1),
                )

        conn.commit()

    return {"email": guest_email, "password": guest_password}


def _wait_for_transcript_text_sync(session_id: str, max_attempts: int = 6, delay_ms: int = 400) -> str:
    for attempt in range(max_attempts):
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT transcript_text FROM session_transcripts WHERE session_id = %s",
                (session_id,),
            )
            row = cur.fetchone()

        transcript_text = str(row[0]) if row and row[0] else ""
        if transcript_text.strip():
            return transcript_text

        if attempt < max_attempts - 1:
            import time

            time.sleep(delay_ms / 1000)

    return ""


def _summarize_transcript_sync(transcript_text: str) -> SummaryPayload:
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return SummaryPayload(summaryMd="No summary generated because OPENAI_API_KEY is not set.", keyTakeaways=[], citations=[])

    client = OpenAI(api_key=api_key)
    completion = client.chat.completions.create(
        model=SUMMARY_OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a Director of Studies reviewing a tutoring session transcript. "
                    "Return strict JSON with exactly these keys: "
                    "summaryMd, keyTakeaways, citations. "
                    "summaryMd: markdown 2-4 paragraphs assessing performance. "
                    "keyTakeaways: up to 6 short strings of topics covered. "
                    "citations: up to 5 concrete personalized study recommendations."
                ),
            },
            {"role": "user", "content": transcript_text},
        ],
    )
    raw = completion.choices[0].message.content or "{}"
    parsed = json.loads(raw)
    return SummaryPayload(
        summaryMd=str(parsed.get("summaryMd") or "No summary generated."),
        keyTakeaways=[str(v) for v in parsed.get("keyTakeaways", []) if isinstance(v, str)],
        citations=[str(v) for v in parsed.get("citations", []) if isinstance(v, str)],
    )


def _analyze_progress_sync(transcript_text: str) -> ProgressPayload:
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return ProgressPayload(
            confidenceScore=0.6,
            strengths=[],
            improvements=[],
            focus=[],
            repeat=[],
        )

    client = OpenAI(api_key=api_key)
    completion = client.chat.completions.create(
        model=SUMMARY_OPENAI_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You analyse student tutorial transcripts. Return strict JSON with keys: "
                    "confidenceScore (0..1), strengths (string[]), improvements (string[]), "
                    "focus (string[]), repeat ({ concept, reason, priority }[]). "
                    "priority must be one of high|medium|low."
                ),
            },
            {"role": "user", "content": transcript_text or "No transcript content available."},
        ],
    )
    raw = completion.choices[0].message.content or "{}"
    parsed = json.loads(raw)

    score_raw = parsed.get("confidenceScore", 0.6)
    score = float(score_raw) if isinstance(score_raw, (float, int)) else 0.6
    clamped_score = max(0.0, min(1.0, score))

    repeat_items: list[RepeatPayload] = []
    for item in parsed.get("repeat", []) if isinstance(parsed.get("repeat"), list) else []:
        if not isinstance(item, dict):
            continue
        concept = str(item.get("concept") or "").strip()
        reason = str(item.get("reason") or "").strip()
        priority_raw = str(item.get("priority") or "medium").strip().lower()
        priority = priority_raw if priority_raw in {"high", "medium", "low"} else "medium"
        if concept and reason:
            repeat_items.append(RepeatPayload(concept=concept, reason=reason, priority=priority))

    return ProgressPayload(
        confidenceScore=clamped_score,
        strengths=[str(v) for v in parsed.get("strengths", []) if isinstance(v, str)],
        improvements=[str(v) for v in parsed.get("improvements", []) if isinstance(v, str)],
        focus=[str(v) for v in parsed.get("focus", []) if isinstance(v, str)],
        repeat=repeat_items,
    )


def _end_session_sync(session_id: str, student_id: str) -> bool:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, student_id, enrolment_id, topic_id FROM sessions WHERE id = %s",
            (session_id,),
        )
        row = cur.fetchone()
        if not row:
            return False

        if str(row[1]) != student_id:
            return False

        enrolment_id = row[2]
        topic_id = row[3]

        cur.execute(
            "UPDATE sessions SET status = 'ended', ended_at = NOW() WHERE id = %s",
            (session_id,),
        )
        conn.commit()

    transcript_text = _wait_for_transcript_text_sync(session_id)

    summary, progress = asyncio.run(_generate_summary_and_progress_async(transcript_text))

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO session_summaries (session_id, summary_md, key_takeaways_json, citations_json)
            VALUES (%s, %s, %s::jsonb, %s::jsonb)
            ON CONFLICT (session_id)
            DO UPDATE SET
              summary_md = EXCLUDED.summary_md,
              key_takeaways_json = EXCLUDED.key_takeaways_json,
              citations_json = EXCLUDED.citations_json
            """,
            (
                session_id,
                summary.summaryMd,
                json.dumps(summary.keyTakeaways),
                json.dumps(summary.citations),
            ),
        )

        cur.execute("UPDATE sessions SET status = 'summarized' WHERE id = %s", (session_id,))

        if enrolment_id:
            cur.execute(
                """
                INSERT INTO progress_snapshots (
                  student_id,
                  enrolment_id,
                  topic_id,
                  confidence_score,
                  areas_of_strength,
                  areas_to_improve,
                  recommended_focus
                )
                VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                """,
                (
                    student_id,
                    enrolment_id,
                    topic_id,
                    str(progress.confidenceScore),
                    json.dumps(progress.strengths),
                    json.dumps(progress.improvements),
                    json.dumps(progress.focus),
                ),
            )

            repeat_values = [
                (
                    student_id,
                    enrolment_id,
                    topic_id,
                    item.concept,
                    item.reason,
                    item.priority,
                )
                for item in progress.repeat
            ]

            if repeat_values:
                cur.executemany(
                    """
                    INSERT INTO repeat_flags (
                      student_id,
                      enrolment_id,
                      topic_id,
                      concept,
                      reason,
                      priority,
                      status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, 'active')
                    """,
                    repeat_values,
                )

        conn.commit()

    return True


async def _generate_summary_and_progress_async(transcript_text: str) -> tuple[SummaryPayload, ProgressPayload]:
    summary_task = asyncio.to_thread(_summarize_transcript_sync, transcript_text)
    progress_task = asyncio.to_thread(_analyze_progress_sync, transcript_text)
    summary, progress = await asyncio.gather(summary_task, progress_task)
    return summary, progress


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/join")
async def join_room(payload: JoinRequest) -> dict[str, Any]:
    await _start_agent_join(payload)

    return {"ok": True}


@app.post("/api/session/create")
async def create_session(
    payload: SessionCreateRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> SessionCreateResponse:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit credentials missing")

    return await asyncio.to_thread(_create_session_sync, payload.courseId, payload.topicId, payload.studentId)


@app.post("/api/session/start-agent")
async def start_session_agent(
    payload: SessionStartAgentRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)

    session_row = await asyncio.to_thread(_get_session_by_id_and_student_sync, payload.sessionId, payload.studentId)
    if not session_row:
        raise HTTPException(status_code=404, detail="Session not found")

    room_name, course_id, topic_id, enrolment_id = session_row
    tutor_config, repeat_flags, recommended_focus = await asyncio.to_thread(
        _load_tutor_runtime_context,
        payload.studentId,
        enrolment_id,
    )

    await _start_agent_join(
        JoinRequest(
            roomName=room_name,
            sessionId=payload.sessionId,
            courseId=course_id,
            topicId=topic_id,
            studentId=payload.studentId,
            enrolmentId=enrolment_id,
            tutorName=(tutor_config or {}).get("tutorName") or "TutorBot",
            personalityPrompt=(tutor_config or {}).get("personalityPrompt") or "Be warm, concise, and Socratic.",
            tutorVoiceModel=(tutor_config or {}).get("ttsVoiceModel") or payload.deepgramTtsModel or "aura-2-draco-en",
            tutorTtsSpeed=(tutor_config or {}).get("ttsSpeed") or "1.0",
            repeatFlags=repeat_flags,
            recommendedFocus=recommended_focus,
            agentOpenAIModel=payload.agentOpenAIModel,
            deepgramSttModel=payload.deepgramSttModel,
            deepgramTtsModel=payload.deepgramTtsModel,
            silenceNudgeAfterS=payload.silenceNudgeAfterS,
        )
    )

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE sessions SET status = 'live', started_at = NOW() WHERE id = %s",
            (payload.sessionId,),
        )
        conn.commit()

    return {"ok": True}


@app.post("/api/session/end")
async def end_session(
    payload: SessionEndRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    ok = await asyncio.to_thread(_end_session_sync, payload.sessionId, payload.studentId)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@app.get("/api/sessions")
async def list_sessions(
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, list[SessionListItem]]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    sessions_list = await asyncio.to_thread(_list_sessions_sync, studentId)
    return {"sessions": sessions_list}


@app.get("/api/sessions/{session_id}")
async def get_session_detail(
    session_id: str,
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, SessionDetail]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    session = await asyncio.to_thread(_get_session_detail_sync, session_id, studentId)
    if not session:
        raise HTTPException(status_code=404, detail="Not found")
    return {"session": session}


@app.get("/api/calendar")
async def calendar_list(
    studentId: str,
    from_: str | None = None,
    to: str | None = None,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    tutorials = await asyncio.to_thread(_calendar_list_sync, studentId, from_, to)
    return {"tutorials": tutorials}


@app.post("/api/calendar")
async def calendar_create(
    payload: CalendarCreateRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    if not payload.title or not payload.scheduledAt:
        raise HTTPException(status_code=400, detail="title and scheduledAt are required")
    tutorial_id = await asyncio.to_thread(_calendar_create_sync, payload)
    return {"id": tutorial_id}


@app.put("/api/calendar/{tutorial_id}")
async def calendar_update(
    tutorial_id: str,
    payload: CalendarUpdateRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    await asyncio.to_thread(_calendar_update_sync, tutorial_id, payload)
    return {"ok": True}


@app.delete("/api/calendar/{tutorial_id}")
async def calendar_delete(
    tutorial_id: str,
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    await asyncio.to_thread(_calendar_delete_sync, tutorial_id, studentId)
    return {"ok": True}


@app.get("/api/reference/board-subjects")
async def reference_board_subjects(
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization)
    rows = await asyncio.to_thread(_reference_board_subjects_sync)
    return {"boardSubjects": rows}


@app.get("/api/student/enrolments")
async def student_enrolments_list(
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    rows = await asyncio.to_thread(_student_enrolments_list_sync, studentId)
    return {"enrolments": rows}


@app.post("/api/student/enrolments")
async def student_enrolments_create(
    payload: StudentEnrolmentUpsertRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    await asyncio.to_thread(_student_enrolment_upsert_sync, payload)
    return {"ok": True}


@app.delete("/api/student/enrolments")
async def student_enrolments_delete(
    payload: StudentEnrolmentDeleteRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    await asyncio.to_thread(_student_enrolment_delete_sync, payload)
    return {"ok": True}


@app.get("/api/student/invite-code")
async def student_invite_code(
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    return await asyncio.to_thread(_student_invite_code_sync, studentId)


@app.get("/api/tutor-personas")
async def tutor_personas_list(
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    personas = await asyncio.to_thread(_tutor_personas_list_sync, studentId)
    return {"personas": personas}


@app.post("/api/tutor-personas")
async def tutor_personas_create(
    payload: TutorPersonaCreateRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Tutor name is required")
    persona = await asyncio.to_thread(_tutor_persona_create_sync, payload)
    return {"persona": persona}


@app.put("/api/tutor-personas/{persona_id}")
async def tutor_personas_update(
    persona_id: int,
    payload: TutorPersonaUpdateRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Tutor name is required")
    persona = await asyncio.to_thread(_tutor_persona_update_sync, persona_id, payload)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return {"persona": persona}


@app.delete("/api/tutor-personas/{persona_id}")
async def tutor_personas_delete(
    persona_id: int,
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    await asyncio.to_thread(_tutor_persona_delete_sync, persona_id, studentId)
    return {"ok": True}


@app.get("/api/tutor-config")
async def tutor_config_list(
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    enrolments = await asyncio.to_thread(_tutor_config_list_sync, studentId)
    return {"enrolments": enrolments}


@app.put("/api/tutor-config")
async def tutor_config_update(
    payload: TutorConfigUpdateRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    await asyncio.to_thread(_tutor_config_update_sync, payload)
    return {"ok": True}


@app.get("/api/parent/links")
async def parent_links_list(
    parentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, parentId)
    links = await asyncio.to_thread(_parent_links_list_sync, parentId)
    return {"links": links}


@app.post("/api/parent/links")
async def parent_links_create(
    payload: ParentLinkCreateRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.parentId)
    await asyncio.to_thread(_parent_link_student_sync, payload)
    return {"ok": True}


@app.post("/api/parent/link-code")
async def parent_link_code(
    payload: ParentLinkCodeRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.parentId)
    student_id = await asyncio.to_thread(_parent_link_code_sync, payload)
    return {"ok": True, "studentId": student_id}


@app.get("/api/parent/restrictions")
async def parent_restrictions_get(
    parentId: str,
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, parentId)
    restriction = await asyncio.to_thread(_parent_restrictions_get_sync, parentId, studentId)
    return {"restriction": restriction}


@app.put("/api/parent/restrictions")
async def parent_restrictions_put(
    payload: ParentRestrictionsUpsertRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.parentId)
    await asyncio.to_thread(_parent_restrictions_upsert_sync, payload)
    return {"ok": True}


@app.get("/api/progress/overview")
async def progress_overview(
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    return await asyncio.to_thread(_progress_overview_sync, studentId)


@app.get("/api/dos-chat")
async def dos_chat_threads(
    studentId: str,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, studentId)
    threads = await asyncio.to_thread(_dos_chat_threads_sync, studentId)
    return {"threads": threads}


@app.post("/api/dos-chat")
async def dos_chat_post(
    payload: DosChatRequest,
    x_internal_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _validate_internal_api_key(x_internal_api_key, authorization, payload.studentId)
    return await asyncio.to_thread(_dos_chat_post_sync, payload)


@app.post("/api/auth/guest-login")
async def guest_login(x_internal_api_key: str | None = Header(default=None)) -> dict[str, Any]:
    if AGENT_INTERNAL_API_KEY and x_internal_api_key != AGENT_INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await asyncio.to_thread(_guest_login_sync)
