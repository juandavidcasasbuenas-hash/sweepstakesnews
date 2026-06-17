import { NextResponse } from "next/server";
import { refreshStoredPlayerStats } from "@/lib/player-stats";
import { refreshStoredResults } from "@/lib/results";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await refreshStoredResults(request);
    const playerStats = await refreshStoredPlayerStats();
    return NextResponse.json({
      results,
      playerStats,
      warning: playerStats.warning ?? results.warning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update goals and assists" },
      { status: 500 },
    );
  }
}
