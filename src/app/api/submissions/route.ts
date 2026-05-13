import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Submission } from "@/types/game";

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ mode: "local", submissions: [] });
  }

  const { data, error } = await supabase
    .from("submissions")
    .select("id,name,payload,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    mode: "supabase",
    submissions: data.map((row) => row.payload as Submission),
  });
}

export async function POST(request: Request) {
  const submission = (await request.json()) as Submission;
  const supabase = getSupabase();

  if (!submission.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (!supabase) {
    return NextResponse.json({ mode: "local", submission });
  }

  const { error } = await supabase.from("submissions").insert({
    id: submission.id,
    name: submission.name.trim(),
    payload: submission,
    created_at: submission.createdAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mode: "supabase", submission });
}
