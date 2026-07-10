import { normalizeTitle, normalizeUpc } from "./normalize.ts";

export type CanonicalProductCandidate = {
  id: string;
  title: string;
  setName?: string | null;
  productType?: string | null;
  releaseDate?: string | null;
  upc?: string | null;
};

export type RetailerProductCandidate = {
  title: string;
  setName?: string | null;
  productType?: string | null;
  releaseDate?: string | null;
  upc?: string | null;
  retailerProductId?: string | null;
};

export type ProductMatchResult = {
  productId: string | null;
  confidence: number;
  reason: string;
  requiresReview: boolean;
};

const productTypeGuardrails: Array<[RegExp, RegExp]> = [
  [/booster box/i, /booster bundle|booster pack|sleeved/i],
  [/booster bundle/i, /booster box|booster pack|sleeved/i],
  [/elite trainer box/i, /pokemon center elite trainer box/i],
  [/pokemon center elite trainer box/i, /elite trainer box/i],
  [/three-pack|3-pack/i, /single|booster box|booster bundle/i],
  [/mini tin/i, /collector tin|full tin/i]
];

function tokenSet(value: string) {
  return new Set(normalizeTitle(value).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>) {
  const intersection = Array.from(a).filter((item) => b.has(item)).length;
  const union = new Set([...Array.from(a), ...Array.from(b)]).size;
  return union ? intersection / union : 0;
}

function hasGuardrailMismatch(canonical: CanonicalProductCandidate, retailer: RetailerProductCandidate) {
  const left = `${canonical.title} ${canonical.productType ?? ""}`;
  const right = `${retailer.title} ${retailer.productType ?? ""}`;
  return productTypeGuardrails.some(([specific, conflicting]) => {
    return (specific.test(left) && conflicting.test(right)) || (specific.test(right) && conflicting.test(left));
  });
}

export function matchProduct(candidates: CanonicalProductCandidate[], retailer: RetailerProductCandidate): ProductMatchResult {
  const retailerUpc = normalizeUpc(retailer.upc);
  if (retailerUpc) {
    const upcMatch = candidates.find((candidate) => normalizeUpc(candidate.upc) === retailerUpc);
    if (upcMatch) return { productId: upcMatch.id, confidence: 0.99, reason: "UPC match", requiresReview: false };
  }

  let best: ProductMatchResult = { productId: null, confidence: 0, reason: "No candidate matched", requiresReview: true };
  const retailerTokens = tokenSet(retailer.title);

  for (const candidate of candidates) {
    if (hasGuardrailMismatch(candidate, retailer)) continue;

    const exactTitle = normalizeTitle(candidate.title) === normalizeTitle(retailer.title);
    const setScore = candidate.setName && retailer.setName && normalizeTitle(candidate.setName) === normalizeTitle(retailer.setName) ? 0.12 : 0;
    const typeScore = candidate.productType && retailer.productType && normalizeTitle(candidate.productType) === normalizeTitle(retailer.productType) ? 0.16 : 0;
    const releaseScore = candidate.releaseDate && retailer.releaseDate && candidate.releaseDate === retailer.releaseDate ? 0.06 : 0;
    const titleScore = exactTitle ? 0.82 : jaccard(tokenSet(candidate.title), retailerTokens) * 0.7;
    const confidence = Math.min(0.98, titleScore + setScore + typeScore + releaseScore);

    if (confidence > best.confidence) {
      best = {
        productId: candidate.id,
        confidence,
        reason: exactTitle ? "Exact normalized title match" : "Fuzzy title/set/type match",
        requiresReview: confidence < 0.82
      };
    }
  }

  if (best.confidence < 0.58) {
    return { productId: null, confidence: best.confidence, reason: "Low-confidence match requires admin review", requiresReview: true };
  }

  return best;
}
