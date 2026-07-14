import { NextResponse } from "next/server";
import { refreshStoredPlayerStats } from "@/lib/player-stats";
import { refreshStoredResults } from "@/lib/results";
import { refreshStoredMessiReferees } from "@/lib/messi-referees";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await refreshStoredResults(request);
    const playerStats = await refreshStoredPlayerStats();
    const messiReferees = await refreshStoredMessiReferees();
    return NextResponse.json({
      results,
      playerStats,
      messiReferees,
      warning: playerStats.warning ?? messiReferees.warning ?? results.warning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update goals and assists" },
      { status: 500 },
    );
  }
}
