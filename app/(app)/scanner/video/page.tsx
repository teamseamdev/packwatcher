import { VideoRipAnalysis } from "@/components/video-rip/VideoRipAnalysis";

export default function VideoRipAnalysisPage() {
  return (
    <div className="space-y-6">
      <header className="pw-hero p-5 sm:p-6">
        <p className="pw-hud text-xs font-black">Video Rip Analysis</p>
        <h1 className="mt-1 text-3xl font-black text-white">Analyze a full opening video</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Upload a Pokemon opening video, let PackWatcher pick the clearest card frames, then review packs, values, timestamps, and exportable reports.
        </p>
      </header>
      <VideoRipAnalysis />
    </div>
  );
}
