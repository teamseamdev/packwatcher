import { requireUser } from "@/lib/auth";

export default async function AlertsPage() {
  const { supabase, user } = await requireUser();
  const { data: notifications } = await supabase.from("notifications").select("*, tracked_products(name, store_name, url)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);

  return (
    <div>
      <p className="text-sm font-semibold text-teal-200">Alerts</p>
      <h1 className="mt-1 text-3xl font-black text-white">Notification log</h1>
      <div className="mt-6 space-y-3">
        {notifications?.length ? notifications.map((notification) => (
          <article key={notification.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-bold text-white">{notification.title}</h2>
                <p className="mt-1 text-sm text-slate-300">{notification.message}</p>
              </div>
              <p className="text-sm text-slate-500">{new Date(notification.created_at).toLocaleString()}</p>
            </div>
          </article>
        )) : <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-slate-300">No alerts yet.</div>}
      </div>
    </div>
  );
}
