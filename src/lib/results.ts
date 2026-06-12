import { fixtures } from "@/data/fixtures";
import { fixtureKickoffDate } from "@/lib/fixture-time";
import {
  displayMatchNumber,
  emptyBonuses,
  FIRST_KICK_OFF_ISO,
  fixtureFromProviderMatchNumber,
  sampleResults,
} from "@/lib/tournament";
import { getSupabase } from "@/lib/supabase";
import type { Fixture, ResultMatch, TournamentResults } from "@/types/game";

export const resultsRowId = "world-cup-2026";

export const emptyResults: TournamentResults = {
  matches: {},
  bonuses: emptyBonuses(),
  updatedAt: new Date(0).toISOString(),
};

let localResults = emptyResults;
let lastProviderCallMs = 0;
let inFlightProviderCall: Promise<TournamentResults> | null = null;
const MIN_PROVIDER_INTERVAL_MS = 15_000;
// Schedule-aware polling: refresh often while matches are in play, rarely
// otherwise, and never exceed the provider's daily request allowance.
const HOT_TTL_FLOOR_SECONDS = 720;
const WARM_TTL_SECONDS = 3_600;
const FORCE_REFRESH_MIN_MS = 120_000;
const DEFAULT_DAILY_CALL_BUDGET = 90;
const GROUP_MATCH_WINDOW_MS = 3.5 * 60 * 60 * 1000;
const KNOCKOUT_MATCH_WINDOW_MS = 4 * 60 * 60 * 1000;
const WC2026_API_BASE = "https://api.wc2026api.com";
const FINAL_REFRESH_UNTIL_ISO = "2026-07-20T06:00:00.000Z";
export const manualResultsWarning = "Manual admin results are being used.";
const SANDBOX_CYCLE_MINUTES = 160;
const SANDBOX_PHASE_MINUTES = SANDBOX_CYCLE_MINUTES / 8;
const SANDBOX_PHASES = ["PRE", "1H", "HT", "2H", "ET1", "ET2", "PEN", "FT_PEN"] as const;

type ResultsRead = {
  mode: "local" | "supabase";
  results: TournamentResults;
};

type ResultsWrite = ResultsRead & {
  warning?: string;
};

type LiveResults = ResultsRead & {
  cached: boolean;
  stale: boolean;
  warning?: string;
};

type ApiFootballRow = {
  fixture?: { id?: number };
  teams?: {
    home?: { name?: string; winner?: boolean };
    away?: { name?: string; winner?: boolean };
  };
  goals?: { home?: number | null; away?: number | null };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function nested(source: Record<string, unknown>, key: string) {
  return asRecord(source[key]);
}

const teamNameAliases: Record<string, string> = {
  bosniaandherzegovina: "bosniaherzegovina",
  bosniaherzegovina: "bosniaherzegovina",
  congodr: "drcongo",
  czechia: "czechrepublic",
  ivorycoast: "ivorycoast",
  cotedivoire: "ivorycoast",
  korearepublic: "southkorea",
  republicofkorea: "southkorea",
  turkiye: "turkey",
  unitedstates: "usa",
  unitedstatesofamerica: "usa",
  us: "usa",
};

function teamNameKey(value?: string) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
  if (!normalized) return undefined;
  return teamNameAliases[normalized] ?? normalized;
}

function normalizeTeamName(value?: string) {
  return value?.trim();
}

function teamNamesEqual(team1?: string, team2?: string) {
  const first = teamNameKey(team1);
  const second = teamNameKey(team2);
  return Boolean(first && second && first === second);
}

function isPlaceholderTeam(team?: string) {
  return Boolean(team?.replace(/\s/g, "").match(/^([WL]\d+|[123][A-L/]+)$/));
}

function fixtureDisplayTeam(team?: string) {
  return isPlaceholderTeam(team) ? undefined : team;
}

function localizeProviderTeam(providerTeam?: string, fixtureTeam?: string) {
  if (fixtureTeam && teamNamesEqual(providerTeam, fixtureTeam)) return fixtureTeam;
  return providerTeam ?? fixtureTeam;
}

function findFixtureByTeams(team1?: string, team2?: string) {
  if (!normalizeTeamName(team1) || !normalizeTeamName(team2)) return undefined;
  return fixtures.find(
    (fixture) =>
      teamNamesEqual(fixture.team1, team1) &&
      teamNamesEqual(fixture.team2, team2),
  );
}

function findFixture(fixtureId?: number, team1?: string, team2?: string) {
  const byId = fixtureId ? fixtures.find((fixture) => fixture.id === fixtureId) : undefined;
  return byId ?? findFixtureByTeams(team1, team2);
}

function knownFixtureId(fixtureId?: number) {
  return typeof fixtureId === "number" && fixtures.some((fixture) => fixture.id === fixtureId);
}

function inferWinner(home: number, away: number, team1?: string, team2?: string) {
  if (home > away) return team1;
  if (away > home) return team2;
  return undefined;
}

function localizeWinner(winner: string | undefined, team1?: string, team2?: string) {
  if (!winner) return undefined;
  if (teamNamesEqual(winner, team1)) return team1;
  if (teamNamesEqual(winner, team2)) return team2;
  return winner;
}

type NormalizeOptions = {
  overrideFixtureId?: number;
  allowUnmapped?: boolean;
  includeScheduled?: boolean;
};

function resultFromRow(row: unknown, options: NormalizeOptions = {}) {
  const source = asRecord(row);
  const goals = nested(source, "goals");
  const score = nested(source, "score");
  const scores = nested(source, "scores");
  const fullTime = nested(score, "fullTime");

  const providerMatchNumber = firstNumber(source.match_number, source.matchNumber);
  const providerId = firstNumber(source.id);
  const explicitFixtureId =
    options.overrideFixtureId ??
    firstNumber(source.fixtureId);
  const looseFixtureId =
    firstNumber(
      source.number,
      source.match,
    );
  const team1 = firstString(
    source.team1,
    source.homeTeam,
    source.home_team,
    source.homeName,
    source.home,
  );
  const team2 = firstString(
    source.team2,
    source.awayTeam,
    source.away_team,
    source.awayName,
    source.away,
  );
  const home = firstNumber(
    source.homeScore,
    source.home_score,
    source.homeGoals,
    source.score_home,
    source.home,
    goals.home,
    score.home,
    scores.home,
    fullTime.home,
  );
  const away = firstNumber(
    source.awayScore,
    source.away_score,
    source.awayGoals,
    source.score_away,
    source.away,
    goals.away,
    score.away,
    scores.away,
    fullTime.away,
  );
  const homePen = firstNumber(source.homePen, source.home_pen, source.penaltiesHome);
  const awayPen = firstNumber(source.awayPen, source.away_pen, source.penaltiesAway);
  const status = firstString(source.status);
  const phase = firstString(source.phase);
  const matchMinute = firstNumber(source.matchMinute, source.match_minute);
  const kickoffInSeconds = firstNumber(source.kickoffInSeconds, source.kickoff_in_seconds);
  const nextPhaseInSeconds = firstNumber(source.nextPhaseInSeconds, source.next_phase_in_seconds);
  const sandbox = firstBoolean(source.sandbox, source._sandbox);

  if (typeof home !== "number" || typeof away !== "number") return undefined;

  // Unplayed matches must never be stored as results: providers may report
  // scheduled fixtures with 0-0 scores, which would score as real draws.
  if (status === "scheduled" && !options.includeScheduled) return undefined;

  const fixture =
    findFixture(explicitFixtureId, team1, team2) ??
    findFixtureByTeams(team1, team2) ??
    fixtureFromProviderMatchNumber(providerMatchNumber) ??
    findFixture(looseFixtureId, team1, team2);
  const matchId =
    fixture?.id ??
    (knownFixtureId(explicitFixtureId) ? explicitFixtureId : undefined) ??
    (knownFixtureId(looseFixtureId) ? looseFixtureId : undefined) ??
    (options.allowUnmapped ? explicitFixtureId ?? looseFixtureId ?? providerId : undefined);

  if (!matchId) return undefined;

  const resultTeam1 = localizeProviderTeam(team1, fixtureDisplayTeam(fixture?.team1));
  const resultTeam2 = localizeProviderTeam(team2, fixtureDisplayTeam(fixture?.team2));
  const explicitWinner = localizeWinner(
    firstString(source.winner, source.winningTeam, source.winner_name),
    resultTeam1,
    resultTeam2,
  );

  const result: ResultMatch = {
    fixtureId: matchId,
    providerId,
    providerMatchNumber,
    team1: resultTeam1,
    team2: resultTeam2,
    home,
    away,
    winner:
      explicitWinner ??
      (home === away && typeof homePen === "number" && typeof awayPen === "number"
        ? inferWinner(homePen, awayPen, resultTeam1, resultTeam2)
        : undefined) ??
      inferWinner(home, away, resultTeam1, resultTeam2),
    status,
    phase,
    matchMinute,
    homePen,
    awayPen,
    kickoffInSeconds,
    nextPhaseInSeconds,
    sandbox,
  };

  return result;
}

function rowsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  const source = asRecord(payload);
  for (const key of ["matches", "data", "response", "results"]) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  if (
    "home_score" in source ||
    "homeScore" in source ||
    "away_score" in source ||
    "awayScore" in source ||
    "_sandbox" in source
  ) {
    return [payload];
  }
  return [];
}

export function normalizeGenericJson(
  payload: unknown,
  options: NormalizeOptions = {},
): TournamentResults {
  const matches: Record<number, ResultMatch> = {};
  const checkedAt = new Date().toISOString();

  rowsFromPayload(payload).forEach((row) => {
    const result = resultFromRow(row, options);
    if (result) matches[result.fixtureId] = result;
  });

  return {
    matches,
    bonuses: emptyBonuses(),
    updatedAt: checkedAt,
    providerCheckedAt: checkedAt,
  };
}

export function normalizeApiFootball(payload: unknown): TournamentResults {
  const rows = rowsFromPayload(payload) as ApiFootballRow[];
  const matches: Record<number, ResultMatch> = {};

  rows.forEach((row) => {
    const homeName = row.teams?.home?.name;
    const awayName = row.teams?.away?.name;
    const fixture = findFixtureByTeams(homeName, awayName);
    if (
      !fixture ||
      typeof row.goals?.home !== "number" ||
      typeof row.goals?.away !== "number"
    ) {
      return;
    }
    matches[fixture.id] = {
      fixtureId: fixture.id,
      team1: homeName,
      team2: awayName,
      home: row.goals.home,
      away: row.goals.away,
      winner: row.teams?.home?.winner
        ? homeName
        : row.teams?.away?.winner
          ? awayName
          : undefined,
    };
  });

  const checkedAt = new Date().toISOString();
  return { matches, bonuses: emptyBonuses(), updatedAt: checkedAt, providerCheckedAt: checkedAt };
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function sandboxCycleOffsetMinutes() {
  const now = new Date();
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((Date.now() - midnightUtc) / 60_000) % SANDBOX_CYCLE_MINUTES;
}

function sandboxMatchMinute(phase: (typeof SANDBOX_PHASES)[number], offsetInPhase: number) {
  const pct = offsetInPhase / SANDBOX_PHASE_MINUTES;
  if (phase === "1H") return Math.max(1, Math.ceil(pct * 45));
  if (phase === "HT") return 45;
  if (phase === "2H") return Math.max(46, Math.ceil(pct * 45) + 45);
  if (phase === "ET1") return Math.max(91, Math.ceil(pct * 15) + 90);
  if (phase === "ET2") return Math.max(106, Math.ceil(pct * 15) + 105);
  return null;
}

export function localWc2026TestMatch() {
  const offset = sandboxCycleOffsetMinutes();
  const phaseIndex = Math.floor(offset / SANDBOX_PHASE_MINUTES);
  const offsetInPhase = offset % SANDBOX_PHASE_MINUTES;
  const phase = SANDBOX_PHASES[phaseIndex];
  const matchMinute = sandboxMatchMinute(phase, offsetInPhase);
  const phasesPast = (target: (typeof SANDBOX_PHASES)[number]) =>
    SANDBOX_PHASES.slice(0, phaseIndex + 1).includes(target);
  const homeScore =
    phasesPast("HT") || (phase === "1H" && matchMinute != null && matchMinute >= 23) ? 1 : 0;
  const awayScore =
    phasesPast("ET1") || (phase === "2H" && matchMinute != null && matchMinute >= 67) ? 1 : 0;
  const inPenalties = phase === "PEN" || phase === "FT_PEN";

  return {
    _sandbox: true,
    id: 9999,
    match_number: 999,
    round: "final",
    group_name: null,
    home_team: "Brazil",
    home_team_code: "BRA",
    away_team: "Argentina",
    away_team_code: "ARG",
    stadium: "Estadio Azteca",
    stadium_city: "Mexico City",
    stadium_country: "Mexico",
    status: phase === "PRE" ? "scheduled" : phase === "FT_PEN" ? "completed" : "live",
    phase,
    match_minute: matchMinute,
    home_score: homeScore,
    away_score: awayScore,
    home_pen: inPenalties ? 3 : null,
    away_pen: inPenalties ? 5 : null,
    winner: phase === "FT_PEN" ? "Argentina" : null,
    next_phase_in_seconds: (SANDBOX_PHASE_MINUTES - offsetInPhase) * 60,
  };
}

function wc2026Headers() {
  return { authorization: `Bearer ${process.env.WC2026_API_KEY}` };
}

export async function fetchWc2026TestMatch() {
  if (!process.env.WC2026_API_KEY) {
    throw new Error("No WC2026 API key configured");
  }
  return fetchJson(`${WC2026_API_BASE}/test/match`, {
    headers: wc2026Headers(),
  });
}

async function fetchWc2026Matches() {
  const endpoint = process.env.WC2026_API_URL ?? `${WC2026_API_BASE}/matches?status=completed`;
  return normalizeGenericJson(
    await fetchJson(endpoint, {
      headers: wc2026Headers(),
    }),
  );
}

async function fetchWc2026TestResults() {
  let payload: unknown;
  try {
    payload = await fetchWc2026TestMatch();
  } catch {
    payload = localWc2026TestMatch();
  }

  return normalizeGenericJson(payload, {
    overrideFixtureId: 104,
    includeScheduled: true,
  });
}

async function fetchConfiguredResultsProvider() {
  if (process.env.RESULTS_API_URL) {
    return normalizeGenericJson(await fetchJson(process.env.RESULTS_API_URL));
  }

  if (process.env.WC2026_API_KEY) {
    return fetchWc2026Matches();
  }

  if (process.env.API_FOOTBALL_KEY) {
    const endpoint =
      process.env.API_FOOTBALL_URL ??
      "https://v3.football.api-sports.io/fixtures?league=1&season=2026";
    return normalizeApiFootball(
      await fetchJson(endpoint, {
        headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
      }),
    );
  }

  throw new Error("No results provider configured");
}

export async function fetchResultsFromProvider(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("sample") === "1") {
    return sampleResults();
  }

  if (inFlightProviderCall) {
    return inFlightProviderCall;
  }

  const now = Date.now();
  if (now - lastProviderCallMs < MIN_PROVIDER_INTERVAL_MS) {
    throw new ProviderThrottleError(`Results provider called too frequently — wait ${Math.ceil((MIN_PROVIDER_INTERVAL_MS - (now - lastProviderCallMs)) / 1000)}s`);
  }
  lastProviderCallMs = now;

  inFlightProviderCall = fetchConfiguredResultsProvider().finally(() => {
    inFlightProviderCall = null;
  });

  return inFlightProviderCall;
}

export async function readStoredResults(): Promise<ResultsRead> {
  const supabase = getSupabase();
  if (!supabase) {
    return { mode: "local", results: localResults };
  }

  const { data, error } = await supabase
    .from("results")
    .select("payload")
    .eq("id", resultsRowId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    mode: "supabase",
    results: (data?.payload as TournamentResults | null) ?? emptyResults,
  };
}

export async function writeStoredResults(results: TournamentResults): Promise<ResultsWrite> {
  const payload = { ...results, updatedAt: results.updatedAt ?? new Date().toISOString() };
  const supabase = getSupabase();
  if (!supabase) {
    localResults = payload;
    return { mode: "local", results: payload };
  }

  const { error } = await supabase.from("results").upsert({
    id: resultsRowId,
    payload,
    updated_at: payload.updatedAt,
  });

  if (error) throw new Error(error.message);

  return { mode: "supabase", results: payload };
}

export async function refreshStoredResults(request: Request): Promise<ResultsWrite> {
  const isSample = new URL(request.url).searchParams.get("sample") === "1";
  const pollingWarning = !isSample ? providerPollingWindowWarning() : undefined;
  if (pollingWarning) {
    const cached = await cacheProviderWarning(await readStoredResults(), pollingWarning);
    return { ...cached, warning: pollingWarning };
  }

  const stored = await readStoredResults();

  if (!isSample) {
    const budget = providerCallBudget(stored.results);
    if (budget.exhausted) {
      const warning = `Daily results API budget used (${budget.count}/${budget.cap}). Automatic refresh resumes after midnight UTC.`;
      return { ...stored, warning };
    }
  }

  // Count the attempt before calling: a failed request still spends quota.
  const providerCalls = isSample
    ? stored.results.providerCalls
    : bumpedProviderCalls(stored.results);

  let results: TournamentResults;
  try {
    results = await fetchResultsFromProvider(request);
  } catch (error) {
    if (error instanceof ProviderThrottleError) {
      // No request went out — return the saved data without re-stamping the
      // cache, so the next poll can still refresh on time.
      return { ...stored, warning: error.message };
    }
    const warning = error instanceof Error ? error.message : "Could not refresh results";
    const cached = await cacheProviderWarning(stored, warning, providerCalls);
    return { ...cached, warning };
  }

  if (!isSample && !hasResults(results)) {
    const warning = "Results provider returned no scored matches";
    const cached = await cacheProviderWarning(stored, warning, providerCalls);
    return { ...cached, warning };
  }
  return writeStoredResults({ ...results, providerCalls });
}

function hasResults(results: TournamentResults) {
  return Object.keys(results.matches ?? {}).length > 0;
}

function providerCheckTimestamp(results: TournamentResults) {
  const providerCheckedAt = new Date(results.providerCheckedAt ?? "").getTime();
  if (Number.isFinite(providerCheckedAt)) return providerCheckedAt;
  const updatedAt = new Date(results.updatedAt).getTime();
  return Number.isFinite(updatedAt) ? updatedAt : Number.NaN;
}

function cacheAgeMs(results: TournamentResults) {
  const checkedAt = providerCheckTimestamp(results);
  return Number.isFinite(checkedAt) ? Date.now() - checkedAt : Number.POSITIVE_INFINITY;
}

function hasCacheTimestamp(results: TournamentResults) {
  return Number.isFinite(providerCheckTimestamp(results));
}

export type ResultsPollTier = "hot" | "warm";

export function resultsPollTier(now = new Date()): ResultsPollTier {
  const nowMs = now.getTime();
  for (const fixture of fixtures) {
    const kickoff = fixtureKickoffDate(fixture)?.getTime();
    if (kickoff === undefined || kickoff === null) continue;
    const windowMs =
      fixture.stage === "group" ? GROUP_MATCH_WINDOW_MS : KNOCKOUT_MATCH_WINDOW_MS;
    if (nowMs >= kickoff && nowMs <= kickoff + windowMs) return "hot";
  }
  return "warm";
}

function hotTtlSeconds() {
  const seconds = Number(process.env.RESULTS_CACHE_SECONDS ?? NaN);
  // The floor keeps worst-case match days inside the provider's daily quota.
  if (Number.isFinite(seconds)) return Math.max(HOT_TTL_FLOOR_SECONDS, seconds);
  return HOT_TTL_FLOOR_SECONDS;
}

export function resultsPollTtlSeconds(tier: ResultsPollTier) {
  const hot = hotTtlSeconds();
  return tier === "hot" ? hot : Math.max(hot, WARM_TTL_SECONDS);
}

function dailyCallBudgetCap() {
  const cap = Number(process.env.RESULTS_DAILY_CALL_BUDGET ?? NaN);
  if (Number.isFinite(cap) && cap >= 1) return Math.floor(cap);
  return DEFAULT_DAILY_CALL_BUDGET;
}

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function providerCallsToday(results: TournamentResults, now = new Date()) {
  return results.providerCalls?.date === utcDay(now) ? results.providerCalls.count : 0;
}

export function providerCallBudget(results: TournamentResults, now = new Date()) {
  const cap = dailyCallBudgetCap();
  const count = providerCallsToday(results, now);
  return { cap, count, exhausted: count >= cap };
}

function bumpedProviderCalls(results: TournamentResults, now = new Date()) {
  return { date: utcDay(now), count: providerCallsToday(results, now) + 1 };
}

class ProviderThrottleError extends Error {}

function utcDateOffset(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function providerPollingWindowWarning(now = new Date()) {
  if (now.getTime() < new Date(FIRST_KICK_OFF_ISO).getTime()) {
    return "Official results refresh is paused until the first match kicks off on 11 June 2026.";
  }
  if (now.getTime() > new Date(FINAL_REFRESH_UNTIL_ISO).getTime()) {
    return "Official results refresh is paused because the tournament has finished.";
  }

  const activeDates = new Set([
    utcDateOffset(now, -1),
    utcDateOffset(now, 0),
    utcDateOffset(now, 1),
  ]);
  const isNearMatchDay = fixtures.some((fixture) => activeDates.has(fixture.date));
  return isNearMatchDay ? undefined : "Official results refresh is paused until the next match day.";
}

async function cacheProviderWarning(
  stored: ResultsRead,
  warning: string,
  providerCalls?: TournamentResults["providerCalls"],
) {
  const results = {
    ...stored.results,
    providerCheckedAt: new Date().toISOString(),
    providerWarning: warning,
    ...(providerCalls ? { providerCalls } : {}),
  };
  try {
    return await writeStoredResults(results);
  } catch {
    return stored;
  }
}

export async function getLiveResults(request: Request): Promise<LiveResults> {
  const url = new URL(request.url);
  const sampleRefresh = url.searchParams.get("sample") === "1";
  const testRefresh = url.searchParams.get("test") === "1";
  const forceRefresh =
    url.searchParams.get("refresh") === "1" ||
    sampleRefresh ||
    testRefresh;
  const stored = await readStoredResults();

  if (testRefresh) {
    try {
      return { ...stored, results: await fetchWc2026TestResults(), cached: false, stale: false };
    } catch (error) {
      const warning = error instanceof Error ? error.message : "Could not load sandbox match";
      return { ...stored, cached: true, stale: hasResults(stored.results), warning };
    }
  }

  const currentHasResults = hasResults(stored.results);
  const currentAgeMs = cacheAgeMs(stored.results);
  const ttlMs = resultsPollTtlSeconds(resultsPollTier()) * 1000;
  const currentIsFresh = hasCacheTimestamp(stored.results) && currentAgeMs <= ttlMs;
  const plainForceRefresh =
    url.searchParams.get("refresh") === "1" && !sampleRefresh && !testRefresh;
  const pollingWarning = !sampleRefresh ? providerPollingWindowWarning() : undefined;

  if (!sampleRefresh && !testRefresh && stored.results.manualOverride) {
    return {
      ...stored,
      cached: true,
      stale: false,
      warning: stored.results.providerWarning ?? manualResultsWarning,
    };
  }

  if (!forceRefresh && currentIsFresh) {
    return {
      ...stored,
      cached: true,
      stale: false,
      warning: stored.results.providerWarning,
    };
  }

  // "Check for results" bypasses the schedule cache, but never hammers the
  // provider: checks made moments ago are simply served back.
  if (plainForceRefresh && hasCacheTimestamp(stored.results) && currentAgeMs < FORCE_REFRESH_MIN_MS) {
    return {
      ...stored,
      cached: true,
      stale: false,
      warning: stored.results.providerWarning,
    };
  }

  if (pollingWarning) {
    return {
      ...stored,
      cached: true,
      stale: currentHasResults,
      warning: pollingWarning,
    };
  }

  try {
    const refreshed = await refreshStoredResults(request);
    return {
      ...refreshed,
      cached: Boolean(refreshed.warning),
      stale: Boolean(refreshed.warning && currentHasResults),
      warning: refreshed.warning,
    };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Could not refresh results";
    const cached = await cacheProviderWarning(stored, warning);
    return {
      ...cached,
      cached: true,
      stale: currentHasResults,
      warning,
    };
  }
}

export function mapProviderFixture(fixture: Fixture) {
  return {
    fixtureId: fixture.id,
    match_number: displayMatchNumber(fixture),
    home_team: fixture.team1,
    away_team: fixture.team2,
  };
}
