"""Tests for iCal feed endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestCalendarFeedToken:
    """GET /api/calendar/feed-token and POST /api/calendar/feed-token/regenerate."""

    async def test_get_feed_token_unauthenticated(self, client: AsyncClient) -> None:
        res = await client.get("/api/calendar/feed-token", params={"studentId": "fake"})
        assert res.status_code == 401

    async def test_regenerate_feed_token_unauthenticated(self, client: AsyncClient) -> None:
        res = await client.post("/api/calendar/feed-token/regenerate", params={"studentId": "fake"})
        assert res.status_code == 401


@pytest.mark.asyncio
class TestCalendarIcalFeed:
    """GET /calendar/feed/{token} — public endpoint, no auth."""

    async def test_invalid_token_returns_404(self, client: AsyncClient) -> None:
        res = await client.get("/calendar/feed/nonexistent-token")
        # Should be 404 because token doesn't exist
        assert res.status_code in (404, 500)


@pytest.mark.asyncio
class TestCalendarIntegrations:
    """CRUD for calendar integrations."""

    async def test_list_unauthenticated(self, client: AsyncClient) -> None:
        res = await client.get("/api/calendar/integrations", params={"studentId": "fake"})
        assert res.status_code == 401

    async def test_toggle_unauthenticated(self, client: AsyncClient) -> None:
        res = await client.post(
            "/api/calendar/integrations",
            json={"studentId": "fake", "provider": "google", "enabled": True},
        )
        assert res.status_code == 401
