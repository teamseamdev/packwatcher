"use client";

import { useState, useTransition } from "react";
import type { Plan } from "@/lib/types";

export function AccountPlanSwitcher({ currentPlan }: { currentPlan: Plan }) {
  const [promoCode, setPromoCode] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isPro = currentPlan === "pro" || currentPlan === "admin";

  function startCheckout() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promo_code: promoCode })
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
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-bold text-white">Plan</h2>
          <p className="mt-1 text-sm text-slate-400">Current plan: <span className="font-semibold text-white">{currentPlan}</span></p>
        </div>
        {isPro ? <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">Active</span> : null}
      </div>

      <div className="mt-5 grid gap-3 rounded-lg bg-white/5 p-3">
        <p className="text-sm font-semibold text-white">Upgrade to Pro</p>
        <p className="text-sm text-slate-400">$2/month for unlimited tracked products and faster alerts.</p>
        <input
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value)}
          placeholder="Promo code"
          className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300"
        />
        <button
          onClick={startCheckout}
          disabled={isPending || isPro}
          className="h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Opening checkout..." : isPro ? "Pro is active" : "Switch to Pro"}
        </button>
        {message ? <p className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{message}</p> : null}
      </div>
    </section>
  );
}
