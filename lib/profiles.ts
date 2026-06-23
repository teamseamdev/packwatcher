import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export async function ensureProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  try {
    const supabase = createAdminClient();
    const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (existing) {
      return existing as Profile;
    }

    const email = user.email ?? null;
    const username =
      typeof user.user_metadata?.user_name === "string"
        ? user.user_metadata.user_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : email?.split("@")[0] ?? null;
    const avatarUrl = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email,
        username,
        avatar_url: avatarUrl,
        plan: "free"
      })
      .select("*")
      .single();

    if (error) {
      return null;
    }

    return data as Profile;
  } catch {
    return null;
  }
}
