import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyPicks,
  createFreshPicksDraft,
  emptyBonuses,
  groupFixtures,
  scoreSubmission,
} from "@/lib/tournament";
import type { Submission, TournamentResults } from "@/types/game";

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
