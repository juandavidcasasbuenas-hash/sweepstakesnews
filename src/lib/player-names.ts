// Bonus predictions (top scorer / golden ball) are typed by hand, so the same
// player shows up as "Mbappe", "Kylian Mbappe", "K. Mbappé"… This matches a
// free-typed name against the validated player names we already cache from the
// stats provider — no extra API calls, just string work.

export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(name: string): string[] {
  return normalizePlayerName(name).split(" ").filter(Boolean);
}

// How well a free-typed query matches a canonical candidate name (0–1).
export function nameMatchScore(query: string, candidate: string): number {
  const q = normalizePlayerName(query);
  const c = normalizePlayerName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;

  const qt = nameTokens(query);
  const ct = nameTokens(candidate);
  if (!qt.length || !ct.length) return 0;

  const qLast = qt[qt.length - 1];
  const cLast = ct[ct.length - 1];

  // Single-token query: treat it as a surname or a one-word handle.
  if (qt.length === 1) {
    if (qt[0] === cLast) return 0.92; // surname match ("Mbappe" → "Kylian Mbappe")
    if (ct.includes(qt[0])) return 0.85; // any token ("Vinicius" → "Vinicius Junior")
    if (qt[0].length >= 4 && cLast.startsWith(qt[0])) return 0.7;
    return 0;
  }

  // Multi-token query.
  // Some feeds use a single surname while entries use the full name. Treat
  // that as the same player so "Lamine Yamal" and "Yamal" resolve together.
  if (ct.length === 1 && qLast === ct[0]) return 0.92;

  if (qLast === cLast) {
    const qFirst = qt[0];
    const cFirst = ct[0];
    if (qFirst === cFirst) return 0.98;
    if (qFirst.length === 1 && cFirst.startsWith(qFirst)) return 0.93; // "K Mbappe"
    if (cFirst.length === 1 && qFirst.startsWith(cFirst)) return 0.93;
    if (qFirst.startsWith(cFirst) || cFirst.startsWith(qFirst)) return 0.85;
    return 0.6; // same surname, different first name — likely a different player
  }

  // A handwritten surname initial is still enough when the given name agrees
  // ("Lamine Y" → "Lamine Yamal").
  if (
    qLast.length === 1 &&
    cLast.startsWith(qLast) &&
    qt[0] === ct[0]
  ) {
    return 0.91;
  }

  // Surnames differ: only accept if one name's tokens fully contain the other's
  // (handles reordered names or extra middle names).
  if (qt.every((token) => ct.includes(token))) return 0.8;
  if (ct.every((token) => qt.includes(token))) return 0.8;
  return 0;
}

// Best matching candidate for a typed name, or undefined if none clears the bar.
export function matchPlayerName(
  query: string,
  candidates: Iterable<string>,
  threshold = 0.7,
): string | undefined {
  let best: string | undefined;
  let bestScore = threshold;
  for (const candidate of candidates) {
    const score = nameMatchScore(query, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

// Returns the validated candidate name when matched, else the trimmed input so
// at least exact-duplicate spellings still group together.
export function canonicalizePlayerName(
  query: string,
  candidates: Iterable<string>,
  threshold = 0.7,
): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  return matchPlayerName(trimmed, candidates, threshold) ?? trimmed;
}

// Build a stable alias map for a set of names. Unlike matching against a
// scorer feed alone, this also lets the entries teach us that "Yamal" and
// "Lamine Yamal" are the same person when the player has no current stat row.
// The most specific spelling becomes the display name.
export function canonicalizePlayerNames(
  names: Iterable<string>,
  preferredCandidates: Iterable<string> = [],
  threshold = 0.7,
): Map<string, string> {
  const uniqueNames = new Map<string, string>();
  for (const name of [...preferredCandidates, ...names]) {
    const trimmed = name.trim();
    const normalized = normalizePlayerName(trimmed);
    if (trimmed && normalized && !uniqueNames.has(normalized)) {
      uniqueNames.set(normalized, trimmed);
    }
  }

  const ordered = Array.from(uniqueNames.values()).sort((a, b) => {
    const tokenDifference = nameTokens(b).length - nameTokens(a).length;
    if (tokenDifference) return tokenDifference;
    const lengthDifference = normalizePlayerName(b).length - normalizePlayerName(a).length;
    return lengthDifference || a.localeCompare(b);
  });
  const canonicals: string[] = [];
  const aliases = new Map<string, string>();

  for (const name of ordered) {
    const canonical = canonicals.find(
      (candidate) =>
        Math.max(nameMatchScore(name, candidate), nameMatchScore(candidate, name)) >= threshold,
    );
    const resolved = canonical ?? name;
    if (!canonical) canonicals.push(name);
    aliases.set(normalizePlayerName(name), resolved);
  }

  return aliases;
}
