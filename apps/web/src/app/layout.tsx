import type { Metadata } from "next";
import "@livekit/components-styles";
import "./globals.css";
import Link from "next/link";
import { getServerUser } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { getStudentContext } from "@/lib/student";

export const metadata: Metadata = {
  title: "Director of Studies",
  description: "Voice-first AI tutor for GCSE/A-level Humanities",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  const context = user ? await getStudentContext(user.id) : null;

  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">
          <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-4">
            <h1 className="text-2xl font-semibold">Director of Studies</h1>
            <nav className="flex gap-4 text-sm">
              {user ? (
                <>
                  <Link href="/">Home</Link>
                  {context?.accountType === "student" ? (
                    <>
                      <Link href="/dashboard">Dashboard</Link>
                      <Link href="/calendar">Calendar</Link>
                      <Link href="/sessions">Session History</Link>
                      <Link href="/settings/tutors">Tutors</Link>
                    </>
                  ) : null}
                  {context?.accountType === "parent" ? (
                    <>
                      <Link href="/parent/dashboard">Parent Dashboard</Link>
                      <Link href="/parent/settings">Parent Controls</Link>
                    </>
                  ) : null}
                  <Link href="/onboarding">Profile</Link>
                  <SignOutButton />
                </>
              ) : (
                <>
                  <Link href="/login">Log in</Link>
                  <Link href="/signup">Sign up</Link>
                </>
              )}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
