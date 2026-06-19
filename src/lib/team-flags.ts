export const teamFlagCodes: Record<string, string> = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  "Bosnia & Herzegovina": "ba",
  Brazil: "br",
  Canada: "ca",
  "Cape Verde": "cv",
  Colombia: "co",
  Croatia: "hr",
  Curaçao: "cw",
  "Czech Republic": "cz",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Haiti: "ht",
  Iran: "ir",
  Iraq: "iq",
  "Ivory Coast": "ci",
  Japan: "jp",
  Jordan: "jo",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Portugal: "pt",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Turkey: "tr",
  USA: "us",
  Uruguay: "uy",
  Uzbekistan: "uz",
};

// Stats providers don't all use the same team strings as our fixtures — some
// send FIFA 3-letter codes (BRA, NED, KOR…), some send alternate spellings
// (Türkiye, Korea Republic, Côte d'Ivoire…). Map those onto the canonical key.
const teamAliases: Record<string, string> = {
  // FIFA / common 3-letter codes
  ALG: "Algeria",
  ARG: "Argentina",
  AUS: "Australia",
  AUT: "Austria",
  BEL: "Belgium",
  BIH: "Bosnia & Herzegovina",
  BRA: "Brazil",
  CAN: "Canada",
  CPV: "Cape Verde",
  COL: "Colombia",
  CRO: "Croatia",
  CUW: "Curaçao",
  CZE: "Czech Republic",
  COD: "DR Congo",
  ECU: "Ecuador",
  EGY: "Egypt",
  ENG: "England",
  FRA: "France",
  GER: "Germany",
  GHA: "Ghana",
  HAI: "Haiti",
  IRN: "Iran",
  IRQ: "Iraq",
  CIV: "Ivory Coast",
  JPN: "Japan",
  JOR: "Jordan",
  MEX: "Mexico",
  MAR: "Morocco",
  NED: "Netherlands",
  NZL: "New Zealand",
  NOR: "Norway",
  PAN: "Panama",
  PAR: "Paraguay",
  POR: "Portugal",
  QAT: "Qatar",
  KSA: "Saudi Arabia",
  SCO: "Scotland",
  SEN: "Senegal",
  RSA: "South Africa",
  KOR: "South Korea",
  ESP: "Spain",
  SWE: "Sweden",
  SUI: "Switzerland",
  TUN: "Tunisia",
  TUR: "Turkey",
  USA: "USA",
  URU: "Uruguay",
  UZB: "Uzbekistan",
  // Alternate spellings / official long names
  "United States": "USA",
  "United States of America": "USA",
  "Korea Republic": "South Korea",
  Korea: "South Korea",
  "Republic of Korea": "South Korea",
  "IR Iran": "Iran",
  "Cote d'Ivoire": "Ivory Coast",
  "Côte d'Ivoire": "Ivory Coast",
  "Türkiye": "Turkey",
  Turkiye: "Turkey",
  Czechia: "Czech Republic",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Congo DR": "DR Congo",
  "Democratic Republic of the Congo": "DR Congo",
  "Cabo Verde": "Cape Verde",
  Holland: "Netherlands",
};

function normalizeTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const normalizedFlagIndex: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const [name, code] of Object.entries(teamFlagCodes)) {
    index.set(normalizeTeam(name), code);
  }
  for (const [alias, canonical] of Object.entries(teamAliases)) {
    const code = teamFlagCodes[canonical];
    if (code) index.set(normalizeTeam(alias), code);
  }
  return index;
})();

export function flagUrlFor(team: string) {
  if (!team) return "";
  const code = teamFlagCodes[team] ?? normalizedFlagIndex.get(normalizeTeam(team));
  return code ? `https://flagcdn.com/w40/${code}.png` : "";
}

const normalizedNameIndex: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const name of Object.keys(teamFlagCodes)) {
    index.set(normalizeTeam(name), name);
  }
  for (const [alias, canonical] of Object.entries(teamAliases)) {
    if (teamFlagCodes[canonical]) index.set(normalizeTeam(alias), canonical);
  }
  return index;
})();

// Resolve a hand-typed team string (code, alt spelling, casing) to our
// canonical team name, or undefined if it isn't recognised.
export function canonicalTeamName(team: string): string | undefined {
  if (!team) return undefined;
  if (teamFlagCodes[team]) return team;
  return normalizedNameIndex.get(normalizeTeam(team));
}
