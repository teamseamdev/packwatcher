export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-300 md:px-6">
      <p className="text-sm font-semibold text-amber-200">PackWatcher</p>
      <h1 className="mt-2 text-3xl font-black text-white">Privacy Policy</h1>
      <p className="mt-4 text-sm leading-6 text-slate-400">Last updated: July 22, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7">
        <section>
          <h2 className="text-lg font-bold text-white">Who Operates PackWatcher</h2>
          <p className="mt-2">
            PackWatcher is owned and operated by Team Seam, LLC. For privacy requests,
            account questions, or deletion requests, contact us at support@packwatcher.com.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">What We Collect</h2>
          <p className="mt-2">
            PackWatcher collects information needed to operate the service, including
            account identifiers, email address, plan status, saved ZIP code, tracked
            products, inventory entries, scan results, centering measurements,
            notification preferences, push subscription records, linked marketplace
            settings, feedback, support messages, and usage records such as scan counts
            and alert activity.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">How We Use Data</h2>
          <p className="mt-2">
            We use this data to provide product tracking, retailer discovery, stock
            alerts, scanner pricing, inventory tools, centering estimates, billing,
            customer support, fraud prevention, account security, service reliability
            monitoring, and feature improvement.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Card Photos and Scanner Data</h2>
          <p className="mt-2">
            Card photos and uploaded scanner images are used only to provide the scanner,
            inventory, and centering features you request. PackWatcher does not use your
            card photos to train AI models.
          </p>
          <p className="mt-2">
            Temporary processing photos are deleted after processing unless you explicitly
            choose a private photo-saving option. Saved private photos are stored
            privately, are not public, and can be deleted from the related feature when
            supported.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Payments</h2>
          <p className="mt-2">
            Payments are processed by Stripe. PackWatcher does not store full payment
            card numbers on its servers. Stripe may process payment details, billing
            information, receipts, tax details, and fraud-prevention data according to
            Stripe&apos;s own terms and privacy practices.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Linked Services and Marketplaces</h2>
          <p className="mt-2">
            If you connect eBay, PackWatcher stores encrypted eBay authorization tokens,
            eBay account identifiers, account names, seller settings, listing defaults,
            and related marketplace data needed to provide listing tools. You can
            disconnect eBay from the Account tab. eBay account deletion notifications are
            processed to remove or anonymize eBay-derived personal data where applicable.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Notifications</h2>
          <p className="mt-2">
            If you enable browser push, we store the browser push endpoint and keys
            needed to send alerts. You can disable notifications from the Account tab or
            your browser settings.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Service Providers</h2>
          <p className="mt-2">
            We use service providers for authentication, hosting, database storage,
            private media storage, payments, notifications, retailer and shopping search
            data, scanner processing, email, analytics, and error monitoring. These
            providers are used only as needed to operate PackWatcher.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Data Deletion</h2>
          <p className="mt-2">
            You may request deletion of your account data by contacting
            support@packwatcher.com. Some limited records may be retained when required
            for security, billing, fraud prevention, legal compliance, disputes, backups,
            or audit logs.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Children</h2>
          <p className="mt-2">
            PackWatcher is intended for users age 13 and older. Users must be 18 or
            older to connect or use an eBay seller account or any feature that requires
            an adult marketplace account.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Contact</h2>
          <p className="mt-2">
            Contact Team Seam, LLC at support@packwatcher.com.
          </p>
        </section>
      </div>
    </main>
  );
}
