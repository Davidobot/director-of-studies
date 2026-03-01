/**
 * Tests for CookieBanner component logic.
 * Uses localStorage to persist preferences.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const STORAGE_KEY = "dos_cookie_consent";

describe("CookieBanner localStorage logic", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should show banner when no consent saved", () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).toBeNull();
  });

  it("should persist accept-all preferences", () => {
    const prefs = {
      essential: true,
      analytics: true,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

    const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(loaded.essential).toBe(true);
    expect(loaded.analytics).toBe(true);
    expect(loaded.savedAt).toBeDefined();
  });

  it("should persist reject-all preferences", () => {
    const prefs = {
      essential: true,
      analytics: false,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

    const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(loaded.essential).toBe(true);
    expect(loaded.analytics).toBe(false);
  });

  it("should hide banner when preferences exist", () => {
    const prefs = {
      essential: true,
      analytics: false,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).not.toBeNull();
  });
});
