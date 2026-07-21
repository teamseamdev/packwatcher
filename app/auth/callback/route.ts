import { NextResponse } from "next/server";
import { authErrorMessage, safeAuthRedirect } from "@/lib/auth/redirect";
import { ensureProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeAuthRedirect(requestUrl.searchParams.get("next"));
  const error = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");

  if (error) {
    const url = new URL("/login", requestUrl.origin);
    url.searchParams.set("error", authErrorMessage(error));
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const url = new URL("/login", requestUrl.origin);
      url.searchParams.set("error", authErrorMessage(exchangeError.message));
      return NextResponse.redirect(url);
    }
    if (data.user) {
      await ensureProfile(data.user);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
