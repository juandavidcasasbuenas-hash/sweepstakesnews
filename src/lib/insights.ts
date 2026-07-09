import { canonicalizePlayerNames, normalizePlayerName } from "@/lib/player-names";
import { groupFixtures, resolveFixtures } from "@/lib/tournament";
import type { MatchPick, ResolvedFixture, Submission } from "@/types/game";

const FINAL_FIXTURE_ID = 104;
const SEMI_FIXTURE_IDS = [101, 102];

type NumericPick = { home: number; away: number; winner?: string };

function numericPick(pick?: MatchPick): NumericPick | null {
  if (!pick || typeof pick.home !== "number" || typeof pick.away !== "number") return null;
  return { home: pick.home, away: pick.away, winner: pick.winner };
}

function pickedWinner(fixture: ResolvedFixture, pick: NumericPick) {
  if (pick.home > pick.away) return fixture.resolvedTeam1;
  if (pick.away > pick.home) return fixture.resolvedTeam2;
  return pick.winner || fixture.resolvedTeam1;
}

function isRealTeam(token: string) {
  return !/^([WL]\d+|[12][A-L]|3[A-L/ ]+)$/.test(token.replace(/\s/g, ""));
}

export type PickHighlight = {
  margin: number;
  goals: number;
  score: string;
  team1: string;
  team2: string;
  round: string;
};

export type EntryInsight = {
  id: string;
  name: string;
  champion: string;
  runnerUp: string;
  finalScore: string;
  totalGoals: number;
  pickCount: number;
  avgGoals: number;
  groupDraws: number;
  nilNils: number;
  shootouts: number;
  biggestMargin: PickHighlight | null;
  wildestScoreline: PickHighlight | null;
  agreement: number | null;
};

export type TeamCount = { team: string; count: number; backers: string[] };
export type ScorelineCount = { score: string; count: number };
export type LabelCount = { label: string; count: number; backers: string[] };

export type MatchSplit = {
  fixtureId: number;
  round: string;
  group: string | null;
  team1: string;
  team2: string;
  homeWins: number;
  draws: number;
  awayWins: number;
  total: number;
  topShare: number;
  commonScore: string | null;
  commonScoreCount: number;
};

export type PairSimilarity = {
  nameA: string;
  nameB: string;
  matching: number;
  compared: number;
  pct: number;
};

export type PoolInsights = {
  entries: EntryInsight[];
  entryCount: number;
  totalGoals: number;
  totalPicks: number;
  avgGoalsPerMatch: number;
  totalShootouts: number;
  totalGroupDraws: number;
  champions: TeamCount[];
  darkHorses: TeamCount[];
  finalists: TeamCount[];
  semiFinalists: TeamCount[];
  topScorelines: ScorelineCount[];
  mostAgreedMatch: MatchSplit | null;
  mostDivisiveMatch: MatchSplit | null;
  twins: PairSimilarity | null;
  opposites: PairSimilarity | null;
  bonusTopScorers: LabelCount[];
  bonusGoldenBalls: LabelCount[];
  bonusMostGoalsTeams: LabelCount[];
};

function buildEntryInsight(submission: Submission, resolved: ResolvedFixture[]): EntryInsight {
  let totalGoals = 0;
  let pickCount = 0;
  let groupDraws = 0;
  let nilNils = 0;
  let shootouts = 0;
  let biggestMargin: PickHighlight | null = null;
  let wildestScoreline: PickHighlight | null = null;

  for (const fixture of resolved) {
    const pick = numericPick(submission.picks[fixture.id]);
    if (!pick) continue;
    pickCount += 1;
    const goals = pick.home + pick.away;
    const margin = Math.abs(pick.home - pick.away);
    totalGoals += goals;
    if (pick.home === pick.away) {
      if (fixture.stage === "group") groupDraws += 1;
      else shootouts += 1;
      if (pick.home === 0) nilNils += 1;
    }
    const highlight: PickHighlight = {
      margin,
      goals,
      score: `${pick.home}–${pick.away}`,
      team1: fixture.resolvedTeam1,
      team2: fixture.resolvedTeam2,
      round: fixture.round,
    };
    if (!biggestMargin || margin > biggestMargin.margin) biggestMargin = highlight;
    if (!wildestScoreline || goals > wildestScoreline.goals) wildestScoreline = highlight;
  }

  const finalFixture = resolved.find((fixture) => fixture.id === FINAL_FIXTURE_ID);
  const finalPick = numericPick(submission.picks[FINAL_FIXTURE_ID]);
  const champion = finalFixture && finalPick ? pickedWinner(finalFixture, finalPick) : "";
  const runnerUp =
    finalFixture && champion
      ? champion === finalFixture.resolvedTeam1
        ? finalFixture.resolvedTeam2
        : finalFixture.resolvedTeam1
      : "";

  return {
    id: submission.id,
    name: submission.name,
    champion: isRealTeam(champion) ? champion : "",
    runnerUp: isRealTeam(runnerUp) ? runnerUp : "",
    finalScore: finalPick ? `${finalPick.home}–${finalPick.away}` : "?–?",
    totalGoals,
    pickCount,
    avgGoals: pickCount ? totalGoals / pickCount : 0,
    groupDraws,
    nilNils,
    shootouts,
    biggestMargin,
    wildestScoreline,
    agreement: null,
  };
}

function tallyTeams(picks: Array<{ team: string; backer: string }>): TeamCount[] {
  const counts = new Map<string, TeamCount>();
  for (const { team, backer } of picks) {
    if (!team || !isRealTeam(team)) continue;
    const entry = counts.get(team) ?? { team, count: 0, backers: [] };
    entry.count += 1;
    entry.backers.push(backer);
    counts.set(team, entry);
  }
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.team.localeCompare(b.team),
  );
}

function tallyLabels(picks: Array<{ label: string; backer: string }>): LabelCount[] {
  const counts = new Map<string, LabelCount>();
  for (const { label, backer } of picks) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const entry = counts.get(key) ?? { label: trimmed, count: 0, backers: [] };
    entry.count += 1;
    entry.backers.push(backer);
    counts.set(key, entry);
  }
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

export function buildPoolInsights(
  submissions: Submission[],
  playerNames: string[] = [],
): PoolInsights {
  const subs = [...submissions].sort((a, b) => a.name.localeCompare(b.name));
  const bonusPlayerNames = subs.flatMap((sub) => [
    sub.bonuses?.topScorer ?? "",
    sub.bonuses?.goldenBall ?? "",
  ]);
  const bonusPlayerAliases = canonicalizePlayerNames(bonusPlayerNames, playerNames);
  const canonicalBonusPlayerName = (name: string) =>
    bonusPlayerAliases.get(normalizePlayerName(name)) ?? name.trim();
  const resolvedById = new Map(subs.map((sub) => [sub.id, resolveFixtures(sub.picks)]));
  const entries = subs.map((sub) => buildEntryInsight(sub, resolvedById.get(sub.id)!));

  const totalGoals = entries.reduce((sum, entry) => sum + entry.totalGoals, 0);
  const totalPicks = entries.reduce((sum, entry) => sum + entry.pickCount, 0);
  const totalShootouts = entries.reduce((sum, entry) => sum + entry.shootouts, 0);
  const totalGroupDraws = entries.reduce((sum, entry) => sum + entry.groupDraws, 0);

  const champions = tallyTeams(
    entries.map((entry) => ({ team: entry.champion, backer: entry.name })),
  );
  const darkHorses = champions.filter((item) => item.count === 1);

  const finalists = tallyTeams(
    subs.flatMap((sub) => {
      const finalFixture = resolvedById.get(sub.id)!.find((f) => f.id === FINAL_FIXTURE_ID);
      if (!finalFixture) return [];
      return [
        { team: finalFixture.resolvedTeam1, backer: sub.name },
        { team: finalFixture.resolvedTeam2, backer: sub.name },
      ];
    }),
  );

  const semiFinalists = tallyTeams(
    subs.flatMap((sub) =>
      resolvedById
        .get(sub.id)!
        .filter((fixture) => SEMI_FIXTURE_IDS.includes(fixture.id))
        .flatMap((fixture) => [
          { team: fixture.resolvedTeam1, backer: sub.name },
          { team: fixture.resolvedTeam2, backer: sub.name },
        ]),
    ),
  );

  const scorelineCounts = new Map<string, number>();
  for (const sub of subs) {
    for (const pick of Object.values(sub.picks)) {
      const numeric = numericPick(pick);
      if (!numeric) continue;
      const key = `${numeric.home}–${numeric.away}`;
      scorelineCounts.set(key, (scorelineCounts.get(key) ?? 0) + 1);
    }
  }
  const topScorelines = Array.from(scorelineCounts.entries())
    .map(([score, count]) => ({ score, count }))
    .sort((a, b) => b.count - a.count || a.score.localeCompare(b.score))
    .slice(0, 6);

  const splits: MatchSplit[] = [];
  const agreementSums = new Map<string, { same: number; others: number }>();
  for (const fixture of groupFixtures()) {
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    const fixtureScores = new Map<string, number>();
    const outcomes: Array<{ id: string; outcome: "home" | "draw" | "away" }> = [];
    for (const sub of subs) {
      const pick = numericPick(sub.picks[fixture.id]);
      if (!pick) continue;
      const outcome = pick.home > pick.away ? "home" : pick.away > pick.home ? "away" : "draw";
      if (outcome === "home") homeWins += 1;
      else if (outcome === "away") awayWins += 1;
      else draws += 1;
      outcomes.push({ id: sub.id, outcome });
      const key = `${pick.home}–${pick.away}`;
      fixtureScores.set(key, (fixtureScores.get(key) ?? 0) + 1);
    }
    const total = homeWins + draws + awayWins;
    if (total === 0) continue;
    const sortedScores = Array.from(fixtureScores.entries()).sort((a, b) => b[1] - a[1]);
    splits.push({
      fixtureId: fixture.id,
      round: fixture.round,
      group: fixture.group,
      team1: fixture.team1,
      team2: fixture.team2,
      homeWins,
      draws,
      awayWins,
      total,
      topShare: Math.max(homeWins, draws, awayWins) / total,
      commonScore: sortedScores[0]?.[0] ?? null,
      commonScoreCount: sortedScores[0]?.[1] ?? 0,
    });
    if (total >= 2) {
      const countFor = { home: homeWins, draw: draws, away: awayWins };
      for (const { id, outcome } of outcomes) {
        const sums = agreementSums.get(id) ?? { same: 0, others: 0 };
        sums.same += countFor[outcome] - 1;
        sums.others += total - 1;
        agreementSums.set(id, sums);
      }
    }
  }

  for (const entry of entries) {
    const sums = agreementSums.get(entry.id);
    entry.agreement = sums && sums.others > 0 ? sums.same / sums.others : null;
  }

  const contested = splits.filter((split) => split.total >= 2);
  const mostAgreedMatch = contested.length
    ? [...contested].sort(
        (a, b) => b.topShare - a.topShare || b.commonScoreCount - a.commonScoreCount,
      )[0]
    : null;
  const mostDivisiveMatch = contested.length
    ? [...contested].sort(
        (a, b) =>
          a.topShare - b.topShare ||
          Number(b.draws > 0) - Number(a.draws > 0) ||
          a.fixtureId - b.fixtureId,
      )[0]
    : null;

  let twins: PairSimilarity | null = null;
  let opposites: PairSimilarity | null = null;
  for (let i = 0; i < subs.length; i += 1) {
    for (let j = i + 1; j < subs.length; j += 1) {
      let matching = 0;
      let compared = 0;
      for (const pick of Object.values(subs[i].picks)) {
        const a = numericPick(pick);
        const b = numericPick(subs[j].picks[pick.fixtureId]);
        if (!a || !b) continue;
        compared += 1;
        if (a.home === b.home && a.away === b.away) matching += 1;
      }
      if (compared < 10) continue;
      const pair: PairSimilarity = {
        nameA: subs[i].name,
        nameB: subs[j].name,
        matching,
        compared,
        pct: matching / compared,
      };
      if (!twins || pair.pct > twins.pct) twins = pair;
      if (!opposites || pair.pct < opposites.pct) opposites = pair;
    }
  }

  return {
    entries,
    entryCount: entries.length,
    totalGoals,
    totalPicks,
    avgGoalsPerMatch: totalPicks ? totalGoals / totalPicks : 0,
    totalShootouts,
    totalGroupDraws,
    champions,
    darkHorses,
    finalists,
    semiFinalists,
    topScorelines,
    mostAgreedMatch,
    mostDivisiveMatch,
    twins,
    opposites,
    bonusTopScorers: tallyLabels(
      subs.map((sub) => ({
        label: canonicalBonusPlayerName(sub.bonuses?.topScorer ?? ""),
        backer: sub.name,
      })),
    ),
    bonusGoldenBalls: tallyLabels(
      subs.map((sub) => ({
        label: canonicalBonusPlayerName(sub.bonuses?.goldenBall ?? ""),
        backer: sub.name,
      })),
    ),
    bonusMostGoalsTeams: tallyLabels(
      subs.map((sub) => ({ label: sub.bonuses?.mostGoalsTeam ?? "", backer: sub.name })),
    ),
  };
}

export function leaders<T extends EntryInsight>(
  entries: T[],
  value: (entry: T) => number | null,
  direction: "max" | "min" = "max",
): { entries: T[]; value: number } | null {
  const scored = entries
    .map((entry) => ({ entry, score: value(entry) }))
    .filter((item): item is { entry: T; score: number } => item.score !== null);
  if (!scored.length) return null;
  const best =
    direction === "max"
      ? Math.max(...scored.map((item) => item.score))
      : Math.min(...scored.map((item) => item.score));
  return {
    entries: scored.filter((item) => item.score === best).map((item) => item.entry),
    value: best,
  };
}
