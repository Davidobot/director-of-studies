"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "dos_cookie_consent";

interface CookiePreferences {
  essential: true; // always true
  analytics: boolean;
  savedAt: string;
}

function getSavedPrefs(): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CookiePreferences;
  } catch {
    return null;
  }
}

function savePrefs(prefs: CookiePreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const prefs = getSavedPrefs();
    if (!prefs) {
      setVisible(true);
    }
  }, []);

  function acceptAll() {
    const prefs: CookiePreferences = {
      essential: true,
      analytics: true,
      savedAt: new Date().toISOString(),
    };
    savePrefs(prefs);
    setVisible(false);
  }

  function acceptSelected() {
    const prefs: CookiePreferences = {
      essential: true,
      analytics,
      savedAt: new Date().toISOString(),
    };
    savePrefs(prefs);
    setVisible(false);
  }

  function rejectAll() {
    const prefs: CookiePreferences = {
      essential: true,
      analytics: false,
      savedAt: new Date().toISOString(),
    };
    savePrefs(prefs);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-slate-900 px-4 py-4 shadow-lg sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-200">
              We use cookies to keep you signed in and improve Director of
              Studies.{" "}
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="underline hover:text-white"
              >
                {showDetails ? "Hide details" : "Manage preferences"}
              </button>
            </p>

            {showDetails && (
              <div className="mt-3 space-y-2 text-sm">
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="accent-sky-500"
                  />
                  <span>
                    <strong>Essential</strong> — authentication, security,
                    basic functionality. Always on.
                  </span>
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                    className="accent-sky-500"
                  />
                  <span>
                    <strong>Analytics</strong> — anonymous usage data to help us
                    improve the product.
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={rejectAll}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              Reject all
            </button>
            {showDetails && (
              <button
                onClick={acceptSelected}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                Save preferences
              </button>
            )}
            <button
              onClick={acceptAll}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
