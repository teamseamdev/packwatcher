"use client";

import { useState, useTransition } from "react";
import type { CheckoutPlan } from "@/lib/plans";
import type { Plan } from "@/lib/types";

const checkoutOptions: Array<{ plan: CheckoutPlan; label: string; description: string }> = [
  { plan: "pro_monthly", label: "Pro Monthly - $4.99/mo", description: "Unlimited tracking, 500 scans, 5 video scans." },
  { plan: "pro_yearly", label: "Pro Yearly - $45/yr", description: "Same Pro limits, billed yearly." },
  { plan: "founder", label: "Founder - $250 once", description: "Lifetime access, 1,000 scans, 15 video scans." }
];

export function AccountPlanSwitcher({ currentPlan, className = "mt-6" }: { currentPlan: Plan; className?: string }) {
  const [promoCode, setPromoCode] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState<CheckoutPlan>("pro_monthly");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isPaid = currentPlan === "pro" || currentPlan === "founder" || currentPlan === "admin";

  function startCheckout() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promo_code: promoCode, plan: checkoutPlan })
      });
      const data = await response.json();

      if (data.url) {
        location.href = data.url;
        return;
      }

      setMessage(data.error ?? "Could not start checkout.");
    });
  }

  return (
    <section className={`${className} rounded-lg border border-white/10 bg-white/[0.04] p-5`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-bold text-white">Plan</h2>
          <p className="mt-1 text-sm text-slate-400">Current plan: <span className="font-semibold text-white">{currentPlan}</span></p>
        </div>
        {isPaid ? <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">Active</span> : null}
      </div>

      <div className="mt-5 grid gap-3 rounded-lg bg-white/5 p-3">
        <p className="text-sm font-semibold text-white">Upgrade options</p>
        <select
          value={checkoutPlan}
          onChange={(event) => setCheckoutPlan(event.target.value as CheckoutPlan)}
          className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300"
        >
          {checkoutOptions.map((option) => <option key={option.plan} value={option.plan}>{option.label}</option>)}
        </select>
        <p className="text-xs text-slate-400">{checkoutOptions.find((option) => option.plan === checkoutPlan)?.description}</p>
        <input
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value)}
          placeholder="Promo code"
          className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300"
        />
        <button
          onClick={startCheckout}
          disabled={isPending || currentPlan === "admin" || currentPlan === "founder"}
          className="h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Opening checkout..." : currentPlan === "founder" ? "Founder is active" : currentPlan === "admin" ? "Admin is active" : "Open checkout"}
        </button>
        {message ? <p className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{message}</p> : null}
      </div>
    </section>
  );
}
