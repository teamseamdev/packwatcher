export type CardRecognitionCandidate = {
  cardName: string;
  setName?: string | null;
  cardNumber?: string | null;
  variant?: string | null;
  confidence: number;
  source: string;
};

export type CardRecognitionProvider = {
  name: string;
  recognize(input: { imageUrl?: string | null; notes?: string | null }): Promise<CardRecognitionCandidate[]>;
};

export class ManualCardRecognitionProvider implements CardRecognitionProvider {
  name = "manual";

  async recognize(): Promise<CardRecognitionCandidate[]> {
    return [];
  }
}

export class PokemonTCGProvider implements CardRecognitionProvider {
  name = "pokemon_tcg_placeholder";

  async recognize(): Promise<CardRecognitionCandidate[]> {
    return [];
  }
}

export class XimilarProvider implements CardRecognitionProvider {
  name = "ximilar_placeholder";

  async recognize(): Promise<CardRecognitionCandidate[]> {
    return [];
  }
}

export class PokeTraceProvider implements CardRecognitionProvider {
  name = "poketrace_placeholder";

  async recognize(): Promise<CardRecognitionCandidate[]> {
    return [];
  }
}
