"use client";

import {
  ChevronLeft,
  CircleQuestionMark,
  Medal,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { matchPlayerName } from "@/lib/player-names";
import { canonicalTeamName, flagUrlFor } from "@/lib/team-flags";
import type {
  PlayerGoalAssistRow,
  PlayerStatsState,
  Submission,
  Tournament,
  TournamentResults,
} from "@/types/game";

const localSubmissionsKey = "sweepstakes-news-submissions";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const emptyStatsDate = new Date(0).toISOString();
const emptyPlayerStats: PlayerStatsState = {
  scorers: [],
  assists: [],
  matchStats: {},
  updatedAt: emptyStatsDate,
};

const defaultTournament: Tournament = {
  id: "sweepstakes-news",
  slug: "sweepstakes-news",
  name: "Sweepstakes News",
  creatorName: null,
  createdAt: new Date(0).toISOString(),
};

type GoalsAssistsPayload = {
  mode?: string;
  stats?: PlayerStatsState;
  warning?: string;
  error?: string;
};

type SubmissionsPayload = {
  mode?: string;
  submissions?: Submission[];
};

type ResultsPayload = {
  results?: TournamentResults;
};

type GoalsAssistsProps = {
  tournament?: Tournament;
  embedded?: boolean;
  submissions?: Submission[];
};

function TeamFlag({ team }: { team?: string }) {
  const flag = team ? flagUrlFor(team) : "";
  return flag ? (
    <span className="flag" aria-hidden="true" style={{ backgroundImage: `url(${flag})` }} />
  ) : null;
}

export default function GoalsAssists({
  tournament = defaultTournament,
  embedded = false,
  submissions: submissionsProp,
}: GoalsAssistsProps) {
  const isDefaultTournament = tournament.slug === defaultTournament.slug;
  const gameHref = isDefaultTournament ? "/" : `/t/${tournament.slug}`;
  const insightsHref = isDefaultTournament ? "/insights" : `/t/${tournament.slug}/insights`;
  const goalsHref = isDefaultTournament ? "/goals-assists" : `/t/${tournament.slug}/goals-assists`;
  const heroImage = isDefaultTournament ? "/hero-banner-site.jpg" : "/tournament-generic-banner.png";
  const submissionsUrl = isDefaultTournament
    ? "/api/submissions"
    : `/api/submissions?tournament=${encodeURIComponent(tournament.slug)}`;
  const scopedSubmissionsKey = isDefaultTournament
    ? localSubmissionsKey
    : `${localSubmissionsKey}:${tournament.slug}`;
  const [stats, setStats] = useState<PlayerStatsState>(emptyPlayerStats);
  const [matches, setMatches] = useState<TournamentResults["matches"]>({});
  const [fetchedSubmissions, setFetchedSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  // When embedded the parent already has submissions; standalone fetches its own.
  const submissions = submissionsProp ?? fetchedSubmissions;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goals-assists", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: GoalsAssistsPayload) => {
        if (cancelled) return;
        if (payload.stats) setStats(payload.stats);
        setStatus(payload.warning ?? payload.error ?? payload.stats?.providerWarning ?? "");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load goals and assists");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/results", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: ResultsPayload) => {
        if (!cancelled && payload.results?.matches) setMatches(payload.results.matches);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (submissionsProp) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setFetchedSubmissions((current) =>
        current.length ? current : readLocal<Submission[]>(scopedSubmissionsKey, []),
      );
    });
    fetch(submissionsUrl)
      .then((response) => response.json())
      .then((payload: SubmissionsPayload) => {
        if (cancelled) return;
        if (Array.isArray(payload.submissions) && payload.submissions.length) {
          setFetchedSubmissions(payload.submissions);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scopedSubmissionsKey, submissionsProp, submissionsUrl]);

  // Map each leading scorer to the people who predicted them as top scorer,
  // matching hand-typed names against the validated scorer list.
  const topScorerPredictors = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!submissions.length || !stats.scorers.length) return map;
    const candidateNames = stats.scorers.map((row) => row.player);
    submissions.forEach((submission) => {
      const pick = submission.bonuses?.topScorer?.trim();
      if (!pick) return;
      const canonical = matchPlayerName(pick, candidateNames);
      if (!canonical) return;
      const key = canonical.toLowerCase();
      const backers = map.get(key) ?? [];
      if (!backers.includes(submission.name)) backers.push(submission.name);
      map.set(key, backers);
    });
    return map;
  }, [stats.scorers, submissions]);

  const rows = useMemo(() => {
    const merged = new Map<string, PlayerGoalAssistRow>();
    [...stats.scorers, ...stats.assists].forEach((row) => {
      const key = `${row.player.toLowerCase()}|${row.team?.toLowerCase() ?? ""}`;
      const existing = merged.get(key);
      merged.set(key, existing ? { ...existing, ...row } : row);
    });
    return [...merged.values()]
      .sort(
        (a, b) =>
          b.goals - a.goals ||
          b.assists - a.assists ||
          a.player.localeCompare(b.player),
      )
      .slice(0, 10);
  }, [stats.assists, stats.scorers]);

  // Goals by country, summed from the authoritative match results (the scorer
  // feed is sparse — many goals have no attributed scorer). No extra API calls.
  const countryGoals = useMemo(() => {
    const totals = new Map<string, number>();
    Object.values(matches).forEach((match) => {
      if (match.status === "scheduled") return;
      if (match.team1 && typeof match.home === "number") {
        totals.set(match.team1, (totals.get(match.team1) ?? 0) + match.home);
      }
      if (match.team2 && typeof match.away === "number") {
        totals.set(match.team2, (totals.get(match.team2) ?? 0) + match.away);
      }
    });
    return [...totals.entries()]
      .map(([team, goals]) => ({ team, goals }))
      .filter((row) => row.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.team.localeCompare(b.team))
      .slice(0, 10);
  }, [matches]);

  // Who predicted each team to score the most goals (matched on canonical name).
  const mostGoalsPredictors = useMemo(() => {
    const map = new Map<string, string[]>();
    submissions.forEach((submission) => {
      const pick = submission.bonuses?.mostGoalsTeam?.trim();
      if (!pick) return;
      const key = (canonicalTeamName(pick) ?? pick).toLowerCase();
      const backers = map.get(key) ?? [];
      if (!backers.includes(submission.name)) backers.push(submission.name);
      map.set(key, backers);
    });
    return map;
  }, [submissions]);

  const body = (
    <>
      {status ? <p className="export-notice">{status}</p> : null}
      <section className="panel ga-table-panel">
        <div className="section-title">
          <span className="title-icon"><Trophy size={18} /></span>
          <div>
            <h2>Top 10 Goals & Assists</h2>
          </div>
        </div>
        <table className="ga-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Goals</th>
              <th scope="col">Assists</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => {
                const predictors = topScorerPredictors.get(row.player.toLowerCase()) ?? [];
                return (
                  <tr key={`${row.player}-${row.team ?? "team"}`}>
                    <td>
                      <span className="ga-player-line">
                        <strong>{row.player}</strong>
                        <small>
                          <TeamFlag team={row.team} />
                          {row.team ?? "Team TBC"}
                        </small>
                      </span>
                      {predictors.length ? (
                        <span className="ga-predictors" title="Picked as top scorer by">
                          {predictors.map((name) => (
                            <span key={name} className="ga-pred-pill">{name}</span>
                          ))}
                        </span>
                      ) : null}
                    </td>
                    <td>{row.goals}</td>
                    <td>{row.assists}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3}>
                  {loading ? "Loading goals and assists..." : "No completed match event data has been cached yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel ga-table-panel">
        <div className="section-title">
          <span className="title-icon"><Medal size={18} /></span>
          <div>
            <h2>Top 10 Countries by Goals</h2>
          </div>
        </div>
        <table className="ga-table">
          <thead>
            <tr>
              <th scope="col">Country</th>
              <th scope="col">Goals</th>
            </tr>
          </thead>
          <tbody>
            {countryGoals.length ? (
              countryGoals.map((row) => {
                const predictors = mostGoalsPredictors.get(row.team.toLowerCase()) ?? [];
                return (
                  <tr key={row.team}>
                    <td>
                      <span className="ga-player-line">
                        <TeamFlag team={row.team} />
                        <strong>{row.team}</strong>
                      </span>
                      {predictors.length ? (
                        <span className="ga-predictors" title="Picked as the top-scoring team by">
                          {predictors.map((name) => (
                            <span key={name} className="ga-pred-pill">{name}</span>
                          ))}
                        </span>
                      ) : null}
                    </td>
                    <td>{row.goals}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={2}>
                  {loading ? "Loading goals..." : "No completed match event data has been cached yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );

  if (embedded) {
    return (
      <div className="app-shell ga-shell">
        <div className="main-column">{body}</div>
      </div>
    );
  }

  return (
    <main className="arena-layout">
      <aside className="tournament-rail">
        <div className="rail-brand">
          <span className="rail-crest" aria-hidden="true">
            <Image
              src="/football-logo.png"
              alt=""
              width={52}
              height={52}
              loading="eager"
              className="rail-logo-image"
            />
          </span>
          <div className="rail-brand-copy">
            <strong>{tournament.name}</strong>
            <span>World Cup 2026</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Main sections">
          <a className="tab-link" href={gameHref}>
            <ChevronLeft size={18} />
            <span>Back to the game</span>
          </a>
          <a className="tab-link active" href={goalsHref} aria-current="page">
            <Medal size={18} />
            <span>Goals & Assists</span>
          </a>
          <a className="tab-link" href={insightsHref}>
            <CircleQuestionMark size={18} />
            <span>Fun facts</span>
          </a>
        </nav>
        <div className="rail-note">
          <span>Refresh rhythm</span>
          <strong>Nightly from cached match stats</strong>
        </div>
      </aside>

      <div className="arena-main">
        <section className="hero">
          <Image
            src={heroImage}
            alt=""
            fill
            priority
            sizes="(min-width: 900px) calc(100vw - 236px), 100vw"
            className="hero-image"
          />
          <div className="hero-overlay" />
          <div className="hero-content">
            <h1>{"Goals\nAssists"}</h1>
          </div>
        </section>

        <div className="app-shell ga-shell">
          <div className="main-column">{body}</div>
        </div>
      </div>
    </main>
  );
}
