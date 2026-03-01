"use client";

import Link from "next/link";

type PaywallModalProps = {
  open: boolean;
  reason?: string | null;
  onClose: () => void;
};

export function PaywallModal({ open, reason, onClose }: PaywallModalProps) {
  if (!open) return null;

  const message = reason === "quota_exceeded"
    ? "You have used your included tutorial allowance. Upgrade or buy credits to keep learning."
    : "This call is currently blocked by your plan limits. Upgrade to continue.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-white">Tutorial limit reached</h2>
        <p className="mt-2 text-sm text-slate-300">{message}</p>

        <div className="mt-4 rounded-md border border-slate-700 bg-slate-950 p-4 text-sm">
          <p className="font-medium text-slate-100">Available plans</p>
          <ul className="mt-2 space-y-1 text-slate-300">
            <li>Free: 1 hour included per account</li>
            <li>Monthly: £50 for 8 hours (£6.25/hour)</li>
            <li>School monthly: £50 for 10 hours (£5.00/hour)</li>
            <li>Annual: £500 for 8 hours/month (£5.21/hour)</li>
            <li>School annual: £500 for 10 hours/month (£4.17/hour)</li>
            <li>Packs: 1h £10, 2h £15, 10h £70</li>
          </ul>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/settings/billing"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            View billing options
          </Link>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
