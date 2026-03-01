"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";

export function SignupForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<"student" | "parent">("student");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!tosAccepted) {
      setMessage("You must accept the Terms of Service to create an account.");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
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

      // If session is null, email confirmation is pending
      if (!data.session) {
        router.push(`/auth/confirm-email?email=${encodeURIComponent(email)}`);
        return;
      }

      // Session exists — mark ToS as accepted
      try {
        await apiFetch("/api/profile/terms-accept", { method: "PATCH" });
      } catch {
        // Non-blocking — will be enforced on session creation
      }

      router.push(`/onboarding?accountType=${accountType}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unexpected auth error";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">Create account</h2>

      <div>
        <label className="mb-1 block text-xs text-slate-400">Display name</label>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </div>

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

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={tosAccepted}
          onChange={(event) => setTosAccepted(event.target.checked)}
          className="mt-0.5 rounded border-slate-600"
          required
        />
        <span className="text-slate-300">
          I agree to the{" "}
          <Link href="/terms" className="text-sky-400 hover:text-sky-300" target="_blank">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-sky-400 hover:text-sky-300" target="_blank">
            Privacy Policy
          </Link>
        </span>
      </label>

      <button disabled={loading} className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-50">
        {loading ? "Please wait..." : "Create account"}
      </button>

      {message ? <p className="text-sm text-red-400">{message}</p> : null}
    </form>
  );
}
