import { NextResponse } from "next/server";
import { readStoredPlayerStats } from "@/lib/player-stats";

export async function GET() {
  try {
    return NextResponse.json(await readStoredPlayerStats(), {
      headers: {
        "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load goals and assists" },
      { status: 500 },
    );
  }
}
