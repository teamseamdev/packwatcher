import {
  collectorNumbersPotentiallyEqual,
  generateCollectorNumberAlternates,
  normalizeCollectorNumber
} from "./collector-number.ts";

export type CanonicalCardCandidate = {
  id: string;
  setId: string;
  setName: string;
  name: string;
  normalizedName: string;
  collectorNumberRaw: string | null;
  collectorNumberNormalized: string | null;
  rarity?: string | null;
  imageUrl?: string | null;
  tcgplayerProductId?: number | null;
  marketPrice?: number | null;
};

export type SelectedSetMatchInput = {
  selectedSetId: string;
  ocrName?: string | null;
  ocrCollectorNumber?: string | null;
  candidates: CanonicalCardCandidate[];
};

export type ScoredCardCandidate = CanonicalCardCandidate & {
  confidence: number;
  explanation: {
    selectedSet: string;
    ocrName: string | null;
    ocrCollectorNumber: string | null;
    normalizedCollectorNumber: string | null;
    exactCollectorNumberMatch: boolean;
    controlledCollectorNumberMatch: boolean;
    nameScore: number;
  };
};

export type SelectedSetMatchResult =
  | { action: "auto_confirmed"; best: ScoredCardCandidate; alternatives: ScoredCardCandidate[] }
  | { action: "confirm_candidate"; best: ScoredCardCandidate | null; alternatives: ScoredCardCandidate[]; reason: string }
  | { action: "no_safe_match"; alternatives: ScoredCardCandidate[]; reason: string };

export function matchCardWithinSelectedSet(input: SelectedSetMatchInput): SelectedSetMatchResult {
  const eligible = input.candidates.filter((candidate) => candidate.setId === input.selectedSetId);
  if (!eligible.length) return { action: "no_safe_match", alternatives: [], reason: "NO_CANDIDATES_IN_SELECTED_SET" };

  const scannedNumber = normalizeCollectorNumber(input.ocrCollectorNumber);
  const scored = eligible
    .map((candidate) => scoreCandidate(candidate, input.ocrName ?? null, input.ocrCollectorNumber ?? null))
    .filter((candidate) => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence);

  if (!scored.length) return { action: "no_safe_match", alternatives: [], reason: scannedNumber ? "NO_CANDIDATE_IN_SELECTED_SET" : "NUMBER_NOT_READABLE" };

  const exactNumberMatches = scannedNumber
    ? scored.filter((candidate) => candidate.explanation.exactCollectorNumberMatch)
    : [];
  if (exactNumberMatches.length === 1) {
    const best = exactNumberMatches[0];
    return { action: "auto_confirmed", best, alternatives: scored.slice(1, 5) };
  }

  const controlledNumberMatches = scannedNumber
    ? scored.filter((candidate) => candidate.explanation.controlledCollectorNumberMatch)
    : [];
  if (controlledNumberMatches.length === 1 && controlledNumberMatches[0].confidence >= 0.82) {
    return { action: "auto_confirmed", best: controlledNumberMatches[0], alternatives: scored.filter((candidate) => candidate.id !== controlledNumberMatches[0].id).slice(0, 4) };
  }

  const best = scored[0] ?? null;
  const second = scored[1] ?? null;
  if (best && best.confidence >= 0.88 && (!second || best.confidence - second.confidence >= 0.14) && (best.explanation.exactCollectorNumberMatch || best.explanation.controlledCollectorNumberMatch)) {
    return { action: "auto_confirmed", best, alternatives: scored.slice(1, 5) };
  }

  if (best && (!scannedNumber && best.explanation.nameScore >= 0.85 || best.confidence >= 0.45)) {
    return { action: "confirm_candidate", best, alternatives: scored.slice(0, 5), reason: exactNumberMatches.length > 1 ? "AMBIGUOUS_NUMBER" : "AMBIGUOUS_MATCH" };
  }

  return { action: "no_safe_match", alternatives: scored.slice(0, 5), reason: "NO_SAFE_MATCH" };
}

function scoreCandidate(candidate: CanonicalCardCandidate, ocrName: string | null, ocrCollectorNumber: string | null): ScoredCardCandidate {
  const scannedNumber = normalizeCollectorNumber(ocrCollectorNumber);
  const cardNumber = normalizeCollectorNumber(candidate.collectorNumberNormalized ?? candidate.collectorNumberRaw);
  const exactNumber = Boolean(scannedNumber && cardNumber && scannedNumber.normalized === cardNumber.normalized);
  const controlledNumber = Boolean(scannedNumber && cardNumber && collectorNumbersPotentiallyEqual(scannedNumber.raw, cardNumber.raw));
  const nameScore = ocrName ? cardNameSimilarity(ocrName, candidate.name) : 0;

  let confidence = 0;
  if (exactNumber) confidence += 0.72;
  else if (controlledNumber) confidence += 0.6;
  else if (scannedNumber && cardNumber && numberCandidateExists(scannedNumber.raw, cardNumber.normalized)) confidence += 0.52;

  if (scannedNumber?.denominator && cardNumber?.denominator && scannedNumber.denominator === cardNumber.denominator) confidence += 0.08;
  if (nameScore >= 0.98) confidence += 0.18;
  else confidence += nameScore * 0.14;

  return {
    ...candidate,
    confidence: Math.min(0.99, Number(confidence.toFixed(3))),
    explanation: {
      selectedSet: candidate.setName,
      ocrName,
      ocrCollectorNumber,
      normalizedCollectorNumber: scannedNumber?.normalized ?? null,
      exactCollectorNumberMatch: exactNumber,
      controlledCollectorNumberMatch: controlledNumber || numberCandidateExists(scannedNumber?.raw, cardNumber?.normalized),
      nameScore: Number(nameScore.toFixed(3))
    }
  };
}

export function normalizeCardNameForMatch(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pokemon/gi, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\b(ex|gx|v|vmax|vstar)\b/gi, " $1 ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cardNameSimilarity(left: string, right: string) {
  const a = normalizeCardNameForMatch(left);
  const b = normalizeCardNameForMatch(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.88;
  const leftTokens = new Set(a.split(" ").filter(Boolean));
  const rightTokens = new Set(b.split(" ").filter(Boolean));
  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const union = new Set([...Array.from(leftTokens), ...Array.from(rightTokens)]).size;
  return union ? intersection / union : 0;
}

function numberCandidateExists(scannedRaw?: string | null, canonicalNormalized?: string | null) {
  if (!scannedRaw || !canonicalNormalized) return false;
  return generateCollectorNumberAlternates(scannedRaw).some((alternate) => {
    const normalized = normalizeCollectorNumber(alternate);
    return normalized?.normalized === canonicalNormalized;
  });
}
