import type { Metadata } from "next";
import "@livekit/components-styles";
import "./globals.css";

export const metadata: Metadata = {
  title: "Director of Studies",
  description: "Voice-first AI tutor for GCSE/A-level Humanities",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">
          <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-4">
            <h1 className="text-2xl font-semibold">Director of Studies</h1>
            <nav className="flex gap-4 text-sm">
              <a href="/">Home</a>
              <a href="/sessions">Session History</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
