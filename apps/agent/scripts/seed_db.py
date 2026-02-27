from __future__ import annotations

import datetime
import os

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "")

BOARD_SEEDS = [
    ("AQA", "Assessment and Qualifications Alliance"),
    ("EDEXCEL", "Pearson Edexcel"),
    ("OCR", "Oxford Cambridge and RSA"),
    ("WJEC", "WJEC / Eduqas"),
    ("SQA", "Scottish Qualifications Authority"),
    ("CCEA", "Council for the Curriculum, Examinations and Assessment"),
    ("CIE", "Cambridge International"),
]

SUBJECT_SEEDS = [
    ("History", "GCSE", "academic"),
    ("History", "A-level", "academic"),
    ("English Literature", "GCSE", "academic"),
    ("English Literature", "A-level", "academic"),
    ("English Language", "GCSE", "academic"),
    ("Geography", "GCSE", "academic"),
    ("Religious Studies", "GCSE", "academic"),
    ("Debating / Public Speaking", "Supercurricular", "supercurricular"),
    ("Metacognition", "Supercurricular", "supercurricular"),
    ("Oxbridge Admissions", "Supercurricular", "supercurricular"),
]

BOARD_SUBJECT_SEEDS = [
    ("AQA", "History", "GCSE", "8145"),
    ("AQA", "History", "A-level", "7042"),
    ("AQA", "English Literature", "GCSE", "8702"),
    ("AQA", "English Literature", "A-level", "7712"),
    (None, "Debating / Public Speaking", "Supercurricular", None),
    (None, "Metacognition", "Supercurricular", None),
    (None, "Oxbridge Admissions", "Supercurricular", None),
]

COURSE_SEEDS = [
    (1, "GCSE History (AQA)", "History", "GCSE", "AQA", [(1, "Medicine Through Time"), (2, "Elizabethan England")]),
    (2, "A-level History (AQA)", "History", "A-level", "AQA", [(3, "The Tudors"), (4, "Russia 1917-1991")]),
    (3, "GCSE English Lit (AQA)", "English Literature", "GCSE", "AQA", [(5, "Macbeth"), (6, "An Inspector Calls")]),
]


def main() -> None:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        for code, name in BOARD_SEEDS:
            cur.execute(
                """
                INSERT INTO exam_boards (code, name, country)
                VALUES (%s, %s, 'GB')
                ON CONFLICT (code) DO NOTHING
                """,
                (code, name),
            )

        for name, level, category in SUBJECT_SEEDS:
            cur.execute(
                """
                INSERT INTO subjects (name, level, category)
                VALUES (%s, %s, %s)
                ON CONFLICT (name, level, category) DO NOTHING
                """,
                (name, level, category),
            )

        for board_code, subject_name, level, syllabus_code in BOARD_SUBJECT_SEEDS:
            cur.execute(
                "SELECT id FROM subjects WHERE name = %s AND level = %s",
                (subject_name, level),
            )
            subject = cur.fetchone()
            if not subject:
                continue

            board_id = None
            if board_code is not None:
                cur.execute("SELECT id FROM exam_boards WHERE code = %s", (board_code,))
                board = cur.fetchone()
                if not board:
                    continue
                board_id = board[0]

            cur.execute(
                """
                INSERT INTO board_subjects (exam_board_id, subject_id, syllabus_code)
                VALUES (%s, %s, %s)
                ON CONFLICT (exam_board_id, subject_id) DO NOTHING
                """,
                (board_id, subject[0], syllabus_code),
            )

        for course_id, course_name, subject_name, level, board_code, topics in COURSE_SEEDS:
            cur.execute("SELECT id FROM subjects WHERE name = %s AND level = %s", (subject_name, level))
            subject = cur.fetchone()
            subject_id = subject[0] if subject else None

            cur.execute("SELECT id FROM exam_boards WHERE code = %s", (board_code,))
            board = cur.fetchone()
            board_id = board[0] if board else None

            cur.execute("SELECT id FROM courses WHERE id = %s", (course_id,))
            if cur.fetchone():
                cur.execute(
                    "UPDATE courses SET subject_id = %s, exam_board_id = %s WHERE id = %s",
                    (subject_id, board_id, course_id),
                )
            else:
                cur.execute(
                    "INSERT INTO courses (id, name, subject_id, exam_board_id) VALUES (%s, %s, %s, %s)",
                    (course_id, course_name, subject_id, board_id),
                )

            for topic_id, topic_name in topics:
                cur.execute("SELECT id FROM topics WHERE id = %s", (topic_id,))
                if not cur.fetchone():
                    cur.execute(
                        "INSERT INTO topics (id, course_id, name, stt_keywords) VALUES (%s, %s, %s, '[]'::jsonb)",
                        (topic_id, course_id, topic_name),
                    )

        conn.commit()

    print(f"Python seed complete ({datetime.datetime.now().isoformat()})")


if __name__ == "__main__":
    main()
