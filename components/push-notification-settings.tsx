"use client";

import { useState, useTransition } from "react";
import { BellRing, Smartphone } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function PushNotificationSettings({ publicKey, subscriptionCount }: { publicKey?: string; subscriptionCount: number }) {
  const [supported] = useState(() =>
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function enable() {
    startTransition(async () => {
      setMessage("");

      if (!publicKey) {
        setMessage("Push is not configured yet. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel.");
        return;
      }

      if (!supported) {
        setMessage("This browser does not support web push. On iPhone, install PackWatcher to the Home Screen and open it from there.");
        return;
      }

      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setMessage("Notifications were not enabled.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription)
      });

      const data = await response.json();
      setMessage(data.ok ? "Push notifications are enabled on this device." : data.error ?? "Could not save subscription.");
    });
  }

  function disable() {
    startTransition(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
      }
      setMessage("Push notifications are disabled on this device.");
    });
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-1 h-5 w-5 text-teal-300" />
        <div>
          <h2 className="font-bold text-white">Mobile notifications</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">Enable browser push for Android Chrome or iOS Safari after adding PackWatcher to your Home Screen.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={isPending} onClick={enable} className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-60">
          <BellRing className="h-4 w-4" />
          Enable this device
        </button>
        <button disabled={isPending} onClick={disable} className="h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold disabled:opacity-60">
          Disable this device
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">Permission: {permission}. Saved devices: {subscriptionCount}.</p>
      {message ? <p className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}
