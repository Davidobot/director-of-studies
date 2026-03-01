#!/bin/sh
set -eu

# Wait for Postgres to be reachable.
# Works for both local Docker (hostname "postgres") and remote Supabase.
MAX_RETRIES=30
RETRY=0
until python -c "import psycopg; psycopg.connect('$DATABASE_URL').close()" 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: Could not connect to Postgres after $MAX_RETRIES attempts."
    echo "       DATABASE_URL host may be unreachable."
    exit 1
  fi
  echo "Waiting for postgres (attempt $RETRY/$MAX_RETRIES)..."
  sleep 1
done

python scripts/bootstrap_db.py
python scripts/ingest.py || true
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
