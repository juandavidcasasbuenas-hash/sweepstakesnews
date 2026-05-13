import { fixtures } from "@/data/fixtures";
import { emptyBonuses, sampleResults } from "@/lib/tournament";
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
const MIN_PROVIDER_INTERVAL_MS = 15_000;

type ResultsRead = {
  mode: "local" | "supabase";
  results: TournamentResults;
};

type ResultsWrite = ResultsRead;

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

function nested(source: Record<string, unknown>, key: string) {
  return asRecord(source[key]);
}

function normalizeTeamName(value?: string) {
  return value?.trim().toLowerCase();
}

function findFixtureByTeams(team1?: string, team2?: string) {
  const home = normalizeTeamName(team1);
  const away = normalizeTeamName(team2);
  if (!home || !away) return undefined;
  return fixtures.find(
    (fixture) =>
      normalizeTeamName(fixture.team1) === home &&
      normalizeTeamName(fixture.team2) === away,
  );
}

function findFixture(fixtureId?: number, team1?: string, team2?: string) {
  const byId = fixtureId ? fixtures.find((fixture) => fixture.id === fixtureId) : undefined;
  return byId ?? findFixtureByTeams(team1, team2);
}

function inferWinner(home: number, away: number, team1?: string, team2?: string) {
  if (home > away) return team1;
  if (away > home) return team2;
  return undefined;
}

function resultFromRow(row: unknown) {
  const source = asRecord(row);
  const goals = nested(source, "goals");
  const score = nested(source, "score");
  const scores = nested(source, "scores");
  const fullTime = nested(score, "fullTime");

  const fixtureId = firstNumber(
    source.fixtureId,
    source.match,
    source.id,
    source.match_number,
    source.matchNumber,
    source.number,
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

  if (typeof home !== "number" || typeof away !== "number") return undefined;

  const fixture = findFixture(fixtureId, team1, team2);
  if (!fixture && !fixtureId) return undefined;

  const matchId = fixture?.id ?? fixtureId;
  if (!matchId) return undefined;

  const result: ResultMatch = {
    fixtureId: matchId,
    team1: team1 ?? fixture?.team1,
    team2: team2 ?? fixture?.team2,
    home,
    away,
    winner:
      firstString(source.winner, source.winningTeam, source.winner_name) ??
      (home === away && typeof homePen === "number" && typeof awayPen === "number"
        ? inferWinner(homePen, awayPen, team1 ?? fixture?.team1, team2 ?? fixture?.team2)
        : undefined) ??
      inferWinner(home, away, team1 ?? fixture?.team1, team2 ?? fixture?.team2),
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
  return [];
}

export function normalizeGenericJson(payload: unknown): TournamentResults {
  const matches: Record<number, ResultMatch> = {};

  rowsFromPayload(payload).forEach((row) => {
    const result = resultFromRow(row);
    if (result) matches[result.fixtureId] = result;
  });

  return {
    matches,
    bonuses: emptyBonuses(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWc2026TestMatch(payload: unknown): TournamentResults {
  const result = resultFromRow(payload);
  const fixtureId = Number(process.env.WC2026_TEST_FIXTURE_ID ?? 1);
  const fixture = fixtures.find((item) => item.id === fixtureId) ?? fixtures[0];
  const matches: Record<number, ResultMatch> = {};

  if (result && fixture) {
    matches[fixture.id] = {
      ...result,
      fixtureId: fixture.id,
      team1: fixture.team1,
      team2: fixture.team2,
      winner: undefined,
    };
  }

  return {
    matches,
    bonuses: emptyBonuses(),
    updatedAt: new Date().toISOString(),
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

  return { matches, bonuses: emptyBonuses(), updatedAt: new Date().toISOString() };
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

export async function fetchResultsFromProvider(request: Request) {
  const now = Date.now();
  if (now - lastProviderCallMs < MIN_PROVIDER_INTERVAL_MS) {
    throw new Error(`Results provider called too frequently — wait ${Math.ceil((MIN_PROVIDER_INTERVAL_MS - (now - lastProviderCallMs)) / 1000)}s`);
  }
  lastProviderCallMs = now;

  const url = new URL(request.url);
  if (url.searchParams.get("sample") === "1") {
    return sampleResults();
  }

  if (url.searchParams.get("test") === "1") {
    if (!process.env.WC2026_API_KEY) throw new Error("WC2026_API_KEY is not configured");
    const endpoint = process.env.WC2026_TEST_API_URL ?? "https://api.wc2026api.com/test/match";
    return normalizeWc2026TestMatch(
      await fetchJson(endpoint, {
        headers: { authorization: `Bearer ${process.env.WC2026_API_KEY}` },
      }),
    );
  }

  if (process.env.RESULTS_API_URL) {
    return normalizeGenericJson(await fetchJson(process.env.RESULTS_API_URL));
  }

  if (process.env.WC2026_API_KEY) {
    const endpoint = process.env.WC2026_API_URL ?? "https://api.wc2026api.com/matches";
    return normalizeGenericJson(
      await fetchJson(endpoint, {
        headers: { authorization: `Bearer ${process.env.WC2026_API_KEY}` },
      }),
    );
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

export async function refreshStoredResults(request: Request) {
  const results = await fetchResultsFromProvider(request);
  return writeStoredResults(results);
}

function hasResults(results: TournamentResults) {
  return Object.keys(results.matches ?? {}).length > 0;
}

function cacheAgeMs(results: TournamentResults) {
  const updatedAt = new Date(results.updatedAt).getTime();
  return Number.isFinite(updatedAt) ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
}

function liveCacheMs() {
  const seconds = Number(process.env.RESULTS_CACHE_SECONDS ?? 90);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 90_000;
}

export async function getLiveResults(request: Request): Promise<LiveResults> {
  const url = new URL(request.url);
  const forceRefresh =
    url.searchParams.get("refresh") === "1" || url.searchParams.get("sample") === "1";
  const stored = await readStoredResults();
  const currentHasResults = hasResults(stored.results);
  const currentIsFresh = cacheAgeMs(stored.results) <= liveCacheMs();

  if (!forceRefresh && currentHasResults && currentIsFresh) {
    return { ...stored, cached: true, stale: false };
  }

  try {
    const refreshed = await refreshStoredResults(request);
    return { ...refreshed, cached: false, stale: false };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Could not refresh results";
    return {
      ...stored,
      cached: true,
      stale: currentHasResults,
      warning,
    };
  }
}

export function mapProviderFixture(fixture: Fixture) {
  return {
    fixtureId: fixture.id,
    match_number: fixture.id,
    home_team: fixture.team1,
    away_team: fixture.team2,
  };
}
