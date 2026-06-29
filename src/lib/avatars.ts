// Player headshots live in /public/avatars/<slug>.png and are matched to a
// submission by normalising the player name to a slug. Because the names are
// free text entered by players, matching is tolerant of case, punctuation and
// accents, with an alias map for known alternate spellings.

const AVATAR_SLUGS = new Set([
  "aston-la-vista-bab",
  "ayew-serious",
  "beth",
  "bring-back-the-waistcoat",
  "eze-fati",
  "herman-ze-german",
  "humpers-the-king",
  "king-of-the-humpers",
  "luke-martinelli",
  "no-era-penal",
  "sweepstakes-administrator",
  "wendy-renard",
]);

// Alternate spellings -> canonical avatar slug. Empty today (all current
// player names map cleanly), but kept as the hook for reconciling any future
// name that doesn't match its headshot's filename.
const ALIASES: Record<string, string> = {};

export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function avatarSlugCandidates(name: string) {
  const trimmed = name.trim();
  const withoutParenthetical = trimmed.replace(/\s*[\[(][^\])]+[\])]\s*$/g, "").trim();
  return Array.from(
    new Set(
      [trimmed, withoutParenthetical]
        .filter(Boolean)
        .map((candidate) => ALIASES[slugifyName(candidate)] ?? slugifyName(candidate)),
    ),
  );
}

/** Returns the public path to a player's avatar, or null if none exists. */
export function avatarForName(name: string): string | null {
  const resolved = avatarSlugCandidates(name).find((slug) => AVATAR_SLUGS.has(slug));
  return resolved ? `/avatars/${resolved}.png` : null;
}

/** 1-2 letter fallback used when a player has no headshot. */
export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic colour for the initials fallback so a player always gets the
// same tint across renders.
const FALLBACK_COLORS = [
  "#C8001E", "#1d4ed8", "#047857", "#b45309",
  "#7c3aed", "#0e7490", "#be185d", "#4338ca",
];

export function fallbackColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}
