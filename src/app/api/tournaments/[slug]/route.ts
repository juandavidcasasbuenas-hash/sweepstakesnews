import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  defaultTournamentSlug,
  tournamentFromRow,
  verifyTournamentAdminToken,
} from "@/lib/tournaments";

type TournamentRouteContext = {
  params: Promise<{ slug: string }>;
};

type UpdateTournamentRequest = {
  name?: string;
};

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

export async function PATCH(request: Request, { params }: TournamentRouteContext) {
  const { slug } = await params;
  if (slug === defaultTournamentSlug) {
    return NextResponse.json({ error: "Default tournament cannot be edited here" }, { status: 403 });
  }

  const authorized = await verifyTournamentAdminToken(slug, bearerToken(request));
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as UpdateTournamentRequest;
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Tournament name is too long" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tournaments")
    .update({ name })
    .eq("slug", slug)
    .select("id,slug,name,creator_name,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tournament: tournamentFromRow(data) });
}
