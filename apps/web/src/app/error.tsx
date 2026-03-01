"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console (Sentry integration can be added here later)
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold text-slate-200">Something went wrong</h1>
      <p className="mt-4 text-sm text-slate-400">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-slate-600">Error ID: {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
      >
        Try again
      </button>
    </main>
  );
}
