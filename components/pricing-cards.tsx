import { ButtonLink } from "@/components/button-link";
import { FREE_TRACKED_PRODUCT_LIMIT } from "@/lib/plans";

const plans = [
  {
    name: "FREE",
    price: "$0",
    body: "Start watching the drops you care about.",
    features: [`${FREE_TRACKED_PRODUCT_LIMIT} tracked products`, "Basic alerts", "Inventory tracker", "Manual checks"]
  },
  {
    name: "PRO",
    price: "$2",
    body: "For collectors tracking frequent releases.",
    features: ["Unlimited products", "Instant alerts", "Advanced analytics", "Priority check cadence"]
  }
];

export function PricingCards() {
  return (
    <div>
      <div className="mb-10 max-w-2xl">
        <h2 className="text-3xl font-bold text-white sm:text-4xl">Simple pricing</h2>
        <p className="mt-4 text-slate-300">Launch with the free plan, upgrade when your watchlist outgrows it.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.name} className="rounded-lg border border-white/10 bg-white/[0.04] p-7">
            <h3 className="text-sm font-bold tracking-[0.2em] text-teal-200">{plan.name}</h3>
            <p className="mt-4 text-5xl font-black text-white">
              {plan.price}<span className="text-base font-medium text-slate-400">/month</span>
            </p>
            <p className="mt-4 text-slate-300">{plan.body}</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-200">
              {plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
            </ul>
            <div className="mt-7">
              <ButtonLink href={plan.name === "PRO" ? "/upgrade" : "/signup"} variant={plan.name === "PRO" ? "primary" : "secondary"}>
                {plan.name === "PRO" ? "Upgrade" : "Get Started"}
              </ButtonLink>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
