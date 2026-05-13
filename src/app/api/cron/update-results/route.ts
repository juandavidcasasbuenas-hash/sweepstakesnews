import { NextResponse } from "next/server";
import { refreshStoredResults } from "@/lib/results";

export async function GET(request: Request) {
  const isSample = new URL(request.url).searchParams.get("sample") === "1";
  const secret = process.env.CRON_SECRET;
  if (
    secret &&
    !isSample &&
    request.headers.get("authorization") !== `Bearer ${secret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await refreshStoredResults(request);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update results" },
      { status: 500 },
    );
  }
}
