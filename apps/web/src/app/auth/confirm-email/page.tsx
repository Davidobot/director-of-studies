"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md space-y-4" />}>
      <ConfirmEmailContent />
    </Suspense>
  );
}

function ConfirmEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function resendConfirmation() {
    if (!email) {
      setMessage("No email address provided.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        // Handle rate limiting
        if (error.status === 429 || error.message.includes("rate")) {
          throw new Error("Too many requests. Please wait a few minutes before trying again.");
        }
        throw error;
      }

      setResent(true);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to resend. Please try again.";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-900/50 text-2xl">
          ✉️
        </div>
        <h2 className="mb-3 text-xl font-semibold">Check your inbox</h2>
        <p className="mb-4 text-sm text-slate-400">
          We&apos;ve sent a confirmation email to{" "}
          {email ? <span className="text-slate-200">{email}</span> : "your email address"}.
          Click the link in the email to verify your account.
        </p>

        <p className="mb-6 text-xs text-slate-500">
          Don&apos;t forget to check your spam or junk folder.
        </p>

        {resent ? (
          <p className="text-sm text-emerald-400">Confirmation email resent. Check your inbox.</p>
        ) : (
          <button
            type="button"
            onClick={() => void resendConfirmation()}
            disabled={loading}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Resend confirmation email"}
          </button>
        )}

        {message ? <p className="mt-3 text-sm text-red-400">{message}</p> : null}

        <p className="mt-6 text-sm text-slate-400">
          Wrong email?{" "}
          <Link href="/signup" className="text-sky-400 hover:text-sky-300">
            Sign up again
          </Link>
        </p>
      </div>
    </main>
  );
}
