"use client";

import { useState, useTransition } from "react";
import { BellOff, BellPlus, Check } from "lucide-react";
import { trackCatalogProduct, untrackCatalogProduct } from "@/app/(app)/watchlist/actions";

export function ProductTrackButton({ productId, initialTracked }: { productId: string; initialTracked: boolean }) {
  const [tracked, setTracked] = useState(initialTracked);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function track() {
    startTransition(async () => {
      setMessage("");
      try {
        if (tracked) {
          await untrackCatalogProduct(productId);
          setTracked(false);
          setMessage("Tracking disabled for this product.");
        } else {
          await trackCatalogProduct(productId);
          setTracked(true);
          setMessage("Tracking enabled. Restock alerts will cover every offer for this product.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not update tracking.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={track}
        className={`inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-60 ${tracked ? "border border-red-300/30 text-red-100 hover:bg-red-400/10" : "bg-amber-300 text-slate-950"}`}
      >
        {tracked ? (pending ? <Check className="h-4 w-4" /> : <BellOff className="h-4 w-4" />) : <BellPlus className="h-4 w-4" />}
        {pending ? "Updating..." : tracked ? "Untrack this product" : "Track this product"}
      </button>
      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
    </div>
  );
}

