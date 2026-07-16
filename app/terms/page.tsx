export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-300 md:px-6">
      <p className="text-sm font-semibold text-amber-200">PackWatcher</p>
      <h1 className="mt-2 text-3xl font-black text-white">Terms of Use</h1>
      <p className="mt-4 text-sm leading-6 text-slate-400">Last updated: July 16, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7">
        <section>
          <h2 className="text-lg font-bold text-white">Independent Tool</h2>
          <p className="mt-2">PackWatcher is owned and operated by Team Seam, LLC. PackWatcher is not affiliated with, endorsed by, sponsored by, or associated with The Pokemon Company, Nintendo, Game Freak, Creatures, any retailer, or any marketplace.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Price and Stock Estimates</h2>
          <p className="mt-2">Prices, stock status, scanner values, product listings, and local availability are estimates for convenience only. You must confirm current price, stock, seller, shipping, pickup, and purchase terms directly with the retailer or marketplace before buying.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Acceptable Use</h2>
          <p className="mt-2">Do not misuse PackWatcher, attempt to bypass access controls, interfere with service operations, scrape the service, or use the product for unlawful activity.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">No Purchase Guarantee</h2>
          <p className="mt-2">PackWatcher does not guarantee that any product will remain available, that alerts will arrive before sellout, or that any displayed listing can be purchased.</p>
        </section>
        <section>
          <h2 className="text-lg font-bold text-white">Changes</h2>
          <p className="mt-2">Team Seam, LLC may update PackWatcher, these terms, features, pricing, and availability over time.</p>
        </section>
      </div>
    </main>
  );
}
