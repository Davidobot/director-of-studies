"""Tests for Terms of Service and consent gates in the API."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestTermsAccept:
    """PATCH /api/profile/terms-accept should set terms_accepted_at."""

    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        res = await client.patch("/api/profile/terms-accept")
        assert res.status_code == 401

    async def test_with_api_key_requires_user_id(self, client: AsyncClient, api_key: str) -> None:
        """Internal API key alone (no bearer) resolves to a user_id; without a real DB row we get an error but not 401."""
        res = await client.patch(
            "/api/profile/terms-accept",
            headers={"x-internal-api-key": api_key},
        )
        # The endpoint uses _validate_internal_api_key which returns user_id from bearer or the key itself
        # Without a real DB the update just does 0 rows — but should not be 401
        assert res.status_code in (200, 500)


@pytest.mark.asyncio
class TestConsentStatus:
    """GET /api/student/consent-status should return consent info."""

    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        res = await client.get("/api/student/consent-status", params={"studentId": "fake"})
        assert res.status_code == 401


@pytest.mark.asyncio
class TestSoftDelete:
    """DELETE /api/profile should soft-delete the profile."""

    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        res = await client.delete("/api/profile")
        assert res.status_code == 401

    async def test_with_api_key_succeeds_or_no_op(self, client: AsyncClient, api_key: str) -> None:
        res = await client.delete(
            "/api/profile",
            headers={"x-internal-api-key": api_key},
        )
        # With a valid key but no matching DB row, should still return ok or 500 (no row), not 401
        assert res.status_code in (200, 500)
