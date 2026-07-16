import { createAdminClient } from "@/lib/supabase/admin";

type AppEvent = {
  category: "scanner" | "openai" | "retailer" | "notification" | "stripe" | "catalog" | "system";
  severity?: "info" | "warn" | "error";
  message: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAppEvent({ category, severity = "info", message, userId = null, metadata = {} }: AppEvent) {
  const payload = {
    category,
    severity,
    message,
    userId,
    metadata,
    at: new Date().toISOString()
  };

  const printer = severity === "error" ? console.error : severity === "warn" ? console.warn : console.log;
  printer(`[packwatcher:${category}:${severity}] ${message}`, metadata);

  try {
    const supabase = createAdminClient();
    await supabase.from("app_events").insert({
      category,
      severity,
      message,
      user_id: userId,
      metadata
    });
  } catch (error) {
    console.warn("[packwatcher:system:warn] app event persistence failed", {
      originalEvent: payload,
      error: error instanceof Error ? error.message : "unknown error"
    });
  }
}

export function errorMetadata(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "unknown error",
    name: error instanceof Error ? error.name : null
  };
}
