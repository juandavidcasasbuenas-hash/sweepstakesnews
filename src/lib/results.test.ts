import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGenericJson,
  providerCallBudget,
  providerCallsLast24Hours,
  resultsPollTtlSeconds,
} from "@/lib/results";

const completedResults = [
  { id: 2, match_number: 1, home_team: "Mexico", away_team: "South Africa", home_score: 2, away_score: 0 },
  { id: 1, match_number: 2, home_team: "South Korea", away_team: "Czech Republic", home_score: 2, away_score: 1 },
  { id: 7, match_number: 3, home_team: "Canada", away_team: "Bosnia & Herzegovina", home_score: 1, away_score: 1 },
  { id: 20, match_number: 4, home_team: "USA", away_team: "Paraguay", home_score: 4, away_score: 1 },
  { id: 15, match_number: 5, home_team: "Haiti", away_team: "Scotland", home_score: 0, away_score: 1 },
  { id: 19, match_number: 6, home_team: "Australia", away_team: "Turkey", home_score: 2, away_score: 0 },
  { id: 13, match_number: 7, home_team: "Brazil", away_team: "Morocco", home_score: 1, away_score: 1 },
  { id: 9, match_number: 8, home_team: "Qatar", away_team: "Switzerland", home_score: 1, away_score: 1 },
  { id: 28, match_number: 9, home_team: "Ivory Coast", away_team: "Ecuador", home_score: 1, away_score: 0 },
  { id: 26, match_number: 10, home_team: "Germany", away_team: "Curaçao", home_score: 7, away_score: 1 },
  { id: 34, match_number: 11, home_team: "Netherlands", away_team: "Japan", home_score: 2, away_score: 2 },
  { id: 33, match_number: 12, home_team: "Sweden", away_team: "Tunisia", home_score: 5, away_score: 1 },
].map((row) => ({ ...row, status: "completed" }));

test("keeps every completed production result on its existing fixture", () => {
  const results = normalizeGenericJson(completedResults);

  assert.deepEqual(
    Object.keys(results.matches).map(Number).sort((a, b) => a - b),
    [1, 2, 7, 8, 13, 14, 19, 20, 25, 26, 31, 32],
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(results.matches).map(([fixtureId, result]) => [
        fixtureId,
        [result.home, result.away],
      ]),
    ),
    {
      1: [2, 0],
      2: [2, 1],
      7: [1, 1],
      8: [1, 1],
      13: [1, 1],
      14: [0, 1],
      19: [4, 1],
      20: [2, 0],
      25: [7, 1],
      26: [1, 0],
      31: [2, 2],
      32: [5, 1],
    },
  );
});

test("maps Cabo Verde to the Spain fixture instead of chronological match 14", () => {
  const results = normalizeGenericJson([
    {
      id: 43,
      match_number: 14,
      home_team: "Spain",
      away_team: "Cabo Verde",
      home_score: 1,
      away_score: 0,
      status: "live",
    },
  ]);

  assert.equal(results.matches[43]?.fixtureId, 43);
  assert.equal(results.matches[43]?.team2, "Cape Verde");
  assert.equal(results.matches[37], undefined);
});

test("maps IR Iran to the Iran fixture", () => {
  const results = normalizeGenericJson([
    {
      id: 37,
      match_number: 15,
      home_team: "IR Iran",
      away_team: "New Zealand",
      home_score: 0,
      away_score: 0,
      status: "live",
    },
  ]);

  assert.equal(results.matches[38]?.fixtureId, 38);
  assert.equal(results.matches[38]?.team1, "Iran");
  assert.equal(results.matches[44], undefined);
});

test("rejects a numeric fallback when its fixture contradicts supplied teams", () => {
  const results = normalizeGenericJson([
    {
      fixtureId: 37,
      match_number: 14,
      home_team: "Spain",
      away_team: "Unknown Verde",
      home_score: 1,
      away_score: 0,
      status: "live",
    },
  ]);

  assert.deepEqual(results.matches, {});
});

test("maps live knockout rows by provider match number despite placeholder teams", () => {
  const results = normalizeGenericJson([
    {
      match_number: 73,
      home_team: "Mexico",
      away_team: "South Korea",
      home_score: 1,
      away_score: 0,
      status: "live",
      phase: "2H",
    },
  ]);

  assert.equal(results.matches[73]?.fixtureId, 73);
  assert.equal(results.matches[73]?.team1, "Mexico");
  assert.equal(results.matches[73]?.team2, "South Korea");
  assert.equal(results.matches[1], undefined);
});

test("keeps scheduled knockout 0-0 rows out of scoring", () => {
  const results = normalizeGenericJson([
    {
      match_number: 74,
      home_team: "England",
      away_team: "Japan",
      home_score: 0,
      away_score: 0,
      status: "scheduled",
    },
  ]);

  assert.deepEqual(results.matches, {});
});

test("counts result provider calls in the last 24 hours", () => {
  assert.equal(
    providerCallsLast24Hours(
      {
        matches: {},
        bonuses: { topScorer: "", goldenBall: "", mostGoalsTeam: "" },
        updatedAt: "2026-06-17T00:00:00.000Z",
        providerCallTimestamps: [
          "2026-06-16T11:59:59.000Z",
          "2026-06-16T13:00:00.000Z",
          "2026-06-17T11:59:59.000Z",
        ],
      },
      new Date("2026-06-17T12:00:00.000Z"),
    ),
    2,
  );
});

test("uses a two-minute live result cache floor and hourly warm cache", () => {
  assert.equal(resultsPollTtlSeconds("hot"), 120);
  assert.equal(resultsPollTtlSeconds("warm"), 3600);
});

test("defaults result provider budget close to the 500-call API limit", () => {
  assert.deepEqual(
    providerCallBudget(
      {
        matches: {},
        bonuses: { topScorer: "", goldenBall: "", mostGoalsTeam: "" },
        updatedAt: "2026-06-17T00:00:00.000Z",
      },
      new Date("2026-06-17T12:00:00.000Z"),
    ),
    { cap: 450, count: 0, exhausted: false },
  );
});
