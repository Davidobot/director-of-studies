import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md space-y-4">
      <AuthForm mode="signup" />
      <p className="text-sm text-slate-400">
        Already have an account? <Link href="/login" className="text-sky-400 hover:text-sky-300">Log in</Link>
      </p>
    </main>
  );
}
