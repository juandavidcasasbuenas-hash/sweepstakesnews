"use client";

import {
  BarChart3,
  ChevronLeft,
  Crown,
  Drama,
  Flame,
  Handshake,
  Medal,
  Scale,
  Snowflake,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  buildPoolInsights,
  leaders,
  type EntryInsight,
  type MatchSplit,
  type PoolInsights,
} from "@/lib/insights";
import { flagUrlFor } from "@/lib/team-flags";
import type { Submission, Tournament } from "@/types/game";

const localSubmissionsKey = "sweepstakes-news-submissions";

const defaultTournament: Tournament = {
  id: "sweepstakes-news",
  slug: "sweepstakes-news",
  name: "Sweepstakes News",
  creatorName: null,
  createdAt: new Date(0).toISOString(),
};

type SubmissionsPayload = {
  mode?: string;
  submissions?: Submission[];
};

type PredictionInsightsProps = {
  tournament?: Tournament;
};

function readLocal<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function TeamFlag({ team }: { team: string }) {
  const flag = flagUrlFor(team);
  return flag ? (
    <span className="flag" aria-hidden="true" style={{ backgroundImage: `url(${flag})` }} />
  ) : null;
}

function nameList(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function entriesLabel(count: number) {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function BarRow({
  label,
  value,
  max,
  detail,
  team,
}: {
  label: string;
  value: number;
  max: number;
  detail?: string;
  team?: string;
}) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="ins-bar-row">
      <div className="ins-bar-head">
        <span className="ins-bar-label">
          {team ? <TeamFlag team={team} /> : null}
          <strong>{label}</strong>
        </span>
        <b className="ins-bar-value">{detail ?? value}</b>
      </div>
      <div className="ins-bar-track">
        <span className="ins-bar-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function InsightCard({
  icon,
  eyebrow,
  title,
  note,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <article className="ins-card">
      <span className="ins-card-icon">{icon}</span>
      <span className="eyebrow">{eyebrow}</span>
      <strong>{title}</strong>
      <small>{note}</small>
    </article>
  );
}

function SectionTitle({
  icon,
  eyebrow,
  title,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="section-title">
      <span className="title-icon">{icon}</span>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function MatchSplitCard({
  split,
  flavour,
}: {
  split: MatchSplit;
  flavour: "agreed" | "divisive";
}) {
  const rows = [
    { label: `${split.team1} win`, count: split.homeWins, team: split.team1 },
    { label: "Draw", count: split.draws },
    { label: `${split.team2} win`, count: split.awayWins, team: split.team2 },
  ];
  return (
    <article className="ins-split-card">
      <span className="eyebrow">{flavour === "agreed" ? "Strongest consensus" : "Most divisive match"}</span>
      <h3 className="ins-split-title">
        <span className="team-label"><TeamFlag team={split.team1} />{split.team1}</span>
        <em>vs</em>
        <span className="team-label"><TeamFlag team={split.team2} />{split.team2}</span>
      </h3>
      <small className="ins-split-meta">{split.round}{split.group ? ` · Group ${split.group}` : ""}</small>
      <div className="ins-bar-list">
        {rows.map((row) => (
          <BarRow
            key={row.label}
            label={row.label}
            value={row.count}
            max={split.total}
            detail={plural(row.count, "pick")}
            team={row.team}
          />
        ))}
      </div>
      <small className="ins-note">
        {flavour === "agreed"
          ? `${pct(split.topShare)} of the pool sees this one the same way${
              split.commonScore && split.commonScoreCount > 1
                ? `, and ${split.commonScoreCount} even typed the identical ${split.commonScore}`
                : ""
            }.`
          : "Nobody can agree on this one. Somebody is going to look very silly."}
      </small>
    </article>
  );
}

export default function PredictionInsights({ tournament = defaultTournament }: PredictionInsightsProps) {
  const isDefaultTournament = tournament.slug === defaultTournament.slug;
  const submissionsUrl = isDefaultTournament
    ? "/api/submissions"
    : `/api/submissions?tournament=${encodeURIComponent(tournament.slug)}`;
  const scopedSubmissionsKey = isDefaultTournament
    ? localSubmissionsKey
    : `${localSubmissionsKey}:${tournament.slug}`;
  const heroImage = isDefaultTournament ? "/hero-banner-site.jpg" : "/tournament-generic-banner.png";
  const gameHref = isDefaultTournament ? "/" : `/t/${tournament.slug}`;

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setSubmissions((current) =>
          current.length ? current : readLocal<Submission[]>(scopedSubmissionsKey, []),
        );
      }
    });
    fetch(submissionsUrl)
      .then((response) => response.json())
      .then((payload: SubmissionsPayload) => {
        if (cancelled) return;
        if (Array.isArray(payload.submissions) && payload.mode === "supabase") {
          setSubmissions(payload.submissions);
        } else if (payload.submissions?.length) {
          setSubmissions((current) => {
            const merged = [...(payload.submissions ?? [])];
            current.forEach((submission) => {
              if (!merged.some((item) => item.id === submission.id || item.name === submission.name)) {
                merged.push(submission);
              }
            });
            return merged;
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scopedSubmissionsKey, submissionsUrl]);

  const insights: PoolInsights | null = useMemo(
    () => (submissions.length ? buildPoolInsights(submissions) : null),
    [submissions],
  );

  const goalRanking = useMemo(
    () => (insights ? [...insights.entries].sort((a, b) => b.avgGoals - a.avgGoals) : []),
    [insights],
  );

  const superlatives = useMemo(() => {
    if (!insights) return [];
    const { entries, entryCount } = insights;
    const cards: Array<{ key: string; icon: ReactNode; eyebrow: string; title: string; note: string }> = [];

    const drama = leaders(entries, (entry) => entry.shootouts);
    if (drama && drama.value > 0) {
      cards.push({
        key: "drama",
        icon: <Drama size={20} />,
        eyebrow: "The drama magnet",
        title: nameList(drama.entries.map((entry) => entry.name)),
        note: `Predicted ${plural(drama.value, "penalty shootout")}. Bring spare fingernails.`,
      });
    }

    const fence = leaders(entries, (entry) => entry.groupDraws);
    if (fence && fence.value > 0) {
      cards.push({
        key: "fence",
        icon: <Scale size={20} />,
        eyebrow: "The fence-sitter",
        title: nameList(fence.entries.map((entry) => entry.name)),
        note: `Called ${plural(fence.value, "group-stage draw")}. Commitment issues, perhaps.`,
      });
    }

    const bore = leaders(entries, (entry) => entry.nilNils);
    if (bore && bore.value > 0) {
      cards.push({
        key: "bore",
        icon: <Snowflake size={20} />,
        eyebrow: "Bore-draw merchant",
        title: nameList(bore.entries.map((entry) => entry.name)),
        note: `Went 0–0 ${bore.value} time${bore.value === 1 ? "" : "s"}. Thrilling stuff.`,
      });
    }

    const demolition = leaders(entries, (entry) => entry.biggestMargin?.margin ?? null);
    const demolitionEntry = demolition?.entries[0];
    if (demolition && demolitionEntry?.biggestMargin && demolition.value >= 3) {
      const highlight = demolitionEntry.biggestMargin;
      cards.push({
        key: "demolition",
        icon: <Zap size={20} />,
        eyebrow: "Demolition forecast",
        title: nameList(demolition.entries.map((entry) => entry.name)),
        note: `Sees ${highlight.team1} ${highlight.score} ${highlight.team2} in the ${highlight.round}. Brutal.`,
      });
    }

    const wildest = leaders(entries, (entry) => entry.wildestScoreline?.goals ?? null);
    const wildestEntry = wildest?.entries[0];
    if (wildest && wildestEntry?.wildestScoreline && wildest.value >= 5) {
      const highlight = wildestEntry.wildestScoreline;
      cards.push({
        key: "wildest",
        icon: <Flame size={20} />,
        eyebrow: "Wildest scoreline",
        title: `${highlight.team1} ${highlight.score} ${highlight.team2}`,
        note: `${nameList(wildest.entries.map((entry) => entry.name))} promises ${highlight.goals} goals in the ${highlight.round}.`,
      });
    }

    if (entryCount >= 3) {
      const maverick = leaders(entries, (entry) => entry.agreement, "min");
      const crowd = leaders(entries, (entry) => entry.agreement, "max");
      if (maverick && crowd && maverick.value !== crowd.value) {
        cards.push({
          key: "maverick",
          icon: <Sparkles size={20} />,
          eyebrow: "The maverick",
          title: nameList(maverick.entries.map((entry) => entry.name)),
          note: `Agrees with the crowd on just ${pct(maverick.value)} of group results. Genius or chaos — no in-between.`,
        });
        cards.push({
          key: "crowd",
          icon: <Users size={20} />,
          eyebrow: "The crowd surfer",
          title: nameList(crowd.entries.map((entry) => entry.name)),
          note: `Matches the room on ${pct(crowd.value)} of group results. Safety in numbers.`,
        });
      }
    }

    if (insights.twins && insights.entryCount >= 2) {
      cards.push({
        key: "twins",
        icon: <Handshake size={20} />,
        eyebrow: "Separated at birth",
        title: `${insights.twins.nameA} & ${insights.twins.nameB}`,
        note: `Typed the identical score in ${insights.twins.matching} of ${insights.twins.compared} matches (${pct(insights.twins.pct)}). Suspicious.`,
      });
    }
    if (
      insights.opposites &&
      insights.entryCount >= 3 &&
      insights.twins &&
      insights.opposites.pct < insights.twins.pct
    ) {
      cards.push({
        key: "opposites",
        icon: <Swords size={20} />,
        eyebrow: "Parallel universes",
        title: `${insights.opposites.nameA} & ${insights.opposites.nameB}`,
        note: `Agreed on the exact score just ${insights.opposites.matching} time${insights.opposites.matching === 1 ? "" : "s"} out of ${insights.opposites.compared}. One of them is wrong about everything.`,
      });
    }

    return cards;
  }, [insights]);

  const championMax = insights?.champions[0]?.count ?? 0;
  const semiMax = insights?.semiFinalists[0]?.count ?? 0;
  const scorelineMax = insights?.topScorelines[0]?.count ?? 0;

  const goalLeader = goalRanking[0];
  const goalMin = goalRanking[goalRanking.length - 1];

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
          <a className="tab-link active" href="#" aria-current="page" onClick={(event) => event.preventDefault()}>
            <BarChart3 size={18} />
            <span>Fun facts</span>
          </a>
        </nav>
        <div className="rail-note">
          <span>Built from</span>
          <strong>{entriesLabel(submissions.length)} locked in</strong>
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
            <h1>{"Fun\nFacts"}</h1>
          </div>
        </section>

        <div className="app-shell">
          <div className="main-column">
            {loading && !insights ? (
              <section className="panel">
                <p className="muted">Crunching everyone&apos;s predictions…</p>
              </section>
            ) : !insights ? (
              <section className="panel">
                <SectionTitle icon={<BarChart3 size={18} />} eyebrow="Nothing to crunch yet" title="No entries" />
                <p className="muted">
                  Once people submit their predictions, this page fills up with the pool&apos;s
                  hottest takes. <a className="ins-inline-link" href={gameHref}>Head back to the game</a> and get yours in.
                </p>
              </section>
            ) : (
              <>
                <section className="panel">
                  <SectionTitle icon={<BarChart3 size={18} />} eyebrow="The pool by the numbers" title="Headline stats" />
                  <div className="ins-metrics">
                    <article className="ins-metric">
                      <span>Entries</span>
                      <b>{insights.entryCount}</b>
                      <small>brave souls</small>
                    </article>
                    <article className="ins-metric">
                      <span>Goals predicted</span>
                      <b>{insights.totalGoals.toLocaleString()}</b>
                      <small>across {plural(insights.totalPicks, "pick")}</small>
                    </article>
                    <article className="ins-metric">
                      <span>Avg per match</span>
                      <b>{insights.avgGoalsPerMatch.toFixed(2)}</b>
                      <small>pool-wide goal diet</small>
                    </article>
                    <article className="ins-metric">
                      <span>Shootouts called</span>
                      <b>{insights.totalShootouts}</b>
                      <small>penalty dramas predicted</small>
                    </article>
                  </div>
                </section>

                {insights.champions.length > 0 ? (
                  <section className="panel">
                    <SectionTitle icon={<Crown size={18} />} eyebrow="The big one" title="Who lifts the trophy?" />
                    <div className="ins-bar-list">
                      {insights.champions.map((item) => (
                        <div key={item.team} className="ins-bar-block">
                          <BarRow
                            label={item.team}
                            team={item.team}
                            value={item.count}
                            max={championMax}
                            detail={plural(item.count, "vote")}
                          />
                          <small className="ins-backers">{nameList(item.backers)}</small>
                        </div>
                      ))}
                    </div>
                    {insights.darkHorses.length > 0 && insights.entryCount >= 3 ? (
                      <p className="ins-note">
                        Lone-wolf picks: {insights.darkHorses
                          .map((item) => `${item.backers[0]} is the only one backing ${item.team}`)
                          .join("; ")}. Maximum bragging rights if it lands.
                      </p>
                    ) : null}
                  </section>
                ) : null}

                <section className="panel">
                  <SectionTitle icon={<Flame size={18} />} eyebrow="Optimists vs pessimists" title="Goal fests & bore fests" />
                  <p className="ins-note ins-note-lead">
                    Average goals per match each player has pencilled in across their whole tournament.
                  </p>
                  <div className="ins-bar-list">
                    {goalRanking.map((entry: EntryInsight) => {
                      const isTop = goalLeader && entry.avgGoals === goalLeader.avgGoals;
                      const isBottom =
                        goalMin && entry.avgGoals === goalMin.avgGoals && goalRanking.length > 1;
                      return (
                        <div key={entry.id} className="ins-bar-block">
                          <BarRow
                            label={entry.name}
                            value={entry.avgGoals}
                            max={goalLeader?.avgGoals ?? 1}
                            detail={`${entry.avgGoals.toFixed(2)} per match`}
                          />
                          <small className="ins-backers">
                            {entry.totalGoals} goals total
                            {isTop && !isBottom ? " · 🎆 goal-fest dreamer" : ""}
                            {isBottom && !isTop ? " · 🥶 bore-fest forecaster" : ""}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {superlatives.length > 0 ? (
                  <section className="panel">
                    <SectionTitle icon={<Medal size={18} />} eyebrow="Hall of fame & shame" title="Pool superlatives" />
                    <div className="ins-cards">
                      {superlatives.map((card) => (
                        <InsightCard
                          key={card.key}
                          icon={card.icon}
                          eyebrow={card.eyebrow}
                          title={card.title}
                          note={card.note}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {insights.entryCount >= 2 && (insights.mostAgreedMatch || insights.mostDivisiveMatch) ? (
                  <section className="panel">
                    <SectionTitle icon={<Users size={18} />} eyebrow="Group-stage groupthink" title="Consensus corner" />
                    <div className="ins-split-grid">
                      {insights.mostAgreedMatch ? (
                        <MatchSplitCard split={insights.mostAgreedMatch} flavour="agreed" />
                      ) : null}
                      {insights.mostDivisiveMatch &&
                      insights.mostDivisiveMatch.fixtureId !== insights.mostAgreedMatch?.fixtureId ? (
                        <MatchSplitCard split={insights.mostDivisiveMatch} flavour="divisive" />
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {insights.topScorelines.length > 0 ? (
                  <section className="panel">
                    <SectionTitle icon={<Zap size={18} />} eyebrow="Scoreline obsessions" title="The pool's favourite scores" />
                    <div className="ins-bar-list">
                      {insights.topScorelines.map((item) => (
                        <BarRow
                          key={item.score}
                          label={item.score}
                          value={item.count}
                          max={scorelineMax}
                          detail={plural(item.count, "pick")}
                        />
                      ))}
                    </div>
                    <p className="ins-note">
                      {insights.topScorelines[0]
                        ? `${insights.topScorelines[0].score} appears ${insights.topScorelines[0].count} times across everyone's brackets. Imagination is dead.`
                        : ""}
                    </p>
                  </section>
                ) : null}

                {insights.semiFinalists.length > 0 ? (
                  <section className="panel">
                    <SectionTitle icon={<Trophy size={18} />} eyebrow="Deep-run darlings" title="Final four favourites" />
                    <p className="ins-note ins-note-lead">
                      How many entries have each team reaching the semi-finals.
                    </p>
                    <div className="ins-bar-list">
                      {insights.semiFinalists.slice(0, 8).map((item) => (
                        <BarRow
                          key={item.team}
                          label={item.team}
                          team={item.team}
                          value={item.count}
                          max={semiMax}
                          detail={entriesLabel(item.count)}
                        />
                      ))}
                    </div>
                    {insights.finalists.length > 0 ? (
                      <div className="ins-chips">
                        <span className="ins-chips-label">Booked into the final:</span>
                        {insights.finalists.slice(0, 6).map((item) => (
                          <span key={item.team} className="team-pill">
                            <TeamFlag team={item.team} />
                            {item.team} ×{item.count}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {insights.bonusTopScorers.length > 0 ||
                insights.bonusGoldenBalls.length > 0 ||
                insights.bonusMostGoalsTeams.length > 0 ? (
                  <section className="panel">
                    <SectionTitle icon={<Medal size={18} />} eyebrow="Side bets" title="Bonus pick battle" />
                    <div className="ins-bonus-grid">
                      <div className="ins-bonus-col">
                        <h3>Top scorer</h3>
                        {insights.bonusTopScorers.map((item) => (
                          <div key={item.label} className="ins-bonus-row">
                            <strong>{item.label}</strong>
                            <small>{nameList(item.backers)}</small>
                            <b>×{item.count}</b>
                          </div>
                        ))}
                      </div>
                      <div className="ins-bonus-col">
                        <h3>Golden ball</h3>
                        {insights.bonusGoldenBalls.map((item) => (
                          <div key={item.label} className="ins-bonus-row">
                            <strong>{item.label}</strong>
                            <small>{nameList(item.backers)}</small>
                            <b>×{item.count}</b>
                          </div>
                        ))}
                      </div>
                      <div className="ins-bonus-col">
                        <h3>Most goals (team)</h3>
                        {insights.bonusMostGoalsTeams.map((item) => (
                          <div key={item.label} className="ins-bonus-row">
                            <strong>
                              <TeamFlag team={item.label} />
                              {item.label}
                            </strong>
                            <small>{nameList(item.backers)}</small>
                            <b>×{item.count}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                ) : null}

                <p className="ins-footer-note muted">
                  All facts are computed live from the locked entries — scores on the pitch don&apos;t
                  change anything here, only the takes people committed to.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
