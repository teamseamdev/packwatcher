import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClipUploadForm } from "@/components/clips/ClipUploadForm";

export default function NewClipPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/clips" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Clips
        </Link>
        <h1 className="mt-2 text-3xl font-black text-white">Create clip project</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Upload raw footage and enter the real cost. Local assist will extract candidate reveal moments for quick confirmation.
        </p>
      </div>
      <ClipUploadForm />
    </div>
  );
}
