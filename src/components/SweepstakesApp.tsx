"use client";

import {
  CalendarDays,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleQuestionMark,
  ClipboardCheck,
  Download,
  Eye,
  ImageDown,
  LockKeyhole,
  Medal,
  Menu,
  Shuffle,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import GoalsAssists from "@/components/GoalsAssists";
import PredictionInsights from "@/components/PredictionInsights";
import { fixtureKickoffDate } from "@/lib/fixture-time";
import {
  avatarForName,
  fallbackColorForName,
  initialsForName,
} from "@/lib/avatars";
import {
  autofillTournament,
  calculateGroupStandings,
  createEmptyPicks,
  displayMatchNumber,
  emptyBonuses,
  FIRST_KICK_OFF_ISO,
  groupTeams,
  qualifiedTeams,
  resolveFixtures,
  scoreSubmission,
  scoringRules,
} from "@/lib/tournament";
import type {
  BonusPicks,
  MatchPick,
  ResolvedFixture,
  Submission,
  Tournament,
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

type Tab = "predict" | "matchday" | "leaderboard" | "rules" | "titlerace" | "goals" | "insights";
type EntryViewTab = "summary" | "groups" | "bracket";
type PredictionStep = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "round32" | "round16" | "quarter" | "semi" | "thirdPlace" | "final";
type ResultsPayload = {
  mode?: string;
  cached?: boolean;
  stale?: boolean;
  warning?: string;
  results?: TournamentResults;
};
type SubmissionsPayload = {
  mode?: string;
  submissions?: Submission[];
};
type SweepstakesAppProps = {
  tournament?: Tournament;
};

const defaultTournament: Tournament = {
  id: "sweepstakes-news",
  slug: "sweepstakes-news",
  name: "Sweepstakes News",
  creatorName: null,
  createdAt: new Date(0).toISOString(),
};

const matchDayLocale = "en-GB";
const matchDayTimeZone = "Europe/London";
const groupLetters = "ABCDEFGHIJKL".split("") as PredictionStep[];
const knockoutPredictionSteps: Array<{ id: PredictionStep; label: string; short: string }> = [
  { id: "round32", label: "Round of 32", short: "R32" },
  { id: "round16", label: "Round of 16", short: "R16" },
  { id: "quarter", label: "Quarter-finals", short: "QF" },
  { id: "semi", label: "Semi-finals", short: "SF" },
  { id: "thirdPlace", label: "Third Place Match", short: "3rd" },
  { id: "final", label: "Final", short: "Final" },
];

const teamFlagCodes: Record<string, string> = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  "Bosnia & Herzegovina": "ba",
  Brazil: "br",
  Canada: "ca",
  "Cape Verde": "cv",
  Colombia: "co",
  Croatia: "hr",
  Curaçao: "cw",
  "Czech Republic": "cz",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Haiti: "ht",
  Iran: "ir",
  Iraq: "iq",
  "Ivory Coast": "ci",
  Japan: "jp",
  Jordan: "jo",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Portugal: "pt",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Turkey: "tr",
  USA: "us",
  Uruguay: "uy",
  Uzbekistan: "uz",
};

function isLocked() {
  return Date.now() >= new Date(FIRST_KICK_OFF_ISO).getTime();
}

function formatFixtureDate(fixture: Pick<ResolvedFixture, "date" | "time">) {
  return (fixtureKickoffDate(fixture) ?? new Date(`${fixture.date}T12:00:00Z`)).toLocaleDateString(
    matchDayLocale,
    {
      month: "short",
      day: "numeric",
      timeZone: matchDayTimeZone,
    },
  );
}

function formatFixtureTime(fixture: Pick<ResolvedFixture, "date" | "time">) {
  const kickoff = fixtureKickoffDate(fixture);
  if (!kickoff) return fixture.time;
  const time = kickoff.toLocaleTimeString(matchDayLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: matchDayTimeZone,
  });
  const zone = Intl.DateTimeFormat(matchDayLocale, {
    timeZone: matchDayTimeZone,
    timeZoneName: "short",
  })
    .formatToParts(kickoff)
    .find((part) => part.type === "timeZoneName")?.value;
  const venueTime = fixture.time.match(/^(\d{1,2}:\d{2}) UTC[+-]\d{1,2}$/)?.[1];
  const viewerTime = zone ? `${time} ${zone}` : time;
  return venueTime ? `${viewerTime} (${venueTime} local)` : viewerTime;
}

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat(matchDayLocale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: matchDayTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function defaultMatchDate(fixtures: Array<Pick<ResolvedFixture, "date">>, now = new Date()) {
  const matchDates = Array.from(new Set(fixtures.map((fixture) => fixture.date))).sort();
  const today = localDateKey(now);
  return (
    matchDates.find((date) => date === today) ??
    matchDates.find((date) => date > today) ??
    matchDates.at(-1) ??
    ""
  );
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

function flagUrlFor(team: string) {
  const code = teamFlagCodes[team];
  return code ? `https://flagcdn.com/w40/${code}.png` : "";
}

function TeamFlag({ team }: { team: string }) {
  const flag = flagUrlFor(team);
  return flag ? (
    <span className="flag" aria-hidden="true" style={{ backgroundImage: `url(${flag})` }} />
  ) : null;
}

const teamAbbrOverrides: Record<string, string> = {
  "Bosnia & Herzegovina": "BIH",
  "Cape Verde": "CPV",
  "Czech Republic": "CZE",
  "DR Congo": "COD",
  "Ivory Coast": "CIV",
  "New Zealand": "NZL",
  "Saudi Arabia": "KSA",
  "South Africa": "RSA",
  "South Korea": "KOR",
  Iran: "IRN",
  Iraq: "IRQ",
  Netherlands: "NED",
  Switzerland: "SUI",
  "Curaçao": "CUW",
};

function teamAbbreviation(team: string): string {
  if (teamAbbrOverrides[team]) return teamAbbrOverrides[team];
  const words = team.replace(/&/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 3).toUpperCase();
}

function TeamLabel({ team }: { team: string }) {
  return (
    <span className="team-label">
      <TeamFlag team={team} />
      <span>{team}</span>
    </span>
  );
}

function TeamLabelAbbr({ team }: { team: string }) {
  return (
    <span className="team-label">
      <TeamFlag team={team} />
      <span>{teamAbbreviation(team)}</span>
    </span>
  );
}

function TeamLabelResponsive({ team }: { team: string }) {
  return (
    <span className="team-label">
      <TeamFlag team={team} />
      <span className="team-name-full">{team}</span>
      <span className="team-name-abbr">{teamAbbreviation(team)}</span>
    </span>
  );
}

function TeamPill({ children, team }: { children: React.ReactNode; team?: string }) {
  return (
    <span className="team-pill">
      {team ? <TeamFlag team={team} /> : null}
      {children}
    </span>
  );
}

function scoreComplete(pick?: MatchPick) {
  return typeof pick?.home === "number" && typeof pick.away === "number";
}

function penaltyWinnerSelected(fixture: ResolvedFixture, pick?: MatchPick) {
  return (
    fixture.stage === "group" ||
    !pick ||
    typeof pick.home !== "number" ||
    typeof pick.away !== "number" ||
    pick.home !== pick.away ||
    pick.winner === fixture.resolvedTeam1 ||
    pick.winner === fixture.resolvedTeam2
  );
}

function matchPickComplete(fixture: ResolvedFixture, pick?: MatchPick) {
  return scoreComplete(pick) && penaltyWinnerSelected(fixture, pick);
}

function completedInFixtures(fixtures: ResolvedFixture[], picks: Record<number, MatchPick>) {
  return fixtures.filter((fixture) => matchPickComplete(fixture, picks[fixture.id])).length;
}

function completedRequiredPickCount(fixtures: ResolvedFixture[], picks: Record<number, MatchPick>) {
  return fixtures.filter((fixture) => matchPickComplete(fixture, picks[fixture.id])).length;
}

function incompleteRequiredPickCount(fixtures: ResolvedFixture[], picks: Record<number, MatchPick>) {
  return fixtures.length - completedRequiredPickCount(fixtures, picks);
}

function missingPenaltyWinnerCount(fixtures: ResolvedFixture[], picks: Record<number, MatchPick>) {
  return fixtures.filter((fixture) => {
    const pick = picks[fixture.id];
    return scoreComplete(pick) && !penaltyWinnerSelected(fixture, pick);
  }).length;
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

function knockoutPickLabel(pick?: MatchPick) {
  const score = pickScore(pick);
  if (!pick || pick.home === "" || pick.away === "") return score;
  if (pick.home !== pick.away) return score;
  return `${score} (${pick.winner ? `${pick.winner} pens` : "penalty winner needed"})`;
}

function predictedWinner(fixture: ResolvedFixture, pick?: MatchPick) {
  if (!pick || typeof pick.home !== "number" || typeof pick.away !== "number") return "";
  if (pick.home > pick.away) return fixture.resolvedTeam1;
  if (pick.away > pick.home) return fixture.resolvedTeam2;
  return pick.winner || fixture.resolvedTeam1;
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
  if (result.status === "live") {
    const phase = result.phase ? ` ${result.phase}` : "";
    const minute = typeof result.matchMinute === "number" ? ` · min ${result.matchMinute}` : "";
    return `Live${phase}${minute}`;
  }
  if (result.status === "scheduled") return "Scheduled";
  if (result.winner) return `${result.winner} won`;
  if (result.home > result.away) return "Home win";
  if (result.away > result.home) return "Away win";
  return "Draw";
}

function friendlyResultsWarning(message: string) {
  if (message.includes("Results provider returned no scored matches")) {
    return "No official scores available yet. Live scoring will update once matches begin.";
  }
  if (message.includes("returned 429")) {
    return "The official results provider is rate-limiting requests. Saved scores are still available.";
  }
  return message;
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

type BreakdownLine = { label: string; pts: number };

function scoreMatchPickBreakdown(
  pick: MatchPick | undefined,
  result: TournamentResults["matches"][number] | undefined,
  fixture: ResolvedFixture,
): { total: number; lines: BreakdownLine[] } {
  const lines: BreakdownLine[] = [];
  if (!pick || !result || typeof pick.home !== "number" || typeof pick.away !== "number") {
    return { total: 0, lines };
  }
  const pH = Number(pick.home);
  const pA = Number(pick.away);
  if (fixture.stage === "group") {
    if (Math.sign(pH - pA) === Math.sign(result.home - result.away))
      lines.push({ label: "Correct result", pts: scoringRules.groupResult });
    if (pH === result.home)
      lines.push({ label: `${fixture.resolvedTeam1} goals`, pts: scoringRules.groupTeamGoals });
    if (pA === result.away)
      lines.push({ label: `${fixture.resolvedTeam2} goals`, pts: scoringRules.groupTeamGoals });
    if (pH - pA === result.home - result.away)
      lines.push({ label: "Goal difference", pts: scoringRules.groupGoalDifferencePerTeam * 2 });
    if (pH === result.home && pA === result.away)
      lines.push({ label: "Exact score", pts: scoringRules.groupExactBonus });
  } else {
    const pickWinner =
      pH > pA ? fixture.resolvedTeam1 :
      pA > pH ? fixture.resolvedTeam2 :
      (pick.winner ?? fixture.resolvedTeam1);
    if (result.winner && pickWinner === result.winner)
      lines.push({ label: "Correct winner", pts: scoringRules.knockoutWinner });
    if (pH === result.home)
      lines.push({ label: `${fixture.resolvedTeam1} goals`, pts: scoringRules.knockoutTeamGoals });
    if (pA === result.away)
      lines.push({ label: `${fixture.resolvedTeam2} goals`, pts: scoringRules.knockoutTeamGoals });
    if (pH - pA === result.home - result.away)
      lines.push({ label: "Goal difference", pts: scoringRules.knockoutGoalDifference });
    if (pH === result.home && pA === result.away)
      lines.push({ label: "Exact score", pts: scoringRules.knockoutExactBonus });
  }
  return { total: lines.reduce((sum, l) => sum + l.pts, 0), lines };
}

function PtsBadge({
  pick,
  result,
  fixture,
  pickClass,
}: {
  pick: MatchPick | undefined;
  result: TournamentResults["matches"][number] | undefined;
  fixture: ResolvedFixture;
  pickClass: string;
}) {
  const [visible, setVisible] = useState(false);
  const { total, lines } = scoreMatchPickBreakdown(pick, result, fixture);
  return (
    <span
      className={`pts-badge${pickClass}${lines.length > 0 ? " pts-badge-interactive" : ""}`}
      aria-label={`${total} points`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      +{total}<small>pts</small>
      {visible && lines.length > 0 && (
        <span className="pts-tooltip" role="tooltip">
          {lines.map((line) => (
            <span key={line.label} className="pts-tooltip-row">
              <span>{line.label}</span>
              <b>+{line.pts}</b>
            </span>
          ))}
        </span>
      )}
    </span>
  );
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

function buildPredictionPdfHtml(
  submission: Submission,
  results: TournamentResults,
  options: { brandName: string; heroImage: string },
) {
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
            <td>Match ${displayMatchNumber(fixture)}</td>
            <td>${escapeHtml(fixture.round)}</td>
            <td>${escapeHtml(fixture.resolvedTeam1)}</td>
            <td class="score">${escapeHtml(fixture.stage === "group" ? pickScore(pick) : knockoutPickLabel(pick))}</td>
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
                const winner = predictedWinner(fixture, pick);

                return `
                  <article class="tree-match">
                    <div class="tree-meta">Match ${displayMatchNumber(fixture)} - ${escapeHtml(fixture.round)} - ${escapeHtml(knockoutPickLabel(pick))}</div>
                    <div class="tree-team ${winner === fixture.resolvedTeam1 ? "tree-winner" : ""}">
                      <span>${escapeHtml(fixture.resolvedTeam1)}</span>
                      <b>${pick?.home === "" || pick?.home === undefined ? "?" : escapeHtml(pick.home)}</b>
                    </div>
                    <div class="tree-team ${winner === fixture.resolvedTeam2 ? "tree-winner" : ""}">
                      <span>${escapeHtml(fixture.resolvedTeam2)}</span>
                      <b>${pick?.away === "" || pick?.away === undefined ? "?" : escapeHtml(pick.away)}</b>
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
        @page { size: A3 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: #111111;
          background: #f5efe0;
          font-family: Georgia, serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sheet {
          min-height: 100vh;
          padding: 18px;
          background:
            linear-gradient(rgba(0,0,0,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,.018) 1px, transparent 1px),
            #f5efe0;
          background-size: 18px 18px, 18px 18px, auto;
        }
        .hero {
          position: relative;
          min-height: 198px;
          overflow: hidden;
          border-top: 5px solid #c8001e;
          border-bottom: 3px solid #c8001e;
          padding: 18px 20px 20px;
          display: grid;
          align-content: space-between;
          background: #0d0d0d;
          box-shadow: 0 8px 34px rgba(0,0,0,.18);
        }
        .hero-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: .56;
          object-position: center 30%;
        }
        .hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(0,0,0,.97), rgba(0,0,0,.76) 45%, rgba(0,0,0,.28)),
            linear-gradient(0deg, rgba(0,0,0,.64), transparent 58%);
        }
        .hero-content {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 390px;
          gap: 20px;
          align-items: end;
        }
        .masthead {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #f5efe0;
          text-transform: uppercase;
        }
        .masthead img {
          width: 42px;
          height: 42px;
          object-fit: contain;
          filter: drop-shadow(0 8px 16px rgba(0,0,0,.44));
        }
        .brand {
          display: block;
          color: #ffffff;
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 18px;
          font-weight: 900;
          line-height: .92;
          letter-spacing: 0;
        }
        .edition {
          display: block;
          margin-top: 3px;
          color: #ff3a3a;
          font-family: Arial, sans-serif;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .16em;
        }
        h1 {
          margin: 10px 0 0;
          color: #ffffff;
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 64px;
          line-height: .82;
          text-transform: uppercase;
          letter-spacing: 0;
          text-shadow: 0 4px 28px rgba(0,0,0,.64);
        }
        .pdf-quote {
          margin: 0;
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          padding: 10px 0 10px 12px;
          border-left: 4px solid #ff3a3a;
          color: rgba(255,255,255,.88);
          font-size: 10px;
          font-weight: 800;
          font-style: italic;
          line-height: 1.38;
          text-shadow: 0 3px 16px rgba(0,0,0,.7);
        }
        .pdf-quote img {
          width: 58px;
          height: 58px;
          object-fit: cover;
          object-position: center top;
          border: 2px solid rgba(255,255,255,.72);
          box-shadow: 0 6px 18px rgba(0,0,0,.35);
        }
        .pdf-quote span,
        .pdf-quote cite {
          display: block;
        }
        .pdf-quote span + span {
          margin-top: 4px;
        }
        .pdf-quote cite {
          margin-top: 7px;
          color: #ff3a3a;
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 9px;
          font-style: normal;
          text-transform: uppercase;
          letter-spacing: .08em;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin: 12px 0;
        }
        .metric {
          border: 1px solid rgba(0,0,0,.2);
          border-top: 3px solid #c8001e;
          padding: 9px 10px;
          background: #fffdf9;
          box-shadow: 0 2px 9px rgba(0,0,0,.07);
        }
        .metric span {
          display: block;
          color: #777777;
          font-family: Arial, sans-serif;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .08em;
        }
        .metric b {
          display: block;
          color: #111111;
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
          border: 1px solid rgba(0,0,0,.2);
          background: #fefcf5;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,.07);
        }
        h2 {
          margin: 0;
          padding: 8px 10px;
          color: #f5efe0;
          background: #111111;
          border-bottom: 3px solid #c8001e;
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 18px;
          text-transform: uppercase;
        }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th, td {
          padding: 5px 6px;
          border-bottom: 1px solid rgba(0,0,0,.1);
          text-align: left;
          vertical-align: top;
        }
        th {
          color: #f5efe0;
          background: #111111;
          font-family: Arial, sans-serif;
          text-transform: uppercase;
          font-size: 8px;
          letter-spacing: .05em;
        }
        tr:nth-child(even) td {
          background: rgba(0,0,0,.025);
        }
        .score {
          color: #c8001e;
          font-family: Impact, Arial Narrow, sans-serif;
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
          border-bottom: 4px solid #111111;
          padding-bottom: 8px;
        }
        .tree-heading h2 {
          border: 0;
          background: transparent;
          color: #111111;
          padding: 0;
          font-size: 34px;
          line-height: .9;
        }
        .tree-heading p {
          margin: 0;
          max-width: 430px;
          color: #444444;
          font-family: Arial, sans-serif;
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
          color: #c8001e;
          font-family: Impact, Arial Narrow, sans-serif;
          font-size: 16px;
          text-transform: uppercase;
          text-align: center;
          border: 1px solid rgba(200,0,30,.35);
          border-top: 3px solid #c8001e;
          padding: 6px 7px;
          background: #fffdf9;
        }
        .tree-stack {
          display: flex;
          flex-direction: column;
          justify-content: space-around;
          gap: 6px;
        }
        .tree-match {
          position: relative;
          border: 1px solid rgba(0,0,0,.2);
          background: #fefcf5;
          padding: 6px;
          break-inside: avoid;
        }
        .tree-col:not(:last-child) .tree-match::after {
          content: "";
          position: absolute;
          top: 50%;
          right: -11px;
          width: 10px;
          border-top: 1px solid rgba(200,0,30,.42);
        }
        .tree-col:not(:first-child) .tree-match::before {
          content: "";
          position: absolute;
          top: 50%;
          left: -11px;
          width: 10px;
          border-top: 1px solid rgba(200,0,30,.42);
        }
        .tree-meta {
          color: #777777;
          font-family: Arial, sans-serif;
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
          color: #111111;
          font-size: 10px;
          font-weight: 800;
        }
        .tree-team + .tree-team {
          border-top: 1px solid rgba(0,0,0,.12);
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
          color: #444444;
          text-align: right;
        }
        .tree-winner span,
        .tree-winner b {
          color: #1a7a1a;
          font-weight: 900;
        }
        .tree-final .tree-match {
          border-color: rgba(200,0,30,.58);
          border-width: 2px;
          background: rgba(200,0,30,.08);
        }
        .bonus {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 10px;
        }
        .footer {
          margin-top: 12px;
          color: #777777;
          font-family: Arial, sans-serif;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .08em;
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <section class="hero">
          <img class="hero-bg" src="${origin}${options.heroImage}" alt="">
          <div class="masthead">
            <img src="${origin}/football-logo.png" alt="">
            <div>
              <span class="brand">${escapeHtml(options.brandName)}</span>
              <span class="edition">World Cup 2026</span>
            </div>
          </div>
          <div class="hero-content">
            <div>
              <h1>${escapeHtml(submission.name)}<br>Predictions</h1>
            </div>
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
                            <td>Match ${displayMatchNumber(fixture)}</td>
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
          <div class="footer">Generated from ${escapeHtml(options.brandName)} - ${escapeHtml(new Date().toLocaleString())}</div>
        </section>
      </main>
    </body>
  </html>`;
}

function exportLeaderboardPng(
  submissions: Submission[],
  results: TournamentResults,
  brandName: string,
) {
  if (typeof document === "undefined" || submissions.length === 0) return false;

  const rows = submissions
    .map((submission) => ({
      submission,
      score: scoreSubmission(submission, results),
      champion: finalSummary(submission).champion,
    }))
    .sort(
      (a, b) =>
        b.score.total - a.score.total || a.submission.name.localeCompare(b.submission.name),
    );

  const scale = 2;
  const width = 720;
  const margin = 26;
  const headerH = 118;
  const rowH = 54;
  const footerH = 48;
  const height = headerH + rows.length * rowH + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.scale(scale, scale);

  const display = "Impact, 'Arial Narrow', sans-serif";
  const body = "Georgia, serif";
  const sans = "Arial, sans-serif";

  ctx.fillStyle = "#F5EFE0";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0D0D0D";
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "#C8001E";
  ctx.fillRect(0, 0, width, 5);

  ctx.fillStyle = "#FF3A3A";
  ctx.font = `bold 11px ${sans}`;
  ctx.fillText(`${brandName.toUpperCase()} · WORLD CUP 2026`, margin, 38);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `48px ${display}`;
  ctx.fillText("THE STANDINGS", margin, 88);

  const updatedAt = new Date(results.updatedAt);
  const updatedLabel =
    Number.isFinite(updatedAt.getTime()) && updatedAt.getTime() > 0
      ? `Updated ${updatedAt.toLocaleDateString([], { month: "short", day: "numeric" })} · ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : `As of ${new Date().toLocaleDateString([], { month: "short", day: "numeric" })}`;
  ctx.fillStyle = "rgba(245, 239, 224, 0.62)";
  ctx.font = `11px ${sans}`;
  ctx.textAlign = "right";
  ctx.fillText(updatedLabel, width - margin, 88);
  ctx.textAlign = "left";

  const truncate = (text: string, maxWidth: number) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let shortened = text;
    while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
      shortened = shortened.slice(0, -1);
    }
    return `${shortened}…`;
  };

  const rankColors: Record<number, string> = { 0: "#B5820A", 1: "#8A8A8A", 2: "#9C5A28" };

  rows.forEach((row, index) => {
    const top = headerH + index * rowH;
    if (index % 2 === 1) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
      ctx.fillRect(0, top, width, rowH);
    }
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, top + rowH - 0.5);
    ctx.lineTo(width - margin, top + rowH - 0.5);
    ctx.stroke();

    const boxSize = 30;
    const boxY = top + (rowH - boxSize) / 2;
    ctx.fillStyle = rankColors[index] ?? "#111111";
    ctx.fillRect(margin, boxY, boxSize, boxSize);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `16px ${display}`;
    ctx.textAlign = "center";
    ctx.fillText(String(index + 1), margin + boxSize / 2, boxY + 21);
    ctx.textAlign = "left";

    const nameX = margin + boxSize + 14;
    ctx.fillStyle = "#111111";
    ctx.font = `bold 17px ${body}`;
    ctx.fillText(truncate(row.submission.name, 280), nameX, top + 24);
    ctx.fillStyle = "#777777";
    ctx.font = `11px ${sans}`;
    ctx.fillText(truncate(`Champion: ${row.champion}`, 280), nameX, top + 41);

    ctx.textAlign = "right";
    ctx.fillStyle = "#444444";
    ctx.font = `11px ${sans}`;
    ctx.fillText(
      `Groups ${row.score.groupMatches + row.score.qualification} · KO ${row.score.knockoutMatches + row.score.placements} · Bonus ${row.score.bonuses}`,
      width - margin - 86,
      top + 33,
    );

    ctx.fillStyle = "#C8001E";
    ctx.font = `30px ${display}`;
    ctx.fillText(String(row.score.total), width - margin, top + 37);
    ctx.textAlign = "left";
  });

  const footTop = headerH + rows.length * rowH;
  ctx.fillStyle = "#777777";
  ctx.font = `10px ${sans}`;
  ctx.fillText(
    `${rows.length} ${rows.length === 1 ? "entry" : "entries"} · ${Object.keys(results.matches ?? {}).length} results in`,
    margin,
    footTop + 28,
  );
  ctx.fillStyle = "#C8001E";
  ctx.fillRect(0, footTop + footerH - 3, width, 3);

  const slug =
    brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sweepstakes";
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}-standings.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");

  return true;
}

function openPredictionPdf(
  submission: Submission,
  results: TournamentResults,
  options: { brandName: string; heroImage: string },
) {
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
  frameDocument.write(buildPredictionPdfHtml(submission, results, options));
  frameDocument.close();

  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 250);

  return true;
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
  const updateScore = (side: "home" | "away", value: string) => {
    const nextValue = normalizeNumber(value);
    const nextHome = side === "home" ? nextValue : pick.home;
    const nextAway = side === "away" ? nextValue : pick.away;
    updatePick(fixture.id, {
      [side]: nextValue,
      winner:
        fixture.stage !== "group" &&
        typeof nextHome === "number" &&
        typeof nextAway === "number" &&
        nextHome === nextAway
          ? pick.winner
          : undefined,
    });
  };
  const needsWinner =
    fixture.stage !== "group" &&
    typeof pick.home === "number" &&
    typeof pick.away === "number" &&
    pick.home === pick.away;

  return (
    <article className="fixture-card">
      <span className="match-chip">Match {displayMatchNumber(fixture)}</span>
      <div className="fixture-home">
        <TeamLabelResponsive team={fixture.resolvedTeam1} />
      </div>
      <div className="score-inputs-inline">
        <input
          className="score-input home-score"
          aria-label={`${fixture.resolvedTeam1} goals`}
          inputMode="numeric"
          min={0}
          max={15}
          value={pick.home}
          onChange={(event) => updateScore("home", event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
        <span className="vs-sep">–</span>
        <input
          className="score-input away-score"
          aria-label={`${fixture.resolvedTeam2} goals`}
          inputMode="numeric"
          min={0}
          max={15}
          value={pick.away}
          onChange={(event) => updateScore("away", event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
      <div className="fixture-away">
        <TeamLabelResponsive team={fixture.resolvedTeam2} />
      </div>
      {needsWinner && (
        <select
          className="penalty-select"
          aria-label="Penalty winner"
          value={
            pick.winner === fixture.resolvedTeam1 || pick.winner === fixture.resolvedTeam2
              ? pick.winner
              : ""
          }
          onChange={(event) => updatePick(fixture.id, { winner: event.target.value })}
          required
        >
          <option value="" disabled>Penalty winner?</option>
          <option value={fixture.resolvedTeam1}>{fixture.resolvedTeam1}</option>
          <option value={fixture.resolvedTeam2}>{fixture.resolvedTeam2}</option>
        </select>
      )}
    </article>
  );
}

function PlayerAvatar({
  name,
  size = 40,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const src = avatarForName(name);
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className={`player-avatar ${className}`.trim()}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`player-avatar player-avatar--fallback ${className}`.trim()}
      style={{
        width: size,
        height: size,
        background: fallbackColorForName(name),
        fontSize: size * 0.4,
      }}
    >
      {initialsForName(name)}
    </span>
  );
}

function TitleRaceFrame({ src }: { src: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(960);

  const measure = useCallback(() => {
    const doc = ref.current?.contentWindow?.document;
    if (!doc) return;
    const next = doc.documentElement.scrollHeight;
    if (next > 0) setHeight((current) => (Math.abs(current - next) > 1 ? next : current));
  }, []);

  const handleLoad = useCallback(() => {
    measure();
    const frameWindow = ref.current?.contentWindow;
    const doc = frameWindow?.document;
    if (!doc || !frameWindow) return;
    // The recap animates and fetches data after load, so its height keeps
    // changing — track it live instead of guessing with fixed timeouts.
    const observer = new ResizeObserver(() => measure());
    observer.observe(doc.documentElement);
    frameWindow.addEventListener("unload", () => observer.disconnect());
  }, [measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  return (
    <div className="app-shell">
      <div className="main-column">
        <iframe
          ref={ref}
          src={src}
          title="The race for the title"
          className="titlerace-frame"
          style={{ height }}
          onLoad={handleLoad}
        />
      </div>
    </div>
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
              <PlayerAvatar name={row.submission.name} size={44} />
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
  const resultsResolved = useMemo(
    () => new Map(resolveFixtures(results.matches).map((f) => [f.id, f])),
    [results.matches],
  );
  const resolvedTeamOrTbc = (fixture: ResolvedFixture, side: "resolvedTeam1" | "resolvedTeam2") => {
    const team = resultsResolved.get(fixture.id)?.[side] ?? "";
    return !team || /^([WL]\d+|\d[A-L])/.test(team) ? "TBC" : team;
  };

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
      </div>

      <div className="matchday-strip" aria-label="Choose match date">
        {matchDays.map(([date, dayFixtures]) => {
          const completed = dayFixtures.filter((fixture) => results.matches[fixture.id]).length;
          const dateLabel = dayFixtures[0] ? formatFixtureDate(dayFixtures[0]) : date;
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
                      <span className="match-chip">Match {displayMatchNumber(fixture)}</span>
                      <span>{fixture.round}</span>
                      <span className="venue-chip">{formatFixtureTime(fixture)}</span>
                      <span className={`result-pill${result ? " result-pill-in" : ""}`}>
                        {result ? resultOutcome(result) : "Upcoming"}
                      </span>
                    </div>
                    <div className="match-scoreline">
                      <div className="scoreline-home">
                        <TeamLabel team={resolvedTeamOrTbc(fixture, "resolvedTeam1")} />
                      </div>
                      <div className="scoreline-box">
                        <b>{result != null ? result.home : "·"}</b>
                        <span>—</span>
                        <b>{result != null ? result.away : "·"}</b>
                      </div>
                      <div className="scoreline-away">
                        <TeamLabel team={resolvedTeamOrTbc(fixture, "resolvedTeam2")} />
                      </div>
                    </div>
                  </div>

                  <div className="matchday-picks">
                    {rows.map(({ submission, fixture: resolved, pick }) => {
                      const pickClass = matchPickClass(pick, result);
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
                          {result ? (
                            <PtsBadge pick={pick} result={result} fixture={resolved} pickClass={pickClass} />
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
              <div className="champion-flag-wrap">
                <TeamFlag team={final.champion} />
              </div>
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
              <span className="third-place-label">Best 3rd-placed teams qualifying to knockouts</span>
              {qualified.bestThirds.map((team) => (
                <TeamPill key={`${selectedSubmission.id}-${team.group}-${team.team}`} team={team.team}>
                  3{team.group} · {team.team}
                </TeamPill>
              ))}
            </div>
            <GroupTables picks={selectedSubmission.picks} showFixtures />
          </div>
        ) : null}

        {viewTab === "bracket" ? (
          <div className="entry-view-section entry-bracket-section">
            <Bracket fixtures={resolved} picks={selectedSubmission.picks} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GroupTables({
  picks,
  showFixtures = false,
}: {
  picks: Record<number, MatchPick>;
  showFixtures?: boolean;
}) {
  const standings = calculateGroupStandings(picks);
  const resolved = showFixtures ? resolveFixtures(picks) : [];
  return (
    <div className="group-grid">
      {Array.from(standings.entries()).map(([group, table]) => {
        const fixtures = resolved.filter((fixture) => fixture.stage === "group" && fixture.group === group);
        return (
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
            {showFixtures ? (
              <div className="group-fixture-list" aria-label={`Group ${group} predicted fixtures`}>
                {fixtures.map((fixture) => {
                  const pick = picks[fixture.id];
                  return (
                    <article className="group-fixture-pick" key={fixture.id}>
                      <div className="gfp-home"><TeamLabelAbbr team={fixture.resolvedTeam1} /></div>
                      <b>{pickScore(pick)}</b>
                      <div className="gfp-away"><TeamLabelAbbr team={fixture.resolvedTeam2} /></div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
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

function Bracket({
  fixtures: resolved,
  picks,
}: {
  fixtures: ResolvedFixture[];
  picks: Record<number, MatchPick>;
}) {
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
                  const pick = picks[fx.id];
                  const winner = predictedWinner(fx, pick);
                  return (
                    <div key={id} className="bk-slot" style={{ height: slotH }}>
                      <article className="bk-card">
                        <div className={`bk-team-line${winner === fx.resolvedTeam1 ? " bk-team-winner" : ""}`}>
                          <TeamLabel team={fx.resolvedTeam1} />
                          <b>{pick?.home === "" || pick?.home === undefined ? "?" : pick.home}</b>
                        </div>
                        <div className="bk-hr" />
                        <div className={`bk-team-line${winner === fx.resolvedTeam2 ? " bk-team-winner" : ""}`}>
                          <TeamLabel team={fx.resolvedTeam2} />
                          <b>{pick?.away === "" || pick?.away === undefined ? "?" : pick.away}</b>
                        </div>
                        {typeof pick?.home === "number" && pick.home === pick.away ? (
                          <small className="bk-penalty-note">
                            {pick.winner ? `${pick.winner} on pens` : "Penalty winner needed"}
                          </small>
                        ) : null}
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
  const completedRequiredPicks = completedRequiredPickCount(resolved, picks);
  const missingPenaltyWinners = missingPenaltyWinnerCount(resolved, picks);
  const canSubmit =
    completedRequiredPicks === resolved.length &&
    missingPenaltyWinners === 0 &&
    !!name.trim() &&
    !!bonuses.topScorer.trim() &&
    !!bonuses.goldenBall.trim() &&
    !!bonuses.mostGoalsTeam.trim();

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
        <span>
          {completedRequiredPicks} of 104 matches complete
          {missingPenaltyWinners ? ` · ${missingPenaltyWinners} penalty winner${missingPenaltyWinners === 1 ? "" : "s"} needed` : ""}
        </span>
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
          disabled={!canSubmit}
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

export default function SweepstakesApp({ tournament = defaultTournament }: SweepstakesAppProps) {
  const isDefaultTournament = tournament.slug === defaultTournament.slug;
  const submissionsUrl = isDefaultTournament
    ? "/api/submissions"
    : `/api/submissions?tournament=${encodeURIComponent(tournament.slug)}`;
  const tournamentStorageSuffix = isDefaultTournament ? "" : `:${tournament.slug}`;
  const scopedSubmissionsKey = `${localSubmissionsKey}${tournamentStorageSuffix}`;
  const scopedResultsKey = `${localResultsKey}${tournamentStorageSuffix}`;
  const scopedSubmittedEntryKey = `${localSubmittedEntryKey}${tournamentStorageSuffix}`;
  const scopedNameKey = `sweepstakes-news-name${tournamentStorageSuffix}`;
  const scopedDraftKey = `sweepstakes-news-draft${tournamentStorageSuffix}`;
  const scopedBonusesKey = `sweepstakes-news-bonuses${tournamentStorageSuffix}`;
  const heroImage = isDefaultTournament ? "/hero-team-full.jpg" : "/tournament-generic-banner.png";
  const brandName = tournament.name;
  const shareEnabled = !isDefaultTournament;
  const [tab, setTab] = useState<Tab>("matchday");
  const [menuOpen, setMenuOpen] = useState(false);
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
  const [selectedMatchDate, setSelectedMatchDate] = useState(() =>
    defaultMatchDate(resolveFixtures(createEmptyPicks())),
  );
  const [shareStatus, setShareStatus] = useState("");

  const applyResultsPayload = useCallback((payload: ResultsPayload) => {
    const apiResults = payload.results;
    if (!apiResults) return;

    const resultCount = Object.keys(apiResults.matches ?? {}).length;
    setResults(apiResults);

    if (payload.warning) {
      const warning = friendlyResultsWarning(payload.warning);
      setResultsStatus(
        resultCount
          ? `Using saved results. ${warning}`
          : warning,
      );
      return;
    }

    if (!resultCount) {
      setResultsStatus("");
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
    async (mode: "normal" | "force" = "normal") => {
      const suffix = mode === "force" ? "?refresh=1" : "";
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
        setResultsStatus(friendlyResultsWarning(message));
        return { warning: message } satisfies ResultsPayload;
      } finally {
        setResultsSyncing(false);
      }
    },
    [applyResultsPayload],
  );

  useEffect(() => {
    queueMicrotask(() => {
      const storedSubmittedEntryId = readLocal<string | null>(scopedSubmittedEntryKey, null);
      const storedSubmissions = readLocal<Submission[]>(scopedSubmissionsKey, []);
      const seededSubmissions =
        process.env.NODE_ENV === "development" && isDefaultTournament
          ? createMockSubmissions(storedSubmissions)
          : storedSubmissions;
      setName(readLocal(scopedNameKey, ""));
      setPicks(readLocal(scopedDraftKey, createEmptyPicks()));
      setBonuses(readLocal(scopedBonusesKey, emptyBonuses()));
      setSubmissions(seededSubmissions);
      setResults(readLocal(scopedResultsKey, blankResults));
      setSubmittedEntryId(storedSubmittedEntryId);
      setHydrated(true);
    });

    Promise.all([
      fetch(submissionsUrl).then((response) => response.json()),
      fetch("/api/results").then((response) => response.json()),
    ])
      .then(([submissionPayload, resultPayload]: [SubmissionsPayload, ResultsPayload]) => {
        if (Array.isArray(submissionPayload.submissions) && submissionPayload.mode === "supabase") {
          setSubmissions(submissionPayload.submissions);
          setSubmittedEntryId((current) =>
            current && submissionPayload.submissions?.some((submission) => submission.id === current)
              ? current
              : null,
          );
        } else if (submissionPayload.submissions?.length) {
          setSubmissions((current) => {
            const merged = [...(submissionPayload.submissions ?? [])];
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
  }, [
    applyResultsPayload,
    isDefaultTournament,
    scopedBonusesKey,
    scopedDraftKey,
    scopedNameKey,
    scopedResultsKey,
    scopedSubmittedEntryKey,
    scopedSubmissionsKey,
    submissionsUrl,
  ]);

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
    window.localStorage.setItem(scopedNameKey, name);
    window.localStorage.setItem(scopedDraftKey, JSON.stringify(picks));
    window.localStorage.setItem(scopedBonusesKey, JSON.stringify(bonuses));
  }, [hydrated, name, picks, bonuses, scopedBonusesKey, scopedDraftKey, scopedNameKey]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(scopedSubmissionsKey, JSON.stringify(submissions));
  }, [hydrated, scopedSubmissionsKey, submissions]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(scopedResultsKey, JSON.stringify(results));
  }, [hydrated, scopedResultsKey, results]);

  useEffect(() => {
    if (!hydrated) return;
    if (submittedEntryId) {
      window.localStorage.setItem(scopedSubmittedEntryKey, JSON.stringify(submittedEntryId));
    } else {
      window.localStorage.removeItem(scopedSubmittedEntryKey);
    }
  }, [hydrated, scopedSubmittedEntryKey, submittedEntryId]);

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
  const totalIncompleteRequiredPicks = incompleteRequiredPickCount(resolvedFixtures, picks);
  const totalMissingPenaltyWinners = missingPenaltyWinnerCount(resolvedFixtures, picks);
  const canReview =
    !hasSubmittedEntry &&
    !locked &&
    !!name.trim() &&
    totalIncompleteRequiredPicks === 0 &&
    totalMissingPenaltyWinners === 0;
  const needsNameToReview =
    !hasSubmittedEntry &&
    !locked &&
    !name.trim() &&
    totalIncompleteRequiredPicks === 0 &&
    totalMissingPenaltyWinners === 0;

  function updatePick(fixtureId: number, patch: Partial<MatchPick>) {
    setPicks((current) => ({
      ...current,
      [fixtureId]: { ...current[fixtureId], ...patch },
    }));
  }

  async function submit() {
    const resolvedSubmissionFixtures = resolveFixtures(picks);
    if (
      !name.trim() ||
      incompleteRequiredPickCount(resolvedSubmissionFixtures, picks) > 0 ||
      missingPenaltyWinnerCount(resolvedSubmissionFixtures, picks) > 0 ||
      !bonuses.topScorer.trim() ||
      !bonuses.goldenBall.trim() ||
      !bonuses.mostGoalsTeam.trim()
    ) {
      return;
    }

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
    await fetch(submissionsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submission),
    }).catch(() => undefined);
  }

  function exportSubmission(submission: Submission) {
    const opened = openPredictionPdf(submission, results, { brandName, heroImage });
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
    ...(!hasSubmittedEntry
      ? [{ key: "predict" as const, label: "Predict matches", icon: <Sparkles size={18} /> }]
      : []),
    { key: "matchday", label: "Match days", icon: <CalendarDays size={18} /> },
    { key: "leaderboard", label: "Leaderboard", icon: <Trophy size={18} /> },
    { key: "rules", label: "Scoring", icon: <CheckCircle2 size={18} /> },
    { key: "titlerace", label: "Title race", icon: <CarFront size={18} /> },
    { key: "goals", label: "Goals & assists", icon: <Medal size={18} /> },
    { key: "insights", label: "Fun facts", icon: <CircleQuestionMark size={18} /> },
  ];

  const heroData: Record<Tab, { h1: string }> = {
    predict: {
      h1: hasSubmittedEntry ? "Your\nPicks" : "Predict\nAll 104",
    },
    leaderboard: {
      h1: "The\nTable",
    },
    matchday: {
      h1: "Match\nDays",
    },
    rules: {
      h1: "Scoring\nSystem",
    },
    titlerace: {
      h1: "Title\nRace",
    },
    goals: {
      h1: "Goals\nAssists",
    },
    insights: {
      h1: "Fun\nFacts",
    },
  };
  const activeHero = heroData[tab];
  const recapHref = isDefaultTournament
    ? "/recap.html?embed=1"
    : `/recap.html?tournament=${encodeURIComponent(tournament.slug)}&embed=1`;
  const activeNavLabel = navItems.find((item) => item.key === tab)?.label ?? "Menu";

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

  async function copyTournamentLink() {
    const path = `/t/${tournament.slug}`;
    const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Invite link copied");
    } catch {
      setShareStatus(url);
    }
  }

  return (
    <main className="arena-layout">
      <aside className="tournament-rail">
        <div className="rail-brand">
          <span className="rail-crest" aria-hidden="true">
            <Image
              src="/football-logo.png"
              alt=""
              width={52}
              height={52}
              loading="eager"
              className="rail-logo-image"
            />
          </span>
          <div className="rail-brand-copy">
            <strong>{brandName}</strong>
            <span>World Cup 2026</span>
          </div>
          <button
            type="button"
            className="rail-menu-toggle"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="rail-tabs"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
            <span className="rail-menu-label">{menuOpen ? "Close" : activeNavLabel}</span>
          </button>
        </div>
        <nav
          id="rail-tabs"
          className={`tabs${menuOpen ? " tabs-open" : ""}`}
          aria-label="Main sections"
        >
          {navItems.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? "active" : ""}
              onClick={() => {
                setTab(item.key);
                setMenuOpen(false);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-note">
          <span>Entries close</span>
          <strong>Before kick-off · 11 Jun 2026</strong>
          {shareEnabled ? (
            <button className="rail-share-button" onClick={copyTournamentLink}>
              <ClipboardCheck size={14} />
              Share invite
            </button>
          ) : (
            <a className="rail-share-button rail-create-link" href="/new">
              <Sparkles size={14} />
              Create your pool
            </a>
          )}
          {shareStatus ? <small>{shareStatus}</small> : null}
        </div>
      </aside>

      <div className="arena-main">
        <section className="hero" key={`hero-${tab}`}>
          <Image
            src={heroImage}
            alt=""
            fill
            priority
            sizes="(min-width: 900px) calc(100vw - 236px), 100vw"
            className="hero-image"
          />
          <div className="hero-overlay" />
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-content">
            <h1>{activeHero.h1}</h1>
          </div>
        </section>

        {tab === "titlerace" ? (
          <TitleRaceFrame src={recapHref} />
        ) : tab === "goals" ? (
          <GoalsAssists embedded tournament={tournament} />
        ) : tab === "insights" ? (
          <PredictionInsights embedded tournament={tournament} />
        ) : (
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
                      <div className="gateway-name-wrap">
                        <input
                          className={`gateway-name${needsNameToReview ? " gateway-name-error" : ""}`}
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Your name..."
                          maxLength={40}
                          aria-label="Entry name"
                          aria-invalid={needsNameToReview}
                          aria-describedby={needsNameToReview ? "name-required-note" : undefined}
                        />
                        {needsNameToReview ? (
                          <p id="name-required-note" className="gateway-validation">
                            Add your name to continue
                          </p>
                        ) : null}
                      </div>
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
                        const stepFixtures = resolvedFixtures.filter((f) => f.stage === step.id);
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
                        ) : null}
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
                  <div className={`prediction-workbench${activeStepMeta.kind !== "group" ? " workbench-full" : ""}`}>
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
                    {activeStepMeta.kind === "group" && (
                      <aside className="live-rankings-card">
                        <GroupTableCard group={activeStepMeta.id} picks={picks} />
                      </aside>
                    )}
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
                        <span className={`footer-cta-hint${needsNameToReview ? " footer-cta-error" : ""}`}>
                          {!name.trim()
                            ? "Add your name above to continue"
                            : totalMissingPenaltyWinners
                              ? `${totalMissingPenaltyWinners} penalty winner${totalMissingPenaltyWinners === 1 ? "" : "s"} needed`
                              : `${totalIncompleteRequiredPicks} match${totalIncompleteRequiredPicks === 1 ? "" : "es"} left`}
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
                  <button
                    className="secondary-button icon-button compact-btn"
                    onClick={() => {
                      const exported = exportLeaderboardPng(submissions, results, brandName);
                      setExportNotice(
                        exported
                          ? "Standings image saved — share it anywhere."
                          : "No entries to export yet.",
                      );
                    }}
                  >
                    <ImageDown size={14} />
                    Export PNG
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
              </section>
            )}

          </div>
        </div>
        )}
      </div>
    </main>
  );
}
