import { redirect } from "next/navigation";
import { AdminSyncPanel } from "@/components/admin-sync-panel";
import { StatCard } from "@/components/stat-card";
import { isAdmin, requireProfile } from "@/lib/auth";
import { formatPromoDiscount } from "@/lib/promo-codes";
import { addCatalogOffer, adminCheckProduct, approveProductMatch, createPromoCode, importBestBuyPokemonCatalog, importRetailerSearchCatalog, importRetailerUrlsToCatalog, importTcgCsvPokemonCatalog, rejectProductMatch, sendAdminTestNotification, setPromoCodeActive, updateUserPlan } from "./actions";

const panelClass = "rounded-lg border border-white/10 bg-white/[0.04] p-5";
const scrollPanelClass = `${panelClass} max-h-[680px] overflow-y-auto overscroll-contain pr-4`;

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
    { data: users },
    { data: promoCodes },
    { data: connectorHealth },
    { data: retailJobRuns },
    { data: matchReviews }
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).in("plan", ["pro", "admin"]),
    supabase.from("tracked_products").select("*", { count: "exact", head: true }),
    supabase.from("catalog_offers").select("*", { count: "exact", head: true }),
    supabase.from("stock_checks").select("*").order("checked_at", { ascending: false }).limit(10),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("tracked_products").select("id,name,store_name,status,last_checked_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("profiles").select("id,email,plan,created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("promo_codes").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("retailer_connector_health").select("*").order("updated_at", { ascending: false }).limit(12),
    supabase.from("retail_job_runs").select("*").order("started_at", { ascending: false }).limit(10),
    supabase.from("product_match_reviews").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(10)
  ]);

  const failedChecks = checks?.filter((check) => check.status === "unknown").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-amber-200">Admin</p>
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
        <div className={scrollPanelClass}>
          <h2 className="font-bold text-white">Catalog importers</h2>
          <div className="mt-4 grid gap-3">
            <AdminSyncPanel />
            <form action={importTcgCsvPokemonCatalog} className="rounded-lg bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">TCGCSV Pokemon sealed</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input name="max_groups" placeholder="Max groups" defaultValue="30" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
                <input name="max_products" placeholder="Max products" defaultValue="500" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
              </div>
              <button className="mt-3 h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Import TCGCSV</button>
            </form>
            <form action={importBestBuyPokemonCatalog} className="rounded-lg bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">Best Buy API</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input name="query" placeholder="Search query" defaultValue="pokemon trading cards" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
                <input name="page_size" placeholder="Page size" defaultValue="50" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
              </div>
              <button className="mt-3 h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Import Best Buy</button>
            </form>
            <form action={importRetailerSearchCatalog} className="rounded-lg bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">Retailer search discovery</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Find public product pages from Target, Walmart, or GameStop search results, then check those product pages for stock.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <select name="retailer" defaultValue="target" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm">
                  <option value="target">Target</option>
                  <option value="walmart">Walmart</option>
                  <option value="gamestop">GameStop</option>
                </select>
                <input name="query" placeholder="Search query" defaultValue="pokemon cards" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
                <input name="limit" placeholder="Limit" defaultValue="8" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
              </div>
              <button className="mt-3 h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Import retailer search</button>
            </form>
            <form action={importRetailerUrlsToCatalog} className="rounded-lg bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">Bulk retailer URLs</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Paste Pokemon Center, Amazon, Target, Walmart, Best Buy, or other product URLs. PackWatcher will fetch safe public metadata and create searchable catalog offers.</p>
              <input name="set_name" placeholder="Optional set name" className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
              <textarea name="urls" placeholder="One product URL per line" className="mt-2 min-h-32 w-full rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm outline-none focus:border-amber-300" />
              <button className="mt-3 h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Import URLs</button>
            </form>
          </div>
        </div>

        <div className={scrollPanelClass}>
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
              <input key={name} name={name} placeholder={label} defaultValue={name === "tcg" ? "pokemon" : ""} className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-300" />
            ))}
            <button className="h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Add to catalog</button>
          </form>
        </div>

        <div className={scrollPanelClass}>
          <h2 className="font-bold text-white">Trigger checks</h2>
          <div className="mt-4 space-y-3">
            {products?.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3">
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-slate-400">{product.store_name} - {product.status}</p>
                </div>
                <form action={adminCheckProduct.bind(null, product.id)}>
                  <button className="h-9 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Check</button>
                </form>
              </div>
            ))}
          </div>
        </div>

        <div className={scrollPanelClass}>
          <h2 className="font-bold text-white">Manage users</h2>
          <div className="mt-4 space-y-3">
            {users?.map((user) => (
              <div key={user.id} className="rounded-lg bg-white/5 p-3 text-sm">
                <p className="break-all font-medium text-white">{user.email ?? "No email"}</p>
                <p className="mt-1 break-all text-xs text-slate-500">{user.id}</p>
                <form action={updateUserPlan} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input type="hidden" name="user_id" value={user.id} />
                  <select name="plan" defaultValue={user.plan} className="h-9 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm">
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="h-9 rounded-lg bg-amber-300 px-3 text-xs font-semibold text-slate-950">Update</button>
                </form>
              </div>
            ))}
          </div>
        </div>

        <div className={scrollPanelClass}>
          <h2 className="font-bold text-white">Send test notification</h2>
          <form action={sendAdminTestNotification} className="mt-4 grid gap-3">
            <select name="user_id" defaultValue="" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm">
              <option value="" disabled>Choose recipient</option>
              <option value="all">All recent users</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>{user.email ?? user.id}</option>
              ))}
            </select>
            <input name="title" placeholder="Notification title" defaultValue="PackWatcher test alert" className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-300" />
            <textarea name="message" placeholder="Notification message" defaultValue="This is a PackWatcher test notification." className="min-h-24 rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-amber-300" />
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input name="send_push" value="true" type="checkbox" className="h-4 w-4" />
              Also send browser push to subscribed devices
            </label>
            <button className="h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Send test notification</button>
          </form>
        </div>

        <div className={scrollPanelClass}>
          <h2 className="font-bold text-white">Promo codes</h2>
          <form action={createPromoCode} className="mt-4 grid gap-3 rounded-lg bg-white/5 p-3">
            <input name="code" placeholder="Code, e.g. LAUNCH25" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            <div className="grid gap-2 sm:grid-cols-2">
              <select name="discount_type" defaultValue="percent" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm">
                <option value="percent">Percent off</option>
                <option value="amount">Dollar amount off</option>
              </select>
              <input name="discount_value" type="number" min="0" step="0.01" placeholder="Discount value" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            </div>
            <input name="max_uses" type="number" min="1" step="1" placeholder="Total uses" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input name="unlimited_uses" value="true" type="checkbox" className="h-4 w-4" />
              Unlimited uses until deactivated
            </label>
            <button className="h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Create promo code</button>
          </form>
          <div className="mt-4 space-y-3">
            {promoCodes?.length ? promoCodes.map((promo) => (
              <div key={promo.id} className="rounded-lg bg-white/5 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{promo.code}</p>
                    <p className="mt-1 text-slate-400">
                      {formatPromoDiscount(promo)} - {promo.used_count ?? 0} / {promo.max_uses ?? "infinity"} used
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${promo.active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-slate-400"}`}>
                    {promo.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <form action={setPromoCodeActive} className="mt-3">
                  <input type="hidden" name="promo_code_id" value={promo.id} />
                  <input type="hidden" name="active" value={promo.active ? "false" : "true"} />
                  <button className="h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200">
                    {promo.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </div>
            )) : <p className="text-sm text-slate-400">No promo codes yet.</p>}
          </div>
        </div>

        <div className={scrollPanelClass}>
          <h2 className="font-bold text-white">Recent checks</h2>
          <div className="mt-4 space-y-3 text-sm">
            {checks?.map((check) => <p key={check.id} className="rounded-lg bg-white/5 p-3">{check.status} - {check.raw_match_reason}</p>)}
          </div>
        </div>

        <div className={scrollPanelClass}>
          <h2 className="font-bold text-white">Connector health</h2>
          <div className="mt-4 space-y-3 text-sm">
            {connectorHealth?.length ? connectorHealth.map((connector) => (
              <div key={connector.retailer} className="rounded-lg bg-white/5 p-3">
                <p className="font-medium">{connector.retailer} - {connector.state}</p>
                <p className="mt-1 text-slate-400">
                  Success {connector.success_count} / failures {connector.failure_count}
                  {connector.last_error ? ` - ${connector.last_error}` : ""}
                </p>
              </div>
            )) : <p className="text-sm text-slate-400">No connector health records yet.</p>}
          </div>
        </div>

        <div className={scrollPanelClass}>
          <h2 className="font-bold text-white">Retail jobs</h2>
          <div className="mt-4 space-y-3 text-sm">
            {retailJobRuns?.length ? retailJobRuns.map((job) => (
              <div key={job.id} className="rounded-lg bg-white/5 p-3">
                <p className="font-medium">{job.job_type} - {job.status}</p>
                <p className="mt-1 text-slate-400">{job.retailer ?? "all retailers"} - checked {job.checked_count}, changed {job.changed_count}, errors {job.error_count}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No retail job runs recorded yet.</p>}
          </div>
        </div>

        <div className={`${scrollPanelClass} lg:col-span-2`}>
          <h2 className="font-bold text-white">Uncertain product matches</h2>
          <div className="mt-4 space-y-3 text-sm">
            {matchReviews?.length ? matchReviews.map((review) => (
              <div key={review.id} className="rounded-lg bg-white/5 p-3">
                <p className="font-medium">{review.title}</p>
                <p className="mt-1 text-slate-400">{review.retailer} - confidence {review.confidence} - {review.reason ?? "Manual review needed"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={approveProductMatch} className="flex gap-2">
                    <input type="hidden" name="review_id" value={review.id} />
                    <input name="product_id" placeholder="Canonical product ID" className="h-9 min-w-0 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-xs" />
                    <button className="h-9 rounded-lg bg-amber-300 px-3 text-xs font-semibold text-slate-950">Approve link</button>
                  </form>
                  <form action={rejectProductMatch}>
                    <input type="hidden" name="review_id" value={review.id} />
                    <button className="h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200">Reject</button>
                  </form>
                </div>
              </div>
            )) : <p className="text-sm text-slate-400">No pending match reviews.</p>}
          </div>
        </div>

        <div className={`${scrollPanelClass} lg:col-span-2`}>
          <h2 className="font-bold text-white">Notification logs</h2>
          <div className="mt-4 space-y-3 text-sm">
            {notifications?.map((item) => <p key={item.id} className="rounded-lg bg-white/5 p-3">{item.title}</p>)}
          </div>
        </div>
      </section>
    </div>
  );
}

