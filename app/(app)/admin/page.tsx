import { redirect } from "next/navigation";
import { StatCard } from "@/components/stat-card";
import { isAdmin, requireProfile } from "@/lib/auth";
import { addCatalogOffer, adminCheckProduct, importBestBuyPokemonCatalog, importRetailerUrlsToCatalog, importTcgCsvPokemonCatalog, promoteAdmin, syncAllAvailableCatalogs } from "./actions";

export default async function AdminPage() {
  const { supabase, profile } = await requireProfile();
  if (!isAdmin(profile)) redirect("/dashboard");

  const [
    { count: totalUsers },
    { count: proUsers },
    { count: trackedProducts },
    { count: catalogOffers },
    { data: checks },
    { data: notifications },
    { data: products },
    { data: users }
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).in("plan", ["pro", "admin"]),
    supabase.from("tracked_products").select("*", { count: "exact", head: true }),
    supabase.from("catalog_offers").select("*", { count: "exact", head: true }),
    supabase.from("stock_checks").select("*").order("checked_at", { ascending: false }).limit(10),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("tracked_products").select("id,name,store_name,status,last_checked_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("profiles").select("id,email,plan,created_at").order("created_at", { ascending: false }).limit(10)
  ]);

  const failedChecks = checks?.filter((check) => check.status === "unknown").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-teal-200">Admin</p>
        <h1 className="mt-1 text-3xl font-black text-white">Operations dashboard</h1>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard title="Total users" value={totalUsers ?? 0} />
        <StatCard title="Pro users" value={proUsers ?? 0} />
        <StatCard title="Tracked products" value={trackedProducts ?? 0} />
        <StatCard title="Catalog offers" value={catalogOffers ?? 0} />
        <StatCard title="Recent checks" value={checks?.length ?? 0} />
        <StatCard title="Failed checks" value={failedChecks} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Catalog importers</h2>
          <div className="mt-4 grid gap-3">
            <form action={syncAllAvailableCatalogs} className="rounded-lg border border-teal-300/20 bg-teal-300/10 p-3">
              <p className="text-sm font-semibold text-white">Sync all available catalogs</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">Runs TCGCSV automatically and Best Buy when an API key is configured. Use this for cron-backed catalog refreshes.</p>
              <button className="mt-3 h-10 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950">Sync catalogs</button>
            </form>
            <form action={importTcgCsvPokemonCatalog} className="rounded-lg bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">TCGCSV Pokemon sealed</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input name="max_groups" placeholder="Max groups" defaultValue="30" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
                <input name="max_products" placeholder="Max products" defaultValue="500" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
              </div>
              <button className="mt-3 h-10 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950">Import TCGCSV</button>
            </form>
            <form action={importBestBuyPokemonCatalog} className="rounded-lg bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">Best Buy API</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input name="query" placeholder="Search query" defaultValue="pokemon trading cards" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
                <input name="page_size" placeholder="Page size" defaultValue="50" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
              </div>
              <button className="mt-3 h-10 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950">Import Best Buy</button>
            </form>
            <form action={importRetailerUrlsToCatalog} className="rounded-lg bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">Bulk retailer URLs</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Paste Pokemon Center, Amazon, Target, Walmart, Best Buy, or other product URLs. PackWatcher will fetch safe public metadata and create searchable catalog offers.</p>
              <input name="set_name" placeholder="Optional set name" className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
              <textarea name="urls" placeholder="One product URL per line" className="mt-2 min-h-32 w-full rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm outline-none focus:border-teal-300" />
              <button className="mt-3 h-10 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950">Import URLs</button>
            </form>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Add catalog offer</h2>
          <form action={addCatalogOffer} className="mt-4 grid gap-3">
            {[
              ["name", "Product name"],
              ["tcg", "TCG, e.g. pokemon"],
              ["category", "Category"],
              ["set_name", "Set name"],
              ["image_url", "Image URL"],
              ["msrp", "MSRP"],
              ["store_name", "Store name"],
              ["url", "Store URL"],
              ["last_price", "Last price"]
            ].map(([name, label]) => (
              <input key={name} name={name} placeholder={label} defaultValue={name === "tcg" ? "pokemon" : ""} className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-teal-300" />
            ))}
            <button className="h-10 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950">Add to catalog</button>
          </form>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Trigger checks</h2>
          <div className="mt-4 space-y-3">
            {products?.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3">
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-slate-400">{product.store_name} - {product.status}</p>
                </div>
                <form action={adminCheckProduct.bind(null, product.id)}>
                  <button className="h-9 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950">Check</button>
                </form>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Manage users</h2>
          <form action={promoteAdmin} className="mt-4 flex gap-2">
            <input name="user_id" placeholder="User ID" className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm" />
            <button className="h-10 rounded-lg bg-white px-3 text-sm font-semibold text-slate-950">Promote</button>
          </form>
          <div className="mt-4 space-y-3">
            {users?.map((user) => (
              <div key={user.id} className="rounded-lg bg-white/5 p-3 text-sm">
                <p className="break-all font-medium">{user.email}</p>
                <p className="text-slate-400">{user.plan} - {user.id}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Recent checks</h2>
          <div className="mt-4 space-y-3 text-sm">
            {checks?.map((check) => <p key={check.id} className="rounded-lg bg-white/5 p-3">{check.status} - {check.raw_match_reason}</p>)}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 lg:col-span-2">
          <h2 className="font-bold text-white">Notification logs</h2>
          <div className="mt-4 space-y-3 text-sm">
            {notifications?.map((item) => <p key={item.id} className="rounded-lg bg-white/5 p-3">{item.title}</p>)}
          </div>
        </div>
      </section>
    </div>
  );
}
