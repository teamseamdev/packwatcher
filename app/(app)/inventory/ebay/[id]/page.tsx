import Link from "next/link";
import { ArrowLeft, ExternalLink, Store } from "lucide-react";
import { publishInventoryItemToEbay } from "@/app/(app)/inventory/ebay/actions";
import { requireUser } from "@/lib/auth";
import { cleanCardName } from "@/lib/cards/card-name";
import { normalizeCollectorNumber } from "@/lib/cards/collector-number";
import { defaultEbayListingDefaults, ebayCardDescription, ebayCardTitle, missingEbayDefaults } from "@/lib/ebay/listing-builder";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EbayConnection, EbayListing, EbayListingDefaults, InventoryItem } from "@/lib/types";

export default async function EbayInventoryListingPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const returnPath = safeInventoryReturnPath(returnTo);
  const { supabase, user } = await requireUser();
  const admin = createAdminClient();

  const [{ data: item }, { data: connection }, { data: defaults }, { data: listings }] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("id", id).eq("user_id", user.id).single<InventoryItem>(),
    admin.from("ebay_connections").select("user_id,ebay_user_id,ebay_username,environment,marketplace_id,token_scope,refresh_token_expires_at,status,last_error,connected_at,updated_at").eq("user_id", user.id).maybeSingle<EbayConnection>(),
    supabase.from("ebay_listing_defaults").select("*").eq("user_id", user.id).maybeSingle<EbayListingDefaults>(),
    supabase.from("ebay_listings").select("*").eq("inventory_item_id", id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5).returns<EbayListing[]>()
  ]);

  if (!item) {
    return (
      <div className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-6">
        <h1 className="text-2xl font-black text-white">Inventory item not found</h1>
        <Link href="/inventory" className="mt-4 inline-flex h-10 items-center rounded-lg bg-amber-300 px-4 text-sm font-bold text-slate-950">Back to inventory</Link>
      </div>
    );
  }

  const listingDefaults = defaultEbayListingDefaults(user.id, defaults);
  const missing = missingEbayDefaults(listingDefaults);
  const needsReconnect = connection?.status === "reauthorization_required";
  const canPublish = Boolean(connection) && !needsReconnect && !missing.length && Boolean(item.image_url);
  const cleanDisplayName = cleanCardName({
    rawName: item.card_name ?? item.name,
    rawCollectorNumber: item.card_number,
    normalizedCollectorNumber: normalizeCollectorNumber(item.card_number)?.normalized
  }).canonicalName;

  return (
    <div className="max-w-4xl space-y-5">
      <Link href={returnPath} className="inline-flex items-center gap-2 text-sm font-bold text-slate-300">
        <ArrowLeft className="h-4 w-4" />
        Back to inventory
      </Link>

      <header className="pw-hero p-5">
        <p className="pw-hud text-xs font-black">eBay</p>
        <h1 className="mt-1 text-3xl font-black text-white">Sell inventory card</h1>
        <p className="mt-2 text-sm text-slate-400">Review the draft, confirm seller policies, then publish to your connected eBay account.</p>
      </header>

      <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="grid gap-4 sm:grid-cols-[96px_1fr]">
          {item.image_url ? (
            <div className="aspect-[63/88] rounded-lg bg-slate-950 bg-cover bg-center" style={{ backgroundImage: `url(${item.image_url})` }} />
          ) : (
            <div className="grid aspect-[63/88] place-items-center rounded-lg border border-dashed border-white/15 bg-white/5 text-xs uppercase tracking-wide text-slate-500">No image</div>
          )}
          <div>
            <h2 className="text-xl font-black text-white">{cleanDisplayName}</h2>
            <p className="mt-1 text-sm text-slate-400">{[item.card_number, item.set_name, item.variant, item.foil ? "Foil" : null].filter(Boolean).join(" - ") || "No set details"}</p>
            <p className="mt-3 text-sm text-slate-300">Estimated value: <span className="font-bold text-amber-200">${Number(item.estimated_sale_price ?? 0).toFixed(2)}</span></p>
          </div>
        </div>
      </section>

      {!connection || needsReconnect ? (
        <section className="pw-panel rounded-lg border border-amber-300/25 bg-amber-300/10 p-5">
          <h2 className="font-bold text-white">{needsReconnect ? "Reconnect eBay" : "Connect eBay first"}</h2>
          <p className="mt-2 text-sm text-slate-300">
            {needsReconnect ? "Your eBay authorization expired or was revoked. Reconnect eBay to publish listings." : "PackWatcher needs your eBay consent before it can create listings for your seller account."}
          </p>
          <Link href={`/api/ebay/oauth/start?returnTo=${encodeURIComponent(`/inventory/ebay/${item.id}?returnTo=${encodeURIComponent(returnPath)}`)}`} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950">
            <ExternalLink className="h-4 w-4" />
            {needsReconnect ? "Reconnect eBay" : "Connect eBay"}
          </Link>
        </section>
      ) : null}

      {missing.length || !item.image_url ? (
        <section className="pw-panel rounded-lg border border-rose-300/25 bg-rose-500/10 p-5">
          <h2 className="font-bold text-white">Setup required</h2>
          <p className="mt-2 text-sm text-slate-300">eBay requires these before publishing:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-100">
            {!item.image_url ? <li>Add an image URL to this inventory card.</li> : null}
            {missing.map((label) => <li key={label}>{label}</li>)}
          </ul>
          <Link href="/account" className="mt-4 inline-flex h-10 items-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-100">Open Account settings</Link>
        </section>
      ) : null}

      <form action={publishInventoryItemToEbay} className="pw-panel grid gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <input type="hidden" name="inventory_item_id" value={item.id} />
        <div className="flex items-start gap-3">
          <Store className="mt-1 h-5 w-5 text-amber-300" />
          <div>
            <h2 className="font-bold text-white">Listing draft</h2>
            <p className="mt-1 text-sm text-slate-400">This creates a fixed-price eBay Inventory API listing.</p>
          </div>
        </div>

        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</span>
          <input name="title" maxLength={80} defaultValue={ebayCardTitle(item)} className={fieldClass} />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field name="price" label="Price" type="number" step="0.01" defaultValue={String(Math.max(0.99, Number(item.estimated_sale_price ?? 0)).toFixed(2))} />
          <Field name="quantity" label="Quantity" type="number" step="1" defaultValue={String(Math.max(1, item.quantity ?? 1))} />
          <Field name="condition" label="Condition" defaultValue={listingDefaults.condition} />
        </div>

        <textarea name="description" defaultValue={ebayCardDescription(item)} className="min-h-40 rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-100 outline-none focus:border-amber-300" />

        <div className="grid gap-3 sm:grid-cols-3">
          <Field name="marketplace_id" label="Marketplace" defaultValue={listingDefaults.marketplace_id} />
          <Field name="category_id" label="Category ID" defaultValue={listingDefaults.category_id} />
          <Field name="currency" label="Currency" defaultValue={listingDefaults.currency} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="merchant_location_key" label="Merchant location key" defaultValue={listingDefaults.merchant_location_key ?? ""} />
          <Field name="fulfillment_policy_id" label="Shipping/fulfillment policy ID" defaultValue={listingDefaults.fulfillment_policy_id ?? ""} />
          <Field name="payment_policy_id" label="Payment policy ID" defaultValue={listingDefaults.payment_policy_id ?? ""} />
          <Field name="return_policy_id" label="Return policy ID" defaultValue={listingDefaults.return_policy_id ?? ""} />
        </div>

        <Field name="listing_duration" label="Listing duration" defaultValue={listingDefaults.listing_duration} />

        <button disabled={!canPublish} className="h-12 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:opacity-50">
          Publish and open eBay listing
        </button>
      </form>

      {listings?.length ? (
        <section className="pw-panel rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Recent eBay attempts</h2>
          <div className="mt-3 space-y-2">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm">
                <p className="font-semibold text-white">{listing.title}</p>
                <p className="mt-1 text-xs text-slate-500">{listing.status} - {new Date(listing.created_at).toLocaleString()}</p>
                {listing.listing_url ? <a href={listing.listing_url} className="mt-2 inline-flex text-amber-200" target="_blank" rel="noreferrer">Open listing</a> : null}
                {listing.error_message ? <p className="mt-2 text-xs text-rose-200">{listing.error_message}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

const fieldClass = "h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-amber-300";

function Field({ name, label, defaultValue, type = "text", step }: { name: string; label: string; defaultValue: string; type?: string; step?: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input name={name} type={type} step={step} defaultValue={defaultValue} className={fieldClass} />
    </label>
  );
}

function safeInventoryReturnPath(value?: string | null) {
  if (!value) return "/inventory";

  try {
    const parsed = new URL(value, "https://packwatcher.local");
    if (parsed.origin !== "https://packwatcher.local") return "/inventory";
    if (parsed.pathname !== "/inventory") return "/inventory";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/inventory";
  }
}
