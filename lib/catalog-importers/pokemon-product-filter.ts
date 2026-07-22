type DiscoveryCandidate = {
  title?: string | null;
  productUrl?: string | null;
  storeName?: string | null;
};

const nonPokemonPatterns = [
  /\b(book|paperback|hardcover|audiobook|ebook|kindle|novel|manga|comic|dvd|blu[-\s]?ray|vinyl|cd)\b/i,
  /\b(magic[:\s]+the\s+gathering|mtg|sorcery|yu[-\s]?gi[-\s]?oh|digimon|one\s+piece|lorcana|flesh\s+and\s+blood|dragon\s+ball|metazoo)\b/i,
  /\b(baseball|basketball|football|hockey|soccer|panini|topps|upper\s+deck)\b/i
];

const retailerBlockPatterns = [
  /\brobot\s+or\s+human\b/i,
  /\bare\s+you\s+a\s+robot\b/i,
  /\bverify\s+you(?:'| a)?re\s+human\b/i,
  /\baccess\s+denied\b/i,
  /\bcaptcha\b/i,
  /\bautomated\s+access\b/i,
  /\bunusual\s+traffic\b/i
];

const pokemonPatterns = [
  /\bpokemon\b/i,
  /\bpok[eé]mon\b/i,
  /\bpokemon\s+tcg\b/i
];

const sealedProductPatterns = [
  /\bbooster\s+(box|bundle|pack|display|case)\b/i,
  /\bsleeved\s+booster\b/i,
  /\b(blister|three[-\s]?pack|3[-\s]?pack)\b/i,
  /\b(elite\s+trainer\s+box|etb)\b/i,
  /\b(pokemon\s+center\s+elite\s+trainer\s+box)\b/i,
  /\b(collection|premium\s+collection|ultra[-\s]?premium\s+collection)\b/i,
  /\b(tin|mini\s+tin)\b/i,
  /\b(build\s+&?\s*battle|battle\s+deck|theme\s+deck|trainer\s+toolkit)\b/i,
  /\b(poster\s+collection|binder\s+collection|tech\s+sticker\s+collection)\b/i,
  /\b(cards?|trading\s+card|tcg)\b/i
];

function normalizeText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function pokemonShoppingQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return "pokemon sealed product";
  if (pokemonPatterns.some((pattern) => pattern.test(trimmed))) return trimmed;
  return `pokemon sealed product ${trimmed}`;
}

export function isLikelyPokemonProduct(candidate: DiscoveryCandidate) {
  const titleAndUrl = normalizeText(`${candidate.title ?? ""} ${candidate.productUrl ?? ""}`);
  const allText = normalizeText(`${titleAndUrl} ${candidate.storeName ?? ""}`);

  if (!titleAndUrl.trim()) return false;
  if (retailerBlockPatterns.some((pattern) => pattern.test(allText))) return false;
  if (nonPokemonPatterns.some((pattern) => pattern.test(allText))) return false;

  const hasPokemonSignal = pokemonPatterns.some((pattern) => pattern.test(titleAndUrl));
  const hasSealedSignal = sealedProductPatterns.some((pattern) => pattern.test(titleAndUrl));

  return hasPokemonSignal || hasSealedSignal;
}
