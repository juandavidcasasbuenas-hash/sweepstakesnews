export type Stage =
  | "group"
  | "round32"
  | "round16"
  | "quarter"
  | "semi"
  | "thirdPlace"
  | "final";

export type Fixture = {
  id: number;
  stage: Stage;
  round: string;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group: string | null;
  venue: string;
};

export type Score = {
  home: number | "";
  away: number | "";
};

export type MatchPick = {
  fixtureId: number;
  home: number | "";
  away: number | "";
  winner?: string;
};

export type BonusPicks = {
  topScorer: string;
  goldenBall: string;
  mostGoalsTeam: string;
};

export type Submission = {
  id: string;
  name: string;
  createdAt: string;
  picks: Record<number, MatchPick>;
  bonuses: BonusPicks;
};

export type ResultMatch = {
  fixtureId: number;
  team1?: string;
  team2?: string;
  home: number;
  away: number;
  winner?: string;
};

export type TournamentResults = {
  matches: Record<number, ResultMatch>;
  bonuses: BonusPicks;
  updatedAt: string;
};

export type TeamStanding = {
  team: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  seed: number;
  position: number;
};

export type ResolvedFixture = Fixture & {
  resolvedTeam1: string;
  resolvedTeam2: string;
};

export type ScoreBreakdown = {
  total: number;
  groupMatches: number;
  knockoutMatches: number;
  qualification: number;
  placements: number;
  bonuses: number;
  exacts: number;
};
