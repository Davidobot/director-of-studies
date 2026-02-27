"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

type Props = {
  mode: Mode;
  redirectTo?: string;
};

export function AuthForm({ mode, redirectTo = "/" }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<"student" | "parent">("student");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              displayName,
              accountType,
            },
          },
        });

        if (error) throw error;

        router.push(`/onboarding?accountType=${accountType}`);
        return;
      }

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

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">{mode === "login" ? "Log in" : "Create account"}</h2>

      {mode === "signup" && (
        <div>
          <label className="mb-1 block text-xs text-slate-400">Display name</label>
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </div>
      )}

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

      {mode === "signup" && (
        <div>
          <label className="mb-1 block text-xs text-slate-400">Account type</label>
          <select
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={accountType}
            onChange={(event) => setAccountType(event.target.value as "student" | "parent")}
          >
            <option value="student">Student</option>
            <option value="parent">Parent / Guardian</option>
          </select>
        </div>
      )}

      <button disabled={loading} className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-50">
        {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
      </button>

      {message ? <p className="text-sm text-red-400">{message}</p> : null}
    </form>
  );
}
