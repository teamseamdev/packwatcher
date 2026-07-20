import assert from "node:assert/strict";
import test from "node:test";
import { buildPreparedSetScannerIndex } from "../lib/scanner/set-pack.ts";
import { ScanCoordinator } from "../lib/scanner/scan-coordinator.ts";
import type { CanonicalCardCandidate } from "../lib/cards/set-matching.ts";

test("scan coordinator permits only one active request", async () => {
  const coordinator = new ScanCoordinator<{ value: number }, number>();
  let calls = 0;
  const execute = async (input: { value: number }) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return input.value;
  };

  const first = coordinator.run({ value: 1 }, execute);
  const second = coordinator.run({ value: 2 }, execute);
  const [left, right] = await Promise.all([first, second]);

  assert.equal(left, 1);
  assert.equal(right, 1);
  assert.equal(calls, 1);
});

test("prepared scanner set pack builds compact lookup indexes", () => {
  const pack = buildPreparedSetScannerIndex({
    setId: "set-1",
    setName: "Chaos Rising",
    cards: [
      candidate("a", "Goomy", "066/086"),
      candidate("b", "Goomy", "067/086"),
      candidate("c", "Pikachu", "025/086")
    ]
  });

  assert.equal(pack.cards.length, 3);
  assert.deepEqual(pack.byNormalizedCollectorNumber["66/86"], ["a"]);
  assert.deepEqual(pack.byNormalizedName.goomy, ["a", "b"]);
  assert.deepEqual(pack.byNameAndNumber["goomy:66/86"], ["a"]);
  assert.deepEqual(pack.byNumericPortion["25"], ["c"]);
});

function candidate(id: string, name: string, number: string): CanonicalCardCandidate {
  return {
    id,
    setId: "set-1",
    setName: "Chaos Rising",
    name,
    normalizedName: name.toLowerCase(),
    collectorNumberRaw: number,
    collectorNumberNormalized: number,
    rarity: "Common",
    imageUrl: null,
    tcgplayerProductId: null,
    marketPrice: null
  };
}
