"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";

export default function DeleteAccountPage() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmation === "DELETE";

  async function handleDelete() {
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/profile", { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(data.detail ?? "Failed to delete account");
      }
      // Sign out from Supabase
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login?deleted=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="mb-4 text-2xl font-bold text-red-400">Delete your account</h1>

      <div className="rounded-lg border border-red-800 bg-red-950/40 p-6">
        <p className="mb-4 text-sm text-slate-200">
          This will permanently soft-delete your account. Your data will be
          retained for 30 days then purged automatically. During that window you
          can contact support to restore your account.
        </p>

        <ul className="mb-6 list-inside list-disc space-y-1 text-sm text-slate-300">
          <li>Your profile, sessions, and progress data will become inaccessible</li>
          <li>Active subscriptions will be cancelled</li>
          <li>Calendar integrations will stop syncing</li>
          <li>Parent/guardian links will be removed</li>
        </ul>

        <label className="mb-2 block text-sm font-medium text-slate-200">
          Type <span className="font-mono text-red-300">DELETE</span> to confirm
        </label>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="DELETE"
          className="mb-4 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono"
          autoComplete="off"
        />

        {error && (
          <p className="mb-3 text-sm text-red-300">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/settings/profile")}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={!confirmed || loading}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </main>
  );
}
