"use client";

import { useEffect, useState } from "react";
import { PackWatcherSplash } from "@/components/packwatcher-splash";

const OAUTH_ACTIVE_KEY = "packwatcher.oauth.active";
const MINIMUM_RETURN_SPLASH_MS = 900;

export function markOAuthLaunchActive() {
  sessionStorage.setItem(OAUTH_ACTIVE_KEY, String(Date.now()));
}

export function OAuthReturnSplash() {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(OAUTH_ACTIVE_KEY)) return;
    const showTimer = window.setTimeout(() => setShowSplash(true), 0);
    const hideTimer = window.setTimeout(() => {
      sessionStorage.removeItem(OAUTH_ACTIVE_KEY);
      setShowSplash(false);
    }, MINIMUM_RETURN_SPLASH_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  return showSplash ? <PackWatcherSplash variant="app-boot" /> : null;
}
