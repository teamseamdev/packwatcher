import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  if (!profile) redirect("/login");

  return (
    <div className="pw-shell min-h-screen overflow-x-hidden pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-0">
      <AppNav plan={profile.plan} />
      <main className="mx-auto max-w-7xl overflow-x-hidden px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
