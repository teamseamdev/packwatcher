import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard, ExternalLink, Lightbulb, LogOut, MapPin, MessageSquareWarning, Shield, Store, UserRound } from "lucide-react";
import { AccountPlanSwitcher } from "@/components/account-plan-switcher";
import { LocationPostalCodeField } from "@/components/location-postal-code-field";
import { PushNotificationSettings } from "@/components/push-notification-settings";
import { requireProfile } from "@/lib/auth";
import { fetchEbaySellerSettings, type EbaySellerSettingsResult } from "@/lib/ebay/seller-settings";
import type { EbayMerchantLocationOption, EbaySellerPolicyOption } from "@/lib/ebay/seller-settings-normalize";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EbayConnection, EbayListingDefaults, FeedbackItem, FeedbackStatus } from "@/lib/types";
import { disconnectEbay, saveEbayDefaults, submitFeedback, switchToFreePlan, updatePostalCode } from "./actions";

async function signOut() {
  "use server";
  const { supabase } = await requireProfile();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function AccountPage() {
  const { supabase, user, profile } = await requireProfile();
  const admin = createAdminClient();
  const [{ count: subscriptionCount }, { data: feedbackItems }, { data: ebayConnection }, { data: ebayDefaults }] = await Promise.all([
    supabase.from("push_subscriptions").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("feedback_items")
      .select("*, feedback_status_events(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<FeedbackItem[]>(),
    admin.from("ebay_connections").select("user_id,ebay_user_id,ebay_username,environment,marketplace_id,access_token_expires_at,token_scope,refresh_token_expires_at,status,last_refreshed_at,last_error,connected_at,updated_at").eq("user_id", user.id).maybeSingle<EbayConnection>(),
    supabase.from("ebay_listing_defaults").select("*").eq("user_id", user.id).maybeSingle<EbayListingDefaults>()
  ]);
  const ebayMarketplace = ebayDefaults?.marketplace_id ?? ebayConnection?.marketplace_id ?? "EBAY_US";
  let ebaySellerSettings: EbaySellerSettingsResult | null = null;
  if (ebayConnection && ebayConnection.status !== "reauthorization_required" && ebayConnection.status !== "disconnected") {
    try {
      ebaySellerSettings = await fetchEbaySellerSettings(admin, user.id, ebayMarketplace);
    } catch (error) {
      ebaySellerSettings = {
        marketplaceId: ebayMarketplace,
        paymentPolicies: [],
        fulfillmentPolicies: [],
        returnPolicies: [],
        merchantLocations: [],
        errors: [{ source: "seller settings", message: error instanceof Error ? error.message : "Could not load eBay seller settings." }]
      };
    }
  }
  const missingEbaySetup = Boolean(ebaySellerSettings && (
    ebaySellerSettings.paymentPolicies.length === 0
    || ebaySellerSettings.fulfillmentPolicies.length === 0
    || ebaySellerSettings.returnPolicies.length === 0
    || ebaySellerSettings.merchantLocations.length === 0
  ));

  return (
    <div className="max-w-5xl space-y-5">
      <header className="pw-hero p-5">
        <p className="pw-hud text-xs font-black">Account</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">Settings</h1>
            <p className="mt-2 text-sm text-slate-400">Manage your alerts, location, plan, and account access.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-300 px-3 py-1 text-xs font-black uppercase text-slate-950">
            <CreditCard className="h-3.5 w-3.5" />
            {profile?.plan ?? "free"}
          </span>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start gap-3">
            <UserRound className="mt-1 h-5 w-5 text-amber-300" />
            <div className="min-w-0">
              <h2 className="font-bold text-white">Profile</h2>
              <p className="mt-1 break-all text-sm text-slate-300">{user.email}</p>
              <p className="mt-3 break-all text-xs text-slate-600">{user.id}</p>
            </div>
          </div>
          <form action={signOut} className="mt-5">
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>

        <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 h-5 w-5 text-amber-300" />
            <div>
              <h2 className="font-bold text-white">Default ZIP code</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Used to prioritize nearby pickup results. Type a ZIP, use Locate me, or override ZIP on Watchlist for one-off searches.</p>
            </div>
          </div>
          <form action={updatePostalCode} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <LocationPostalCodeField
              name="postal_code"
              defaultValue={profile?.postal_code ?? ""}
              placeholder="ZIP code"
              className="min-w-0"
              inputClassName="h-11"
              buttonClassName="h-11"
            />
            <button className="h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">Save</button>
          </form>
        </section>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PushNotificationSettings
          publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
          subscriptionCount={subscriptionCount ?? 0}
          className="h-full"
        />
        <AccountPlanSwitcher currentPlan={profile?.plan ?? "free"} className="h-full" />
      </section>

      <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <Store className="mt-1 h-5 w-5 text-amber-300" />
            <div>
              <h2 className="font-bold text-white">eBay selling</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Connect eBay, save seller policy defaults, then publish inventory cards from the Inventory page.</p>
              <p className="mt-2 text-xs text-slate-500">Seller Hub business policies and an inventory location are required before eBay will publish listings.</p>
            </div>
          </div>
          {ebayConnection ? (
            <div className="flex flex-wrap gap-2">
              {ebayConnection.status === "reauthorization_required" ? (
                <Link href="/api/ebay/oauth/start?returnTo=%2Faccount%3Fsection%3Debay" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950">
                  <ExternalLink className="h-4 w-4" />
                  Reconnect eBay
                </Link>
              ) : null}
              <form action={disconnectEbay}>
                <button className="h-10 rounded-lg border border-rose-300/30 px-4 text-sm font-semibold text-rose-100">Disconnect eBay</button>
              </form>
            </div>
          ) : (
            <Link href="/api/ebay/oauth/start?returnTo=%2Faccount%3Fsection%3Debay" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950">
              <ExternalLink className="h-4 w-4" />
              Connect eBay
            </Link>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm">
          <p className="font-semibold text-white">Status: {ebayConnection ? ebayStatusLabel(ebayConnection.status) : "Not connected"}</p>
          {ebayConnection ? (
            <div className="mt-1 space-y-1 text-xs text-slate-500">
              <p>Account: {ebayConnection.ebay_username || ebayConnection.ebay_user_id || "Connected eBay account"}</p>
              <p>Marketplace: {ebayConnection.marketplace_id ?? ebayDefaults?.marketplace_id ?? "EBAY_US"}</p>
              <p>Environment: {ebayConnection.environment} - Connected {new Date(ebayConnection.connected_at).toLocaleString()}</p>
              {ebayConnection.last_refreshed_at ? <p>Token refreshed: {new Date(ebayConnection.last_refreshed_at).toLocaleString()}</p> : null}
              {ebayConnection.status === "reauthorization_required" ? <p className="text-rose-200">Reconnect required: {ebayConnection.last_error ?? "eBay authorization expired or was revoked."}</p> : null}
            </div>
          ) : null}
        </div>

        <form action={saveEbayDefaults} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field name="marketplace_id" label="Marketplace" defaultValue={ebayDefaults?.marketplace_id ?? "EBAY_US"} />
            <Field name="category_id" label="Category ID" defaultValue={ebayDefaults?.category_id ?? "183454"} />
            <Field name="condition" label="Condition" defaultValue={ebayDefaults?.condition ?? "USED_EXCELLENT"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LocationSelect
              name="merchant_location_key"
              label="Inventory location"
              currentValue={ebayDefaults?.merchant_location_key ?? ""}
              options={ebaySellerSettings?.merchantLocations ?? []}
              disabled={!ebayConnection || ebayConnection.status === "reauthorization_required"}
            />
            <PolicySelect
              name="fulfillment_policy_id"
              label="Shipping/fulfillment policy"
              currentValue={ebayDefaults?.fulfillment_policy_id ?? ""}
              options={ebaySellerSettings?.fulfillmentPolicies ?? []}
              disabled={!ebayConnection || ebayConnection.status === "reauthorization_required"}
            />
            <PolicySelect
              name="payment_policy_id"
              label="Payment policy"
              currentValue={ebayDefaults?.payment_policy_id ?? ""}
              options={ebaySellerSettings?.paymentPolicies ?? []}
              disabled={!ebayConnection || ebayConnection.status === "reauthorization_required"}
            />
            <PolicySelect
              name="return_policy_id"
              label="Return policy"
              currentValue={ebayDefaults?.return_policy_id ?? ""}
              options={ebaySellerSettings?.returnPolicies ?? []}
              disabled={!ebayConnection || ebayConnection.status === "reauthorization_required"}
            />
          </div>
          {ebayConnection ? (
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-400">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  {missingEbaySetup ? <p className="font-semibold text-amber-100">Create your eBay business policies in Seller Hub, then refresh.</p> : <p className="font-semibold text-emerald-100">Seller policies and inventory locations loaded from eBay.</p>}
                  {ebaySellerSettings?.errors.length ? (
                    <div className="space-y-1 text-rose-200">
                      {ebaySellerSettings.errors.map((error) => (
                        <p key={`${error.source}:${error.message}`}>{error.source}: {error.message}</p>
                      ))}
                    </div>
                  ) : null}
                  <p>Manual ID entry is available below each dropdown for advanced fallback or newly created eBay objects that have not appeared yet.</p>
                </div>
                <Link href="/account?section=ebay&refresh=1" className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 px-3 text-xs font-bold text-amber-100">
                  Refresh
                </Link>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[120px_120px_auto]">
            <Field name="currency" label="Currency" defaultValue={ebayDefaults?.currency ?? "USD"} />
            <Field name="listing_duration" label="Duration" defaultValue={ebayDefaults?.listing_duration ?? "GTC"} />
            <button className="h-11 self-end rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">Save eBay defaults</button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start gap-3">
            <MessageSquareWarning className="mt-1 h-5 w-5 text-amber-300" />
            <div>
              <h2 className="font-bold text-white">Feedback</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Send suggestions, bugs, or issues directly to the PackWatcher admin queue.</p>
            </div>
          </div>
          <form action={submitFeedback} className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <select name="type" defaultValue="suggestion" className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300">
                <option value="suggestion">Suggestion</option>
                <option value="bug">Bug</option>
                <option value="issue">Issue</option>
                <option value="other">Other</option>
              </select>
              <input name="title" placeholder="Short title" maxLength={140} className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            </div>
            <textarea name="message" placeholder="What happened, or what should PackWatcher improve?" maxLength={2000} className="min-h-32 rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm outline-none focus:border-amber-300" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="page_url" placeholder="Page URL, optional" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
              <input name="browser_info" placeholder="Device/browser, optional" className="h-10 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
            </div>
            <button className="h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">Send feedback</button>
          </form>
        </section>

        <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-1 h-5 w-5 text-amber-300" />
            <div>
              <h2 className="font-bold text-white">Recent feedback</h2>
              <p className="mt-1 text-sm text-slate-400">Status updates from the admin team.</p>
            </div>
          </div>
          <div className="scroll-panel mt-4 max-h-80 space-y-3 pr-1">
            {feedbackItems?.length ? feedbackItems.map((item) => (
              <article key={item.id} className="rounded-lg border border-cyan-300/10 bg-black/40 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.type} - {new Date(item.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${feedbackStatusClass(item.status)}`}>{feedbackStatusLabel(item.status)}</span>
                </div>
                {item.status_note ? <p className="mt-2 text-xs text-slate-300">{item.status_note}</p> : null}
              </article>
            )) : (
              <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">No feedback sent yet.</p>
            )}
          </div>
        </section>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {profile?.plan === "pro" ? (
          <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="font-bold text-white">Switch to Free</h2>
            <p className="mt-2 text-sm text-slate-400">Downgrade your PackWatcher account. Stripe subscriptions are cancelled at period end when attached.</p>
            <form action={switchToFreePlan} className="mt-4">
              <button className="h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">Switch to Free</button>
            </form>
          </section>
        ) : null}
        {profile?.plan === "admin" ? (
          <section className="pw-panel rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
            <div className="flex items-start gap-3">
              <Shield className="mt-1 h-5 w-5 text-amber-300" />
              <div>
                <h2 className="font-bold text-white">Admin access</h2>
                <p className="mt-2 text-sm text-slate-300">Manage catalog imports, users, checks, and notification logs.</p>
              </div>
            </div>
            <Link href="/admin" className="mt-4 inline-flex h-10 items-center rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">
              Open Admin
            </Link>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function feedbackStatusLabel(status: FeedbackStatus) {
  return status.replace(/_/g, " ");
}

function ebayStatusLabel(status: string | null | undefined) {
  if (status === "reauthorization_required") return "Reconnect required";
  if (status === "disconnected") return "Disconnected";
  return "Connected";
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input name={name} defaultValue={defaultValue} className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300" />
    </label>
  );
}

function PolicySelect({
  name,
  label,
  currentValue,
  options,
  disabled
}: {
  name: string;
  label: string;
  currentValue: string;
  options: EbaySellerPolicyOption[];
  disabled: boolean;
}) {
  return (
    <SelectWithManual
      name={name}
      label={label}
      currentValue={currentValue}
      options={options.map((option) => ({
        value: option.id,
        label: option.name,
        detail: [option.id, option.marketplaceId, option.description].filter(Boolean).join(" - ")
      }))}
      disabled={disabled}
      emptyMessage="Create your eBay business policies in Seller Hub, then refresh."
    />
  );
}

function LocationSelect({
  name,
  label,
  currentValue,
  options,
  disabled
}: {
  name: string;
  label: string;
  currentValue: string;
  options: EbayMerchantLocationOption[];
  disabled: boolean;
}) {
  return (
    <SelectWithManual
      name={name}
      label={label}
      currentValue={currentValue}
      options={options.map((option) => ({
        value: option.key,
        label: option.name,
        detail: [option.key, option.status, option.addressSummary].filter(Boolean).join(" - ")
      }))}
      disabled={disabled}
      emptyMessage="Create your eBay business policies in Seller Hub, then refresh."
    />
  );
}

function SelectWithManual({
  name,
  label,
  currentValue,
  options,
  disabled,
  emptyMessage
}: {
  name: string;
  label: string;
  currentValue: string;
  options: Array<{ value: string; label: string; detail: string }>;
  disabled: boolean;
  emptyMessage: string;
}) {
  const hasCurrentOption = currentValue && options.some((option) => option.value === currentValue);
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        name={name}
        defaultValue={currentValue}
        disabled={disabled}
        className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{disabled ? "Connect eBay first" : `Select ${label.toLowerCase()}`}</option>
        {currentValue && !hasCurrentOption ? <option value={currentValue}>{currentValue} (saved)</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label} - {option.value}</option>
        ))}
      </select>
      {options.length === 0 && !disabled ? <span className="text-xs text-amber-100">{emptyMessage}</span> : null}
      {options.length ? (
        <span className="text-[11px] text-slate-600">
          {options.slice(0, 2).map((option) => option.detail).join(" | ")}
        </span>
      ) : null}
      <details className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-400">Advanced manual entry</summary>
        <input
          name={`${name}_manual`}
          placeholder={`Manual ${label.toLowerCase()} ID`}
          className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300"
        />
      </details>
    </label>
  );
}

function feedbackStatusClass(status: FeedbackStatus) {
  if (status === "handled") return "bg-emerald-400/15 text-emerald-200";
  if (status === "in_progress") return "bg-cyan-300/15 text-cyan-100";
  if (status === "reviewed") return "bg-amber-300/15 text-amber-100";
  if (status === "closed") return "bg-white/10 text-slate-300";
  return "bg-slate-700/70 text-slate-200";
}

