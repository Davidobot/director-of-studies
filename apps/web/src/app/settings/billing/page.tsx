"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { PricingTable } from "@/components/PricingTable";

type Plan = {
  id: number;
  name: string;
  planType: "free" | "subscription" | "credit_pack";
  stripePriceId: string | null;
  monthlyMinutes: number | null;
  creditMinutes: number | null;
  pricePence: number;
  priceGbp: string;
  interval: string | null;
  isSchoolPlan: boolean;
  pricePerHourGbp: string | null;
};

type SubscriptionPayload = {
  id: number;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: {
    id: number | null;
    name: string | null;
    monthlyMinutes: number | null;
    pricePence: number | null;
    interval: string | null;
    isSchoolPlan: boolean;
  };
  usedMinutesThisPeriod: number;
  remainingMinutesThisPeriod: number;
};

type BillingSummaryResponse = {
  subscription: SubscriptionPayload | null;
  creditsRemainingMinutes: number;
  freeMinutesRemaining: number;
  schoolEmailEligible: boolean;
};

export const dynamic = "force-dynamic";

function minutesToHours(minutes: number) {
  return (minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1);
}

export default function BillingSettingsPage() {
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [customCode, setCustomCode] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState("");
  const [customCodeSaving, setCustomCodeSaving] = useState(false);
  const [customCodeMsg, setCustomCodeMsg] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, plansRes, referralRes] = await Promise.all([
        apiFetch("/billing/subscription"),
        apiFetch("/billing/plans"),
        apiFetch("/billing/referral-code"),
      ]);

      if (!summaryRes.ok) throw new Error("Could not load billing summary");
      if (!plansRes.ok) throw new Error("Could not load plans");
      if (!referralRes.ok) throw new Error("Could not load referral code");

      const summaryBody = (await summaryRes.json()) as BillingSummaryResponse;
      const plansBody = (await plansRes.json()) as { plans: Plan[] };
      const referralBody = (await referralRes.json()) as { referralCode: string; customCode: string | null };

      setSummary(summaryBody);
      setPlans(plansBody.plans ?? []);
      setReferralCode(referralBody.referralCode ?? null);
      setCustomCode(referralBody.customCode ?? null);
      if (referralBody.customCode) setCustomCodeInput(referralBody.customCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const usage = useMemo(() => {
    if (!summary?.subscription?.plan?.monthlyMinutes) {
      return { used: 0, total: 0, percent: 0 };
    }

    const used = summary.subscription.usedMinutesThisPeriod;
    const total = summary.subscription.plan.monthlyMinutes;
    const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return { used, total, percent };
  }, [summary]);

  async function openPortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/billing/portal-session", {
        method: "POST",
        body: {
          returnUrl: `${window.location.origin}/settings/billing`,
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail || "Could not open billing portal");
      }
      const body = (await res.json()) as { portalUrl: string };
      if (!body.portalUrl) throw new Error("Portal URL missing");
      window.location.href = body.portalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open portal");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>

      {error ? (
        <p className="rounded-md border border-red-700 bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>
      ) : null}

      {loading || !summary ? (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
          Loading billing details...
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-base font-semibold">Current plan</h2>
            {summary.subscription ? (
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <p>
                  <span className="text-slate-400">Plan:</span>{" "}
                  <span className="font-medium text-slate-100">{summary.subscription.plan.name ?? "Active subscription"}</span>
                </p>
                <p>
                  <span className="text-slate-400">Status:</span> {summary.subscription.status}
                </p>
                <p>
                  <span className="text-slate-400">Next billing date:</span>{" "}
                  {summary.subscription.currentPeriodEnd ? new Date(summary.subscription.currentPeriodEnd).toLocaleDateString() : "-"}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-300">No active subscription.</p>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-slate-700 bg-slate-950 p-3 text-sm">
                <p className="text-slate-400">Free minutes remaining</p>
                <p className="text-lg font-semibold text-slate-100">{summary.freeMinutesRemaining}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950 p-3 text-sm">
                <p className="text-slate-400">Credits remaining</p>
                <p className="text-lg font-semibold text-slate-100">
                  {summary.creditsRemainingMinutes} min ({minutesToHours(summary.creditsRemainingMinutes)}h)
                </p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950 p-3 text-sm">
                <p className="text-slate-400">School email offer</p>
                <p className="text-lg font-semibold text-slate-100">{summary.schoolEmailEligible ? "Eligible" : "Not eligible"}</p>
              </div>
            </div>

            {summary.subscription?.plan?.monthlyMinutes ? (
              <div className="mt-5">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                  <span>Usage this billing period</span>
                  <span>{usage.used} / {usage.total} min</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-sky-500"
                    style={{ width: `${usage.percent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <button
                onClick={() => void openPortal()}
                disabled={portalLoading}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-50"
              >
                {portalLoading ? "Opening portal..." : "Manage subscription"}
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-base font-semibold">Referral programme</h2>
            <p className="mt-2 text-sm text-slate-300">
              Refer a parent/student and you each get 5 free hours when they buy a subscription.
            </p>

            <div className="mt-3 space-y-3">
              {/* Code display */}
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  {customCode ?? referralCode ?? "Loading..."}
                </code>
                <button
                  onClick={() => {
                    const code = customCode ?? referralCode;
                    if (!code) return;
                    void navigator.clipboard.writeText(code);
                  }}
                  className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Copy code
                </button>
                <button
                  onClick={() => {
                    const code = customCode ?? referralCode;
                    if (!code) return;
                    const url = `${window.location.origin}/signup?ref=${code}`;
                    void navigator.clipboard.writeText(url);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
                >
                  {linkCopied ? "Link copied!" : "Copy share link"}
                </button>
              </div>

              {/* Shareable URL preview */}
              <p className="text-xs text-slate-500 break-all">
                {typeof window !== "undefined" ? window.location.origin : ""}/signup?ref={customCode ?? referralCode ?? "..."}
              </p>

              {/* Custom code editor */}
              <div className="border-t border-slate-800 pt-3">
                <label className="mb-1 block text-xs text-slate-400">Customise your referral code</label>
                <div className="flex items-center gap-2">
                  <input
                    className="w-48 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase"
                    value={customCodeInput}
                    onChange={(e) => setCustomCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. JOHN2026"
                    maxLength={20}
                    minLength={4}
                  />
                  <button
                    disabled={customCodeSaving || customCodeInput.trim().length < 4}
                    onClick={async () => {
                      setCustomCodeSaving(true);
                      setCustomCodeMsg(null);
                      try {
                        const res = await apiFetch("/billing/referral-code", {
                          method: "PUT",
                          body: { customCode: customCodeInput.trim() },
                        });
                        if (!res.ok) {
                          const body = (await res.json().catch(() => ({}))) as { detail?: string };
                          throw new Error(body.detail || "Could not save code");
                        }
                        const body = (await res.json()) as { customCode: string };
                        setCustomCode(body.customCode);
                        setCustomCodeMsg("Saved!");
                      } catch (err) {
                        setCustomCodeMsg(err instanceof Error ? err.message : "Failed to save");
                      } finally {
                        setCustomCodeSaving(false);
                      }
                    }}
                    className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {customCodeSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                {customCodeMsg ? (
                  <p className="mt-1 text-xs text-slate-400">{customCodeMsg}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">4-20 alphanumeric characters. This becomes your shareable code.</p>
                )}
              </div>
            </div>
          </section>

          <PricingTable plans={plans} schoolEmailEligible={summary.schoolEmailEligible} />
        </>
      )}
    </main>
  );
}
