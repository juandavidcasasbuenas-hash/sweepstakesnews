import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Submission } from "@/types/game";

type DeleteSubmissionsRequest = {
  ids?: string[];
  names?: string[];
  all?: boolean;
};

function isAdminRequest(request: Request) {
  const adminKey = process.env.ADMIN_RESULTS_KEY;
  return Boolean(adminKey && request.headers.get("authorization") === `Bearer ${adminKey}`);
}

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

export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as DeleteSubmissionsRequest;
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  const names = Array.isArray(body.names)
    ? body.names.map((name) => name.trim()).filter(Boolean)
    : [];

  if (body.all) {
    const { error } = await supabase.from("submissions").delete().neq("id", "");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mode: "supabase", deleted: "all" });
  }

  if (!ids.length && !names.length) {
    return NextResponse.json(
      { error: "Provide ids, names, or all: true" },
      { status: 400 },
    );
  }

  const deleted: { ids?: string[]; names?: string[] } = {};

  if (ids.length) {
    const { error } = await supabase.from("submissions").delete().in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deleted.ids = ids;
  }

  if (names.length) {
    const { error } = await supabase.from("submissions").delete().in("name", names);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deleted.names = names;
  }

  return NextResponse.json({ mode: "supabase", deleted });
}
