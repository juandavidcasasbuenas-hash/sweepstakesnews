import { createHash, randomBytes } from "crypto";
import { getSupabase } from "@/lib/supabase";
import type { Tournament } from "@/types/game";

export const defaultTournamentSlug = "sweepstakes-news";
export const defaultTournamentName = "Sweepstakes News";

export const defaultTournament: Tournament = {
  id: defaultTournamentSlug,
  slug: defaultTournamentSlug,
  name: defaultTournamentName,
  creatorName: null,
  createdAt: new Date(0).toISOString(),
};

type TournamentRow = {
  id: string;
  slug: string;
  name: string;
  creator_name: string | null;
  created_at: string;
};

export function normalizeTournamentSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function tournamentFromRow(row: TournamentRow): Tournament {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    creatorName: row.creator_name,
    createdAt: row.created_at,
  };
}

export function createAdminToken() {
  return randomBytes(24).toString("base64url");
}

export function hashAdminToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function readTournamentBySlug(slug: string) {
  const supabase = getSupabase();
  if (!supabase) return slug === defaultTournamentSlug ? defaultTournament : null;

  const { data, error } = await supabase
    .from("tournaments")
    .select("id,slug,name,creator_name,created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return tournamentFromRow(data as TournamentRow);
  return slug === defaultTournamentSlug ? defaultTournament : null;
}

export async function ensureUniqueTournamentSlug(name: string) {
  const base = normalizeTournamentSlug(name) || "world-cup-pool";
  const supabase = getSupabase();
  if (!supabase) return `${base}-${randomBytes(3).toString("hex")}`;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug =
      attempt === 0
        ? base
        : `${base}-${randomBytes(2).toString("base64url").toLowerCase()}`;
    if (slug === defaultTournamentSlug) continue;

    const { data, error } = await supabase
      .from("tournaments")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return slug;
  }

  return `${base}-${randomBytes(4).toString("hex")}`;
}
