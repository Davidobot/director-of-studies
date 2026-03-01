import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <main className="mx-auto max-w-md space-y-4">
      <LoginForm redirectTo={resolvedSearchParams.redirectTo ?? "/"} />
      <p className="text-sm text-slate-400">
        No account yet? <Link href="/signup" className="text-sky-400 hover:text-sky-300">Create one</Link>
      </p>
    </main>
  );
}
