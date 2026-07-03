// Deterministic game engine. The LLM writes personality; this file decides
// everything that affects the score, so everyone playing the same daily
// edition faces the same crises with the same consequences.
//
// Two visible meters only (Juan's feedback: four bars were wallpaper):
//   TRUST — the group believes in you. Zero = deposed.
//   HEAT  — chat temperature. 100 = meltdown.
// Dilemma data still carries 4-dim effects; integrity folds into trust
// (a sound spreadsheet IS credibility) and banter vents heat (a laughing
// chat is a cooler chat), so the original hand-tuning survives.

import { DILEMMAS, type Dilemma, type MeterEffects, type Tone } from "./dilemmas";

export const ROUNDS_PER_RUN = 6;

/** Seconds to rule on a crisis before the group notices the silence. */
export const DECISION_SECONDS = 20;

/** The chat runs hotter with every crisis that passes, whatever you do. */
export const HEAT_DRIFT = 3;

export interface Meters {
  trust: number;
  heat: number;
}

export const STARTING_METERS: Meters = { trust: 62, heat: 34 };

/**
 * Collapse a dilemma's 4-dim effects into the two visible meters, amplified
 * so individual rulings genuinely swing a six-crisis run.
 */
export function deltaFor(effects: MeterEffects): Meters {
  return {
    trust: Math.round((effects.trust + effects.integrity / 3) * 1.4),
    heat: Math.round((effects.heat - effects.banter / 3) * 1.4),
  };
}

/** Local date key, used for the masthead edition number and score history. */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const EDITION_EPOCH = Date.UTC(2026, 5, 11); // World Cup 2026 kickoff

export function editionNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.max(1, Math.floor((Date.UTC(y, m - 1, d) - EDITION_EPOCH) / 86_400_000) + 1);
}

/**
 * A fresh random run: shuffle the bank, then prefer dilemmas led by cast
 * members who haven't opened a crisis yet this run, so the whole group gets
 * airtime instead of Doug five times in a row.
 */
export function dilemmasForRun(): Dilemma[] {
  const pool = [...DILEMMAS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked: Dilemma[] = [];
  const leadsUsed = new Set<string>();
  for (const d of pool) {
    if (picked.length >= ROUNDS_PER_RUN) break;
    const lead = d.intro.find((l) => l.speaker !== "admin")?.speaker ?? "doug";
    if (leadsUsed.has(lead)) continue;
    leadsUsed.add(lead);
    picked.push(d);
  }
  for (const d of pool) {
    if (picked.length >= ROUNDS_PER_RUN) break;
    if (!picked.includes(d)) picked.push(d);
  }
  return picked;
}

// ── Meters & fail states ────────────────────────────────────────────────────

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function applyEffects(meters: Meters, effects: MeterEffects): Meters {
  const d = deltaFor(effects);
  return {
    trust: clamp(meters.trust + d.trust),
    heat: clamp(meters.heat + d.heat),
  };
}

export interface Collapse {
  cause: "heat" | "trust";
  headline: string;
  detail: string;
}

export function checkCollapse(meters: Meters): Collapse | null {
  if (meters.heat >= 100)
    return {
      cause: "heat",
      headline: "GROUP CHAT EXPLODES",
      detail: "The chat hit boiling point. Eleven people are typing. None of it is kind.",
    };
  if (meters.trust <= 0)
    return {
      cause: "trust",
      headline: "ADMIN DEPOSED IN BLOODLESS COUP",
      detail: "A rival leaderboard has been ratified. Your login no longer works.",
    };
  return null;
}

/** Ambient danger level for the UI (vignette, warnings, admin cam mood). */
export function dangerLevel(meters: Meters): "calm" | "tense" | "critical" {
  if (meters.heat >= 80 || meters.trust <= 15) return "critical";
  if (meters.heat >= 60 || meters.trust <= 30) return "tense";
  return "calm";
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  trust: number;
  coolHead: number;
  survivalDays: number;
  survivalBonus: number;
  total: number;
}

// Weights favour the meters over showing up: two survivors with different
// rulings should finish thousands apart, not hundreds.
export function scoreRun(meters: Meters, roundsSurvived: number, survived: boolean): ScoreBreakdown {
  const trust = meters.trust * 40;
  const coolHead = (100 - meters.heat) * 25;
  const survivalDays = roundsSurvived * 200;
  const survivalBonus = survived ? 1000 : 0;
  return {
    trust,
    coolHead,
    survivalDays,
    survivalBonus,
    total: trust + coolHead + survivalDays + survivalBonus,
  };
}

// ── Titles & DNA ────────────────────────────────────────────────────────────

export interface AdminVerdict {
  title: string;
  strapline: string;
}

export function adminTitle(
  meters: Meters,
  tones: Tone[],
  survived: boolean,
  collapse: Collapse | null,
): AdminVerdict {
  const counts: Record<Tone, number> = { diplomat: 0, chaos: 0, rulebook: 0, coward: 0 };
  for (const t of tones) counts[t]++;
  const dominant = (Object.keys(counts) as Tone[]).reduce((a, b) => (counts[b] > counts[a] ? b : a));

  if (!survived && collapse) {
    if (collapse.cause === "trust") {
      return { title: "The Deposed Dictator", strapline: "Overthrown by a Google Sheet with better governance." };
    }
    return { title: "The Arsonist Administrator", strapline: "The chat didn't explode. It was helped." };
  }

  if (meters.heat >= 80) {
    return { title: "The Cockroach Commissioner", strapline: "Survived the apocalypse. Unkillable. Uninsurable." };
  }
  if (meters.trust >= 85 && meters.heat <= 35) {
    return { title: "The Benevolent Dictator", strapline: "Feared by cheats. Loved by the spreadsheet." };
  }
  if (meters.trust >= 80) {
    return { title: "The People's Admin", strapline: "Approval ratings a real government would kill for." };
  }
  if (meters.heat <= 22) {
    return { title: "UN Peacekeeper of the Group Chat", strapline: "Eleven players. Zero incidents. One miracle." };
  }
  if (dominant === "coward") {
    return { title: "The 'Checking Now' Merchant", strapline: "Will review after the final. Every final. Forever." };
  }
  if (dominant === "chaos") {
    return { title: "The Chaos Goblin", strapline: "Every crisis an opportunity. Every opportunity a crisis." };
  }
  if (dominant === "rulebook") {
    return { title: "The VAR Goblin", strapline: "Checked the pinned rules. The pinned rules said no." };
  }
  return { title: "The Crisis Whisperer", strapline: "Not respected. Not despised. Still logged in." };
}

export interface DnaStrand {
  tone: Tone;
  label: string;
  pct: number;
}

const TONE_LABELS: Record<Tone, string> = {
  diplomat: "Diplomat",
  chaos: "Chaos Goblin",
  rulebook: "Spreadsheet Purist",
  coward: "Coward",
};

export function adminDna(tones: Tone[]): DnaStrand[] {
  const counts: Record<Tone, number> = { diplomat: 0, chaos: 0, rulebook: 0, coward: 0 };
  for (const t of tones) counts[t]++;
  const total = Math.max(1, tones.length);
  return (Object.keys(counts) as Tone[])
    .map((tone) => ({ tone, label: TONE_LABELS[tone], pct: Math.round((counts[tone] / total) * 100) }))
    .sort((a, b) => b.pct - a.pct);
}

// ── Share text ──────────────────────────────────────────────────────────────

function blocks(value: number, glyph: string): string {
  const filled = Math.round(value / 20);
  return glyph.repeat(filled) + "░".repeat(5 - filled);
}

export function shareText(args: {
  edition: number;
  verdict: AdminVerdict;
  score: number;
  meters: Meters;
  roundsSurvived: number;
  survived: boolean;
}): string {
  const { edition, verdict, score, meters, roundsSurvived, survived } = args;
  return [
    `SWEEPSTAKES NEWS ADMINISTRATOR — Edition #${edition}`,
    `${survived ? `Survived all ${roundsSurvived} crises` : `Collapsed after ${roundsSurvived} crises`} as ${verdict.title}`,
    `Score: ${score.toLocaleString("en-GB")}`,
    `Trust     ${blocks(meters.trust, "🟩")} ${meters.trust}%`,
    `Chat temp ${blocks(meters.heat, "🔥")} ${meters.heat}°`,
    `Can you run the sweepstakes better?`,
    `https://sweepstakesnews.vercel.app/game`,
  ].join("\n");
}
