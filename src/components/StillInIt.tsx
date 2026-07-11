"use client";

import { ChevronRight, Newspaper, Skull, Sparkles } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { avatarForName, fallbackColorForName, initialsForName } from "@/lib/avatars";
import {
  crunchStillInIt,
  type PlayerVerdict,
  type Scenario,
  type ScenarioMatchEvent,
  type StillInItReport,
} from "@/lib/still-in-it";
import type { Submission, TournamentResults } from "@/types/game";

type Pins = Record<number, [string | null, string | null]>;
type Chapter = "dream" | "nightmare";

const CATEGORY_LABELS = {
  topScorer: "Golden Boot",
  goldenBall: "Golden Ball",
  mostGoalsTeam: "most-goals-team prize",
} as const;

function Avatar({ name }: { name: string }) {
  const src = avatarForName(name);
  return src ? (
    <Image src={src} alt="" width={150} height={150} />
  ) : (
    <span style={{ background: fallbackColorForName(name) }}>{initialsForName(name)}</span>
  );
}

function ordinal(value: number) {
  const suffix =
    value % 10 === 1 && value % 100 !== 11
      ? "st"
      : value % 10 === 2 && value % 100 !== 12
        ? "nd"
        : value % 10 === 3 && value % 100 !== 13
          ? "rd"
          : "th";
  return `${value}${suffix}`;
}

function shortDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function formatFutures(value: number) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)} billion`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} million`;
  return value.toLocaleString("en-GB");
}

function eventHeadline(event: ScenarioMatchEvent, chapter: Chapter) {
  const exact = event.gains.some((gain) => gain.label.startsWith("Exact score"));
  if (exact) return "As written on the coupon";
  if (event.gains.some((gain) => gain.label.startsWith("Called"))) {
    return `${event.winner} obey the prophecy`;
  }
  if (event.points > 0) return "Crumbs from the big table";
  return chapter === "dream" ? "Elsewhere, results happen" : "Nothing for you here";
}

// Animated futures counter for the suspense beat: the number is real, the
// drama is in the pacing.
function useCountUp(target: number, active: boolean, durationMs = 2100) {
  const [value, setValue] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active || !target) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setDone(true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, durationMs]);
  return { value, done };
}

function FrontPageImage({ name, mode }: { name: string; mode: Chapter }) {
  const cache = useRef(new Map<string, string | null>());
  const [image, setImage] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const key = `${name}:${mode}`;
    if (cache.current.has(key)) {
      setImage(cache.current.get(key));
      return;
    }
    let cancelled = false;
    setImage(undefined);
    fetch("/api/still-in-it/front-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mode }),
    })
      .then((response) => response.json())
      .then((payload: { image?: string | null }) => {
        cache.current.set(key, payload.image ?? null);
        if (!cancelled) setImage(payload.image ?? null);
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [name, mode]);

  if (image === null) return null;
  return (
    <div className={`still-photo ${image ? "loaded" : "loading"}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={image} alt={`${mode === "dream" ? "Triumphant" : "Dejected"} front-page photo of ${name}`} />
      ) : (
        <div className="still-photo-develop">
          <span>PHOTO DESK</span>
          <em>developing picture…</em>
        </div>
      )}
    </div>
  );
}

function DemandsPanel({ verdict }: { verdict: PlayerVerdict }) {
  const musts = verdict.requirements.filter((item) => item.kind === "must");
  const flexible = verdict.requirements.filter((item) => item.kind === "either");
  const bets = verdict.dream.bonuses.filter((bonus) => bonus.points > 0);

  if (!verdict.canWin) {
    return verdict.deadBonuses.length ? (
      <div className="still-demands">
        <h3>The obituaries</h3>
        <ul>
          {verdict.deadBonuses.map((bonus) => (
            <li key={bonus.category} className="dead">
              <b>DEAD</b>
              <s>
                {bonus.value} — your {CATEGORY_LABELS[bonus.category]} ticket
              </s>
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  }

  return (
    <div className="still-demands">
      <h3>The demands</h3>
      <p className="still-demands-strap">
        The title survives in <b>{verdict.winningBrackets}</b> of the{" "}
        <b>{verdict.requirements.length ? 2 ** verdict.requirements.length : "—"}</b> remaining
        brackets. Here are the terms.
      </p>
      <ul>
        {musts.map((item) => (
          <li key={item.fixtureId} className="must">
            <b>MUST</b>
            <span>
              <strong>{item.winner}</strong> win the {item.round.toLowerCase()}
              {item.team1 && item.team2 ? ` (${item.team1} v ${item.team2})` : ""} —{" "}
              {shortDate(item.date)}
            </span>
          </li>
        ))}
        {flexible.length > 0 && (
          <li className="flex">
            <b>&amp;</b>
            <span>
              The other {flexible.length === 1 ? "match" : `${flexible.length} matches`} can break
              more than one way — in the right combination.
            </span>
          </li>
        )}
        {bets.map((bonus) => (
          <li key={bonus.category} className="bet">
            <b>+{bonus.points}</b>
            <span>
              <strong>{bonus.value}</strong> takes the {CATEGORY_LABELS[bonus.category]}
              {bonus.sharers.length ? ` (shared with ${bonus.sharers.join(", ")})` : ""}
            </span>
          </li>
        ))}
        {verdict.deadBonuses.map((bonus) => (
          <li key={`dead-${bonus.category}`} className="dead">
            <b>DEAD</b>
            <s>
              {bonus.value} — your {CATEGORY_LABELS[bonus.category]} ticket
            </s>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditionPage({
  verdict,
  chapter,
  scenario,
}: {
  verdict: PlayerVerdict;
  chapter: Chapter;
  scenario: Scenario;
}) {
  const name = verdict.name.toUpperCase();
  const headline =
    chapter === "dream"
      ? verdict.canWinOutright
        ? `${name} WINS THE LOT`
        : verdict.canWin
          ? `${name} FORCES A SHARE OF THE CROWN`
          : `BEST CASE: ${ordinal(scenario.position).toUpperCase()} PLACE`
      : scenario.position === 1
        ? `UNTOUCHABLE: ${name} SURVIVES EVERYTHING`
        : `${name} SINKS TO ${ordinal(scenario.position).toUpperCase()}`;
  const deck =
    chapter === "dream"
      ? verdict.canWin
        ? `Every result lands right and the pool ends ${scenario.total} points to ${
            scenario.total - scenario.margin
          }. ${scenario.margin > 0 ? `Winning margin: ${scenario.margin}.` : "Honours shared at the summit."}`
        : `Even the kindest remaining fortnight tops out at ${scenario.total} points — ${Math.abs(
            scenario.margin,
          )} short of the crown.`
      : scenario.position === 1
        ? `The worst fortnight the presses could print still leaves ${verdict.name} on top with ${scenario.total}.`
        : `The cruellest legal sequence of results drops ${verdict.name} to ${scenario.total} points, ${Math.abs(
            scenario.margin,
          )} behind the front.`;
  const finalDate = scenario.matches[scenario.matches.length - 1]?.date ?? "2026-07-19";

  return (
    <article className={`still-edition-page ${chapter}`}>
      <header className="still-edition-masthead">
        <span>{chapter === "dream" ? "THE DREAM EDITION" : "THE NIGHTMARE EDITION"}</span>
        <span>{shortDate(finalDate)} · 20p</span>
      </header>
      <div className="still-hero">
        <FrontPageImage name={verdict.name} mode={chapter} />
        <div className="still-hero-text">
          <p className="still-hero-kicker">
            {chapter === "dream" ? "World exclusive · from our futures desk" : "Grim reading · from our futures desk"}
          </p>
          <h3>{headline}</h3>
          <p className="still-hero-deck">{deck}</p>
        </div>
      </div>

      <div className="still-timeline">
        {scenario.matches.map((event, index) => (
          <article key={event.fixtureId}>
            <div className="still-event-number">{String(index + 1).padStart(2, "0")}</div>
            <small>
              {event.round} · {shortDate(event.date)}
            </small>
            <h4>{eventHeadline(event, chapter)}</h4>
            <p className="still-scorecard">
              {event.team1} <b>{event.home}–{event.away}</b> {event.team2}
              {event.penalties && <em> {event.winner} on pens</em>}
            </p>
            {event.gains.length > 0 && (
              <ul>
                {event.gains.map((gain) => (
                  <li key={gain.label}>
                    {gain.label} <b>+{gain.points}</b>
                  </li>
                ))}
              </ul>
            )}
            <b className={`still-event-total ${event.points ? "" : "nil"}`}>
              {event.points ? `+${event.points}` : "—"}
            </b>
          </article>
        ))}
        {scenario.bonuses.length > 0 && (
          <article key="bonuses">
            <div className="still-event-number">FT</div>
            <small>Full time · the awards</small>
            <h4>{chapter === "dream" ? "The coupon pays out" : "The wrong tickets pay out"}</h4>
            <ul>
              {scenario.bonuses.map((bonus) =>
                chapter === "dream" ? (
                  <li key={bonus.category}>
                    {bonus.value} takes the {CATEGORY_LABELS[bonus.category]} <b>+{bonus.points}</b>
                  </li>
                ) : (
                  <li key={bonus.category}>
                    {bonus.value
                      ? `${bonus.value} takes the ${CATEGORY_LABELS[bonus.category]} — points to ${
                          bonus.sharers.join(", ") || "nobody"
                        }`
                      : `The ${CATEGORY_LABELS[bonus.category]} lands on nobody's coupon`}
                  </li>
                ),
              )}
            </ul>
            <b className={`still-event-total ${chapter === "dream" ? "" : "nil"}`}>
              {chapter === "dream"
                ? `+${scenario.bonuses.reduce((sum, bonus) => sum + bonus.points, 0)}`
                : "—"}
            </b>
          </article>
        )}
      </div>

      <div className="still-final-table">
        <h4>Classified: the full-time table</h4>
        <ol>
          {scenario.table.map((row) => (
            <li key={row.submissionId} className={row.submissionId === verdict.submissionId ? "you" : ""}>
              <span className="pos">{row.position}</span>
              <span className="name">
                {row.name}
                {row.position === 1 && <em> 🏆</em>}
              </span>
              <span className="pts">{row.total}</span>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

export default function StillInIt({
  submissions,
  results,
  ownSubmissionId,
}: {
  submissions: Submission[];
  results: TournamentResults;
  ownSubmissionId?: string | null;
}) {
  const [pins, setPins] = useState<Pins | null>(null);
  const [report, setReport] = useState<StillInItReport | null>(null);
  const [selectedId, setSelectedId] = useState(ownSubmissionId ?? "");
  const [revealed, setRevealed] = useState(false);
  const [chapter, setChapter] = useState<Chapter>("dream");
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/still-in-it/bracket")
      .then((response) => response.json())
      .then((payload: { pins?: Pins }) => {
        if (!cancelled) setPins(payload.pins ?? {});
      })
      .catch(() => {
        if (!cancelled) setPins({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pins || !submissions.length) return;
    let cancelled = false;
    crunchStillInIt(submissions, results, { pinnedSlots: pins, yieldEvery: 30_000 }).then(
      (crunched) => {
        if (!cancelled) setReport(crunched);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pins, submissions, results]);

  const ready = report?.mode === "ready" ? report : null;
  const verdict =
    ready?.players.find((player) => player.submissionId === selectedId) ?? ready?.players[0];

  const counter = useCountUp(ready?.futuresCovered ?? 0, Boolean(ready && verdict && !revealed));

  const tickerLines = useMemo(() => {
    if (!verdict || !ready) return ["Warming up the presses…"];
    return [
      "Rewiring the live bracket…",
      ...verdict.dream.matches.map(
        (event) => `Replaying ${event.team1} v ${event.team2} every possible way…`,
      ),
      "Pricing the Golden Boot market…",
      `Stress-testing all ${ready.totalBrackets} brackets…`,
      "Asking the rivals to slip up…",
    ];
  }, [verdict, ready]);

  useEffect(() => {
    if (revealed || counter.done) return;
    const interval = setInterval(() => setTickerIndex((index) => index + 1), 600);
    return () => clearInterval(interval);
  }, [revealed, counter.done]);

  const selectPlayer = useCallback((id: string) => {
    setSelectedId(id);
    setRevealed(false);
    setChapter("dream");
  }, []);

  if (!submissions.length || report?.mode === "not-ready") {
    return (
      <section className="still-page">
        <header className="still-masthead">
          <div className="still-date">World Cup 2026 · Late edition</div>
          <div className="still-nameplate">THE SURVIVAL TIMES</div>
          <div className="still-edition">One question. No hiding place.</div>
        </header>
        <div className="still-empty">
          {report?.mode === "not-ready"
            ? report.reason
            : "The presses are ready. We just need some entries."}
        </div>
      </section>
    );
  }

  return (
    <section className="still-page">
      <header className="still-masthead">
        <div className="still-date">World Cup 2026 · Late edition</div>
        <div className="still-nameplate">THE SURVIVAL TIMES</div>
        <div className="still-edition">One question. No hiding place.</div>
      </header>

      <div className="still-player-strip" role="list" aria-label="Choose a player">
        {(ready?.players ?? []).map((player) => (
          <button
            role="listitem"
            key={player.submissionId}
            className={verdict && player.submissionId === verdict.submissionId ? "active" : ""}
            onClick={() => selectPlayer(player.submissionId)}
          >
            <Avatar name={player.name} />
            <span>{player.name}</span>
            <b>{player.current}</b>
          </button>
        ))}
      </div>

      {!ready || !verdict ? (
        <div className="still-suspense">
          <p className="still-kicker">The futures desk is calculating</p>
          <h2>Crunching…</h2>
        </div>
      ) : !revealed ? (
        <div className="still-suspense">
          <div className="still-portrait">
            <Avatar name={verdict.name} />
            <span className="still-question">?</span>
          </div>
          <p className="still-kicker">Exclusive · {ordinal(verdict.currentPosition)} on {verdict.current} points</p>
          <h2>
            Is {verdict.name}
            <br />
            still in it?
          </h2>
          <div className="still-counter" aria-live="polite">
            <b>{counter.value.toLocaleString("en-GB")}</b>
            <span>
              futures priced across {ready.totalBrackets} possible brackets
              {ready.pruned ? " (headline signatures)" : ""}
            </span>
          </div>
          <p className="still-ticker" aria-hidden="true">
            {counter.done ? "The verdict is typeset." : tickerLines[tickerIndex % tickerLines.length]}
          </p>
          <button disabled={!counter.done} onClick={() => setRevealed(true)}>
            Stop the presses <ChevronRight size={19} />
          </button>
        </div>
      ) : (
        <div className="still-reveal">
          <div className={`still-verdict ${verdict.canWin ? "alive" : "out"}`}>
            <span>
              {verdict.canWin
                ? verdict.currentPosition === 1
                  ? "Hold the back page"
                  : "Breaking · the maths says yes"
                : "Official · the futures desk has spoken"}
            </span>
            <h2>
              {verdict.canWin
                ? verdict.currentPosition === 1
                  ? "STILL THE ONE TO CATCH."
                  : verdict.canWinOutright
                    ? "YES. STILL IN IT."
                    : "ALIVE. BY A WHISKER."
                : `IT'S OVER, ${firstName(verdict.name).toUpperCase()}.`}
            </h2>
            <p>
              {verdict.canWin
                ? `${verdict.winningBrackets} of the ${ready.totalBrackets} remaining brackets end with ${
                    verdict.name
                  } ${
                    verdict.canWinOutright ? "top of the pool" : "at least sharing top spot"
                  }. All ${formatFutures(ready.futuresCovered)} futures were priced.`
                : `All ${formatFutures(ready.futuresCovered)} remaining futures were priced and not one ends with ${
                    verdict.name
                  } on top. Best possible finish: ${ordinal(verdict.bestPosition)}.`}
            </p>
          </div>

          <div className="still-scoreline">
            <div>
              <small>Now</small>
              <b>{ordinal(verdict.currentPosition)}</b>
            </div>
            <span>→</span>
            <div>
              <small>Best case</small>
              <b>{ordinal(verdict.bestPosition)}</b>
            </div>
            <span>·</span>
            <div>
              <small>Worst case</small>
              <b>{ordinal(verdict.worstPosition)}</b>
            </div>
          </div>

          <DemandsPanel verdict={verdict} />

          <div className="still-chapter-tabs">
            <button className={chapter === "dream" ? "active" : ""} onClick={() => setChapter("dream")}>
              <Sparkles size={17} /> Dream edition
            </button>
            <button
              className={chapter === "nightmare" ? "active" : ""}
              onClick={() => setChapter("nightmare")}
            >
              <Skull size={17} /> Nightmare edition
            </button>
          </div>
          <EditionPage
            verdict={verdict}
            chapter={chapter}
            scenario={chapter === "dream" ? verdict.dream : verdict.nightmare}
          />

          <p className="still-method">
            <Newspaper size={13} /> How it&apos;s done: every remaining result is simulated jointly
            for the whole pool — {formatFutures(ready.futuresCovered)} futures across{" "}
            {ready.totalBrackets} brackets, collapsed to{" "}
            {ready.scenariosEvaluated.toLocaleString("en-GB")} decisive scenarios — so your best
            case already includes what those same results hand your rivals. Bonus bets are checked
            against the live goal charts. This is arithmetic, not opinion.
          </p>
        </div>
      )}
    </section>
  );
}
