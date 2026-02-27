CREATE EXTENSION IF NOT EXISTS vector;

-- Safe migration: add STT keyword hints column to topics if not already present.
ALTER TABLE IF EXISTS topics ADD COLUMN IF NOT EXISTS stt_keywords jsonb DEFAULT '[]';
