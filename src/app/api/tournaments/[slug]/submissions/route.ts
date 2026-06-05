import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  defaultTournamentSlug,
  readTournamentBySlug,
  verifyTournamentAdminToken,
} from "@/lib/tournaments";

type TournamentSubmissionsRouteContext = {
  params: Promise<{ slug: string }>;
};

type DeleteTournamentSubmissionsRequest = {
  ids?: string[];
};

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

export async function DELETE(request: Request, { params }: TournamentSubmissionsRouteContext) {
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

  const tournament = await readTournamentBySlug(slug);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as DeleteTournamentSubmissionsRequest;
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Provide at least one entry id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("tournament_id", tournament.id)
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: ids });
}
