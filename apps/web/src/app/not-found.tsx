import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <h1 className="text-6xl font-bold text-slate-200">404</h1>
      <p className="mt-4 text-lg text-slate-400">Page not found</p>
      <p className="mt-2 text-sm text-slate-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/"
          className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Go Home
        </Link>
      </div>
    </main>
  );
}
