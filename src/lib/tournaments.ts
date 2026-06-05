import { createHash, randomBytes, timingSafeEqual } from "crypto";
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

type TournamentAuthRow = TournamentRow & {
  admin_token_hash: string | null;
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

function hashesMatch(first: string, second: string) {
  const firstBuffer = Buffer.from(first, "hex");
  const secondBuffer = Buffer.from(second, "hex");
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
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

export async function verifyTournamentAdminToken(slug: string, token?: string | null) {
  const supabase = getSupabase();
  const cleanToken = token?.trim();
  if (!supabase || !cleanToken || slug === defaultTournamentSlug) return false;

  const { data, error } = await supabase
    .from("tournaments")
    .select("id,slug,name,creator_name,created_at,admin_token_hash")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as TournamentAuthRow | null;
  if (!row?.admin_token_hash) return false;

  return hashesMatch(hashAdminToken(cleanToken), row.admin_token_hash);
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
