import { normalizeCollectorNumber } from "./collector-number.ts";

export type CleanCardNameInput = {
  rawName: string;
  rawCollectorNumber?: string | null;
  normalizedCollectorNumber?: string | null;
  printedSetTotal?: number | null;
};

export type CleanCardNameResult = {
  rawName: string;
  canonicalName: string;
  removedSuffix?: string;
  changed: boolean;
};

export function cleanCardName(input: CleanCardNameInput): CleanCardNameResult {
  const rawName = input.rawName.replace(/\s+/g, " ").trim();
  if (!rawName) {
    return { rawName: input.rawName, canonicalName: "", changed: input.rawName !== "" };
  }

  const collector = normalizeCollectorNumber(input.rawCollectorNumber ?? input.normalizedCollectorNumber);
  if (!collector) return { rawName: input.rawName, canonicalName: rawName, changed: rawName !== input.rawName };

  for (const suffix of collectorSuffixPatterns(input.rawCollectorNumber, collector)) {
    const match = rawName.match(suffix.pattern);
    if (!match) continue;

    const canonicalName = rawName.slice(0, match.index).replace(/[-\s]+$/g, "").trim();
    if (!canonicalName) continue;

    return {
      rawName: input.rawName,
      canonicalName,
      removedSuffix: match[0].trim(),
      changed: canonicalName !== rawName
    };
  }

  return { rawName: input.rawName, canonicalName: rawName, changed: rawName !== input.rawName };
}

function collectorSuffixPatterns(rawCollectorNumber: string | null | undefined, collector: NonNullable<ReturnType<typeof normalizeCollectorNumber>>) {
  const pairForms = new Set<string>();
  const singleForms = new Set<string>();

  addCollectorForms(pairForms, singleForms, collector.numerator, collector.denominator);
  const rawCollector = normalizeCollectorNumber(rawCollectorNumber);
  if (rawCollector) addCollectorForms(pairForms, singleForms, rawCollector.numerator, rawCollector.denominator);

  if (collector.numeric !== null) {
    for (const numerator of numericForms(collector.prefix, collector.numeric, collector.suffix, collector.numericText)) {
      if (collector.denominatorNumeric !== null) {
        for (const denominator of numericForms(collector.denominatorPrefix, collector.denominatorNumeric, "", collector.denominatorNumericText)) {
          pairForms.add(`${numerator}/${denominator}`);
        }
      } else {
        singleForms.add(numerator);
      }
    }
  }

  return [
    ...Array.from(pairForms).map((form) => {
      const [left, right] = form.split("/", 2);
      return {
        display: form,
        pattern: new RegExp(`(?:\\s+|-)${escapeRegExp(left)}\\s*(?:/|\\s)\\s*${escapeRegExp(right)}\\s*$`, "i")
      };
    }),
    ...Array.from(singleForms).map((form) => ({
      display: form,
      pattern: new RegExp(`(?:\\s+|-)${escapeRegExp(form)}\\s*$`, "i")
    }))
  ];
}

function addCollectorForms(pairForms: Set<string>, singleForms: Set<string>, numerator: string, denominator: string | null) {
  if (!numerator) return;
  if (denominator) {
    pairForms.add(`${numerator}/${denominator}`);
  } else {
    singleForms.add(numerator);
  }
}

function numericForms(prefix: string, numeric: number, suffix: string, numericText: string | null) {
  const forms = new Set<string>();
  const base = String(numeric);
  for (const width of [base.length, numericText?.length ?? 0, 2, 3]) {
    if (width <= 0) continue;
    forms.add(`${prefix}${base.padStart(width, "0")}${suffix}`);
  }
  return Array.from(forms);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
