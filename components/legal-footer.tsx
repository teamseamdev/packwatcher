export function LegalFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/80 px-4 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-5 text-xs leading-5 text-slate-500 md:px-6 md:pb-5">
      <div className="mx-auto max-w-7xl space-y-3">
        <p>
          PackWatcher is owned and operated by Team Seam, LLC. PackWatcher is an independent collector tool and is not affiliated with, endorsed by, sponsored by, or associated with The Pokemon Company, Nintendo, Game Freak, Creatures, any retailer, or any marketplace. Pokemon and related names, marks, images, and card data are property of their respective owners.
        </p>
        <p>
          Prices, stock status, scanner values, and retailer availability are estimates for convenience only and must be confirmed directly with the retailer or marketplace before purchase.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-slate-400">
          <a href="/privacy" className="hover:text-amber-200">Privacy Policy</a>
          <a href="/terms" className="hover:text-amber-200">Terms of Use</a>
          <a href="/refunds" className="hover:text-amber-200">Refunds & Cancellations</a>
        </nav>
      </div>
    </footer>
  );
}
