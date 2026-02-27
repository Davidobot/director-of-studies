#!/bin/sh
set -eu

until nc -z postgres 5432; do
  echo "Waiting for postgres..."
  sleep 1
done

npm run db:push
npm run db:seed
npm run dev -- --hostname 0.0.0.0 --port 3000
