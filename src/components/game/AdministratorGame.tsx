"use client";

// Sweepstakes News Administrator — survive six group-chat crises as the admin.
// Deterministic daily edition (engine.ts); LLM-written fallout via
// /api/game/fallout; generated tabloid front page via /api/game/front-page.
// Feedback loop is deliberately loud: impact stamps slam into the chat,
// the screen jolts, emoji reactions land on your message, and the Admin Cam
// (the real avatar, Gemini-restyled) reacts in the corner.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CAST, type MemberId } from "@/lib/game/cast";
import { DITHER, type ChatLine, type Choice, type Dilemma, type Tone } from "@/lib/game/dilemmas";
import {
  adminTitle,
  applyEffects,
  checkCollapse,
  dangerLevel,
  DECISION_SECONDS,
  deltaFor,
  dilemmasForRun,
  editionNumber,
  HEAT_DRIFT,
  ROUNDS_PER_RUN,
  scoreRun,
  shareText,
  STARTING_METERS,
  todayKey,
  type Collapse,
  type Meters,
} from "@/lib/game/engine";

type Screen = "intro" | "playing" | "report";
type Mood = "typing" | "happy" | "celebrating" | "worried" | "panic" | "devastated";

const MOODS: Mood[] = ["typing", "happy", "celebrating", "worried", "panic", "devastated"];

interface Msg {
  id: number;
  speaker: MemberId;
  text: string;
  reactions?: string[];
}

interface DayRecord {
  firstScore: number;
  bestScore: number;
  attempts: number;
  title: string;
}

const HISTORY_KEY = "sweepstakes-game-history";

function loadHistory(): Record<string, DayRecord> {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveRun(dateKey: string, score: number, title: string): DayRecord {
  const history = loadHistory();
  const prev = history[dateKey];
  const record: DayRecord = prev
    ? { ...prev, attempts: prev.attempts + 1, bestScore: Math.max(prev.bestScore, score) }
    : { firstScore: score, bestScore: score, attempts: 1, title };
  if (!prev || score >= record.bestScore) record.title = title;
  history[dateKey] = record;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* storage full/blocked — scores just aren't kept */
  }
  return record;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** For useSyncExternalStore values that never change after mount. */
const subscribeNever = () => () => {};

// ── Sound: looping Lyria theme + WebAudio message pops ──────────────────────

// Mute preference lives in localStorage; a tiny external store keeps reads
// SSR-safe (server always renders muted) without setState-in-effect.
const MUTED_KEY = "sweepstakes-game-muted";
const mutedListeners = new Set<() => void>();

function subscribeMuted(cb: () => void) {
  mutedListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    mutedListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readMuted() {
  return localStorage.getItem(MUTED_KEY) !== "false";
}

function writeMuted(next: boolean) {
  localStorage.setItem(MUTED_KEY, String(next));
  mutedListeners.forEach((cb) => cb());
}

function useSound() {
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => true);
  const themeRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureTheme = useCallback(() => {
    if (!themeRef.current) {
      const audio = new Audio("/game/theme.mp3");
      audio.loop = true;
      audio.volume = 0.35;
      themeRef.current = audio;
    }
    return themeRef.current;
  }, []);

  const toggle = useCallback(() => {
    const next = !muted;
    writeMuted(next);
    const theme = ensureTheme();
    if (next) theme.pause();
    else theme.play().catch(() => {});
  }, [muted, ensureTheme]);

  const startTheme = useCallback(() => {
    if (!muted) ensureTheme().play().catch(() => {});
  }, [muted, ensureTheme]);

  /** One synthesized note on the shared context. */
  const note = useCallback(
    (freq: number, at: number, dur: number, type: OscillatorType, peak: number) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    },
    [],
  );

  const pop = useCallback(
    (kind: "in" | "out" | "thud") => {
      if (muted) return;
      try {
        ctxRef.current ??= new AudioContext();
        if (kind === "thud") {
          // Rubber stamp: low square "ka" + lower sine "chunk".
          note(150, 0, 0.1, "square", 0.09);
          note(85, 0.05, 0.18, "sine", 0.1);
        } else {
          note(kind === "in" ? 620 : 440, 0, 0.12, "sine", 0.06);
        }
      } catch {
        /* no audio available */
      }
    },
    [muted, note],
  );

  // The handful of bespoke effects. Deliberately few, deliberately quiet.
  const sfx = useCallback(
    (kind: "tick" | "alarm" | "win" | "lose") => {
      if (muted) return;
      try {
        ctxRef.current ??= new AudioContext();
        switch (kind) {
          case "tick": // dry woodblock for the last seconds of the clock
            note(1100, 0, 0.045, "square", 0.035);
            break;
          case "alarm": // two-note newsroom klaxon when the chat goes critical
            note(660, 0, 0.16, "sawtooth", 0.04);
            note(524, 0.18, 0.2, "sawtooth", 0.04);
            break;
          case "win": // little terrace fanfare: C E G C
            [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.11, 0.22, "triangle", 0.07));
            break;
          case "lose": // sad trombone, approximately
            [392, 349, 311, 262].forEach((f, i) => note(f, i * 0.22, i === 3 ? 0.55 : 0.2, "sawtooth", 0.05));
            break;
        }
      } catch {
        /* no audio available */
      }
    },
    [muted, note],
  );

  useEffect(() => () => themeRef.current?.pause(), []);

  return { muted, toggle, startTheme, pop, sfx };
}

// ── Share card: front page + verdict + score composed into one PNG ──────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth || !current) current = attempt;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

async function buildShareCard(args: {
  frontPage: string | null;
  headline: string;
  title: string;
  strapline: string;
  score: number;
  edition: number;
}): Promise<Blob | null> {
  const W = 1080;
  const H = 1660;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // The next/font families live in CSS variables on <html>.
  const rootStyles = getComputedStyle(document.documentElement);
  const display = rootStyles.getPropertyValue("--font-display").trim() || "Impact, sans-serif";
  const serif = rootStyles.getPropertyValue("--font-body").trim() || "Georgia, serif";

  // Newsprint paper + masthead.
  ctx.fillStyle = "#F5EFE0";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#C8001E";
  ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = "#0D0D0D";
  ctx.fillRect(0, 10, W, 170);
  ctx.textAlign = "center";
  ctx.fillStyle = "#F5EFE0";
  ctx.font = `700 76px ${display}`;
  ctx.fillText("SWEEPSTAKES NEWS", W / 2, 108);
  ctx.fillStyle = "#FF3A3A";
  ctx.font = `700 26px ${display}`;
  ctx.fillText(`INCIDENT REPORT · EDITION #${args.edition}`, W / 2, 152);

  // Headline.
  ctx.fillStyle = "#111111";
  ctx.font = `700 58px ${display}`;
  let y = 254;
  for (const line of wrapLines(ctx, args.headline.toUpperCase(), W - 120, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 62;
  }

  // The generated front-page photo, framed.
  const photoW = 920;
  const photoH = 690;
  const photoX = (W - photoW) / 2;
  const photoY = y + 8;
  ctx.fillStyle = "#111111";
  ctx.fillRect(photoX - 6, photoY - 6, photoW + 12, photoH + 12);
  if (args.frontPage) {
    try {
      const img = await loadImage(args.frontPage);
      ctx.drawImage(img, photoX, photoY, photoW, photoH);
    } catch {
      args = { ...args, frontPage: null };
    }
  }
  if (!args.frontPage) {
    ctx.fillStyle = "#0D0D0D";
    ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.fillStyle = "rgba(245, 239, 224, 0.5)";
    ctx.font = `700 44px ${display}`;
    ctx.fillText("PHOTO WITHHELD BY LAWYERS", W / 2, photoY + photoH / 2);
  }

  // Verdict + score.
  let vy = photoY + photoH + 82;
  ctx.fillStyle = "#C8001E";
  ctx.font = `700 27px ${display}`;
  ctx.fillText("OFFICIAL VERDICT", W / 2, vy);
  ctx.fillStyle = "#111111";
  ctx.font = `700 72px ${display}`;
  vy += 78;
  for (const line of wrapLines(ctx, args.title.toUpperCase(), W - 100, 2)) {
    ctx.fillText(line, W / 2, vy);
    vy += 76;
  }
  ctx.fillStyle = "#444444";
  ctx.font = `italic 400 31px ${serif}`;
  for (const line of wrapLines(ctx, args.strapline, W - 140, 2)) {
    ctx.fillText(line, W / 2, vy);
    vy += 40;
  }
  vy += 34;
  ctx.fillStyle = "#C8001E";
  ctx.font = `700 27px ${display}`;
  ctx.fillText("FINAL SCORE", W / 2, vy);
  ctx.font = `700 118px ${display}`;
  ctx.fillText(args.score.toLocaleString("en-GB"), W / 2, vy + 118);

  // Footer challenge line.
  ctx.fillStyle = "#777777";
  ctx.font = `400 26px ${serif}`;
  ctx.fillText("Can you run the sweepstakes better? · sweepstakesnews.vercel.app/game", W / 2, H - 36);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Avatar({ speaker }: { speaker: MemberId }) {
  const member = CAST[speaker];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="adm-avatar" src={member.avatar} alt={member.name} width={34} height={34} />
  );
}

/** The admin at his laptop, reacting. Veo idle loop for typing, stills otherwise. */
function AdminCam({ mood, caption }: { mood: Mood; caption: string }) {
  const [videoOk, setVideoOk] = useState(true);
  return (
    <figure className={`adm-cam adm-cam-${mood}`}>
      <span className="adm-cam-live">● LIVE</span>
      {mood === "typing" && videoOk ? (
        <video
          src="/game/admin/typing.mp4"
          poster="/game/admin/typing.webp"
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoOk(false)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/game/admin/${mood}.webp`} alt={`The administrator, ${mood}`} decoding="async" />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function tempLabel(heat: number): string {
  if (heat >= 80) return "MELTDOWN IMMINENT";
  if (heat >= 60) return "BOILING";
  if (heat >= 40) return "SIMMERING";
  return "MILD";
}

function trustLabel(trust: number): string {
  if (trust >= 70) return "BELOVED";
  if (trust >= 45) return "TOLERATED";
  if (trust >= 20) return "ON THIN ICE";
  return "COUP BREWING";
}

function Gauges({ meters, impact }: { meters: Meters; impact: Meters | null }) {
  const heatLevel = meters.heat >= 80 ? "crit" : meters.heat >= 60 ? "hot" : meters.heat >= 40 ? "warm" : "ok";
  const trustLevel = meters.trust <= 20 ? "crit" : meters.trust <= 35 ? "low" : "ok";
  return (
    <div className="adm-gauges">
      <div className={`adm-gauge adm-gauge-temp adm-level-${heatLevel}`}>
        <div className="adm-gauge-head">
          <span>🔥 CHAT TEMP</span>
          {impact && impact.heat !== 0 && (
            <em className={impact.heat > 0 ? "adm-delta-bad" : "adm-delta-good"}>
              {impact.heat > 0 ? `+${impact.heat}°` : `${impact.heat}°`}
            </em>
          )}
          <b>{meters.heat}°</b>
        </div>
        <div className="adm-gauge-track">
          {/* Gradient is sized to the full track so red only appears when hot. */}
          <span
            style={{
              width: `${meters.heat}%`,
              backgroundSize: `${meters.heat > 0 ? Math.round(10000 / meters.heat) : 100}% 100%`,
            }}
          />
        </div>
        <small>{tempLabel(meters.heat)}</small>
      </div>
      <div className={`adm-gauge adm-gauge-trust adm-level-${trustLevel}`}>
        <div className="adm-gauge-head">
          <span>🤝 TRUST</span>
          {impact && impact.trust !== 0 && (
            <em className={impact.trust > 0 ? "adm-delta-good" : "adm-delta-bad"}>
              {impact.trust > 0 ? `+${impact.trust}` : impact.trust}
            </em>
          )}
          <b>{meters.trust}%</b>
        </div>
        <div className="adm-gauge-track">
          <span style={{ width: `${meters.trust}%` }} />
        </div>
        <small>{trustLabel(meters.trust)}</small>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

// `embedded` renders the game inside the main app (Admin Space tab), where the
// arena hero already carries the artwork and the section title — so the big
// SWEEPSTAKES NEWS masthead and cover image collapse into a compact dateline.
export default function AdministratorGame({ embedded = false }: { embedded?: boolean }) {
  const [screen, setScreen] = useState<Screen>("intro");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [meters, setMeters] = useState<Meters>(STARTING_METERS);
  const [round, setRound] = useState(0);
  const [dilemma, setDilemma] = useState<Dilemma | null>(null);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [typing, setTyping] = useState<MemberId | null>(null);
  const [ticker, setTicker] = useState("SWEEPSTAKES SEASON OPENS · ADMIN SWORN IN");
  const [collapse, setCollapse] = useState<Collapse | null>(null);
  const [tones, setTones] = useState<Tone[]>([]);
  const [badges, setBadges] = useState<string[]>([]);
  const [frontPage, setFrontPage] = useState<string | null>(null);
  const [finale, setFinale] = useState(false);
  const [record, setRecord] = useState<DayRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [heroOk, setHeroOk] = useState(true);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);
  // Juice state: the visible consequence of the last ruling.
  const [impact, setImpact] = useState<Meters | null>(null);
  const [jolt, setJolt] = useState<"good" | "bad" | null>(null);
  const [moodFlash, setMoodFlash] = useState<Mood | null>(null);

  const sound = useSound();
  // useSound() returns a fresh object each render, so keep a stable ref for
  // effects that must not re-run (and reset their state) on every render.
  const soundRef = useRef(sound);
  const chatRef = useRef<HTMLDivElement>(null);
  const runRef = useRef(0);
  const msgId = useRef(0);
  // Guards against the decision-clock interval and a click resolving the same
  // crisis twice before React re-renders.
  const resolvingRef = useRef(false);
  const resolveRef = useRef<(choice: Choice, choiceIndex: number) => void>(() => {});

  // Server renders a blank date; the client fills in its local day so the
  // whole group flips edition at their own midnight.
  const dateKey = useSyncExternalStore(subscribeNever, todayKey, () => "");
  const edition = useMemo(() => (dateKey ? editionNumber(dateKey) : 1), [dateKey]);
  // Each run draws a fresh random deck; the ref is the source of truth for
  // the async round flow, the state mirrors it for rendering counts.
  const deckRef = useRef<Dilemma[]>([]);
  const [deckSize, setDeckSize] = useState(ROUNDS_PER_RUN);
  const history = useMemo(
    () => (dateKey && typeof window !== "undefined" ? loadHistory()[dateKey] : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateKey, screen],
  );

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, choicesOpen]);

  // Warm the cache for every admin mood so switching reaction shots is instant.
  useEffect(() => {
    for (const m of MOODS) new Image().src = `/game/admin/${m}.webp`;
  }, []);

  const pushMessage = useCallback(
    (line: ChatLine): number => {
      const id = ++msgId.current;
      setMessages((prev) => [...prev, { id, speaker: line.speaker, text: line.text }]);
      sound.pop(line.speaker !== "admin" ? "in" : "out");
      return id;
    },
    [sound],
  );

  const playIntro = useCallback(
    async (d: Dilemma, run: number) => {
      for (const line of d.intro) {
        if (runRef.current !== run) return;
        if (line.speaker !== "admin") {
          setTyping(line.speaker);
          await sleep(450 + Math.min(line.text.length * 11, 1200));
        }
        if (runRef.current !== run) return;
        setTyping(null);
        pushMessage(line);
        // Reading time before the next message starts — urgency comes from
        // the decision clock, not from racing the reader.
        await sleep(420);
      }
      if (runRef.current === run) {
        resolvingRef.current = false;
        setChoicesOpen(true);
        setNowTick(Date.now());
        setDeadline(Date.now() + DECISION_SECONDS * 1000);
      }
    },
    [pushMessage],
  );

  const startRound = useCallback(
    async (index: number, run: number) => {
      const d = deckRef.current[index];
      setRound(index);
      setDilemma(d);
      setChoicesOpen(false);
      if (index > 0) {
        // Tournament pressure: the chat runs hotter every crisis. The drift
        // never kills you on its own (capped at 99) — your rulings do.
        setMeters((m) => ({ ...m, heat: Math.min(m.heat + HEAT_DRIFT, 99) }));
      }
      setMessages((prev) => [
        ...prev,
        { id: ++msgId.current, speaker: "admin", text: `— CRISIS ${index + 1} —` },
      ]);
      // ^ divider rendered specially below via the leading em-dash
      await sleep(450);
      await playIntro(d, run);
    },
    [playIntro],
  );

  const begin = useCallback(() => {
    const run = ++runRef.current;
    deckRef.current = dilemmasForRun();
    setDeckSize(deckRef.current.length);
    setMessages([]);
    setMeters(STARTING_METERS);
    setTones([]);
    setBadges([]);
    setCollapse(null);
    setFrontPage(null);
    setFinale(false);
    setRecord(null);
    setCopied(false);
    setDeadline(null);
    setImpact(null);
    setJolt(null);
    setMoodFlash(null);
    resolvingRef.current = false;
    setTicker("SWEEPSTAKES SEASON OPENS · ADMIN SWORN IN");
    setScreen("playing");
    sound.startTheme();
    void startRound(0, run);
  }, [sound, startRound]);

  // Embedded in the app, the arena hero sits above the game — scroll it away
  // when a run starts so the board owns the whole viewport.
  useEffect(() => {
    if (embedded && screen === "playing") {
      document.querySelector(".adm-embedded")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [embedded, screen]);

  // The run is over, but don't yank the player away from the last messages:
  // save the result and start the presses now, then wait for them to tap
  // through to the report at their own reading pace.
  const finishRun = useCallback(
    (finalMeters: Meters, allTones: Tone[], roundsSurvived: number, ended: Collapse | null) => {
      const survived = !ended;
      const verdict = adminTitle(finalMeters, allTones, survived, ended);
      const breakdown = scoreRun(finalMeters, roundsSurvived, survived);
      setRecord(saveRun(dateKey, breakdown.total, verdict.title));
      setFinale(true);
      soundRef.current.sfx(survived ? "win" : "lose");
      setMessages((prev) => [
        ...prev,
        {
          id: ++msgId.current,
          speaker: "admin",
          text: ended ? "— 📰 FULL TIME. THE PRESSES ARE ROLLING… —" : "— 📰 FINAL WHISTLE. THE PRESSES ARE ROLLING… —",
        },
      ]);

      void fetch("/api/game/front-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: verdict.title,
          headline: ended ? ended.headline : "ADMIN SURVIVES THE IMPOSSIBLE",
          survived,
          cause: ended?.cause,
        }),
      })
        .then((r) => r.json())
        .then((d: { image: string | null }) => setFrontPage(d.image))
        .catch(() => setFrontPage(null));
    },
    [dateKey],
  );

  // Handles both a picked ruling and the clock running out (choiceIndex -1).
  const resolve = useCallback(
    async (choice: Choice, choiceIndex: number) => {
      if (!dilemma || !choicesOpen || resolvingRef.current) return;
      resolvingRef.current = true;
      const run = runRef.current;
      setChoicesOpen(false);
      setDeadline(null);

      const delta = deltaFor(choice.effects);
      const nextMeters = applyEffects(meters, choice.effects);
      const nextTones = [...tones, choice.tone];
      setTones(nextTones);
      setMeters(nextMeters);
      if (choice.badge) setBadges((prev) => (prev.includes(choice.badge!) ? prev : [...prev, choice.badge!]));

      const adminMsgId = pushMessage(
        choiceIndex === -1
          ? { speaker: "admin", text: "— ⏰ CLOCK RAN OUT. SEEN, NO REPLY. —" }
          : { speaker: "admin", text: choice.label },
      );

      const falloutPromise = fetch("/api/game/fallout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dilemmaId: dilemma.id, choiceIndex, meters: nextMeters }),
      })
        .then((r) => r.json())
        .catch(() => null);

      // The consequence, loudly: stamp thuds into the chat, screen jolts,
      // admin cam reacts. This is the feedback loop, not the side bars.
      const bad = delta.heat + Math.max(0, -delta.trust) > Math.max(0, delta.trust) - delta.heat;
      await sleep(350);
      if (runRef.current !== run) return;
      setImpact(delta);
      setJolt(bad ? "bad" : "good");
      setMoodFlash(bad ? (delta.heat >= 6 || delta.trust <= -6 ? "panic" : "worried") : "happy");
      sound.pop("thud");
      setTimeout(() => setJolt(null), 700);
      setTimeout(() => setImpact(null), 2600);
      setTimeout(() => setMoodFlash(null), 3200);

      await sleep(450);
      if (runRef.current !== run) return;
      setTyping(dilemma.intro.find((l) => l.speaker !== "admin")?.speaker ?? "doug");

      const fallout: { messages: ChatLine[]; ticker: string; reactions?: string[] } | null = await falloutPromise;
      if (runRef.current !== run) return;
      const lines = fallout?.messages?.length ? fallout.messages : choice.fallback;

      // Emoji reactions land on the admin's message — WhatsApp justice.
      const reactions = fallout?.reactions?.length
        ? fallout.reactions
        : bad
          ? ["🤬", "🧐"]
          : ["👍"];
      setMessages((prev) => prev.map((m) => (m.id === adminMsgId ? { ...m, reactions } : m)));

      for (const line of lines) {
        if (runRef.current !== run) return;
        setTyping(line.speaker);
        await sleep(450 + Math.min(line.text.length * 10, 1100));
        if (runRef.current !== run) return;
        setTyping(null);
        pushMessage(line);
        await sleep(400);
      }
      setTyping(null);
      if (fallout?.ticker) setTicker(fallout.ticker);

      const ended = checkCollapse(nextMeters);
      const roundsSurvived = round + 1;
      await sleep(550);
      if (runRef.current !== run) return;

      if (ended || roundsSurvived >= deckRef.current.length) {
        setCollapse(ended);
        finishRun(nextMeters, nextTones, roundsSurvived, ended);
      } else {
        void startRound(roundsSurvived, run);
      }
    },
    [dilemma, choicesOpen, meters, tones, round, pushMessage, finishRun, startRound, sound],
  );

  useEffect(() => {
    resolveRef.current = (choice, choiceIndex) => void resolve(choice, choiceIndex);
  }, [resolve]);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Decision clock: ticks while choices are open; expiry = left on read.
  // The last six seconds get one audible woodblock tick per second. Depends
  // only on `deadline` (via soundRef) so the once-per-second guard survives
  // the setNowTick re-renders that happen every 200ms.
  const lastTickRef = useRef(0);
  useEffect(() => {
    if (deadline === null) return;
    lastTickRef.current = 0;
    const iv = setInterval(() => {
      setNowTick(Date.now());
      const secs = Math.ceil((deadline - Date.now()) / 1000);
      if (secs <= 6 && secs > 0 && secs !== lastTickRef.current) {
        lastTickRef.current = secs;
        soundRef.current.sfx("tick");
      }
      if (Date.now() >= deadline) resolveRef.current(DITHER, -1);
    }, 200);
    return () => clearInterval(iv);
  }, [deadline]);

  const remaining =
    deadline === null ? null : Math.max(0, Math.ceil((deadline - Math.max(nowTick, 1)) / 1000));

  // One klaxon the moment the chat first goes critical — not a loop.
  const prevDangerRef = useRef<ReturnType<typeof dangerLevel>>("calm");
  useEffect(() => {
    const level = dangerLevel(meters);
    if (screen === "playing" && level === "critical" && prevDangerRef.current !== "critical") {
      soundRef.current.sfx("alarm");
    }
    prevDangerRef.current = level;
  }, [meters, screen]);

  // ── Report data ──
  const verdict = useMemo(() => adminTitle(meters, tones, !collapse, collapse), [meters, tones, collapse]);
  const breakdown = useMemo(
    () => scoreRun(meters, collapse ? round + 1 : deckSize, !collapse),
    [meters, collapse, round, deckSize],
  );

  const onShare = useCallback(async () => {
    const markCopied = (label = true) => {
      setCopied(label);
      setTimeout(() => setCopied(false), 3000);
    };

    // Primary path: a mobile-friendly PNG — the generated front page with the
    // verdict and score baked in. navigator.share on phones, download on desktop.
    try {
      const blob = await buildShareCard({
        frontPage,
        headline: collapse ? collapse.headline : "ADMIN SURVIVES THE IMPOSSIBLE",
        title: verdict.title,
        strapline: verdict.strapline,
        score: breakdown.total,
        edition,
      });
      if (blob) {
        const file = new File([blob], `sweepstakes-administrator-${edition}.png`, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        markCopied();
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return; // user closed share sheet
    }

    // Fallback: plain text to the clipboard.
    const text = shareText({
      edition,
      verdict,
      score: breakdown.total,
      meters,
      roundsSurvived: collapse ? round + 1 : deckSize,
      survived: !collapse,
    });
    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      window.prompt("Copy your result:", text);
    }
  }, [frontPage, collapse, verdict, breakdown.total, edition, meters, round, deckSize]);

  const today = useMemo(
    () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    [],
  );

  const danger = dangerLevel(meters);
  const mood: Mood =
    screen === "report"
      ? collapse
        ? "devastated"
        : "celebrating"
      : (moodFlash ?? (danger === "critical" ? "panic" : danger === "tense" ? "worried" : "typing"));
  const camCaption =
    screen === "report"
      ? collapse
        ? "the administrator, post-verdict"
        : "the administrator, victorious"
      : mood === "panic"
        ? "HQ, Worthing — situation critical"
        : mood === "worried"
          ? "HQ, Worthing — under pressure"
          : mood === "happy"
            ? "HQ, Worthing — that landed"
            : "HQ, Worthing — holding the line";

  // ─────────────────────────────────────────────────────────────────────────

  if (screen === "intro") {
    return (
      <div className="adm-shell">
        {embedded ? (
          <header className="adm-dateline">
            <span className="adm-edition-chip">EDITION #{edition}</span>
            <span className="adm-dateline-text">{today} · WORTHING EDITION · STILL £1</span>
          </header>
        ) : (
          <header className="adm-masthead">
            <span className="adm-masthead-date">{today} · WORTHING EDITION · STILL £1</span>
            <h1>SWEEPSTAKES NEWS</h1>
            <span className="adm-masthead-strap">THE PEOPLE&apos;S TOURNAMENT PAPER · EST. 2018</span>
          </header>
        )}
        <div className="adm-cover">
          {!embedded && (
            <div className="adm-cover-hero">
              {heroOk && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/game/desk.webp"
                  alt="The Administrator at his desk in Worthing, spreadsheet aglow"
                  width={1376}
                  height={768}
                  fetchPriority="high"
                  onError={() => setHeroOk(false)}
                />
              )}
              <div className="adm-cover-plate">
                <span className="adm-edition-chip">EDITION #{edition}</span>
                <h2>
                  SWEEPSTAKES NEWS
                  <br />
                  ADMINISTRATOR
                </h2>
              </div>
            </div>
          )}
          <p className="adm-cover-lede">
            You are the admin. Eleven players, one spreadsheet, a group chat that smells blood. Survive{" "}
            <strong>{ROUNDS_PER_RUN} crises</strong> from the real chat.
          </p>
          <div className="adm-cover-chips">
            <span>
              🤝 Trust hits 0 → <strong>deposed</strong>
            </span>
            <span>
              🔥 Chat hits 100° → <strong>meltdown</strong>
            </span>
            <span>
              ⏱️ {DECISION_SECONDS}s to rule → or <strong>left on read</strong>
            </span>
          </div>
          <div className="adm-cover-actions">
            <button className="primary-button adm-start" onClick={begin}>
              TAKE OFFICE
            </button>
            <button className="adm-sound-btn" onClick={sound.toggle} aria-label="Toggle sound">
              {sound.muted ? "🔇" : "🔊"}
            </button>
          </div>
          {history && (
            <p className="adm-cover-best">
              Best today: <strong>{history.bestScore.toLocaleString("en-GB")}</strong> as {history.title}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (screen === "report") {
    return (
      <div className="adm-shell">
        <div className="adm-report">
          {embedded ? (
            <header className="adm-dateline">
              <span className="adm-edition-chip">INCIDENT REPORT</span>
              <span className="adm-dateline-text">
                {today} · EDITION #{edition}
              </span>
            </header>
          ) : (
            <header className="adm-masthead adm-masthead-report">
              <span className="adm-masthead-date">
                {today} · EDITION #{edition} · INCIDENT REPORT
              </span>
              <h1>SWEEPSTAKES NEWS</h1>
            </header>
          )}
          <h2 className="adm-report-headline">{collapse ? collapse.headline : "ADMIN SURVIVES THE IMPOSSIBLE"}</h2>
          <p className="adm-report-detail">
            {collapse
              ? collapse.detail
              : `All ${deckSize} crises weathered. The spreadsheet lives. The group chat, incredibly, also lives.`}
          </p>

          <div className="adm-report-grid">
            <figure className="adm-front-page">
              {frontPage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frontPage} alt="Generated front-page photo of the administrator" />
              ) : (
                <div className="adm-front-page-loading">
                  <span>PRESSES RUNNING…</span>
                  <small>Our court artist is sketching the scene</small>
                </div>
              )}
              <figcaption>PICTURED: the administrator, moments after the verdict</figcaption>
            </figure>

            <div className="adm-report-side">
              <div className="adm-verdict">
                <AdminCam mood={mood} caption={camCaption} />
                <div>
                  <span className="eyebrow">OFFICIAL VERDICT</span>
                  <strong>{verdict.title}</strong>
                  <em>{verdict.strapline}</em>
                </div>
              </div>
              <div className="adm-score">
                <span className="eyebrow">FINAL SCORE</span>
                <strong>{breakdown.total.toLocaleString("en-GB")}</strong>
                {record && record.attempts > 1 && (
                  <small>
                    First attempt {record.firstScore.toLocaleString("en-GB")} · best{" "}
                    {record.bestScore.toLocaleString("en-GB")}
                  </small>
                )}
              </div>
              {badges.length > 0 && (
                <div className="adm-badge-chips">
                  {badges.slice(0, 3).map((b) => (
                    <span key={b}>🏅 {b}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="adm-report-actions">
            <button className="primary-button" onClick={onShare}>
              {copied ? "SAVED — POST IT IN THE CHAT" : "SHARE RESULT"}
            </button>
            <button className="secondary-button" onClick={begin}>
              PLAY AGAIN (PRACTICE)
            </button>
            <button className="secondary-button" onClick={() => setScreen("intro")}>
              FRONT DESK
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Playing ──
  return (
    <div className={`adm-shell adm-shell-playing adm-danger-${danger} ${jolt ? `adm-jolt-${jolt}` : ""}`}>
      <div className="adm-vignette" aria-hidden />
      <header className="adm-topbar">
        <div className="adm-topbar-brand">
          <strong>SWEEPSTAKES NEWS</strong>
          <span>ADMINISTRATOR · EDITION #{edition}</span>
        </div>
        <button className="adm-sound-btn" onClick={sound.toggle} aria-label="Toggle sound">
          {sound.muted ? "🔇" : "🔊"}
        </button>
      </header>
      <div className="adm-ticker">
        <span className="adm-ticker-label">TOMORROW&apos;S FRONT PAGE</span>
        <span className="adm-ticker-text" key={ticker}>
          {ticker}
        </span>
      </div>

      <div className="adm-board">
        <section className="adm-chat-pane">
          <header className="adm-chat-header">
            <strong>Sweepstakes News 🏆⚽</strong>
            <span>Doug, Diego, Mike, Bethany, Chloe, Shelui, Christian, Hannah, Ben, Humfrey, Maybe Luke</span>
          </header>
          {dilemma && (
            <div className="adm-crisis-banner">
              <span className="adm-crisis-count">
                CRISIS
                <b>
                  {round + 1}/{deckSize}
                </b>
              </span>
              <div className="adm-crisis-title">
                <strong>{dilemma.headline}</strong>
                <small>{dilemma.kicker}</small>
              </div>
            </div>
          )}
          {danger === "critical" && (
            <div className="adm-meltdown-warning">⚠️ MELTDOWN RISK — CHAT AT {meters.heat}°</div>
          )}
          <div className="adm-chat-scroll" ref={chatRef}>
            {messages.map((m) =>
              m.speaker === "admin" && m.text.startsWith("—") ? (
                <div key={m.id} className="adm-chat-divider">
                  <span>{m.text.replaceAll("—", "").trim()}</span>
                </div>
              ) : m.speaker === "admin" ? (
                <div key={m.id} className="adm-msg adm-msg-admin">
                  <div className="adm-bubble adm-bubble-admin">
                    <span className="adm-msg-name">You (Administrator)</span>
                    {m.text}
                    {m.reactions && m.reactions.length > 0 && (
                      <span className="adm-reactions">{m.reactions.join(" ")}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="adm-msg">
                  <Avatar speaker={m.speaker} />
                  <div className="adm-bubble">
                    <span className="adm-msg-name">
                      {CAST[m.speaker].name} <i>· {CAST[m.speaker].teamName}</i>
                    </span>
                    {m.text}
                  </div>
                </div>
              ),
            )}
            {typing && (
              <div className="adm-msg">
                <Avatar speaker={typing} />
                <div className="adm-bubble adm-bubble-typing">
                  <span className="adm-typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
          </div>
          {impact && (
            <div className={`adm-stamp ${impact.heat + Math.max(0, -impact.trust) > Math.max(0, impact.trust) ? "adm-stamp-bad" : "adm-stamp-good"}`}>
              {impact.heat !== 0 && <span>CHAT {impact.heat > 0 ? `+${impact.heat}` : impact.heat}°</span>}
              {impact.trust !== 0 && <span>TRUST {impact.trust > 0 ? `+${impact.trust}` : impact.trust}</span>}
            </div>
          )}
          <footer className="adm-choices">
            {finale ? (
              <button className="primary-button adm-finale-btn" onClick={() => setScreen("report")}>
                READ TOMORROW&apos;S FRONT PAGE →
              </button>
            ) : dilemma && choicesOpen ? (
              <>
                {remaining !== null && (
                  <div className={`adm-clock ${remaining <= 6 ? "adm-clock-urgent" : ""}`}>
                    <span className="adm-clock-label">RULE NOW</span>
                    <div className="adm-clock-track">
                      <span style={{ width: `${Math.min(100, (remaining / DECISION_SECONDS) * 100)}%` }} />
                    </div>
                    <b>{remaining}s</b>
                  </div>
                )}
                {dilemma.choices.map((choice, i) => (
                  <button key={i} className="adm-choice" onClick={() => resolve(choice, i)}>
                    {choice.label}
                  </button>
                ))}
              </>
            ) : (
              <span className="adm-choices-waiting">The group is typing. Hold your nerve.</span>
            )}
          </footer>
        </section>

        <aside className="adm-desk">
          <AdminCam mood={mood} caption={camCaption} />
          <Gauges meters={meters} impact={impact} />
          <div className="adm-desk-note">
            <span>🌡️ Tournament pressure: +{HEAT_DRIFT}° every crisis</span>
            <span>👶 Deputy Administrator: asleep (for now)</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
