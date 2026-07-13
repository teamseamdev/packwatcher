import { redirect } from "next/navigation";
import Link from "next/link";
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
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-amber-200">Account</p>
      <h1 className="mt-1 text-3xl font-black text-white">Profile</h1>
      <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <dl className="space-y-4 text-sm">
          <div><dt className="text-slate-500">Email</dt><dd className="mt-1 text-white">{user.email}</dd></div>
          <div><dt className="text-slate-500">Plan</dt><dd className="mt-1 text-white">{profile?.plan ?? "free"}</dd></div>
          <div><dt className="text-slate-500">User ID</dt><dd className="mt-1 break-all text-white">{user.id}</dd></div>
        </dl>
        <form action={signOut} className="mt-6">
          <button className="h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold">Sign out</button>
        </form>
      </section>
      <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <h2 className="font-bold text-white">Local tracking ZIP</h2>
        <p className="mt-2 text-sm text-slate-400">Used by Watchlist to prioritize nearby in-store pickup results. You can still override it on the Watchlist page.</p>
        <form action={updatePostalCode} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            name="postal_code"
            defaultValue={profile?.postal_code ?? ""}
            inputMode="numeric"
            placeholder="ZIP code"
            className="h-11 flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm outline-none focus:border-amber-300"
          />
          <button className="h-11 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">Save ZIP</button>
        </form>
      </section>
      <AccountPlanSwitcher currentPlan={profile?.plan ?? "free"} />
      {profile?.plan === "pro" ? (
        <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-bold text-white">Switch to Free</h2>
          <p className="mt-2 text-sm text-slate-400">This downgrades your PackWatcher account and cancels the Stripe subscription at period end when a Stripe subscription is attached.</p>
          <form action={switchToFreePlan} className="mt-4">
            <button className="h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200">Switch to Free</button>
          </form>
        </section>
      ) : null}
      {profile?.plan === "admin" ? (
        <section className="mt-6 rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
          <h2 className="font-bold text-white">Admin access</h2>
          <p className="mt-2 text-sm text-slate-300">Manage catalog imports, users, checks, and notification logs.</p>
          <Link href="/admin" className="mt-4 inline-flex h-11 items-center rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950">
            Open Admin
          </Link>
        </section>
      ) : null}
      <div className="mt-6">
        <PushNotificationSettings publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} subscriptionCount={subscriptionCount ?? 0} />
      </div>
    </div>
  );
}

