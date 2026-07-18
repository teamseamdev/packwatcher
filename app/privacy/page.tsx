export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-300 md:px-6">
      <p className="text-sm font-semibold text-amber-200">PackWatcher</p>
      <h1 className="mt-2 text-3xl font-black text-white">Privacy Policy</h1>
      <p className="mt-4 text-sm leading-6 text-slate-400">Last updated: July 16, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7">
        <section>
          <h2 className="text-lg font-bold text-white">What We Collect</h2>
          <p className="mt-2">PackWatcher collects account information such as your email address, plan status, saved ZIP code, tracked products, inventory entries, notification preferences, push subscription records, linked marketplace settings, and usage data needed to operate the service.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">How We Use Data</h2>
          <p className="mt-2">We use this data to provide product tracking, retailer discovery, stock alerts, scanner pricing, inventory tools, billing, support, fraud prevention, and service reliability monitoring.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Payments</h2>
          <p className="mt-2">Payments are processed by Stripe. PackWatcher does not store full payment card numbers on its servers.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Linked Marketplaces</h2>
          <p className="mt-2">If you connect eBay, PackWatcher stores encrypted eBay authorization tokens and seller listing defaults so you can create listings from your inventory. You can disconnect eBay from the Account tab.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Notifications</h2>
          <p className="mt-2">If you enable browser push, we store the browser push endpoint and keys needed to send alerts. You can disable notifications from the Account tab or your browser settings.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Contact</h2>
          <p className="mt-2">PackWatcher is owned and operated by Team Seam, LLC. Contact Team Seam, LLC for privacy requests or account questions.</p>
        </section>
      </div>
    </main>
  );
}
