// Generates the group's reaction to an admin ruling. GPT-5.4 nano first (it's
// the fastest text model on the plan), Gemini flash-lite as fallback, and the
// dilemma's canned lines if both are down — the game never blocks on an API.

import { NextResponse } from "next/server";
import { CAST, CHAT_MEMBERS, type MemberId } from "@/lib/game/cast";
import { DILEMMAS, DITHER, type ChatLine, type Choice } from "@/lib/game/dilemmas";
import { deltaFor } from "@/lib/game/engine";

export const runtime = "nodejs";
export const maxDuration = 30;

interface FalloutPayload {
  messages: ChatLine[];
  ticker: string;
  reactions?: string[];
}

const FALLOUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    messages: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          speaker: { type: "string", enum: CHAT_MEMBERS },
          text: { type: "string" },
        },
        required: ["speaker", "text"],
      },
    },
    ticker: { type: "string" },
    reactions: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
  },
  required: ["messages", "ticker", "reactions"],
} as const;

function buildPrompt(args: {
  dilemmaId: string;
  choiceIndex: number;
  meters: { trust: number; heat: number; integrity: number; banter: number };
}): { system: string; user: string } | null {
  const dilemma = DILEMMAS.find((d) => d.id === args.dilemmaId);
  const choice: Choice | undefined = args.choiceIndex === -1 ? DITHER : dilemma?.choices[args.choiceIndex];
  if (!dilemma || !choice) return null;

  const involved = new Set<MemberId>(dilemma.intro.map((l) => l.speaker).filter((s) => s !== "admin"));
  const voiceCards = CHAT_MEMBERS.map((id) => `- ${id} (${CAST[id].name}, team "${CAST[id].teamName}"): ${CAST[id].voice}`).join("\n");

  const system = [
    "You write WhatsApp messages for a real World Cup sweepstakes group chat run by Juan, the 'Sweepstakes Administrator'.",
    "British group-chat register: lowercase asides, dry sarcasm, emoji used sparingly but well, in-jokes about cheating, autofill, lawyering up, and the relegation zone.",
    "THE CAST (use the id in the speaker field):",
    voiceCards,
    "Rules:",
    "- 2-4 messages, each UNDER 90 characters. Punchy. One thought per message.",
    "- The messages are a THREAD: the first replies directly to the admin's message; later ones react to BOTH the admin and the previous messages — pile on, quote a phrase back, contradict each other. It must read like a conversation, not four separate takes.",
    "- Never speak as the admin, never invent new people, stay in each person's voice, no hashtags.",
    "- 'ticker': one-line sensationalist tabloid headline (max 55 chars, ALL CAPS) for tomorrow's front page.",
    "- 'reactions': 1-3 emoji the group slaps onto the admin's message (WhatsApp reactions). Match the mood: 👍❤️😂 if it landed, 😡🤬💀🧐 if it didn't.",
  ].join("\n");

  const chatSoFar = dilemma.intro
    .map((l) => `${l.speaker === "admin" ? "ADMIN" : CAST[l.speaker].name}: ${l.text}`)
    .join("\n");

  const user = [
    `CRISIS: ${dilemma.headline} — ${dilemma.kicker}`,
    `CHAT SO FAR:\n${chatSoFar}`,
    args.choiceIndex === -1
      ? "THE ADMIN SENT NOTHING. He read it, went quiet, and let the decision clock run out."
      : `THE ADMIN JUST SENT: "${choice.label}"`,
    `HOW IT LANDS (write the reaction to match this outcome): ${choice.falloutHint}`,
    `Current group mood — trust in admin ${args.meters.trust}/100, chat temperature ${args.meters.heat}/100, spreadsheet integrity ${args.meters.integrity}/100, banter ${args.meters.banter}/100.`,
    involved.size ? `Prefer (but don't require) these speakers: ${[...involved].join(", ")}.` : "",
    "Return the JSON.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}

async function fromOpenAI(system: string, user: string): Promise<FalloutPayload> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-nano",
      reasoning: { effort: "none" },
      max_output_tokens: 500,
      instructions: system,
      input: user,
      text: {
        format: { type: "json_schema", name: "fallout", strict: true, schema: FALLOUT_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.output
    ?.filter((o: { type: string }) => o.type === "message")
    .flatMap((o: { content: { type: string; text?: string }[] }) => o.content)
    .find((c: { type: string }) => c.type === "output_text")?.text;
  if (!text) throw new Error("openai: empty output");
  return JSON.parse(text);
}

async function fromGemini(system: string, user: string): Promise<FalloutPayload> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-3.1-flash-lite",
      input: `${system}\n\n${user}`,
      response_format: { type: "text", mime_type: "application/json", schema: FALLOUT_SCHEMA },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text =
    data.output_text ??
    data.steps
      ?.filter((s: { type: string }) => s.type === "model_output")
      .flatMap((s: { content?: { type: string; text?: string }[] }) => s.content ?? [])
      .find((c: { type: string }) => c.type === "text")?.text;
  if (!text) throw new Error("gemini: empty output");
  return JSON.parse(text);
}

function sanitize(payload: FalloutPayload): FalloutPayload | null {
  const valid = new Set<string>(CHAT_MEMBERS);
  const messages = (payload.messages ?? [])
    .filter((m) => valid.has(m.speaker) && typeof m.text === "string" && m.text.trim())
    .slice(0, 4)
    .map((m) => ({ speaker: m.speaker, text: m.text.trim().slice(0, 160) }));
  if (messages.length < 2) return null;
  const ticker = typeof payload.ticker === "string" && payload.ticker.trim()
    ? payload.ticker.trim().slice(0, 70).toUpperCase()
    : "";
  const reactions = (payload.reactions ?? [])
    .filter((r) => typeof r === "string" && r.trim())
    .slice(0, 3)
    .map((r) => r.trim().slice(0, 8));
  return { messages, ticker, reactions };
}

export async function POST(request: Request) {
  let body: { dilemmaId?: string; choiceIndex?: number; meters?: FalloutMeters };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const dilemma = DILEMMAS.find((d) => d.id === body.dilemmaId);
  const choiceIndex = typeof body.choiceIndex === "number" ? body.choiceIndex : NaN;
  const choice = choiceIndex === -1 ? DITHER : dilemma?.choices[choiceIndex];
  if (!dilemma || !choice) {
    return NextResponse.json({ error: "unknown dilemma/choice" }, { status: 400 });
  }

  const meters = {
    trust: clampMeter(body.meters?.trust),
    heat: clampMeter(body.meters?.heat),
    integrity: clampMeter(body.meters?.integrity),
    banter: clampMeter(body.meters?.banter),
  };

  const prompt = buildPrompt({ dilemmaId: dilemma.id, choiceIndex, meters });
  if (prompt) {
    for (const generate of [fromOpenAI, fromGemini]) {
      try {
        const raw = await generate(prompt.system, prompt.user);
        const clean = sanitize(raw);
        if (clean) return NextResponse.json({ ...clean, source: generate === fromOpenAI ? "openai" : "gemini" });
      } catch (error) {
        console.error("[game/fallout]", error instanceof Error ? error.message : error);
      }
    }
  }

  // Canned fallback: the run continues even with both providers down.
  const d = deltaFor(choice.effects);
  return NextResponse.json({
    messages: choice.fallback,
    ticker: dilemma.headline,
    reactions: d.trust > 0 && d.heat <= 0 ? ["👍"] : d.heat >= 6 ? ["🤬", "💀"] : ["🧐"],
    source: "fallback",
  });
}

interface FalloutMeters {
  trust?: number;
  heat?: number;
  integrity?: number;
  banter?: number;
}

function clampMeter(n: number | undefined): number {
  return Math.max(0, Math.min(100, Math.round(typeof n === "number" ? n : 50)));
}
