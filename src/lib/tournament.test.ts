import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyPicks,
  createFreshPicksDraft,
  emptyBonuses,
  groupFixtures,
  resolveFixtures,
  scoringRules,
  scoreSubmission,
  winnerFor,
} from "@/lib/tournament";
import type { Fixture, Submission, TournamentResults } from "@/types/game";

test("fresh picks retain original group-stage scoring", () => {
  const sourcePicks = createEmptyPicks();
  groupFixtures().forEach((fixture) => {
    sourcePicks[fixture.id] = { fixtureId: fixture.id, home: 1, away: 0 };
  });

  const results: TournamentResults = {
    matches: Object.fromEntries(
      groupFixtures().map((fixture) => [
        fixture.id,
        {
          fixtureId: fixture.id,
          team1: fixture.team1,
          team2: fixture.team2,
          home: 0,
          away: 0,
          status: "completed",
        },
      ]),
    ),
    bonuses: emptyBonuses(),
    updatedAt: "2026-06-27T00:00:00.000Z",
  };

  const source: Submission = {
    id: "source-entry",
    name: "Source",
    createdAt: "2026-06-01T00:00:00.000Z",
    picks: sourcePicks,
    bonuses: emptyBonuses(),
  };
  const draft = createFreshPicksDraft(source, results);
  assert.equal(draft.ready, true);
  if (!draft.ready) return;

  const fresh: Submission = {
    ...source,
    id: "fresh-entry",
    picks: draft.picks,
    freshPicks: {
      sourceSubmissionId: source.id,
      sourceName: source.name,
      sourceCreatedAt: source.createdAt,
      basePicks: source.picks,
      lockedWinners: draft.lockedWinners,
      createdFromResultsAt: results.updatedAt,
    },
  };

  const sourceScore = scoreSubmission(source, results);
  const freshScore = scoreSubmission(fresh, results);
  const actualSeedScore = scoreSubmission({ ...fresh, freshPicks: undefined }, results);

  assert.equal(freshScore.groupMatches, sourceScore.groupMatches);
  assert.equal(freshScore.qualification, sourceScore.qualification);
  assert.notEqual(actualSeedScore.groupMatches, sourceScore.groupMatches);
});

test("knockout match points require the predicted teams to reach that fixture", () => {
  const picks = createEmptyPicks();
  picks[73] = { fixtureId: 73, home: 1, away: 1, winner: "Bosnia & Herzegovina" };

  const submission: Submission = {
    id: "wrong-bracket",
    name: "Wrong Bracket",
    createdAt: "2026-06-01T00:00:00.000Z",
    picks,
    bonuses: emptyBonuses(),
  };
  const results: TournamentResults = {
    matches: {
      73: {
        fixtureId: 73,
        team1: "South Africa",
        team2: "Canada",
        home: 0,
        away: 0,
        status: "live",
      },
    },
    bonuses: emptyBonuses(),
    updatedAt: "2026-06-28T20:00:00.000Z",
  };

  const score = scoreSubmission(submission, results);
  assert.equal(score.knockoutMatches, 0);
  assert.equal(score.total, 0);
});

test("knockout scoring matches DR Congo against Congo DR provider names", () => {
  const picks = createEmptyPicks();
  const resolved = resolveFixtures(picks);
  const fixture = resolved.find((item) => item.id === 83);
  assert.ok(fixture);
  assert.equal(fixture.resolvedTeam1, "DR Congo");
  picks[83] = { fixtureId: 83, home: 2, away: 1 };

  const submission: Submission = {
    id: "congo-alias",
    name: "Congo Alias",
    createdAt: "2026-06-01T00:00:00.000Z",
    picks,
    bonuses: emptyBonuses(),
  };
  const results: TournamentResults = {
    matches: {
      83: {
        fixtureId: 83,
        team1: "Congo DR",
        team2: fixture.resolvedTeam2,
        home: 2,
        away: 1,
        winner: "Congo DR",
        status: "completed",
      },
    },
    bonuses: emptyBonuses(),
    updatedAt: "2026-07-02T00:00:00.000Z",
  };

  const score = scoreSubmission(submission, results);

  assert.equal(score.knockoutMatches, 40);
});

test("round of 16 teams earn a deep-run bonus after the round of 32", () => {
  const picks = createEmptyPicks();
  Object.keys(picks).forEach((fixtureId) => {
    picks[Number(fixtureId)] = { fixtureId: Number(fixtureId), home: 1, away: 0 };
  });

  const completedStages = new Set<Fixture["stage"]>(["group", "round32"]);
  const resolved = resolveFixtures(picks);
  const results: TournamentResults = {
    matches: Object.fromEntries(
      resolved
        .filter((fixture) => completedStages.has(fixture.stage))
        .map((fixture) => [
          fixture.id,
          {
            fixtureId: fixture.id,
            team1: fixture.resolvedTeam1,
            team2: fixture.resolvedTeam2,
            home: 1,
            away: 0,
            winner: fixture.resolvedTeam1,
            status: "completed",
          },
        ]),
    ),
    bonuses: emptyBonuses(),
    updatedAt: "2026-07-04T00:00:00.000Z",
  };
  const submission: Submission = {
    id: "round-16-bonus",
    name: "Round 16 Bonus",
    createdAt: "2026-06-01T00:00:00.000Z",
    picks,
    bonuses: emptyBonuses(),
  };

  const score = scoreSubmission(submission, results);

  assert.equal(score.placements, 16 * scoringRules.round16Participant);
});

test("next-stage bonuses land as soon as a feeder knockout match has a winner", () => {
  const picks = createEmptyPicks();
  Object.keys(picks).forEach((fixtureId) => {
    picks[Number(fixtureId)] = { fixtureId: Number(fixtureId), home: 1, away: 0 };
  });
  const resolved = resolveFixtures(picks);
  const round32 = resolved.find((fixture) => fixture.id === 73);
  assert.ok(round32);

  const results: TournamentResults = {
    matches: {
      73: {
        fixtureId: 73,
        team1: round32.resolvedTeam1,
        team2: round32.resolvedTeam2,
        home: 1,
        away: 0,
        winner: round32.resolvedTeam1,
        status: "completed",
      },
    },
    bonuses: emptyBonuses(),
    updatedAt: "2026-06-28T22:00:00.000Z",
  };
  const submission: Submission = {
    id: "single-ko-winner",
    name: "Single KO Winner",
    createdAt: "2026-06-01T00:00:00.000Z",
    picks,
    bonuses: emptyBonuses(),
  };

  const score = scoreSubmission(submission, results);

  assert.equal(score.placements, scoringRules.round16Participant);
});

test("unsettled knockout draws do not advance a placeholder team", () => {
  const picks = createEmptyPicks();
  Object.keys(picks).forEach((fixtureId) => {
    picks[Number(fixtureId)] = { fixtureId: Number(fixtureId), home: 1, away: 0 };
  });
  const resolved = resolveFixtures(picks);
  const round32 = resolved.find((fixture) => fixture.id === 73);
  assert.ok(round32);

  const results: TournamentResults = {
    matches: {
      73: {
        fixtureId: 73,
        team1: round32.resolvedTeam1,
        team2: round32.resolvedTeam2,
        home: 1,
        away: 1,
        status: "live",
      },
    },
    bonuses: emptyBonuses(),
    updatedAt: "2026-06-28T21:00:00.000Z",
  };
  const actualResolved = resolveFixtures(results.matches);
  const round16 = actualResolved.find((fixture) => fixture.id === 90);
  assert.ok(round16);

  const submission: Submission = {
    id: "unsettled-ko-draw",
    name: "Unsettled KO Draw",
    createdAt: "2026-06-01T00:00:00.000Z",
    picks,
    bonuses: emptyBonuses(),
  };

  assert.equal(round16.resolvedTeam1, "W73");
  assert.equal(scoreSubmission(submission, results).placements, 0);
});

test("fresh picks lock an original champion through the full available final route", () => {
  const sourcePicks = createEmptyPicks();
  Object.keys(sourcePicks).forEach((fixtureId) => {
    sourcePicks[Number(fixtureId)] = { fixtureId: Number(fixtureId), home: 1, away: 0 };
  });
  const sourceFinal = sourcePicks[104];
  sourcePicks[104] = { ...sourceFinal, home: 2, away: 0, winner: undefined };
  const source: Submission = {
    id: "source-entry",
    name: "Source",
    createdAt: "2026-06-01T00:00:00.000Z",
    picks: sourcePicks,
    bonuses: emptyBonuses(),
  };

  const groupResults: TournamentResults = {
    matches: Object.fromEntries(
      groupFixtures().map((fixture) => {
        const pick = sourcePicks[fixture.id];
        return [
          fixture.id,
          {
            fixtureId: fixture.id,
            team1: fixture.team1,
            team2: fixture.team2,
            home: Number(pick.home),
            away: Number(pick.away),
            status: "completed",
          },
        ];
      }),
    ),
    bonuses: emptyBonuses(),
    updatedAt: "2026-06-27T00:00:00.000Z",
  };

  const draft = createFreshPicksDraft(source, groupResults);
  assert.equal(draft.ready, true);
  if (!draft.ready) return;

  const final = resolveFixtures(source.picks).find((fixture) => fixture.id === 104);
  assert.ok(final);
  const champion = winnerFor(final.resolvedTeam1, final.resolvedTeam2, source.picks[104]);
  const championLockedMatches = Object.entries(draft.lockedWinners).filter(
    ([, winner]) => winner === champion,
  );
  assert.equal(championLockedMatches.length, 5);
  assert.ok(championLockedMatches.some(([fixtureId]) => Number(fixtureId) === 104));
});
