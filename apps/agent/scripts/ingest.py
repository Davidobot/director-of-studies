from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg
from openai import OpenAI

from scripts.pipeline.manifest import enabled_specs

DATABASE_URL = os.environ.get("DATABASE_URL", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
CONTENT_ROOT = Path(os.environ.get("CONTENT_DIR", "/content"))

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


def _ingest_topic_dir(
    *,
    conn: psycopg.Connection,
    cur: psycopg.Cursor,
    topic_dir: Path,
    course_id: int,
    topic_id: int,
) -> None:
    for source_file in sorted(topic_dir.glob("*.md")) + sorted(topic_dir.glob("*.txt")):
        if source_file.name == "keywords.txt":
            continue

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

    keywords_file = topic_dir / "keywords.txt"
    if keywords_file.exists():
        raw_lines = keywords_file.read_text(encoding="utf-8").splitlines()
        keywords = [
            line.strip()
            for line in raw_lines
            if line.strip() and not line.startswith("#")
        ]
        if keywords:
            cur.execute(
                "UPDATE topics SET stt_keywords = %s::jsonb WHERE id = %s",
                (json.dumps(keywords), topic_id),
            )
            conn.commit()
            print(f"Seeded {len(keywords)} STT keywords for topic {topic_id}")


def _manifest_topic_dirs(
    cur: psycopg.Cursor,
) -> list[tuple[Path, int, int]]:
    mappings: list[tuple[Path, int, int]] = []
    try:
        specs = enabled_specs()
    except Exception as exc:
        print(f"Manifest not loaded; skipping manifest content mapping ({exc})")
        return mappings

    for spec in specs:
        cur.execute("SELECT id FROM courses WHERE name = %s", (spec.course_name,))
        course = cur.fetchone()
        if not course:
            print(f"Missing seeded course for manifest spec: {spec.course_name}")
            continue
        course_id = int(course[0])

        if not spec.content_base_dir.exists():
            continue

        for topic_dir in sorted(spec.content_base_dir.glob("*")):
            if not topic_dir.is_dir():
                continue
            topic_slug = topic_dir.name
            md_path = topic_dir / f"{topic_slug}.md"
            if not md_path.exists():
                continue

            topic_name = topic_slug.replace("-", " ").title()
            try:
                first_line = md_path.read_text(encoding="utf-8").splitlines()[0].strip()
                if first_line.startswith("# "):
                    title = first_line[2:]
                    topic_name = title.split("(", 1)[0].strip() or topic_name
            except Exception:
                pass

            cur.execute(
                "SELECT id FROM topics WHERE course_id = %s AND name = %s",
                (course_id, topic_name),
            )
            topic_row = cur.fetchone()
            if not topic_row:
                cur.execute(
                    "INSERT INTO topics (course_id, name, stt_keywords) VALUES (%s, %s, '[]'::jsonb) RETURNING id",
                    (course_id, topic_name),
                )
                topic_row = cur.fetchone()
                print(f"Created topic from content directory: {spec.course_name} / {topic_name}")

            mappings.append((topic_dir, course_id, int(topic_row[0])))

    return mappings


def ingest() -> None:
    if not DATABASE_URL or not OPENAI_API_KEY:
        print("Skipping ingestion: DATABASE_URL or OPENAI_API_KEY missing")
        return

    if not CONTENT_ROOT.exists():
        print("No /content directory mounted")
        return

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        processed_dirs: set[str] = set()

        for topic_dir, course_id, topic_id in _manifest_topic_dirs(cur):
            _ingest_topic_dir(
                conn=conn,
                cur=cur,
                topic_dir=topic_dir,
                course_id=course_id,
                topic_id=topic_id,
            )
            processed_dirs.add(str(topic_dir.resolve()))

        for course_dir in sorted(CONTENT_ROOT.glob("*")):
            if not course_dir.is_dir() or not course_dir.name.isdigit():
                continue
            course_id = int(course_dir.name)

            for topic_dir in sorted(course_dir.glob("*")):
                if not topic_dir.is_dir() or not topic_dir.name.isdigit():
                    continue
                if str(topic_dir.resolve()) in processed_dirs:
                    continue
                topic_id = int(topic_dir.name)
                _ingest_topic_dir(
                    conn=conn,
                    cur=cur,
                    topic_dir=topic_dir,
                    course_id=course_id,
                    topic_id=topic_id,
                )


if __name__ == "__main__":
    ingest()
