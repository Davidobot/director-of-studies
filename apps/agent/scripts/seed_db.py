from __future__ import annotations

import datetime
import os

import psycopg

from scripts.pipeline.manifest import load_manifest

DATABASE_URL = os.environ.get("DATABASE_URL", "")

SUPERCURRICULAR_SUBJECTS = [
    ("Debating / Public Speaking", "Supercurricular", "supercurricular"),
    ("Metacognition", "Supercurricular", "supercurricular"),
    ("Oxbridge Admissions", "Supercurricular", "supercurricular"),
]


def main() -> None:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")

    boards, specs = load_manifest()

    subject_seeds: set[tuple[str, str, str]] = set(SUPERCURRICULAR_SUBJECTS)
    for spec in specs:
        subject_seeds.add((spec.subject, spec.level, spec.category))

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        for board in boards.values():
            cur.execute(
                """
                INSERT INTO exam_boards (code, name, country)
                VALUES (%s, %s, 'GB')
                ON CONFLICT (code) DO UPDATE
                SET name = EXCLUDED.name,
                    country = EXCLUDED.country
                """,
                (board.code, board.name),
            )

        for name, level, category in sorted(subject_seeds):
            cur.execute(
                """
                INSERT INTO subjects (name, level, category)
                VALUES (%s, %s, %s)
                ON CONFLICT (name, level, category) DO NOTHING
                """,
                (name, level, category),
            )

        for spec in specs:
            cur.execute(
                "SELECT id FROM subjects WHERE name = %s AND level = %s",
                (spec.subject, spec.level),
            )
            subject = cur.fetchone()
            if not subject:
                continue

            cur.execute("SELECT id FROM exam_boards WHERE code = %s", (spec.board.code,))
            board = cur.fetchone()
            if not board:
                continue
            board_id = board[0]

            cur.execute(
                """
                INSERT INTO board_subjects (exam_board_id, subject_id, syllabus_code)
                VALUES (%s, %s, %s)
                ON CONFLICT (exam_board_id, subject_id) DO UPDATE
                SET syllabus_code = EXCLUDED.syllabus_code
                """,
                (board_id, subject[0], spec.syllabus_code),
            )

        for spec in specs:
            cur.execute(
                "SELECT id FROM subjects WHERE name = %s AND level = %s",
                (spec.subject, spec.level),
            )
            subject = cur.fetchone()
            subject_id = subject[0] if subject else None

            cur.execute("SELECT id FROM exam_boards WHERE code = %s", (spec.board.code,))
            board = cur.fetchone()
            board_id = board[0] if board else None

            cur.execute(
                """
                INSERT INTO courses (name, subject_id, exam_board_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (name) DO UPDATE
                SET subject_id = EXCLUDED.subject_id,
                    exam_board_id = EXCLUDED.exam_board_id
                RETURNING id
                """,
                (spec.course_name, subject_id, board_id),
            )
            course_id = cur.fetchone()[0]

            for topic in spec.topics:
                cur.execute(
                    "SELECT id FROM topics WHERE course_id = %s AND name = %s",
                    (course_id, topic.name),
                )
                existing_topic = cur.fetchone()
                if existing_topic:
                    continue
                cur.execute(
                    "INSERT INTO topics (course_id, name, stt_keywords) VALUES (%s, %s, '[]'::jsonb)",
                    (course_id, topic.name),
                )

        conn.commit()

    print(f"Python seed complete ({datetime.datetime.now().isoformat()})")


if __name__ == "__main__":
    main()
