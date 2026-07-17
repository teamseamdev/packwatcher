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
      </div>
      <CardScanner />
    </div>
  );
}
