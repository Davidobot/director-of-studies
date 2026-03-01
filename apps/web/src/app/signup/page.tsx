import Link from "next/link";
import { Suspense } from "react";
import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md space-y-4">
      <Suspense fallback={<div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Loading...</div>}>
        <SignupForm />
      </Suspense>
      <p className="text-sm text-slate-400">
        Already have an account? <Link href="/login" className="text-sky-400 hover:text-sky-300">Log in</Link>
      </p>
    </main>
  );
}
