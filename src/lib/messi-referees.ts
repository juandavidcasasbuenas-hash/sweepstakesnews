import {
  messiRefereeRecords,
  messiRefereeSource,
  type MessiRefereeRecord,
} from "@/data/messi-referees";
import {
  argentinaWorldCup2026RefereeSource,
  bundledArgentinaWorldCup2026Referees,
  isWorldCup2026Referee,
  refereeNameKey,
} from "@/data/world-cup-2026-referees";
import { getSupabase } from "@/lib/supabase";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
const MESSI_REFEREE_URL = "https://www.messistats.com/en/referee";
const ARGENTINA_WORLD_CUP_2026_URL = argentinaWorldCup2026RefereeSource.url;
const MESSI_REFEREE_ROW_ID = "messi-referees";
const MINIMUM_SAFE_REFEREE_COUNT = 200;
const MINIMUM_SAFE_GAME_COUNT = 1000;

export type MessiRefereeSnapshot = {
  records: MessiRefereeRecord[];
  argentinaWorldCup2026Referees?: string[];
  argentinaWorldCup2026SourceUrl?: string;
  sourceRows: number;
  sourceUrl: string;
  updatedAt: string;
};

type MessiRefereeRead = {
  mode: "local" | "supabase";
  snapshot: MessiRefereeSnapshot;
};

type MessiRefereeWrite = MessiRefereeRead & {
  warning?: string;
};

const bundledSnapshot: MessiRefereeSnapshot = {
  records: messiRefereeRecords,
  argentinaWorldCup2026Referees: [...bundledArgentinaWorldCup2026Referees],
  argentinaWorldCup2026SourceUrl: ARGENTINA_WORLD_CUP_2026_URL,
  sourceRows: messiRefereeSource.sourceRows,
  sourceUrl: messiRefereeSource.url,
  updatedAt: "2026-07-14T00:00:00.000Z",
};

let localSnapshot = bundledSnapshot;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function htmlText(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&apos;|&#039;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numericCell(value: string | undefined) {
  const parsed = Number.parseInt(htmlText(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function mergeMessiRefereeRecords(records: MessiRefereeRecord[]) {
  const merged = new Map<string, MessiRefereeRecord>();
  records.forEach((row) => {
    const key = `${row.name}|${row.country}`;
    const current = merged.get(key) ?? {
      name: row.name,
      country: row.country,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    current.games += row.games;
    current.wins += row.wins;
    current.losses += row.losses;
    current.draws += row.draws;
    merged.set(key, current);
  });
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export function parseMessiRefereeHtml(html: string) {
  const resultsSection = html.match(/<section[^>]*class=["'][^"']*\bresults\b[^"']*["'][^>]*>[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const tableBody = resultsSection?.[1] ?? html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!tableBody) return { records: [], sourceRows: 0 };

  const sourceRecords: MessiRefereeRecord[] = [];
  const rows = Array.from(tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  rows.forEach((row) => {
    const cells = Array.from(row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((cell) =>
      htmlText(cell[1]),
    );
    if (cells.length < 7) return;
    const name = cells[1];
    const country = cells[2];
    const games = numericCell(cells[3]);
    const wins = numericCell(cells[4]);
    const draws = numericCell(cells[5]);
    const losses = numericCell(cells[6]);
    if (!name || !country || games === undefined || wins === undefined || draws === undefined || losses === undefined) return;
    if (games !== wins + losses + draws) return;
    sourceRecords.push({ name, country, games, wins, losses, draws });
  });

  return {
    records: mergeMessiRefereeRecords(sourceRecords),
    sourceRows: sourceRecords.length,
  };
}

export function parseArgentinaWorldCup2026Referees(content: string) {
  const referees: string[] = [];
  const add = (value: string) => {
    const name = htmlText(value);
    if (name && name !== "Referee" && isWorldCup2026Referee(name)) referees.push(name);
  };

  for (const match of content.matchAll(
    /<(?:td|th)[^>]*data-stat=["']referee["'][^>]*>([\s\S]*?)<\/(?:td|th)>/gi,
  )) {
    add(match[1]);
  }

  const lines = content.split(/\r?\n/).filter((line) => line.includes("|"));
  const header = lines.find((line) => line.split("|").some((cell) => cell.trim() === "Referee"));
  if (header) {
    const headerCells = header.split("|").map((cell) => cell.trim());
    const refereeIndex = headerCells.indexOf("Referee");
    const headerIndex = lines.indexOf(header);
    for (const line of lines.slice(headerIndex + 1)) {
      const cells = line.split("|").map((cell) => cell.trim());
      if (cells.every((cell) => !cell || /^:?-+:?$/.test(cell))) continue;
      if (refereeIndex >= 0 && cells[refereeIndex]) add(cells[refereeIndex]);
    }
  }

  return Array.from(new Map(referees.map((name) => [refereeNameKey(name), name])).values());
}

function firecrawlApiKey() {
  return process.env.FIRECRAWL_API_KEY ?? process.env.FIRECRAWL_KEY;
}

async function scrapeWithFirecrawl(url: string, formats: string[]) {
  const apiKey = firecrawlApiKey();
  if (!apiKey) throw new Error("Firecrawl is not configured; using the saved Messi referee snapshot.");

  const response = await fetch(FIRECRAWL_SCRAPE_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats,
      onlyMainContent: false,
      maxAge: 0,
      waitFor: 3000,
      timeout: 60000,
      location: { country: "GB", languages: ["en-GB"] },
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firecrawl referee scrape failed (${response.status}): ${detail.slice(0, 180)}`);
  }

  const payload = asRecord(await response.json());
  const data = asRecord(payload.data);
  return {
    html: firstString(data.html, payload.html) ?? "",
    markdown: firstString(data.markdown, payload.markdown) ?? "",
  };
}

async function fetchMessiRefereeSnapshot(
  previous: MessiRefereeSnapshot,
): Promise<MessiRefereeSnapshot> {
  const refereeUrl = process.env.MESSI_REFEREE_STATS_URL ?? MESSI_REFEREE_URL;
  const argentinaUrl =
    process.env.ARGENTINA_WORLD_CUP_2026_REFEREES_URL ?? ARGENTINA_WORLD_CUP_2026_URL;
  const [mainScrape, argentinaScrape] = await Promise.allSettled([
    scrapeWithFirecrawl(refereeUrl, ["html"]),
    scrapeWithFirecrawl(argentinaUrl, ["html", "markdown"]),
  ]);
  if (mainScrape.status === "rejected") throw mainScrape.reason;

  const html = mainScrape.value.html;
  const parsed = parseMessiRefereeHtml(html);
  const games = parsed.records.reduce((sum, row) => sum + row.games, 0);
  if (parsed.records.length < MINIMUM_SAFE_REFEREE_COUNT || games < MINIMUM_SAFE_GAME_COUNT) {
    throw new Error(
      `Messi referee scrape looked incomplete (${parsed.records.length} referees, ${games} games); saved data was kept.`,
    );
  }

  const scrapedArgentinaReferees =
    argentinaScrape.status === "fulfilled"
      ? parseArgentinaWorldCup2026Referees(
          `${argentinaScrape.value.html}\n${argentinaScrape.value.markdown}`,
        )
      : [];
  const argentinaWorldCup2026Referees = scrapedArgentinaReferees.length
    ? scrapedArgentinaReferees
    : previous.argentinaWorldCup2026Referees?.length
      ? previous.argentinaWorldCup2026Referees
      : [...bundledArgentinaWorldCup2026Referees];

  return {
    records: parsed.records,
    argentinaWorldCup2026Referees,
    argentinaWorldCup2026SourceUrl: argentinaUrl,
    sourceRows: parsed.sourceRows,
    sourceUrl: refereeUrl,
    updatedAt: new Date().toISOString(),
  };
}

export async function readStoredMessiReferees(): Promise<MessiRefereeRead> {
  const supabase = getSupabase();
  if (!supabase) return { mode: "local", snapshot: localSnapshot };

  const { data, error } = await supabase
    .from("results")
    .select("payload")
    .eq("id", MESSI_REFEREE_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const snapshot = data?.payload as MessiRefereeSnapshot | null;
  return {
    mode: "supabase",
    snapshot: snapshot?.records?.length ? snapshot : bundledSnapshot,
  };
}

async function writeStoredMessiReferees(snapshot: MessiRefereeSnapshot): Promise<MessiRefereeRead> {
  const supabase = getSupabase();
  if (!supabase) {
    localSnapshot = snapshot;
    return { mode: "local", snapshot };
  }

  const { error } = await supabase.from("results").upsert({
    id: MESSI_REFEREE_ROW_ID,
    payload: snapshot,
    updated_at: snapshot.updatedAt,
  });
  if (error) throw new Error(error.message);
  return { mode: "supabase", snapshot };
}

export async function refreshStoredMessiReferees(): Promise<MessiRefereeWrite> {
  const stored = await readStoredMessiReferees();
  try {
    return await writeStoredMessiReferees(await fetchMessiRefereeSnapshot(stored.snapshot));
  } catch (error) {
    return {
      ...stored,
      warning: error instanceof Error ? error.message : "Could not refresh Messi referee stats",
    };
  }
}
