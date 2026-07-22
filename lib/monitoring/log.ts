import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";

type AppEvent = {
  category: "scanner" | "openai" | "retailer" | "notification" | "stripe" | "catalog" | "ebay" | "system";
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
  captureSentryEvent({ category, severity, message, userId, metadata });

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

function captureSentryEvent({ category, severity, message, userId, metadata }: Required<Pick<AppEvent, "category" | "severity" | "message" | "metadata">> & Pick<AppEvent, "userId">) {
  if (severity === "info") return;

  Sentry.withScope((scope) => {
    scope.setTag("packwatcher.category", category);
    scope.setLevel(severity === "error" ? "error" : "warning");
    if (userId) scope.setUser({ id: userId });
    scope.setContext("packwatcher", sanitizeMetadata(metadata));

    const errorMessage = typeof metadata.error === "string" ? metadata.error : null;
    if (severity === "error" && errorMessage) {
      Sentry.captureException(new Error(`${message}: ${errorMessage}`));
      return;
    }

    Sentry.captureMessage(message, severity === "error" ? "error" : "warning");
  });
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  const redacted = redactObject(metadata);
  return typeof redacted === "object" && redacted && !Array.isArray(redacted) ? redacted as Record<string, unknown> : {};
}

function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(redactObject);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = "[redacted]";
    } else if (typeof entry === "string" && isLargeOrImageValue(entry)) {
      output[key] = "[omitted]";
    } else {
      output[key] = redactObject(entry);
    }
  }
  return output;
}

function isSensitiveKey(key: string) {
  return /token|secret|key|authorization|cookie|auth|subscription|p256dh|endpoint|signature/i.test(key);
}

function isLargeOrImageValue(value: string) {
  return value.length > 500 || /^data:image\//i.test(value) || /^[A-Za-z0-9+/]{800,}={0,2}$/.test(value);
}
