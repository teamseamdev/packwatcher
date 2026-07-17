import type { Plan } from "@/lib/types";

export const FREE_TRACKED_PRODUCT_LIMIT = 3;
export const USAGE_WINDOW_DAYS = 30;

export type UsageKind = "card_scan" | "video_scan";
export type CheckoutPlan = "pro_monthly" | "pro_yearly" | "founder";

export type PlanLimits = {
  trackedProducts: number | null;
  alerts: number | null;
  cardScansPerWindow: number | null;
  videoScansPerWindow: number | null;
};

export const planLimits: Record<Plan, PlanLimits> = {
  free: {
    trackedProducts: FREE_TRACKED_PRODUCT_LIMIT,
    alerts: FREE_TRACKED_PRODUCT_LIMIT,
    cardScansPerWindow: 20,
    videoScansPerWindow: 1
  },
  pro: {
    trackedProducts: null,
    alerts: null,
    cardScansPerWindow: 500,
    videoScansPerWindow: 5
  },
  founder: {
    trackedProducts: null,
    alerts: null,
    cardScansPerWindow: 1000,
    videoScansPerWindow: 15
  },
  admin: {
    trackedProducts: null,
    alerts: null,
    cardScansPerWindow: null,
    videoScansPerWindow: null
  }
};

export const checkoutPlans: Record<CheckoutPlan, {
  name: string;
  price: string;
  cadence: string;
  stripeEnv: string;
  legacyStripeEnv?: string;
  mode: "subscription" | "payment";
  resultingPlan: Exclude<Plan, "free" | "admin">;
}> = {
  pro_monthly: {
    name: "Pro Monthly",
    price: "$4.99",
    cadence: "per month",
    stripeEnv: "NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID",
    legacyStripeEnv: "NEXT_PUBLIC_STRIPE_PRO_PRICE_ID",
    mode: "subscription",
    resultingPlan: "pro"
  },
  pro_yearly: {
    name: "Pro Yearly",
    price: "$45",
    cadence: "billed annually",
    stripeEnv: "NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID",
    mode: "subscription",
    resultingPlan: "pro"
  },
  founder: {
    name: "Founder",
    price: "$250",
    cadence: "one time",
    stripeEnv: "NEXT_PUBLIC_STRIPE_FOUNDER_PRICE_ID",
    mode: "payment",
    resultingPlan: "founder"
  }
};

export const plans = {
  free: {
    name: "FREE",
    price: "$0",
    productLimit: FREE_TRACKED_PRODUCT_LIMIT,
    limits: planLimits.free
  },
  pro: {
    name: "PRO",
    price: "$4.99",
    productLimit: Number.POSITIVE_INFINITY,
    limits: planLimits.pro
  },
  founder: {
    name: "FOUNDER",
    price: "$250",
    productLimit: Number.POSITIVE_INFINITY,
    limits: planLimits.founder
  }
} as const;

export function limitLabel(value: number | null, noun: string) {
  return value === null ? `Unlimited ${noun}` : `${value} ${noun}`;
}

export function usageLimitForPlan(plan: Plan, kind: UsageKind) {
  const limits = planLimits[plan] ?? planLimits.free;
  return kind === "video_scan" ? limits.videoScansPerWindow : limits.cardScansPerWindow;
}
