import assert from "node:assert/strict";
import test from "node:test";
import { fixtures } from "@/data/fixtures";
import { crunchStillInIt } from "@/lib/still-in-it";
import {
  createEmptyPicks,
  emptyBonuses,
  resolveFixtures,
  winnerFor,
} from "@/lib/tournament";
import { scoreSubmission } from "@/lib/tournament";
import type {
  MatchPick,
  ResultMatch,
  Submission,
  TournamentResults,
} from "@/types/game";

// Deterministic picks so the gold-standard comparison is reproducible.
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function buildPicks(seed: number): Record<number, MatchPick> {
  const random = lcg(seed);
  const goal = () => Math.floor(random() * 4);
  const picks = createEmptyPicks();
  for (const fixture of fixtures) {
    if (fixture.stage !== "group") continue;
    picks[fixture.id] = { fixtureId: fixture.id, home: goal(), away: goal() };
  }
  // Resolve progressively so draw picks carry a concrete winner: resolving
  // once up front would stamp placeholder tokens (W76) into `winner`, breaking
  // the bracket chain and leaking placeholders into every later round.
  const knockout = fixtures
    .filter((item) => item.stage !== "group")
    .sort((a, b) => a.id - b.id);
  for (const fixture of knockout) {
    const resolved = resolveFixtures(picks).find((item) => item.id === fixture.id)!;
    const home = goal();
    const away = goal();
    picks[fixture.id] = {
      fixtureId: fixture.id,
      home,
      away,
      winner: home === away ? resolved.resolvedTeam1 : undefined,
    };
  }
  return picks;
}

function resultsFromPicks(
  picks: Record<number, MatchPick>,
  excludeFixtureIds: number[],
): TournamentResults {
  const excluded = new Set(excludeFixtureIds);
  const resolved = resolveFixtures(picks);
  const matches: Record<number, ResultMatch> = {};
  for (const fixture of resolved) {
    if (excluded.has(fixture.id)) continue;
    const pick = picks[fixture.id];
    matches[fixture.id] = {
      fixtureId: fixture.id,
      team1: fixture.resolvedTeam1,
      team2: fixture.resolvedTeam2,
      home: Number(pick.home),
      away: Number(pick.away),
      winner:
        fixture.stage === "group"
          ? undefined
          : winnerFor(fixture.resolvedTeam1, fixture.resolvedTeam2, pick),
      status: "completed",
    };
  }
  return { matches, bonuses: emptyBonuses(), updatedAt: new Date().toISOString() };
}

function makeSubmission(
  id: string,
  picks: Record<number, MatchPick>,
  bonuses = { topScorer: "Shared Scorer", goldenBall: "Shared Baller", mostGoalsTeam: "Sharedland" },
): Submission {
  return { id, name: id, createdAt: new Date().toISOString(), picks, bonuses };
}

type Outcome = { home: number; away: number; winner: string };

function outcomesFor(team1: string, team2: string, scorelines: [number, number][]): Outcome[] {
  const outcomes: Outcome[] = [];
  const seen = new Set<string>();
  for (const [home, away] of scorelines) {
    const token = `${home}-${away}`;
    if (seen.has(token)) continue;
    seen.add(token);
    if (home > away) outcomes.push({ home, away, winner: team1 });
    else if (away > home) outcomes.push({ home, away, winner: team2 });
    else {
      outcomes.push({ home, away, winner: team1 });
      outcomes.push({ home, away, winner: team2 });
    }
  }
  return outcomes;
}

function bruteForceExtremes(
  submissions: Submission[],
  settled: TournamentResults,
  remainingIds: number[],
  scorelinesByFixture: Map<number, [number, number][]>,
) {
  const best = submissions.map(() => Number.POSITIVE_INFINITY);
  const worst = submissions.map(() => 0);
  const bestMarginAtTop = submissions.map(() => Number.NEGATIVE_INFINITY);
  const winningWinners = submissions.map(
    () => new Map(remainingIds.map((id) => [id, new Set<string>()])),
  );

  const recurse = (index: number, matches: Record<number, ResultMatch>) => {
    if (index === remainingIds.length) {
      const totals = submissions.map(
        (submission) => scoreSubmission(submission, { ...settled, matches }).total,
      );
      submissions.forEach((_, x) => {
        const position = 1 + totals.filter((total, p) => p !== x && total > totals[x]).length;
        best[x] = Math.min(best[x], position);
        worst[x] = Math.max(worst[x], position);
        if (position === 1) {
          const rivalMax = Math.max(...totals.filter((_, p) => p !== x));
          bestMarginAtTop[x] = Math.max(bestMarginAtTop[x], totals[x] - rivalMax);
          remainingIds.forEach((id) => {
            winningWinners[x].get(id)!.add(matches[id].winner!);
          });
        }
      });
      return;
    }
    const fixtureId = remainingIds[index];
    // Participants must be derived from what is already decided (including
    // earlier remaining matches assigned in this branch).
    const resolved = resolveFixtures(matches).find((item) => item.id === fixtureId)!;
    for (const outcome of outcomesFor(
      resolved.resolvedTeam1,
      resolved.resolvedTeam2,
      scorelinesByFixture.get(fixtureId)!,
    )) {
      recurse(index + 1, {
        ...matches,
        [fixtureId]: {
          fixtureId,
          team1: resolved.resolvedTeam1,
          team2: resolved.resolvedTeam2,
          home: outcome.home,
          away: outcome.away,
          winner: outcome.winner,
          status: "completed",
        },
      });
    }
  };
  recurse(0, { ...settled.matches });
  return { best, worst, bestMarginAtTop, winningWinners };
}

test("final-only crunch matches brute force over a full scoreline grid", async () => {
  const base = buildPicks(7);
  const picksA = structuredClone(base);
  picksA[104] = { fixtureId: 104, home: 2, away: 1 };
  const picksB = structuredClone(base);
  picksB[104] = { fixtureId: 104, home: 0, away: 2 };
  const picksC = structuredClone(base);
  // Weaken C with away-goal tweaks in one group so the field is spread out.
  for (const fixture of fixtures.filter((item) => item.group === "A")) {
    const pick = picksC[fixture.id];
    picksC[fixture.id] = {
      ...pick,
      away: Math.min(5, Number(pick.away) + 2),
    };
  }

  const submissions = [
    makeSubmission("A", picksA),
    makeSubmission("B", picksB),
    makeSubmission("C", picksC),
  ];
  const results = resultsFromPicks(base, [104]);

  const report = await crunchStillInIt(submissions, results, { yieldEvery: 0 });
  assert.equal(report.mode, "ready");
  if (report.mode !== "ready") return;

  // Full grid 0..5 both ways: covers every points signature any pick can hit.
  const grid: [number, number][] = [];
  for (let home = 0; home <= 5; home++) {
    for (let away = 0; away <= 5; away++) grid.push([home, away]);
  }
  const gold = bruteForceExtremes(submissions, results, [104], new Map([[104, grid]]));

  submissions.forEach((submission, x) => {
    const verdict = report.players.find((player) => player.submissionId === submission.id)!;
    assert.equal(verdict.bestPosition, gold.best[x], `${submission.id} bestPosition`);
    assert.equal(verdict.worstPosition, gold.worst[x], `${submission.id} worstPosition`);
    assert.equal(verdict.canWin, gold.best[x] === 1, `${submission.id} canWin`);
    if (gold.best[x] === 1) {
      assert.equal(verdict.dream.margin, gold.bestMarginAtTop[x], `${submission.id} dream margin`);
      // Requirements: matches where every winning future agrees on the winner.
      const finalWinners = gold.winningWinners[x].get(104)!;
      const requirement = verdict.requirements.find((item) => item.fixtureId === 104)!;
      if (finalWinners.size === 1) {
        assert.equal(requirement.kind, "must");
        assert.equal(requirement.winner, finalWinners.values().next().value);
      } else {
        assert.equal(requirement.kind, "either");
      }
    }
  });
});

test("chained remaining matches (semi feeds final) match brute force", async () => {
  const base = buildPicks(11);
  const picksA = structuredClone(base);
  const picksB = structuredClone(base);
  picksB[102] = { fixtureId: 102, home: 0, away: 1 };
  picksB[104] = { fixtureId: 104, home: 1, away: 3 };
  const picksC = structuredClone(base);
  picksC[103] = { fixtureId: 103, home: 2, away: 2, winner: undefined };
  picksC[104] = { fixtureId: 104, home: 2, away: 0 };

  const submissions = [
    makeSubmission("A", picksA),
    makeSubmission("B", picksB),
    makeSubmission("C", picksC),
  ];
  const remainingIds = [102, 103, 104];
  const results = resultsFromPicks(base, remainingIds);

  const report = await crunchStillInIt(submissions, results, { yieldEvery: 0 });
  assert.equal(report.mode, "ready");
  if (report.mode !== "ready") return;

  // Candidate scorelines: every player's pick plus adversarial blowouts.
  const scorelines = new Map<number, [number, number][]>(
    remainingIds.map((id) => [
      id,
      [
        ...submissions.map(
          (submission) =>
            [Number(submission.picks[id].home), Number(submission.picks[id].away)] as [
              number,
              number,
            ],
        ),
        [4, 0],
        [0, 4],
        [5, 4],
        [4, 5],
      ],
    ]),
  );
  const gold = bruteForceExtremes(submissions, results, remainingIds, scorelines);

  submissions.forEach((submission, x) => {
    const verdict = report.players.find((player) => player.submissionId === submission.id)!;
    assert.equal(verdict.bestPosition, gold.best[x], `${submission.id} bestPosition`);
    assert.equal(verdict.worstPosition, gold.worst[x], `${submission.id} worstPosition`);
    if (gold.best[x] === 1) {
      assert.equal(verdict.dream.margin, gold.bestMarginAtTop[x], `${submission.id} dream margin`);
    }
  });
});

test("announced pairings cannot rewire the official bracket", async () => {
  const base = buildPicks(3);
  const submissions = [makeSubmission("A", base), makeSubmission("B", buildPicks(4))];
  // Same shape as the real tournament today: two QFs + semis onward open.
  const remainingIds = [99, 100, 101, 102, 103, 104];
  const results = resultsFromPicks(base, remainingIds);

  const resolved = resolveFixtures(results.matches);
  const winner97 = results.matches[97].winner!;
  const winner98 = results.matches[98].winner!;
  const teams99 = [
    resolved.find((item) => item.id === 99)!.resolvedTeam1,
    resolved.find((item) => item.id === 99)!.resolvedTeam2,
  ];
  const teams100 = [
    resolved.find((item) => item.id === 100)!.resolvedTeam1,
    resolved.find((item) => item.id === 100)!.resolvedTeam2,
  ];

  // Without pins: the local skeleton pairs W97 v W98 in the first semi.
  const unpinned = await crunchStillInIt(submissions, results, { yieldEvery: 0 });
  assert.equal(unpinned.mode, "ready");
  if (unpinned.mode !== "ready") return;
  const unpinnedSemi = unpinned.players[0].dream.matches.find((item) => item.fixtureId === 101)!;
  assert.equal(unpinnedSemi.team1, winner97);
  assert.equal(unpinnedSemi.team2, winner98);

  // A speculative provider row puts W98 on the other semi-final. It must be
  // ignored rather than pulling the remaining quarter-final feeds across the
  // official sides of the draw.
  const pinnedReport = await crunchStillInIt(submissions, results, {
    yieldEvery: 0,
    pinnedSlots: { 101: [winner97, null], 102: [winner98, null] },
  });
  assert.equal(pinnedReport.mode, "ready");
  if (pinnedReport.mode !== "ready") return;
  const semi1 = pinnedReport.players[0].dream.matches.find((item) => item.fixtureId === 101)!;
  assert.equal(semi1.team1, winner97);
  assert.equal(semi1.team2, winner98);
  const semi2 = pinnedReport.players[0].dream.matches.find((item) => item.fixtureId === 102)!;
  assert.ok(teams99.includes(semi2.team1), `semi 2 home slot should come from QF 99`);
  assert.ok(teams100.includes(semi2.team2), `semi 2 away slot should come from QF 100`);
});

test("dead bonus picks cannot rescue a trailing player", async () => {
  const base = buildPicks(19);
  const submissions = [
    makeSubmission("A", structuredClone(base), {
      topScorer: "Alpha Striker",
      goldenBall: "Alpha Playmaker",
      mostGoalsTeam: "Alphaland",
    }),
    makeSubmission("B", structuredClone(base), {
      topScorer: "Beta Striker",
      goldenBall: "Beta Playmaker",
      mostGoalsTeam: "Alphaland",
    }),
  ];
  const results = resultsFromPicks(base, [104]);
  // Settle golden ball for A: B now trails by 40 with otherwise identical
  // picks, so B can only catch up if their unique top-scorer bet still lives.
  results.bonuses = { topScorer: "", goldenBall: "Alpha Playmaker", mostGoalsTeam: "" };

  const finalTeams = resolveFixtures(results.matches).find((item) => item.id === 104)!;

  const aliveStats = {
    scorers: [
      { player: "Beta Striker", team: finalTeams.resolvedTeam1, goals: 3, assists: 0, penaltyGoals: 0, matches: [] },
      { player: "Golden Leader", team: "Elsewhere", goals: 9, assists: 0, penaltyGoals: 0, matches: [] },
    ],
    assists: [],
    matchStats: {},
    updatedAt: new Date().toISOString(),
  };
  const deadStats = {
    ...aliveStats,
    scorers: [
      { player: "Beta Striker", team: "Eliminated FC", goals: 3, assists: 0, penaltyGoals: 0, matches: [] },
      { player: "Golden Leader", team: "Elsewhere", goals: 9, assists: 0, penaltyGoals: 0, matches: [] },
    ],
  };

  const alive = await crunchStillInIt(
    submissions,
    { ...results, playerStats: aliveStats },
    { yieldEvery: 0 },
  );
  assert.equal(alive.mode, "ready");
  if (alive.mode !== "ready") return;
  const bAlive = alive.players.find((player) => player.submissionId === "B")!;
  assert.equal(bAlive.canWin, true, "B can win while the top-scorer bet lives");

  const dead = await crunchStillInIt(
    submissions,
    { ...results, playerStats: deadStats },
    { yieldEvery: 0 },
  );
  assert.equal(dead.mode, "ready");
  if (dead.mode !== "ready") return;
  const bDead = dead.players.find((player) => player.submissionId === "B")!;
  assert.equal(bDead.canWin, false, "B cannot win once the top-scorer bet is dead");
  assert.ok(
    bDead.deadBonuses.some((item) => item.category === "topScorer"),
    "top-scorer bet flagged as dead",
  );
  assert.ok(
    !bAlive.deadBonuses.some((item) => item.category === "topScorer"),
    "living top-scorer bet not flagged",
  );
});

test("hand-typed bonus spellings match the stats feed and group across entries", async () => {
  const base = buildPicks(23);
  const submissions = [
    makeSubmission("A", structuredClone(base), {
      topScorer: "Erling Haaland",
      goldenBall: "Yamal",
      mostGoalsTeam: "Alphaland",
    }),
    // Same top-scorer bet, typed as a bare surname.
    makeSubmission("B", structuredClone(base), {
      topScorer: "Haaland",
      goldenBall: "Lamine Yamal",
      mostGoalsTeam: "Alphaland",
    }),
  ];
  const results = resultsFromPicks(base, [104]);

  const statsFor = (team: string) => ({
    scorers: [
      { player: "Erling Haaland", team, goals: 7, assists: 0, penaltyGoals: 0, matches: [] },
      { player: "Golden Leader", team: "Elsewhere", goals: 9, assists: 0, penaltyGoals: 0, matches: [] },
    ],
    assists: [],
    matchStats: {},
    updatedAt: new Date().toISOString(),
  });

  const finalTeams = resolveFixtures(results.matches).find((item) => item.id === 104)!;
  const alive = await crunchStillInIt(
    submissions,
    { ...results, playerStats: statsFor(finalTeams.resolvedTeam1) },
    { yieldEvery: 0 },
  );
  assert.equal(alive.mode, "ready");
  if (alive.mode !== "ready") return;
  for (const player of alive.players) {
    assert.ok(
      !player.deadBonuses.some((item) => item.category === "topScorer"),
      `${player.name}: living bet must not be flagged dead`,
    );
    // Both spellings name the same person, so each dream lists the other
    // entry as a sharer of the top-scorer bet.
    const bestBonus = player.dream.bonuses.find((item) => item.category === "topScorer")!;
    assert.equal(bestBonus.sharers.length, 1, `${player.name}: sharer across spellings`);
  }

  const dead = await crunchStillInIt(
    submissions,
    { ...results, playerStats: statsFor("Eliminated FC") },
    { yieldEvery: 0 },
  );
  assert.equal(dead.mode, "ready");
  if (dead.mode !== "ready") return;
  for (const player of dead.players) {
    assert.ok(
      player.deadBonuses.some((item) => item.category === "topScorer"),
      `${player.name}: eliminated-and-trailing bet flagged dead for both spellings`,
    );
    assert.ok(
      !player.dream.bonuses.some((item) => item.category === "topScorer"),
      `${player.name}: dead bet must not pay out in the dream scenario`,
    );
  }
});

test("group stage still running reports not-ready", async () => {
  const base = buildPicks(5);
  const groupIds = fixtures.filter((item) => item.stage === "group").map((item) => item.id);
  const results = resultsFromPicks(base, [groupIds[0], 103, 104]);
  const report = await crunchStillInIt([makeSubmission("A", base)], results, { yieldEvery: 0 });
  assert.equal(report.mode, "not-ready");
});
