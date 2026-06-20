import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeApiFootballPlayerStats,
  normalizeMatchPlayerStats,
  playerStatsCallsLast24Hours,
  playerStatsRefreshTargets,
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

test("treats underscore own-goal event types as own goals", () => {
  const match = normalizeMatchPlayerStats(
    {
      timeline: [
        {
          type: "own_goal",
          minute: 7,
          team: "USA",
          player: "Damián Bobadilla",
        },
      ],
    },
    { fixtureId: 20, providerId: 20 },
    "2026-06-17T23:55:00.000Z",
  );

  const stats = rebuildPlayerStats({ 20: match }, undefined, "2026-06-17T23:55:00.000Z");

  assert.equal(match.events[0].ownGoal, true);
  assert.equal(stats.scorers.some((row) => row.player === "Damián Bobadilla"), false);
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

test("ranks one-goal scorers with assists ahead of one-goal scorers without assists", () => {
  const matchStats = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => {
      const fixtureId = index + 1;
      return [
        fixtureId,
        {
          fixtureId,
          checkedAt: "2026-06-18T12:00:00.000Z",
          events: [
            {
              fixtureId,
              team: "Team",
              scorer: `No Assist ${String(fixtureId).padStart(2, "0")}`,
            },
          ],
        },
      ];
    }),
  );

  const stats = rebuildPlayerStats(
    {
      ...matchStats,
      11: {
        fixtureId: 11,
        checkedAt: "2026-06-18T12:00:00.000Z",
        events: [
          {
            fixtureId: 11,
            team: "Team",
            scorer: "Assisted Finisher",
          },
        ],
      },
      12: {
        fixtureId: 12,
        checkedAt: "2026-06-18T12:00:00.000Z",
        events: [
          {
            fixtureId: 12,
            team: "Team",
            scorer: "Chance Creator",
            assist: "Assisted Finisher",
          },
        ],
      },
    },
    undefined,
    "2026-06-18T12:00:00.000Z",
  );

  const top10 = stats.scorers.slice(0, 10).map((row) => row.player);

  assert.equal(stats.scorers[0].player, "Assisted Finisher");
  assert.equal(stats.scorers[0].goals, 1);
  assert.equal(stats.scorers[0].assists, 1);
  assert.equal(top10.includes("No Assist 10"), false);
});

test("normalizes API-Football fixture events with assists when provider teams are reversed", () => {
  const matchStats = normalizeApiFootballPlayerStats(
    {
      response: [
        {
          fixture: { id: 92001 },
          teams: {
            home: { name: "Paraguay" },
            away: { name: "USA" },
          },
          events: [
            {
              time: { elapsed: 31, extra: null },
              team: { name: "USA" },
              player: { name: "Folarin Balogun" },
              assist: { name: "Christian Pulisic" },
              type: "Goal",
              detail: "Normal Goal",
            },
            {
              time: { elapsed: 45, extra: 5 },
              team: { name: "USA" },
              player: { name: "Folarin Balogun" },
              assist: { name: "Christian Pulisic" },
              type: "Goal",
              detail: "Normal Goal",
            },
            {
              time: { elapsed: 7, extra: null },
              team: { name: "USA" },
              player: { name: "Damián Bobadilla" },
              assist: { name: null },
              type: "Goal",
              detail: "Own Goal",
            },
          ],
        },
      ],
    },
    {
      20: {
        fixtureId: 20,
        providerId: 20,
        team1: "USA",
        team2: "Paraguay",
        home: 4,
        away: 1,
        status: "completed",
      },
    },
    "2026-06-18T12:00:00.000Z",
  );

  const stats = rebuildPlayerStats(matchStats, undefined, "2026-06-18T12:00:00.000Z");

  assert.deepEqual(stats.scorers[0], {
    player: "Folarin Balogun",
    team: "USA",
    goals: 2,
    assists: 0,
    penaltyGoals: 0,
    matches: [20],
  });
  assert.deepEqual(stats.assists[0], {
    player: "Christian Pulisic",
    team: "USA",
    goals: 0,
    assists: 2,
    penaltyGoals: 0,
    matches: [20],
  });
  assert.equal(stats.scorers.some((row) => row.player === "Damián Bobadilla"), false);
});

test("selects missing and stale player stat matches for refresh", () => {
  const targets = playerStatsRefreshTargets(
    {
      1: {
        fixtureId: 1,
        providerId: 101,
        home: 2,
        away: 1,
        status: "completed",
      },
      2: {
        fixtureId: 2,
        providerId: 102,
        home: 1,
        away: 1,
        status: "completed",
      },
      3: {
        fixtureId: 3,
        providerId: 103,
        home: 1,
        away: 0,
        status: "live",
      },
      4: {
        fixtureId: 4,
        providerId: 104,
        home: 0,
        away: 0,
        status: "scheduled",
        phase: "PRE",
      },
    },
    {
      matchStats: {
        1: {
          fixtureId: 1,
          providerId: 101,
          checkedAt: "2026-06-20T00:00:00.000Z",
          events: [],
        },
        2: {
          fixtureId: 2,
          providerId: 102,
          checkedAt: "2026-06-20T07:30:00.000Z",
          events: [],
        },
      },
    },
    new Date("2026-06-20T08:00:00.000Z"),
  );

  assert.deepEqual(
    targets.map((target) => target.fixtureId),
    [3, 1],
  );
});
