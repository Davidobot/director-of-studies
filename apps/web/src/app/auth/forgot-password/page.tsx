"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;

      // Always show success to prevent email enumeration
      setSubmitted(true);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-md space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
          <h2 className="mb-3 text-xl font-semibold">Check your email</h2>
          <p className="mb-4 text-sm text-slate-400">
            If an account exists for <span className="text-slate-200">{email}</span>, we&apos;ve sent a password reset
            link. Please check your inbox and spam folder.
          </p>
          <Link href="/login" className="text-sm text-sky-400 hover:text-sky-300">
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-4">
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Reset your password</h2>
        <p className="text-sm text-slate-400">
          Enter the email address associated with your account and we&apos;ll send you a link to reset your password.
        </p>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Email</label>
          <input
            type="email"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <button
          disabled={loading}
          className="w-full rounded-md bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>

        {message ? <p className="text-sm text-red-400">{message}</p> : null}

        <p className="text-center text-sm text-slate-400">
          <Link href="/login" className="text-sky-400 hover:text-sky-300">
            Back to login
          </Link>
        </p>
      </form>
    </main>
  );
}
