import { fixtures } from "@/data/fixtures";
import {
  THIRD_PLACE_ALLOCATION_BY_GROUPS,
  THIRD_PLACE_SLOT_FIXTURE_IDS,
} from "@/data/third-place-allocation";
import { fixtureKickoffDate } from "@/lib/fixture-time";
import type {
  BonusPicks,
  Fixture,
  MatchPick,
  ResolvedFixture,
  ResultMatch,
  ScoreBreakdown,
  Submission,
  TeamStanding,
  TournamentResults,
} from "@/types/game";

export const FIRST_KICK_OFF_ISO = "2026-06-11T19:00:00.000Z";

export const scoringRules = {
  groupResult: 7,
  groupTeamGoals: 5,
  groupGoalDifferencePerTeam: 2,
  groupExactBonus: 4,
  round32Qualification: 12,
  exactGroupPosition: 10,
  nearGroupPosition: 3,
  knockoutWinner: 12,
  knockoutTeamGoals: 6,
  knockoutGoalDifference: 6,
  knockoutExactBonus: 10,
  quarterFinalist: 30,
  semiFinalist: 40,
  finalist: 50,
  fourthPlace: 40,
  thirdPlace: 50,
  runnerUp: 70,
  champion: 150,
  topScorer: 75,
  goldenBall: 40,
  mostGoalsTeam: 30,
};

const letters = "ABCDEFGHIJKL".split("");

const fixturesInMatchNumberOrder = [...fixtures].sort((a, b) => {
  const aKickoff = fixtureKickoffDate(a)?.getTime() ?? new Date(`${a.date}T12:00:00Z`).getTime();
  const bKickoff = fixtureKickoffDate(b)?.getTime() ?? new Date(`${b.date}T12:00:00Z`).getTime();
  return aKickoff - bKickoff || a.id - b.id;
});
const matchNumberByFixtureId = new Map(
  fixturesInMatchNumberOrder.map((fixture, index) => [fixture.id, index + 1]),
);
const fixtureByMatchNumber = new Map(
  fixturesInMatchNumberOrder.map((fixture, index) => [index + 1, fixture]),
);

export function emptyBonuses(): BonusPicks {
  return { topScorer: "", goldenBall: "", mostGoalsTeam: "" };
}

export function displayMatchNumber(fixture: Pick<Fixture, "id">) {
  return matchNumberByFixtureId.get(fixture.id) ?? fixture.id;
}

export function fixtureFromProviderMatchNumber(matchNumber?: number) {
  if (typeof matchNumber !== "number") return undefined;
  return fixtureByMatchNumber.get(matchNumber);
}

export function groupFixtures() {
  return fixtures.filter((fixture) => fixture.stage === "group");
}

export function knockoutFixtures() {
  return fixtures.filter((fixture) => fixture.stage !== "group");
}

export function groupTeams() {
  return letters.map((letter) => {
    const teams = new Set<string>();
    groupFixtures()
      .filter((fixture) => fixture.group === letter)
      .forEach((fixture) => {
        teams.add(fixture.team1);
        teams.add(fixture.team2);
      });
    return { group: letter, teams: Array.from(teams) };
  });
}

function scoreComplete(score?: Pick<MatchPick, "home" | "away">) {
  return typeof score?.home === "number" && typeof score.away === "number";
}

function outcome(home: number, away: number) {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

export function winnerFor(team1: string, team2: string, pick?: MatchPick) {
  if (
    !pick ||
    typeof pick.home !== "number" ||
    typeof pick.away !== "number"
  ) {
    return "";
  }
  if (pick.home > pick.away) return team1;
  if (pick.away > pick.home) return team2;
  return pick.winner || team1;
}

export function calculateGroupStandings(
  picks: Record<number, MatchPick | ResultMatch>,
) {
  const groups = new Map<string, TeamStanding[]>();

  for (const { group, teams } of groupTeams()) {
    groups.set(
      group,
      teams.map((team, seed) => ({
        team,
        group,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
        seed,
        position: seed + 1,
      })),
    );
  }

  for (const fixture of groupFixtures()) {
    if (!fixture.group) continue;
    const pick = picks[fixture.id];
    if (!scoreComplete(pick)) continue;
    const homeGoals = Number(pick.home);
    const awayGoals = Number(pick.away);
    const table = groups.get(fixture.group);
    const home = table?.find((standing) => standing.team === fixture.team1);
    const away = table?.find((standing) => standing.team === fixture.team2);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.gf += homeGoals;
    home.ga += awayGoals;
    away.gf += awayGoals;
    away.ga += homeGoals;

    if (homeGoals > awayGoals) {
      home.won += 1;
      away.lost += 1;
      home.points += 3;
    } else if (awayGoals > homeGoals) {
      away.won += 1;
      home.lost += 1;
      away.points += 3;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const table of groups.values()) {
    table.forEach((standing) => {
      standing.gd = standing.gf - standing.ga;
    });
    table.sort(
      (a, b) =>
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.seed - b.seed,
    );
    table.forEach((standing, index) => {
      standing.position = index + 1;
    });
  }

  return groups;
}

export function qualifiedTeams(picks: Record<number, MatchPick | ResultMatch>) {
  const standings = calculateGroupStandings(picks);
  const topTwo = Array.from(standings.values()).flatMap((table) =>
    table.slice(0, 2),
  );
  const thirds = Array.from(standings.values())
    .map((table) => table[2])
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.seed - b.seed,
    );

  return {
    standings,
    topTwo,
    bestThirds: thirds.slice(0, 8),
    allThirds: thirds,
    round32: [...topTwo, ...thirds.slice(0, 8)],
  };
}

function thirdPlaceTeamByFixtureId(picks: Record<number, MatchPick | ResultMatch>) {
  const { bestThirds } = qualifiedTeams(picks);
  const qualifiedGroups = bestThirds.map((team) => team.group).sort().join("");
  const allocation = THIRD_PLACE_ALLOCATION_BY_GROUPS[qualifiedGroups];
  const teamsByGroup = new Map(bestThirds.map((team) => [team.group, team.team]));
  const assigned = new Map<number, string>();

  if (allocation) {
    THIRD_PLACE_SLOT_FIXTURE_IDS.forEach((fixtureId, index) => {
      const group = allocation[index];
      const team = group ? teamsByGroup.get(group) : undefined;
      if (team) {
        assigned.set(fixtureId, team);
      }
    });
  }

  if (assigned.size === THIRD_PLACE_SLOT_FIXTURE_IDS.length) {
    return assigned;
  }

  const used = new Set(assigned.values());
  for (const fixture of fixtures) {
    if (fixture.stage !== "round32") continue;
    [fixture.team1, fixture.team2].forEach((token) => {
      if (!token.match(/^3[A-L/]+$/) || assigned.has(fixture.id)) return;
      const allowed = new Set(token.replace(/\s/g, "").slice(1).split("/"));
      const team = bestThirds.find(
        (standing) => allowed.has(standing.group) && !used.has(standing.team),
      );
      if (team) {
        used.add(team.team);
        assigned.set(fixture.id, team.team);
      }
    });
  }

  return assigned;
}

function rankToken(
  token: string,
  picks: Record<number, MatchPick | ResultMatch>,
  thirdPlaceSlots?: Map<number, string>,
  fixtureId?: number,
) {
  const { standings, allThirds } = qualifiedTeams(picks);
  const clean = token.replace(/\s/g, "");
  const direct = clean.match(/^([12])([A-L])$/);
  if (direct) {
    const [, position, group] = direct;
    return standings.get(group)?.[Number(position) - 1]?.team ?? token;
  }
  const third = clean.match(/^3([A-L/]+)$/);
  if (third) {
    const allocatedTeam = fixtureId ? thirdPlaceSlots?.get(fixtureId) : undefined;
    if (allocatedTeam) return allocatedTeam;
    const allowed = new Set(third[1].split("/"));
    return allThirds.find((team) => allowed.has(team.group))?.team ?? token;
  }
  return token;
}

export function resolveFixtures(
  picks: Record<number, MatchPick | ResultMatch>,
): ResolvedFixture[] {
  const resolved = new Map<number, ResolvedFixture>();
  const thirdPlaceSlots = thirdPlaceTeamByFixtureId(picks);
  for (const fixture of fixtures) {
    let resolvedTeam1 = fixture.team1;
    let resolvedTeam2 = fixture.team2;

    if (fixture.stage !== "group") {
      const winner1 = fixture.team1.match(/^W(\d+)$/);
      const winner2 = fixture.team2.match(/^W(\d+)$/);
      const loser1 = fixture.team1.match(/^L(\d+)$/);
      const loser2 = fixture.team2.match(/^L(\d+)$/);

      if (winner1) {
        const prev = resolved.get(Number(winner1[1]));
        const prevPick = picks[Number(winner1[1])] as MatchPick | undefined;
        resolvedTeam1 = prev
          ? winnerFor(prev.resolvedTeam1, prev.resolvedTeam2, prevPick)
          : fixture.team1;
      } else if (loser1) {
        const prev = resolved.get(Number(loser1[1]));
        const prevPick = picks[Number(loser1[1])] as MatchPick | undefined;
        const win = prev
          ? winnerFor(prev.resolvedTeam1, prev.resolvedTeam2, prevPick)
          : "";
        resolvedTeam1 = prev
          ? win === prev.resolvedTeam1
            ? prev.resolvedTeam2
            : prev.resolvedTeam1
          : fixture.team1;
      } else {
        resolvedTeam1 = rankToken(fixture.team1, picks, thirdPlaceSlots, fixture.id);
      }

      if (winner2) {
        const prev = resolved.get(Number(winner2[1]));
        const prevPick = picks[Number(winner2[1])] as MatchPick | undefined;
        resolvedTeam2 = prev
          ? winnerFor(prev.resolvedTeam1, prev.resolvedTeam2, prevPick)
          : fixture.team2;
      } else if (loser2) {
        const prev = resolved.get(Number(loser2[1]));
        const prevPick = picks[Number(loser2[1])] as MatchPick | undefined;
        const win = prev
          ? winnerFor(prev.resolvedTeam1, prev.resolvedTeam2, prevPick)
          : "";
        resolvedTeam2 = prev
          ? win === prev.resolvedTeam1
            ? prev.resolvedTeam2
            : prev.resolvedTeam1
          : fixture.team2;
      } else {
        resolvedTeam2 = rankToken(fixture.team2, picks, thirdPlaceSlots, fixture.id);
      }
    }

    resolved.set(fixture.id, { ...fixture, resolvedTeam1, resolvedTeam2 });
  }

  return fixtures.map((fixture) => resolved.get(fixture.id)!);
}

export function createEmptyPicks() {
  return Object.fromEntries(
    fixtures.map((fixture) => [
      fixture.id,
      { fixtureId: fixture.id, home: "", away: "" } satisfies MatchPick,
    ]),
  ) as Record<number, MatchPick>;
}

function pickFromResult(result: ResultMatch): MatchPick {
  return {
    fixtureId: result.fixtureId,
    home: result.home,
    away: result.away,
    winner: result.winner,
  };
}

function completedGroupResultPicks(results: TournamentResults) {
  const groupIds = groupFixtures().map((fixture) => fixture.id);
  if (!allResultsPresent(results, groupIds)) return null;

  const picks = createEmptyPicks();
  groupIds.forEach((fixtureId) => {
    const result = results.matches[fixtureId];
    if (result) picks[fixtureId] = pickFromResult(result);
  });
  return picks;
}

function applyLockedWinner(
  picks: Record<number, MatchPick>,
  fixture: ResolvedFixture,
  team: string,
) {
  const homeWins = fixture.resolvedTeam1 === team;
  picks[fixture.id] = {
    fixtureId: fixture.id,
    home: homeWins ? 1 : 0,
    away: homeWins ? 0 : 1,
    winner: undefined,
  };
}

function lockTeamPathToFinal(
  picks: Record<number, MatchPick>,
  team: string,
  lockedWinners: Record<number, string>,
) {
  const pathStages: Fixture["stage"][] = ["round32", "round16", "quarter", "semi"];
  for (const stage of pathStages) {
    const fixture = resolveFixtures(picks).find(
      (item) =>
        item.stage === stage &&
        (item.resolvedTeam1 === team || item.resolvedTeam2 === team),
    );
    if (!fixture) return false;
    if (lockedWinners[fixture.id] && lockedWinners[fixture.id] !== team) return false;
    applyLockedWinner(picks, fixture, team);
    lockedWinners[fixture.id] = team;
  }
  return true;
}

export function createFreshPicksDraft(source: Submission, results: TournamentResults) {
  const picks = completedGroupResultPicks(results);
  if (!picks) {
    return {
      ready: false,
      reason: "Fresh picks need all group-stage results before the Round of 32 bracket can be seeded.",
    } as const;
  }

  const sourceFinal = resolveFixtures(source.picks).find((fixture) => fixture.id === 104);
  const sourceFinalPick = source.picks[104];
  const champion = sourceFinal
    ? winnerFor(sourceFinal.resolvedTeam1, sourceFinal.resolvedTeam2, sourceFinalPick)
    : "";
  const runnerUp =
    sourceFinal && champion
      ? champion === sourceFinal.resolvedTeam1
        ? sourceFinal.resolvedTeam2
        : sourceFinal.resolvedTeam1
      : "";
  const finalists = [champion, runnerUp].filter(Boolean);
  const lockedWinners: Record<number, string> = {};
  const missingFinalists = finalists.filter(
    (team) => !lockTeamPathToFinal(picks, team, lockedWinners),
  );

  const final = resolveFixtures(picks).find((fixture) => fixture.id === 104);
  if (final && champion && (final.resolvedTeam1 === champion || final.resolvedTeam2 === champion)) {
    applyLockedWinner(picks, final, champion);
    lockedWinners[final.id] = champion;
  } else if (champion) {
    missingFinalists.push(champion);
  }

  return {
    ready: true,
    picks,
    bonuses: { ...source.bonuses },
    lockedWinners,
    missingFinalists: Array.from(new Set(missingFinalists)),
  } as const;
}

function randomGoal(): number {
  const r = Math.random();
  if (r < 0.22) return 0;
  if (r < 0.52) return 1;
  if (r < 0.78) return 2;
  if (r < 0.93) return 3;
  return 4;
}

export function autofillTournament(existing: Record<number, MatchPick>) {
  const picks = structuredClone(existing);

  for (const fixture of groupFixtures()) {
    const current = picks[fixture.id];
    if (scoreComplete(current)) continue;
    picks[fixture.id] = { fixtureId: fixture.id, home: randomGoal(), away: randomGoal() };
  }

  for (const fixture of resolveFixtures(picks).filter(
    (item) => item.stage !== "group",
  )) {
    const current = picks[fixture.id];
    if (scoreComplete(current)) continue;
    const home = randomGoal();
    const away = randomGoal();
    picks[fixture.id] = {
      fixtureId: fixture.id,
      home,
      away,
      winner: home === away ? fixture.resolvedTeam1 : undefined,
    };
  }

  return picks;
}

export function completedMatchCount(picks: Record<number, MatchPick>) {
  return Object.values(picks).filter(scoreComplete).length;
}

function allResultsPresent(results: TournamentResults, ids: number[]) {
  return ids.every((id) => scoreComplete(results.matches[id]));
}

export function scoreSubmission(
  submission: Submission,
  results: TournamentResults,
): ScoreBreakdown {
  const retainedPicks = submission.freshPicks?.basePicks ?? submission.picks;
  const breakdown: ScoreBreakdown = {
    total: 0,
    groupMatches: 0,
    knockoutMatches: 0,
    qualification: 0,
    placements: 0,
    bonuses: 0,
    exacts: 0,
  };

  for (const fixture of fixtures) {
    const pick =
      fixture.stage === "group"
        ? retainedPicks[fixture.id]
        : submission.picks[fixture.id];
    const result = results.matches[fixture.id];
    if (!pick || !result || !scoreComplete(pick)) continue;
    const pHome = Number(pick.home);
    const pAway = Number(pick.away);

    if (fixture.stage === "group") {
      if (outcome(pHome, pAway) === outcome(result.home, result.away)) {
        breakdown.groupMatches += scoringRules.groupResult;
      }
      if (pHome === result.home) {
        breakdown.groupMatches += scoringRules.groupTeamGoals;
      }
      if (pAway === result.away) {
        breakdown.groupMatches += scoringRules.groupTeamGoals;
      }
      if (pHome - pAway === result.home - result.away) {
        breakdown.groupMatches += scoringRules.groupGoalDifferencePerTeam * 2;
      }
      if (pHome === result.home && pAway === result.away) {
        breakdown.groupMatches += scoringRules.groupExactBonus;
        breakdown.exacts += 1;
      }
    } else {
      const resolvedPickFixture = resolveFixtures(submission.picks).find(
        (item) => item.id === fixture.id,
      );
      const pickWinner = resolvedPickFixture
        ? winnerFor(
            resolvedPickFixture.resolvedTeam1,
            resolvedPickFixture.resolvedTeam2,
            pick,
          )
        : pick.winner;
      if (pickWinner && result.winner && pickWinner === result.winner) {
        breakdown.knockoutMatches += scoringRules.knockoutWinner;
      }
      if (pHome === result.home) {
        breakdown.knockoutMatches += scoringRules.knockoutTeamGoals;
      }
      if (pAway === result.away) {
        breakdown.knockoutMatches += scoringRules.knockoutTeamGoals;
      }
      if (pHome - pAway === result.home - result.away) {
        breakdown.knockoutMatches += scoringRules.knockoutGoalDifference;
      }
      if (pHome === result.home && pAway === result.away) {
        breakdown.knockoutMatches += scoringRules.knockoutExactBonus;
        breakdown.exacts += 1;
      }
    }
  }

  const predictedQualified = qualifiedTeams(retainedPicks);
  const groupResultsComplete = allResultsPresent(
    results,
    groupFixtures().map((fixture) => fixture.id),
  );

  if (groupResultsComplete) {
    const actualQualified = qualifiedTeams(results.matches);
    const actualRound32 = new Set(actualQualified.round32.map((team) => team.team));
    predictedQualified.round32.forEach((team) => {
      if (actualRound32.has(team.team)) {
        breakdown.qualification += scoringRules.round32Qualification;
      }
    });

    for (const [group, actualTable] of actualQualified.standings.entries()) {
      const predicted = predictedQualified.standings.get(group) ?? [];
      predicted.forEach((team) => {
        const actual = actualTable.find((item) => item.team === team.team);
        if (!actual) return;
        if (actual.position === team.position) {
          breakdown.qualification += scoringRules.exactGroupPosition;
        } else if (Math.abs(actual.position - team.position) === 1) {
          breakdown.qualification += scoringRules.nearGroupPosition;
        }
      });
    }
  }

  const fixtureIdsByStage = (stage: string) =>
    fixtures.filter((fixture) => fixture.stage === stage).map((fixture) => fixture.id);
  const round32Complete = allResultsPresent(results, fixtureIdsByStage("round32"));
  const round16Complete = allResultsPresent(results, fixtureIdsByStage("round16"));
  const quarterComplete = allResultsPresent(results, fixtureIdsByStage("quarter"));
  const semiComplete = allResultsPresent(results, fixtureIdsByStage("semi"));

  const quarterFinalistsKnown = groupResultsComplete && round32Complete && round16Complete;
  const semiFinalistsKnown = quarterFinalistsKnown && quarterComplete;
  const finalistsKnown = semiFinalistsKnown && semiComplete;

  if (quarterFinalistsKnown || semiFinalistsKnown || finalistsKnown) {
    const actualResolved = resolveFixtures(results.matches);
    const predictedResolved = resolveFixtures(submission.picks);
    const teamsInFixtures = (resolved: ResolvedFixture[], ids: number[]) =>
      new Set(
        resolved
          .filter((fixture) => ids.includes(fixture.id))
          .flatMap((fixture) => [fixture.resolvedTeam1, fixture.resolvedTeam2]),
      );
    const predictedSets = {
      qf: teamsInFixtures(predictedResolved, [97, 98, 99, 100]),
      sf: teamsInFixtures(predictedResolved, [101, 102]),
      final: teamsInFixtures(predictedResolved, [104]),
    };

    if (quarterFinalistsKnown) {
      const actualQf = teamsInFixtures(actualResolved, [97, 98, 99, 100]);
      predictedSets.qf.forEach((team) => {
        if (actualQf.has(team)) breakdown.placements += scoringRules.quarterFinalist;
      });
    }

    if (semiFinalistsKnown) {
      const actualSf = teamsInFixtures(actualResolved, [101, 102]);
      predictedSets.sf.forEach((team) => {
        if (actualSf.has(team)) breakdown.placements += scoringRules.semiFinalist;
      });
    }

    if (finalistsKnown) {
      const actualFinal = teamsInFixtures(actualResolved, [104]);
      predictedSets.final.forEach((team) => {
        if (actualFinal.has(team)) breakdown.placements += scoringRules.finalist;
      });
    }
  }

  const predictedResolved = resolveFixtures(submission.picks);
  const finalResult = results.matches[104];
  const predictedFinal = predictedResolved.find((fixture) => fixture.id === 104);
  const finalPick = submission.picks[104];
  if (finalResult?.winner && predictedFinal && finalPick) {
    const champion = winnerFor(
      predictedFinal.resolvedTeam1,
      predictedFinal.resolvedTeam2,
      finalPick,
    );
    const runnerUp =
      champion === predictedFinal.resolvedTeam1
        ? predictedFinal.resolvedTeam2
        : predictedFinal.resolvedTeam1;
    if (champion === finalResult.winner) breakdown.placements += scoringRules.champion;
    const actualRunner =
      finalResult.winner === finalResult.team1 ? finalResult.team2 : finalResult.team1;
    if (runnerUp && runnerUp === actualRunner) {
      breakdown.placements += scoringRules.runnerUp;
    }
  }

  if (
    results.bonuses.topScorer &&
    submission.bonuses.topScorer.trim().toLowerCase() ===
      results.bonuses.topScorer.trim().toLowerCase()
  ) {
    breakdown.bonuses += scoringRules.topScorer;
  }
  if (
    results.bonuses.goldenBall &&
    submission.bonuses.goldenBall.trim().toLowerCase() ===
      results.bonuses.goldenBall.trim().toLowerCase()
  ) {
    breakdown.bonuses += scoringRules.goldenBall;
  }
  if (
    results.bonuses.mostGoalsTeam &&
    submission.bonuses.mostGoalsTeam.trim().toLowerCase() ===
      results.bonuses.mostGoalsTeam.trim().toLowerCase()
  ) {
    breakdown.bonuses += scoringRules.mostGoalsTeam;
  }

  breakdown.total =
    breakdown.groupMatches +
    breakdown.knockoutMatches +
    breakdown.qualification +
    breakdown.placements +
    breakdown.bonuses;

  return breakdown;
}

export function sampleResults(): TournamentResults {
  const picks = autofillTournament(createEmptyPicks());
  const resolved = resolveFixtures(picks);
  return {
    matches: Object.fromEntries(
      resolved.slice(0, 36).map((fixture) => {
        const pick = picks[fixture.id];
        return [
          fixture.id,
          {
            fixtureId: fixture.id,
            team1: fixture.resolvedTeam1,
            team2: fixture.resolvedTeam2,
            home: Number(pick.home),
            away: Number(pick.away),
            winner: winnerFor(fixture.resolvedTeam1, fixture.resolvedTeam2, pick),
          },
        ];
      }),
    ),
    bonuses: emptyBonuses(),
    updatedAt: new Date().toISOString(),
  };
}
