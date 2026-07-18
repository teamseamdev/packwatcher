import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ebayAuthorizationUrl } from "@/lib/ebay/client";

export async function GET() {
  await requireUser();
  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("packwatcher_ebay_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });
  redirect(ebayAuthorizationUrl(state));
}
