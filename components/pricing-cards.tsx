"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import type { CheckoutPlan } from "@/lib/plans";

type PricingCard =
  | {
      key: "free";
      name: string;
      price: string;
      cadence: string;
      body: string;
      features: string[];
      cta: string;
      href: string;
      featured?: boolean;
    }
  | {
      key: CheckoutPlan;
      name: string;
      price: string;
      cadence: string;
      body: string;
      features: string[];
      cta: string;
      checkoutPlan: CheckoutPlan;
      featured?: boolean;
    };

const plans: PricingCard[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    cadence: "rolling 30 days",
    body: "For trying PackWatcher before you commit.",
    features: ["3 tracked products and alerts", "20 card scans", "1 video scan", "Manual inventory entry"],
    cta: "Get Started",
    href: "/signup"
  },
  {
    key: "pro_monthly",
    name: "Pro",
    price: "$4.99",
    cadence: "per month",
    body: "For active collectors tracking drops and scanning pulls.",
    features: ["Unlimited tracks and alerts", "500 card scans per 30 days", "5 video scans per 30 days", "Extra video scans available later"],
    cta: "Go Pro Monthly",
    checkoutPlan: "pro_monthly" as CheckoutPlan
  },
  {
    key: "pro_yearly",
    name: "Pro Yearly",
    price: "$45",
    cadence: "billed annually",
    body: "The Pro plan at a lower yearly rate.",
    features: ["All Pro monthly benefits", "Unlimited tracks and alerts", "500 card scans per 30 days", "5 video scans per 30 days"],
    cta: "Go Pro Yearly",
    checkoutPlan: "pro_yearly" as CheckoutPlan
  },
  {
    key: "founder",
    name: "Founder",
    price: "$250",
    cadence: "one time",
    body: "Limited to the first 100 Founder memberships.",
    features: ["Lifetime PackWatcher access", "Unlimited tracks and alerts", "1,000 card scans per 30 days", "15 video scans per 30 days"],
    cta: "Claim Founder",
    checkoutPlan: "founder" as CheckoutPlan,
    featured: true
  }
];

export function PricingCards() {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function checkout(plan: CheckoutPlan) {
    setPendingPlan(plan);
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan })
      });
      const data = await response.json();
      if (data.url) {
        location.href = data.url;
        return;
      }
      setMessage(data.error ?? "Could not start checkout.");
      setPendingPlan(null);
    });
  }

  return (
    <div>
      <div className="pw-hero mb-10 max-w-3xl p-5 sm:p-6">
        <p className="pw-hud text-xs font-black">Membership loadout</p>
        <h2 className="text-3xl font-bold text-white sm:text-4xl">Simple pricing</h2>
        <p className="mt-4 text-slate-300">
          Start free with monthly limits, upgrade for more scans and unlimited tracking, or lock in lifetime Founder access.
        </p>
      </div>
      {message ? <p className="mb-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{message}</p> : null}
      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => (
          <article
            key={plan.key}
            className={`pw-panel rounded-lg border p-6 transition hover:-translate-y-0.5 ${plan.featured ? "pw-glow border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-amber-200">{plan.name}</h3>
              {plan.featured ? <span className="rounded-full bg-amber-300 px-2 py-1 text-[10px] font-black text-slate-950">100 spots</span> : null}
            </div>
            <p className="mt-4 text-4xl font-black text-white">
              {plan.price}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-400">{plan.cadence}</p>
            <p className="mt-4 min-h-12 text-sm text-slate-300">{plan.body}</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-200">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7">
              {"checkoutPlan" in plan ? (
                <button
                  onClick={() => checkout(plan.checkoutPlan)}
                  disabled={isPending}
                  className="h-11 w-full rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:opacity-60"
                >
                  {pendingPlan === plan.checkoutPlan ? "Opening checkout..." : plan.cta}
                </button>
              ) : (
                <ButtonLink href={plan.href} variant="secondary">{plan.cta}</ButtonLink>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
