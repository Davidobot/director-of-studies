"""Shared test fixtures for the DOS agent API."""

from __future__ import annotations

import os
import pytest
from httpx import ASGITransport, AsyncClient

# Set required env vars before importing the app
os.environ.setdefault("LIVEKIT_URL", "ws://localhost:7880")
os.environ.setdefault("LIVEKIT_API_KEY", "test-key")
os.environ.setdefault("LIVEKIT_API_SECRET", "test-secret")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("DATABASE_URL", "postgresql://dos:dos@localhost:5432/dos")
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_fake")


@pytest.fixture
def api_key() -> str:
    return os.environ["INTERNAL_API_KEY"]


@pytest.fixture
async def client():
    """Async test client for the FastAPI app (no real server needed)."""
    from app.main import app  # noqa: E402

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
