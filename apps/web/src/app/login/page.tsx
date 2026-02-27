import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage({ searchParams }: { searchParams: { redirectTo?: string } }) {
  return (
    <main className="mx-auto max-w-md space-y-4">
      <AuthForm mode="login" redirectTo={searchParams.redirectTo ?? "/"} />
      <p className="text-sm text-slate-400">
        No account yet? <Link href="/signup" className="text-sky-400 hover:text-sky-300">Create one</Link>
      </p>
    </main>
  );
}
