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
  TournamentResults,
} from "@/types/game";

const WC2026_API_BASE = "https://api.wc2026api.com";
const DEFAULT_PLAYER_STATS_DAILY_CALL_BUDGET = 120;
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
    kind.includes("own goal");
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

function aggregateRows(matchStats: Record<number, StoredMatchPlayerStats>) {
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

  const allRows = [...rows.values()].map((row) => ({
    ...row,
    matches: [...row.matches].sort((a, b) => a - b),
  }));
  const byGoals = (a: PlayerGoalAssistRow, b: PlayerGoalAssistRow) =>
    b.goals - a.goals ||
    b.assists - a.assists ||
    a.matches.length - b.matches.length ||
    a.player.localeCompare(b.player);
  const byAssists = (a: PlayerGoalAssistRow, b: PlayerGoalAssistRow) =>
    b.assists - a.assists ||
    b.goals - a.goals ||
    a.matches.length - b.matches.length ||
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
  const rankings = aggregateRows(matchStats);
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
    .filter((match): match is ResultMatch => Boolean(match))
    .map((match) => ({
      fixtureId: match.fixtureId,
      providerId:
        match.providerId ??
        match.providerMatchNumber ??
        fixtures.find((fixture) => fixture.id === match.fixtureId)?.id,
    }))
    .sort((a, b) => a.fixtureId - b.fixtureId);
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

  const targets = completedMatchTargets(stored.results.matches).filter(
    (target) => !current.matchStats[target.fixtureId],
  );
  if (!targets.length) {
    const checkedAt = new Date().toISOString();
    const stats = rebuildPlayerStats(current.matchStats, current, checkedAt);
    return writePlayerStats(stored.results, stats);
  }

  const remainingCalls = Math.max(0, budget.cap - budget.count);
  const targetsForToday = targets.slice(0, remainingCalls);
  let spentCalls = 0;
  const matchStats = { ...current.matchStats };
  let warning: string | undefined;

  for (const target of targetsForToday) {
    spentCalls += 1;
    try {
      matchStats[target.fixtureId] = await fetchProviderMatchStats(target);
    } catch (error) {
      warning = error instanceof Error ? error.message : "Could not refresh goals and assists";
      break;
    }
  }

  const checkedAt = new Date().toISOString();
  const stats = rebuildPlayerStats(matchStats, current, checkedAt);
  const saved = await writePlayerStats(stored.results, {
    ...stats,
    providerCalls: bumpedProviderCalls(current, spentCalls),
    providerCallTimestamps: bumpedProviderCallTimestamps(current, spentCalls),
    providerWarning: warning,
  });

  return { ...saved, warning };
}
