import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  createAdminToken,
  ensureUniqueTournamentSlug,
  hashAdminToken,
  tournamentFromRow,
} from "@/lib/tournaments";

type CreateTournamentRequest = {
  name?: string;
  creatorName?: string;
};

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is required to create shareable tournaments." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as CreateTournamentRequest;
  const name = body.name?.trim();
  const creatorName = body.creatorName?.trim() || null;

  if (!name) {
    return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
  }

  if (name.length > 80) {
    return NextResponse.json({ error: "Tournament name is too long" }, { status: 400 });
  }

  const slug = await ensureUniqueTournamentSlug(name);
  const adminToken = createAdminToken();

  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      slug,
      name,
      creator_name: creatorName,
      admin_token_hash: hashAdminToken(adminToken),
    })
    .select("id,slug,name,creator_name,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    tournament: tournamentFromRow(data),
    adminToken,
  });
}
