// Dream/nightmare tabloid front-page photo for "Am I still in it?", generated
// on the fly with Gemini's fast image model. The player's South Park-style
// avatar goes in as the reference image so the star of the paper is always
// the right character. Returns a data URL; the client lays the headline text
// over it in HTML. Images are cached per player+mode for the process lifetime
// — the scene doesn't change with the leaderboard, only the words do.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { avatarForName } from "@/lib/avatars";

export const runtime = "nodejs";
export const maxDuration = 60;

const imageCache = new Map<string, string>();
const avatarCache = new Map<string, string | null>();

async function avatarBase64(name: string): Promise<string | null> {
  const publicPath = avatarForName(name);
  if (!publicPath) return null;
  if (avatarCache.has(publicPath)) return avatarCache.get(publicPath)!;
  try {
    const file = await readFile(path.join(process.cwd(), "public", publicPath));
    const data = file.toString("base64");
    avatarCache.set(publicPath, data);
    return data;
  } catch {
    avatarCache.set(publicPath, null);
    return null;
  }
}

const SCENES = {
  dream: [
    "Pure triumph: the character hoists a gleaming golden World Cup trophy overhead on a confetti-strewn stadium podium at night,",
    "gold ticker tape raining down, fireworks bursting above the stands, an enormous ecstatic grin,",
    "defeated rivals applauding politely in soft-focus behind the podium.",
  ].join(" "),
  nightmare: [
    "Comic despair: the character sits alone on a rain-soaked stadium bench at night under a single sad spotlight,",
    "clutching a torn, soggy predictions coupon, one theatrical tear, a deflated football at their feet,",
    "while a distant blurred figure lifts a golden trophy amid confetti at the far end of the pitch.",
  ].join(" "),
} as const;

export async function POST(request: Request) {
  let body: { name?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const name = String(body.name ?? "").slice(0, 60);
  const mode = body.mode === "nightmare" ? "nightmare" : "dream";
  if (!name.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const cacheKey = `${avatarForName(name) ?? name.toLowerCase()}:${mode}`;
  const cached = imageCache.get(cacheKey);
  if (cached) return NextResponse.json({ image: cached, cached: true });

  const avatar = await avatarBase64(name);
  const character = avatar
    ? "Use the reference image as the EXACT character — same face, hair, clothing and colours."
    : "The character is an enthusiastic football fan in a team scarf and jersey.";

  const prompt = [
    character,
    "South Park construction-paper cutout style, bold outlines, flat colours.",
    "A single satirical tabloid newspaper FRONT-PAGE PHOTO.",
    SCENES[mode],
    "Newsprint texture, cream background, dramatic tabloid-red accents.",
    "NO text, NO words, NO letters, NO numbers anywhere in the image.",
  ].join(" ");

  async function generate(text: string): Promise<string> {
    const input: Array<Record<string, string>> = [];
    if (avatar) input.push({ type: "image", mime_type: "image/png", data: avatar });
    input.push({ type: "text", text });
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3.1-flash-lite-image",
        input,
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9", image_size: "1K" },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`gemini image ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const image =
      data.output_image ??
      data.steps
        ?.filter((step: { type: string }) => step.type === "model_output")
        .flatMap((step: { content?: { type: string; data?: string }[] }) => step.content ?? [])
        .find((chunk: { type: string; data?: string }) => chunk.type === "image" && chunk.data)?.data;
    if (!image) throw new Error("gemini image: no image in response");
    return image;
  }

  try {
    const image = `data:image/jpeg;base64,${await generate(prompt)}`;
    imageCache.set(cacheKey, image);
    return NextResponse.json({ image });
  } catch (error) {
    console.error("[still-in-it/front-page]", error instanceof Error ? error.message : error);
    // Safety filters occasionally object to a scene; retry once, tamer.
    try {
      const image = `data:image/jpeg;base64,${await generate(
        [
          character,
          "South Park construction-paper cutout style, bold outlines, flat colours.",
          "A satirical tabloid front-page photo: the character stands in a football stadium holding a newspaper,",
          mode === "dream" ? "beaming with delight, confetti falling." : "looking glum in light rain.",
          "Newsprint texture, cream background, tabloid-red accents. NO text anywhere in the image.",
        ].join(" "),
      )}`;
      imageCache.set(cacheKey, image);
      return NextResponse.json({ image });
    } catch (retryError) {
      console.error(
        "[still-in-it/front-page:retry]",
        retryError instanceof Error ? retryError.message : retryError,
      );
      return NextResponse.json({ image: null }, { status: 200 });
    }
  }
}
