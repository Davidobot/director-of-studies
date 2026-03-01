/**
 * Tests for calendar-sync adapter classes.
 */

import { describe, it, expect } from "vitest";
import { GoogleCalendarSync, AppleCalendarSync, CalDavSync } from "@/lib/calendar-sync";

describe("GoogleCalendarSync", () => {
  it("should require an access token", () => {
    const sync = new GoogleCalendarSync("fake-token");
    expect(sync.provider).toBe("google");
  });

  it("should call Google Calendar API on syncEvent", async () => {
    const sync = new GoogleCalendarSync("fake-token");

    // Mock fetch to simulate Google API response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("googleapis.com/calendar/v3");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toBeDefined();

      return new Response(JSON.stringify({ id: "google-event-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await sync.syncEvent({
        title: "Test Tutorial",
        startIso: "2025-01-15T10:00:00Z",
        durationMinutes: 30,
      });

      expect(result.externalCalendarId).toBe("google-event-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should update existing event when externalCalendarId provided", async () => {
    const sync = new GoogleCalendarSync("fake-token");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      return new Response(JSON.stringify({ id: "google-event-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await sync.syncEvent({
        title: "Updated Tutorial",
        startIso: "2025-01-15T10:00:00Z",
        durationMinutes: 45,
        externalCalendarId: "google-event-123",
      });

      expect(result.externalCalendarId).toBe("google-event-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should throw on API failure", async () => {
    const sync = new GoogleCalendarSync("fake-token");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response("Unauthorized", { status: 401 });
    };

    try {
      await expect(
        sync.syncEvent({
          title: "Test",
          startIso: "2025-01-15T10:00:00Z",
          durationMinutes: 30,
        }),
      ).rejects.toThrow("Google Calendar create failed: 401");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("AppleCalendarSync", () => {
  it("should throw not-implemented error", async () => {
    const sync = new AppleCalendarSync();
    await expect(
      sync.syncEvent({
        title: "Test",
        startIso: "2025-01-15T10:00:00Z",
        durationMinutes: 30,
      }),
    ).rejects.toThrow("not implemented");
  });
});

describe("CalDavSync", () => {
  it("should throw not-implemented error", async () => {
    const sync = new CalDavSync();
    await expect(
      sync.syncEvent({
        title: "Test",
        startIso: "2025-01-15T10:00:00Z",
        durationMinutes: 30,
      }),
    ).rejects.toThrow("not implemented");
  });
});
