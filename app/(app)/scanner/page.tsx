import Link from "next/link";
import { Ruler } from "lucide-react";
import { CardScanner } from "@/components/scanner/CardScanner";

export default function ScannerPage() {
  return (
    <div className="space-y-6">
      <div className="pw-hero p-5 sm:p-6">
        <p className="pw-hud text-xs font-black">Scanner</p>
        <h1 className="mt-1 text-3xl font-black text-white">Card value scanner</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Scan cards with the full-screen camera to build an ordered value list, add scanned cards to inventory, or export a PDF.
        </p>
        <Link href="/scanner/centering" className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 text-sm font-black text-amber-100">
          <Ruler className="h-4 w-4" />
          Check centering
        </Link>
      </div>
      <CardScanner />
    </div>
  );
}
