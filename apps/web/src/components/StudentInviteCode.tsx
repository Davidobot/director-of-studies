"use client";

import { useState } from "react";

export function StudentInviteCode() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/student/invite-code");
      if (!res.ok) throw new Error("Failed to create invite code");
      const data = (await res.json()) as { code: string; expiresAt: string };
      setCode(data.code);
      setExpiresAt(data.expiresAt);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-2 text-lg font-semibold">Parent link invite code</h3>
      <p className="text-sm text-slate-300">Generate a one-time code to let a parent/guardian link to your account.</p>
      <button className="mt-3 rounded-md border border-slate-700 px-3 py-2 text-sm" disabled={loading} onClick={() => void generate()}>
        {loading ? "Generating..." : "Generate code"}
      </button>
      {code ? <p className="mt-2 text-sm">Code: <span className="font-mono text-sky-300">{code}</span></p> : null}
      {expiresAt ? <p className="text-xs text-slate-400">Expires: {new Date(expiresAt).toLocaleString()}</p> : null}
      {message ? <p className="text-sm text-red-300">{message}</p> : null}
    </section>
  );
}
