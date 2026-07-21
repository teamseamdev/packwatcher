import { cleanCardName } from "../cards/card-name.ts";
import { normalizeCollectorNumber } from "../cards/collector-number.ts";
import { normalizeCardNameForMatch, type CanonicalCardCandidate } from "../cards/set-matching.ts";

export type ScannerCandidate = {
  id: string;
  setId: string;
  name: string;
  normalizedName: string;
  collectorNumberRaw: string | null;
  collectorNumberNormalized: string | null;
  collectorNumberPrefix: string;
  collectorNumberNumeric: number | null;
  collectorNumberSuffix: string;
  rarity: string | null;
  imageUrl: string | null;
  tcgplayerProductId: number | null;
  sortKey: string | null;
};

export type PreparedSetScannerIndex = {
  setId: string;
  setName: string;
  version: string;
  preparedAt: number;
  cards: ScannerCandidate[];
  byNormalizedCollectorNumber: Record<string, string[]>;
  byNormalizedName: Record<string, string[]>;
  byNameAndNumber: Record<string, string[]>;
  byNumericPortion: Record<string, string[]>;
  byPrefix: Record<string, string[]>;
};

export function buildPreparedSetScannerIndex(input: {
  setId: string;
  setName: string;
  version?: string;
  cards: CanonicalCardCandidate[];
}): PreparedSetScannerIndex {
  const prepared: PreparedSetScannerIndex = {
    setId: input.setId,
    setName: input.setName,
    version: input.version ?? `${input.setId}:${input.cards.length}`,
    preparedAt: Date.now(),
    cards: [],
    byNormalizedCollectorNumber: {},
    byNormalizedName: {},
    byNameAndNumber: {},
    byNumericPortion: {},
    byPrefix: {}
  };

  for (const card of input.cards) {
    const parsedNumber = normalizeCollectorNumber(card.collectorNumberNormalized ?? card.collectorNumberRaw);
    const cleaned = cleanCardName({
      rawName: card.name,
      rawCollectorNumber: card.collectorNumberRaw,
      normalizedCollectorNumber: parsedNumber?.normalized ?? card.collectorNumberNormalized
    });
    const normalizedName = normalizeCardNameForMatch(cleaned.canonicalName);
    const candidate: ScannerCandidate = {
      id: card.id,
      setId: card.setId,
      name: cleaned.canonicalName,
      normalizedName,
      collectorNumberRaw: card.collectorNumberRaw,
      collectorNumberNormalized: parsedNumber?.normalized ?? card.collectorNumberNormalized,
      collectorNumberPrefix: parsedNumber?.prefix ?? "",
      collectorNumberNumeric: parsedNumber?.numeric ?? null,
      collectorNumberSuffix: parsedNumber?.suffix ?? "",
      rarity: card.rarity ?? null,
      imageUrl: card.imageUrl ?? null,
      tcgplayerProductId: card.tcgplayerProductId ?? null,
      sortKey: parsedNumber?.sortKey ?? null
    };
    prepared.cards.push(candidate);
    addIndexValue(prepared.byNormalizedName, normalizedName, candidate.id);
    if (candidate.collectorNumberNormalized) {
      addIndexValue(prepared.byNormalizedCollectorNumber, candidate.collectorNumberNormalized, candidate.id);
      addIndexValue(prepared.byNameAndNumber, `${normalizedName}:${candidate.collectorNumberNormalized}`, candidate.id);
    }
    if (candidate.collectorNumberNumeric !== null) addIndexValue(prepared.byNumericPortion, String(candidate.collectorNumberNumeric), candidate.id);
    if (candidate.collectorNumberPrefix) addIndexValue(prepared.byPrefix, candidate.collectorNumberPrefix, candidate.id);
  }

  return prepared;
}

function addIndexValue(index: Record<string, string[]>, key: string, id: string) {
  if (!key) return;
  index[key] ??= [];
  index[key].push(id);
}
