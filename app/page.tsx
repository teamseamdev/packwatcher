import Link from "next/link";
import { Activity, BellRing, Boxes, Calculator, ShieldCheck, TrendingUp } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ButtonLink } from "@/components/button-link";
import { PricingCards } from "@/components/pricing-cards";
import { getCurrentUser } from "@/lib/auth";

const features = [
  { icon: BellRing, title: "Restock Alerts", body: "Track product pages and get notified when watched items move back in stock." },
  { icon: Activity, title: "Price Tracking", body: "Monitor MSRP, target prices, last known prices, and stock check history." },
  { icon: Boxes, title: "Inventory", body: "Track owned items, quantities, purchase cost, projected resale, and notes." },
  { icon: Calculator, title: "Profit Tools", body: "Estimate fees, shipping, ROI, and profit across your sealed collection." },
  { icon: TrendingUp, title: "TCG Ready", body: "Built for Pokemon first, with room for Magic, Lorcana, One Piece, sports cards, and more." },
  { icon: ShieldCheck, title: "Safe Monitoring", body: "No auto-checkout, queue bypassing, account automation, or retailer protection circumvention." }
];

const stores = ["Pokemon Center", "Target", "Walmart", "Best Buy", "GameStop", "TCGplayer", "Local shops", "More soon"];

export default async function LandingPage() {
  const { user } = await getCurrentUser();
  const primaryHref = user ? "/dashboard" : "/signup";
  const primaryText = user ? "Dashboard" : "Get Started";

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark />
          <span className="text-lg font-bold tracking-wide">PackWatcher</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          <a href="#features">Features</a>
          <a href="#stores">Stores</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <ButtonLink href={user ? "/dashboard" : "/login"} size="sm">{user ? "Dashboard" : "Sign In"}</ButtonLink>
      </header>

      <section className="grid-texture mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl content-center px-5 pb-16 pt-10">
        <div className="max-w-4xl">
          <p className="mb-5 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">
            PackWatcher for TCG collectors
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.02] text-white sm:text-7xl lg:text-8xl">
            Never Miss a Restock.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            Real-time TCG restock alerts, inventory tracking, and profit management for serious collectors.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={primaryHref}>{primaryText}</ButtonLink>
            <ButtonLink href="#pricing" variant="secondary">View Pricing</ButtonLink>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">Collector tools that stay on your side.</h2>
          <p className="mt-4 text-slate-300">Watch restocks, preserve context, and manage your collection without automating purchases.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
              <feature.icon className="mb-5 h-7 w-7 text-amber-300" />
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="stores" className="border-y border-white/10 bg-black/20 px-5 py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-bold text-white">Supported stores</h2>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stores.map((store) => (
              <div key={store} className="rounded-lg border border-white/10 bg-slate-950/70 px-4 py-5 text-center text-sm font-medium text-slate-200">
                {store}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-20">
        <PricingCards />
      </section>

      <section id="faq" className="mx-auto max-w-4xl px-5 py-16">
        <h2 className="text-3xl font-bold text-white">FAQ</h2>
        <div className="mt-8 space-y-4">
          {[
            ["Does PackWatcher buy products for me?", "No. PackWatcher only monitors, records, and alerts. Purchases must be user-confirmed on store websites."],
            ["Which TCGs are supported?", "The MVP is Pokemon-first, with categories ready for Magic, Lorcana, One Piece, sports cards, Yu-Gi-Oh, and more."],
            ["Can I use Discord alerts?", "Yes. The notification architecture includes an optional Discord webhook path for restock events."],
            ["Is Stripe fully connected?", "The app includes Stripe checkout and webhook skeletons. Add your keys and price IDs to finish billing."]
          ].map(([question, answer]) => (
            <details key={question} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <summary className="cursor-pointer font-semibold">{question}</summary>
              <p className="mt-3 text-sm leading-6 text-slate-300">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-5 py-20">
        <div className="mx-auto max-w-7xl rounded-lg border border-amber-300/20 bg-amber-300/10 p-8 sm:p-12">
          <h2 className="text-3xl font-black text-white sm:text-5xl">Start watching the next drop.</h2>
          <p className="mt-4 max-w-2xl text-slate-300">Create a watchlist, run a manual check, and keep your collection numbers honest.</p>
          <div className="mt-7">
            <ButtonLink href={primaryHref}>{primaryText}</ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}

