from __future__ import annotations

import json
import os
from typing import Any

import psycopg
from openai import OpenAI

DATABASE_URL = os.environ.get("DATABASE_URL", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
_OPENAI_BASE_URL: str | None = os.environ.get("OPENAI_BASE_URL") or None

_openai_kwargs: dict = {"api_key": OPENAI_API_KEY}
if _OPENAI_BASE_URL:
    _openai_kwargs["base_url"] = _OPENAI_BASE_URL
openai_client = OpenAI(**_openai_kwargs)


def get_conn() -> psycopg.Connection:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")
    return psycopg.connect(DATABASE_URL)


def embedding_for(text: str) -> list[float]:
    response = openai_client.embeddings.create(model="text-embedding-3-small", input=text)
    return response.data[0].embedding


def upsert_transcript(session_id: str, transcript_items: list[dict[str, Any]]) -> None:
    transcript_text = "\n".join(
        [f"[{item.get('timestamp')}] {item.get('speaker')}: {item.get('text')}" for item in transcript_items]
    )

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO session_transcripts (session_id, transcript_json, transcript_text)
            VALUES (%s, %s::jsonb, %s)
            ON CONFLICT (session_id)
            DO UPDATE SET transcript_json = EXCLUDED.transcript_json, transcript_text = EXCLUDED.transcript_text
            """,
            (session_id, json.dumps(transcript_items), transcript_text),
        )
        conn.commit()


def get_course_topic_names(course_id: int, topic_id: int) -> tuple[str, str]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT name FROM courses WHERE id = %s", (course_id,))
        course = cur.fetchone()
        cur.execute("SELECT name FROM topics WHERE id = %s", (topic_id,))
        topic = cur.fetchone()
    return (course[0] if course else f"course-{course_id}", topic[0] if topic else f"topic-{topic_id}")


def get_topic_vocabulary(course_id: int, topic_id: int) -> list[str]:
    """Return STT hint keywords for a topic.

    Populated by the ingest script from the topic's ``keywords.txt`` file
    and stored in ``topics.stt_keywords``.  Returns an empty list if no
    keywords have been ingested yet.
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT stt_keywords FROM topics WHERE id = %s",
            (topic_id,),
        )
        row = cur.fetchone()

    if not row or not row[0]:
        return []
    # psycopg3 deserialises jsonb to a Python object automatically.
    value = row[0]
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if isinstance(value, str):
        return [str(v) for v in json.loads(value) if v]
    return []


def get_student_focus_context(student_id: str, enrolment_id: int | None) -> tuple[list[str], list[str]]:
    if not enrolment_id:
        return ([], [])

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT concept
            FROM repeat_flags
            WHERE student_id = %s AND enrolment_id = %s AND status = 'active'
            ORDER BY flagged_at DESC
            LIMIT 10
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
        snapshot_row = cur.fetchone()

    repeats = [str(row[0]) for row in repeat_rows if row and row[0]]
    focus: list[str] = []
    if snapshot_row and snapshot_row[0]:
        value = snapshot_row[0]
        if isinstance(value, list):
            focus = [str(v) for v in value if v]
        elif isinstance(value, str):
            focus = [str(v) for v in json.loads(value) if v]

    return (repeats, focus)
