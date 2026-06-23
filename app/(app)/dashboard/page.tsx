import { Suspense } from "react";
import { BellRing, Boxes, Clock, ListChecks, PackageCheck, TrendingUp } from "lucide-react";
import { CatalogBrowser, type CatalogProductGroup } from "@/components/catalog-browser";
import { StatCard } from "@/components/stat-card";
import { isAdmin, requireProfile } from "@/lib/auth";
import { ensureCatalogHasRows } from "@/lib/catalog/ensure-catalog";
import { calculateProfit, currency } from "@/lib/profit";
import type { CatalogOffer, CatalogProduct, InventoryItem, TrackedProduct } from "@/lib/types";

function CatalogLoading() {
  return (
    <section className="space-y-4">
      <div>
        <div className="h-4 w-32 animate-pulse rounded-lg bg-teal-300/20" />
        <div className="mt-3 h-8 w-80 max-w-full animate-pulse rounded-lg bg-white/10" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-lg bg-white/10" />
      </div>
      <div className="h-20 animate-pulse rounded-lg border border-white/10 bg-white/[0.04]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-80 animate-pulse rounded-lg border border-white/10 bg-white/[0.04]" />
        ))}
      </div>
    </section>
  );
}

async function DashboardCatalog({ isAdminUser, trackedProducts }: { isAdminUser: boolean; trackedProducts: TrackedProduct[] }) {
  const { supabase, user } = await requireProfile();
  await ensureCatalogHasRows(supabase);
  const [{ data: products }, { data: offers }, { data: productAlerts }] = await Promise.all([
    supabase
      .from("catalog_products")
      .select("*")
      .eq("tcg", "pokemon")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("catalog_offers")
      .select("*")
      .order("last_checked_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("product_alerts").select("product_id").eq("user_id", user.id)
  ]);

  const trackedUrls = new Set(trackedProducts.map((product) => product.url));
  const trackedProductIds = new Set((productAlerts ?? []).map((alert) => alert.product_id));
  const groupsByProduct = new Map<string, CatalogProductGroup>();

  for (const row of products ?? []) {
    const product = row as CatalogProduct;
    groupsByProduct.set(product.id, {
      product,
      offers: [],
      trackedOfferUrls: [],
      isProductTracked: trackedProductIds.has(product.id)
    });
  }

  for (const row of offers ?? []) {
    const offer = row as CatalogOffer;
    const productId = offer.product_id ?? offer.catalog_product_id;
    const existing = groupsByProduct.get(productId);
    if (existing) {
      existing.offers.push(offer);
      if (trackedUrls.has(offer.url)) {
        existing.trackedOfferUrls.push(offer.url);
      }
    }
  }

  const groups = Array.from(groupsByProduct.values()).sort((a, b) => {
    const aInStock = a.offers.some((offer) => offer.status === "in_stock");
    const bInStock = b.offers.some((offer) => offer.status === "in_stock");
    if (aInStock !== bInStock) return aInStock ? -1 : 1;
    return a.product.name.localeCompare(b.product.name);
  });

  return <CatalogBrowser groups={groups} isAdmin={isAdminUser} />;
}

export default async function DashboardPage() {
  const { supabase, user, profile } = await requireProfile();
  const [{ data: products }, { data: notifications }, { data: inventory }, { data: checks }, { count: productAlertCount }] = await Promise.all([
    supabase.from("tracked_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<TrackedProduct[]>(),
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("inventory_items").select("*").eq("user_id", user.id).returns<InventoryItem[]>(),
    supabase.from("stock_checks").select("*, tracked_products!inner(user_id)").eq("tracked_products.user_id", user.id).order("checked_at", { ascending: false }).limit(5),
    supabase.from("product_alerts").select("*", { count: "exact", head: true }).eq("user_id", user.id)
  ]);

  const trackedProducts = products ?? [];
  const owned = inventory ?? [];
  const collectionValue = owned.reduce((sum, item) => sum + item.estimated_sale_price * item.quantity, 0);
  const estimatedProfit = owned.reduce((sum, item) => sum + calculateProfit({
    estimatedSalePrice: item.estimated_sale_price,
    purchasePrice: item.purchase_price,
    fees: item.fees,
    shipping: item.shipping,
    quantity: item.quantity
  }).profit, 0);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold text-teal-200">Dashboard</p>
        <h1 className="mt-2 text-3xl font-black text-white">Find Pokemon products and get restock alerts</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Browse the sealed product catalog, track the products you want, and PackWatcher will notify you when tracked offers come back in stock.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Watched Products" value={Math.max(trackedProducts.length, productAlertCount ?? 0)} icon={<ListChecks />} />
        <StatCard title="In-Stock Products" value={trackedProducts.filter((item) => item.status === "in_stock").length} icon={<PackageCheck />} />
        <StatCard title="Recent Alerts" value={notifications?.length ?? 0} icon={<BellRing />} />
        <StatCard title="Inventory Value" value={currency(collectionValue)} icon={<Boxes />} />
        <StatCard title="Estimated Profit" value={currency(estimatedProfit)} icon={<TrendingUp />} />
        <StatCard title="Last Stock Checks" value={checks?.length ?? 0} detail={checks?.[0]?.checked_at ? new Date(checks[0].checked_at).toLocaleString() : "No checks yet"} icon={<Clock />} />
      </section>

      <Suspense fallback={<CatalogLoading />}>
        <DashboardCatalog isAdminUser={isAdmin(profile)} trackedProducts={trackedProducts} />
      </Suspense>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Recent alerts</h2>
          <div className="mt-4 space-y-3">
            {notifications?.length ? notifications.map((item) => (
              <div key={item.id} className="rounded-lg bg-white/5 p-3">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-sm text-slate-400">{item.message}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No notification records yet.</p>}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Last stock checks</h2>
          <div className="mt-4 space-y-3">
            {checks?.length ? checks.map((item) => (
              <div key={item.id} className="rounded-lg bg-white/5 p-3 text-sm">
                <p className="font-medium">{item.status}</p>
                <p className="mt-1 text-slate-400">{item.raw_match_reason ?? "No match reason"} - {new Date(item.checked_at).toLocaleString()}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No checks have been run.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
