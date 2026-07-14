export type WorldCup2026Referee = {
  name: string;
  association: string;
  aliases?: string[];
};

// FIFA's appointed match referees only. Assistant referees and video match
// officials are separate categories in the source roster and are not included.
export const worldCup2026Referees: WorldCup2026Referee[] = [
  { name: "Abdulrahman Al Jassim", association: "Qatar" },
  { name: "Khalid Al Turais", association: "Saudi Arabia" },
  { name: "Yusuke Araki", association: "Japan" },
  { name: "Omar Abdulkadir Artan", association: "Somalia" },
  { name: "Pierre Atcho", association: "Gabon" },
  { name: "Ivan Barton", association: "El Salvador" },
  { name: "Dahane Beida", association: "Mauritania" },
  { name: "Juan Gabriel Benitez", association: "Paraguay", aliases: ["Juan Benítez"] },
  { name: "Juan Calderon", association: "Costa Rica" },
  { name: "Raphael Claus", association: "Brazil" },
  { name: "Ismail Elfath", association: "United States of America" },
  { name: "Espen Eskas", association: "Norway" },
  { name: "Alireza Faghani", association: "Australia" },
  { name: "Yael Falcon Perez", association: "Argentina" },
  { name: "Drew Fischer", association: "Canada" },
  { name: "Cristian Garay", association: "Chile" },
  { name: "Katia Garcia", association: "Mexico" },
  { name: "Mustapha Ghorbal", association: "Algeria" },
  { name: "Alejandro Hernandez", association: "Spain", aliases: ["Alejandro Hernández Hernández"] },
  { name: "Dario Herrera", association: "Argentina" },
  { name: "Jalal Jayed", association: "Morocco" },
  { name: "Campbell-Kirk Kawana-Waugh", association: "New Zealand" },
  { name: "Istvan Kovacs", association: "Romania" },
  { name: "Francois Letexier", association: "France" },
  { name: "Ma Ning", association: "China" },
  { name: "Adham Makhadmeh", association: "Jordan" },
  { name: "Danny Makkelie", association: "Netherlands" },
  { name: "Szymon Marciniak", association: "Poland" },
  { name: "Maurizio Mariani", association: "Italy" },
  { name: "Hector Said Martinez", association: "Honduras", aliases: ["Saíd Martínez"] },
  { name: "Amin Mohamed", association: "Egypt", aliases: ["Amin Omar"] },
  { name: "Oshane Nation", association: "Jamaica" },
  { name: "Glenn Nyberg", association: "Sweden" },
  { name: "Michael Oliver", association: "England" },
  { name: "Omar Al Ali", association: "United Arab Emirates" },
  { name: "Kevin Ortega", association: "Peru" },
  { name: "Tori Penso", association: "United States of America" },
  { name: "Joao Pinheiro", association: "Portugal" },
  { name: "Ramon Abatti", association: "Brazil" },
  { name: "Cesar Ramos", association: "Mexico" },
  { name: "Andres Rojas", association: "Colombia" },
  { name: "Sandro Schaerer", association: "Switzerland" },
  { name: "Ilgiz Tantashev", association: "Uzbekistan" },
  { name: "Anthony Taylor", association: "England" },
  { name: "Gustavo Tejera", association: "Uruguay" },
  { name: "Facundo Tello", association: "Argentina" },
  { name: "Abongile Tom", association: "South Africa" },
  { name: "Clement Turpin", association: "France" },
  { name: "Jesus Valenzuela", association: "Venezuela" },
  { name: "Slavko Vincic", association: "Slovenia" },
  { name: "Wilton Sampaio", association: "Brazil" },
  { name: "Felix Zwayer", association: "Germany" },
];

export const worldCup2026RefereeSource = {
  label: "FIFA — List of appointed match officials",
  url: "https://digitalhub.fifa.com/asset/7879a8c6-c228-4848-a8de-7dc69b37b594/Final-List-of-Match-Officials-FWC-2026.pdf",
} as const;

export const bundledArgentinaWorldCup2026Referees = [
  "Szymon Marciniak",
  "Amin Omar",
  "Istvan Kovacs",
  "Drew Fischer",
  "Francois Letexier",
  "Joao Pinheiro",
  "Ismail Elfath",
] as const;

export const argentinaWorldCup2026RefereeSource = {
  label: "FBref — Argentina 2026 World Cup fixtures",
  url: "https://fbref.com/en/squads/f9fddd6e/2026/matchlogs/c1/schedule/Argentina-Men-Scores-and-Fixtures-World-Cup",
} as const;

export function refereeNameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const worldCup2026RefereeKeys = new Set(
  worldCup2026Referees.flatMap((referee) =>
    [referee.name, ...(referee.aliases ?? [])].map(refereeNameKey),
  ),
);

export function isWorldCup2026Referee(name: string) {
  return worldCup2026RefereeKeys.has(refereeNameKey(name));
}

export function isRefereeInList(name: string, referees: readonly string[]) {
  const keys = new Set(referees.map(refereeNameKey));
  return keys.has(refereeNameKey(name));
}
