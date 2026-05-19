import { NextResponse } from "next/server";
import { fetchWc2026TestMatch, localWc2026TestMatch } from "@/lib/results";

export async function GET() {
  try {
    return NextResponse.json(await fetchWc2026TestMatch());
  } catch {
    return NextResponse.json(localWc2026TestMatch());
  }
}
