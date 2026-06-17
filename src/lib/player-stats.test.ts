import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeMatchPlayerStats,
  playerStatsCallsLast24Hours,
  rebuildPlayerStats,
} from "@/lib/player-stats";

test("normalizes goal timeline events and aggregates scorer and assist tables", () => {
  const match = normalizeMatchPlayerStats(
    {
      timeline: [
        {
          type: "goal",
          minute: 12,
          team: { name: "USA" },
          player: { name: "Folarin Balogun" },
          assist: { name: "Christian Pulisic" },
        },
        {
          type: "penalty goal",
          minute: 61,
          team_name: "USA",
          scorer: "Folarin Balogun",
          penalty: true,
        },
        {
          type: "own goal",
          minute: 70,
          team_name: "Paraguay",
          scorer: "Defender One",
          own_goal: true,
        },
      ],
    },
    { fixtureId: 19, providerId: 20 },
    "2026-06-17T23:55:00.000Z",
  );

  const stats = rebuildPlayerStats({ 19: match }, undefined, "2026-06-17T23:55:00.000Z");

  assert.equal(match.events.length, 3);
  assert.deepEqual(stats.scorers[0], {
    player: "Folarin Balogun",
    team: "USA",
    goals: 2,
    assists: 0,
    penaltyGoals: 1,
    matches: [19],
  });
  assert.deepEqual(stats.assists[0], {
    player: "Christian Pulisic",
    team: "USA",
    goals: 0,
    assists: 1,
    penaltyGoals: 0,
    matches: [19],
  });
  assert.equal(
    stats.scorers.some((row) => row.player === "Defender One"),
    false,
  );
});

test("counts player stat API calls in the last 24 hours", () => {
  assert.equal(
    playerStatsCallsLast24Hours(
      {
        scorers: [],
        assists: [],
        matchStats: {},
        updatedAt: "2026-06-17T00:00:00.000Z",
        providerCallTimestamps: [
          "2026-06-16T11:59:59.000Z",
          "2026-06-16T12:00:00.000Z",
          "2026-06-17T08:00:00.000Z",
        ],
      },
      new Date("2026-06-17T12:00:00.000Z"),
    ),
    2,
  );
});
