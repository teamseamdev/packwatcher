import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

async function signOut() {
  "use server";
  const { supabase } = await requireProfile();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function AccountPage() {
  const { user, profile } = await requireProfile();

  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-teal-200">Account</p>
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
    </div>
  );
}
