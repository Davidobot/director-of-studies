from __future__ import annotations

from typing import Any

from .db import embedding_for, get_conn


def retrieve_chunks(query: str, course_id: int, topic_id: int, k: int = 5) -> list[dict[str, Any]]:
    embedding = embedding_for(query)
    vector_literal = "[" + ",".join(str(x) for x in embedding) + "]"

    sql = """
    SELECT
      c.id AS chunk_id,
      d.title AS doc_title,
      c.content,
      d.source_path,
      1 - (c.embedding <=> %s::vector) AS similarity
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.course_id = %s AND c.topic_id = %s
    ORDER BY c.embedding <=> %s::vector
    LIMIT %s
    """

    with get_conn() as conn, conn.cursor() as cur:
      cur.execute(sql, (vector_literal, course_id, topic_id, vector_literal, k))
      rows = cur.fetchall()

    return [
        {
            "chunk_id": row[0],
            "doc_title": row[1],
            "content": row[2],
            "source_path": row[3],
            "similarity": float(row[4]) if row[4] is not None else 0.0,
        }
        for row in rows
    ]
