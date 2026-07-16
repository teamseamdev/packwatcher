import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard, LogOut, MapPin, Shield, UserRound } from "lucide-react";
import { AccountPlanSwitcher } from "@/components/account-plan-switcher";
import { PushNotificationSettings } from "@/components/push-notification-settings";
import { requireProfile } from "@/lib/auth";
import { switchToFreePlan, updatePostalCode } from "./actions";

async function signOut() {
  "use server";
  const { supabase } = await requireProfile();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function AccountPage() {
  const { supabase, user, profile } = await requireProfile();
  const { count: subscriptionCount } = await supabase.from("push_subscriptions").select("*", { count: "exact", head: true }).eq("user_id", user.id);

  return (
    <div className="max-w-5xl space-y-5">
      <header className="rounded-lg border border-white/10 bg-gradient-to-br from-white/[0.08] to-amber-300/[0.06] p-5">
        <p className="text-sm font-semibold text-amber-200">Account</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">Settings</h1>
            <p className="mt-2 text-sm text-slate-400">Manage your alerts, location, plan, and account access.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-300 px-3 py-1 text-xs font-black uppercase text-slate-950">
            <CreditCard className="h-3.5 w-3.5" />
            {profile?.plan ?? "free"}
          </span>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start gap-3">
            <UserRound className="mt-1 h-5 w-5 text-amber-300" />
            <div className="min-w-0">
              <h2 className="font-bold text-white">Profile</h2>
              <p className="mt-1 break-all text-sm text-slate-300">{user.email}</p>
              <p className="mt-3 break-all text-xs text-slate-600">{user.id}</p>
            </div>
          </div>
          <form action={signOut} className="mt-5">
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 h-5 w-5 text-amber-300" />
            <div>
              <h2 className="font-bold text-white">Default ZIP code</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">Used to prioritize nearby pickup results. You can still override ZIP on Watchlist for one-off searches.</p>
            </div>
          </div>
          <form action={updatePostalCode} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              name="postal_code"
              defaultValue={profile?.postal_code ?? ""}
              inputMode="numeric"
              placeholder="ZIP code"
              className="h-11 flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300"
            />
            <button className="h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">Save</button>
          </form>
        </section>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PushNotificationSettings
          publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
          subscriptionCount={subscriptionCount ?? 0}
          className="h-full"
        />
        <AccountPlanSwitcher currentPlan={profile?.plan ?? "free"} className="h-full" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {profile?.plan === "pro" ? (
          <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h2 className="font-bold text-white">Switch to Free</h2>
            <p className="mt-2 text-sm text-slate-400">Downgrade your PackWatcher account. Stripe subscriptions are cancelled at period end when attached.</p>
            <form action={switchToFreePlan} className="mt-4">
              <button className="h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">Switch to Free</button>
            </form>
          </section>
        ) : null}
        {profile?.plan === "admin" ? (
          <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
            <div className="flex items-start gap-3">
              <Shield className="mt-1 h-5 w-5 text-amber-300" />
              <div>
                <h2 className="font-bold text-white">Admin access</h2>
                <p className="mt-2 text-sm text-slate-300">Manage catalog imports, users, checks, and notification logs.</p>
              </div>
            </div>
            <Link href="/admin" className="mt-4 inline-flex h-10 items-center rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">
              Open Admin
            </Link>
          </section>
        ) : null}
      </section>
    </div>
  );
}

