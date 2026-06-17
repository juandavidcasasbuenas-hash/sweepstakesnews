"use client";

import {
  ChevronLeft,
  CircleQuestionMark,
  Medal,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { flagUrlFor } from "@/lib/team-flags";
import type { PlayerGoalAssistRow, PlayerStatsState, Tournament } from "@/types/game";

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

type GoalsAssistsProps = {
  tournament?: Tournament;
  embedded?: boolean;
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
}: GoalsAssistsProps) {
  const isDefaultTournament = tournament.slug === defaultTournament.slug;
  const gameHref = isDefaultTournament ? "/" : `/t/${tournament.slug}`;
  const insightsHref = isDefaultTournament ? "/insights" : `/t/${tournament.slug}/insights`;
  const goalsHref = isDefaultTournament ? "/goals-assists" : `/t/${tournament.slug}/goals-assists`;
  const heroImage = isDefaultTournament ? "/hero-banner-site.jpg" : "/tournament-generic-banner.png";
  const [stats, setStats] = useState<PlayerStatsState>(emptyPlayerStats);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

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
              rows.map((row) => (
                <tr key={`${row.player}-${row.team ?? "team"}`}>
                  <td>
                    <strong>{row.player}</strong>
                    <small>
                      <TeamFlag team={row.team} />
                      {row.team ?? "Team TBC"}
                    </small>
                  </td>
                  <td>{row.goals}</td>
                  <td>{row.assists}</td>
                </tr>
              ))
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
