"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { markOAuthLaunchActive } from "@/components/oauth-return-splash";
import { PackWatcherSplash } from "@/components/packwatcher-splash";
import { authErrorMessage, safeAuthRedirect } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/browser";

type OAuthProvider = "google" | "discord";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(() =>
    typeof window === "undefined" ? "" : authErrorMessage(new URLSearchParams(location.search).get("error")) === "We couldn't complete sign-in."
      ? ""
      : authErrorMessage(new URLSearchParams(location.search).get("error"))
  );
  const [activeOAuth, setActiveOAuth] = useState<OAuthProvider | null>(null);
  const [isPending, startTransition] = useTransition();
  const oauthLockRef = useRef(false);
  const oauthRestoreTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (oauthRestoreTimerRef.current) window.clearTimeout(oauthRestoreTimerRef.current);
    };
  }, []);

  function nextPath() {
    return safeAuthRedirect(new URLSearchParams(location.search).get("next"));
  }

  function submit() {
    startTransition(async () => {
      setMessage("");
      const supabase = createClient();
      const redirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`;
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setMessage("Check your email to confirm your account.");
        return;
      }

      location.href = nextPath();
    });
  }

  function oauth(provider: OAuthProvider) {
    if (oauthLockRef.current) return;
    oauthLockRef.current = true;
    setActiveOAuth(provider);
    startTransition(async () => {
      setMessage("");
      const supabase = createClient();
      const next = nextPath();
      sessionStorage.setItem("packwatcher.oauth.next", next);
      markOAuthLaunchActive();
      const redirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true
        }
      });

      if (error) {
        sessionStorage.removeItem("packwatcher.oauth.active");
        oauthLockRef.current = false;
        setActiveOAuth(null);
        setMessage(authErrorMessage(error.message));
        return;
      }

      if (!data.url) {
        sessionStorage.removeItem("packwatcher.oauth.active");
        oauthLockRef.current = false;
        setActiveOAuth(null);
        setMessage("We couldn't start Discord sign-in. Please try again.");
        return;
      }

      oauthRestoreTimerRef.current = window.setTimeout(() => {
        sessionStorage.removeItem("packwatcher.oauth.active");
        oauthLockRef.current = false;
        setActiveOAuth(null);
        setMessage(provider === "discord" ? "We couldn't open Discord. Try again and PackWatcher will continue in your browser." : "We couldn't open the sign-in page. Please try again.");
      }, 12000);
      window.location.assign(data.url);
    });
  }

  const isBusy = isPending || Boolean(activeOAuth);

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      {activeOAuth ? <PackWatcherSplash variant={activeOAuth === "discord" ? "discord-connect" : "app-boot"} message={activeOAuth === "discord" ? "Opening Discord" : "Loading"} /> : null}
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-slate-950/80 p-6">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-bold text-amber-200">
          <BrandMark />
          PackWatcher
        </Link>
        <h1 className="mt-5 text-3xl font-black text-white">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-2 text-sm text-slate-300">Use email, Google, or Discord to access your watchlists and inventory.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60" disabled={isBusy} onClick={() => oauth("google")}>
            Google
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-indigo-300/20 bg-indigo-400/10 px-3 text-sm font-semibold text-white transition hover:bg-indigo-400/15 disabled:opacity-60"
            disabled={isBusy}
            aria-busy={activeOAuth === "discord"}
            onClick={() => oauth("discord")}
          >
            <MessageCircle className="h-4 w-4" />
            {activeOAuth === "discord" ? "Opening Discord..." : "Continue with Discord"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">Use your existing Discord session for a faster sign-in when available.</p>
        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          Email
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <div className="space-y-4">
          <input className="h-12 w-full rounded-lg border border-white/10 bg-white/5 px-4 outline-none focus:border-amber-300" placeholder="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input className="h-12 w-full rounded-lg border border-white/10 bg-white/5 px-4 outline-none focus:border-amber-300" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="h-12 w-full rounded-lg bg-amber-300 font-semibold text-slate-950 disabled:opacity-60" disabled={isBusy} onClick={submit}>
            {isBusy && !activeOAuth ? "Working..." : mode === "login" ? "Sign In" : "Sign Up"}
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-200">{message}</p> : null}
        <p className="mt-6 text-sm text-slate-400">
          {mode === "login" ? "Need an account? " : "Already have an account? "}
          <Link className="text-amber-200" href={mode === "login" ? "/signup" : "/login"}>
            {mode === "login" ? "Sign up" : "Sign in"}
          </Link>
        </p>
      </section>
    </main>
  );
}

