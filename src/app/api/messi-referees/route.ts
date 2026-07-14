import { NextResponse } from "next/server";
import { readStoredMessiReferees } from "@/lib/messi-referees";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readStoredMessiReferees(), {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Messi referee stats" },
      { status: 500 },
    );
  }
}
