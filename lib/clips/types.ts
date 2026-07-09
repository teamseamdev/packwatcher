export type ClipProjectStatus = "uploaded" | "processing" | "needs_review" | "ready_to_export" | "exporting" | "complete" | "failed";
export type ClipAnalysisMode = "manual" | "local_assist" | "ai_assist";

export type ClipProject = {
  id: string;
  user_id: string;
  title: string;
  product_name: string;
  total_cost: number;
  pack_count: number;
  notes: string | null;
  source_video_url: string | null;
  source_video_path: string;
  source_video_bucket: string;
  source_file_name: string | null;
  source_content_type: string | null;
  source_file_size: number | null;
  status: ClipProjectStatus;
  analysis_mode: ClipAnalysisMode;
  total_pull_value: number;
  profit_loss: number;
  roi_percent: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ClipMoment = {
  id: string;
  project_id: string;
  timestamp_start: number;
  timestamp_end: number;
  moment_type: string;
  confidence: number;
  thumbnail_url: string | null;
  thumbnail_path: string | null;
  thumbnail_bucket: string | null;
  include_in_export: boolean;
  sort_order: number;
  created_at: string;
};

export type ClipCard = {
  id: string;
  project_id: string;
  moment_id: string | null;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  variant: string | null;
  estimated_value: number;
  confidence: number;
  pricing_source: string;
  recognition_source: string;
  user_confirmed: boolean;
  created_at: string;
  updated_at: string;
};

export type ClipExport = {
  id: string;
  project_id: string;
  export_url: string | null;
  export_path: string;
  export_bucket: string;
  format: string;
  duration: number | null;
  resolution: string;
  status: string;
  created_at: string;
};

export type ClipMomentWithCard = ClipMoment & {
  card: ClipCard | null;
  signedThumbnailUrl?: string | null;
};

export function currency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value ?? 0));
}

export function percent(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

export function clipStatusLabel(status: ClipProjectStatus) {
  return status.replaceAll("_", " ");
}

export function calculateClipTotals(totalCost: number, cards: Array<{ estimated_value: number }>) {
  const totalPullValue = cards.reduce((sum, card) => sum + Number(card.estimated_value || 0), 0);
  const profitLoss = totalPullValue - Number(totalCost || 0);
  const roiPercent = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;
  return {
    totalPullValue: roundMoney(totalPullValue),
    profitLoss: roundMoney(profitLoss),
    roiPercent: Number(roiPercent.toFixed(2))
  };
}

export function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export function formatTimestamp(seconds: number | null | undefined) {
  const safe = Math.max(0, Number(seconds ?? 0));
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${minutes}:${wholeSeconds}`;
}
