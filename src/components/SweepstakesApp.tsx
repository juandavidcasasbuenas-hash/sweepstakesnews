"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  LockKeyhole,
  RefreshCw,
  Shuffle,
  Sparkles,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  autofillTournament,
  calculateGroupStandings,
  completedMatchCount,
  createEmptyPicks,
  emptyBonuses,
  FIRST_KICK_OFF_ISO,
  groupTeams,
  qualifiedTeams,
  resolveFixtures,
  sampleResults,
  scoreSubmission,
  scoringRules,
} from "@/lib/tournament";
import type {
  BonusPicks,
  MatchPick,
  ResolvedFixture,
  Submission,
  TournamentResults,
} from "@/types/game";

const localSubmissionsKey = "sweepstakes-news-submissions";
const localResultsKey = "sweepstakes-news-results";
const localSubmittedEntryKey = "sweepstakes-news-submitted-entry";
const mockSubmissionIds = [
  "mock-entry-alex-morgan",
  "mock-entry-priya-shah",
  "mock-entry-marcus-lee",
  "mock-entry-sofia-reed",
  "mock-entry-tom-hughes",
];
const blankResults: TournamentResults = {
  matches: {},
  bonuses: emptyBonuses(),
  updatedAt: new Date(0).toISOString(),
};
const liveResultsPollMs = 60_000;

type Tab = "predict" | "matchday" | "leaderboard" | "rules";
type EntryViewTab = "summary" | "groups" | "bracket" | "picks";
type PredictionStep = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "round32" | "round16" | "quarter" | "semi" | "finals";
type ResultsPayload = {
  mode?: string;
  cached?: boolean;
  stale?: boolean;
  warning?: string;
  results?: TournamentResults;
};

const groupLetters = "ABCDEFGHIJKL".split("") as PredictionStep[];
const knockoutPredictionSteps: Array<{ id: PredictionStep; label: string; short: string }> = [
  { id: "round32", label: "Round of 32", short: "R32" },
  { id: "round16", label: "Round of 16", short: "R16" },
  { id: "quarter", label: "Quarter-finals", short: "QF" },
  { id: "semi", label: "Semi-finals", short: "SF" },
  { id: "finals", label: "Finals", short: "Finals" },
];

const teamFlags: Record<string, string> = {
  Algeria: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  "Bosnia & Herzegovina": "🇧🇦",
  Brazil: "🇧🇷",
  Canada: "🇨🇦",
  "Cape Verde": "🇨🇻",
  Colombia: "🇨🇴",
  Croatia: "🇭🇷",
  Curaçao: "🇨🇼",
  "Czech Republic": "🇨🇿",
  "DR Congo": "🇨🇩",
  Ecuador: "🇪🇨",
  Egypt: "🇪🇬",
  England: "🏴",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Ghana: "🇬🇭",
  Haiti: "🇭🇹",
  Iran: "🇮🇷",
  Iraq: "🇮🇶",
  "Ivory Coast": "🇨🇮",
  Japan: "🇯🇵",
  Jordan: "🇯🇴",
  Mexico: "🇲🇽",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  "New Zealand": "🇳🇿",
  Norway: "🇳🇴",
  Panama: "🇵🇦",
  Paraguay: "🇵🇾",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  "Saudi Arabia": "🇸🇦",
  Scotland: "🏴",
  Senegal: "🇸🇳",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  Spain: "🇪🇸",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Tunisia: "🇹🇳",
  Turkey: "🇹🇷",
  USA: "🇺🇸",
  Uruguay: "🇺🇾",
  Uzbekistan: "🇺🇿",
};

function isLocked() {
  return Date.now() >= new Date(FIRST_KICK_OFF_ISO).getTime();
}

function readLocal<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeNumber(value: string): number | "" {
  if (value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  return Math.min(15, Math.floor(parsed));
}

function formatDate(fixture: ResolvedFixture) {
  return `${fixture.date.replace("2026-", "")} · ${fixture.time.replace(" UTC", " UTC")}`;
}

function flagFor(team: string) {
  return teamFlags[team] ?? "";
}

function TeamLabel({ team }: { team: string }) {
  const flag = flagFor(team);
  return (
    <span className="team-label">
      {flag ? <span className="flag" aria-hidden="true">{flag}</span> : null}
      <span>{team}</span>
    </span>
  );
}

function TeamPill({ children, team }: { children: React.ReactNode; team?: string }) {
  const flag = team ? flagFor(team) : "";
  return (
    <span className="team-pill">
      {flag ? <span className="flag" aria-hidden="true">{flag}</span> : null}
      {children}
    </span>
  );
}

function scoreComplete(pick?: MatchPick) {
  return typeof pick?.home === "number" && typeof pick.away === "number";
}

function completedInFixtures(fixtures: ResolvedFixture[], picks: Record<number, MatchPick>) {
  return fixtures.filter((fixture) => scoreComplete(picks[fixture.id])).length;
}

function escapeHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pickScore(pick?: MatchPick) {
  if (!pick || pick.home === "" || pick.away === "") return "? - ?";
  return `${pick.home} - ${pick.away}`;
}

function ScoreTeamLabel({
  team,
  goals,
}: {
  team: string;
  goals?: number | "";
}) {
  return (
    <span className="score-team-label">
      <TeamLabel team={team} />
      {typeof goals === "number" ? <b>{goals}</b> : null}
    </span>
  );
}

function pickOutcome(pick?: MatchPick) {
  if (!pick || typeof pick.home !== "number" || typeof pick.away !== "number") return "Pending";
  if (pick.home > pick.away) return "Home win";
  if (pick.away > pick.home) return "Away win";
  return pick.winner ? `${pick.winner} on pens` : "Draw";
}

function resultOutcome(result?: TournamentResults["matches"][number]) {
  if (!result) return "Awaiting result";
  if (result.winner) return `${result.winner} won`;
  if (result.home > result.away) return "Home win";
  if (result.away > result.home) return "Away win";
  return "Draw";
}

function matchPickClass(pick?: MatchPick, result?: TournamentResults["matches"][number]) {
  if (!pick || !result || typeof pick.home !== "number" || typeof pick.away !== "number") {
    return "";
  }
  if (pick.home === result.home && pick.away === result.away) return " exact";
  const pickDirection = Math.sign(pick.home - pick.away);
  const resultDirection = Math.sign(result.home - result.away);
  return pickDirection === resultDirection ? " direction" : " missed";
}

function scoreMatchPick(
  pick: MatchPick | undefined,
  result: TournamentResults["matches"][number] | undefined,
  fixture: ResolvedFixture,
): number {
  if (!pick || !result || typeof pick.home !== "number" || typeof pick.away !== "number") {
    return 0;
  }
  const pH = Number(pick.home);
  const pA = Number(pick.away);
  let pts = 0;
  if (fixture.stage === "group") {
    if (Math.sign(pH - pA) === Math.sign(result.home - result.away)) pts += scoringRules.groupResult;
    if (pH === result.home) pts += scoringRules.groupTeamGoals;
    if (pA === result.away) pts += scoringRules.groupTeamGoals;
    if (pH - pA === result.home - result.away) pts += scoringRules.groupGoalDifferencePerTeam * 2;
    if (pH === result.home && pA === result.away) pts += scoringRules.groupExactBonus;
  } else {
    const pickWinner =
      pH > pA ? fixture.resolvedTeam1 :
      pA > pH ? fixture.resolvedTeam2 :
      (pick.winner ?? fixture.resolvedTeam1);
    if (result.winner && pickWinner === result.winner) pts += scoringRules.knockoutWinner;
    if (pH === result.home) pts += scoringRules.knockoutTeamGoals;
    if (pA === result.away) pts += scoringRules.knockoutTeamGoals;
    if (pH - pA === result.home - result.away) pts += scoringRules.knockoutGoalDifference;
    if (pH === result.home && pA === result.away) pts += scoringRules.knockoutExactBonus;
  }
  return pts;
}

function finalSummary(submission: Submission) {
  const resolved = resolveFixtures(submission.picks);
  const final = resolved.find((fixture) => fixture.id === 104);
  if (!final) return { champion: "TBC", runnerUp: "TBC", score: "? - ?" };
  const pick = submission.picks[104];
  const winner =
    pick?.winner ||
    (typeof pick?.home === "number" && typeof pick?.away === "number"
      ? pick.home > pick.away
        ? final.resolvedTeam1
        : pick.away > pick.home
          ? final.resolvedTeam2
          : final.resolvedTeam1
      : final.resolvedTeam1);

  return {
    champion: winner,
    runnerUp: winner === final.resolvedTeam1 ? final.resolvedTeam2 : final.resolvedTeam1,
    score: pickScore(pick),
  };
}

function createMockPicks(seed: number) {
  const picks = autofillTournament(createEmptyPicks());
  Object.values(picks).forEach((pick) => {
    if (pick.fixtureId === 104) return;
    if (typeof pick.home !== "number" || typeof pick.away !== "number") return;

    if ((pick.fixtureId + seed) % 11 === 0) {
      pick.home = Math.max(0, pick.home - 1);
      pick.away = Math.min(5, pick.away + 1);
    } else if ((pick.fixtureId + seed) % 7 === 0) {
      pick.home = Math.min(5, pick.home + 1);
    } else if ((pick.fixtureId + seed) % 5 === 0) {
      pick.away = Math.min(5, pick.away + 1);
    }

    if (pick.home === pick.away && pick.fixtureId > 72) {
      pick.winner = (pick.fixtureId + seed) % 2 === 0 ? undefined : pick.winner;
    }
  });

  const finalPick = picks[104];
  if (seed % 3 === 0) {
    picks[104] = { ...finalPick, home: 2, away: 1, winner: undefined };
  } else if (seed % 3 === 1) {
    picks[104] = { ...finalPick, home: 1, away: 2, winner: undefined };
  } else {
    picks[104] = { ...finalPick, home: 1, away: 1, winner: undefined };
  }

  return picks;
}

function createMockSubmissions(existing: Submission[]) {
  const mockProfiles = [
    {
      id: mockSubmissionIds[0],
      name: "Alex Morgan",
      bonuses: { topScorer: "Kylian Mbappe", goldenBall: "Jude Bellingham", mostGoalsTeam: "France" },
    },
    {
      id: mockSubmissionIds[1],
      name: "Priya Shah",
      bonuses: { topScorer: "Harry Kane", goldenBall: "Vinicius Junior", mostGoalsTeam: "Brazil" },
    },
    {
      id: mockSubmissionIds[2],
      name: "Marcus Lee",
      bonuses: { topScorer: "Erling Haaland", goldenBall: "Florian Wirtz", mostGoalsTeam: "Germany" },
    },
    {
      id: mockSubmissionIds[3],
      name: "Sofia Reed",
      bonuses: { topScorer: "Lautaro Martinez", goldenBall: "Lionel Messi", mostGoalsTeam: "Argentina" },
    },
    {
      id: mockSubmissionIds[4],
      name: "Tom Hughes",
      bonuses: { topScorer: "Bukayo Saka", goldenBall: "Phil Foden", mostGoalsTeam: "England" },
    },
  ];

  const createdAtBase = new Date("2026-05-12T12:00:00.000Z").getTime();
  const mocks = mockProfiles.map((profile, index) => ({
    id: profile.id,
    name: profile.name,
    createdAt: new Date(createdAtBase + index * 9 * 60 * 1000).toISOString(),
    picks: createMockPicks(index + 1),
    bonuses: profile.bonuses,
  }));

  return [
    ...existing.filter((submission) => !mockSubmissionIds.includes(submission.id)),
    ...mocks,
  ];
}

function buildPredictionPdfHtml(submission: Submission, results: TournamentResults) {
  const resolved = resolveFixtures(submission.picks);
  const score = scoreSubmission(submission, results);
  const final = finalSummary(submission);
  const standings = calculateGroupStandings(submission.picks);
  const groups = groupLetters.map((group) => ({
    group,
    fixtures: resolved.filter((fixture) => fixture.stage === "group" && fixture.group === group),
    table: standings.get(group) ?? [],
  }));
  const knockout = resolved.filter((fixture) => fixture.stage !== "group");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const bracketStages = [
    { id: "round32", label: "Round of 32", matchIds: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87] },
    { id: "round16", label: "Round of 16", matchIds: [89, 90, 93, 94, 91, 92, 95, 96] },
    { id: "quarter", label: "Quarter-finals", matchIds: [97, 98, 99, 100] },
    { id: "semi", label: "Semi-finals", matchIds: [101, 102] },
    { id: "final", label: "Final", matchIds: [104] },
  ];

  const fixtureRows = (fixtures: ResolvedFixture[]) =>
    fixtures
      .map((fixture) => {
        const pick = submission.picks[fixture.id];
        return `
          <tr>
            <td>M${fixture.id}</td>
            <td>${escapeHtml(fixture.round)}</td>
            <td>${escapeHtml(fixture.resolvedTeam1)}</td>
            <td class="score">${escapeHtml(pickScore(pick))}</td>
            <td>${escapeHtml(fixture.resolvedTeam2)}</td>
          </tr>
        `;
      })
      .join("");

  const bracketTree = bracketStages
    .map(
      (stage) => `
        <div class="tree-col tree-${stage.id}">
          <div class="tree-col-title">${escapeHtml(stage.label)}</div>
          <div class="tree-stack">
            ${stage.matchIds
              .map((matchId) => {
                const fixture = resolved.find((item) => item.id === matchId);
                if (!fixture) return "";
                const pick = submission.picks[fixture.id];
                const winner =
                  pick?.winner ||
                  (typeof pick?.home === "number" && typeof pick?.away === "number"
                    ? pick.home > pick.away
                      ? fixture.resolvedTeam1
                      : pick.away > pick.home
                        ? fixture.resolvedTeam2
                        : ""
                    : "");

                return `
                  <article class="tree-match">
                    <div class="tree-meta">M${fixture.id} - ${escapeHtml(fixture.round)}</div>
                    <div class="tree-team ${winner === fixture.resolvedTeam1 ? "tree-winner" : ""}">
                      <span>${escapeHtml(fixture.resolvedTeam1)}</span>
                      <b>${pick?.home === "" ? "?" : escapeHtml(pick?.home)}</b>
                    </div>
                    <div class="tree-team ${winner === fixture.resolvedTeam2 ? "tree-winner" : ""}">
                      <span>${escapeHtml(fixture.resolvedTeam2)}</span>
                      <b>${pick?.away === "" ? "?" : escapeHtml(pick?.away)}</b>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </div>
      `,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(submission.name)} predictions</title>
      <style>
        @page { size: A3 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: #f7f2df;
          background: #020917;
          font-family: Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sheet {
          min-height: 100vh;
          padding: 22px;
          background:
            linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px),
            linear-gradient(135deg, #020917, #061a3b 52%, #020917);
          background-size: 42px 42px, 42px 42px, auto;
        }
        .hero {
          position: relative;
          min-height: 178px;
          overflow: hidden;
          border: 1px solid rgba(153,194,255,.38);
          border-radius: 12px;
          padding: 24px;
          display: grid;
          align-content: end;
        }
        .hero img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: .68;
        }
        .hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(2,9,23,.96), rgba(2,9,23,.62), rgba(2,9,23,.18));
        }
        .hero-content { position: relative; z-index: 1; }
        .brand { color: #f2b84b; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }
        h1 {
          margin: 8px 0 0;
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 58px;
          line-height: .86;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          margin: 14px 0;
        }
        .metric {
          border: 1px solid rgba(153,194,255,.28);
          border-radius: 8px;
          padding: 10px 12px;
          background: rgba(255,255,255,.045);
        }
        .metric span {
          display: block;
          color: #8ea2c7;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .metric b {
          display: block;
          color: #f2b84b;
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 24px;
          line-height: 1;
          margin-top: 4px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .card {
          break-inside: avoid;
          border: 1px solid rgba(153,194,255,.24);
          border-radius: 8px;
          background: rgba(5,18,43,.78);
          overflow: hidden;
        }
        h2 {
          margin: 0;
          padding: 8px 10px;
          color: #f2b84b;
          border-bottom: 1px solid rgba(153,194,255,.18);
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 18px;
          text-transform: uppercase;
        }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th, td {
          padding: 5px 6px;
          border-bottom: 1px solid rgba(153,194,255,.12);
          text-align: left;
          vertical-align: top;
        }
        th { color: #8ea2c7; text-transform: uppercase; font-size: 9px; }
        .score {
          color: #f2b84b;
          font-weight: 900;
          white-space: nowrap;
          text-align: center;
        }
        .page-break { break-before: page; margin-top: 18px; }
        .knockout-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .tree-section {
          min-height: calc(100vh - 44px);
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 12px;
        }
        .tree-heading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 14px;
          border-bottom: 2px solid rgba(242,184,75,.72);
          padding-bottom: 8px;
        }
        .tree-heading h2 {
          border: 0;
          padding: 0;
          font-size: 34px;
          line-height: .9;
        }
        .tree-heading p {
          margin: 0;
          max-width: 430px;
          color: #c7d4ef;
          font-size: 12px;
          font-weight: 800;
          text-align: right;
          text-transform: uppercase;
        }
        .tree {
          display: grid;
          grid-template-columns: 1.15fr 1fr .95fr .9fr .92fr;
          gap: 10px;
          align-items: stretch;
        }
        .tree-col {
          min-width: 0;
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 7px;
        }
        .tree-col-title {
          color: #f2b84b;
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 16px;
          text-transform: uppercase;
          text-align: center;
          border: 1px solid rgba(242,184,75,.28);
          border-radius: 8px;
          padding: 6px 7px;
          background: rgba(242,184,75,.08);
        }
        .tree-stack {
          display: flex;
          flex-direction: column;
          justify-content: space-around;
          gap: 6px;
        }
        .tree-match {
          position: relative;
          border: 1px solid rgba(153,194,255,.24);
          border-radius: 8px;
          background: rgba(5,18,43,.86);
          padding: 6px;
          break-inside: avoid;
        }
        .tree-col:not(:last-child) .tree-match::after {
          content: "";
          position: absolute;
          top: 50%;
          right: -11px;
          width: 10px;
          border-top: 1px solid rgba(242,184,75,.42);
        }
        .tree-col:not(:first-child) .tree-match::before {
          content: "";
          position: absolute;
          top: 50%;
          left: -11px;
          width: 10px;
          border-top: 1px solid rgba(242,184,75,.42);
        }
        .tree-meta {
          color: #8ea2c7;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tree-team {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 22px;
          gap: 5px;
          align-items: center;
          min-height: 20px;
          color: #f7f2df;
          font-size: 10px;
          font-weight: 800;
        }
        .tree-team + .tree-team {
          border-top: 1px solid rgba(153,194,255,.14);
          margin-top: 3px;
          padding-top: 3px;
        }
        .tree-team span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tree-team b {
          color: #c7d4ef;
          text-align: right;
        }
        .tree-winner span,
        .tree-winner b {
          color: #f2b84b;
        }
        .tree-final .tree-match {
          border-color: rgba(242,184,75,.58);
          background: linear-gradient(180deg, rgba(242,184,75,.16), rgba(5,18,43,.9));
        }
        .bonus {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 10px;
        }
        .footer {
          margin-top: 12px;
          color: #8ea2c7;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .08em;
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <section class="hero">
          <img src="${origin}/hero-banner-site.jpg" alt="">
          <div class="hero-content">
            <div class="brand">Sweepstakes News - World Cup 2026</div>
            <h1>${escapeHtml(submission.name)}<br>Predictions</h1>
          </div>
        </section>
        <section class="summary">
          <div class="metric"><span>Champion</span><b>${escapeHtml(final.champion)}</b></div>
          <div class="metric"><span>Runner-up</span><b>${escapeHtml(final.runnerUp)}</b></div>
          <div class="metric"><span>Final score</span><b>${escapeHtml(final.score)}</b></div>
          <div class="metric"><span>Current points</span><b>${score.total}</b></div>
          <div class="metric"><span>Exact scores</span><b>${score.exacts}</b></div>
        </section>
        <section class="grid">
          ${groups
            .map(
              ({ group, fixtures, table }) => `
              <article class="card">
                <h2>Group ${group}</h2>
                <table>
                  <thead><tr><th>#</th><th>Team</th><th>Pts</th><th>GD</th></tr></thead>
                  <tbody>
                    ${table
                      .map(
                        (team) => `
                        <tr>
                          <td>${team.position}</td>
                          <td>${escapeHtml(team.team)}</td>
                          <td>${team.points}</td>
                          <td>${team.gd}</td>
                        </tr>
                      `,
                      )
                      .join("")}
                  </tbody>
                </table>
                <table>
                  <thead><tr><th>Match</th><th>Home</th><th class="score">Pick</th><th>Away</th></tr></thead>
                  <tbody>
                    ${fixtures
                      .map((fixture) => {
                        const pick = submission.picks[fixture.id];
                        return `
                          <tr>
                            <td>M${fixture.id}</td>
                            <td>${escapeHtml(fixture.resolvedTeam1)}</td>
                            <td class="score">${escapeHtml(pickScore(pick))}</td>
                            <td>${escapeHtml(fixture.resolvedTeam2)}</td>
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </article>
            `,
            )
            .join("")}
        </section>
        <section class="page-break">
          <div class="tree-section">
            <div class="tree-heading">
              <h2>Knockout tree</h2>
              <p>Winner paths are resolved from ${escapeHtml(submission.name)}'s group tables and previous knockout picks.</p>
            </div>
            <div class="tree">${bracketTree}</div>
            <div class="footer">Predicted champion: ${escapeHtml(final.champion)} - Final: ${escapeHtml(final.score)}</div>
          </div>
        </section>
        <section class="page-break">
          <div class="grid knockout-grid">
            <article class="card">
              <h2>Knockout predictions</h2>
              <table>
                <thead><tr><th>Match</th><th>Round</th><th>Team</th><th class="score">Pick</th><th>Team</th></tr></thead>
                <tbody>${fixtureRows(knockout)}</tbody>
              </table>
            </article>
            <article class="card">
              <h2>Bonus picks</h2>
              <div class="bonus">
                <div class="metric"><span>Top scorer</span><b>${escapeHtml(submission.bonuses.topScorer)}</b></div>
                <div class="metric"><span>Golden ball</span><b>${escapeHtml(submission.bonuses.goldenBall)}</b></div>
                <div class="metric"><span>Most goals team</span><b>${escapeHtml(submission.bonuses.mostGoalsTeam)}</b></div>
              </div>
            </article>
            <article class="card">
              <h2>Scoring snapshot</h2>
              <div class="bonus">
                <div class="metric"><span>Groups</span><b>${score.groupMatches + score.qualification}</b></div>
                <div class="metric"><span>Knockout</span><b>${score.knockoutMatches + score.placements}</b></div>
                <div class="metric"><span>Bonuses</span><b>${score.bonuses}</b></div>
              </div>
            </article>
          </div>
          <div class="footer">Generated from Sweepstakes News - ${escapeHtml(new Date().toLocaleString())}</div>
        </section>
      </main>
    </body>
  </html>`;
}

function openPredictionPdf(submission: Submission, results: TournamentResults) {
  const frame = document.createElement("iframe");
  frame.title = `${submission.name} predictions PDF`;
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) {
    frame.remove();
    return false;
  }

  frameDocument.open();
  frameDocument.write(buildPredictionPdfHtml(submission, results));
  frameDocument.close();

  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 250);

  return true;
}

function ScoreInputs({
  fixture,
  pick,
  updatePick,
}: {
  fixture: ResolvedFixture;
  pick: MatchPick;
  updatePick: (fixtureId: number, patch: Partial<MatchPick>) => void;
}) {
  const needsWinner =
    fixture.stage !== "group" &&
    typeof pick.home === "number" &&
    typeof pick.away === "number" &&
    pick.home === pick.away;

  return (
    <div className="score-row">
      <label className="score-team-card">
        <TeamLabel team={fixture.resolvedTeam1} />
        <input
          className="score-input home-score"
          aria-label={`${fixture.resolvedTeam1} goals`}
          inputMode="numeric"
          min={0}
          max={15}
          value={pick.home}
          onChange={(event) =>
            updatePick(fixture.id, { home: normalizeNumber(event.target.value) })
          }
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <label className="score-team-card">
        <TeamLabel team={fixture.resolvedTeam2} />
        <input
          className="score-input away-score"
          aria-label={`${fixture.resolvedTeam2} goals`}
          inputMode="numeric"
          min={0}
          max={15}
          value={pick.away}
          onChange={(event) =>
            updatePick(fixture.id, { away: normalizeNumber(event.target.value) })
          }
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      {needsWinner ? (
        <select
          aria-label="Penalty winner"
          value={pick.winner || fixture.resolvedTeam1}
          onChange={(event) => updatePick(fixture.id, { winner: event.target.value })}
        >
          <option value={fixture.resolvedTeam1}>{fixture.resolvedTeam1} on pens</option>
          <option value={fixture.resolvedTeam2}>{fixture.resolvedTeam2} on pens</option>
        </select>
      ) : null}
    </div>
  );
}

function FixtureCard({
  fixture,
  pick,
  updatePick,
}: {
  fixture: ResolvedFixture;
  pick: MatchPick;
  updatePick: (fixtureId: number, patch: Partial<MatchPick>) => void;
}) {
  return (
    <article className="fixture-card">
      <div className="fixture-meta">
        <span className="match-chip">M{fixture.id}</span>
        <span>{formatDate(fixture)}</span>
        <span className="venue-chip">{fixture.venue}</span>
      </div>
      <ScoreInputs fixture={fixture} pick={pick} updatePick={updatePick} />
    </article>
  );
}

function Leaderboard({
  submissions,
  results,
  onSelect,
  ownSubmissionId,
}: {
  submissions: Submission[];
  results: TournamentResults;
  onSelect: (submission: Submission) => void;
  ownSubmissionId?: string | null;
}) {
  const rows = submissions
    .map((submission) => ({
      submission,
      score: scoreSubmission(submission, results),
    }))
    .sort((a, b) => b.score.total - a.score.total || a.submission.name.localeCompare(b.submission.name));

  return (
    <section className="panel leaderboard-panel">
      <div className="section-title">
        <span className="title-icon"><Trophy size={18} /></span>
        <div>
          <span className="eyebrow">Live scoring</span>
          <h2>Standings</h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No confirmed entries yet.</p>
      ) : (
        <div className="leaderboard-list">
          {rows.map((row, index) => (
            <button
              className={`leaderboard-row${row.submission.id === ownSubmissionId ? " own-row" : ""}`}
              key={row.submission.id}
              onClick={() => onSelect(row.submission)}
            >
              <span className={`rank ${index === 0 ? "rank-1" : index === 1 ? "rank-2" : index === 2 ? "rank-3" : "rank-num"}`}>
                {index + 1}
              </span>
              <span>
                <strong>{row.submission.name}</strong>
                <small>
                  {row.submission.id === ownSubmissionId ? "Your entry · " : ""}
                  Groups {row.score.groupMatches + row.score.qualification} · KO {row.score.knockoutMatches + row.score.placements} · Bonus {row.score.bonuses}
                </small>
              </span>
              <b>{row.score.total}</b>
              <Eye size={16} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function MatchDayView({
  fixtures,
  submissions,
  results,
  selectedDate,
  onDateChange,
  ownSubmissionId,
}: {
  fixtures: ResolvedFixture[];
  submissions: Submission[];
  results: TournamentResults;
  selectedDate: string;
  onDateChange: (date: string) => void;
  ownSubmissionId?: string | null;
}) {
  const matchDays = useMemo(
    () =>
      Array.from(
        fixtures.reduce((days, fixture) => {
          const group = days.get(fixture.date) ?? [];
          group.push(fixture);
          days.set(fixture.date, group);
          return days;
        }, new Map<string, ResolvedFixture[]>()),
      ).sort(([dateA], [dateB]) => dateA.localeCompare(dateB)),
    [fixtures],
  );
  const activeDate = selectedDate || matchDays[0]?.[0] || "";
  const activeFixtures = matchDays.find(([date]) => date === activeDate)?.[1] ?? [];

  return (
    <section className="matchday-panel" aria-label="Match day predictions">
      <div className="matchday-topline">
        <div className="section-title">
          <span className="title-icon"><CalendarDays size={18} /></span>
          <div>
            <span className="eyebrow">Match day view</span>
            <h2>Predictions by fixture</h2>
          </div>
        </div>
        <div className="matchday-summary">
          <strong>{activeFixtures.length}</strong>
          <span>fixtures</span>
        </div>
      </div>

      <div className="matchday-strip" aria-label="Choose match date">
        {matchDays.map(([date, dayFixtures]) => {
          const completed = dayFixtures.filter((fixture) => results.matches[fixture.id]).length;
          const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          });
          return (
            <button
              key={date}
              className={date === activeDate ? "active" : ""}
              onClick={() => onDateChange(date)}
            >
              <strong>{dateLabel}</strong>
              <span>
                {dayFixtures.length} match{dayFixtures.length === 1 ? "" : "es"}{completed > 0 ? ` · ${completed} results in` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {submissions.length === 0 ? (
        <p className="muted">No confirmed entries yet.</p>
      ) : (
        <>
          <div className="legend-strip" aria-label="Pick result key">
            <span className="legend-dot exact" aria-hidden="true" />
            <span className="legend-label">Exact score</span>
            <span className="legend-dot direction" aria-hidden="true" />
            <span className="legend-label">Right result</span>
            <span className="legend-dot missed" aria-hidden="true" />
            <span className="legend-label">Missed</span>
            <span className="legend-pts-note">Points shown per pick →</span>
          </div>
          <div className="matchday-fixtures">
            {activeFixtures.map((fixture) => {
              const result = results.matches[fixture.id];
              const rows = submissions
                .map((submission) => {
                  const resolved = resolveFixtures(submission.picks).find((item) => item.id === fixture.id) ?? fixture;
                  return { submission, fixture: resolved, pick: submission.picks[fixture.id] };
                })
                .sort((a, b) => a.submission.name.localeCompare(b.submission.name));

              return (
                <article className="matchday-fixture" key={fixture.id}>
                  <div className="matchday-fixture-head">
                    <div className="fixture-meta">
                      <span className="match-chip">M{fixture.id}</span>
                      <span>{fixture.round}</span>
                      <span className="venue-chip">{fixture.time}</span>
                      <span className={`result-pill${result ? " result-pill-in" : ""}`}>
                        {result ? resultOutcome(result) : "Upcoming"}
                      </span>
                    </div>
                    <div className="match-scoreline">
                      <div className="scoreline-home">
                        <TeamLabel team={result?.team1 ?? fixture.resolvedTeam1} />
                      </div>
                      <div className="scoreline-box">
                        <b>{result != null ? result.home : "·"}</b>
                        <span>—</span>
                        <b>{result != null ? result.away : "·"}</b>
                      </div>
                      <div className="scoreline-away">
                        <TeamLabel team={result?.team2 ?? fixture.resolvedTeam2} />
                      </div>
                    </div>
                  </div>

                  <div className="matchday-picks">
                    {rows.map(({ submission, fixture: resolved, pick }) => {
                      const pickClass = matchPickClass(pick, result);
                      const pts = result ? scoreMatchPick(pick, result, resolved) : null;
                      return (
                        <div
                          className={`matchday-pick${pickClass}${submission.id === ownSubmissionId ? " own-row" : ""}`}
                          key={submission.id}
                        >
                          <span>
                            <strong>{submission.name}</strong>
                            <small>{submission.id === ownSubmissionId ? "Your entry" : pickOutcome(pick)}</small>
                          </span>
                          <span className="matchday-teams">
                            <ScoreTeamLabel team={resolved.resolvedTeam1} goals={pick?.home} />
                            <ScoreTeamLabel team={resolved.resolvedTeam2} goals={pick?.away} />
                          </span>
                          {pts !== null ? (
                            <span className={`pts-badge${pickClass}`} aria-label={`${pts} points`}>
                              +{pts}<small>pts</small>
                            </span>
                          ) : (
                            <span className="pts-badge pts-badge-pending" aria-hidden="true">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function EntryExplorer({
  submissions,
  selectedSubmissionId,
  ownSubmissionId,
  viewTab,
  onSelectSubmission,
  onViewTabChange,
  onExport,
  results,
}: {
  submissions: Submission[];
  selectedSubmissionId: string | null;
  ownSubmissionId?: string | null;
  viewTab: EntryViewTab;
  onSelectSubmission: (submissionId: string) => void;
  onViewTabChange: (view: EntryViewTab) => void;
  onExport: (submission: Submission) => void;
  results: TournamentResults;
}) {
  if (submissions.length === 0) return null;

  const selectedSubmission =
    submissions.find((submission) => submission.id === selectedSubmissionId) ??
    submissions.find((submission) => submission.id === ownSubmissionId) ??
    submissions[0];
  const final = finalSummary(selectedSubmission);
  const score = scoreSubmission(selectedSubmission, results);
  const resolved = resolveFixtures(selectedSubmission.picks);
  const qualified = qualifiedTeams(selectedSubmission.picks);
  const isOwn = selectedSubmission.id === ownSubmissionId;
  const entryTabs: Array<{ id: EntryViewTab; label: string }> = [
    { id: "summary", label: "Summary" },
    { id: "groups", label: "Groups" },
    { id: "bracket", label: "Knockout tree" },
    { id: "picks", label: "All picks" },
  ];

  return (
    <section className="entry-explorer" aria-label="Browse submitted teams">
      <div className="entry-explorer-header">
        <div>
          <span className="eyebrow">Submitted teams</span>
          <h2>Browse everyone&apos;s predictions</h2>
        </div>
        <label className="entry-selector">
          <span>Viewing predictions for</span>
          <select
            value={selectedSubmission.id}
            onChange={(event) => onSelectSubmission(event.target.value)}
          >
            {submissions.map((submission) => (
              <option key={submission.id} value={submission.id}>
                {submission.id === ownSubmissionId ? `${submission.name} (your entry)` : submission.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="entry-viewer">
        <div className="entry-viewer-topline">
          <div>
            <span className="eyebrow">{isOwn ? "Your locked entry" : "Viewing another player's team"}</span>
            <h3>{selectedSubmission.name}</h3>
          </div>
          <div className="entry-viewer-actions">
            {isOwn ? (
              <button className="primary-button compact-btn icon-button" onClick={() => onExport(selectedSubmission)}>
                <Download size={14} />
                Export PDF
              </button>
            ) : null}
          </div>
        </div>

        <div className="entry-view-tabs" role="tablist" aria-label={`${selectedSubmission.name} prediction views`}>
          {entryTabs.map((entryTab) => (
            <button
              key={entryTab.id}
              className={viewTab === entryTab.id ? "active" : ""}
              onClick={() => onViewTabChange(entryTab.id)}
              role="tab"
              aria-selected={viewTab === entryTab.id}
            >
              {entryTab.label}
            </button>
          ))}
        </div>

        {viewTab === "summary" ? (
          <div className="entry-summary-grid">
            <article className="entry-hero-pick">
              <span>Champion</span>
              <strong>{final.champion}</strong>
              <small>{final.runnerUp} runner-up · Final {final.score}</small>
            </article>
            <article className="entry-mini-card">
              <span>Total points</span>
              <strong>{score.total}</strong>
              <small>{score.exacts} exact score{score.exacts !== 1 ? "s" : ""}</small>
            </article>
            <article className="entry-mini-card">
              <span>Groups</span>
              <strong>{score.groupMatches + score.qualification}</strong>
              <small>{score.groupMatches} match pts · {score.qualification} qualification</small>
            </article>
            <article className="entry-mini-card">
              <span>Knockout</span>
              <strong>{score.knockoutMatches + score.placements}</strong>
              <small>{score.knockoutMatches} match pts · {score.placements} progression</small>
            </article>
            <div className="entry-bonus-row">
              <TeamPill>Top scorer · {selectedSubmission.bonuses.topScorer || "TBC"}</TeamPill>
              <TeamPill>Golden ball · {selectedSubmission.bonuses.goldenBall || "TBC"}</TeamPill>
              <TeamPill team={selectedSubmission.bonuses.mostGoalsTeam}>
                Most goals · {selectedSubmission.bonuses.mostGoalsTeam || "TBC"}
              </TeamPill>
            </div>
          </div>
        ) : null}

        {viewTab === "groups" ? (
          <div className="entry-view-section">
            <div className="third-place-strip">
              {qualified.bestThirds.map((team) => (
                <TeamPill key={`${selectedSubmission.id}-${team.group}-${team.team}`} team={team.team}>
                  3{team.group} · {team.team}
                </TeamPill>
              ))}
            </div>
            <GroupTables picks={selectedSubmission.picks} />
          </div>
        ) : null}

        {viewTab === "bracket" ? (
          <div className="entry-view-section entry-bracket-section">
            <Bracket fixtures={resolved} />
          </div>
        ) : null}

        {viewTab === "picks" ? (
          <div className="drawer-list entry-pick-list">
            {resolved.map((fixture) => {
              const pick = selectedSubmission.picks[fixture.id];
              return (
                <div className="drawer-pick" key={fixture.id}>
                  <small>M{fixture.id} · {fixture.round}</small>
                  <TeamLabel team={fixture.resolvedTeam1} />
                  <b>{pick.home === "" ? "?" : pick.home} - {pick.away === "" ? "?" : pick.away}</b>
                  <TeamLabel team={fixture.resolvedTeam2} />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GroupTables({ picks }: { picks: Record<number, MatchPick> }) {
  const standings = calculateGroupStandings(picks);
  return (
    <div className="group-grid">
      {Array.from(standings.entries()).map(([group, table]) => (
        <section className="group-table" key={group}>
          <h3>Group {group}</h3>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Pts</th>
                <th>GD</th>
                <th>GF</th>
              </tr>
            </thead>
            <tbody>
              {table.map((standing) => (
                <tr key={standing.team} className={standing.position <= 2 ? "qualified" : standing.position === 3 ? "third" : ""}>
                  <td><TeamLabel team={standing.team} /></td>
                  <td>{standing.points}</td>
                  <td>{standing.gd}</td>
                  <td>{standing.gf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function GroupTableCard({
  group,
  picks,
}: {
  group: string;
  picks: Record<number, MatchPick>;
}) {
  const standings = calculateGroupStandings(picks).get(group) ?? [];

  return (
    <section className="group-table live-group-table">
      <div className="live-table-heading">
        <span className="eyebrow">Live predicted table</span>
        <h3>Group {group}</h3>
      </div>
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>Pts</th>
            <th>GD</th>
            <th>GF</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing) => (
            <tr
              key={standing.team}
              className={standing.position <= 2 ? "qualified" : standing.position === 3 ? "third" : ""}
            >
              <td>
                <span className="table-position">{standing.position}</span>
                <TeamLabel team={standing.team} />
              </td>
              <td>{standing.points}</td>
              <td>{standing.gd}</td>
              <td>{standing.gf}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mini-note">Top two qualify. Third place stays alive if it lands in the best eight.</p>
    </section>
  );
}

const BRACKET_SLOT_PX = 88;

const BRACKET_ORDER = {
  round32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  round16: [89, 90, 93, 94, 91, 92, 95, 96],
  quarter: [97, 98, 99, 100],
  semi: [101, 102],
  final: [104],
} as const;

const BRACKET_COLS = [
  { stage: "round32" as const, label: "Round of 32" },
  { stage: "round16" as const, label: "Round of 16" },
  { stage: "quarter" as const, label: "Quarter-finals" },
  { stage: "semi" as const, label: "Semi-finals" },
  { stage: "final" as const, label: "Final" },
];

function Bracket({ fixtures: resolved }: { fixtures: ResolvedFixture[] }) {
  const byId = new Map(resolved.map((f) => [f.id, f]));

  return (
    <div className="bk">
      {BRACKET_COLS.map(({ stage, label }, colIdx) => {
        const ids = BRACKET_ORDER[stage] as readonly number[];
        const slotH = Math.pow(2, colIdx) * BRACKET_SLOT_PX;
        const isFinal = stage === "final";

        const pairs: number[][] = [];
        for (let i = 0; i < ids.length; i += 2) {
          pairs.push(isFinal ? [ids[0]] : [ids[i], ids[i + 1]]);
          if (isFinal) break;
        }

        return (
          <div key={stage} className="bk-col">
            <div className="bk-col-label">{label}</div>
            {pairs.map((pair, pIdx) => (
              <div key={pIdx} className={`bk-pair${isFinal ? " bk-final" : ""}`}>
                {pair.map((id) => {
                  const fx = byId.get(id);
                  if (!fx) return null;
                  return (
                    <div key={id} className="bk-slot" style={{ height: slotH }}>
                      <article className="bk-card">
                        <TeamLabel team={fx.resolvedTeam1} />
                        <div className="bk-hr" />
                        <TeamLabel team={fx.resolvedTeam2} />
                      </article>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Review({
  name,
  setName,
  bonuses,
  setBonuses,
  picks,
  onBack,
  onSubmit,
}: {
  name: string;
  setName: (value: string) => void;
  bonuses: BonusPicks;
  setBonuses: (value: BonusPicks) => void;
  picks: Record<number, MatchPick>;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const resolved = resolveFixtures(picks);
  const final = resolved.find((fixture) => fixture.id === 104);
  const finalPick = picks[104];

  return (
    <section className="panel review-panel">
      <div className="section-title">
        <ClipboardCheck size={18} />
        <h2>Review entry</h2>
      </div>
      <div className="review-grid">
        <label>
          Your name
          <input
            className="text-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Juan"
          />
        </label>
        <label>
          Top scorer
          <input
            className="text-input"
            value={bonuses.topScorer}
            onChange={(event) => setBonuses({ ...bonuses, topScorer: event.target.value })}
            placeholder="Player name"
          />
        </label>
        <label>
          Golden ball
          <input
            className="text-input"
            value={bonuses.goldenBall}
            onChange={(event) => setBonuses({ ...bonuses, goldenBall: event.target.value })}
            placeholder="Player name"
          />
        </label>
        <label>
          Most goals by team
          <input
            className="text-input"
            value={bonuses.mostGoalsTeam}
            onChange={(event) => setBonuses({ ...bonuses, mostGoalsTeam: event.target.value })}
            placeholder="Team"
          />
        </label>
      </div>
      <div className="confirmation-strip">
        <CheckCircle2 size={18} />
        <span>{completedMatchCount(picks)} of 104 matches filled</span>
        {final ? (
          <strong>
            Final: {final.resolvedTeam1} {finalPick.home || 0}-{finalPick.away || 0} {final.resolvedTeam2}
          </strong>
        ) : null}
      </div>
      <GroupTables picks={picks} />
      <div className="button-row">
        <button className="secondary-button" onClick={onBack}>Back to edit</button>
        <button
          className="primary-button"
          onClick={onSubmit}
          disabled={!name.trim() || !bonuses.topScorer.trim() || !bonuses.goldenBall.trim() || !bonuses.mostGoalsTeam.trim()}
        >
          Confirm entry
        </button>
      </div>
    </section>
  );
}

function EntrySubmittedPanel({
  submission,
  onLeaderboard,
  onView,
  onExport,
}: {
  submission: Submission;
  onLeaderboard: () => void;
  onView: () => void;
  onExport: () => void;
}) {
  const final = finalSummary(submission);

  return (
    <section className="panel submitted-panel">
      <div className="submitted-lockup">
        <span className="lock-badge"><LockKeyhole size={18} /></span>
        <div>
          <span className="eyebrow">Entry submitted</span>
          <h2>{submission.name}&apos;s team is locked</h2>
          <p>
            The game now switches to the leaderboard and everyone&apos;s predictions.
            Your champion pick is <strong>{final.champion}</strong>, with {final.runnerUp} as runner-up.
          </p>
        </div>
      </div>
      <div className="submitted-actions">
        <button className="primary-button icon-button" onClick={onLeaderboard}>
          <Trophy size={16} />
          Go to leaderboard
        </button>
        <button className="secondary-button icon-button" onClick={onView}>
          <Eye size={16} />
          View my team
        </button>
        <button className="secondary-button icon-button" onClick={onExport}>
          <Download size={16} />
          Export landscape PDF
        </button>
      </div>
    </section>
  );
}

export default function SweepstakesApp() {
  const [tab, setTab] = useState<Tab>("predict");
  const [name, setName] = useState("");
  const [picks, setPicks] = useState<Record<number, MatchPick>>(createEmptyPicks);
  const [bonuses, setBonuses] = useState<BonusPicks>(emptyBonuses);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [results, setResults] = useState<TournamentResults>(blankResults);
  const [reviewing, setReviewing] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [entryViewTab, setEntryViewTab] = useState<EntryViewTab>("summary");
  const [activeStep, setActiveStep] = useState<PredictionStep>("A");
  const [submittedEntryId, setSubmittedEntryId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [resultsSyncing, setResultsSyncing] = useState(false);
  const [resultsStatus, setResultsStatus] = useState("");
  const [selectedMatchDate, setSelectedMatchDate] = useState("");

  const applyResultsPayload = useCallback((payload: ResultsPayload) => {
    const apiResults = payload.results;
    if (!apiResults) return;

    const resultCount = Object.keys(apiResults.matches ?? {}).length;
    if (resultCount) {
      setResults(apiResults);
    }

    if (payload.warning) {
      setResultsStatus(
        resultCount
          ? `Using saved results. Live refresh warning: ${payload.warning}`
          : `Live refresh warning: ${payload.warning}`,
      );
      return;
    }

    if (!resultCount) {
      setResultsStatus("Live results connected. No completed matches yet.");
      return;
    }

    const updatedAt = new Date(apiResults.updatedAt);
    const updatedLabel = Number.isFinite(updatedAt.getTime())
      ? updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "just now";
    setResultsStatus(
      `${resultCount} result${resultCount === 1 ? "" : "s"} loaded ${
        payload.cached ? "from cache" : "fresh"
      }. Updated ${updatedLabel}.`,
    );
  }, []);

  const loadLiveResults = useCallback(
    async (mode: "normal" | "force" | "sample" | "test" = "normal") => {
      const suffix =
        mode === "sample"
          ? "?sample=1"
          : mode === "test"
            ? "?test=1"
            : mode === "force"
              ? "?refresh=1"
              : "";
      setResultsSyncing(true);
      try {
        const response = await fetch(`/api/results/live${suffix}`, { cache: "no-store" });
        const payload = (await response.json()) as ResultsPayload;
        if (!response.ok) {
          throw new Error(payload.warning ?? "Could not refresh live results");
        }
        applyResultsPayload(payload);
        return payload;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not refresh live results";
        setResultsStatus(`Live refresh warning: ${message}`);
        return { warning: message } satisfies ResultsPayload;
      } finally {
        setResultsSyncing(false);
      }
    },
    [applyResultsPayload],
  );

  useEffect(() => {
    queueMicrotask(() => {
      const storedSubmittedEntryId = readLocal<string | null>(localSubmittedEntryKey, null);
      const storedSubmissions = readLocal<Submission[]>(localSubmissionsKey, []);
      const seededSubmissions =
        process.env.NODE_ENV === "development"
          ? createMockSubmissions(storedSubmissions)
          : storedSubmissions;
      setName(readLocal("sweepstakes-news-name", ""));
      setPicks(readLocal("sweepstakes-news-draft", createEmptyPicks()));
      setBonuses(readLocal("sweepstakes-news-bonuses", emptyBonuses()));
      setSubmissions(seededSubmissions);
      setResults(readLocal(localResultsKey, blankResults));
      setSubmittedEntryId(storedSubmittedEntryId);
      if (storedSubmittedEntryId && seededSubmissions.some((submission) => submission.id === storedSubmittedEntryId)) {
        setTab("leaderboard");
      }
      setHydrated(true);
    });

    Promise.all([
      fetch("/api/submissions").then((response) => response.json()),
      fetch("/api/results").then((response) => response.json()),
    ])
      .then(([submissionPayload, resultPayload]) => {
        if (submissionPayload.submissions?.length) {
          setSubmissions((current) => {
            const merged = [...submissionPayload.submissions] as Submission[];
            current.forEach((submission) => {
              if (!merged.some((item) => item.id === submission.id || item.name === submission.name)) {
                merged.push(submission);
              }
            });
            return merged;
          });
        }
        if (resultPayload.results) {
          applyResultsPayload(resultPayload);
        }
      })
      .catch(() => undefined);
  }, [applyResultsPayload]);

  useEffect(() => {
    if (!hydrated || (tab !== "leaderboard" && tab !== "matchday")) return;
    const firstRun = window.setTimeout(() => {
      void loadLiveResults();
    }, 0);
    const poller = window.setInterval(() => {
      void loadLiveResults();
    }, liveResultsPollMs);
    return () => {
      window.clearTimeout(firstRun);
      window.clearInterval(poller);
    };
  }, [hydrated, loadLiveResults, tab]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("sweepstakes-news-name", name);
    window.localStorage.setItem("sweepstakes-news-draft", JSON.stringify(picks));
    window.localStorage.setItem("sweepstakes-news-bonuses", JSON.stringify(bonuses));
  }, [hydrated, name, picks, bonuses]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(localSubmissionsKey, JSON.stringify(submissions));
  }, [hydrated, submissions]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(localResultsKey, JSON.stringify(results));
  }, [hydrated, results]);

  useEffect(() => {
    if (!hydrated) return;
    if (submittedEntryId) {
      window.localStorage.setItem(localSubmittedEntryKey, JSON.stringify(submittedEntryId));
    }
  }, [hydrated, submittedEntryId]);

  const resolvedFixtures = useMemo(() => resolveFixtures(picks), [picks]);
  const ownSubmission = useMemo(
    () =>
      submissions.find((submission) => submission.id === submittedEntryId) ??
      (submittedEntryId ? null : submissions.find((submission) => submission.name === name.trim()) ?? null),
    [name, submissions, submittedEntryId],
  );
  const effectiveSelectedSubmissionId = useMemo(() => {
    if (selectedSubmissionId && submissions.some((submission) => submission.id === selectedSubmissionId)) {
      return selectedSubmissionId;
    }
    return ownSubmission?.id ?? submissions[0]?.id ?? null;
  }, [ownSubmission?.id, selectedSubmissionId, submissions]);
  const hasSubmittedEntry = Boolean(ownSubmission);
  const locked = isLocked();
  const totalFilledMatches = completedMatchCount(picks);
  const allMatchesFilled = totalFilledMatches === 104;
  const canReview = !hasSubmittedEntry && !locked && !!name.trim() && allMatchesFilled;

  function updatePick(fixtureId: number, patch: Partial<MatchPick>) {
    setPicks((current) => ({
      ...current,
      [fixtureId]: { ...current[fixtureId], ...patch },
    }));
  }

  async function submit() {
    const submittedPicks = JSON.parse(JSON.stringify(picks)) as Record<number, MatchPick>;
    const submittedBonuses = { ...bonuses };
    const submission: Submission = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      picks: submittedPicks,
      bonuses: submittedBonuses,
    };
    const next = [submission, ...submissions.filter((item) => item.name !== submission.name)];
    setSubmissions(next);
    setSubmittedEntryId(submission.id);
    setReviewing(false);
    setTab("leaderboard");
    await fetch("/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submission),
    }).catch(() => undefined);
  }

  async function syncSampleResults() {
    const payload = await loadLiveResults("sample");
    setResults(payload.results ?? sampleResults());
  }

  async function syncTestResults() {
    await loadLiveResults("test");
  }

  function exportSubmission(submission: Submission) {
    const opened = openPredictionPdf(submission, results);
    setExportNotice(
      opened
        ? "PDF layout ready. Choose Save as PDF in the print dialog."
        : "Could not prepare the PDF layout. Try again after the page finishes loading.",
    );
  }

  const predictionSteps = useMemo(
    () => [
      ...groupLetters.map((group) => ({
        id: group,
        label: `Group ${group}`,
        short: group,
        kind: "group" as const,
      })),
      ...knockoutPredictionSteps.map((step) => ({
        ...step,
        kind: "knockout" as const,
      })),
    ],
    [],
  );
  const activeStepIndex = predictionSteps.findIndex((step) => step.id === activeStep);
  const activeStepMeta = predictionSteps[activeStepIndex] ?? predictionSteps[0];
  const activeFixtures = useMemo(
    () =>
      resolvedFixtures.filter((fixture) => {
        if (activeStepMeta.kind === "group") {
          return fixture.stage === "group" && fixture.group === activeStepMeta.id;
        }
        if (activeStepMeta.id === "finals") {
          return fixture.stage === "thirdPlace" || fixture.stage === "final";
        }
        return fixture.stage === activeStepMeta.id;
      }),
    [activeStepMeta, resolvedFixtures],
  );
  const activeCompleted = completedInFixtures(activeFixtures, picks);
  const activeProgress = activeFixtures.length
    ? Math.round((activeCompleted / activeFixtures.length) * 100)
    : 0;
  const activeGroupTeams = useMemo(() => {
    if (activeStepMeta.kind !== "group") return [];
    return groupTeams().find((item) => item.group === activeStepMeta.id)?.teams ?? [];
  }, [activeStepMeta]);
  const navItems: Array<{ key: Tab; label: string; icon: ReactNode }> = [
    { key: "predict", label: hasSubmittedEntry ? "My entry" : "Predict matches", icon: <Sparkles size={18} /> },
    { key: "matchday", label: "Match days", icon: <CalendarDays size={18} /> },
    { key: "leaderboard", label: "Leaderboard", icon: <Trophy size={18} /> },
    { key: "rules", label: "Scoring", icon: <CheckCircle2 size={18} /> },
  ];

  const heroData: Record<Tab, { eyebrow: string; h1: string; subtitle: string }> = {
    predict: {
      eyebrow: hasSubmittedEntry ? "Entry locked" : "World Cup 2026 · Sweepstakes",
      h1: hasSubmittedEntry ? "My\nEntry" : "Predict\nMatches",
      subtitle: hasSubmittedEntry
        ? "Your team is in. Track the leaderboard and browse the other calls."
        : "Pick scores for all 104 matches. The bracket builds itself.",
    },
    leaderboard: {
      eyebrow: "Live standings",
      h1: "The\nTable",
      subtitle: "Updated as results come in. Who called it right?",
    },
    matchday: {
      eyebrow: "Fixture room",
      h1: "Match\nDays",
      subtitle: "Compare every prediction for the selected day against live results.",
    },
    rules: {
      eyebrow: "How it works",
      h1: "Scoring\nRules",
      subtitle: "Points for exact scores, results, progression, and bonuses.",
    },
  };
  const activeHero = heroData[tab];

  function moveStep(offset: number) {
    const next = Math.max(0, Math.min(predictionSteps.length - 1, activeStepIndex + offset));
    setActiveStep(predictionSteps[next].id);
  }

  function autofillActiveStep() {
    const filled = autofillTournament(picks);
    const ids = new Set(activeFixtures.map((fixture) => fixture.id));
    setPicks((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(filled).filter(([fixtureId]) => ids.has(Number(fixtureId))),
      ),
    }));
  }

  return (
    <main className="arena-layout">
      <aside className="tournament-rail">
        <div className="rail-brand">
          <span className="rail-crest">SN</span>
          <div>
            <strong>Sweepstakes News</strong>
            <span>World Cup 2026</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Main sections">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? "active" : ""}
              onClick={() => setTab(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-note">
          <span>Entries close</span>
          <strong>Before kick-off · 11 Jun 2026</strong>
        </div>
      </aside>

      <div className="arena-main">
        <section className="hero" key={`hero-${tab}`}>
          <Image
            src="/hero-banner-site.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 900px) calc(100vw - 236px), 100vw"
            className="hero-image"
          />
          <div className="hero-overlay" />
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-content">
            <div className="hero-context">{activeHero.eyebrow}</div>
            <h1>{activeHero.h1}</h1>
            <p>{activeHero.subtitle}</p>
          </div>
        </section>

        <div className="app-shell">
          <div className="main-column">

            {tab === "predict" && (
              ownSubmission ? (
                <EntrySubmittedPanel
                  submission={ownSubmission}
                  onLeaderboard={() => setTab("leaderboard")}
                  onView={() => {
                    setSelectedSubmissionId(ownSubmission.id);
                    setEntryViewTab("summary");
                    setTab("leaderboard");
                  }}
                  onExport={() => exportSubmission(ownSubmission)}
                />
              ) : reviewing ? (
                <Review
                  name={name}
                  setName={setName}
                  bonuses={bonuses}
                  setBonuses={setBonuses}
                  picks={picks}
                  onBack={() => setReviewing(false)}
                  onSubmit={submit}
                />
              ) : (
                <section className="panel" key="predict-panel">
                  {/* Entry gateway */}
                  <div className="entry-gateway">
                    <div className="gateway-right">
                      <input
                        className="gateway-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Your name..."
                        maxLength={40}
                        aria-label="Entry name"
                      />
                      <button
                        className="secondary-button icon-button compact-btn"
                        onClick={autofillActiveStep}
                        title="Auto-fill current section"
                      >
                        <Shuffle size={14} />
                        Auto-fill
                      </button>
                    </div>
                  </div>

                  {/* Journey rail */}
                  <div className="journey-rail" aria-label="Prediction sections">
                    <div className="journey-track">
                      {predictionSteps.filter((step) => step.kind === "group").map((step) => {
                        const stepFixtures = resolvedFixtures.filter(
                          (f) => f.stage === "group" && f.group === step.id,
                        );
                        const done = completedInFixtures(stepFixtures, picks);
                        const complete = done === stepFixtures.length && stepFixtures.length > 0;
                        return (
                          <button
                            key={step.id}
                            className={`journey-stop${activeStep === step.id ? " js-active" : ""}${complete ? " js-done" : ""}`}
                            onClick={() => setActiveStep(step.id)}
                            aria-pressed={activeStep === step.id}
                          >
                            <span className="js-label">{step.short}</span>
                            <span className="js-count">{complete ? "✓" : `${done}/${stepFixtures.length}`}</span>
                          </button>
                        );
                      })}
                      <div className="journey-divider" aria-hidden="true" />
                      {predictionSteps.filter((step) => step.kind === "knockout").map((step) => {
                        const stepFixtures = resolvedFixtures.filter((f) => {
                          if (step.id === "finals") return f.stage === "thirdPlace" || f.stage === "final";
                          return f.stage === step.id;
                        });
                        const done = completedInFixtures(stepFixtures, picks);
                        const complete = done === stepFixtures.length && stepFixtures.length > 0;
                        return (
                          <button
                            key={step.id}
                            className={`journey-stop${activeStep === step.id ? " js-active" : ""}${complete ? " js-done" : ""}`}
                            onClick={() => setActiveStep(step.id)}
                            aria-pressed={activeStep === step.id}
                          >
                            <span className="js-label">{step.short}</span>
                            <span className="js-count">{complete ? "✓" : `${done}/${stepFixtures.length}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active stage header */}
                  <div className="active-stage-block">
                    <div className="active-stage-header">
                      <div className="active-stage-info">
                        <span className="eyebrow">
                          {activeStepMeta.kind === "group" ? "Group stage" : "Knockout picks"}
                        </span>
                        <h3 className="active-stage-title">{activeStepMeta.label}</h3>
                        {activeStepMeta.kind === "group" ? (
                          <div className="active-team-strip">
                            {activeGroupTeams.map((team) => (
                              <TeamPill key={team} team={team}>{team}</TeamPill>
                            ))}
                          </div>
                        ) : (
                          <p style={{ margin: 0, color: "var(--muted)", fontWeight: 800 }}>
                            {activeFixtures.length} fixtures in this round
                          </p>
                        )}
                      </div>
                      <div className="active-stage-counter">
                        <strong>{activeCompleted}</strong>
                        <span>/ {activeFixtures.length} done</span>
                      </div>
                    </div>
                    <div className="section-progress" aria-label={`${activeStepMeta.label} progress`}>
                      <span style={{ width: `${activeProgress}%` }} />
                    </div>
                  </div>

                  {/* Workbench */}
                  <div className="prediction-workbench">
                    <div className="fixtures-grid bite-fixtures">
                      {activeFixtures.map((fixture) => (
                        <FixtureCard
                          key={fixture.id}
                          fixture={fixture}
                          pick={picks[fixture.id]}
                          updatePick={updatePick}
                        />
                      ))}
                    </div>
                    <aside className="live-rankings-card">
                      {activeStepMeta.kind === "group" ? (
                        <GroupTableCard group={activeStepMeta.id} picks={picks} />
                      ) : (
                        <div className="knockout-helper">
                          <span className="eyebrow">Resolved from your picks</span>
                          <h3>{activeStepMeta.label}</h3>
                          <p>
                            Teams are fed by your group tables and earlier knockout winners.
                            Change a group score and this round updates automatically.
                          </p>
                          <div className="knockout-preview">
                            {activeFixtures.map((fixture) => (
                              <article className="bracket-match" key={fixture.id}>
                                <small>M{fixture.id} · {fixture.venue}</small>
                                <TeamLabel team={fixture.resolvedTeam1} />
                                <TeamLabel team={fixture.resolvedTeam2} />
                              </article>
                            ))}
                          </div>
                        </div>
                      )}
                    </aside>
                  </div>

                  {/* Footer nav bar */}
                  <div className="predict-footer">
                    <button
                      className="footer-nav-btn"
                      onClick={() => moveStep(-1)}
                      disabled={activeStepIndex === 0}
                    >
                      <ChevronLeft size={15} /> Prev
                    </button>
                    <div className="footer-util">
                      <button
                        className="secondary-button icon-button compact-btn"
                        onClick={() => setPicks(autofillTournament(picks))}
                      >
                        <Shuffle size={14} /> Fill all
                      </button>
                      <button className="ghost-btn" onClick={() => setPicks(createEmptyPicks())}>
                        Reset
                      </button>
                    </div>
                    {activeStepIndex === predictionSteps.length - 1 ? (
                      canReview ? (
                        <button
                          className="primary-button footer-cta"
                          onClick={() => setReviewing(true)}
                        >
                          Review & confirm <ChevronRight size={15} />
                        </button>
                      ) : !locked ? (
                        <span className="footer-cta-hint">
                          {!name.trim()
                            ? "Add your name above to continue"
                            : `${104 - totalFilledMatches} match${104 - totalFilledMatches === 1 ? "" : "es"} left`}
                        </span>
                      ) : null
                    ) : (
                      <button
                        className="primary-button footer-cta"
                        onClick={() => moveStep(1)}
                      >
                        Next <ChevronRight size={15} />
                      </button>
                    )}
                  </div>
                </section>
              )
            )}

            {tab === "matchday" && (
              <div key="matchday-panel" style={{ display: "grid", gap: "1.4rem" }}>
                <div className="leaderboard-toolbar">
                  <div className="post-submit-note">
                    <CalendarDays size={16} />
                    <span>Live result checks run while this view is open.</span>
                  </div>
                  <button className="secondary-button icon-button compact-btn" onClick={() => loadLiveResults("force")}>
                    <RefreshCw size={14} />
                    Refresh live
                  </button>
                  <button className="secondary-button icon-button compact-btn" onClick={syncTestResults}>
                    <Sparkles size={14} />
                    Test live feed
                  </button>
                </div>
                {resultsStatus ? (
                  <p className="export-notice">
                    {resultsSyncing ? "Refreshing live results..." : resultsStatus}
                  </p>
                ) : null}
                <MatchDayView
                  fixtures={resolvedFixtures}
                  submissions={submissions}
                  results={results}
                  selectedDate={selectedMatchDate}
                  onDateChange={setSelectedMatchDate}
                  ownSubmissionId={ownSubmission?.id ?? submittedEntryId}
                />
              </div>
            )}

            {tab === "leaderboard" && (
              <div key="lb-panel" style={{ display: "grid", gap: "1.4rem" }}>
                <div className="leaderboard-toolbar">
                  {ownSubmission ? (
                    <div className="post-submit-note">
                      <CheckCircle2 size={16} />
                      <span>Your entry is locked. The leaderboard is now your home base.</span>
                    </div>
                  ) : <span />}
                  {ownSubmission ? (
                    <button className="primary-button icon-button compact-btn" onClick={() => exportSubmission(ownSubmission)}>
                      <Download size={14} />
                      Export my PDF
                    </button>
                  ) : null}
	                  <button className="secondary-button icon-button compact-btn" onClick={syncSampleResults}>
	                    <RefreshCw size={14} />
	                    Sample results
	                  </button>
	                  <button className="secondary-button icon-button compact-btn" onClick={syncTestResults}>
	                    <Sparkles size={14} />
	                    Test live feed
	                  </button>
	                </div>
	                {resultsStatus ? (
	                  <p className="export-notice">
	                    {resultsSyncing ? "Refreshing live results..." : resultsStatus}
	                  </p>
	                ) : null}
	                {exportNotice ? <p className="export-notice">{exportNotice}</p> : null}
                <Leaderboard
                  submissions={submissions}
                  results={results}
                  onSelect={(submission) => {
                    setSelectedSubmissionId(submission.id);
                    setEntryViewTab("summary");
                  }}
                  ownSubmissionId={ownSubmission?.id ?? submittedEntryId}
                />
                <EntryExplorer
                  submissions={submissions}
                  selectedSubmissionId={effectiveSelectedSubmissionId}
                  ownSubmissionId={ownSubmission?.id ?? submittedEntryId}
                  viewTab={entryViewTab}
                  onSelectSubmission={(submissionId) => {
                    setSelectedSubmissionId(submissionId);
                    setEntryViewTab("summary");
                  }}
                  onViewTabChange={setEntryViewTab}
                  onExport={exportSubmission}
                  results={results}
                />
              </div>
            )}

            {tab === "rules" && (
              <section className="panel" key="rules-panel">
                <div className="section-title">
                  <span className="title-icon"><CheckCircle2 size={18} /></span>
                  <div>
                    <span className="eyebrow">Spreadsheet DNA</span>
                    <h2>Scoring</h2>
                  </div>
                </div>
                <div className="rules-sections">
                  <div className="rules-section">
                    <div className="rules-section-title">Group stage</div>
                    <div className="rules-row"><span>Correct result (W / D / L)</span><b>+{scoringRules.groupResult}</b></div>
                    <div className="rules-row"><span>Exact home goals</span><b>+{scoringRules.groupTeamGoals}</b></div>
                    <div className="rules-row"><span>Exact away goals</span><b>+{scoringRules.groupTeamGoals}</b></div>
                    <div className="rules-row"><span>Exact goal difference</span><b>+{scoringRules.groupGoalDifferencePerTeam * 2}</b></div>
                    <div className="rules-row"><span>Exact score bonus</span><b>+{scoringRules.groupExactBonus}</b></div>
                    <div className="rules-row rules-row-max"><span>Max per match</span><b>{scoringRules.groupResult + scoringRules.groupTeamGoals * 2 + scoringRules.groupGoalDifferencePerTeam * 2 + scoringRules.groupExactBonus}</b></div>
                  </div>
                  <div className="rules-section">
                    <div className="rules-section-title">Knockout stage</div>
                    <div className="rules-row"><span>Correct winner</span><b>+{scoringRules.knockoutWinner}</b></div>
                    <div className="rules-row"><span>Exact home goals</span><b>+{scoringRules.knockoutTeamGoals}</b></div>
                    <div className="rules-row"><span>Exact away goals</span><b>+{scoringRules.knockoutTeamGoals}</b></div>
                    <div className="rules-row"><span>Exact goal difference</span><b>+{scoringRules.knockoutGoalDifference}</b></div>
                    <div className="rules-row"><span>Exact score bonus</span><b>+{scoringRules.knockoutExactBonus}</b></div>
                    <div className="rules-row rules-row-max"><span>Max per match</span><b>{scoringRules.knockoutWinner + scoringRules.knockoutTeamGoals * 2 + scoringRules.knockoutGoalDifference + scoringRules.knockoutExactBonus}</b></div>
                  </div>
                  <div className="rules-section">
                    <div className="rules-section-title">Qualification</div>
                    <div className="rules-row"><span>Round-of-32 team correct</span><b>+{scoringRules.round32Qualification}</b></div>
                    <div className="rules-row"><span>Exact group finish position</span><b>+{scoringRules.exactGroupPosition}</b></div>
                    <div className="rules-row"><span>One-place miss</span><b>+{scoringRules.nearGroupPosition}</b></div>
                  </div>
                  <div className="rules-section">
                    <div className="rules-section-title">Deep run bonuses</div>
                    <div className="rules-row"><span>Quarter-finalist</span><b>+{scoringRules.quarterFinalist}</b></div>
                    <div className="rules-row"><span>Semi-finalist</span><b>+{scoringRules.semiFinalist}</b></div>
                    <div className="rules-row"><span>Finalist</span><b>+{scoringRules.finalist}</b></div>
                    <div className="rules-row"><span>Champion</span><b>+{scoringRules.champion}</b></div>
                    <div className="rules-row"><span>Runner-up</span><b>+{scoringRules.runnerUp}</b></div>
                  </div>
                  <div className="rules-section">
                    <div className="rules-section-title">Bonus picks</div>
                    <div className="rules-row"><span>Top scorer</span><b>+{scoringRules.topScorer}</b></div>
                    <div className="rules-row"><span>Golden ball</span><b>+{scoringRules.goldenBall}</b></div>
                    <div className="rules-row"><span>Most goals (team)</span><b>+{scoringRules.mostGoalsTeam}</b></div>
                  </div>
                </div>
                <div className="source-note">
                  Fixture seed: openfootball/worldcup.json. Format: FIFA 48-team rules. Results: Vercel cron route accepts API-Football or any JSON feed shaped like match results.
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}
