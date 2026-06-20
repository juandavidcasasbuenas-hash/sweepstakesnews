import { fixtures } from "@/data/fixtures";
import {
  readStoredResults,
  writeStoredResults,
} from "@/lib/results";
import type {
  GoalAssistEvent,
  PlayerGoalAssistRow,
  PlayerStatsState,
  ResultMatch,
  StoredMatchPlayerStats,
  SupplementalPlayerStat,
  TournamentResults,
} from "@/types/game";

const WC2026_API_BASE = "https://api.wc2026api.com";
const FOX_WORLD_CUP_STANDARD_STATS_URL =
  "https://www.foxsports.com/soccer/fifa-world-cup/stats?category=standard&groupId=12&season=2026&sort=a&sortOrder=desc";
const DEFAULT_PLAYER_STATS_DAILY_CALL_BUDGET = 120;
const PLAYER_STATS_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const emptyStatsDate = new Date(0).toISOString();

export const emptyPlayerStats: PlayerStatsState = {
  scorers: [],
  assists: [],
  matchStats: {},
  updatedAt: emptyStatsDate,
};

type PlayerStatsRead = {
  mode: "local" | "supabase";
  stats: PlayerStatsState;
};

type PlayerStatsWrite = PlayerStatsRead & {
  warning?: string;
};

type ProviderMatchTarget = {
  fixtureId: number;
  providerId?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
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

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function htmlText(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstInteger(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(htmlText(value).replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rowsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  const source = asRecord(payload);
  for (const key of ["events", "timeline", "data", "response", "stats"]) {
    const value = source[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value);
    if (Array.isArray(nested.events)) return nested.events;
    if (Array.isArray(nested.timeline)) return nested.timeline;
  }
  return [];
}

function eventKind(row: Record<string, unknown>) {
  const type = firstString(row.type, row.event_type, row.eventType, row.kind, row.name);
  const detail = firstString(row.detail, row.description, row.outcome);
  return `${type ?? ""} ${detail ?? ""}`.toLowerCase();
}

function normalizeGoalEvent(
  row: unknown,
  target: ProviderMatchTarget,
): GoalAssistEvent | undefined {
  const source = asRecord(row);
  const kind = eventKind(source);
  if (!kind.includes("goal") && !("scorer" in source) && !("goal_scorer" in source)) {
    return undefined;
  }

  const scorerRecord = asRecord(source.scorer);
  const playerRecord = asRecord(source.player);
  const teamRecord = asRecord(source.team);
  const assistRecord = asRecord(source.assist);
  const assistPlayerRecord = asRecord(source.assist_player);
  const scorer = firstString(
    source.scorer,
    source.goal_scorer,
    source.player_name,
    source.playerName,
    source.player,
    scorerRecord.name,
    playerRecord.name,
  );
  if (!scorer) return undefined;

  const ownGoal =
    firstBoolean(source.ownGoal, source.own_goal, source.is_own_goal) ??
    (kind.includes("own goal") || kind.includes("own_goal"));
  const penalty =
    firstBoolean(source.penalty, source.is_penalty, source.from_penalty) ??
    kind.includes("penalty");

  return {
    fixtureId: target.fixtureId,
    providerId: target.providerId,
    minute: firstNumber(source.minute, source.match_minute, source.time, source.elapsed),
    team: firstString(
      source.team,
      source.team_name,
      source.teamName,
      teamRecord.name,
    ),
    scorer,
    assist: firstString(
      source.assist,
      source.assist_name,
      source.assistName,
      source.assist_player,
      assistRecord.name,
      assistPlayerRecord.name,
    ),
    penalty,
    ownGoal,
  };
}

export function normalizeMatchPlayerStats(
  payload: unknown,
  target: ProviderMatchTarget,
  checkedAt = new Date().toISOString(),
): StoredMatchPlayerStats {
  return {
    ...target,
    checkedAt,
    events: rowsFromPayload(payload)
      .map((row) => normalizeGoalEvent(row, target))
      .filter((event): event is GoalAssistEvent => Boolean(event)),
  };
}

function aggregateRows(
  matchStats: Record<number, StoredMatchPlayerStats>,
  supplementalPlayerStats: SupplementalPlayerStat[] = [],
) {
  const rows = new Map<string, PlayerGoalAssistRow>();

  function rowFor(player: string, team?: string) {
    const key = `${player.toLowerCase()}|${team?.toLowerCase() ?? ""}`;
    const existing = rows.get(key);
    if (existing) return existing;
    const next: PlayerGoalAssistRow = {
      player,
      team,
      goals: 0,
      assists: 0,
      penaltyGoals: 0,
      matches: [],
    };
    rows.set(key, next);
    return next;
  }

  Object.values(matchStats).forEach((match) => {
    match.events.forEach((event) => {
      if (!event.ownGoal) {
        const scorer = rowFor(event.scorer, event.team);
        scorer.goals += 1;
        scorer.penaltyGoals += event.penalty ? 1 : 0;
        if (!scorer.matches.includes(event.fixtureId)) scorer.matches.push(event.fixtureId);
      }
      if (event.assist) {
        const assister = rowFor(event.assist, event.team);
        assister.assists += 1;
        if (!assister.matches.includes(event.fixtureId)) assister.matches.push(event.fixtureId);
      }
    });
  });

  supplementalPlayerStats.forEach((stat) => {
    if (!stat.player.trim()) return;
    const row = rowFor(stat.player.trim(), stat.team?.trim() || undefined);
    row.goals = Math.max(row.goals, stat.goals ?? 0);
    row.assists = Math.max(row.assists, stat.assists ?? 0);
  });

  const allRows = [...rows.values()].map((row) => ({
    ...row,
    matches: [...row.matches].sort((a, b) => a - b),
  }));
  const matchesForSort = (row: PlayerGoalAssistRow) =>
    row.matches.length || Number.MAX_SAFE_INTEGER;
  const byGoals = (a: PlayerGoalAssistRow, b: PlayerGoalAssistRow) =>
    b.goals - a.goals ||
    b.assists - a.assists ||
    matchesForSort(a) - matchesForSort(b) ||
    a.player.localeCompare(b.player);
  const byAssists = (a: PlayerGoalAssistRow, b: PlayerGoalAssistRow) =>
    b.assists - a.assists ||
    b.goals - a.goals ||
    matchesForSort(a) - matchesForSort(b) ||
    a.player.localeCompare(b.player);

  return {
    scorers: allRows.filter((row) => row.goals > 0).sort(byGoals),
    assists: allRows.filter((row) => row.assists > 0).sort(byAssists),
  };
}

export function rebuildPlayerStats(
  matchStats: Record<number, StoredMatchPlayerStats>,
  previous: PlayerStatsState = emptyPlayerStats,
  checkedAt = new Date().toISOString(),
): PlayerStatsState {
  const rankings = aggregateRows(matchStats, previous.supplementalPlayerStats);
  return {
    ...previous,
    ...rankings,
    matchStats,
    updatedAt: checkedAt,
    providerCheckedAt: checkedAt,
  };
}

export function playerStatsFromResults(results: TournamentResults): PlayerStatsState {
  const current = results.playerStats ?? emptyPlayerStats;
  return rebuildPlayerStats(current.matchStats ?? {}, current, current.providerCheckedAt ?? current.updatedAt);
}

export async function readStoredPlayerStats(): Promise<PlayerStatsRead> {
  const stored = await readStoredResults();
  return {
    mode: stored.mode,
    stats: playerStatsFromResults(stored.results),
  };
}

function dailyCallBudgetCap() {
  const cap = Number(process.env.PLAYER_STATS_DAILY_CALL_BUDGET ?? NaN);
  if (Number.isFinite(cap) && cap >= 1) return Math.floor(cap);
  return DEFAULT_PLAYER_STATS_DAILY_CALL_BUDGET;
}

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function providerCallsToday(stats: PlayerStatsState, now = new Date()) {
  return stats.providerCalls?.date === utcDay(now) ? stats.providerCalls.count : 0;
}

function providerCallTimestampsSince(
  stats: Pick<PlayerStatsState, "providerCallTimestamps">,
  since: Date,
) {
  const sinceMs = since.getTime();
  return (stats.providerCallTimestamps ?? []).filter((timestamp) => {
    const time = new Date(timestamp).getTime();
    return Number.isFinite(time) && time >= sinceMs;
  });
}

export function playerStatsCallsLast24Hours(stats: PlayerStatsState, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return providerCallTimestampsSince(stats, since).length;
}

export function playerStatsProviderBudget(stats: PlayerStatsState, now = new Date()) {
  const cap = dailyCallBudgetCap();
  const count = providerCallsToday(stats, now);
  return { cap, count, exhausted: count >= cap };
}

function bumpedProviderCalls(stats: PlayerStatsState, increment: number, now = new Date()) {
  return { date: utcDay(now), count: providerCallsToday(stats, now) + increment };
}

function bumpedProviderCallTimestamps(
  stats: PlayerStatsState,
  increment: number,
  now = new Date(),
) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const nextCalls = Array.from({ length: increment }, () => now.toISOString());
  return [...providerCallTimestampsSince(stats, since), ...nextCalls];
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body.trim();
    try {
      const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
      detail = firstString(parsed.error, parsed.message) ?? detail;
    } catch {
      // Provider error bodies may be plain text.
    }
    throw new Error(
      `${url} returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    );
  }
  return response.json();
}

async function fetchText(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", "Mozilla/5.0");
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers,
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.text();
}

export function parseFoxStandardStats(html: string): SupplementalPlayerStat[] {
  const rows = html.match(/<tr\b[^>]*id="tbl-row-\d+"[\s\S]*?<\/tr>/g) ?? [];
  const stats: SupplementalPlayerStat[] = [];
  rows.forEach((row) => {
    const entityHtml = row.match(/class="table-entity-name[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1];
    if (!entityHtml) return;
    const team = htmlText(entityHtml.match(/<sup[^>]*>([\s\S]*?)<\/sup>/)?.[1] ?? "");
    const player = htmlText(entityHtml.replace(/<sup[^>]*>[\s\S]*?<\/sup>/, ""));
    if (!player) return;

    const cells = new Map<number, string>();
    for (const cell of row.match(/<td\b[\s\S]*?<\/td>/g) ?? []) {
      const index = firstInteger(cell.match(/data-index="(\d+)"/)?.[1]);
      const value = cell.match(/<span class="table-result[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1];
      if (index !== undefined && value !== undefined) cells.set(index, value);
    }

    const goals = firstInteger(cells.get(7));
    const assists = firstInteger(cells.get(11));
    if ((goals ?? 0) <= 0 && (assists ?? 0) <= 0) return;

    const stat: SupplementalPlayerStat = { player };
    if (team) stat.team = team;
    if (goals !== undefined) stat.goals = goals;
    if (assists !== undefined) stat.assists = assists;
    stats.push(stat);
  });
  return stats;
}

async function fetchSupplementalPlayerStats() {
  const url = process.env.PLAYER_STATS_SUPPLEMENTAL_URL ?? FOX_WORLD_CUP_STANDARD_STATS_URL;
  return parseFoxStandardStats(await fetchText(url));
}

function wc2026Headers() {
  return { authorization: `Bearer ${process.env.WC2026_API_KEY}` };
}

function statsUrl(providerId: number) {
  const template = process.env.WC2026_STATS_API_URL;
  if (template) {
    return template.replaceAll("{id}", String(providerId)).replaceAll("{providerId}", String(providerId));
  }
  return `${WC2026_API_BASE}/matches/${providerId}/stats`;
}

async function fetchProviderMatchStats(target: ProviderMatchTarget) {
  if (!process.env.WC2026_API_KEY) {
    throw new Error("No WC2026 API key configured for player stats");
  }
  if (!target.providerId) {
    throw new Error(`No provider match id stored for fixture ${target.fixtureId}`);
  }
  return normalizeMatchPlayerStats(
    await fetchJson(statsUrl(target.providerId), { headers: wc2026Headers() }),
    target,
  );
}

function completedMatchTargets(matches: TournamentResults["matches"]) {
  return Object.values(matches)
    .filter(
      (match): match is ResultMatch =>
        Boolean(match) && match.status !== "scheduled" && match.phase !== "PRE",
    )
    .map((match) => ({
      fixtureId: match.fixtureId,
      providerId:
        match.providerId ??
        match.providerMatchNumber ??
        fixtures.find((fixture) => fixture.id === match.fixtureId)?.id,
    }))
    .sort((a, b) => a.fixtureId - b.fixtureId);
}

function statCheckedAtTime(stat: StoredMatchPlayerStats | undefined) {
  if (!stat) return 0;
  const time = new Date(stat.checkedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function playerStatsRefreshTargets(
  matches: TournamentResults["matches"],
  stats: Pick<PlayerStatsState, "matchStats">,
  now = new Date(),
) {
  const staleBefore = now.getTime() - PLAYER_STATS_RECHECK_INTERVAL_MS;
  return completedMatchTargets(matches)
    .filter((target) => {
      const cached = stats.matchStats[target.fixtureId];
      return !cached || statCheckedAtTime(cached) <= staleBefore;
    })
    .sort((a, b) => {
      const aTime = statCheckedAtTime(stats.matchStats[a.fixtureId]);
      const bTime = statCheckedAtTime(stats.matchStats[b.fixtureId]);
      return aTime - bTime || a.fixtureId - b.fixtureId;
    });
}

async function writePlayerStats(
  results: TournamentResults,
  stats: PlayerStatsState,
): Promise<PlayerStatsWrite> {
  const stored = await writeStoredResults({ ...results, playerStats: stats });
  return {
    mode: stored.mode,
    stats: playerStatsFromResults(stored.results),
  };
}

export async function refreshStoredPlayerStats(): Promise<PlayerStatsWrite> {
  const stored = await readStoredResults();
  const current = playerStatsFromResults(stored.results);
  const budget = playerStatsProviderBudget(current);
  if (budget.exhausted) {
    const warning = `Daily goals and assists API budget used (${budget.count}/${budget.cap}). Automatic refresh resumes after midnight UTC.`;
    return { mode: stored.mode, stats: current, warning };
  }

  const targets = playerStatsRefreshTargets(stored.results.matches, current);
  let supplementalPlayerStats = current.supplementalPlayerStats ?? [];
  let warning: string | undefined;
  try {
    supplementalPlayerStats = await fetchSupplementalPlayerStats();
  } catch (error) {
    warning =
      error instanceof Error ? error.message : "Could not refresh supplemental player stats";
  }

  if (!targets.length) {
    const checkedAt = new Date().toISOString();
    const stats = rebuildPlayerStats(
      current.matchStats,
      { ...current, supplementalPlayerStats, providerWarning: warning },
      checkedAt,
    );
    const saved = await writePlayerStats(stored.results, stats);
    return { ...saved, warning };
  }

  const remainingCalls = Math.max(0, budget.cap - budget.count);
  const targetsForToday = targets.slice(0, remainingCalls);
  let spentCalls = 0;
  const matchStats = { ...current.matchStats };

  for (const target of targetsForToday) {
    spentCalls += 1;
    try {
      matchStats[target.fixtureId] = await fetchProviderMatchStats(target);
    } catch (error) {
      warning ??= error instanceof Error ? error.message : "Could not refresh goals and assists";
      break;
    }
  }

  const checkedAt = new Date().toISOString();
  const stats = rebuildPlayerStats(
    matchStats,
    { ...current, supplementalPlayerStats },
    checkedAt,
  );
  const saved = await writePlayerStats(stored.results, {
    ...stats,
    providerCalls: bumpedProviderCalls(current, spentCalls),
    providerCallTimestamps: bumpedProviderCallTimestamps(current, spentCalls),
    providerWarning: warning,
  });

  return { ...saved, warning };
}
