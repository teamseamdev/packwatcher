"use client";

import { useTransition } from "react";
import { ButtonLink } from "@/components/button-link";

export default function UpgradePage() {
  const [isPending, startTransition] = useTransition();

  function checkout() {
    startTransition(async () => {
      const response = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await response.json();
      if (data.url) location.href = data.url;
      else alert(data.error ?? "Stripe is not configured.");
    });
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-xl rounded-lg border border-white/10 bg-slate-950/80 p-7">
        <h1 className="text-4xl font-black text-white">Upgrade to PRO</h1>
        <p className="mt-4 text-slate-300">$2/month for unlimited products, instant alerts, and advanced analytics.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button onClick={checkout} disabled={isPending} className="h-12 rounded-lg bg-amber-300 px-5 text-sm font-semibold text-slate-950 disabled:opacity-60">
            {isPending ? "Opening checkout..." : "Start checkout"}
          </button>
          <ButtonLink href="/dashboard" variant="secondary">Back to app</ButtonLink>
        </div>
      </section>
    </main>
  );
}

