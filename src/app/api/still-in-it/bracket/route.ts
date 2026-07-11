// Announced pairings for unplayed knockout matches, straight from the
// provider's schedule. Results ingestion drops scheduled rows (no scores), so
// this is the only place that surfaces them. The simulation validates these
// names against the official fixture feeds before using them because providers
// can populate future rounds speculatively on the wrong side of the draw.

import { NextResponse } from "next/server";
import { fixtureFromProviderMatchNumber } from "@/lib/tournament";
import { canonicalTeamName } from "@/lib/team-flags";

export const runtime = "nodejs";

type Pins = Record<number, [string | null, string | null]>;

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { at: number; pins: Pins } | null = null;
let inFlight: Promise<Pins> | null = null;

function localName(team: unknown): string | null {
  if (typeof team !== "string" || !team.trim()) return null;
  return canonicalTeamName(team.trim()) ?? team.trim();
}

async function fetchPins(): Promise<Pins> {
  if (!process.env.WC2026_API_KEY) return {};
  const endpoint = process.env.WC2026_API_URL ?? "https://api.wc2026api.com/matches";
  const response = await fetch(endpoint, {
    headers: { authorization: `Bearer ${process.env.WC2026_API_KEY}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`bracket provider returned ${response.status}`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows)) return {};

  const pins: Pins = {};
  for (const row of rows) {
    if (row.status === "completed") continue;
    const fixture = fixtureFromProviderMatchNumber(
      typeof row.match_number === "number" ? row.match_number : undefined,
    );
    if (!fixture || fixture.stage === "group") continue;
    const home = localName(row.home_team);
    const away = localName(row.away_team);
    if (home || away) pins[fixture.id] = [home, away];
  }
  return pins;
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ pins: cache.pins, cached: true });
  }
  if (!inFlight) {
    inFlight = fetchPins().finally(() => {
      inFlight = null;
    });
  }
  try {
    const pins = await inFlight;
    cache = { at: Date.now(), pins };
    return NextResponse.json({ pins, cached: false });
  } catch (error) {
    console.error("[still-in-it/bracket]", error instanceof Error ? error.message : error);
    // Stale pins beat no pins: the simulation falls back to the local skeleton
    // only when we have never heard from the provider.
    return NextResponse.json({ pins: cache?.pins ?? {}, cached: true });
  }
}
