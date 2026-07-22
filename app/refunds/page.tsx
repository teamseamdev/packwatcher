export default function RefundsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-300 md:px-6">
      <p className="text-sm font-semibold text-amber-200">PackWatcher</p>
      <h1 className="mt-2 text-3xl font-black text-white">Refunds & Cancellations</h1>
      <p className="mt-4 text-sm leading-6 text-slate-400">Last updated: July 22, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7">
        <section>
          <h2 className="text-lg font-bold text-white">Subscriptions</h2>
          <p className="mt-2">
            Paid PackWatcher plans are billed through Stripe and may include Pro Monthly,
            Pro Yearly, and Founder lifetime access. You can change or cancel your plan
            from the Account tab when billing is enabled for your account.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Cancellations</h2>
          <p className="mt-2">
            You may cancel anytime. When a Stripe subscription is attached, cancellation
            takes effect at the end of the current billing period. Access to paid
            features continues until that period ends.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Refunds</h2>
          <p className="mt-2">
            Subscription charges are not refundable unless required by law. We do not
            provide prorated refunds or credits for unused time after cancellation.
          </p>
          <p className="mt-2">
            Founder lifetime purchases are refundable for 7 days unless the purchase or
            account has been abused, misused, used excessively in a way designed to avoid
            fair use, or used in violation of PackWatcher policies. Refund requests can
            be sent to support@packwatcher.com.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Retailer Purchases</h2>
          <p className="mt-2">
            PackWatcher does not sell Pokemon products, cards, sealed products, retailer
            goods, or marketplace goods. Purchases made through retailer or marketplace
            links are governed by that retailer or marketplace refund, shipping,
            cancellation, and seller policies.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Estimate Disclaimer</h2>
          <p className="mt-2">
            Prices, stock status, scanner values, centering results, alerts, and retailer
            availability are estimates only. Differences between PackWatcher estimates
            and a retailer, marketplace, buyer, or grading-company outcome are not a
            basis for a refund unless required by law.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Contact</h2>
          <p className="mt-2">Refund and cancellation questions can be sent to support@packwatcher.com.</p>
        </section>
      </div>
    </main>
  );
}
