# ---------------------------------------------------------------------------
# Director of Studies — local dev shortcuts
#
# One-command dev (recommended):
#   make local        — infra in Docker + Next.js HMR + uvicorn --reload
#                       Uses overmind if installed (brew install overmind),
#                       otherwise falls back to shell background jobs.
#
# Split-terminal workflow:
#   make infra        — Postgres + LiveKit in Docker
#   make web          — Next.js with HMR  (http://localhost:3000)
#   make agent        — FastAPI + uvicorn --reload  (:8000)
#
# Full Docker stack (original, no hot-reload):
#   make up / make down / make logs
# ---------------------------------------------------------------------------

-include .env
export

# When running natively the Docker container hostnames aren't reachable;
# override just those three URLs to point at localhost instead.
NATIVE_DATABASE_URL = postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/$(POSTGRES_DB)
NATIVE_LIVEKIT_URL  = ws://localhost:7880
NATIVE_AGENT_URL    = http://localhost:8000

# Virtualenv for the agent. Lives inside apps/agent so it is self-contained.
# livekit-agents 1.4.x requires Python 3.11 or 3.12 — NOT 3.13/3.14.
AGENT_VENV  = apps/agent/.venv
AGENT_PY    = $(AGENT_VENV)/bin/python
AGENT_UV    = $(AGENT_VENV)/bin/uvicorn

# ---------------------------------------------------------------------------
# Python virtualenv setup for the agent (run once after cloning)
# ---------------------------------------------------------------------------
# Requires Python 3.11 or 3.12.  3.13+ is NOT supported by livekit-agents 1.4.x.
.PHONY: venv
venv:
	@if command -v python3.11 >/dev/null 2>&1; then \
	  PY=python3.11; \
	elif command -v python3.12 >/dev/null 2>&1; then \
	  PY=python3.12; \
	else \
	  echo "Error: python3.11 or python3.12 required (livekit-agents 1.4.x does not support 3.13+)"; exit 1; \
	fi; \
	echo "Creating venv with $$PY at $(AGENT_VENV)"; \
	$$PY -m venv $(AGENT_VENV)
	$(AGENT_PY) -m pip install --upgrade pip
	$(AGENT_PY) -m pip install -r apps/agent/requirements.txt
	$(AGENT_PY) -m pip install -e apps/agent
	@echo "Venv ready. Run 'make agent' to start the agent."

# ---------------------------------------------------------------------------
# Infrastructure only (Postgres + LiveKit)
# ---------------------------------------------------------------------------
.PHONY: infra
infra:
	docker compose -f infra/docker-compose.infra.yml up --remove-orphans

.PHONY: infra-down
infra-down:
	docker compose -f infra/docker-compose.infra.yml down

# ---------------------------------------------------------------------------
# Native web (Next.js HMR)
# ---------------------------------------------------------------------------
.PHONY: web
web:
	cd apps/web && \
	  PORT=3000 \
	  DATABASE_URL="$(NATIVE_DATABASE_URL)" \
	  LIVEKIT_URL="$(NATIVE_LIVEKIT_URL)" \
	  AGENT_URL="$(NATIVE_AGENT_URL)" \
	  NEXT_PUBLIC_API_URL="$(NATIVE_AGENT_URL)" \
	  npm run dev

# ---------------------------------------------------------------------------
# Native agent (uvicorn --reload)
# ---------------------------------------------------------------------------
.PHONY: agent
agent:
	@test -f $(AGENT_UV) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	cd apps/agent && \
	  DATABASE_URL="$(NATIVE_DATABASE_URL)" \
	  LIVEKIT_URL="$(NATIVE_LIVEKIT_URL)" \
	  CONTENT_DIR="$(PWD)/content" \
	  $(PWD)/$(AGENT_UV) app.main:app --host 0.0.0.0 --port 8000 --reload

# Run the content ingestion script natively (once, or after new content added).
.PHONY: ingest
ingest:
	@test -f $(AGENT_PY) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	cd apps/agent && \
	  DATABASE_URL="$(NATIVE_DATABASE_URL)" \
	  CONTENT_DIR="$(PWD)/content" \
	  $(PWD)/$(AGENT_PY) scripts/ingest.py

.PHONY: download
download:
	@test -f $(AGENT_PY) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	cd apps/agent && \
	  CONTENT_DIR="$(PWD)/content" \
	  $(PWD)/$(AGENT_PY) -m scripts.pipeline.download_specs

.PHONY: extract
extract:
	@test -f $(AGENT_PY) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	cd apps/agent && \
	  CONTENT_DIR="$(PWD)/content" \
	  $(PWD)/$(AGENT_PY) -m scripts.pipeline.extract_specs

.PHONY: beautify
beautify:
	@test -f $(AGENT_PY) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	cd apps/agent && \
	  CONTENT_DIR="$(PWD)/content" \
	  CONTENT_PIPELINE_OPENAI_MODEL="$${CONTENT_PIPELINE_OPENAI_MODEL:-gpt-5-mini}" \
	  $(PWD)/$(AGENT_PY) -m scripts.pipeline.beautify_specs

.PHONY: discover-topics
discover-topics:
	@test -f $(AGENT_PY) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	cd apps/agent && \
	  CONTENT_DIR="$(PWD)/content" \
	  CONTENT_PIPELINE_OPENAI_MODEL="$${CONTENT_PIPELINE_OPENAI_MODEL:-gpt-5-mini}" \
	  $(PWD)/$(AGENT_PY) -m scripts.pipeline.discover_topics

.PHONY: keywords
keywords:
	@test -f $(AGENT_PY) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	cd apps/agent && \
	  CONTENT_DIR="$(PWD)/content" \
	  CONTENT_PIPELINE_OPENAI_MODEL="$${CONTENT_PIPELINE_OPENAI_MODEL:-gpt-5-mini}" \
	  $(PWD)/$(AGENT_PY) -m scripts.pipeline.keywords_specs

.PHONY: content-pipeline
content-pipeline: download extract discover-topics beautify keywords
	@echo "Content pipeline complete."

# Apply incremental DB schema changes to a running Postgres instance.
# Safe to run multiple times — all statements use IF NOT EXISTS / IF EXISTS guards.
.PHONY: db-migrate
db-migrate:
	@test -f $(AGENT_PY) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	cd apps/agent && DATABASE_URL="$(NATIVE_DATABASE_URL)" $(PWD)/$(AGENT_PY) scripts/bootstrap_db.py
	@echo "Python DB bootstrap/migration applied."

# Seed reference data (exam boards, subjects, board-subjects) and course/topic data.
# Run once after 'make infra' has started Postgres, or any time you reset the DB.
.PHONY: seed
seed:
	@test -f $(AGENT_PY) || (echo "Run 'make venv' first to set up the Python environment."; exit 1)
	@echo "Bootstrapping schema from Python..."
	cd apps/agent && DATABASE_URL="$(NATIVE_DATABASE_URL)" $(PWD)/$(AGENT_PY) scripts/bootstrap_db.py
	@echo "Seeding reference + course data from Python..."
	cd apps/agent && DATABASE_URL="$(NATIVE_DATABASE_URL)" $(PWD)/$(AGENT_PY) scripts/seed_db.py
	@echo "Seed complete."

# ---------------------------------------------------------------------------
# Single-command local dev  (all three processes in one terminal)
# ---------------------------------------------------------------------------
# Uses overmind (recommended) if installed:  brew install overmind
# Falls back to plain shell background jobs if overmind is not found.
.PHONY: local
local:
	@echo "Stopping any full-stack app containers (dos-web, dos-agent) if running..."
	@docker stop dos-web dos-agent 2>/dev/null || true
	@if command -v overmind >/dev/null 2>&1; then \
	  echo "Starting with overmind (Ctrl-C or 'overmind stop' to quit)..."; \
	  overmind start; \
	else \
	  echo "overmind not found — running inline (install with: brew install overmind)"; \
	  docker compose -f infra/docker-compose.infra.yml up -d --remove-orphans; \
	  echo "Waiting for Postgres..."; \
	  until docker exec dos-postgres pg_isready -U "$(POSTGRES_USER)" -d "$(POSTGRES_DB)" >/dev/null 2>&1; do sleep 1; done; \
	  echo "Infrastructure ready. Starting web + agent. Press Ctrl-C to stop both."; \
	  trap 'kill 0' INT; \
	  ( cd apps/web && \
	      DATABASE_URL="$(NATIVE_DATABASE_URL)" \
	      LIVEKIT_URL="$(NATIVE_LIVEKIT_URL)" \
	      AGENT_URL="$(NATIVE_AGENT_URL)" \
	      NEXT_PUBLIC_API_URL="$(NATIVE_AGENT_URL)" \
	      npm run dev 2>&1 | sed 's/^/\033[36m[web]  \033[0m /' \
	  ) & \
	  ( cd apps/agent && \
	      DATABASE_URL="$(NATIVE_DATABASE_URL)" \
	      LIVEKIT_URL="$(NATIVE_LIVEKIT_URL)" \
	      CONTENT_DIR="$(PWD)/content" \
	      uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | sed 's/^/\033[33m[agent]\033[0m /' \
	  ) & \
	  wait; \
	fi

# ---------------------------------------------------------------------------
# Full Docker stack (original behaviour)
# ---------------------------------------------------------------------------
.PHONY: up
up:
	docker compose -f infra/docker-compose.yml up --build

.PHONY: down
down:
	docker compose -f infra/docker-compose.yml down

.PHONY: logs
logs:
	docker compose -f infra/docker-compose.yml logs -f
