import { BrandMark } from "@/components/brand-mark";
import { splashMessageForVariant, type SplashVariant } from "@/lib/loading/splash-copy";

export type PackWatcherSplashProps = {
  variant: SplashVariant;
  fullScreen?: boolean;
  message?: string;
};

export function PackWatcherSplash({ variant, fullScreen = true, message }: PackWatcherSplashProps) {
  const status = splashMessageForVariant(variant, message);

  return (
    <div
      className={[
        "pw-splash grid place-items-center overflow-hidden bg-[#050507] px-6 text-white",
        fullScreen ? "fixed inset-0 z-[200] min-h-[100dvh]" : "min-h-[320px] rounded-lg border border-white/10"
      ].join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative grid justify-items-center gap-6">
        <div className="pw-splash-frame relative grid h-44 w-44 place-items-center rounded-[1.75rem] border border-amber-300/30 bg-black/60 shadow-[0_0_54px_rgba(255,208,47,0.22)]">
          <span className="pw-splash-corner left-4 top-4 border-l border-t" aria-hidden="true" />
          <span className="pw-splash-corner right-4 top-4 border-r border-t" aria-hidden="true" />
          <span className="pw-splash-corner bottom-4 left-4 border-b border-l" aria-hidden="true" />
          <span className="pw-splash-corner bottom-4 right-4 border-b border-r" aria-hidden="true" />
          <span className="pw-splash-scan" aria-hidden="true" />
          <BrandMark size="xl" />
        </div>
        <div className="text-center">
          <p className="text-2xl font-black tracking-wide">PackWatcher</p>
          <p className="mt-1 text-sm font-semibold text-slate-300">{status}<span className="pw-loading-dots" aria-hidden="true" /></p>
        </div>
      </div>
    </div>
  );
}
