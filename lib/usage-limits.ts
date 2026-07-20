import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { usageLimitForPlan, USAGE_WINDOW_DAYS, type UsageKind } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "@/lib/types";

export type UsageReservation = {
  allowed: boolean;
  plan: Plan;
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string;
  skipped?: boolean;
  replayed?: boolean;
};

export async function reserveUsage(userId: string, kind: UsageKind, metadata: Record<string, unknown> = {}, scanEventId?: string | null): Promise<UsageReservation> {
  const admin = createAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const resetAt = new Date(now.getTime() + USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    const plan = normalizePlan(profile?.plan);
    const limit = usageLimitForPlan(plan, kind);
    if (scanEventId) {
      const { data: existing, error: existingError } = await admin
        .from("app_usage_events")
        .select("id")
        .eq("user_id", userId)
        .eq("usage_kind", kind)
        .eq("scan_event_id", scanEventId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const { count } = await admin
          .from("app_usage_events")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("usage_kind", kind)
          .gte("created_at", since.toISOString());
        const used = count ?? 0;
        return {
          allowed: true,
          plan,
          limit,
          used,
          remaining: limit === null ? null : Math.max(0, limit - used),
          resetAt,
          replayed: true
        };
      }
    }

    if (limit === null) {
      await admin.from("app_usage_events").insert({ user_id: userId, usage_kind: kind, scan_event_id: scanEventId ?? null, metadata });
      return { allowed: true, plan, limit, used: 0, remaining: null, resetAt };
    }

    const { count, error: countError } = await admin
      .from("app_usage_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("usage_kind", kind)
      .gte("created_at", since.toISOString());

    if (countError) throw countError;

    const used = count ?? 0;
    if (used >= limit) {
      return { allowed: false, plan, limit, used, remaining: 0, resetAt };
    }

    const { error: insertError } = await admin
      .from("app_usage_events")
      .insert({ user_id: userId, usage_kind: kind, scan_event_id: scanEventId ?? null, metadata });

    if (insertError) {
      if (scanEventId && /duplicate|unique/i.test(insertError.message)) {
        return {
          allowed: true,
          plan,
          limit,
          used: used + 1,
          remaining: Math.max(0, limit - used - 1),
          resetAt,
          replayed: true
        };
      }
      throw insertError;
    }

    return {
      allowed: true,
      plan,
      limit,
      used: used + 1,
      remaining: Math.max(0, limit - used - 1),
      resetAt
    };
  } catch (error) {
    await logAppEvent({
      category: "system",
      severity: "warn",
      message: "Usage limit check failed open",
      userId,
      metadata: { ...errorMetadata(error), kind }
    });
    return { allowed: true, plan: "free", limit: null, used: 0, remaining: null, resetAt, skipped: true };
  }
}

function normalizePlan(plan: unknown): Plan {
  return plan === "pro" || plan === "founder" || plan === "admin" ? plan : "free";
}
