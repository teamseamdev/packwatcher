export type NormalizedCollectorNumber = {
  raw: string;
  normalized: string;
  numerator: string;
  denominator: string | null;
  prefix: string;
  numeric: number | null;
  numericText: string | null;
  suffix: string;
  denominatorPrefix: string;
  denominatorNumeric: number | null;
  denominatorNumericText: string | null;
  sortKey: string;
};

const SLASHES = /[\u2044\u2215\u29F8\uFF0F]/g;
const HYPHENS = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const OCR_DIGIT_CONFUSIONS: Record<string, string[]> = {
  "0": ["O", "Q", "D"],
  "1": ["I", "L", "|"],
  "5": ["S"]
};

export function normalizeCollectorNumber(value?: string | null): NormalizedCollectorNumber | null {
  const raw = normalizeCollectorText(value);
  if (!raw) return null;

  const [numeratorRaw, denominatorRaw] = raw.split("/", 2);
  const numerator = parseCollectorPart(numeratorRaw);
  const denominator = denominatorRaw ? parseCollectorPart(denominatorRaw) : null;
  const normalizedNumerator = formatPart(numerator);
  const normalizedDenominator = denominator ? formatPart(denominator) : null;

  return {
    raw,
    normalized: normalizedDenominator ? `${normalizedNumerator}/${normalizedDenominator}` : normalizedNumerator,
    numerator: normalizedNumerator,
    denominator: normalizedDenominator,
    prefix: numerator.prefix,
    numeric: numerator.numeric,
    numericText: numerator.numericText,
    suffix: numerator.suffix,
    denominatorPrefix: denominator?.prefix ?? "",
    denominatorNumeric: denominator?.numeric ?? null,
    denominatorNumericText: denominator?.numericText ?? null,
    sortKey: buildCollectorSortKey(numerator, denominator)
  };
}

export function normalizeCollectorText(value?: string | null) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(SLASHES, "/")
    .replace(HYPHENS, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

export function collectorNumbersPotentiallyEqual(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeCollectorNumber(left);
  const normalizedRight = normalizeCollectorNumber(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft.normalized === normalizedRight.normalized) return true;
  return generateCollectorNumberAlternates(normalizedLeft.raw).some((candidate) => {
    const normalizedCandidate = normalizeCollectorNumber(candidate);
    return normalizedCandidate?.normalized === normalizedRight.normalized;
  });
}

export function generateCollectorNumberAlternates(value?: string | null) {
  const normalized = normalizeCollectorText(value);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  const parts = normalized.split("/", 2);
  const numeratorAlternates = generatePartAlternates(parts[0] ?? "");
  const denominatorAlternates = parts[1] ? generatePartAlternates(parts[1]) : [null];

  for (const numerator of numeratorAlternates) {
    for (const denominator of denominatorAlternates) {
      candidates.add(denominator ? `${numerator}/${denominator}` : numerator);
    }
  }

  return Array.from(candidates);
}

export function compareCollectorNumbers(left?: string | null, right?: string | null) {
  const a = normalizeCollectorNumber(left)?.sortKey ?? "9:ZZZZ:999999:ZZZZ:999999:ZZZZ";
  const b = normalizeCollectorNumber(right)?.sortKey ?? "9:ZZZZ:999999:ZZZZ:999999:ZZZZ";
  return a.localeCompare(b);
}

function parseCollectorPart(value: string) {
  const text = value.trim();
  const match = text.match(/^([A-Z]+(?:-[A-Z]+)?)*0*([0-9]+)([A-Z]*)$/);
  if (!match) {
    const loose = text.match(/^([A-Z-]*)([0-9OILS]+)([A-Z]*)$/);
    if (!loose) return { prefix: text.replace(/[0-9].*$/, ""), numeric: null, numericText: null, suffix: "" };
    const corrected = correctOcrNumberText(loose[2]);
    return {
      prefix: loose[1] ?? "",
      numeric: corrected ? Number(corrected) : null,
      numericText: corrected,
      suffix: loose[3] ?? ""
    };
  }

  return {
    prefix: match[1] ?? "",
    numeric: correctedExactNumber(match[2], match[3] ?? "")?.numeric ?? Number(match[2]),
    numericText: correctedExactNumber(match[2], match[3] ?? "")?.numericText ?? match[2],
    suffix: correctedExactNumber(match[2], match[3] ?? "")?.suffix ?? (match[3] ?? "")
  };
}

function correctedExactNumber(numberText: string, suffix: string) {
  if (!suffix || !/^[OILS|]+$/.test(suffix)) return null;
  const corrected = correctOcrNumberText(`${numberText}${suffix}`);
  if (!corrected) return null;
  return { numeric: Number(corrected), numericText: corrected, suffix: "" };
}

function formatPart(part: { prefix: string; numeric: number | null; numericText: string | null; suffix: string }) {
  if (part.numeric === null) return `${part.prefix}${part.suffix}` || "";
  return `${part.prefix}${part.numeric}${part.suffix}`;
}

function buildCollectorSortKey(
  numerator: { prefix: string; numeric: number | null; suffix: string },
  denominator: { prefix: string; numeric: number | null; suffix: string } | null
) {
  const subsetRank = subsetSortRank(numerator.prefix);
  const number = numerator.numeric ?? 999999;
  const denominatorNumber = denominator?.numeric ?? 999999;
  return [
    subsetRank.toString().padStart(2, "0"),
    numerator.prefix.padEnd(8, " "),
    number.toString().padStart(6, "0"),
    numerator.suffix.padEnd(4, " "),
    (denominator?.prefix ?? "").padEnd(8, " "),
    denominatorNumber.toString().padStart(6, "0")
  ].join(":");
}

function subsetSortRank(prefix: string) {
  if (!prefix) return 0;
  const order = ["TG", "GG", "RC", "SV", "XY", "SM", "SWSH", "PR-SW", "H", "SH", "SVP"];
  const index = order.indexOf(prefix);
  return index === -1 ? 8 : index + 1;
}

function generatePartAlternates(value: string) {
  const candidates = new Set<string>([value]);
  const match = value.match(/^([A-Z-]*)([0-9OILS]+)([A-Z]*)$/);
  if (!match) return Array.from(candidates);

  const prefix = match[1] ?? "";
  const number = match[2] ?? "";
  const suffix = match[3] ?? "";
  const corrected = correctOcrNumberText(number);
  if (corrected) {
    candidates.add(`${prefix}${Number(corrected)}${suffix}`);
    candidates.add(`${prefix}${corrected.padStart(number.length, "0")}${suffix}`);
  }
  if (/^[OQDIL|S]$/.test(prefix)) {
    const correctedPrefix = correctOcrNumberText(prefix);
    if (correctedPrefix) candidates.add(`${correctedPrefix}${number}${suffix}`);
  }

  for (const [digit, letters] of Object.entries(OCR_DIGIT_CONFUSIONS)) {
    for (const letter of letters) {
      if (number.includes(letter)) candidates.add(`${prefix}${number.replaceAll(letter, digit)}${suffix}`);
    }
  }

  return Array.from(candidates);
}

function correctOcrNumberText(value: string) {
  const corrected = value
    .replace(/[OQD]/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/S/g, "5");
  return /^\d+$/.test(corrected) ? corrected : null;
}
