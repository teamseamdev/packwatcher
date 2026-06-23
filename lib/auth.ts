import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function requireUser() {
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireProfile() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const profile = (data as Profile | null) ?? await ensureProfile(user);
  return { supabase, user, profile };
}

export function isAdmin(profile: Profile | null) {
  return profile?.plan === "admin";
}
