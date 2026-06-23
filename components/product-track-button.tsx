"use client";

import { useState, useTransition } from "react";
import { BellPlus, Check } from "lucide-react";
import { trackCatalogProduct } from "@/app/(app)/watchlist/actions";

export function ProductTrackButton({ productId, initialTracked }: { productId: string; initialTracked: boolean }) {
  const [tracked, setTracked] = useState(initialTracked);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function track() {
    startTransition(async () => {
      setMessage("");
      try {
        await trackCatalogProduct(productId);
        setTracked(true);
        setMessage("Tracking enabled. Restock alerts will cover every offer for this product.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not track this product.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={tracked || pending}
        onClick={track}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-60"
      >
        {tracked ? <Check className="h-4 w-4" /> : <BellPlus className="h-4 w-4" />}
        {tracked ? "Tracking this product" : pending ? "Enabling alerts..." : "Track this product"}
      </button>
      {message ? <p className="mt-3 text-sm text-teal-200">{message}</p> : null}
    </div>
  );
}
