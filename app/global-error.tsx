"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { PackWatcherSplash } from "@/components/packwatcher-splash";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="grid min-h-[100dvh] place-items-center bg-[#050507] px-5 text-white">
          <div className="w-full max-w-md rounded-lg border border-red-400/25 bg-red-400/10 p-6">
            <PackWatcherSplash variant="app-boot" fullScreen={false} message="Loading" />
            <h1 className="mt-6 text-xl font-black">PackWatcher hit an error.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">The issue was reported. Try loading the app again.</p>
            <button type="button" onClick={reset} className="mt-4 h-10 rounded-lg bg-amber-300 px-4 text-sm font-black text-slate-950">
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

