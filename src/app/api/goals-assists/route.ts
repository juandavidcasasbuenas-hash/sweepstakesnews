import { NextResponse } from "next/server";
import { readStoredPlayerStats } from "@/lib/player-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readStoredPlayerStats(), {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load goals and assists" },
      { status: 500 },
    );
  }
}
