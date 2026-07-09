export type ClipsAnalysisAvailability = {
  mode: "local_assist" | "ai_assist";
  openAiAvailable: boolean;
  message: string | null;
};

export function getClipsAnalysisAvailability(): ClipsAnalysisAvailability {
  const enabled = process.env.CLIPS_ENABLE_OPENAI === "true";
  const hasKey = Boolean(process.env.OPENAI_API_KEY);

  if (!enabled || !hasKey) {
    return {
      mode: "local_assist",
      openAiAvailable: false,
      message: "OpenAI analysis is unavailable, so PackWatcher Clips switched to local/manual mode. You can still create clips."
    };
  }

  return {
    mode: "ai_assist",
    openAiAvailable: true,
    message: null
  };
}

export function isOpenAiQuotaError(status: number, body: string) {
  return status === 429 && body.toLowerCase().includes("insufficient_quota");
}
