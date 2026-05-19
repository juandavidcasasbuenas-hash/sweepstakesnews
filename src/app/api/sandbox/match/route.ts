import { NextResponse } from "next/server";

// Full cycle: 160 minutes anchored to UTC midnight, 20 min per phase.
// Goals: BRA 1–0 at match minute 23 (during 1H), ARG equalises at 67 (during 2H).
// Tied through ET, decided on penalties: BRA 3–5 ARG.

const CYCLE_MINUTES = 160;
const PHASE_MINUTES = CYCLE_MINUTES / 8; // 20 min per phase

type Phase = "PRE" | "1H" | "HT" | "2H" | "ET1" | "ET2" | "PEN" | "FT_PEN";

const PHASES: Phase[] = ["PRE", "1H", "HT", "2H", "ET1", "ET2", "PEN", "FT_PEN"];

function cycleOffsetMinutes(): number {
  const now = new Date();
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((Date.now() - midnightUtc) / 60_000) % CYCLE_MINUTES;
}

function matchMinute(phase: Phase, offsetInPhase: number): number | null {
  // offsetInPhase: 0–19 (minutes into this 20-min window)
  const pct = offsetInPhase / PHASE_MINUTES;
  if (phase === "1H")  return Math.max(1, Math.ceil(pct * 45));           // 1–45
  if (phase === "HT")  return 45;
  if (phase === "2H")  return Math.max(46, Math.ceil(pct * 45) + 45);     // 46–90
  if (phase === "ET1") return Math.max(91, Math.ceil(pct * 15) + 90);     // 91–105
  if (phase === "ET2") return Math.max(106, Math.ceil(pct * 15) + 105);   // 106–120
  return null;
}

export async function GET() {
  const offset = cycleOffsetMinutes();
  const phaseIndex = Math.floor(offset / PHASE_MINUTES);
  const offsetInPhase = offset % PHASE_MINUTES;
  const phase = PHASES[phaseIndex];
  const nextPhaseInSeconds = (PHASE_MINUTES - offsetInPhase) * 60;

  const minute = matchMinute(phase, offsetInPhase);

  // Scores accumulate through phases
  const braScoredAt = 23;  // match minute
  const argScoredAt = 67;

  let homeScore = 0;
  let awayScore = 0;

  const pastPhases: Phase[] = PHASES.slice(0, phaseIndex + 1);
  const phasesPast = (p: Phase) => pastPhases.includes(p);

  // Goal at minute 23 lands during 1H; carried from HT onwards
  if (phasesPast("HT") || (phase === "1H" && minute != null && minute >= braScoredAt)) {
    homeScore = 1;
  }
  // Goal at minute 67 lands during 2H; carried from ET onwards
  if (phasesPast("ET1") || (phase === "2H" && minute != null && minute >= argScoredAt)) {
    awayScore = 1;
  }

  const inPenalties = phase === "PEN" || phase === "FT_PEN";
  const homePen = inPenalties ? 3 : null;
  const awayPen = inPenalties ? 5 : null;
  const winner = phase === "FT_PEN" ? "Argentina" : null;

  return NextResponse.json({
    _sandbox: true,
    phase,
    match_minute: minute,
    home: "Brazil",
    away: "Argentina",
    home_score: homeScore,
    away_score: awayScore,
    home_pen: homePen,
    away_pen: awayPen,
    winner,
    next_phase_in_seconds: nextPhaseInSeconds,
  });
}
