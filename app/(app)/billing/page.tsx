import { requireUser } from "@/lib/auth";

export default async function BillingPage() {
  const { supabase, user } = await requireUser();
  const { data: billing } = await supabase.from("billing_status").select("*").eq("user_id", user.id).maybeSingle();

  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold text-teal-200">Billing</p>
      <h1 className="mt-1 text-3xl font-black text-white">Subscription status</h1>
      <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <p className="text-slate-300">Plan: <span className="font-bold text-white">{billing?.plan ?? "free"}</span></p>
        <p className="mt-2 text-slate-300">Status: <span className="font-bold text-white">{billing?.status ?? "inactive"}</span></p>
      </section>
    </div>
  );
}
