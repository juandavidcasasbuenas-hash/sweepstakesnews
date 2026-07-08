// "Season Momentum" — a spoof of the TV broadcast MATCH MOMENTUM graphic, but
// stretched across a player's whole season instead of one 45-minute half.
//
// The waveform is real data. At every checkpoint the season had (matchdays,
// then each knockout round) we take how many points the subject banked that
// checkpoint and subtract what their chosen opponent banked. Out-scored the
// opponent → the wave swings up (the subject's half). Got out-scored → it
// swings down (the opponent's half).
//
// The opponent is not fixed: the API ships every player's raw per-checkpoint
// haul (`MomentumRoster.gained`) plus a pool-wide scale reference, and
// `momentumView` turns any (subject, opponent) pairing into a drawable wave.
// That lets the UI let the viewer choose who to measure themselves against.

import { fallbackColorForName } from "@/lib/avatars";
import type { PlayerWrapped, WrappedStagePoint } from "@/lib/wrapped";

export type MomentumPoint = {
  /** Stage short, e.g. "MD1", "R16", "FINAL". */
  label: string;
  /** Signed momentum, normalised to [-1, 1]. Positive = the subject's half. */
  value: number;
  /** Raw points swing at this checkpoint (subject gained − opponent gained). */
  swing: number;
};

export type MomentumRoster = {
  slug: string;
  displayName: string;
  realName: string | null;
  avatar: string | null;
  color: string;
  rank: number;
  /** The auto-picked season rival, used as the default opponent. */
  rivalSlug: string | null;
  /** Points banked at each checkpoint (index-aligned with `labels`). */
  gained: number[];
};

export type MomentumDataset = {
  /** Stage shorts, one per checkpoint. */
  labels: string[];
  /** Pool-wide swing magnitude, so a calm pairing keeps an honest scale. */
  poolMaxAbs: number;
  /** Average points banked per checkpoint — the "vs the field" opponent. */
  fieldGained: number[];
  players: MomentumRoster[];
};

export type MomentumCrest = {
  displayName: string;
  realName: string | null;
  avatar: string | null;
  color: string;
};

export type MomentumView = {
  subject: MomentumCrest;
  opponent: MomentumCrest;
  /** True when measured against the pool average rather than a person. */
  vsField: boolean;
  points: MomentumPoint[];
  /** Checkpoint with the biggest swing in the subject's favour. */
  peakLabel: string;
  /** Checkpoint with the biggest swing against. */
  troughLabel: string;
  /** Share of checkpoints spent on top (value > 0), 0–100. */
  upliftPct: number;
};

/** Sentinel opponent id for the pool-average "field" wave. */
export const FIELD_OPPONENT = "__field__";

function gainedAt(gained: number[], index: number) {
  return gained[index] ?? 0;
}

export function buildMomentumDataset(wrapped: PlayerWrapped[]): MomentumDataset {
  if (!wrapped.length) {
    return { labels: [], poolMaxAbs: 1, fieldGained: [], players: [] };
  }

  const longest = wrapped.reduce<WrappedStagePoint[]>(
    (best, entry) => (entry.timeline.length > best.length ? entry.timeline : best),
    [],
  );
  const labels = longest.map((point) => point.short);
  const checkpointCount = labels.length;
  if (checkpointCount < 2) {
    return { labels, poolMaxAbs: 1, fieldGained: [], players: [] };
  }

  const players: MomentumRoster[] = wrapped.map((entry) => ({
    slug: entry.slug,
    displayName: entry.displayName,
    realName: entry.realName,
    avatar: entry.avatar,
    color: entry.color,
    rank: entry.rank,
    rivalSlug: entry.rival?.slug ?? null,
    gained: entry.timeline.map((point) => point.gained),
  }));

  const fieldGained: number[] = [];
  for (let i = 0; i < checkpointCount; i += 1) {
    const total = players.reduce((sum, player) => sum + gainedAt(player.gained, i), 0);
    fieldGained.push(total / players.length);
  }

  // Reference swing magnitude: the biggest gap any player opened over the
  // field on any single checkpoint. Used as a floor so a pairing that never
  // separated isn't amplified into fake drama.
  let poolMaxAbs = 1;
  for (const player of players) {
    for (let i = 0; i < checkpointCount; i += 1) {
      poolMaxAbs = Math.max(poolMaxAbs, Math.abs(gainedAt(player.gained, i) - fieldGained[i]));
    }
  }

  return { labels, poolMaxAbs, fieldGained, players };
}

const FIELD_CREST: MomentumCrest = {
  displayName: "The Field",
  realName: null,
  avatar: null,
  color: fallbackColorForName("The Field"),
};

function crestFor(roster: MomentumRoster): MomentumCrest {
  return {
    displayName: roster.displayName,
    realName: roster.realName,
    avatar: roster.avatar,
    color: roster.color,
  };
}

/**
 * Build a drawable momentum wave for a chosen pairing. `opponentSlug` may be a
 * player slug or `FIELD_OPPONENT`. Returns null if the subject is unknown.
 */
export function momentumView(
  dataset: MomentumDataset,
  subjectSlug: string,
  opponentSlug: string,
): MomentumView | null {
  const subject = dataset.players.find((player) => player.slug === subjectSlug);
  if (!subject) return null;

  const vsField = opponentSlug === FIELD_OPPONENT;
  const opponentRoster = vsField
    ? null
    : dataset.players.find((player) => player.slug === opponentSlug);
  // Fall back to the field if a stale/self opponent slug slips through.
  const opponentGained =
    vsField || !opponentRoster ? dataset.fieldGained : opponentRoster.gained;

  const swings = dataset.labels.map((label, index) => ({
    label,
    swing: gainedAt(subject.gained, index) - gainedAt(opponentGained, index),
  }));

  const pairMaxAbs = Math.max(...swings.map((point) => Math.abs(point.swing)), 0);
  const scale = Math.max(pairMaxAbs, dataset.poolMaxAbs * 0.35) || 1;

  const points: MomentumPoint[] = swings.map((point) => ({
    label: point.label,
    swing: point.swing,
    value: Math.max(-1, Math.min(1, (point.swing / scale) * 0.92)),
  }));

  let peak = points[0];
  let trough = points[0];
  let up = 0;
  for (const point of points) {
    if (point.swing > peak.swing) peak = point;
    if (point.swing < trough.swing) trough = point;
    if (point.value > 0) up += 1;
  }

  return {
    subject: crestFor(subject),
    opponent: vsField || !opponentRoster ? FIELD_CREST : crestFor(opponentRoster),
    vsField: vsField || !opponentRoster,
    points,
    peakLabel: peak.label,
    troughLabel: trough.label,
    upliftPct: Math.round((up / points.length) * 100),
  };
}
