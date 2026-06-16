import { NextResponse } from "next/server";
import { fixtures } from "@/data/fixtures";
import { avatarForName, fallbackColorForName, slugifyName } from "@/lib/avatars";
import { fixtureKickoffDate } from "@/lib/fixture-time";
import { getLiveResults } from "@/lib/results";
import { getSupabase } from "@/lib/supabase";
import {
  defaultTournamentSlug,
  readTournamentBySlug,
} from "@/lib/tournaments";
import { emptyBonuses, scoreSubmission } from "@/lib/tournament";
import type { Fixture, ResultMatch, Submission, TournamentResults } from "@/types/game";

type SubmissionRow = {
  payload: Submission;
};

type TitleRaceRequest = {
  submissions?: Submission[];
};

type StageBucket = {
  key: string;
  label: string;
  sub: string;
  short: string;
  fixtures: Fixture[];
};

function scoreComplete(score?: Pick<ResultMatch, "home" | "away">) {
  return typeof score?.home === "number" && typeof score.away === "number";
}

function fixtureTime(fixture: Fixture) {
  return fixtureKickoffDate(fixture)?.getTime() ?? new Date(`${fixture.date}T12:00:00Z`).getTime();
}

function shortName(name: string) {
  const clean = name.trim();
  if (clean.length <= 14) return clean;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return `${clean.slice(0, 12)}.`;
  return `${words[0]} ${words.at(-1)?.[0] ?? ""}.`.slice(0, 14);
}

function dateLabel(fixturesForStage: Fixture[]) {
  const dates = Array.from(new Set(fixturesForStage.map((fixture) => fixture.date))).sort();
  const format = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  if (!dates.length) return "";
  if (dates.length === 1) return format(dates[0]);
  return `${format(dates[0])}-${format(dates.at(-1)!)}`;
}

function stageLabel(stage: Fixture["stage"]) {
  const labels: Partial<Record<Fixture["stage"], [string, string]>> = {
    round32: ["Round of 32", "R32"],
    round16: ["Round of 16", "R16"],
    quarter: ["Quarter-finals", "QF"],
    semi: ["Semi-finals", "SF"],
    thirdPlace: ["Third place", "3RD"],
    final: ["The Final", "FINAL"],
  };
  return labels[stage];
}

function buildBuckets(): StageBucket[] {
  const groupBuckets = new Map<string, Fixture[]>();
  fixtures
    .filter((fixture) => fixture.stage === "group")
    .forEach((fixture) => {
      const bucket = groupBuckets.get(fixture.round) ?? [];
      bucket.push(fixture);
      groupBuckets.set(fixture.round, bucket);
    });

  const groups = Array.from(groupBuckets.entries())
    .map(([round, bucket]) => ({
      key: `group:${round}`,
      label: round,
      sub: "Group Stage",
      short: round.replace(/^Matchday\s+/i, "MD"),
      fixtures: bucket.sort((a, b) => fixtureTime(a) - fixtureTime(b)),
    }))
    .sort((a, b) => fixtureTime(a.fixtures[0]) - fixtureTime(b.fixtures[0]));

  const knockouts = (["round32", "round16", "quarter", "semi", "thirdPlace", "final"] as const)
    .reduce<StageBucket[]>((items, stage) => {
      const bucket = fixtures.filter((fixture) => fixture.stage === stage).sort((a, b) => fixtureTime(a) - fixtureTime(b));
      const label = stageLabel(stage);
      if (label && bucket.length) {
        items.push({
            key: stage,
            label: label[0],
            sub: stage === "final" ? "Champion crowned" : "Knockouts",
            short: label[1],
            fixtures: bucket,
        });
      }
      return items;
    }, []);

  return [...groups, ...knockouts];
}

async function readSubmissions(tournamentSlug: string) {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase.from("submissions").select("payload");

  if (tournamentSlug !== defaultTournamentSlug) {
    const tournament = await readTournamentBySlug(tournamentSlug);
    if (!tournament) throw new Error("Tournament not found");
    query = query.eq("tournament_id", tournament.id);
  } else {
    const tournament = await readTournamentBySlug(defaultTournamentSlug);
    if (tournament?.id && tournament.id !== defaultTournamentSlug) {
      query = query.or(`tournament_id.is.null,tournament_id.eq.${tournament.id}`);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SubmissionRow[]).map((row) => row.payload);
}

function resultsForFixtureIds(results: TournamentResults, fixtureIds: Set<number>) {
  const matches = Object.fromEntries(
    Object.entries(results.matches ?? {}).filter(
      ([fixtureId, result]) => fixtureIds.has(Number(fixtureId)) && scoreComplete(result),
    ),
  ) as TournamentResults["matches"];

  const finalComplete = scoreComplete(matches[104]);
  return {
    matches,
    bonuses: finalComplete ? results.bonuses : emptyBonuses(),
    updatedAt: results.updatedAt,
  } satisfies TournamentResults;
}

function buildRace(submissions: Submission[], results: TournamentResults) {
  const completeResultIds = new Set(
    Object.entries(results.matches ?? {})
      .filter(([, result]) => scoreComplete(result))
      .map(([fixtureId]) => Number(fixtureId)),
  );
  const allBuckets = buildBuckets();
  const completedBuckets = allBuckets.filter((bucket) =>
    bucket.fixtures.some((fixture) => completeResultIds.has(fixture.id)),
  );

  const buckets =
    completedBuckets.length > 0
      ? completedBuckets
      : [
          {
            key: "awaiting-results",
            label: "Awaiting results",
            sub: "Live scoring",
            short: "LIVE",
            fixtures: [],
          } satisfies StageBucket,
        ];

  const stages = [
    { lbl: "Kick-off", sub: "Race starts", date: "0 matches", sh: "START" },
    ...buckets.map((bucket) => ({
      lbl: bucket.label,
      sub: bucket.sub,
      date: bucket.fixtures.length ? dateLabel(bucket.fixtures) : "No scores yet",
      sh: bucket.short,
    })),
  ];

  const cumulativeIds = new Set<number>();
  const stageResults = buckets.map((bucket) => {
    bucket.fixtures.forEach((fixture) => {
      if (completeResultIds.has(fixture.id)) cumulativeIds.add(fixture.id);
    });
    return resultsForFixtureIds(results, cumulativeIds);
  });

  const colors = [
    "#1f6f4a",
    "#111111",
    "#c8001e",
    "#7a5cc0",
    "#e08a1e",
    "#0e7490",
    "#be185d",
    "#4338ca",
    "#047857",
    "#92400e",
    "#b45309",
    "#6b7280",
  ];

  const players = submissions
    .map((submission, index) => {
      const scores = [0, ...stageResults.map((partial) => scoreSubmission(submission, partial).total)];
      return {
        id: submission.id,
        slug: slugifyName(submission.name),
        name: submission.name,
        short: shortName(submission.name),
        avatar: avatarForName(submission.name),
        c: colors[index % colors.length] ?? fallbackColorForName(submission.name),
        g: scores.map((score, scoreIndex) => score - (scores[scoreIndex - 1] ?? 0)),
      };
    })
    .sort((a, b) => {
      const aTotal = a.g.reduce((sum, value) => sum + value, 0);
      const bTotal = b.g.reduce((sum, value) => sum + value, 0);
      return bTotal - aTotal || a.name.localeCompare(b.name);
    });

  return {
    stages,
    players,
    meta: {
      completedMatches: completeResultIds.size,
      totalMatches: fixtures.length,
      updatedAt: results.updatedAt,
    },
  };
}

function titleRacePayload(submissions: Submission[], resultsPayload: Awaited<ReturnType<typeof getLiveResults>>) {
  const race = buildRace(submissions, resultsPayload.results);
  return {
    ...race,
    mode: resultsPayload.mode,
    warning: resultsPayload.warning ?? resultsPayload.results.providerWarning,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tournamentSlug = url.searchParams.get("tournament")?.trim() || defaultTournamentSlug;
    const [submissions, resultsPayload] = await Promise.all([
      readSubmissions(tournamentSlug),
      getLiveResults(request),
    ]);

    return NextResponse.json(titleRacePayload(submissions, resultsPayload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not build title race" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as TitleRaceRequest;
    const submissions = Array.isArray(body.submissions) ? body.submissions : [];
    const resultsPayload = await getLiveResults(request);
    return NextResponse.json(titleRacePayload(submissions, resultsPayload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not build title race" },
      { status: 500 },
    );
  }
}
