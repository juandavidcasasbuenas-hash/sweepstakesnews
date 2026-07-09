import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalizePlayerName,
  canonicalizePlayerNames,
  matchPlayerName,
  normalizePlayerName,
} from "./player-names";

const candidates = [
  "Kylian Mbappé",
  "Harry Kane",
  "Erling Haaland",
  "Vinícius Júnior",
  "Lautaro Martínez",
  "Bukayo Saka",
];

test("matches surname-only and accented variants to the validated name", () => {
  assert.equal(matchPlayerName("Mbappe", candidates), "Kylian Mbappé");
  assert.equal(matchPlayerName("kylian mbappe", candidates), "Kylian Mbappé");
  assert.equal(matchPlayerName("K. Mbappé", candidates), "Kylian Mbappé");
  assert.equal(matchPlayerName("K Mbappe", candidates), "Kylian Mbappé");
  assert.equal(matchPlayerName("Martinez", candidates), "Lautaro Martínez");
  assert.equal(matchPlayerName("Vinicius", candidates), "Vinícius Júnior");
});

test("returns undefined when nothing clears the threshold", () => {
  assert.equal(matchPlayerName("Someone Random", candidates), undefined);
  assert.equal(matchPlayerName("", candidates), undefined);
});

test("canonicalize falls back to the trimmed input when unmatched", () => {
  assert.equal(canonicalizePlayerName("  Harry Kane ", candidates), "Harry Kane");
  assert.equal(canonicalizePlayerName("Some Newcomer", candidates), "Some Newcomer");
  assert.equal(canonicalizePlayerName("", candidates), "");
});

test("groups full names, surnames, and initials under the most specific spelling", () => {
  const aliases = canonicalizePlayerNames(["Yamal", "Lamine Yamal", "L. Yamal"]);

  assert.equal(aliases.get(normalizePlayerName("Yamal")), "Lamine Yamal");
  assert.equal(aliases.get(normalizePlayerName("Lamine Yamal")), "Lamine Yamal");
  assert.equal(aliases.get(normalizePlayerName("L. Yamal")), "Lamine Yamal");
  assert.equal(matchPlayerName("Lamine Yamal", ["Yamal"]), "Yamal");
});
