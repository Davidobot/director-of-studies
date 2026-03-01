"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";

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

function formatHours(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return null;
  return (minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1);
}

export function PricingTable({ plans }: { plans: Plan[] }) {
  const [loadingPlanId, setLoadingPlanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const subscriptions = plans.filter((p) => p.planType === "subscription");
    const creditPacks = plans.filter((p) => p.planType === "credit_pack");
    const free = plans.find((p) => p.planType === "free") ?? null;
    return { subscriptions, creditPacks, free };
  }, [plans]);

  async function startCheckout(planId: number) {
    setError(null);
    setLoadingPlanId(planId);
    try {
      const res = await apiFetch("/billing/create-checkout-session", {
        method: "POST",
        body: {
          planId,
          successUrl: `${window.location.origin}/settings/billing?checkout=success`,
          cancelUrl: `${window.location.origin}/settings/billing?checkout=cancel`,
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail || "Could not start checkout");
      }

      const body = (await res.json()) as { checkoutUrl: string };
      if (!body.checkoutUrl) throw new Error("Checkout URL missing");
      window.location.href = body.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoadingPlanId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-base font-semibold">Pricing</h2>

      {grouped.free ? (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/30 p-4 text-sm">
          <p className="font-medium text-emerald-300">{grouped.free.name}</p>
          <p className="text-emerald-200/90">1 hour free trial included with every account.</p>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-300">Subscriptions</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {grouped.subscriptions.map((plan) => {
            const hours = formatHours(plan.monthlyMinutes);
            return (
              <article key={plan.id} className="rounded-md border border-slate-700 bg-slate-950 p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-100">{plan.name}</p>
                  {plan.isSchoolPlan ? (
                    <span className="rounded bg-violet-900/60 px-2 py-0.5 text-xs text-violet-200">School</span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-300">£{plan.priceGbp}{plan.interval ? ` / ${plan.interval}` : ""}</p>
                {hours ? <p className="text-xs text-slate-400">{hours} hours/month</p> : null}
                {plan.pricePerHourGbp ? (
                  <p className="mt-1 text-xs text-sky-300">£{plan.pricePerHourGbp}/hour</p>
                ) : null}
                <button
                  onClick={() => void startCheckout(plan.id)}
                  disabled={loadingPlanId === plan.id}
                  className="mt-3 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {loadingPlanId === plan.id ? "Redirecting..." : "Subscribe"}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-300">Pay-by-hour packs</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {grouped.creditPacks.map((plan) => {
            const hours = formatHours(plan.creditMinutes);
            return (
              <article key={plan.id} className="rounded-md border border-slate-700 bg-slate-950 p-4">
                <p className="font-medium text-slate-100">{plan.name}</p>
                <p className="text-sm text-slate-300">£{plan.priceGbp}</p>
                {hours ? <p className="text-xs text-slate-400">{hours} hours</p> : null}
                {plan.pricePerHourGbp ? (
                  <p className="mt-1 text-xs text-sky-300">£{plan.pricePerHourGbp}/hour</p>
                ) : null}
                <button
                  onClick={() => void startCheckout(plan.id)}
                  disabled={loadingPlanId === plan.id}
                  className="mt-3 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  {loadingPlanId === plan.id ? "Redirecting..." : "Buy pack"}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}
    </section>
  );
}
