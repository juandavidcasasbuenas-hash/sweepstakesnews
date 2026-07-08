import { NextResponse } from "next/server";
import { buildMomentumDataset } from "@/lib/momentum";
import { getLiveResults } from "@/lib/results";
import { getSupabase } from "@/lib/supabase";
import { buildWrapped } from "@/lib/wrapped";
import type { Submission, TournamentResults } from "@/types/game";

// When developing without Supabase locally, pull the real pool data from the
// production deployment so the wrapped stories always reflect actual scores.
const REMOTE_BASE =
  process.env.WRAPPED_REMOTE_BASE ?? "https://sweepstakesnews.vercel.app";

type SubmissionRow = {
  payload: Submission;
};

async function readSubmissions(): Promise<Submission[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("payload")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SubmissionRow[]).map((row) => row.payload);
}

async function fetchRemoteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${REMOTE_BASE}${path}`, {
    next: { revalidate: 120 },
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function readPoolData(request: Request) {
  if (getSupabase()) {
    const [submissions, live] = await Promise.all([
      readSubmissions(),
      getLiveResults(request),
    ]);
    return { submissions, results: live.results };
  }
  const [subsPayload, resultsPayload] = await Promise.all([
    fetchRemoteJson<{ submissions: Submission[] }>("/api/submissions"),
    fetchRemoteJson<{ results: TournamentResults }>("/api/results"),
  ]);
  return {
    submissions: subsPayload.submissions ?? [],
    results: resultsPayload.results,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view")?.trim().toLowerCase();

    // The "Your 2026 Journey" (Wrapped) story pages aren't shipped, so this
    // endpoint stays closed to everything except the Season Momentum view that
    // the Fun Facts panel needs. Flip this guard to re-open the full Wrapped
    // API later.
    if (view !== "momentum") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { submissions, results } = await readPoolData(request);
    const wrapped = buildWrapped(submissions, results);
    const dataset = buildMomentumDataset(wrapped);
    return NextResponse.json({
      ...dataset,
      players: [...dataset.players].sort((a, b) => a.rank - b.rank),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not build wrapped" },
      { status: 500 },
    );
  }
}
