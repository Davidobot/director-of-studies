#!/bin/sh
set -eu

until nc -z postgres 5432; do
  echo "Waiting for postgres..."
  sleep 1
done

python scripts/ingest.py || true
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
