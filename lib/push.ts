import webpush, { type PushSubscription } from "web-push";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";
import { createAdminClient } from "@/lib/supabase/admin";

type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails("mailto:support@packwatcher.app", publicKey, privateKey);
  return true;
}

export async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string }) {
  if (!configureWebPush()) {
    await logAppEvent({
      category: "notification",
      severity: "warn",
      message: "Push send skipped because VAPID keys are not configured",
      userId
    });
    return { sent: 0, skipped: true };
  }

  const supabase = createAdminClient();
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);

  let sent = 0;

  for (const subscription of (subscriptions ?? []) as PushRow[]) {
    const pushSubscription: PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      await logAppEvent({
        category: "notification",
        severity: statusCode === 404 || statusCode === 410 ? "warn" : "error",
        message: "Push notification send failed",
        userId,
        metadata: { ...errorMetadata(error), statusCode, subscriptionId: subscription.id }
      });
      if ([404, 410].includes(statusCode)) {
        await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }
  }

  await logAppEvent({
    category: "notification",
    severity: "info",
    message: "Push notification send completed",
    userId,
    metadata: { sent, subscriptionCount: subscriptions?.length ?? 0, title: payload.title }
  });

  return { sent, skipped: false };
}
