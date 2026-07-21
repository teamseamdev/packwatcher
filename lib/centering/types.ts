import type { Point, Quad } from "../scanner/geometry.ts";

export type CenteringSide = "front" | "back";
export type CenteringConfidence = "high" | "medium" | "low";
export type CenteringMethod = "reference-aligned" | "template-aligned" | "generic-border" | "manual";
export type CenteringRecommendation =
  | "excellent"
  | "strong"
  | "acceptable"
  | "off_center"
  | "retake";

export type MarginMeasurement = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type DirectionalCenteringRatio = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type DisplayRatio = {
  first: number;
  second: number;
};

export type CenteringSideResult = {
  side: CenteringSide;
  outerCorners: Quad;
  innerFrame: MarginMeasurement;
  margins: MarginMeasurement;
  directionalRatio: DirectionalCenteringRatio;
  horizontalRatio: DisplayRatio;
  verticalRatio: DisplayRatio;
  confidence: CenteringConfidence;
  confidenceScore: number;
  blockers: string[];
  method: CenteringMethod;
  referenceImageUsed: string | null;
  referenceRegistrationScore: number | null;
  userAdjusted: boolean;
  engineVersion: string;
};

export type CenteringAnalysisResult = {
  front: CenteringSideResult | null;
  back: CenteringSideResult | null;
  overallConfidence: CenteringConfidence;
  recommendation: CenteringRecommendation;
  psaComparison: GradingComparisonResult | null;
  beckettComparison: GradingComparisonResult | null;
  disclaimer: string;
  engineVersion: string;
};

export type CenteringMeasurementInput = {
  side: CenteringSide;
  outerCorners: Quad;
  innerFramePercent: MarginMeasurement;
  imageSize: { width: number; height: number };
  userAdjusted: boolean;
  blockers?: string[];
  method?: CenteringMethod;
  detectionConfidence?: number;
  referenceImageUsed?: string | null;
  referenceRegistrationScore?: number | null;
};

export type GradingStandardCode = "psa" | "beckett" | "custom";

export type GradingTolerance = {
  horizontalMaxSkew: number;
  verticalMaxSkew: number;
};

export type GradingStandardRule = {
  provider: GradingStandardCode;
  label: string;
  gradeLabel: string;
  version: string;
  sourceName: string;
  sourceUrl: string;
  lastReviewed: string;
  front: GradingTolerance;
  back: GradingTolerance;
  note: string;
};

export type GradingComparisonResult = {
  provider: GradingStandardCode;
  label: string;
  version: string;
  frontWithinTolerance: boolean | null;
  backWithinTolerance: boolean | null;
  message: string;
};

export type CenteringAnalysisRecord = {
  id: string;
  user_id: string;
  inventory_item_id: string | null;
  canonical_card_id: string | null;
  front_original_path: string | null;
  front_corrected_path: string | null;
  back_original_path: string | null;
  back_corrected_path: string | null;
  front_left_margin: number | null;
  front_right_margin: number | null;
  front_top_margin: number | null;
  front_bottom_margin: number | null;
  back_left_margin: number | null;
  back_right_margin: number | null;
  back_top_margin: number | null;
  back_bottom_margin: number | null;
  front_lr_ratio: string | null;
  front_tb_ratio: string | null;
  back_lr_ratio: string | null;
  back_tb_ratio: string | null;
  front_confidence: CenteringConfidence | null;
  back_confidence: CenteringConfidence | null;
  overall_confidence: CenteringConfidence;
  recommendation: CenteringRecommendation;
  detection_method: CenteringMethod;
  reference_image_used: string | null;
  reference_registration_score: number | null;
  grading_standard_version: string;
  analysis_engine_version: string;
  user_adjusted_corners: boolean;
  sleeve_toploader_warning: boolean;
  measurements: CenteringAnalysisResult;
  created_at: string;
  updated_at: string;
};

export type DraggableCenteringPoint = Point & {
  key: "topLeft" | "topRight" | "bottomRight" | "bottomLeft";
};
