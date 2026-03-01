import type { Metadata } from "next";
import "@livekit/components-styles";
import "./globals.css";
import Link from "next/link";
import { getServerUser } from "@/lib/supabase/server";
import { AccountMenu } from "@/components/AccountMenu";
import { getStudentContext } from "@/lib/student";
import { ToSBanner } from "@/components/ToSBanner";
import { CookieBanner } from "@/components/CookieBanner";

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
            <Link href="/" className="text-2xl font-semibold hover:text-sky-400 transition-colors">
              Director of Studies
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {user ? (
                <>
                  {context?.accountType === "student" ? (
                    <>
                      <Link href="/dashboard">Dashboard</Link>
                      <Link href="/calendar">Calendar</Link>
                      <Link href="/sessions">Session History</Link>
                    </>
                  ) : null}
                  {context?.accountType === "parent" ? (
                    <>
                      <Link href="/parent/dashboard">Parent Dashboard</Link>
                      <Link href="/parent/settings">Parent Controls</Link>
                    </>
                  ) : null}
                  <AccountMenu
                    displayName={context?.displayName ?? user.email ?? "Account"}
                    accountType={context?.accountType ?? null}
                  />
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

        {/* Footer */}
        <footer className="mx-auto max-w-5xl border-t border-slate-800 px-4 py-6">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="space-y-0.5">
              <span>&copy; {new Date().getFullYear()} Director of Studies</span>
              <p className="text-slate-600">studysesh ltd. &bull; Company No. 16860469 &bull; Registered in England and Wales</p>
            </div>
            <div className="flex gap-4">
              <Link href="/terms" className="hover:text-slate-300">Terms of Service</Link>
              <Link href="/privacy" className="hover:text-slate-300">Privacy Policy</Link>
            </div>
          </div>
        </footer>

        {/* ToS acceptance banner — shown for authenticated users who haven't accepted */}
        {user && context && !context.termsAcceptedAt ? <ToSBanner /> : null}

        {/* Cookie consent banner */}
        <CookieBanner />
      </body>
    </html>
  );
}
