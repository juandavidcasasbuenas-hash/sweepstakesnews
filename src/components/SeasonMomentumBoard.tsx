"use client";

// Shared interactive core of the SEASON MOMENTUM spoof: fetches the momentum
// dataset, offers a Player + Opponent picker, and draws the broadcast card for
// the chosen pairing. The card is keyed on the pairing so the draw-on wipe
// replays on every change. Chrome around it is skinned by context (dark on the
// standalone page, cream inside the Fun Facts panel).

import { useEffect, useMemo, useState } from "react";
import SeasonMomentum from "@/components/SeasonMomentum";
import {
  FIELD_OPPONENT,
  momentumView,
  type MomentumDataset,
} from "@/lib/momentum";

export default function SeasonMomentumBoard() {
  const [dataset, setDataset] = useState<MomentumDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectSlug, setSubjectSlug] = useState<string>("");
  const [opponentSlug, setOpponentSlug] = useState<string>(FIELD_OPPONENT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/wrapped?view=momentum");
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
        if (cancelled) return;
        const data = body as MomentumDataset;
        const first = [...data.players].sort((a, b) => a.rank - b.rank)[0];
        setDataset(data);
        if (first) {
          setSubjectSlug(first.slug);
          setOpponentSlug(first.rivalSlug ?? FIELD_OPPONENT);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const roster = useMemo(
    () => (dataset ? [...dataset.players].sort((a, b) => a.rank - b.rank) : []),
    [dataset],
  );

  const subject = roster.find((player) => player.slug === subjectSlug);
  const view =
    dataset && subject ? momentumView(dataset, subject.slug, opponentSlug) : null;

  function pickSubject(slug: string) {
    setSubjectSlug(slug);
    // Never leave someone facing themselves — fall back to their rival.
    if (opponentSlug === slug) {
      const next = roster.find((player) => player.slug === slug);
      setOpponentSlug(next?.rivalSlug ?? FIELD_OPPONENT);
    }
  }

  if (error) {
    return <p className="mo-status">Couldn’t load momentum: {error}</p>;
  }
  if (!dataset || !subject || !view) {
    return <p className="mo-status">Loading the season…</p>;
  }

  return (
    <div className="mo-board">
      <div className="mo-controls">
        <label className="mo-field">
          <span className="mo-field-label">Player</span>
          <select
            className="mo-select"
            value={subjectSlug}
            onChange={(event) => pickSubject(event.target.value)}
          >
            {roster.map((player) => (
              <option key={player.slug} value={player.slug}>
                #{player.rank} {player.displayName}
              </option>
            ))}
          </select>
        </label>
        <span className="mo-vs-tag">vs</span>
        <label className="mo-field">
          <span className="mo-field-label">Opponent</span>
          <select
            className="mo-select"
            value={opponentSlug}
            onChange={(event) => setOpponentSlug(event.target.value)}
          >
            <option value={FIELD_OPPONENT}>The Field (pool average)</option>
            {roster
              .filter((other) => other.slug !== subject.slug)
              .map((other) => (
                <option key={other.slug} value={other.slug}>
                  {other.displayName}
                  {other.slug === subject.rivalSlug ? " · rival" : ""}
                </option>
              ))}
          </select>
        </label>
      </div>

      <figure className="mo-card">
        {/* key on the pairing so the draw-on animation replays each change */}
        <SeasonMomentum key={`${subject.slug}:${opponentSlug}`} view={view} />
        <figcaption className="mo-caption">
          On top {view.upliftPct}% of the season · biggest swing their way at{" "}
          {view.peakLabel} · against them at {view.troughLabel}
        </figcaption>
      </figure>
    </div>
  );
}
