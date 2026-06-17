import { NextResponse } from "next/server";
import { hasSupabaseConfig, getSupabase } from "@/lib/supabase";
import {
  providerCallBudget,
  readStoredResults,
  resultsPollTier,
  resultsPollTtlSeconds,
} from "@/lib/results";
import {
  playerStatsFromResults,
  playerStatsProviderBudget,
} from "@/lib/player-stats";

type HealthCheck = {
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
};

function isAdminRequest(request: Request) {
  const adminKey = process.env.ADMIN_RESULTS_KEY;
  return Boolean(adminKey && request.headers.get("authorization") === `Bearer ${adminKey}`);
}

function check(label: string, status: HealthCheck["status"], detail: string): HealthCheck {
  return { label, status, detail };
}

function overallStatus(checks: HealthCheck[]) {
  if (checks.some((item) => item.status === "error")) return "error";
  if (checks.some((item) => item.status === "warn")) return "warn";
  return "ok";
}

export async function GET(request: Request) {
  if (!process.env.ADMIN_RESULTS_KEY) {
    return NextResponse.json(
      { error: "ADMIN_RESULTS_KEY is not configured on this server" },
      { status: 500 },
    );
  }

  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: HealthCheck[] = [
    check("Admin token", "ok", "This request was authorized by ADMIN_RESULTS_KEY."),
  ];

  const supabaseConfigured = hasSupabaseConfig();
  checks.push(
    check(
      "Supabase config",
      supabaseConfigured ? "ok" : "warn",
      supabaseConfigured
        ? "Supabase URL and a database key are configured."
        : "Supabase is not configured; this server will use local in-memory data.",
    ),
  );

  checks.push(
    check(
      "Supabase write key",
      process.env.SUPABASE_SERVICE_ROLE_KEY ? "ok" : "warn",
      process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "Service role key is present for server-side writes."
        : "No service role key detected; writes may depend on public insert/update policies.",
    ),
  );

  checks.push(
    check(
      "Results provider",
      process.env.RESULTS_API_URL || process.env.WC2026_API_KEY || process.env.API_FOOTBALL_KEY
        ? "ok"
        : "warn",
      process.env.RESULTS_API_URL
        ? "Custom RESULTS_API_URL is configured."
        : process.env.WC2026_API_KEY
          ? "WC2026 API key is configured."
          : process.env.API_FOOTBALL_KEY
            ? "API Football key is configured."
            : "No live results provider key or URL is configured.",
    ),
  );

  let submissionCount: number | null = null;
  if (supabaseConfigured) {
    try {
      const supabase = getSupabase();
      const { count, error } = await supabase!
        .from("submissions")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      submissionCount = count ?? 0;
      checks.push(check("Submissions read", "ok", `${submissionCount} submission${submissionCount === 1 ? "" : "s"} visible.`));
    } catch (error) {
      checks.push(
        check(
          "Submissions read",
          "error",
          error instanceof Error ? error.message : "Could not read submissions.",
        ),
      );
    }
  }

  let resultCount = 0;
  let resultsUpdatedAt = "";
  let manualOverride = false;
  let providerWarning = "";
  let providerBudget: { cap: number; count: number; exhausted: boolean } | null = null;
  let playerStatsMatchCount = 0;
  let playerStatsUpdatedAt = "";
  let playerStatsWarning = "";
  let playerStatsBudget: { cap: number; count: number; exhausted: boolean } | null = null;
  try {
    const stored = await readStoredResults();
    const playerStats = playerStatsFromResults(stored.results);
    resultCount = Object.keys(stored.results.matches ?? {}).length;
    resultsUpdatedAt = stored.results.updatedAt;
    manualOverride = Boolean(stored.results.manualOverride);
    providerWarning = stored.results.providerWarning ?? "";
    providerBudget = providerCallBudget(stored.results);
    playerStatsMatchCount = Object.keys(playerStats.matchStats ?? {}).length;
    playerStatsUpdatedAt = playerStats.updatedAt;
    playerStatsWarning = playerStats.providerWarning ?? "";
    playerStatsBudget = playerStatsProviderBudget(playerStats);
    checks.push(
      check(
        "Provider call budget",
        providerBudget.exhausted ? "warn" : "ok",
        `${providerBudget.count} of ${providerBudget.cap} daily provider calls used${
          providerBudget.exhausted ? "; refresh paused until midnight UTC" : ""
        }.`,
      ),
    );
    checks.push(
      check(
        "Results read",
        "ok",
        `${resultCount} saved result${resultCount === 1 ? "" : "s"} loaded in ${stored.mode} mode.`,
      ),
    );
    checks.push(
      check(
        "Goals and assists cache",
        playerStatsMatchCount > 0 ? "ok" : "warn",
        `${playerStatsMatchCount} completed match stat payload${
          playerStatsMatchCount === 1 ? "" : "s"
        } cached. ${playerStats.scorers.length} scorer row${
          playerStats.scorers.length === 1 ? "" : "s"
        }, ${playerStats.assists.length} assist row${
          playerStats.assists.length === 1 ? "" : "s"
        } aggregated.`,
      ),
    );
    checks.push(
      check(
        "Goals and assists budget",
        playerStatsBudget.exhausted ? "warn" : "ok",
        `${playerStatsBudget.count} of ${playerStatsBudget.cap} daily player-stat calls used${
          playerStatsBudget.exhausted ? "; refresh paused until midnight UTC" : ""
        }.`,
      ),
    );
    checks.push(
      check(
        "Manual override",
        manualOverride ? "warn" : "ok",
        manualOverride
          ? "Manual override is on; live API refreshes will not overwrite saved results."
          : "Manual override is off; live API refreshes are allowed.",
      ),
    );
  } catch (error) {
    checks.push(
      check(
        "Results read",
        "error",
        error instanceof Error ? error.message : "Could not read stored results.",
      ),
    );
  }

  const pollTier = resultsPollTier();
  const pollTtlSeconds = resultsPollTtlSeconds(pollTier);
  checks.push(
    check(
      "Results cache",
      "ok",
      `Schedule-aware polling is ${pollTier} right now; provider data refreshes at most every ${Math.round(pollTtlSeconds / 60)} min.`,
    ),
  );

  return NextResponse.json({
    status: overallStatus(checks),
    checkedAt: new Date().toISOString(),
    checks,
    data: {
      submissionCount,
      resultCount,
      resultsUpdatedAt,
      manualOverride,
      providerWarning,
      playerStatsMatchCount,
      playerStatsUpdatedAt,
      playerStatsWarning,
      playerStatsBudget,
      pollTier,
      pollTtlSeconds,
      providerBudget,
    },
  });
}
