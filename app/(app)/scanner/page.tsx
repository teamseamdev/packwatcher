import { CardScanner } from "@/components/scanner/CardScanner";

export default function ScannerPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-amber-200">Scanner</p>
        <h1 className="mt-1 text-3xl font-black text-white">Card value scanner</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Scan cards with the full-screen camera or upload a pack-opening video to build an ordered value list.
        </p>
      </div>
      <CardScanner />
    </div>
  );
}
