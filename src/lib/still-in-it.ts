// "Am I still in it?" scenario engine.
//
// The question is NOT "does my ceiling beat the leader's current score" —
// every player is scored against the SAME real-world results, so the only
// honest answer comes from searching joint outcomes: is there at least one
// way the remaining tournament can unfold in which I finish top of the pool?
//
// The search space is every winner assignment over the remaining bracket
// (with knockout propagation into the semis/final/third-place match),
// crossed with candidate scorelines per match (every player's exact pick
// plus an adversarial score that lands on nobody's coupon, deduplicated by
// their per-player points signature), plus bonus-award outcomes filtered by
// what is still mathematically possible. Every scenario is scored for every
// player at once, so a player's "best case" already accounts for the points
// the same results hand to their rivals.

import { fixtures } from "@/data/fixtures";
import {
  canonicalizePlayerNames,
  normalizePlayerName,
} from "@/lib/player-names";
import { canonicalTeamName } from "@/lib/team-flags";
import {
  resolveFixtures,
  scoreSubmission,
  scoringRules,
  winnerFor,
} from "@/lib/tournament";
import type {
  Fixture,
  MatchPick,
  ResultMatch,
  Stage,
  Submission,
  TournamentResults,
} from "@/types/game";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ScenarioMatchEvent = {
  fixtureId: number;
  stage: Stage;
  round: string;
  date: string;
  team1: string;
  team2: string;
  home: number;
  away: number;
  /** Winner display name (decides pens when home === away). */
  winner: string;
  penalties: boolean;
  /** Points the focus player banks at this match, itemised. */
  gains: { label: string; points: number }[];
  points: number;
};

export type ScenarioBonusEvent = {
  category: "topScorer" | "goldenBall" | "mostGoalsTeam";
  /** The awarded value in this scenario ("" = award lands on nobody's pick). */
  value: string;
  /** Points for the focus player. */
  points: number;
  /** Other players whose identical pick also lands. */
  sharers: string[];
};

export type ScenarioTableRow = {
  submissionId: string;
  name: string;
  total: number;
  position: number;
};

export type Scenario = {
  /** Focus player's final pool position (1 = champion of the pool). */
  position: number;
  /** Focus player's total in this scenario. */
  total: number;
  /** Margin vs the best rival (positive = outright top). */
  margin: number;
  matches: ScenarioMatchEvent[];
  bonuses: ScenarioBonusEvent[];
  table: ScenarioTableRow[];
};

export type MatchRequirement = {
  fixtureId: number;
  round: string;
  date: string;
  team1: string;
  team2: string;
  /** "must" = every winning future needs this winner; "either" = both work. */
  kind: "must" | "either";
  winner?: string;
};

export type PlayerVerdict = {
  submissionId: string;
  name: string;
  current: number;
  currentPosition: number;
  canWin: boolean;
  /** True when the best case is outright first (no tie at the top). */
  canWinOutright: boolean;
  bestPosition: number;
  worstPosition: number;
  winningBrackets: number;
  requirements: MatchRequirement[];
  /** Bonus bets that are already mathematically dead. */
  deadBonuses: { category: ScenarioBonusEvent["category"]; value: string; reason: string }[];
  dream: Scenario;
  nightmare: Scenario;
};

export type StillInItReport =
  | {
      mode: "ready";
      players: PlayerVerdict[];
      totalBrackets: number;
      scenariosEvaluated: number;
      /**
       * Total futures covered: every scoreline combination inside the search
       * bound, before equivalent point-signatures are merged. Each evaluated
       * scenario stands for many futures that score identically.
       */
      futuresCovered: number;
      /** True if the signature space had to be pruned to stay within budget. */
      pruned: boolean;
      remainingMatches: { fixtureId: number; round: string; date: string }[];
    }
  | { mode: "not-ready"; reason: string };

export type CrunchProgress = {
  scenariosEvaluated: number;
  bracketsDone: number;
  totalBrackets: number;
};

export type CrunchOptions = {
  onProgress?: (progress: CrunchProgress) => void;
  /** Yield to the event loop after this many scenarios (0 = never). */
  yieldEvery?: number;
  /**
   * Provider-announced pairings for unplayed matches, fixtureId -> [home, away]
   * (null = slot not announced yet). Announced names may supply the provider's
   * preferred spelling, but they cannot override the official fixture feeds.
   * Some providers populate future rounds speculatively and can put a known
   * team on the wrong side of the draw.
   */
  pinnedSlots?: Record<number, [string | null, string | null]>;
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const BONUS_CATEGORIES = [
  { category: "topScorer" as const, points: scoringRules.topScorer },
  { category: "goldenBall" as const, points: scoringRules.goldenBall },
  { category: "mostGoalsTeam" as const, points: scoringRules.mostGoalsTeam },
];

function key(team: string | undefined) {
  if (!team) return "";
  return (canonicalTeamName(team) ?? team.trim()).toLowerCase();
}

function scoreComplete(result?: Pick<ResultMatch, "home" | "away">) {
  return typeof result?.home === "number" && typeof result.away === "number";
}

function isSettled(result?: ResultMatch) {
  if (!scoreComplete(result)) return false;
  // Older manually-entered results carry no status; live/scheduled provider
  // rows must stay open — a match in play can still swing any way.
  return result!.status === undefined || result!.status === "completed";
}

function isPlaceholder(team: string) {
  return !team || /^([WL]\d+|[123][A-L/]+)$/i.test(team.replace(/\s/g, ""));
}

type Slot =
  | { kind: "team"; team: string }
  | { kind: "winner" | "loser"; of: number };

type RemainingMatch = {
  fixture: Fixture;
  slots: [Slot, Slot];
};

type PlayerModel = {
  submissionId: string;
  name: string;
  base: number;
  /** Per remaining fixture: the player's resolved predicted pairing + pick. */
  predictions: Map<
    number,
    {
      pair: [string, string];
      home: number;
      away: number;
      winner: string;
      display: [string, string];
    }
  >;
  predSemi: Set<string>;
  predFinal: Set<string>;
  predChampion: string;
  predRunnerUp: string;
  predThird: string;
  predFourth: string;
  bonusPicks: Record<ScenarioBonusEvent["category"], string>;
};

type Candidate = {
  home: number;
  away: number;
  /** goals/gd/exact deltas per player index (winner points handled separately). */
  deltas: Int32Array;
};

function stageSetFromResolved(
  resolved: ReturnType<typeof resolveFixtures>,
  stage: Stage,
) {
  const set = new Set<string>();
  for (const fixture of resolved) {
    if (fixture.stage !== stage) continue;
    for (const team of [fixture.resolvedTeam1, fixture.resolvedTeam2]) {
      if (!isPlaceholder(team)) set.add(key(team));
    }
  }
  return set;
}

function pickNumbers(pick?: MatchPick) {
  if (!pick || typeof pick.home !== "number" || typeof pick.away !== "number") return null;
  return { home: pick.home, away: pick.away };
}

// Every scoreline's points impact is fully described by which players' picked
// home goals / away goals / goal difference / exact score it hits. Scorelines
// up to `bound` (max picked goals + max |gd| + 3) realise every achievable
// signature: any larger score maps onto an equivalent one inside the bound.

function teamGoalsFromResults(matches: Record<number, ResultMatch>) {
  const goals = new Map<string, number>();
  for (const fixture of fixtures) {
    const result = matches[fixture.id];
    if (!isSettled(result)) continue;
    const team1 = key(result!.team1 ?? fixture.team1);
    const team2 = key(result!.team2 ?? fixture.team2);
    if (team1) goals.set(team1, (goals.get(team1) ?? 0) + result!.home);
    if (team2) goals.set(team2, (goals.get(team2) ?? 0) + result!.away);
  }
  return goals;
}

// ---------------------------------------------------------------------------
// The crunch
// ---------------------------------------------------------------------------

export async function crunchStillInIt(
  submissions: Submission[],
  results: TournamentResults,
  options: CrunchOptions = {},
): Promise<StillInItReport> {
  if (!submissions.length) {
    return { mode: "not-ready", reason: "No entries yet — the presses are idle." };
  }

  const settledMatches: Record<number, ResultMatch> = {};
  for (const [id, result] of Object.entries(results.matches ?? {})) {
    if (isSettled(result)) settledMatches[Number(id)] = result;
  }
  const settled: TournamentResults = { ...results, matches: settledMatches };

  const groupIncomplete = fixtures.some(
    (fixture) => fixture.stage === "group" && !scoreComplete(settledMatches[fixture.id]),
  );
  if (groupIncomplete) {
    return {
      mode: "not-ready",
      reason:
        "The group stage is still being played — there are too many futures to count just yet. Come back when the knockout bracket is set.",
    };
  }

  const actualResolved = resolveFixtures(settledMatches);
  const resolvedById = new Map(actualResolved.map((fixture) => [fixture.id, fixture]));

  // Settled winner/loser display names, for tracing announced teams to feeds.
  function settledOutcome(fixtureId: number) {
    const result = settledMatches[fixtureId];
    const resolved = resolvedById.get(fixtureId);
    if (!result || !resolved) return null;
    const team1 = result.team1 ?? resolved.resolvedTeam1;
    const team2 = result.team2 ?? resolved.resolvedTeam2;
    const winner =
      result.winner ??
      (result.home > result.away ? team1 : result.away > result.home ? team2 : undefined);
    if (!winner) return null;
    const loser = key(winner) === key(team1) ? team2 : team1;
    return { winner, loser };
  }

  const remainingFixtures = fixtures.filter(
    (fixture) => fixture.stage !== "group" && !isSettled(results.matches?.[fixture.id]),
  );
  const remainingIds = new Set(remainingFixtures.map((fixture) => fixture.id));

  type Feed = { kind: "winner" | "loser"; of: number };
  function tokenFeed(token: string): Feed | null {
    const clean = token.replace(/\s/g, "");
    const winner = clean.match(/^W(\d+)$/i);
    if (winner) return { kind: "winner", of: Number(winner[1]) };
    const loser = clean.match(/^L(\d+)$/i);
    if (loser) return { kind: "loser", of: Number(loser[1]) };
    return null;
  }

  function feedTeam(feed: Feed): string | null {
    const outcome = settledOutcome(feed.of);
    if (!outcome) return null;
    return feed.kind === "winner" ? outcome.winner : outcome.loser;
  }

  // Preserve the official bracket topology. Provider-announced names are only
  // accepted when they agree with the team produced by this exact fixture
  // feed; partial/speculative future-round rows must never move a team to the
  // other side of the draw.
  const pinned = options.pinnedSlots ?? {};
  const slotsByFixture = new Map<number, [Slot, Slot]>();
  for (const fixture of remainingFixtures) {
    const resolved = resolvedById.get(fixture.id)!;
    const slots = ([fixture.team1, fixture.team2] as const).map((token, index): Slot => {
      const announced = pinned[fixture.id]?.[index];
      const feed = tokenFeed(token);
      if (feed) {
        const produced = feedTeam(feed);
        if (produced !== null && !remainingIds.has(feed.of)) {
          return {
            kind: "team",
            team: announced && key(announced) === key(produced) ? announced : produced,
          };
        }
        return { kind: feed.kind, of: feed.of };
      }

      const team = index === 0 ? resolved.resolvedTeam1 : resolved.resolvedTeam2;
      return {
        kind: "team",
        team: announced && key(announced) === key(team) ? announced : team,
      };
    }) as [Slot, Slot];
    slotsByFixture.set(fixture.id, slots);
  }

  const remaining: RemainingMatch[] = remainingFixtures.map((fixture) => ({
    fixture,
    slots: slotsByFixture.get(fixture.id)!,
  }));

  if (!remaining.length) {
    return {
      mode: "not-ready",
      reason: "The tournament is over — the leaderboard is no longer a question, it's a fact.",
    };
  }
  for (const match of remaining) {
    for (const slot of match.slots) {
      if (slot.kind !== "team" && !remainingIds.has(slot.of)) {
        return {
          mode: "not-ready",
          reason: "Waiting on earlier results to settle before the bracket maths can run.",
        };
      }
    }
  }

  // ---- Player models -------------------------------------------------------
  const players: PlayerModel[] = submissions.map((submission) => {
    const predictedResolved = resolveFixtures(submission.picks);
    const predictions: PlayerModel["predictions"] = new Map();
    for (const match of remaining) {
      const predicted = predictedResolved.find((item) => item.id === match.fixture.id);
      const numbers = pickNumbers(submission.picks[match.fixture.id]);
      if (!predicted || !numbers) continue;
      if (isPlaceholder(predicted.resolvedTeam1) || isPlaceholder(predicted.resolvedTeam2)) continue;
      predictions.set(match.fixture.id, {
        pair: [key(predicted.resolvedTeam1), key(predicted.resolvedTeam2)],
        home: numbers.home,
        away: numbers.away,
        winner: key(
          winnerFor(predicted.resolvedTeam1, predicted.resolvedTeam2, submission.picks[match.fixture.id]),
        ),
        display: [predicted.resolvedTeam1, predicted.resolvedTeam2],
      });
    }

    const predFinalFixture = predictedResolved.find((item) => item.id === 104);
    const finalPick = submission.picks[104];
    const predChampionName =
      predFinalFixture && !isPlaceholder(predFinalFixture.resolvedTeam1)
        ? winnerFor(predFinalFixture.resolvedTeam1, predFinalFixture.resolvedTeam2, finalPick)
        : "";
    const predThirdFixture = predictedResolved.find((item) => item.id === 103);
    const thirdPick = submission.picks[103];
    const predThirdName =
      predThirdFixture && !isPlaceholder(predThirdFixture.resolvedTeam1)
        ? winnerFor(predThirdFixture.resolvedTeam1, predThirdFixture.resolvedTeam2, thirdPick)
        : "";

    return {
      submissionId: submission.id,
      name: submission.name,
      base: scoreSubmission(submission, settled).total,
      predictions,
      predSemi: stageSetFromResolved(predictedResolved, "semi"),
      predFinal: stageSetFromResolved(predictedResolved, "final"),
      predChampion: key(predChampionName),
      predRunnerUp: key(
        predChampionName && predFinalFixture
          ? predChampionName === predFinalFixture.resolvedTeam1
            ? predFinalFixture.resolvedTeam2
            : predFinalFixture.resolvedTeam1
          : "",
      ),
      predThird: key(predThirdName),
      predFourth: key(
        predThirdName && predThirdFixture
          ? predThirdName === predThirdFixture.resolvedTeam1
            ? predThirdFixture.resolvedTeam2
            : predThirdFixture.resolvedTeam1
          : "",
      ),
      bonusPicks: {
        topScorer: submission.bonuses.topScorer.trim(),
        goldenBall: submission.bonuses.goldenBall.trim(),
        mostGoalsTeam: submission.bonuses.mostGoalsTeam.trim(),
      },
    };
  });

  const playerCount = players.length;
  const baseline = {
    semi: stageSetFromResolved(actualResolved, "semi"),
    final: stageSetFromResolved(actualResolved, "final"),
  };

  // ---- Alive teams + bonus feasibility -------------------------------------
  const aliveTeams = new Set<string>();
  for (const match of remaining) {
    for (const slot of match.slots) {
      if (slot.kind === "team") aliveTeams.add(key(slot.team));
    }
  }

  const teamGoals = teamGoalsFromResults(settledMatches);
  const maxTeamGoals = Math.max(0, ...teamGoals.values());
  const scorers = results.playerStats?.scorers ?? [];
  const maxScorerGoals = Math.max(0, ...scorers.map((row) => row.goals));

  // Bonus picks are typed by hand, so "Haaland" and the feed's "Erling
  // Haaland" are the same person. Resolve every player-name pick and stat row
  // to a shared canonical key before asking whether a bet can still land or
  // whether two entries actually back the same pick.
  const statNames = [...scorers, ...(results.playerStats?.assists ?? [])].map(
    (row) => row.player,
  );
  const playerNameAliases = canonicalizePlayerNames(
    players
      .flatMap((player) => [player.bonusPicks.topScorer, player.bonusPicks.goldenBall])
      .filter(Boolean),
    statNames,
  );
  function personKey(value: string) {
    const normalized = normalizePlayerName(value);
    if (!normalized) return "";
    return normalizePlayerName(playerNameAliases.get(normalized) ?? value);
  }
  const scorerRowByPerson = new Map<string, (typeof scorers)[number]>();
  for (const row of scorers) {
    const rowKey = personKey(row.player);
    const existing = scorerRowByPerson.get(rowKey);
    if (!existing || row.goals > existing.goals) scorerRowByPerson.set(rowKey, row);
  }

  function bonusPickKey(category: ScenarioBonusEvent["category"], value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (category === "mostGoalsTeam") return key(trimmed);
    return personKey(trimmed);
  }

  function bonusStillPossible(category: ScenarioBonusEvent["category"], value: string) {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (category === "goldenBall") return true; // jury award — never dead
    if (category === "mostGoalsTeam") {
      const teamKey = key(trimmed);
      if (aliveTeams.has(teamKey)) return true;
      return (teamGoals.get(teamKey) ?? 0) >= maxTeamGoals;
    }
    // topScorer: dead only when we know the player's team is out AND they
    // already trail the golden-boot leader. Without stats data, stay lenient.
    if (!scorers.length) return true;
    const row = scorerRowByPerson.get(personKey(trimmed));
    if (!row) return true; // unknown player — cannot rule out
    const rowTeam = row.team ? key(row.team) : "";
    if (!rowTeam || aliveTeams.has(rowTeam)) return true;
    return row.goals >= maxScorerGoals;
  }

  // A bonus category still in play is one the admin has not settled yet.
  const openBonusCategories = BONUS_CATEGORIES.filter(
    ({ category }) => !settled.bonuses?.[category]?.trim(),
  );

  // Best case for X: every still-possible bonus bet of X lands (weakly
  // dominant — it never helps a rival more than X). Worst case: each award
  // goes to the still-possible rival pick shared by the most rivals.
  const bonusBestVec = players.map(() => new Int32Array(playerCount));
  const bonusWorstVec = players.map(() => new Int32Array(playerCount));
  const bonusBestEvents: ScenarioBonusEvent[][] = players.map(() => []);
  const bonusWorstEvents: ScenarioBonusEvent[][] = players.map(() => []);
  const deadBonuses: PlayerVerdict["deadBonuses"][] = players.map(() => []);

  for (const { category, points } of BONUS_CATEGORIES) {
    const open = openBonusCategories.some((item) => item.category === category);
    players.forEach((player, x) => {
      const ownPick = player.bonusPicks[category];
      const ownPossible = open && bonusStillPossible(category, ownPick);
      if (open && ownPick && !ownPossible) {
        deadBonuses[x].push({
          category,
          value: ownPick,
          reason:
            category === "mostGoalsTeam"
              ? `${ownPick} are out and already trail the goal charts.`
              : `${ownPick} can no longer top the charts.`,
        });
      }
      if (!open) return;

      const ownKey = bonusPickKey(category, ownPick);
      if (ownPossible) {
        const sharers: string[] = [];
        players.forEach((other, r) => {
          if (bonusPickKey(category, other.bonusPicks[category]) === ownKey) {
            bonusBestVec[x][r] += points;
            if (r !== x) sharers.push(other.name);
          }
        });
        bonusBestEvents[x].push({ category, value: ownPick, points, sharers });
      }

      // Adversarial award: most-shared possible pick that is not X's.
      const tally = new Map<string, { value: string; indexes: number[] }>();
      players.forEach((other, r) => {
        const pick = other.bonusPicks[category];
        if (!pick) return;
        const pickKey = bonusPickKey(category, pick);
        if (pickKey === ownKey) return;
        if (!bonusStillPossible(category, pick)) return;
        const bucket = tally.get(pickKey) ?? { value: pick, indexes: [] };
        bucket.indexes.push(r);
        tally.set(pickKey, bucket);
      });
      let adversarial: { value: string; indexes: number[] } | null = null;
      for (const bucket of tally.values()) {
        if (!adversarial || bucket.indexes.length > adversarial.indexes.length) {
          adversarial = bucket;
        }
      }
      if (adversarial) {
        adversarial.indexes.forEach((r) => {
          bonusWorstVec[x][r] += points;
        });
        bonusWorstEvents[x].push({
          category,
          value: adversarial.value,
          points: 0,
          sharers: adversarial.indexes.map((r) => players[r].name),
        });
      } else {
        bonusWorstEvents[x].push({ category, value: "", points: 0, sharers: [] });
      }
    });
  }

  // ---- Scenario enumeration -------------------------------------------------
  const order = [...remaining].sort((a, b) => a.fixture.id - b.fixture.id);
  const totalBrackets = 2 ** order.length;

  type Snapshot = {
    winners: string[]; // display names, in `order` index
    scores: { home: number; away: number }[];
    totals: Int32Array;
  };

  type Tracker = {
    bestPosition: number;
    bestMargin: number;
    best: Snapshot | null;
    worstPosition: number;
    worstMargin: number;
    worst: Snapshot | null;
    winningAssignments: Set<number>;
    /** Per remaining match: winner names seen across winning scenarios. */
    winningWinners: Set<string>[];
  };

  const trackers: Tracker[] = players.map(() => ({
    bestPosition: Number.POSITIVE_INFINITY,
    bestMargin: Number.NEGATIVE_INFINITY,
    best: null,
    worstPosition: 0,
    worstMargin: Number.POSITIVE_INFINITY,
    worst: null,
    winningAssignments: new Set<number>(),
    winningWinners: order.map(() => new Set<string>()),
  }));

  let scenariosEvaluated = 0;
  let futuresCovered = 0;
  let bracketsDone = 0;
  let pruned = false;
  const yieldEvery = options.yieldEvery ?? 20_000;
  let sinceYield = 0;

  const scratchBestTotals = new Int32Array(playerCount);
  const scratchWorstTotals = new Int32Array(playerCount);

  async function maybeYield() {
    if (!yieldEvery) return;
    if (sinceYield >= yieldEvery) {
      sinceYield = 0;
      options.onProgress?.({ scenariosEvaluated, bracketsDone, totalBrackets });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  function evaluate(
    assignmentIndex: number,
    fixedTotals: Int32Array,
    winners: string[],
    scores: { home: number; away: number }[],
  ) {
    scenariosEvaluated += 1;
    sinceYield += 1;

    for (let x = 0; x < playerCount; x++) {
      const bestVec = bonusBestVec[x];
      const worstVec = bonusWorstVec[x];
      for (let p = 0; p < playerCount; p++) {
        scratchBestTotals[p] = fixedTotals[p] + bestVec[p];
        scratchWorstTotals[p] = fixedTotals[p] + worstVec[p];
      }

      let bestPos = 1;
      let bestRivalMax = Number.NEGATIVE_INFINITY;
      let worstPos = 1;
      let worstRivalMax = Number.NEGATIVE_INFINITY;
      for (let p = 0; p < playerCount; p++) {
        if (p === x) continue;
        if (scratchBestTotals[p] > scratchBestTotals[x]) bestPos += 1;
        if (scratchBestTotals[p] > bestRivalMax) bestRivalMax = scratchBestTotals[p];
        if (scratchWorstTotals[p] > scratchWorstTotals[x]) worstPos += 1;
        if (scratchWorstTotals[p] > worstRivalMax) worstRivalMax = scratchWorstTotals[p];
      }
      const bestMargin = scratchBestTotals[x] - bestRivalMax;
      const worstMargin = scratchWorstTotals[x] - worstRivalMax;

      const tracker = trackers[x];
      if (
        bestPos < tracker.bestPosition ||
        (bestPos === tracker.bestPosition && bestMargin > tracker.bestMargin)
      ) {
        tracker.bestPosition = bestPos;
        tracker.bestMargin = bestMargin;
        tracker.best = { winners: [...winners], scores: scores.map((s) => ({ ...s })), totals: Int32Array.from(scratchBestTotals) };
      }
      if (bestPos === 1) {
        tracker.winningAssignments.add(assignmentIndex);
        for (let m = 0; m < winners.length; m++) {
          tracker.winningWinners[m].add(winners[m]);
        }
      }
      if (
        worstPos > tracker.worstPosition ||
        (worstPos === tracker.worstPosition && worstMargin < tracker.worstMargin)
      ) {
        tracker.worstPosition = worstPos;
        tracker.worstMargin = worstMargin;
        tracker.worst = { winners: [...winners], scores: scores.map((s) => ({ ...s })), totals: Int32Array.from(scratchWorstTotals) };
      }
    }
  }

  // Per-assignment recursion state
  const assignedWinner: string[] = new Array(order.length).fill("");
  const assignedLoser: string[] = new Array(order.length).fill("");
  const orderIndexByFixture = new Map(order.map((match, index) => [match.fixture.id, index]));

  function resolveSlot(slot: Slot): string {
    if (slot.kind === "team") return slot.team;
    const index = orderIndexByFixture.get(slot.of)!;
    return slot.kind === "winner" ? assignedWinner[index] : assignedLoser[index];
  }

  async function enumerateAssignments(matchIndex: number, assignmentBits: number): Promise<void> {
    if (matchIndex === order.length) {
      await evaluateAssignment(assignmentBits);
      bracketsDone += 1;
      return;
    }
    const match = order[matchIndex];
    const team1 = resolveSlot(match.slots[0]);
    const team2 = resolveSlot(match.slots[1]);
    for (const winnerIsHome of [true, false]) {
      assignedWinner[matchIndex] = winnerIsHome ? team1 : team2;
      assignedLoser[matchIndex] = winnerIsHome ? team2 : team1;
      await enumerateAssignments(
        matchIndex + 1,
        assignmentBits | (winnerIsHome ? 0 : 1 << matchIndex),
      );
    }
  }

  async function evaluateAssignment(assignmentBits: number) {
    // Fixed per-assignment deltas: knockout-winner points + placements.
    const fixedTotals = new Int32Array(playerCount);
    players.forEach((player, p) => {
      fixedTotals[p] = player.base;
    });

    const pairings: { team1: string; team2: string }[] = order.map((match) => ({
      team1: resolveSlot(match.slots[0]),
      team2: resolveSlot(match.slots[1]),
    }));

    // Winner points (participants must match the player's predicted pairing).
    order.forEach((match, index) => {
      const pairing = pairings[index];
      const winnerKey = key(assignedWinner[index]);
      players.forEach((player, p) => {
        const prediction = player.predictions.get(match.fixture.id);
        if (!prediction) return;
        if (prediction.pair[0] !== key(pairing.team1) || prediction.pair[1] !== key(pairing.team2)) return;
        if (prediction.winner === winnerKey) fixedTotals[p] += scoringRules.knockoutWinner;
      });
    });

    // Placement points for teams newly reaching each round.
    const semiArrivals = new Set<string>();
    const finalArrivals = new Set<string>();
    order.forEach((match, index) => {
      const pairing = pairings[index];
      if (match.fixture.stage === "semi") {
        for (const team of [pairing.team1, pairing.team2]) {
          if (!baseline.semi.has(key(team))) semiArrivals.add(key(team));
        }
      }
      if (match.fixture.stage === "final") {
        for (const team of [pairing.team1, pairing.team2]) {
          if (!baseline.final.has(key(team))) finalArrivals.add(key(team));
        }
      }
    });
    const finalIndex = orderIndexByFixture.get(104);
    const thirdIndex = orderIndexByFixture.get(103);
    const championKey = finalIndex !== undefined ? key(assignedWinner[finalIndex]) : "";
    const runnerUpKey = finalIndex !== undefined ? key(assignedLoser[finalIndex]) : "";
    const thirdKey = thirdIndex !== undefined ? key(assignedWinner[thirdIndex]) : "";
    const fourthKey = thirdIndex !== undefined ? key(assignedLoser[thirdIndex]) : "";

    players.forEach((player, p) => {
      semiArrivals.forEach((team) => {
        if (player.predSemi.has(team)) fixedTotals[p] += scoringRules.semiFinalist;
      });
      finalArrivals.forEach((team) => {
        if (player.predFinal.has(team)) fixedTotals[p] += scoringRules.finalist;
      });
      if (championKey && player.predChampion === championKey) fixedTotals[p] += scoringRules.champion;
      if (runnerUpKey && player.predRunnerUp === runnerUpKey) fixedTotals[p] += scoringRules.runnerUp;
      if (thirdKey && player.predThird === thirdKey) fixedTotals[p] += scoringRules.thirdPlace;
      if (fourthKey && player.predFourth === fourthKey) fixedTotals[p] += scoringRules.fourthPlace;
    });

    // Scoreline candidates per match, deduplicated by points signature.
    let rawCombinations = 1;
    const candidateLists: Candidate[][] = order.map((match, index) => {
      const pairing = pairings[index];
      const pairKey1 = key(pairing.team1);
      const pairKey2 = key(pairing.team2);
      const winnerIsHome = assignedWinner[index] === pairing.team1;

      const matchingPicks: { home: number; away: number }[] = [];
      players.forEach((player) => {
        const prediction = player.predictions.get(match.fixture.id);
        if (!prediction || prediction.pair[0] !== pairKey1 || prediction.pair[1] !== pairKey2) return;
        matchingPicks.push({ home: prediction.home, away: prediction.away });
      });

      const maxGoal = Math.max(
        0,
        ...matchingPicks.flatMap((pick) => [pick.home, pick.away]),
      );
      const maxAbsGd = Math.max(
        0,
        ...matchingPicks.map((pick) => Math.abs(pick.home - pick.away)),
      );
      const bound = maxGoal + maxAbsGd + 3;
      const raw: { home: number; away: number }[] = [];
      for (let home = 0; home <= bound; home++) {
        for (let away = 0; away <= bound; away++) {
          // A scoreline is playable under this winner if the 90-minute score
          // agrees with the assigned winner, or is a draw settled on pens.
          const consistent = home === away || (home > away) === winnerIsHome;
          if (consistent) raw.push({ home, away });
        }
      }
      rawCombinations *= Math.max(1, raw.length);
      // Plausible scorelines first, so each signature class is represented by
      // a believable score (2-1, not 9-8 or a shootout) in the story views.
      raw.sort(
        (a, b) =>
          (a.home === a.away ? 100 : 0) + (a.home + a.away) * 10 + Math.abs(a.home - a.away) -
          ((b.home === b.away ? 100 : 0) + (b.home + b.away) * 10 + Math.abs(b.home - b.away)),
      );

      const candidates: Candidate[] = [];
      const signatures = new Set<string>();
      for (const scoreline of raw) {
        const deltas = new Int32Array(playerCount);
        players.forEach((player, p) => {
          const prediction = player.predictions.get(match.fixture.id);
          if (!prediction || prediction.pair[0] !== pairKey1 || prediction.pair[1] !== pairKey2) return;
          let delta = 0;
          if (prediction.home === scoreline.home) delta += scoringRules.knockoutTeamGoals;
          if (prediction.away === scoreline.away) delta += scoringRules.knockoutTeamGoals;
          if (prediction.home - prediction.away === scoreline.home - scoreline.away) {
            delta += scoringRules.knockoutGoalDifference;
          }
          if (prediction.home === scoreline.home && prediction.away === scoreline.away) {
            delta += scoringRules.knockoutExactBonus;
          }
          deltas[p] = delta;
        });
        const signature = deltas.join(",");
        if (signatures.has(signature)) continue;
        signatures.add(signature);
        candidates.push({ home: scoreline.home, away: scoreline.away, deltas });
      }
      // Most influential signatures first; the all-zero "on nobody's coupon"
      // signature is pinned to the front — it is the adversarial floor.
      candidates.sort((a, b) => {
        const weight = (candidate: Candidate) => {
          let max = 0;
          for (let p = 0; p < playerCount; p++) {
            if (candidate.deltas[p] > max) max = candidate.deltas[p];
          }
          return max === 0 ? Number.POSITIVE_INFINITY : max;
        };
        return weight(b) - weight(a);
      });
      return candidates;
    });

    // Keep the cartesian product tractable. Signature deduplication makes
    // explosion unlikely, but if it happens, drop the weakest signatures from
    // the largest lists (best/worst extremes are driven by the strong ones).
    const SCENARIO_BUDGET = 400_000;
    let product = candidateLists.reduce((n, list) => n * list.length, 1);
    while (product > SCENARIO_BUDGET) {
      const largest = candidateLists.reduce((best, list) =>
        list.length > best.length ? list : best,
      );
      if (largest.length <= 2) break;
      largest.pop();
      pruned = true;
      product = candidateLists.reduce((n, list) => n * list.length, 1);
    }

    futuresCovered += rawCombinations;

    // Cartesian product over candidate scorelines.
    const winners = [...assignedWinner];
    const scores: { home: number; away: number }[] = order.map(() => ({ home: 0, away: 0 }));
    const totals = Int32Array.from(fixedTotals);

    const iterate = async (matchIndex: number): Promise<void> => {
      if (matchIndex === order.length) {
        evaluate(assignmentBits, totals, winners, scores);
        await maybeYield();
        return;
      }
      for (const candidate of candidateLists[matchIndex]) {
        scores[matchIndex].home = candidate.home;
        scores[matchIndex].away = candidate.away;
        for (let p = 0; p < playerCount; p++) totals[p] += candidate.deltas[p];
        await iterate(matchIndex + 1);
        for (let p = 0; p < playerCount; p++) totals[p] -= candidate.deltas[p];
      }
    };
    await iterate(0);
  }

  await enumerateAssignments(0, 0);
  options.onProgress?.({ scenariosEvaluated, bracketsDone, totalBrackets });

  // ---- Reports ---------------------------------------------------------------
  const currentTotals = players.map((player) => player.base);
  const currentPositions = players.map(
    (_, x) => 1 + currentTotals.filter((total, p) => p !== x && total > currentTotals[x]).length,
  );

  function buildScenario(
    x: number,
    snapshot: Snapshot,
    bonusEvents: ScenarioBonusEvent[],
  ): Scenario {
    const player = players[x];
    const matches: ScenarioMatchEvent[] = order.map((match, index) => {
      return {
        fixtureId: match.fixture.id,
        stage: match.fixture.stage,
        round: match.fixture.round,
        date: match.fixture.date,
        team1: "",
        team2: "",
        home: snapshot.scores[index].home,
        away: snapshot.scores[index].away,
        winner: snapshot.winners[index],
        penalties: snapshot.scores[index].home === snapshot.scores[index].away,
        gains: [],
        points: 0,
      };
    });

    // Re-derive pairings by replaying the bracket with this snapshot's winners.
    const winnersByIndex = snapshot.winners;
    const losersByIndex: string[] = order.map(() => "");
    order.forEach((match, index) => {
      const resolve = (slot: Slot): string => {
        if (slot.kind === "team") return slot.team;
        const sourceIndex = orderIndexByFixture.get(slot.of)!;
        return slot.kind === "winner" ? winnersByIndex[sourceIndex] : losersByIndex[sourceIndex];
      };
      const team1 = resolve(match.slots[0]);
      const team2 = resolve(match.slots[1]);
      losersByIndex[index] = winnersByIndex[index] === team1 ? team2 : team1;
      matches[index].team1 = team1;
      matches[index].team2 = team2;
    });

    // Itemise the focus player's gains per match.
    order.forEach((match, index) => {
      const event = matches[index];
      const prediction = player.predictions.get(match.fixture.id);
      const gains: { label: string; points: number }[] = [];
      const pairMatches =
        prediction &&
        prediction.pair[0] === key(event.team1) &&
        prediction.pair[1] === key(event.team2);
      if (pairMatches && prediction) {
        if (prediction.winner === key(event.winner)) {
          gains.push({ label: `Called ${event.winner} to advance`, points: scoringRules.knockoutWinner });
        }
        if (prediction.home === event.home && prediction.away === event.away) {
          gains.push({
            label: `Exact score ${event.home}-${event.away} — the full house`,
            points:
              scoringRules.knockoutTeamGoals * 2 +
              scoringRules.knockoutGoalDifference +
              scoringRules.knockoutExactBonus,
          });
        } else {
          if (prediction.home === event.home) {
            gains.push({ label: `${event.team1} goals bang on`, points: scoringRules.knockoutTeamGoals });
          }
          if (prediction.away === event.away) {
            gains.push({ label: `${event.team2} goals bang on`, points: scoringRules.knockoutTeamGoals });
          }
          if (prediction.home - prediction.away === event.home - event.away) {
            gains.push({ label: "Margin matched", points: scoringRules.knockoutGoalDifference });
          }
        }
      }
      // Placement gains triggered by this match.
      if (match.fixture.stage !== "final" && match.fixture.stage !== "thirdPlace") {
        const nextStage: Stage | null =
          match.fixture.stage === "quarter" ? "semi" : match.fixture.stage === "semi" ? "final" : null;
        if (nextStage) {
          const reached = key(event.winner);
          const predictedSet = nextStage === "semi" ? player.predSemi : player.predFinal;
          const baselineSet = nextStage === "semi" ? baseline.semi : baseline.final;
          if (predictedSet.has(reached) && !baselineSet.has(reached)) {
            gains.push({
              label: `${event.winner} reach the ${nextStage === "semi" ? "semi-finals" : "final"} — you called it`,
              points: nextStage === "semi" ? scoringRules.semiFinalist : scoringRules.finalist,
            });
          }
        }
      }
      if (match.fixture.stage === "final") {
        if (player.predChampion === key(event.winner)) {
          gains.push({ label: `${event.winner} champions — your coupon said so`, points: scoringRules.champion });
        }
        const runnerUp = event.winner === event.team1 ? event.team2 : event.team1;
        if (player.predRunnerUp === key(runnerUp)) {
          gains.push({ label: `${runnerUp} runners-up, as predicted`, points: scoringRules.runnerUp });
        }
      }
      if (match.fixture.stage === "thirdPlace") {
        if (player.predThird === key(event.winner)) {
          gains.push({ label: `${event.winner} take bronze — called it`, points: scoringRules.thirdPlace });
        }
        const fourth = event.winner === event.team1 ? event.team2 : event.team1;
        if (player.predFourth === key(fourth)) {
          gains.push({ label: `${fourth} fourth, as predicted`, points: scoringRules.fourthPlace });
        }
      }
      event.gains = gains;
      event.points = gains.reduce((sum, gain) => sum + gain.points, 0);
    });

    const table: ScenarioTableRow[] = players
      .map((other, p) => ({
        submissionId: other.submissionId,
        name: other.name,
        total: snapshot.totals[p],
        position: 0,
      }))
      .sort((a, b) => b.total - a.total);
    table.forEach((row, index) => {
      row.position = index === 0 || row.total < table[index - 1].total ? index + 1 : table[index - 1].position;
      if (index > 0 && row.total === table[index - 1].total) row.position = table[index - 1].position;
    });

    const ownRow = table.find((row) => row.submissionId === player.submissionId)!;
    const rivalTotals = table
      .filter((row) => row.submissionId !== player.submissionId)
      .map((row) => row.total);
    const bestRivalTotal = rivalTotals.length ? Math.max(...rivalTotals) : ownRow.total;

    return {
      position: ownRow.position,
      total: ownRow.total,
      margin: ownRow.total - bestRivalTotal,
      matches,
      bonuses: bonusEvents,
      table,
    };
  }

  const verdicts: PlayerVerdict[] = players.map((player, x) => {
    const tracker = trackers[x];
    const dream = buildScenario(x, tracker.best!, bonusBestEvents[x]);
    const nightmare = buildScenario(x, tracker.worst!, bonusWorstEvents[x]);

    // "What needs to happen": across every winning future, does this match
    // always demand the same winner? Winner names (not bracket bits) are
    // compared because later pairings differ from bracket to bracket.
    const requirements: MatchRequirement[] = [];
    if (tracker.bestPosition === 1 && tracker.winningAssignments.size) {
      order.forEach((match, index) => {
        const winnersSeen = tracker.winningWinners[index];
        // Pairing display: concrete only when both slots are already known.
        const slotTeams = match.slots.map((slot) => (slot.kind === "team" ? slot.team : ""));
        requirements.push({
          fixtureId: match.fixture.id,
          round: match.fixture.round,
          date: match.fixture.date,
          team1: slotTeams[0],
          team2: slotTeams[1],
          kind: winnersSeen.size === 1 ? "must" : "either",
          winner: winnersSeen.size === 1 ? winnersSeen.values().next().value : undefined,
        });
      });
    }

    return {
      submissionId: player.submissionId,
      name: player.name,
      current: player.base,
      currentPosition: currentPositions[x],
      canWin: tracker.bestPosition === 1,
      canWinOutright: tracker.bestPosition === 1 && tracker.bestMargin > 0,
      bestPosition: tracker.bestPosition,
      worstPosition: tracker.worstPosition,
      winningBrackets: tracker.winningAssignments.size,
      requirements,
      deadBonuses: deadBonuses[x],
      dream,
      nightmare,
    };
  });

  verdicts.sort((a, b) => a.currentPosition - b.currentPosition || b.current - a.current);

  return {
    mode: "ready",
    players: verdicts,
    totalBrackets,
    scenariosEvaluated,
    futuresCovered,
    pruned,
    remainingMatches: order.map((match) => ({
      fixtureId: match.fixture.id,
      round: match.fixture.round,
      date: match.fixture.date,
    })),
  };
}
