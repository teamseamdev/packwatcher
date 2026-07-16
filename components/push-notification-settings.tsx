"use client";

import { useEffect, useState, useTransition } from "react";
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

type PushNotificationSettingsProps = {
  publicKey?: string;
  subscriptionCount: number;
  mode?: "full" | "setup";
  hideAfterEnable?: boolean;
  showDisable?: boolean;
  className?: string;
};

export function PushNotificationSettings({
  publicKey,
  subscriptionCount,
  mode = "full",
  hideAfterEnable = false,
  showDisable = true,
  className = ""
}: PushNotificationSettingsProps) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [message, setMessage] = useState("");
  const [isHidden, setIsHidden] = useState(false);
  const [hasActiveDevice, setHasActiveDevice] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (browserSupportsPush()) {
        setPermission(Notification.permission);
        if (hideAfterEnable) {
          void navigator.serviceWorker.getRegistration("/sw.js").then(async (registration) => {
            const subscription = await registration?.pushManager.getSubscription();
            setHasActiveDevice(Boolean(subscription));
            if (subscription) setIsHidden(true);
          });
        } else {
          void navigator.serviceWorker.getRegistration("/sw.js").then(async (registration) => {
            const subscription = await registration?.pushManager.getSubscription();
            setHasActiveDevice(Boolean(subscription));
          });
        }
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [hideAfterEnable]);

  function enable() {
    startTransition(async () => {
      setMessage("");

      if (!publicKey) {
        setMessage("Push is not configured yet. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel.");
        return;
      }

      if (!browserSupportsPush()) {
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
      if (data.ok) {
        setHasActiveDevice(true);
        if (hideAfterEnable) {
          setIsHidden(true);
          return;
        }
        setMessage("Push notifications are enabled on this device.");
      } else {
        setMessage(data.error ?? "Could not save subscription.");
      }
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
      setHasActiveDevice(false);
      setIsHidden(false);
      setMessage("Push notifications are disabled on this device.");
    });
  }

  if (isHidden) return null;

  return (
    <section className={`rounded-lg border border-white/10 bg-white/[0.04] p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <Smartphone className="mt-1 h-5 w-5 text-amber-300" />
        <div>
          <h2 className="font-bold text-white">{mode === "setup" ? "Enable restock alerts" : "Mobile notifications"}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {mode === "setup"
              ? "Turn on browser push so PackWatcher can notify this device when tracked products restock."
              : "Enable browser push for Android Chrome or iOS Safari after adding PackWatcher to your Home Screen."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!hasActiveDevice ? (
          <button disabled={isPending} onClick={enable} className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-60">
            <BellRing className="h-4 w-4" />
            Enable this device
          </button>
        ) : null}
        {showDisable && hasActiveDevice ? (
          <button disabled={isPending} onClick={disable} className="h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold disabled:opacity-60">
            Disable this device
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-slate-500">Permission: {permission}. Saved devices: {subscriptionCount}.</p>
      {mode === "setup" ? <p className="mt-2 text-xs text-slate-500">You can change this at any time in the Account tab.</p> : null}
      {message ? <p className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}

function browserSupportsPush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

