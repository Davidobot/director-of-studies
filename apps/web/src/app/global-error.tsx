"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        <div className="flex min-h-screen flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl font-bold text-slate-200">Something went wrong</h1>
          <p className="mt-4 text-sm text-slate-400">
            A critical error occurred. Please reload the page.
          </p>
          {error.digest ? (
            <p className="mt-2 text-xs text-slate-600">Error ID: {error.digest}</p>
          ) : null}
          <button
            onClick={reset}
            className="mt-6 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
