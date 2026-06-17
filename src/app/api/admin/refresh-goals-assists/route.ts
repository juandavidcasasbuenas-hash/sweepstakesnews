import { NextResponse } from "next/server";
import { refreshStoredPlayerStats } from "@/lib/player-stats";
import { refreshStoredResults } from "@/lib/results";

function isAdminRequest(request: Request) {
  const adminKey = process.env.ADMIN_RESULTS_KEY;
  return Boolean(adminKey && request.headers.get("authorization") === `Bearer ${adminKey}`);
}

export async function POST(request: Request) {
  if (!process.env.ADMIN_RESULTS_KEY) {
    return NextResponse.json(
      { error: "ADMIN_RESULTS_KEY is not configured on this server" },
      { status: 500 },
    );
  }

  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await refreshStoredResults(request);
    const playerStats = await refreshStoredPlayerStats();
    const resultsWarning = "warning" in results ? results.warning : undefined;

    return NextResponse.json({
      results,
      playerStats,
      warning: playerStats.warning ?? resultsWarning,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not refresh goals and assists" },
      { status: 500 },
    );
  }
}
