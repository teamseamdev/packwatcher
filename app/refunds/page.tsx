export default function RefundsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-300 md:px-6">
      <p className="text-sm font-semibold text-amber-200">PackWatcher</p>
      <h1 className="mt-2 text-3xl font-black text-white">Refunds & Cancellations</h1>
      <p className="mt-4 text-sm leading-6 text-slate-400">Last updated: July 16, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7">
        <section>
          <h2 className="text-lg font-bold text-white">Subscriptions</h2>
          <p className="mt-2">Paid PackWatcher plans are billed through Stripe. You can change or cancel your plan from the Account tab when billing is enabled for your account.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Cancellations</h2>
          <p className="mt-2">When you switch to Free, PackWatcher marks the subscription to cancel at the end of the current billing period when a Stripe subscription is attached. Access to paid features may remain active until that period ends.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Refunds</h2>
          <p className="mt-2">Refund requests are reviewed by Team Seam, LLC. Unless required by law or approved by Team Seam, LLC, paid subscription charges are not automatically refundable after service access has been provided.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Retailer Purchases</h2>
          <p className="mt-2">PackWatcher does not sell Pokemon products. Purchases made through retailer or marketplace links are governed by that retailer or marketplace refund, shipping, and cancellation policies.</p>
        </section>
      </div>
    </main>
  );
}
