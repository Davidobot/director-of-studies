-- This init script is only used by the local Docker Postgres container
-- (infra/docker-compose.infra.yml / docker-compose.yml).
-- For Supabase production, enable the vector extension via
-- Dashboard → Database → Extensions instead.

CREATE EXTENSION IF NOT EXISTS vector;

-- Safe migration: add STT keyword hints column to topics if not already present.
ALTER TABLE IF EXISTS topics ADD COLUMN IF NOT EXISTS stt_keywords jsonb DEFAULT '[]';
