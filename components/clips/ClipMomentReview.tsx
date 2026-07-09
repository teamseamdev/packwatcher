"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { currency, type ClipMomentWithCard } from "@/lib/clips/types";

type EditableMoment = {
  momentId: string;
  includeInExport: boolean;
  timestampStart: string;
  timestampEnd: string;
  cardName: string;
  setName: string;
  cardNumber: string;
  variant: string;
  estimatedValue: string;
  thumbnailUrl: string | null;
  confidence: number;
};

export function ClipMomentReview({
  projectId,
  totalCost,
  moments,
  fallbackMessage
}: {
  projectId: string;
  totalCost: number;
  moments: ClipMomentWithCard[];
  fallbackMessage: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<EditableMoment[]>(() => moments.map((moment) => ({
    momentId: moment.id,
    includeInExport: moment.include_in_export,
    timestampStart: String(moment.timestamp_start),
    timestampEnd: String(moment.timestamp_end),
    cardName: moment.card?.card_name ?? "",
    setName: moment.card?.set_name ?? "",
    cardNumber: moment.card?.card_number ?? "",
    variant: moment.card?.variant ?? "",
    estimatedValue: String(moment.card?.estimated_value ?? 0),
    thumbnailUrl: moment.signedThumbnailUrl ?? null,
    confidence: moment.confidence
  })));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const totalPulls = items
      .filter((item) => item.includeInExport)
      .reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0);
    return {
      totalPulls,
      profit: totalPulls - totalCost
    };
  }, [items, totalCost]);

  function updateItem(index: number, patch: Partial<EditableMoment>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function saveReview() {
    setIsSaving(true);
    setError(null);

    const response = await fetch(`/api/clips/projects/${projectId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        moments: items.map((item) => ({
          momentId: item.momentId,
          includeInExport: item.includeInExport,
          timestampStart: Number(item.timestampStart || 0),
          timestampEnd: Number(item.timestampEnd || 0),
          cardName: item.cardName,
          setName: item.setName || null,
          cardNumber: item.cardNumber || null,
          variant: item.variant || null,
          estimatedValue: Number(item.estimatedValue || 0)
        }))
      })
    });

    setIsSaving(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      setError(body?.error ?? "Could not save review.");
      return;
    }

    router.push(`/clips/${projectId}/export`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {fallbackMessage ? (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
          {fallbackMessage}
        </div>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Cost" value={currency(totalCost)} />
        <Summary label="Pull value" value={currency(totals.totalPulls)} />
        <Summary label="Profit/loss" value={currency(totals.profit)} tone={totals.profit >= 0 ? "positive" : "negative"} />
      </section>
      <div className="space-y-4">
        {items.map((item, index) => (
          <article key={item.momentId} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950">
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <div className="grid aspect-video place-items-center text-sm text-slate-400">Manual moment</div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                    <input
                      type="checkbox"
                      checked={item.includeInExport}
                      onChange={(event) => updateItem(index, { includeInExport: event.target.checked })}
                      className="h-4 w-4"
                    />
                    Include in export
                  </label>
                  <span className="text-xs text-slate-400">{Math.round(item.confidence * 100)}% local confidence</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" value={item.timestampStart} onChange={(value) => updateItem(index, { timestampStart: value })} type="number" step="0.01" />
                  <Field label="End" value={item.timestampEnd} onChange={(value) => updateItem(index, { timestampEnd: value })} type="number" step="0.01" />
                </div>
                <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr]">
                  <Field label="Card name" value={item.cardName} onChange={(value) => updateItem(index, { cardName: value })} placeholder="Charizard ex" />
                  <Field label="Value" value={item.estimatedValue} onChange={(value) => updateItem(index, { estimatedValue: value })} type="number" step="0.01" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Set" value={item.setName} onChange={(value) => updateItem(index, { setName: value })} />
                  <Field label="Card #" value={item.cardNumber} onChange={(value) => updateItem(index, { cardNumber: value })} />
                  <Field label="Variant" value={item.variant} onChange={(value) => updateItem(index, { variant: value })} />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {error ? <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
      <button
        type="button"
        onClick={() => void saveReview()}
        disabled={isSaving}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 font-bold text-slate-950 disabled:cursor-wait disabled:opacity-70 md:w-auto md:px-6"
      >
        {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
        Save review and continue
      </button>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black ${tone === "positive" ? "text-amber-200" : tone === "negative" ? "text-rose-200" : "text-white"}`}>{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        step={step}
        placeholder={placeholder}
        className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none focus:border-amber-300"
      />
    </label>
  );
}

