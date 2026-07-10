"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import {
  syncAllAvailableCatalogsWithState,
  type SyncActionState
} from "@/app/(app)/admin/actions";

const initialState: SyncActionState = { ok: null };

export function AdminSyncPanel() {
  const [state, action, pending] = useActionState(syncAllAvailableCatalogsWithState, initialState);
  const result = state.result;

  return (
    <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
      <p className="text-sm font-semibold text-white">Sync all available catalogs</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">
        Imports TCGCSV products, optional Best Buy/API and retailer search sources, checks existing offers, and triggers restock alerts.
      </p>
      <form action={action}>
        <button
          disabled={pending}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Syncing catalogs..." : "Sync catalogs"}
        </button>
      </form>

      {state.ok === false ? (
        <p className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-100">
          {state.error}
        </p>
      ) : null}

      {state.ok && result ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <p>Products: <strong className="text-white">{result.productsImported}</strong></p>
            <p>Offers: <strong className="text-white">{result.offersImported}</strong></p>
            <p>Checked: <strong className="text-white">{result.offersChecked}</strong></p>
            <p>Alerts: <strong className="text-white">{result.alertsTriggered}</strong></p>
          </div>
          <div className="mt-3 space-y-1">
            {(Object.entries(result.sources) as Array<[string, {
              skipped?: boolean;
              reason?: string;
              ok: boolean;
            }]>).map(([name, source]) => (
              <p key={name}>
                <span className="font-semibold text-white">{name}:</span>{" "}
                {source.skipped ? `skipped - ${source.reason}` : source.ok ? "completed" : "failed"}
              </p>
            ))}
          </div>
          {result.errors.length ? (
            <div className="mt-3 space-y-1 text-red-200">
              {result.errors.map((error) => <p key={error}>{error}</p>)}
            </div>
          ) : (
            <p className="mt-3 text-amber-200">Sync completed without reported errors.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

