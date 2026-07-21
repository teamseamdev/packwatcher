import { redirect } from "next/navigation";
import { AdminSyncPanel } from "@/components/admin-sync-panel";
import { StatCard } from "@/components/stat-card";
import { isAdmin, requireProfile } from "@/lib/auth";
import { formatPromoDiscount } from "@/lib/promo-codes";
import type { FeedbackItem, FeedbackStatus } from "@/lib/types";
import { addCatalogOffer, adminCheckProduct, approveProductMatch, createPromoCode, disableCatalogOffer, importBestBuyPokemonCatalog, importRetailerSearchCatalog, importRetailerUrlsToCatalog, importTcgCsvPokemonCatalog, reconcilePokemonInventory, rejectProductMatch, runMonitorJobsNow, sendAdminTestNotification, setPromoCodeActive, simulateRestockPipeline, updateFeedbackStatus, updateUserPlan } from "./actions";

const panelClass = "rounded-lg border border-white/10 bg-white/[0.04] p-5";
const scrollPanelClass = `${panelClass} scroll-panel max-h-[680px] pr-4`;

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
    { data: matchReviews },
    { data: recentOffers },
    { data: appEvents },
    { data: feedbackItems },
    { data: restockEvents },
    { data: outboxJobs },
    { data: retailerRollout }
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
    supabase.from("product_match_reviews").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(10),
    supabase.from("catalog_offers").select("id,title,store_name,retailer,status,last_price,price,active,created_at,url").order("created_at", { ascending: false }).limit(30),
    supabase.from("app_events").select("*").in("severity", ["warn", "error"]).order("created_at", { ascending: false }).limit(30),
    supabase
      .from("feedback_items")
      .select("*, profiles!feedback_items_user_id_fkey(email), feedback_status_events(*, profiles!feedback_status_events_admin_user_id_fkey(email))")
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<FeedbackItem[]>(),
    supabase.from("restock_events").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("notification_outbox").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("retailer_rollout").select("*").order("tier", { ascending: true }).order("display_name", { ascending: true })
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
            <form action={reconcilePokemonInventory} className="rounded-lg bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">Inventory card reconciliation</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Links older scanner inventory rows to canonical Pokemon cards when the selected set and collector number produce one safe match. Ambiguous rows are skipped.</p>
              <input name="limit" placeholder="Rows to scan" defaultValue="500" className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm" />
              <button className="mt-3 h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Reconcile inventory</button>
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
                    <option value="founder">Founder</option>
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
          <form action={simulateRestockPipeline} className="mt-4 grid gap-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
            <div>
              <p className="text-sm font-bold text-white">Simulate full restock pipeline</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">Creates synthetic out-of-stock and in-stock observations, a test restock event, matching alert notifications, and web-push outbox delivery.</p>
            </div>
            <select name="offer_id" defaultValue="" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm">
              <option value="" disabled>Choose catalog offer</option>
              {recentOffers?.filter((offer) => offer.active !== false).map((offer) => (
                <option key={offer.id} value={offer.id}>{offer.store_name} - {offer.title ?? offer.id}</option>
              ))}
            </select>
            <input name="price" type="number" min="0" step="0.01" placeholder="Optional test price" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            <button className="h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Simulate restock</button>
          </form>
        </div>

        <div className={`${scrollPanelClass} lg:col-span-2`}>
          <h2 className="font-bold text-white">Recent feedback</h2>
          <p className="mt-1 text-xs text-slate-400">Review suggestions, bugs, and issues. Status changes are stored with the admin who made the update.</p>
          <div className="mt-4 space-y-3 text-sm">
            {feedbackItems?.length ? feedbackItems.map((item) => {
              const events = [...(item.feedback_status_events ?? [])].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
              return (
                <article key={item.id} className="rounded-lg border border-cyan-300/10 bg-black/40 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${feedbackStatusClass(item.status)}`}>{feedbackStatusLabel(item.status)}</span>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300">{item.type}</span>
                      </div>
                      <h3 className="mt-3 text-base font-bold text-white">{item.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{item.message}</p>
                      <div className="mt-3 grid gap-1 text-xs text-slate-500">
                        <p>From: {item.profiles?.email ?? item.user_id}</p>
                        <p>Sent: {new Date(item.created_at).toLocaleString()}</p>
                        {item.page_url ? <p className="break-all">Page: {item.page_url}</p> : null}
                        {item.browser_info ? <p>Device: {item.browser_info}</p> : null}
                      </div>
                    </div>
                    <form action={updateFeedbackStatus} className="grid min-w-0 gap-2 md:w-72">
                      <input type="hidden" name="feedback_id" value={item.id} />
                      <select name="status" defaultValue={item.status} className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm">
                        <option value="new">New</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="in_progress">In progress</option>
                        <option value="handled">Handled</option>
                        <option value="closed">Closed</option>
                      </select>
                      <textarea name="status_note" defaultValue={item.status_note ?? ""} placeholder="Admin note, optional" className="min-h-20 rounded-lg border border-white/10 bg-slate-950/70 p-3 text-xs outline-none focus:border-amber-300" />
                      <button className="h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Update status</button>
                    </form>
                  </div>

                  <details className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-slate-300">Status history</summary>
                    <div className="mt-3 space-y-2">
                      {events.length ? events.map((event) => (
                        <div key={event.id} className="rounded-md bg-black/35 p-2 text-xs text-slate-300">
                          <p>
                            {feedbackStatusLabel(event.previous_status)} - {feedbackStatusLabel(event.next_status)}
                            {" "}by {event.profiles?.email ?? event.admin_user_id ?? "admin"}
                          </p>
                          {event.note ? <p className="mt-1 text-slate-400">{event.note}</p> : null}
                          <p className="mt-1 text-slate-600">{new Date(event.created_at).toLocaleString()}</p>
                        </div>
                      )) : <p className="text-xs text-slate-500">No status changes recorded yet.</p>}
                    </div>
                  </details>
                </article>
              );
            }) : <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">No feedback submitted yet.</p>}
          </div>
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
          <h2 className="font-bold text-white">Catalog offer controls</h2>
          <p className="mt-1 text-xs text-slate-400">Disable bad retailer offers without deleting historical data.</p>
          <div className="mt-4 space-y-3 text-sm">
            {recentOffers?.length ? recentOffers.map((offer) => (
              <div key={offer.id} className="rounded-lg bg-white/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{offer.title ?? "Untitled offer"}</p>
                    <p className="mt-1 text-slate-400">{offer.retailer ?? offer.store_name} - {offer.status} - ${offer.last_price ?? offer.price ?? "n/a"}</p>
                    <p className="mt-1 truncate text-xs text-slate-600">{offer.url}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${offer.active === false ? "bg-red-400/20 text-red-100" : "bg-emerald-400/15 text-emerald-200"}`}>
                    {offer.active === false ? "Disabled" : "Active"}
                  </span>
                </div>
                {offer.active === false ? null : (
                  <form action={disableCatalogOffer} className="mt-3">
                    <input type="hidden" name="offer_id" value={offer.id} />
                    <button className="h-9 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100">Disable offer</button>
                  </form>
                )}
              </div>
            )) : <p className="text-sm text-slate-400">No catalog offers found.</p>}
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
          <form action={runMonitorJobsNow} className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
            <p className="text-sm font-semibold text-white">Leased monitor worker</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">Enqueue active catalog offers, atomically claim due jobs, run a bounded batch, and reschedule with jitter/backoff.</p>
            <button className="mt-3 h-10 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950">Run worker batch</button>
          </form>
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
          <h2 className="font-bold text-white">Retailer rollout</h2>
          <p className="mt-1 text-xs text-slate-400">Publicly enabled retailers are separated from discovered or planned retailers. Local inventory is only claimed when a supported adapter exists.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {retailerRollout?.length ? retailerRollout.map((retailer) => (
              <div key={retailer.retailer} className="rounded-lg bg-white/5 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{retailer.display_name}</p>
                    <p className="mt-1 text-xs text-slate-500">Tier {retailer.tier} - {retailer.acquisition_method}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${retailer.public_enabled ? "bg-emerald-300/15 text-emerald-200" : "bg-white/10 text-slate-300"}`}>
                    {retailer.public_enabled ? "Enabled" : retailer.support_state}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{retailer.notes}</p>
                <div className="mt-3 flex flex-wrap gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                  {retailer.product_discovery ? <span className="rounded-full bg-cyan-300/15 px-2 py-1 text-cyan-100">Discovery</span> : null}
                  {retailer.online_inventory ? <span className="rounded-full bg-amber-300/15 px-2 py-1 text-amber-100">Online</span> : null}
                  {retailer.local_inventory ? <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-emerald-100">Local</span> : null}
                  {retailer.price_tracking ? <span className="rounded-full bg-white/10 px-2 py-1">Price</span> : null}
                </div>
              </div>
            )) : <p className="text-sm text-slate-400">Run migration 028 to seed retailer rollout records.</p>}
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
          <h2 className="font-bold text-white">Failed scans and operations</h2>
          <div className="mt-4 space-y-3 text-sm">
            {appEvents?.length ? appEvents.map((event) => (
              <div key={event.id} className="rounded-lg bg-white/5 p-3">
                <p className="font-medium">{event.category} - {event.severity}</p>
                <p className="mt-1 text-slate-300">{event.message}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            )) : <p className="text-sm text-slate-400">No warning or error events recorded.</p>}
          </div>
        </div>

        <div className={`${scrollPanelClass} lg:col-span-2`}>
          <h2 className="font-bold text-white">Notification logs</h2>
          <div className="mt-4 space-y-3 text-sm">
            {notifications?.map((item) => <p key={item.id} className="rounded-lg bg-white/5 p-3">{item.title}</p>)}
          </div>
        </div>

        <div className={`${scrollPanelClass} lg:col-span-2`}>
          <h2 className="font-bold text-white">Restock pipeline</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Recent events</p>
              <div className="mt-2 space-y-2 text-sm">
                {restockEvents?.length ? restockEvents.map((event) => (
                  <div key={event.id} className="rounded-lg bg-white/5 p-3">
                    <p className="font-medium text-white">{event.new_status} - ${event.price ?? "n/a"} {event.is_test ? "(test)" : ""}</p>
                    <p className="mt-1 text-xs text-slate-500">{event.event_source} - {event.notification_status}</p>
                  </div>
                )) : <p className="text-sm text-slate-400">No restock events recorded yet.</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Notification outbox</p>
              <div className="mt-2 space-y-2 text-sm">
                {outboxJobs?.length ? outboxJobs.map((job) => (
                  <div key={job.id} className="rounded-lg bg-white/5 p-3">
                    <p className="font-medium text-white">{job.channel} - {job.status} {job.is_test ? "(test)" : ""}</p>
                    <p className="mt-1 text-xs text-slate-500">Attempts {job.attempts} - {new Date(job.created_at).toLocaleString()}</p>
                    {job.error_message ? <p className="mt-1 text-xs text-rose-200">{job.error_message}</p> : null}
                  </div>
                )) : <p className="text-sm text-slate-400">No outbox jobs recorded yet.</p>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function feedbackStatusLabel(status: FeedbackStatus | null) {
  return status ? status.replace(/_/g, " ") : "none";
}

function feedbackStatusClass(status: FeedbackStatus) {
  if (status === "handled") return "bg-emerald-400/15 text-emerald-200";
  if (status === "in_progress") return "bg-cyan-300/15 text-cyan-100";
  if (status === "reviewed") return "bg-amber-300/15 text-amber-100";
  if (status === "closed") return "bg-white/10 text-slate-300";
  return "bg-slate-700/70 text-slate-200";
}

