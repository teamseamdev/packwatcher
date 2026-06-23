import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";
  const error = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");

  if (error) {
    const url = new URL("/login", requestUrl.origin);
    url.searchParams.set("error", error);
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const url = new URL("/login", requestUrl.origin);
      url.searchParams.set("error", exchangeError.message);
      return NextResponse.redirect(url);
    }
    if (data.user) {
      await ensureProfile(data.user);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
