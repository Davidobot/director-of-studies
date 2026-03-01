"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  // Supabase automatically picks up the recovery token from the URL hash
  // and establishes a session when this page loads
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      } else if (event === "SIGNED_IN") {
        // Recovery session may fire SIGNED_IN instead on some Supabase versions
        setSessionReady(true);
      }
    });

    // Check if there's already a session (user may have followed the link)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true);
    });

    // If no session established within 5 seconds, the link may be expired
    const timeout = setTimeout(() => {
      setSessionReady((ready) => {
        if (!ready) setSessionError(true);
        return ready;
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        // Handle specific Supabase error codes
        if (error.message.includes("same_password")) {
          throw new Error("New password must be different from your current password.");
        }
        if (error.message.includes("expired") || error.message.includes("invalid")) {
          throw new Error("This reset link has expired. Please request a new one.");
        }
        throw error;
      }

      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to reset password. Please try again.";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  if (sessionError) {
    return (
      <main className="mx-auto max-w-md space-y-4">
        <div className="rounded-lg border border-red-800 bg-red-900/30 p-6 text-center">
          <h2 className="mb-3 text-xl font-semibold text-red-300">Link expired</h2>
          <p className="mb-4 text-sm text-slate-400">
            This password reset link has expired or is invalid. Please request a new one.
          </p>
          <Link
            href="/auth/forgot-password"
            className="inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Request new reset link
          </Link>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="mx-auto max-w-md space-y-4">
        <div className="rounded-lg border border-emerald-800 bg-emerald-900/30 p-6 text-center">
          <h2 className="mb-3 text-xl font-semibold text-emerald-300">Password updated</h2>
          <p className="text-sm text-slate-400">Your password has been reset. Redirecting to dashboard...</p>
        </div>
      </main>
    );
  }

  if (!sessionReady) {
    return (
      <main className="mx-auto max-w-md space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-sm text-slate-400">Verifying reset link...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-4">
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Set new password</h2>
        <p className="text-sm text-slate-400">Choose a new password for your account.</p>

        <div>
          <label className="mb-1 block text-xs text-slate-400">New password</label>
          <input
            type="password"
            minLength={8}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Confirm new password</label>
          <input
            type="password"
            minLength={8}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <button
          disabled={loading}
          className="w-full rounded-md bg-sky-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Updating..." : "Reset password"}
        </button>

        {message ? <p className="text-sm text-red-400">{message}</p> : null}
      </form>
    </main>
  );
}
