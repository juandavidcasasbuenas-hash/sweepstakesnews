import { NextResponse } from "next/server";
import { readStoredResults, writeStoredResults } from "@/lib/results";
import type { TournamentResults } from "@/types/game";

export async function GET() {
  try {
    return NextResponse.json(await readStoredResults());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load results" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const adminKey = process.env.ADMIN_RESULTS_KEY;
  if (adminKey && request.headers.get("authorization") !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = (await request.json()) as TournamentResults;
  const payload = { ...results, updatedAt: new Date().toISOString() };
  try {
    return NextResponse.json(await writeStoredResults(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save results" },
      { status: 500 },
    );
  }
}
