"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

export function ToSBanner({ onAccepted }: { onAccepted?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function acceptTerms() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await apiFetch("/api/profile/terms-accept", { method: "PATCH" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? "Failed to accept terms");
      }
      // Refresh the page to clear the banner
      if (onAccepted) {
        onAccepted();
      } else {
        window.location.reload();
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <h2 className="mb-3 text-xl font-semibold">Terms of Service</h2>
        <p className="mb-4 text-sm text-slate-400">
          To continue using Director of Studies, you must accept our Terms of Service and Privacy Policy.
          Please review them before proceeding.
        </p>
        <div className="mb-4 flex gap-4 text-sm">
          <Link href="/terms" className="text-sky-400 hover:text-sky-300" target="_blank">
            Terms of Service →
          </Link>
          <Link href="/privacy" className="text-sky-400 hover:text-sky-300" target="_blank">
            Privacy Policy →
          </Link>
        </div>
        <button
          onClick={() => void acceptTerms()}
          disabled={loading}
          className="w-full rounded-md bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? "Accepting..." : "I accept the Terms of Service and Privacy Policy"}
        </button>
        {message ? <p className="mt-3 text-sm text-red-400">{message}</p> : null}
      </div>
    </div>
  );
}
