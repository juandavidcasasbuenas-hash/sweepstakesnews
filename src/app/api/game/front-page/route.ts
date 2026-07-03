// End-of-run tabloid front page photo, generated on the fly with Gemini's
// fast image model. The real sweepstakes-administrator avatar goes in as a
// reference image so the star of the paper is always the same character.
// Returns a data URL; the client lays the headline text over it in HTML.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

let avatarBase64: string | null = null;

async function getAvatar(): Promise<string | null> {
  if (avatarBase64) return avatarBase64;
  try {
    const file = await readFile(
      path.join(process.cwd(), "public", "avatars", "sweepstakes-administrator.png"),
    );
    avatarBase64 = file.toString("base64");
    return avatarBase64;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { title?: string; headline?: string; survived?: boolean; cause?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const title = String(body.title ?? "The Crisis Whisperer").slice(0, 60);
  const headline = String(body.headline ?? "SWEEPSTAKES IN CRISIS").slice(0, 90);
  const survived = Boolean(body.survived);

  const scene = survived
    ? `He is triumphant: arms raised in celebration at his desk after five chaotic weeks — confetti in the air, phone buzzing with notifications, printed leaderboards covering the wall, wearing a celebratory winner's sash that suits the title "${title}".`
    : `Comic defeat: papers flying everywhere, the monitor's spreadsheet dissolving into confetti, his chair tipped back, hat askew, waving a tiny white paper flag while the phone rattles off the desk with notifications.`;

  const prompt = [
    "Use the reference image as the EXACT character: a cheerful man with big curly brown hair, full beard, red-and-white striped England top hat, navy shirt, yellow-and-blue scarf.",
    "South Park construction-paper cutout style, bold outlines, flat colours.",
    "A single satirical tabloid newspaper FRONT-PAGE PHOTO of this character at his cluttered home-office desk in Worthing (Colombia mug, road-bike helmet on the chair, children's crayon drawings on the wall).",
    scene,
    `The mood matches this headline (do NOT render the headline text): "${headline}".`,
    "Newsprint texture, cream background, dramatic tabloid-red accents. NO text, NO words, NO letters anywhere in the image.",
  ].join(" ");

  async function generate(text: string, withAvatar: boolean): Promise<string> {
    const input: Array<Record<string, string>> = [];
    if (withAvatar) {
      const avatar = await getAvatar();
      if (avatar) input.push({ type: "image", mime_type: "image/png", data: avatar });
    }
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
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:3", image_size: "1K" },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`gemini image ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const image =
      data.output_image ??
      data.steps
        ?.filter((s: { type: string }) => s.type === "model_output")
        .flatMap((s: { content?: { type: string; data?: string }[] }) => s.content ?? [])
        .find((c: { type: string; data?: string }) => c.type === "image" && c.data)?.data;
    if (!image) throw new Error("gemini image: no image in response");
    return image;
  }

  try {
    const image = await generate(prompt, true);
    return NextResponse.json({ image: `data:image/jpeg;base64,${image}` });
  } catch (error) {
    console.error("[game/front-page]", error instanceof Error ? error.message : error);
    // Safety filters occasionally object to a scene; retry once with a tame
    // scene so the share card still gets a photo.
    try {
      const image = await generate(
        [
          "Use the reference image as the EXACT character: a cheerful man with big curly brown hair, full beard, red-and-white striped England top hat, navy shirt, yellow-and-blue scarf.",
          "South Park construction-paper cutout style, bold outlines, flat colours.",
          "A satirical tabloid front-page photo: the character sits at his home-office desk beside a glowing spreadsheet monitor, holding a newspaper, deadpan expression.",
          "Newsprint texture, cream background, tabloid-red accents. NO text anywhere in the image.",
        ].join(" "),
        true,
      );
      return NextResponse.json({ image: `data:image/jpeg;base64,${image}` });
    } catch (retryError) {
      console.error("[game/front-page:retry]", retryError instanceof Error ? retryError.message : retryError);
      return NextResponse.json({ image: null }, { status: 200 });
    }
  }
}
