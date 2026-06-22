"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      setMessage("");
      const supabase = createClient();
      const redirectTo = `${location.origin}/auth/callback?next=/dashboard`;
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

      location.href = "/dashboard";
    });
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-slate-950/80 p-6">
        <Link href="/" className="text-sm font-bold text-teal-200">PackWatcher</Link>
        <h1 className="mt-5 text-3xl font-black text-white">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-2 text-sm text-slate-300">Email auth is live. Google and Discord OAuth can be added through Supabase providers later.</p>
        <div className="mt-6 space-y-4">
          <input className="h-12 w-full rounded-lg border border-white/10 bg-white/5 px-4 outline-none focus:border-teal-300" placeholder="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input className="h-12 w-full rounded-lg border border-white/10 bg-white/5 px-4 outline-none focus:border-teal-300" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="h-12 w-full rounded-lg bg-teal-300 font-semibold text-slate-950 disabled:opacity-60" disabled={isPending} onClick={submit}>
            {isPending ? "Working..." : mode === "login" ? "Sign In" : "Sign Up"}
          </button>
        </div>
        {message ? <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-200">{message}</p> : null}
        <p className="mt-6 text-sm text-slate-400">
          {mode === "login" ? "Need an account? " : "Already have an account? "}
          <Link className="text-teal-200" href={mode === "login" ? "/signup" : "/login"}>
            {mode === "login" ? "Sign up" : "Sign in"}
          </Link>
        </p>
      </section>
    </main>
  );
}
