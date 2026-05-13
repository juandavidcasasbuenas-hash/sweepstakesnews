import { NextResponse } from "next/server";
import { getLiveResults } from "@/lib/results";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getLiveResults(request));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load live results" },
      { status: 500 },
    );
  }
}
