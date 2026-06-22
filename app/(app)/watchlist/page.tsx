import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { currency } from "@/lib/profit";
import type { TrackedProduct } from "@/lib/types";
import { addProduct, checkOwnProduct } from "./actions";

export default async function WatchlistPage() {
  const { supabase, user } = await requireUser();
  const { data: products } = await supabase.from("tracked_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<TrackedProduct[]>();

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <h1 className="text-2xl font-black text-white">Add product</h1>
        <form action={addProduct} className="mt-5 space-y-3">
          {[
            ["name", "Product name"],
            ["store_name", "Store name"],
            ["url", "Product URL"],
            ["category", "Category"],
            ["set_name", "Set name"],
            ["image_url", "Product image URL"],
            ["msrp", "MSRP"],
            ["target_price", "Target price"]
          ].map(([name, label]) => (
            <input key={name} name={name} placeholder={label} className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-teal-300" />
          ))}
          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input name="alerts_enabled" value="true" type="checkbox" className="h-4 w-4" />
            Alerts enabled
          </label>
          <textarea name="notes" placeholder="Notes" className="min-h-24 w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-teal-300" />
          <button className="h-11 w-full rounded-lg bg-teal-300 font-semibold text-slate-950">Add to watchlist</button>
        </form>
      </section>
      <section>
        <div className="mb-4">
          <p className="text-sm font-semibold text-teal-200">Watchlist</p>
          <h2 className="mt-1 text-3xl font-black text-white">Tracked products</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {products?.length ? products.map((product) => (
            <article key={product.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
              <div className="relative aspect-[16/10] bg-slate-900">
                {product.image_url ? <Image src={product.image_url} alt={product.name} fill className="object-cover" /> : <div className="grid h-full place-items-center text-slate-500">No image</div>}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-white">{product.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{product.store_name}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">{product.status.replaceAll("_", " ")}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-slate-500">Last price</p><p>{currency(product.last_price)}</p></div>
                  <div><p className="text-slate-500">Last checked</p><p>{product.last_checked_at ? new Date(product.last_checked_at).toLocaleDateString() : "Never"}</p></div>
                </div>
                <div className="mt-4 flex gap-2">
                  <form action={checkOwnProduct.bind(null, product.id)}>
                    <button className="h-10 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950">Check now</button>
                  </form>
                  <a href={product.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm">
                    <ExternalLink className="h-4 w-4" />
                    Open store
                  </a>
                </div>
              </div>
            </article>
          )) : <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-slate-300">No products yet. Add your first watch above.</div>}
        </div>
      </section>
    </div>
  );
}
