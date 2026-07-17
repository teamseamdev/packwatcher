import { NextResponse } from "next/server";
import { errorMetadata, logAppEvent } from "@/lib/monitoring/log";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ ok: false, error: "Invalid location coordinates." }, { status: 400 });
  }

  const endpoint = process.env.REVERSE_GEOCODE_URL || "https://nominatim.openstreetmap.org/reverse";
  const url = new URL(endpoint);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PackWatcher/1.0"
      },
      next: { revalidate: 60 * 60 * 24 }
    });

    if (!response.ok) {
      throw new Error(`Reverse geocode failed with status ${response.status}`);
    }

    const body = await response.json() as { address?: { postcode?: string } };
    const postalCode = normalizePostalCode(body.address?.postcode);
    if (!postalCode) {
      return NextResponse.json({ ok: false, error: "Could not find a ZIP code for this location." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, postalCode });
  } catch (error) {
    await logAppEvent({
      category: "system",
      severity: "warn",
      message: "Location reverse geocode failed",
      metadata: { ...errorMetadata(error), lat, lng }
    });
    return NextResponse.json({ ok: false, error: "Could not locate ZIP code. Enter it manually instead." }, { status: 502 });
  }
}

function normalizePostalCode(value: string | undefined) {
  const match = value?.match(/\d{5}(?:-\d{4})?/);
  return match?.[0] ?? null;
}
