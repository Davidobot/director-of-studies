from __future__ import annotations

import json
import os
from typing import Any

import psycopg
from openai import OpenAI

DATABASE_URL = os.environ.get("DATABASE_URL", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

openai_client = OpenAI(api_key=OPENAI_API_KEY)


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
