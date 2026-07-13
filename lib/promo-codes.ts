export type PromoDiscountType = "percent" | "amount";

export type PromoCodeRecord = {
  id: string;
  code: string;
  discount_type: PromoDiscountType;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  active: boolean;
};

export function normalizePromoCode(input: FormDataEntryValue | string | null | undefined) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function formatPromoDiscount(promo: Pick<PromoCodeRecord, "discount_type" | "discount_value">) {
  if (promo.discount_type === "percent") {
    return `${Number(promo.discount_value).toFixed(0)}% off`;
  }

  return `$${Number(promo.discount_value).toFixed(2)} off`;
}

export function promoHasRemainingUses(promo: Pick<PromoCodeRecord, "max_uses" | "used_count">) {
  return promo.max_uses === null || promo.used_count < promo.max_uses;
}
