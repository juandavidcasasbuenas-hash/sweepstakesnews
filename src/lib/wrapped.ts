// "Your 2026 Journey" — Spotify-Wrapped-style season recap engine.
//
// Everything here is computed from the real pool data: the submissions table
// and the stored match results. No numbers are invented. The engine replays
// the tournament matchday by matchday (same bucketing as the title-race
// chart), rebuilds the leaderboard at every checkpoint, and distils each
// player's season into a handful of tabloid-ready stats.

import { fixtures } from "@/data/fixtures";
import { avatarForName, fallbackColorForName, slugifyName } from "@/lib/avatars";
import { fixtureKickoffDate } from "@/lib/fixture-time";
import { flagUrlFor } from "@/lib/team-flags";
import {
  displayMatchNumber,
  emptyBonuses,
  resolveFixtures,
  scoreSubmission,
  scoreSubmissionReceipt,
  winnerFor,
  type ScoreReceipt,
} from "@/lib/tournament";
import type {
  Fixture,
  ResultMatch,
  Submission,
  TournamentResults,
} from "@/types/game";

export type WrappedZone = "podium" | "midtable" | "relegation";

export type WrappedStagePoint = {
  key: string;
  label: string;
  short: string;
  /** Cumulative points at the end of this checkpoint. */
  points: number;
  gained: number;
  rank: number;
  zone: WrappedZone;
};

export type WrappedZoneSummary = {
  podiumPct: number;
  midtablePct: number;
  relegationPct: number;
  dominantZone: WrappedZone;
  bestRank: number;
  bestRankStage: string;
  worstRank: number;
  worstRankStage: string;
  /** Biggest single-checkpoint jump up the table. */
  biggestClimb: { places: number; from: number; to: number; stage: string } | null;
  biggestFall: { places: number; from: number; to: number; stage: string } | null;
};

export type WrappedPerfect = {
  fixtureId: number;
  matchNumber: number;
  round: string;
  team1: string;
  team2: string;
  flag1: string;
  flag2: string;
  score: string;
  stage: Fixture["stage"];
};

export type WrappedBoldCall = {
  fixtureId: number;
  matchNumber: number;
  round: string;
  team1: string;
  team2: string;
  flag1: string;
  flag2: string;
  predicted: string;
  actual: string;
  /** The outcome only this player called. */
  calledWinner: string;
  exact: boolean;
  /** "result": only correct caller · "exact": only exact-score caller. */
  kind: "result" | "exact";
};

export type WrappedRival = {
  name: string;
  displayName: string;
  realName: string | null;
  slug: string;
  avatar: string | null;
  color: string;
  /** Times the pair swapped places across the season checkpoints. */
  overtakes: number;
  currentGapPoints: number;
  aheadNow: boolean;
  currentRank: number;
};

export type WrappedTwin = {
  name: string;
  displayName: string;
  avatar: string | null;
  matching: number;
  compared: number;
  pct: number;
};

export type WrappedNationBias = {
  team: string;
  flag: string;
  /** Matches this player backed the nation to win. */
  backedWins: number;
  poolAvgBackedWins: number;
  /** Goals this player awarded the nation across all picks. */
  goalsAwarded: number;
  poolAvgGoalsAwarded: number;
  /** How much deeper than the room they believed. */
  biasScore: number;
  /** Whether the beloved nation is still in the real tournament. */
  alive: boolean;
};

export type WrappedChapterTone = "start" | "rise" | "fall" | "hold" | "now";
export type WrappedEmotion = "despair" | "grind" | "glory" | "neutral";

export type WrappedChapter = {
  /** Inclusive timeline index range the camera frames. */
  fromIndex: number;
  toIndex: number;
  title: string;
  caption: string;
  tone: WrappedChapterTone;
  emotion: WrappedEmotion;
};

export type WrappedTrait = {
  key: "precision" | "boldness" | "chaos" | "loyalty" | "nerve";
  label: string;
  /** 0–100, computed from real gameplay. */
  value: number;
  note: string;
};

export type WrappedVerdict = {
  traits: WrappedTrait[];
  /** The written season verdict, tabloid voice, data-derived. */
  text: string;
};

export type WrappedPersonality = {
  archetype: string;
  tagline: string;
  avgGoals: number;
  poolAvgGoals: number;
  /** Share of group-stage calls agreeing with the room. */
  agreementPct: number | null;
  poolAvgAgreementPct: number | null;
  draws: number;
  nilNils: number;
  shootouts: number;
  wildestScoreline: { score: string; team1: string; team2: string; round: string } | null;
  biggestMargin: { score: string; team1: string; team2: string; round: string } | null;
  champion: string;
  championFlag: string;
  championAlive: boolean;
  runnerUp: string;
  finalScore: string;
  topScorerPick: string;
  goldenBallPick: string;
};

export type PlayerWrapped = {
  id: string;
  name: string;
  /** Team name without the "(Real name)" suffix. */
  displayName: string;
  realName: string | null;
  slug: string;
  avatar: string | null;
  color: string;
  playerCount: number;
  completedMatches: number;
  totalMatches: number;
  updatedAt: string;
  rank: number;
  totalPoints: number;
  pointsBehindLeader: number;
  pointsAheadOfNext: number | null;
  leaderName: string;
  categories: ScoreReceipt["categories"];
  timeline: WrappedStagePoint[];
  stageShorts: string[];
  zones: WrappedZoneSummary;
  perfects: WrappedPerfect[];
  perfectsRank: number;
  poolMaxPerfects: { name: string; displayName: string; count: number };
  boldCalls: WrappedBoldCall[];
  correctResults: number;
  correctResultsPossible: number;
  rival: WrappedRival | null;
  twin: WrappedTwin | null;
  personality: WrappedPersonality;
  nationBias: WrappedNationBias | null;
  chapters: WrappedChapter[];
  verdict: WrappedVerdict;
  goalsPredicted: number;
  picksMade: number;
};

const STAGE_ORDER: Fixture["stage"][] = [
  "round32",
  "round16",
  "quarter",
  "semi",
  "thirdPlace",
  "final",
];

const KNOCKOUT_LABELS: Partial<Record<Fixture["stage"], [string, string]>> = {
  round32: ["Round of 32", "R32"],
  round16: ["Round of 16", "R16"],
  quarter: ["Quarter-finals", "QF"],
  semi: ["Semi-finals", "SF"],
  thirdPlace: ["Third place", "3RD"],
  final: ["The Final", "FINAL"],
};

type StageBucket = { key: string; label: string; short: string; fixtures: Fixture[] };

function fixtureTime(fixture: Fixture) {
  return (
    fixtureKickoffDate(fixture)?.getTime() ?? new Date(`${fixture.date}T12:00:00Z`).getTime()
  );
}

function scoreComplete(score?: Pick<ResultMatch, "home" | "away">) {
  return typeof score?.home === "number" && typeof score.away === "number";
}

function buildBuckets(): StageBucket[] {
  const groupBuckets = new Map<string, Fixture[]>();
  fixtures
    .filter((fixture) => fixture.stage === "group")
    .forEach((fixture) => {
      const bucket = groupBuckets.get(fixture.round) ?? [];
      bucket.push(fixture);
      groupBuckets.set(fixture.round, bucket);
    });

  const groups = Array.from(groupBuckets.entries())
    .map(([round, bucket]) => ({
      key: `group:${round}`,
      label: round,
      short: round.replace(/^Matchday\s+/i, "MD"),
      fixtures: bucket.sort((a, b) => fixtureTime(a) - fixtureTime(b)),
    }))
    .sort((a, b) => fixtureTime(a.fixtures[0]) - fixtureTime(b.fixtures[0]));

  const knockouts = STAGE_ORDER.reduce<StageBucket[]>((items, stage) => {
    const bucket = fixtures
      .filter((fixture) => fixture.stage === stage)
      .sort((a, b) => fixtureTime(a) - fixtureTime(b));
    const label = KNOCKOUT_LABELS[stage];
    if (label && bucket.length) {
      items.push({ key: stage, label: label[0], short: label[1], fixtures: bucket });
    }
    return items;
  }, []);

  return [...groups, ...knockouts];
}

function resultsForFixtureIds(results: TournamentResults, fixtureIds: Set<number>) {
  const matches = Object.fromEntries(
    Object.entries(results.matches ?? {}).filter(
      ([fixtureId, result]) => fixtureIds.has(Number(fixtureId)) && scoreComplete(result),
    ),
  ) as TournamentResults["matches"];

  const finalComplete = scoreComplete(matches[104]);
  return {
    matches,
    bonuses: finalComplete ? results.bonuses : emptyBonuses(),
    updatedAt: results.updatedAt,
  } satisfies TournamentResults;
}

export function splitPlayerName(name: string) {
  const match = name.trim().match(/^(.*?)\s*[\[(]([^\])]+)[\])]\s*$/);
  if (match && match[1]) {
    return { displayName: match[1].trim(), realName: match[2].trim() };
  }
  return { displayName: name.trim(), realName: null };
}

export function wrappedSlugForName(name: string) {
  return slugifyName(splitPlayerName(name).displayName);
}

function zoneForRank(rank: number, playerCount: number): WrappedZone {
  if (rank <= 3) return "podium";
  if (rank > playerCount - 3) return "relegation";
  return "midtable";
}

function rankPlayers(totals: Array<{ id: string; points: number; name: string }>) {
  const sorted = [...totals].sort(
    (a, b) => b.points - a.points || a.name.localeCompare(b.name),
  );
  return new Map(sorted.map((entry, index) => [entry.id, index + 1]));
}

type PickStats = {
  goals: number;
  picks: number;
  draws: number;
  nilNils: number;
  shootouts: number;
  wildest: WrappedPersonality["wildestScoreline"];
  biggestMargin: WrappedPersonality["biggestMargin"];
};

function collectPickStats(submission: Submission): PickStats {
  const resolved = resolveFixtures(submission.picks);
  const stats: PickStats = {
    goals: 0,
    picks: 0,
    draws: 0,
    nilNils: 0,
    shootouts: 0,
    wildest: null,
    biggestMargin: null,
  };
  let wildestGoals = -1;
  let widestMargin = -1;

  for (const fixture of resolved) {
    const pick = submission.picks[fixture.id];
    if (!pick || typeof pick.home !== "number" || typeof pick.away !== "number") continue;
    stats.picks += 1;
    const goals = pick.home + pick.away;
    const margin = Math.abs(pick.home - pick.away);
    stats.goals += goals;
    if (pick.home === pick.away) {
      if (fixture.stage === "group") stats.draws += 1;
      else stats.shootouts += 1;
      if (pick.home === 0) stats.nilNils += 1;
    }
    const detail = {
      score: `${pick.home}–${pick.away}`,
      team1: fixture.resolvedTeam1,
      team2: fixture.resolvedTeam2,
      round: fixture.round,
    };
    if (goals > wildestGoals) {
      wildestGoals = goals;
      stats.wildest = detail;
    }
    if (margin > widestMargin) {
      widestMargin = margin;
      stats.biggestMargin = detail;
    }
  }

  return stats;
}

function isRealTeam(token: string) {
  return Boolean(token) && !/^([WL]\d+|[123][A-L/ ]+)$/i.test(token.replace(/\s/g, ""));
}

/** Teams still alive in the real tournament given stored results. */
function aliveTeams(results: TournamentResults) {
  const eliminated = new Set<string>();
  const seen = new Set<string>();
  Object.values(results.matches ?? {}).forEach((match) => {
    if (!match || !scoreComplete(match)) return;
    const fixture = fixtures.find((item) => item.id === match.fixtureId);
    if (!fixture || fixture.stage === "group") return;
    [match.team1, match.team2].forEach((team) => team && seen.add(team));
    if (match.winner) {
      const loser = match.winner === match.team1 ? match.team2 : match.team1;
      if (loser) eliminated.add(loser.toLowerCase());
    }
  });
  return { seen, eliminated };
}

type NationTally = Map<string, { backedWins: number; goalsAwarded: number }>;

function nationTally(submission: Submission): NationTally {
  const tally: NationTally = new Map();
  const resolved = resolveFixtures(submission.picks);
  const bump = (team: string, wins: number, goals: number) => {
    if (!isRealTeam(team)) return;
    const entry = tally.get(team) ?? { backedWins: 0, goalsAwarded: 0 };
    entry.backedWins += wins;
    entry.goalsAwarded += goals;
    tally.set(team, entry);
  };

  for (const fixture of resolved) {
    const pick = submission.picks[fixture.id];
    if (!pick || typeof pick.home !== "number" || typeof pick.away !== "number") continue;
    const predictedWinner = winnerFor(fixture.resolvedTeam1, fixture.resolvedTeam2, pick);
    bump(fixture.resolvedTeam1, 0, pick.home);
    bump(fixture.resolvedTeam2, 0, pick.away);
    if (pick.home !== pick.away && predictedWinner) bump(predictedWinner, 1, 0);
    else if (pick.home === pick.away && fixture.stage !== "group" && predictedWinner) {
      bump(predictedWinner, 1, 0);
    }
  }

  return tally;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildWrapped(
  submissions: Submission[],
  results: TournamentResults,
): PlayerWrapped[] {
  const subs = [...submissions].sort((a, b) => a.name.localeCompare(b.name));
  if (!subs.length) return [];

  const completeResultIds = new Set(
    Object.entries(results.matches ?? {})
      .filter(([, result]) => scoreComplete(result))
      .map(([fixtureId]) => Number(fixtureId)),
  );

  const buckets = buildBuckets().filter((bucket) =>
    bucket.fixtures.some((fixture) => completeResultIds.has(fixture.id)),
  );

  // Cumulative partial results after each completed checkpoint.
  const cumulativeIds = new Set<number>();
  const checkpoints = buckets.map((bucket) => {
    bucket.fixtures.forEach((fixture) => {
      if (completeResultIds.has(fixture.id)) cumulativeIds.add(fixture.id);
    });
    return { bucket, results: resultsForFixtureIds(results, cumulativeIds) };
  });

  // Score every player at every checkpoint once.
  const playerCount = subs.length;
  const timelineByPlayer = new Map<string, WrappedStagePoint[]>();
  const ranksByCheckpoint: Array<Map<string, number>> = [];

  checkpoints.forEach(({ bucket, results: partial }) => {
    const totals = subs.map((sub) => ({
      id: sub.id,
      name: sub.name,
      points: scoreSubmission(sub, partial).total,
    }));
    const ranks = rankPlayers(totals);
    ranksByCheckpoint.push(ranks);
    totals.forEach((entry) => {
      const timeline = timelineByPlayer.get(entry.id) ?? [];
      const previous = timeline[timeline.length - 1]?.points ?? 0;
      const rank = ranks.get(entry.id)!;
      timeline.push({
        key: bucket.key,
        label: bucket.label,
        short: bucket.short,
        points: entry.points,
        gained: entry.points - previous,
        rank,
        zone: zoneForRank(rank, playerCount),
      });
      timelineByPlayer.set(entry.id, timeline);
    });
  });

  // Final receipts (full current results) for perfect scores + categories.
  const receipts = new Map(subs.map((sub) => [sub.id, scoreSubmissionReceipt(sub, results)]));
  const finalTotals = subs.map((sub) => ({
    id: sub.id,
    name: sub.name,
    points: receipts.get(sub.id)!.total,
  }));
  const finalRanks = rankPlayers(finalTotals);
  const sortedFinal = [...finalTotals].sort((a, b) => b.points - a.points);
  const leader = sortedFinal[0];

  // Correct result/winner calls per fixture across the pool → bold calls.
  const correctCallersByFixture = new Map<number, string[]>();
  const exactCallersByFixture = new Map<number, string[]>();
  subs.forEach((sub) => {
    const receipt = receipts.get(sub.id)!;
    receipt.lines.forEach((line) => {
      if (!line.fixtureId) return;
      if (line.label === "Correct result" || line.label === "Correct knockout winner") {
        const callers = correctCallersByFixture.get(line.fixtureId) ?? [];
        callers.push(sub.id);
        correctCallersByFixture.set(line.fixtureId, callers);
      }
      if (line.label.startsWith("Exact")) {
        const callers = exactCallersByFixture.get(line.fixtureId) ?? [];
        callers.push(sub.id);
        exactCallersByFixture.set(line.fixtureId, callers);
      }
    });
  });

  // Group-stage agreement with the room (herd index).
  const agreementByPlayer = new Map<string, number | null>();
  {
    const sums = new Map<string, { same: number; others: number }>();
    for (const fixture of fixtures.filter((item) => item.stage === "group")) {
      const outcomes: Array<{ id: string; outcome: "home" | "draw" | "away" }> = [];
      for (const sub of subs) {
        const pick = sub.picks[fixture.id];
        if (!pick || typeof pick.home !== "number" || typeof pick.away !== "number") continue;
        outcomes.push({
          id: sub.id,
          outcome: pick.home > pick.away ? "home" : pick.away > pick.home ? "away" : "draw",
        });
      }
      if (outcomes.length < 2) continue;
      const counts = { home: 0, draw: 0, away: 0 };
      outcomes.forEach(({ outcome }) => (counts[outcome] += 1));
      outcomes.forEach(({ id, outcome }) => {
        const sum = sums.get(id) ?? { same: 0, others: 0 };
        sum.same += counts[outcome] - 1;
        sum.others += outcomes.length - 1;
        sums.set(id, sum);
      });
    }
    subs.forEach((sub) => {
      const sum = sums.get(sub.id);
      agreementByPlayer.set(
        sub.id,
        sum && sum.others > 0 ? Math.round((sum.same / sum.others) * 100) : null,
      );
    });
  }

  // Pick-twins: exact score agreement between pairs.
  const twinByPlayer = new Map<string, WrappedTwin | null>();
  {
    const bestBy = new Map<string, { other: Submission; matching: number; compared: number }>();
    for (let i = 0; i < subs.length; i += 1) {
      for (let j = i + 1; j < subs.length; j += 1) {
        let matching = 0;
        let compared = 0;
        for (const pick of Object.values(subs[i].picks)) {
          const other = subs[j].picks[pick.fixtureId];
          if (
            typeof pick.home !== "number" ||
            typeof pick.away !== "number" ||
            typeof other?.home !== "number" ||
            typeof other?.away !== "number"
          ) {
            continue;
          }
          compared += 1;
          if (pick.home === other.home && pick.away === other.away) matching += 1;
        }
        if (compared < 10) continue;
        const currentA = bestBy.get(subs[i].id);
        if (!currentA || matching / compared > currentA.matching / currentA.compared) {
          bestBy.set(subs[i].id, { other: subs[j], matching, compared });
        }
        const currentB = bestBy.get(subs[j].id);
        if (!currentB || matching / compared > currentB.matching / currentB.compared) {
          bestBy.set(subs[j].id, { other: subs[i], matching, compared });
        }
      }
    }
    subs.forEach((sub) => {
      const best = bestBy.get(sub.id);
      if (!best) {
        twinByPlayer.set(sub.id, null);
        return;
      }
      const split = splitPlayerName(best.other.name);
      twinByPlayer.set(sub.id, {
        name: best.other.name,
        displayName: split.displayName,
        avatar: avatarForName(best.other.name),
        matching: best.matching,
        compared: best.compared,
        pct: Math.round((best.matching / best.compared) * 100),
      });
    });
  }

  // Pool-wide pick stats + nation tallies for averages.
  const pickStatsByPlayer = new Map(subs.map((sub) => [sub.id, collectPickStats(sub)]));
  const nationTallies = new Map(subs.map((sub) => [sub.id, nationTally(sub)]));
  const poolNationTotals = new Map<string, { backedWins: number; goalsAwarded: number }>();
  nationTallies.forEach((tally) => {
    tally.forEach((entry, team) => {
      const pool = poolNationTotals.get(team) ?? { backedWins: 0, goalsAwarded: 0 };
      pool.backedWins += entry.backedWins;
      pool.goalsAwarded += entry.goalsAwarded;
      poolNationTotals.set(team, pool);
    });
  });

  const poolAvgGoals =
    subs.reduce((sum, sub) => {
      const stats = pickStatsByPlayer.get(sub.id)!;
      return sum + (stats.picks ? stats.goals / stats.picks : 0);
    }, 0) / subs.length;

  const agreementValues = subs
    .map((sub) => agreementByPlayer.get(sub.id))
    .filter((value): value is number => value !== null);
  const poolAvgAgreement = agreementValues.length
    ? Math.round(agreementValues.reduce((sum, value) => sum + value, 0) / agreementValues.length)
    : null;

  // Perfect-score league.
  const perfectCounts = subs.map((sub) => ({
    id: sub.id,
    name: sub.name,
    count: receipts.get(sub.id)!.exacts,
  }));
  const maxPerfect = [...perfectCounts].sort((a, b) => b.count - a.count)[0];
  const maxPerfectSplit = splitPlayerName(maxPerfect.name);

  const { eliminated } = aliveTeams(results);

  const completedMatches = completeResultIds.size;

  return subs.map((sub) => {
    const receipt = receipts.get(sub.id)!;
    const timeline = timelineByPlayer.get(sub.id) ?? [];
    const split = splitPlayerName(sub.name);
    const stats = pickStatsByPlayer.get(sub.id)!;
    const rank = finalRanks.get(sub.id)!;
    const totalPoints = receipt.total;

    // ── Zones ──
    const zoneCounts = { podium: 0, midtable: 0, relegation: 0 };
    timeline.forEach((point) => (zoneCounts[point.zone] += 1));
    const checkpointsCount = Math.max(1, timeline.length);
    let bestRank = playerCount;
    let bestRankStage = "";
    let worstRank = 1;
    let worstRankStage = "";
    let biggestClimb: WrappedZoneSummary["biggestClimb"] = null;
    let biggestFall: WrappedZoneSummary["biggestFall"] = null;
    timeline.forEach((point, index) => {
      if (point.rank <= bestRank) {
        // <= so we keep the LATEST best moment (more satisfying to cite).
        bestRank = point.rank;
        bestRankStage = point.label;
      }
      if (point.rank > worstRank) {
        worstRank = point.rank;
        worstRankStage = point.label;
      }
      const previous = timeline[index - 1];
      if (!previous) return;
      const delta = previous.rank - point.rank;
      if (delta > 0 && (!biggestClimb || delta > biggestClimb.places)) {
        biggestClimb = { places: delta, from: previous.rank, to: point.rank, stage: point.label };
      }
      if (delta < 0 && (!biggestFall || -delta > biggestFall.places)) {
        biggestFall = { places: -delta, from: previous.rank, to: point.rank, stage: point.label };
      }
    });
    const dominantZone = (Object.entries(zoneCounts) as Array<[WrappedZone, number]>).sort(
      (a, b) => b[1] - a[1],
    )[0][0];

    // ── Perfect scores ──
    const perfects: WrappedPerfect[] = receipt.lines
      .filter((line) => line.label.startsWith("Exact") && line.fixtureId)
      .map((line) => {
        const result = results.matches[line.fixtureId!];
        const fixture = fixtures.find((item) => item.id === line.fixtureId)!;
        const team1 = result?.team1 ?? fixture.team1;
        const team2 = result?.team2 ?? fixture.team2;
        return {
          fixtureId: fixture.id,
          matchNumber: displayMatchNumber(fixture),
          round: fixture.round,
          team1,
          team2,
          flag1: flagUrlFor(team1),
          flag2: flagUrlFor(team2),
          score: result ? `${result.home}–${result.away}` : "?–?",
          stage: fixture.stage,
        };
      });
    const perfectsRank =
      [...perfectCounts].sort((a, b) => b.count - a.count).findIndex((entry) => entry.id === sub.id) + 1;

    // ── Bold calls: things only this player called across the whole pool ──
    const boldCalls: WrappedBoldCall[] = [];
    const addBoldCall = (fixtureId: number, kind: WrappedBoldCall["kind"]) => {
      if (boldCalls.some((call) => call.fixtureId === fixtureId)) return;
      const result = results.matches[fixtureId];
      const fixture = fixtures.find((item) => item.id === fixtureId);
      if (!result || !fixture) return;
      const pick = sub.picks[fixtureId];
      if (!pick || typeof pick.home !== "number" || typeof pick.away !== "number") return;
      const team1 = result.team1 ?? fixture.team1;
      const team2 = result.team2 ?? fixture.team2;
      boldCalls.push({
        fixtureId,
        matchNumber: displayMatchNumber(fixture),
        round: fixture.round,
        team1,
        team2,
        flag1: flagUrlFor(team1),
        flag2: flagUrlFor(team2),
        predicted: `${pick.home}–${pick.away}`,
        actual: `${result.home}–${result.away}`,
        calledWinner: result.winner ?? (result.home > result.away ? team1 : team2),
        exact: pick.home === result.home && pick.away === result.away,
        kind,
      });
    };
    correctCallersByFixture.forEach((callers, fixtureId) => {
      if (callers.length === 1 && callers[0] === sub.id) addBoldCall(fixtureId, "result");
    });
    exactCallersByFixture.forEach((callers, fixtureId) => {
      if (callers.length === 1 && callers[0] === sub.id) addBoldCall(fixtureId, "exact");
    });
    boldCalls.sort(
      (a, b) =>
        Number(b.kind === "result") - Number(a.kind === "result") ||
        Number(b.exact) - Number(a.exact) ||
        a.matchNumber - b.matchNumber,
    );

    const correctResults = receipt.lines.filter(
      (line) => line.label === "Correct result" || line.label === "Correct knockout winner",
    ).length;

    // ── Rival: most lead changes against me, tie-broken by closeness ──
    let rival: WrappedRival | null = null;
    {
      let best: { sub: Submission; overtakes: number; gap: number } | null = null;
      subs.forEach((other) => {
        if (other.id === sub.id) return;
        let overtakes = 0;
        let previousSign = 0;
        ranksByCheckpoint.forEach((ranks) => {
          const mine = ranks.get(sub.id)!;
          const theirs = ranks.get(other.id)!;
          const sign = Math.sign(mine - theirs);
          if (sign !== 0 && previousSign !== 0 && sign !== previousSign) overtakes += 1;
          if (sign !== 0) previousSign = sign;
        });
        const otherPoints = finalTotals.find((entry) => entry.id === other.id)!.points;
        const gap = Math.abs(totalPoints - otherPoints);
        if (
          !best ||
          overtakes > best.overtakes ||
          (overtakes === best.overtakes && gap < best.gap)
        ) {
          best = { sub: other, overtakes, gap };
        }
      });
      if (best) {
        const chosen = best as { sub: Submission; overtakes: number; gap: number };
        const otherSplit = splitPlayerName(chosen.sub.name);
        const otherPoints = finalTotals.find((entry) => entry.id === chosen.sub.id)!.points;
        rival = {
          name: chosen.sub.name,
          displayName: otherSplit.displayName,
          realName: otherSplit.realName,
          slug: slugifyName(otherSplit.displayName),
          avatar: avatarForName(chosen.sub.name),
          color: fallbackColorForName(chosen.sub.name),
          overtakes: chosen.overtakes,
          currentGapPoints: Math.abs(totalPoints - otherPoints),
          aheadNow: totalPoints >= otherPoints,
          currentRank: finalRanks.get(chosen.sub.id)!,
        };
      }
    }

    // ── Personality ──
    const resolved = resolveFixtures(sub.picks);
    const finalFixture = resolved.find((fixture) => fixture.id === 104);
    const finalPick = sub.picks[104];
    const champion =
      finalFixture && finalPick
        ? winnerFor(finalFixture.resolvedTeam1, finalFixture.resolvedTeam2, finalPick)
        : "";
    const runnerUp =
      finalFixture && champion
        ? champion === finalFixture.resolvedTeam1
          ? finalFixture.resolvedTeam2
          : finalFixture.resolvedTeam1
        : "";
    const avgGoals = stats.picks ? stats.goals / stats.picks : 0;
    const agreementPct = agreementByPlayer.get(sub.id) ?? null;

    const personality: WrappedPersonality = {
      ...derivePersonality({
        avgGoals,
        poolAvgGoals,
        agreementPct,
        poolAvgAgreement,
        draws: stats.draws,
        nilNils: stats.nilNils,
        perfects: receipt.exacts,
        perfectsRank,
        boldCalls: boldCalls.length,
        rank,
        playerCount,
        dominantZone,
      }),
      avgGoals: round1(avgGoals),
      poolAvgGoals: round1(poolAvgGoals),
      agreementPct,
      poolAvgAgreementPct: poolAvgAgreement,
      draws: stats.draws,
      nilNils: stats.nilNils,
      shootouts: stats.shootouts,
      wildestScoreline: stats.wildest,
      biggestMargin: stats.biggestMargin,
      champion: isRealTeam(champion) ? champion : "",
      championFlag: isRealTeam(champion) ? flagUrlFor(champion) : "",
      championAlive: isRealTeam(champion)
        ? !eliminated.has(champion.toLowerCase())
        : false,
      runnerUp: isRealTeam(runnerUp) ? runnerUp : "",
      finalScore:
        finalPick && typeof finalPick.home === "number" && typeof finalPick.away === "number"
          ? `${finalPick.home}–${finalPick.away}`
          : "",
      topScorerPick: sub.bonuses?.topScorer ?? "",
      goldenBallPick: sub.bonuses?.goldenBall ?? "",
    };

    // ── Nation bias ──
    let nationBias: WrappedNationBias | null = null;
    {
      const tally = nationTallies.get(sub.id)!;
      let best: WrappedNationBias | null = null;
      tally.forEach((entry, team) => {
        const pool = poolNationTotals.get(team) ?? { backedWins: 0, goalsAwarded: 0 };
        const poolAvgBackedWins = (pool.backedWins - entry.backedWins) / Math.max(1, subs.length - 1);
        const poolAvgGoalsAwarded =
          (pool.goalsAwarded - entry.goalsAwarded) / Math.max(1, subs.length - 1);
        const biasScore =
          entry.backedWins - poolAvgBackedWins + (entry.goalsAwarded - poolAvgGoalsAwarded) * 0.35;
        const candidate: WrappedNationBias = {
          team,
          flag: flagUrlFor(team),
          backedWins: entry.backedWins,
          poolAvgBackedWins: round1(poolAvgBackedWins),
          goalsAwarded: entry.goalsAwarded,
          poolAvgGoalsAwarded: round1(poolAvgGoalsAwarded),
          biasScore: round1(biasScore),
          alive: !eliminated.has(team.toLowerCase()),
        };
        if (!best || candidate.biasScore > best.biasScore) best = candidate;
      });
      // TS can't see assignments inside the forEach closure; best is not never.
      nationBias = best as WrappedNationBias | null;
    }

    const nextBelow = sortedFinal[rank]; // rank is 1-based, so this is the player below.

    const chapters = deriveChapters(timeline, playerCount);
    const verdict = buildVerdict({
      displayName: split.displayName,
      rank,
      playerCount,
      perfects: receipt.exacts,
      poolMaxPerfects: maxPerfect.count,
      boldCalls: boldCalls.length,
      agreementPct,
      poolAvgAgreement,
      avgGoals,
      poolAvgGoals,
      wildestGoals: stats.wildest
        ? stats.wildest.score.split("–").reduce((sum, part) => sum + Number(part), 0)
        : 0,
      biasScore: nationBias?.biasScore ?? 0,
      biasTeam: nationBias?.team ?? "",
      biasAlive: nationBias?.alive ?? false,
      bestRank,
      worstRank,
      archetype: personality.archetype,
      champion: personality.champion,
      championAlive: personality.championAlive,
      leaderName: splitPlayerName(leader.name).displayName,
      pointsBehindLeader: leader.points - totalPoints,
    });

    return {
      id: sub.id,
      name: sub.name,
      displayName: split.displayName,
      realName: split.realName,
      slug: slugifyName(split.displayName),
      avatar: avatarForName(sub.name),
      color: fallbackColorForName(sub.name),
      playerCount,
      completedMatches,
      totalMatches: fixtures.length,
      updatedAt: results.updatedAt,
      rank,
      totalPoints,
      pointsBehindLeader: leader.points - totalPoints,
      pointsAheadOfNext: nextBelow ? totalPoints - nextBelow.points : null,
      leaderName: splitPlayerName(leader.name).displayName,
      categories: receipt.categories,
      timeline,
      stageShorts: timeline.map((point) => point.short),
      zones: {
        podiumPct: Math.round((zoneCounts.podium / checkpointsCount) * 100),
        midtablePct: Math.round((zoneCounts.midtable / checkpointsCount) * 100),
        relegationPct: Math.round((zoneCounts.relegation / checkpointsCount) * 100),
        dominantZone,
        bestRank,
        bestRankStage,
        worstRank,
        worstRankStage,
        biggestClimb,
        biggestFall,
      },
      perfects,
      perfectsRank,
      poolMaxPerfects: {
        name: maxPerfect.name,
        displayName: maxPerfectSplit.displayName,
        count: maxPerfect.count,
      },
      boldCalls,
      correctResults,
      correctResultsPossible: completedMatches,
      rival,
      twin: twinByPlayer.get(sub.id) ?? null,
      personality,
      nationBias,
      chapters,
      verdict,
      goalsPredicted: stats.goals,
      picksMade: stats.picks,
    };
  });
}

// ── Journey chapters ──
//
// Splits the rank timeline into monotonic runs (with a 1-place flat
// tolerance), keeps the most dramatic ones, and writes tabloid chapter cards
// for each. The story UI turns these into camera moves over the arc chart.

function ordinalWord(value: number) {
  const suffix =
    value % 10 === 1 && value % 100 !== 11
      ? "st"
      : value % 10 === 2 && value % 100 !== 12
        ? "nd"
        : value % 10 === 3 && value % 100 !== 13
          ? "rd"
          : "th";
  return `${value}${suffix}`;
}

export function deriveChapters(
  timeline: WrappedStagePoint[],
  playerCount: number,
): WrappedChapter[] {
  if (timeline.length < 2) return [];

  // 1. Monotonic runs over ranks, treating ±1 wobble as part of the trend.
  type Run = { from: number; to: number; delta: number };
  const runs: Run[] = [];
  let runStart = 0;
  let direction = 0; // -1 = climbing (rank falling), +1 = dropping, 0 = flat
  for (let index = 1; index < timeline.length; index += 1) {
    const step = timeline[index].rank - timeline[index - 1].rank;
    const stepDirection = step > 1 ? 1 : step < -1 ? -1 : Math.sign(step);
    if (direction === 0 && stepDirection !== 0) direction = stepDirection;
    const flipped = stepDirection !== 0 && direction !== 0 && stepDirection !== direction;
    if (flipped) {
      runs.push({
        from: runStart,
        to: index - 1,
        delta: timeline[index - 1].rank - timeline[runStart].rank,
      });
      runStart = index - 1;
      direction = stepDirection;
    }
  }
  runs.push({
    from: runStart,
    to: timeline.length - 1,
    delta: timeline[timeline.length - 1].rank - timeline[runStart].rank,
  });

  // 2. Rank runs by drama (places moved, then length); keep up to 3 interior
  //    ones so the whole sequence stays around 5 chapters.
  const dramatic = [...runs]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.to - b.from - (a.to - a.from))
    .slice(0, 3)
    .sort((a, b) => a.from - b.from);

  const chapters: WrappedChapter[] = [];
  const start = timeline[0];
  chapters.push({
    fromIndex: 0,
    toIndex: Math.min(1, timeline.length - 1),
    title: "THE OPENING BELL",
    caption:
      start.zone === "podium"
        ? `First scores land and you're ${ordinalWord(start.rank)}. Flying start.`
        : start.zone === "relegation"
          ? `First scores land and you're ${ordinalWord(start.rank)}. Oh dear.`
          : `First scores land: ${ordinalWord(start.rank)} of ${playerCount}. Solid.`,
    tone: "start",
    emotion: start.zone === "relegation" ? "despair" : start.zone === "podium" ? "glory" : "neutral",
  });

  for (const run of dramatic) {
    if (run.to <= 1) continue;
    const fromPoint = timeline[run.from];
    const toPoint = timeline[run.to];
    const places = Math.abs(run.delta);
    if (run.delta > 1) {
      const intoRelegation = toPoint.zone === "relegation";
      chapters.push({
        fromIndex: run.from,
        toIndex: run.to,
        title: places >= 5 ? "THE COLLAPSE" : places >= 3 ? "THE SLIDE" : "THE WOBBLE",
        caption: intoRelegation
          ? `${fromPoint.short} to ${toPoint.short}: ${ordinalWord(fromPoint.rank)} becomes ${ordinalWord(toPoint.rank)}. Down among the ants.`
          : `${places} places gone between ${fromPoint.short} and ${toPoint.short}. The room noticed.`,
        tone: "fall",
        emotion: intoRelegation ? "despair" : "grind",
      });
    } else if (run.delta < -1) {
      const toPodium = toPoint.zone === "podium";
      chapters.push({
        fromIndex: run.from,
        toIndex: run.to,
        title:
          toPoint.rank === 1
            ? "THE ASCENSION"
            : places >= 5
              ? "THE RESURRECTION"
              : toPodium
                ? "THE PODIUM RAID"
                : "THE FIGHTBACK",
        caption:
          toPoint.rank === 1
            ? `${ordinalWord(fromPoint.rank)} to TOP OF THE LEAGUE by ${toPoint.short}. Scenes.`
            : `You clawed back ${places} places by ${toPoint.short}. ${ordinalWord(toPoint.rank)} and rising.`,
        tone: "rise",
        emotion: toPodium ? "glory" : "grind",
      });
    } else {
      const zone = toPoint.zone;
      chapters.push({
        fromIndex: run.from,
        toIndex: run.to,
        title:
          zone === "relegation"
            ? "AMONG THE ANTS"
            : zone === "podium"
              ? "CRUISE CONTROL"
              : "THE LONG GRIND",
        caption:
          zone === "relegation"
            ? `${timeline[run.to].short} and still ${ordinalWord(toPoint.rank)}. It takes dedication to live down here.`
            : zone === "podium"
              ? `Holding ${ordinalWord(toPoint.rank)} while the chaos rages below.`
              : `Weeks of honest mid-table graft. Nobody covers it. We just did.`,
        tone: "hold",
        emotion: zone === "relegation" ? "despair" : zone === "podium" ? "glory" : "grind",
      });
    }
  }

  const last = timeline[timeline.length - 1];
  chapters.push({
    fromIndex: Math.max(0, timeline.length - 3),
    toIndex: timeline.length - 1,
    title: "WHERE YOU STAND",
    caption:
      last.rank === 1
        ? `${last.short}: top of the league. Enjoy the voodoo.`
        : last.zone === "podium"
          ? `${last.short}: ${ordinalWord(last.rank)}, on the podium, knives out.`
          : last.zone === "relegation"
            ? `${last.short}: ${ordinalWord(last.rank)}. The wooden spoon is still in play.`
            : `${last.short}: ${ordinalWord(last.rank)} of ${playerCount}. One big round from the podium.`,
    tone: "now",
    emotion: last.zone === "podium" ? "glory" : last.zone === "relegation" ? "despair" : "neutral",
  });

  // Merge overlapping frames so the camera always moves forward.
  const deduped: WrappedChapter[] = [];
  for (const chapter of chapters) {
    const previous = deduped[deduped.length - 1];
    if (previous && chapter.fromIndex <= previous.fromIndex && chapter.toIndex <= previous.toIndex) {
      continue;
    }
    deduped.push(chapter);
  }

  // Avoid two identical chapter titles in a row — reads like a bug even when
  // the captions differ. Swap the repeat for a tone-appropriate alternate.
  const alternates: Record<WrappedChapterTone, string[]> = {
    start: ["THE OPENING BELL"],
    fall: ["THE RELAPSE", "ANOTHER STUMBLE", "THE SECOND SLIDE"],
    rise: ["THE SURGE", "THE SECOND WIND", "BACK ON THE CHARGE"],
    hold: ["STILL THERE", "HOLDING THE LINE", "THE STANDOFF"],
    now: ["WHERE YOU STAND"],
  };
  const usedAlternate: Record<string, number> = {};
  for (let index = 1; index < deduped.length; index += 1) {
    if (deduped[index].title !== deduped[index - 1].title) continue;
    const pool = alternates[deduped[index].tone];
    const used = usedAlternate[deduped[index].tone] ?? 0;
    if (pool && used < pool.length) {
      deduped[index] = { ...deduped[index], title: pool[used] };
      usedAlternate[deduped[index].tone] = used + 1;
    }
  }
  return deduped;
}

// ── Verdict traits ──

function clamp01to100(value: number) {
  return Math.max(2, Math.min(100, Math.round(value)));
}

function buildVerdict(input: {
  displayName: string;
  rank: number;
  playerCount: number;
  perfects: number;
  poolMaxPerfects: number;
  boldCalls: number;
  agreementPct: number | null;
  poolAvgAgreement: number | null;
  avgGoals: number;
  poolAvgGoals: number;
  wildestGoals: number;
  biasScore: number;
  biasTeam: string;
  biasAlive: boolean;
  bestRank: number;
  worstRank: number;
  archetype: string;
  champion: string;
  championAlive: boolean;
  leaderName: string;
  pointsBehindLeader: number;
}): WrappedVerdict {
  const {
    rank,
    playerCount,
    perfects,
    poolMaxPerfects,
    boldCalls,
    agreementPct,
    poolAvgAgreement,
    avgGoals,
    poolAvgGoals,
    wildestGoals,
    biasScore,
    biasTeam,
    biasAlive,
    bestRank,
    worstRank,
    champion,
    championAlive,
    leaderName,
    pointsBehindLeader,
  } = input;

  const contrarianEdge =
    agreementPct !== null && poolAvgAgreement !== null ? poolAvgAgreement - agreementPct : 0;

  const precision = clamp01to100((perfects / Math.max(1, poolMaxPerfects)) * 100);
  const boldness = clamp01to100(30 + boldCalls * 18 + contrarianEdge * 5);
  const chaos = clamp01to100(50 + (avgGoals - poolAvgGoals) * 55 + (wildestGoals - 5) * 6);
  const loyalty = clamp01to100(biasScore * 16);
  const nerve = clamp01to100(((worstRank - rank) / Math.max(1, playerCount - 1)) * 130 + 10);

  const traits: WrappedTrait[] = [
    {
      key: "precision",
      label: "Precision",
      value: precision,
      note:
        perfects >= poolMaxPerfects
          ? "Almanac-grade"
          : perfects > 0
            ? `${perfects} perfect ${perfects === 1 ? "score" : "scores"}`
            : "Vibes only",
    },
    {
      key: "boldness",
      label: "Boldness",
      value: boldness,
      note:
        boldCalls > 0
          ? `${boldCalls} call${boldCalls === 1 ? "" : "s"} nobody else made`
          : contrarianEdge > 0
            ? "Quietly contrarian"
            : "Runs with the herd",
    },
    {
      key: "chaos",
      label: "Chaos",
      value: chaos,
      note:
        avgGoals > poolAvgGoals + 0.2
          ? `${avgGoals} goals a game`
          : avgGoals < poolAvgGoals - 0.2
            ? "Suspiciously sensible"
            : "Controlled explosions",
    },
    {
      key: "loyalty",
      label: "Loyalty",
      value: loyalty,
      note: biasTeam ? (biasAlive ? `${biasTeam} till the end` : `Died with ${biasTeam}`) : "—",
    },
    {
      key: "nerve",
      label: "Nerve",
      value: nerve,
      note:
        worstRank - rank >= 5
          ? `${ordinalWord(worstRank)} → ${ordinalWord(rank)} comeback`
          : worstRank - rank > 0
            ? "Recovered from the dip"
            : "Never needed saving",
    },
  ];

  const arcLine =
    bestRank === 1 && worstRank >= playerCount - 2
      ? `You've seen ${ordinalWord(worstRank)} and you've seen top of the league — the full tabloid arc in one season.`
      : worstRank - bestRank >= 5
        ? `From ${ordinalWord(worstRank)} to ${ordinalWord(bestRank)} at your peak — this season had everything.`
        : `You held your ground from start to finish — rare in this madhouse.`;

  const championLine = champion
    ? championAlive
      ? ` Your champion ${champion} still breathes, so the jury stays out.`
      : ` Your champion ${champion} has gone home, and yet here you are.`
    : "";

  const standingLine =
    rank === 1
      ? " Verdict: guilty of being top, and the appeals are pouring in."
      : rank <= 3
        ? ` Verdict: ${pointsBehindLeader} points off ${leaderName}, close enough to smell the trophy.`
        : rank > playerCount - 3
          ? " Verdict: bottom-zone certified — but the wooden spoon takes dedication too."
          : " Verdict: mid-table, dangerous, and one big matchday from the podium.";

  return { traits, text: `${arcLine}${championLine}${standingLine}` };
}

// ── Personality archetypes ──
//
// A decision tree over real metrics. Names in tabloid voice; every archetype
// must be earnable and mutually exclusive enough to feel bespoke.

function derivePersonality(input: {
  avgGoals: number;
  poolAvgGoals: number;
  agreementPct: number | null;
  poolAvgAgreement: number | null;
  draws: number;
  nilNils: number;
  perfects: number;
  perfectsRank: number;
  boldCalls: number;
  rank: number;
  playerCount: number;
  dominantZone: WrappedZone;
}): { archetype: string; tagline: string } {
  const {
    avgGoals,
    poolAvgGoals,
    agreementPct,
    poolAvgAgreement,
    draws,
    nilNils,
    perfects,
    perfectsRank,
    boldCalls,
    rank,
    dominantZone,
  } = input;

  const contrarian =
    agreementPct !== null && poolAvgAgreement !== null && agreementPct <= poolAvgAgreement - 6;
  const herd =
    agreementPct !== null && poolAvgAgreement !== null && agreementPct >= poolAvgAgreement + 6;
  const goalHappy = avgGoals >= poolAvgGoals + 0.3;
  const cagey = avgGoals <= poolAvgGoals - 0.3;

  if (perfectsRank === 1 && perfects >= 4) {
    return {
      archetype: "THE ALMANAC",
      tagline: "Suspiciously exact. The group demands to see the sports almanac.",
    };
  }
  if (boldCalls >= 3 && contrarian) {
    return {
      archetype: "THE LONE WOLF",
      tagline: "Ignores the room, calls what nobody else dares. Occasionally right, loudly.",
    };
  }
  if (contrarian && dominantZone === "relegation") {
    return {
      archetype: "THE MARTYR",
      tagline: "Principled, contrarian, and paying dearly for it at the bottom of the table.",
    };
  }
  if (goalHappy && draws <= 6) {
    return {
      archetype: "THE ENTERTAINER",
      tagline: "Never met a scoreline that couldn't use another goal. Defence is a rumour.",
    };
  }
  if (cagey && nilNils >= 3) {
    return {
      archetype: "THE ACCOUNTANT",
      tagline: "1–0. 0–0. 1–1. Football is a spreadsheet and every goal must be justified.",
    };
  }
  if (cagey) {
    return {
      archetype: "THE PRAGMATIST",
      tagline: "Low scores, low drama, no romance. They always win 1–0, remember?",
    };
  }
  if (herd && rank <= 3) {
    return {
      archetype: "THE ESTABLISHMENT",
      tagline: "Agrees with the room and beats it anyway. The system works for them.",
    };
  }
  if (herd) {
    return {
      archetype: "THE POLLSTER",
      tagline: "Reads the room, follows the crowd, blames the crowd when it goes wrong.",
    };
  }
  if (rank <= 3) {
    return {
      archetype: "THE VISIONARY",
      tagline: "Sees things others don't. Or so they keep telling the group chat.",
    };
  }
  if (dominantZone === "relegation") {
    return {
      archetype: "THE UNDERDOG",
      tagline: "Bottom of the table and calling it a long-term strategy.",
    };
  }
  return {
    archetype: "THE DARK HORSE",
    tagline: "Quietly mid-table, one big matchday away from chaos at the top.",
  };
}
