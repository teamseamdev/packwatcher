export type Coordinates = {
  latitude: number;
  longitude: number;
};

export function distanceMiles(a: Coordinates, b: Coordinates) {
  const earthRadiusMiles = 3958.7613;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function parseCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const latitude = numberFromUnknown(record.latitude ?? record.lat);
  const longitude = numberFromUnknown(record.longitude ?? record.lng ?? record.lon);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}
