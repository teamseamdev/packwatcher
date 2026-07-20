import assert from "node:assert/strict";
import test from "node:test";
import {
  collectorNumbersPotentiallyEqual,
  compareCollectorNumbers,
  generateCollectorNumberAlternates,
  normalizeCollectorNumber
} from "../lib/cards/collector-number.ts";
import { matchCardWithinSelectedSet, type CanonicalCardCandidate } from "../lib/cards/set-matching.ts";

test("normalizes complex Pokemon collector numbers", () => {
  assert.equal(normalizeCollectorNumber("025／198")?.normalized, "25/198");
  assert.equal(normalizeCollectorNumber("TG01/TG30")?.normalized, "TG1/TG30");
  assert.equal(normalizeCollectorNumber("GG44/GG70")?.prefix, "GG");
  assert.equal(normalizeCollectorNumber("SV107/SV122")?.normalized, "SV107/SV122");
  assert.equal(normalizeCollectorNumber("PR-SW 001")?.normalized, "PR-SW1");
  assert.equal(normalizeCollectorNumber("12a")?.suffix, "A");
  assert.equal(normalizeCollectorNumber("")?.normalized, undefined);
});

test("handles controlled OCR number confusions without erasing prefixes", () => {
  assert.equal(collectorNumbersPotentiallyEqual("O25/198", "025/198"), true);
  assert.equal(collectorNumbersPotentiallyEqual("TG0I/TG3O", "TG01/TG30"), true);
  assert.equal(collectorNumbersPotentiallyEqual("SV107/SV122", "107/122"), false);
  assert.ok(generateCollectorNumberAlternates("O25/198").includes("025/198"));
});

test("sorts collector numbers naturally with subsets after main set", () => {
  const values = ["TG10", "2", "100", "TG02", "12b", "1", "12a", "GG44", "TG01", "10"];
  assert.deepEqual(values.sort(compareCollectorNumbers), ["1", "2", "10", "12a", "12b", "100", "TG01", "TG02", "TG10", "GG44"]);
});

test("selected set is a hard boundary for scanner matching", () => {
  const cards: CanonicalCardCandidate[] = [
    card("set-a-pika", "set-a", "Set A", "Pikachu", "25/102"),
    card("set-b-pika", "set-b", "Set B", "Pikachu", "63/86"),
    card("set-a-raichu", "set-a", "Set A", "Raichu", "26/102")
  ];

  const result = matchCardWithinSelectedSet({
    selectedSetId: "set-a",
    ocrName: "Pikachu",
    ocrCollectorNumber: "63/86",
    candidates: cards
  });

  assert.equal(result.action, "no_safe_match");
  assert.equal(result.alternatives.some((candidate) => candidate.id === "set-b-pika"), false);
});

test("exact selected-set collector number beats same-name ambiguity", () => {
  const cards: CanonicalCardCandidate[] = [
    card("pika-25", "set-a", "Set A", "Pikachu", "25/102"),
    card("pika-99", "set-a", "Set A", "Pikachu", "99/102"),
    card("pika-other-set", "set-b", "Set B", "Pikachu", "25/198")
  ];

  const result = matchCardWithinSelectedSet({
    selectedSetId: "set-a",
    ocrName: "Pikachu",
    ocrCollectorNumber: "025/102",
    candidates: cards
  });

  assert.equal(result.action, "auto_confirmed");
  assert.equal(result.best.id, "pika-25");
});

test("same-name unreadable number requires selected-set confirmation", () => {
  const cards: CanonicalCardCandidate[] = [
    card("pika-25", "set-a", "Set A", "Pikachu", "25/102"),
    card("pika-99", "set-a", "Set A", "Pikachu", "99/102")
  ];

  const result = matchCardWithinSelectedSet({
    selectedSetId: "set-a",
    ocrName: "Pikachu",
    ocrCollectorNumber: null,
    candidates: cards
  });

  assert.equal(result.action, "confirm_candidate");
  assert.deepEqual(result.alternatives.map((candidate) => candidate.setId), ["set-a", "set-a"]);
});

function card(id: string, setId: string, setName: string, name: string, number: string): CanonicalCardCandidate {
  return {
    id,
    setId,
    setName,
    name,
    normalizedName: name.toLowerCase(),
    collectorNumberRaw: number,
    collectorNumberNormalized: normalizeCollectorNumber(number)?.normalized ?? number,
    rarity: "Common",
    imageUrl: null,
    tcgplayerProductId: null,
    marketPrice: null
  };
}
