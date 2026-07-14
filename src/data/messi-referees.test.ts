import assert from "node:assert/strict";
import test from "node:test";
import { messiRefereeRecords } from "@/data/messi-referees";
import {
  bundledArgentinaWorldCup2026Referees,
  isRefereeInList,
  isWorldCup2026Referee,
  worldCup2026Referees,
} from "@/data/world-cup-2026-referees";

test("Messi referee ledger contains the complete normalized snapshot", () => {
  assert.equal(messiRefereeRecords.length, 258);
  assert.equal(new Set(messiRefereeRecords.map((row) => `${row.name}|${row.country}`)).size, 258);

  const totals = messiRefereeRecords.reduce(
    (sum, row) => ({
      games: sum.games + row.games,
      wins: sum.wins + row.wins,
      losses: sum.losses + row.losses,
      draws: sum.draws + row.draws,
    }),
    { games: 0, wins: 0, losses: 0, draws: 0 },
  );

  assert.deepEqual(totals, { games: 1162, wins: 784, losses: 155, draws: 223 });
  assert.equal(totals.games, totals.wins + totals.losses + totals.draws);
  assert.ok(messiRefereeRecords.every((row) => row.games === row.wins + row.losses + row.draws));
});

test("duplicate source referee identities are combined", () => {
  assert.deepEqual(
    messiRefereeRecords.find((row) => row.name === "Amaury Delerue"),
    { name: "Amaury Delerue", country: "France", games: 2, wins: 1, losses: 0, draws: 1 },
  );
  assert.deepEqual(
    messiRefereeRecords.find((row) => row.name === "François Letexier"),
    { name: "François Letexier", country: "France", games: 9, wins: 6, losses: 2, draws: 1 },
  );
});

test("World Cup referee cross-references tolerate accents and FIFA aliases", () => {
  assert.equal(worldCup2026Referees.length, 52);
  assert.equal(isWorldCup2026Referee("François Letexier"), true);
  assert.equal(isWorldCup2026Referee("Saíd Martínez"), true);
  assert.equal(isRefereeInList("João Pinheiro", bundledArgentinaWorldCup2026Referees), true);
});
