"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";

type Props = {
  redirectTo?: string;
};

export function LoginForm({ redirectTo = "/" }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unexpected auth error";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function loginAsGuest() {
    setLoading(true);
    setMessage(null);

    try {
      const bootstrapRes = await apiFetch("/api/auth/guest-login", { method: "POST", requireAuth: false });
      const contentType = bootstrapRes.headers.get("content-type") ?? "";

      if (!bootstrapRes.ok) {
        if (contentType.includes("application/json")) {
          const body = (await bootstrapRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Could not initialize guest account");
        }

        const bodyText = await bootstrapRes.text().catch(() => "");
        throw new Error(bodyText.slice(0, 120) || "Could not initialize guest account");
      }

      if (!contentType.includes("application/json")) {
        throw new Error("Guest login endpoint returned an invalid response.");
      }

      const creds = (await bootstrapRes.json()) as { email: string; password: string };
      const { error } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });

      if (error) throw error;

      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unexpected auth error";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">Log in</h2>

      <div>
        <label className="mb-1 block text-xs text-slate-400">Email</label>
        <input
          type="email"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-400">Password</label>
        <input
          type="password"
          minLength={8}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <button disabled={loading} className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-50">
          {loading ? "Please wait..." : "Log in"}
        </button>
        <Link href="/auth/forgot-password" className="text-sm text-sky-400 hover:text-sky-300">
          Forgot your password?
        </Link>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => void loginAsGuest()}
        className="w-full rounded-md border border-slate-700 px-4 py-2 font-medium text-slate-200 disabled:opacity-50"
      >
        Log in as Guest
      </button>

      {message ? <p className="text-sm text-red-400">{message}</p> : null}
    </form>
  );
}
