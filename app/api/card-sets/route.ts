import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listCanonicalSets } from "@/lib/cards/catalog";
import { TCGCSVProvider } from "@/lib/clips/providers/pricing";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user } = await requireUser();

  try {
    const canonicalSets = await listCanonicalSets();
    const { data } = await supabase
      .from("catalog_products")
      .select("set_name")
      .eq("tcg", "pokemon")
      .not("set_name", "is", null)
      .limit(1000);

    const sets = Array.from(new Set([
      ...canonicalSets.map((set) => set.name),
      ...(data ?? []).map((item) => cleanSetName(item.set_name)).filter(Boolean)
    ] as string[])).sort((left, right) => left.localeCompare(right));

    return NextResponse.json({ ok: true, sets, cardSets: canonicalSets });
  } catch (error) {
    try {
      const provider = new TCGCSVProvider();
      const sets = await provider.listSets();
      return NextResponse.json({ ok: true, sets, cardSets: [] });
    } catch {
      // Fall through to the logged error below.
    }
    await logAppEvent({
      category: "scanner",
      severity: "warn",
      message: "Card set list lookup failed",
      userId: user.id,
      metadata: errorMetadata(error)
    });
    return NextResponse.json({ ok: false, error: "Could not load Pokemon set names." }, { status: 502 });
  }
}

function cleanSetName(value: string | null | undefined) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || null;
}
