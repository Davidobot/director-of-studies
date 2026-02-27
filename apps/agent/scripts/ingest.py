from __future__ import annotations

import os
from pathlib import Path

import psycopg
from openai import OpenAI

DATABASE_URL = os.environ.get("DATABASE_URL", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
CONTENT_ROOT = Path("/content")

openai_client = OpenAI(api_key=OPENAI_API_KEY)


def chunk_text(text: str, size: int = 900, overlap: int = 150) -> list[str]:
    cleaned = "\n".join([line.strip() for line in text.splitlines() if line.strip()])
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + size)
        chunks.append(cleaned[start:end])
        if end == len(cleaned):
            break
        start = max(0, end - overlap)
    return chunks


def embed_many(inputs: list[str]) -> list[list[float]]:
    response = openai_client.embeddings.create(model="text-embedding-3-small", input=inputs)
    return [item.embedding for item in response.data]


def ingest() -> None:
    if not DATABASE_URL or not OPENAI_API_KEY:
        print("Skipping ingestion: DATABASE_URL or OPENAI_API_KEY missing")
        return

    if not CONTENT_ROOT.exists():
        print("No /content directory mounted")
        return

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        for course_dir in sorted(CONTENT_ROOT.glob("*")):
            if not course_dir.is_dir() or not course_dir.name.isdigit():
                continue
            course_id = int(course_dir.name)

            for topic_dir in sorted(course_dir.glob("*")):
                if not topic_dir.is_dir() or not topic_dir.name.isdigit():
                    continue
                topic_id = int(topic_dir.name)

                for source_file in sorted(topic_dir.glob("*.md")) + sorted(topic_dir.glob("*.txt")):
                    source_path = str(source_file)
                    title = source_file.stem.replace("-", " ").title()

                    cur.execute("SELECT id FROM documents WHERE source_path = %s", (source_path,))
                    existing = cur.fetchone()
                    if existing:
                        print(f"Skipping existing document: {source_path}")
                        continue

                    content = source_file.read_text(encoding="utf-8")
                    chunks = chunk_text(content)
                    embeddings = embed_many(chunks)

                    cur.execute(
                        """
                        INSERT INTO documents (course_id, topic_id, title, source_path)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id
                        """,
                        (course_id, topic_id, title, source_path),
                    )
                    doc_id = cur.fetchone()[0]

                    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                        vector_literal = "[" + ",".join(str(x) for x in embedding) + "]"
                        cur.execute(
                            """
                            INSERT INTO chunks (document_id, course_id, topic_id, chunk_index, content, embedding)
                            VALUES (%s, %s, %s, %s, %s, %s::vector)
                            """,
                            (doc_id, course_id, topic_id, idx, chunk, vector_literal),
                        )

                    conn.commit()
                    print(f"Ingested {source_path} ({len(chunks)} chunks)")


if __name__ == "__main__":
    ingest()
