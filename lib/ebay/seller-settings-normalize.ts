export type EbaySellerPolicyOption = {
  id: string;
  name: string;
  description: string | null;
  marketplaceId: string | null;
};

export type EbayMerchantLocationOption = {
  key: string;
  name: string;
  status: string | null;
  addressSummary: string | null;
};

type JsonRecord = Record<string, unknown>;

export function normalizePolicyOptions(payload: unknown, collectionKey: string, idKey: string) {
  const records = Array.isArray((payload as JsonRecord | null)?.[collectionKey])
    ? ((payload as JsonRecord)[collectionKey] as unknown[])
    : [];

  return records.flatMap((record) => {
    if (!isRecord(record)) return [];
    const id = stringValue(record[idKey]);
    if (!id) return [];
    return [{
      id,
      name: stringValue(record.name) || id,
      description: stringValue(record.description),
      marketplaceId: stringValue(record.marketplaceId)
    }];
  });
}

export function normalizeMerchantLocationOptions(payload: unknown) {
  const payloadRecord = isRecord(payload) ? payload : {};
  const records = Array.isArray(payloadRecord.locations)
    ? payloadRecord.locations
    : Array.isArray(payloadRecord.inventoryLocations)
      ? payloadRecord.inventoryLocations
      : [];

  return records.flatMap((record) => {
    if (!isRecord(record)) return [];
    const key = stringValue(record.merchantLocationKey);
    if (!key) return [];
    return [{
      key,
      name: stringValue(record.name) || key,
      status: stringValue(record.merchantLocationStatus ?? record.status),
      addressSummary: addressSummary(record.location)
    }];
  });
}

function addressSummary(location: unknown) {
  if (!isRecord(location) || !isRecord(location.address)) return null;
  const address = location.address;
  const parts = [
    stringValue(address.city),
    stringValue(address.stateOrProvince),
    stringValue(address.postalCode),
    stringValue(address.country)
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
