"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type MenuItem = {
  label: string;
  href: string;
};

const STUDENT_ITEMS: MenuItem[] = [
  { label: "Personal settings", href: "/settings/profile" },
  { label: "Enrolment settings", href: "/onboarding/subjects" },
  { label: "Tutor settings", href: "/settings/tutors" },
];

const PARENT_ITEMS: MenuItem[] = [
  { label: "Personal settings", href: "/settings/profile" },
];

export function AccountMenu({
  displayName,
  accountType,
}: {
  displayName: string;
  accountType: "student" | "parent" | null;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = accountType === "parent" ? PARENT_ITEMS : STUDENT_ITEMS;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 font-medium text-sky-400 hover:text-sky-300 focus:outline-none"
      >
        {displayName}
        {/* chevron */}
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 10 6"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              {item.label}
            </Link>
          ))}
          <div className="my-1 border-t border-slate-700" />
          <button
            onClick={() => void signOut()}
            className="w-full px-4 py-2 text-left text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
