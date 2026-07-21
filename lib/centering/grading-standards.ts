import type { CenteringAnalysisResult, CenteringSideResult, GradingComparisonResult, GradingStandardCode, GradingStandardRule } from "./types.ts";

export const CENTERING_DISCLAIMER = "Centering is only one part of professional grading. Results are estimates based on the uploaded photos and do not guarantee a grade.";

export const GRADING_CENTERING_STANDARDS: Record<Exclude<GradingStandardCode, "custom">, GradingStandardRule> = {
  psa: {
    provider: "psa",
    label: "PSA",
    gradeLabel: "PSA 10 centering tolerance",
    version: "2026-07-21-psa-grading-standards",
    sourceName: "PSA Grading Standards",
    sourceUrl: "https://www.psacard.com/gradingstandards",
    lastReviewed: "2026-07-21",
    front: { horizontalMaxSkew: 55, verticalMaxSkew: 55 },
    back: { horizontalMaxSkew: 75, verticalMaxSkew: 75 },
    note: "PSA publishes approximately 55/45 maximum front tolerance and 75/25 reverse tolerance for PSA 10. This comparison evaluates centering only."
  },
  beckett: {
    provider: "beckett",
    label: "Beckett",
    gradeLabel: "BGS Pristine 10 centering reference",
    version: "2026-07-21-beckett-grading-page",
    sourceName: "Beckett Grading",
    sourceUrl: "https://www.beckett.com/grading",
    lastReviewed: "2026-07-21",
    front: { horizontalMaxSkew: 50, verticalMaxSkew: 50 },
    back: { horizontalMaxSkew: 55, verticalMaxSkew: 55 },
    note: "Beckett's current grading page describes centering as a subgrade and lists 50/50 front and 55/45 or better back for Pristine 10. This comparison evaluates centering only."
  }
};

export function compareCenteringToStandard(
  standard: GradingStandardRule,
  front: CenteringSideResult | null,
  back: CenteringSideResult | null
): GradingComparisonResult {
  const frontWithin = front ? sideWithin(front, standard.front.horizontalMaxSkew, standard.front.verticalMaxSkew) : null;
  const backWithin = back ? sideWithin(back, standard.back.horizontalMaxSkew, standard.back.verticalMaxSkew) : null;
  const parts = [
    frontWithin === null ? "Front not analyzed" : `Front ${frontWithin ? "appears within" : "appears outside"} ${standard.gradeLabel}`,
    backWithin === null ? "Back not analyzed" : `Back ${backWithin ? "appears within" : "appears outside"} ${standard.gradeLabel}`
  ];
  return {
    provider: standard.provider,
    label: standard.label,
    version: standard.version,
    frontWithinTolerance: frontWithin,
    backWithinTolerance: backWithin,
    message: `${parts.join(". ")}. This does not evaluate corners, edges, surface, print quality, authenticity, or other grading criteria.`
  };
}

export function buildCenteringAnalysis(front: CenteringSideResult | null, back: CenteringSideResult | null, overallConfidence: CenteringAnalysisResult["overallConfidence"], recommendation: CenteringAnalysisResult["recommendation"]): CenteringAnalysisResult {
  return {
    front,
    back,
    overallConfidence,
    recommendation,
    psaComparison: compareCenteringToStandard(GRADING_CENTERING_STANDARDS.psa, front, back),
    beckettComparison: compareCenteringToStandard(GRADING_CENTERING_STANDARDS.beckett, front, back),
    disclaimer: CENTERING_DISCLAIMER,
    engineVersion: front?.engineVersion ?? back?.engineVersion ?? "centering-v1.0.0"
  };
}

function sideWithin(side: CenteringSideResult, horizontalMaxSkew: number, verticalMaxSkew: number) {
  if (side.confidence === "low") return false;
  return side.horizontalRatio.first <= horizontalMaxSkew && side.verticalRatio.first <= verticalMaxSkew;
}
