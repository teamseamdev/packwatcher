import {
  collectorNumbersPotentiallyEqual,
  extractCollectorNumberCandidates,
  generateCollectorNumberAlternates,
  normalizeCollectorNumber
} from "./collector-number.ts";
import { cleanCardName } from "./card-name.ts";

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
    numeratorOnlyMatch: boolean;
    nameScore: number;
  };
};

export type SelectedSetMatchResult =
  | { action: "auto_confirmed"; best: ScoredCardCandidate; alternatives: ScoredCardCandidate[] }
  | { action: "confirm_candidate"; best: ScoredCardCandidate | null; alternatives: ScoredCardCandidate[]; reason: string }
  | { action: "no_safe_match"; alternatives: ScoredCardCandidate[]; reason: string };

export type SingleCandidateResolution = "accept" | "reject";

export function matchCardWithinSelectedSet(input: SelectedSetMatchInput): SelectedSetMatchResult {
  const eligible = input.candidates
    .filter((candidate) => candidate.setId === input.selectedSetId)
    .map(cleanCandidateName);
  if (!eligible.length) return { action: "no_safe_match", alternatives: [], reason: "NO_CANDIDATES_IN_SELECTED_SET" };

  const scannedNumberCandidates = extractCollectorNumberCandidates(input.ocrCollectorNumber);
  const scannedNumber = scannedNumberCandidates[0] ?? null;
  const scored = eligible
    .map((candidate) => scoreCandidate(candidate, input.ocrName ?? null, input.ocrCollectorNumber ?? null))
    .filter((candidate) => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence);

  if (!scored.length) return { action: "no_safe_match", alternatives: [], reason: scannedNumber ? "NO_CANDIDATE_IN_SELECTED_SET" : "NUMBER_NOT_READABLE" };

  if (scored.length === 1) {
    const singleton = scored[0];
    return resolveSingleCandidate({
      candidate: singleton,
      allSelectedSetCandidates: eligible,
      ocrName: input.ocrName,
      ocrCollectorNumber: input.ocrCollectorNumber,
      selectedSetId: input.selectedSetId
    }) === "accept"
      ? { action: "auto_confirmed", best: singleton, alternatives: [] }
      : { action: "no_safe_match", alternatives: [singleton], reason: "SINGLETON_CONFLICTS_WITH_OCR" };
  }

  const exactNumberMatches = scannedNumber
    ? scored.filter((candidate) => candidate.explanation.exactCollectorNumberMatch)
    : [];
  if (exactNumberMatches.length === 1) {
    const best = exactNumberMatches[0];
    const nameConflict = conflictingStrongNameMatch(scored, best);
    if (nameConflict) {
      return { action: "confirm_candidate", best, alternatives: [best, nameConflict], reason: "CONFLICTING_NAME_AND_NUMBER" };
    }
    return { action: "auto_confirmed", best, alternatives: scored.slice(1, 5) };
  }

  const controlledNumberMatches = scannedNumber
    ? scored.filter((candidate) => candidate.explanation.controlledCollectorNumberMatch)
    : [];
  if (controlledNumberMatches.length === 1 && controlledNumberMatches[0].confidence >= 0.82) {
    const best = controlledNumberMatches[0];
    const nameConflict = conflictingStrongNameMatch(scored, best);
    if (nameConflict) {
      return { action: "confirm_candidate", best, alternatives: [best, nameConflict], reason: "CONFLICTING_NAME_AND_NUMBER" };
    }
    return { action: "auto_confirmed", best, alternatives: scored.filter((candidate) => candidate.id !== best.id).slice(0, 4) };
  }

  const numeratorOnlyMatches = scannedNumber
    ? scored.filter((candidate) => candidate.explanation.numeratorOnlyMatch)
    : [];
  if (numeratorOnlyMatches.length === 1 && numeratorOnlyMatches[0].confidence >= 0.52) {
    const best = numeratorOnlyMatches[0];
    const singleResult = resolveSingleCandidate({
      candidate: best,
      allSelectedSetCandidates: eligible,
      ocrName: input.ocrName,
      ocrCollectorNumber: input.ocrCollectorNumber,
      selectedSetId: input.selectedSetId
    });
    if (singleResult === "accept") {
      return { action: "auto_confirmed", best, alternatives: scored.filter((candidate) => candidate.id !== best.id).slice(0, 4) };
    }
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

export function resolveSingleCandidate(input: {
  candidate: CanonicalCardCandidate;
  allSelectedSetCandidates?: CanonicalCardCandidate[];
  ocrName?: string | null;
  ocrCollectorNumber?: string | null;
  selectedSetId: string;
}): SingleCandidateResolution {
  if (input.candidate.setId !== input.selectedSetId) return "reject";

  const scannedNumbers = extractCollectorNumberCandidates(input.ocrCollectorNumber);
  const candidateNumber = normalizeCollectorNumber(input.candidate.collectorNumberNormalized ?? input.candidate.collectorNumberRaw);
  const anyNumberCompatible = candidateNumber && scannedNumbers.some((number) =>
    collectorNumbersPotentiallyEqual(number.raw, candidateNumber.raw) || collectorNumeratorsCompatible(number, candidateNumber)
  );
  if (scannedNumbers.length && candidateNumber && !anyNumberCompatible) {
    const selectedSetCards = input.allSelectedSetCandidates ?? [];
    const numberBelongsToAnotherCard = selectedSetCards.some((candidate) => {
      if (candidate.id === input.candidate.id || candidate.setId !== input.selectedSetId) return false;
      const otherNumber = normalizeCollectorNumber(candidate.collectorNumberNormalized ?? candidate.collectorNumberRaw);
      return Boolean(otherNumber && scannedNumbers.some((number) =>
        collectorNumbersPotentiallyEqual(number.raw, otherNumber.raw) || collectorNumeratorsCompatible(number, otherNumber)
      ));
    });
    if (numberBelongsToAnotherCard || input.candidate.collectorNumberNormalized || input.candidate.collectorNumberRaw) return "reject";
  }

  if (input.ocrName) {
    const nameScore = cardNameSimilarity(input.ocrName, input.candidate.name);
    if (hasMeaningfulLatinName(input.ocrName) && nameScore < 0.2) return "reject";
  }

  return "accept";
}

function scoreCandidate(candidate: CanonicalCardCandidate, ocrName: string | null, ocrCollectorNumber: string | null): ScoredCardCandidate {
  const scannedNumbers = extractCollectorNumberCandidates(ocrCollectorNumber);
  const scannedNumber = scannedNumbers[0] ?? null;
  const cardNumber = normalizeCollectorNumber(candidate.collectorNumberNormalized ?? candidate.collectorNumberRaw);
  const exactNumber = Boolean(cardNumber && scannedNumbers.some((number) => number.normalized === cardNumber.normalized));
  const controlledNumber = Boolean(cardNumber && scannedNumbers.some((number) => collectorNumbersPotentiallyEqual(number.raw, cardNumber.raw)));
  const numeratorOnly = Boolean(cardNumber && scannedNumbers.some((number) => collectorNumeratorsCompatible(number, cardNumber)));
  const nameScore = ocrName ? cardNameSimilarity(ocrName, candidate.name) : 0;

  let confidence = 0;
  if (exactNumber) confidence += 0.72;
  else if (controlledNumber) confidence += 0.6;
  else if (scannedNumbers.some((number) => numberCandidateExists(number.raw, cardNumber?.normalized))) confidence += 0.52;
  else if (numeratorOnly) confidence += 0.5;

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
      controlledCollectorNumberMatch: controlledNumber || scannedNumbers.some((number) => numberCandidateExists(number.raw, cardNumber?.normalized)),
      numeratorOnlyMatch: numeratorOnly,
      nameScore: Number(nameScore.toFixed(3))
    }
  };
}

function cleanCandidateName(candidate: CanonicalCardCandidate): CanonicalCardCandidate {
  const cleaned = cleanCardName({
    rawName: candidate.name,
    rawCollectorNumber: candidate.collectorNumberRaw,
    normalizedCollectorNumber: candidate.collectorNumberNormalized
  });
  if (!cleaned.changed) return candidate;
  return {
    ...candidate,
    name: cleaned.canonicalName,
    normalizedName: normalizeCardNameForMatch(cleaned.canonicalName)
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

function conflictingStrongNameMatch(scored: ScoredCardCandidate[], numberCandidate: ScoredCardCandidate) {
  if (numberCandidate.explanation.nameScore >= 0.2) return null;
  return scored.find((candidate) =>
    candidate.id !== numberCandidate.id &&
    candidate.explanation.nameScore >= 0.85 &&
    !candidate.explanation.exactCollectorNumberMatch &&
    !candidate.explanation.controlledCollectorNumberMatch
  ) ?? null;
}

function hasMeaningfulLatinName(value: string) {
  const cleaned = normalizeCardNameForMatch(value)
    .replace(/\b(hp|ps|pv|kp|damage|weakness|resistance|retreat|basic|stage|trainer|item|supporter)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /[a-z]/i.test(cleaned) && cleaned.length >= 3;
}

function collectorNumeratorsCompatible(
  scannedNumber: NonNullable<ReturnType<typeof normalizeCollectorNumber>>,
  cardNumber: NonNullable<ReturnType<typeof normalizeCollectorNumber>>
) {
  if (scannedNumber.denominator) return false;
  if (scannedNumber.numeric === null || cardNumber.numeric === null) return false;
  if (scannedNumber.prefix !== cardNumber.prefix) return false;
  if (scannedNumber.suffix !== cardNumber.suffix) return false;
  return scannedNumber.numeric === cardNumber.numeric;
}
