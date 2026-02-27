from __future__ import annotations

import os

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "")

SCHEMA_SQL = [
    "CREATE EXTENSION IF NOT EXISTS vector",
    "CREATE EXTENSION IF NOT EXISTS pgcrypto",
    "DO $$ BEGIN CREATE TYPE account_type AS ENUM ('student','parent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE TYPE subject_category AS ENUM ('academic','supercurricular'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE TYPE repeat_priority AS ENUM ('high','medium','low'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE TYPE repeat_status AS ENUM ('active','resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE TYPE scheduled_status AS ENUM ('scheduled','completed','cancelled','missed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    """
    CREATE TABLE IF NOT EXISTS profiles (
      id uuid PRIMARY KEY,
      account_type account_type NOT NULL,
      display_name text NOT NULL,
      email text NOT NULL UNIQUE,
      country text NOT NULL DEFAULT 'GB',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS students (
      id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      date_of_birth date NOT NULL,
      school_year integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS parents (
      id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS parent_student_links (
      id serial PRIMARY KEY,
      parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      relationship text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(parent_id, student_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS exam_boards (
      id serial PRIMARY KEY,
      code text NOT NULL UNIQUE,
      name text NOT NULL,
      country text NOT NULL DEFAULT 'GB',
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS subjects (
      id serial PRIMARY KEY,
      name text NOT NULL,
      level text NOT NULL,
      category subject_category NOT NULL DEFAULT 'academic',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(name, level, category)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS board_subjects (
      id serial PRIMARY KEY,
      exam_board_id integer REFERENCES exam_boards(id) ON DELETE SET NULL,
      subject_id integer NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      syllabus_code text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(exam_board_id, subject_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS student_enrolments (
      id serial PRIMARY KEY,
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      board_subject_id integer NOT NULL REFERENCES board_subjects(id) ON DELETE CASCADE,
      exam_year integer NOT NULL,
      current_year_of_study integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, board_subject_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS courses (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      subject_id integer REFERENCES subjects(id) ON DELETE SET NULL,
      exam_board_id integer REFERENCES exam_boards(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS topics (
      id serial PRIMARY KEY,
      course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      name text NOT NULL,
      stt_keywords jsonb DEFAULT '[]'::jsonb
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid REFERENCES students(id) ON DELETE SET NULL,
      enrolment_id integer REFERENCES student_enrolments(id) ON DELETE SET NULL,
      course_id integer NOT NULL REFERENCES courses(id),
      topic_id integer NOT NULL REFERENCES topics(id),
      room_name text NOT NULL UNIQUE,
      participant_token text,
      status text NOT NULL DEFAULT 'pending',
      started_at timestamptz,
      ended_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutor_personas (
      id serial PRIMARY KEY,
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      name text NOT NULL,
      personality_prompt text NOT NULL DEFAULT 'Be warm, concise, and Socratic.',
      tts_voice_model text NOT NULL DEFAULT 'aura-2-draco-en',
      tts_speed text NOT NULL DEFAULT '1.0',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutor_configs (
      id serial PRIMARY KEY,
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrolment_id integer NOT NULL REFERENCES student_enrolments(id) ON DELETE CASCADE,
      persona_id integer REFERENCES tutor_personas(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, enrolment_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS progress_snapshots (
      id serial PRIMARY KEY,
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrolment_id integer NOT NULL REFERENCES student_enrolments(id) ON DELETE CASCADE,
      topic_id integer REFERENCES topics(id) ON DELETE SET NULL,
      confidence_score text NOT NULL DEFAULT '0',
      areas_of_strength jsonb NOT NULL DEFAULT '[]'::jsonb,
      areas_to_improve jsonb NOT NULL DEFAULT '[]'::jsonb,
      recommended_focus jsonb NOT NULL DEFAULT '[]'::jsonb,
      generated_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS repeat_flags (
      id serial PRIMARY KEY,
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrolment_id integer NOT NULL REFERENCES student_enrolments(id) ON DELETE CASCADE,
      topic_id integer REFERENCES topics(id) ON DELETE SET NULL,
      concept text NOT NULL,
      reason text NOT NULL,
      priority repeat_priority NOT NULL DEFAULT 'medium',
      status repeat_status NOT NULL DEFAULT 'active',
      parent_assigned integer NOT NULL DEFAULT 0,
      flagged_at timestamptz NOT NULL DEFAULT NOW(),
      resolved_at timestamptz
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS dos_chat_threads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS dos_chat_messages (
      id serial PRIMARY KEY,
      thread_id uuid NOT NULL REFERENCES dos_chat_threads(id) ON DELETE CASCADE,
      role text NOT NULL,
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS scheduled_tutorials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrolment_id integer REFERENCES student_enrolments(id) ON DELETE SET NULL,
      topic_id integer REFERENCES topics(id) ON DELETE SET NULL,
      title text NOT NULL,
      scheduled_at timestamptz NOT NULL,
      duration_minutes integer NOT NULL DEFAULT 30,
      recurrence_rule text,
      status scheduled_status NOT NULL DEFAULT 'scheduled',
      session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
      created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      sync_provider text,
      external_calendar_id text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS restrictions (
      id serial PRIMARY KEY,
      parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      max_daily_minutes integer,
      max_weekly_minutes integer,
      blocked_times jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(parent_id, student_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS student_invite_codes (
      id serial PRIMARY KEY,
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      code text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS session_transcripts (
      id serial PRIMARY KEY,
      session_id uuid NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
      transcript_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      transcript_text text NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS session_summaries (
      id serial PRIMARY KEY,
      session_id uuid NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
      summary_md text NOT NULL,
      key_takeaways_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      citations_json jsonb NOT NULL DEFAULT '[]'::jsonb
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS documents (
      id serial PRIMARY KEY,
      course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      topic_id integer NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      title text NOT NULL,
      source_path text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS chunks (
      id serial PRIMARY KEY,
      document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      topic_id integer NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      chunk_index integer NOT NULL,
      content text NOT NULL,
      embedding vector(1536) NOT NULL
    )
    """,
]


def main() -> None:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        for statement in SCHEMA_SQL:
            cur.execute(statement)
        conn.commit()

    print("DB bootstrap complete")


if __name__ == "__main__":
    main()
