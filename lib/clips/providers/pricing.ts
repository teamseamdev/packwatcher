export type PricingCandidate = {
  value: number;
  currency: "USD";
  source: string;
  confidence: number;
};

export type PricingProvider = {
  name: string;
  price(input: { cardName: string; setName?: string | null; cardNumber?: string | null; variant?: string | null }): Promise<PricingCandidate[]>;
};

export class ManualPricingProvider implements PricingProvider {
  name = "manual";

  async price(): Promise<PricingCandidate[]> {
    return [];
  }
}

export class TCGCSVProvider implements PricingProvider {
  name = "tcgcsv_placeholder";

  async price(): Promise<PricingCandidate[]> {
    return [];
  }
}

export class PriceChartingProvider implements PricingProvider {
  name = "pricecharting_placeholder";

  async price(): Promise<PricingCandidate[]> {
    return [];
  }
}

export class JustTCGProvider implements PricingProvider {
  name = "justtcg_placeholder";

  async price(): Promise<PricingCandidate[]> {
    return [];
  }
}
