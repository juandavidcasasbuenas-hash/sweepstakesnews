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

export type Tournament = {
  id: string;
  slug: string;
  name: string;
  creatorName?: string | null;
  createdAt: string;
};

export type ResultMatch = {
  fixtureId: number;
  providerId?: number;
  providerMatchNumber?: number;
  team1?: string;
  team2?: string;
  home: number;
  away: number;
  winner?: string;
  status?: "scheduled" | "live" | "completed" | string;
  phase?: "PRE" | "1H" | "HT" | "2H" | "ET1" | "ET2" | "PEN" | "FT_PEN" | string;
  matchMinute?: number | null;
  homePen?: number | null;
  awayPen?: number | null;
  kickoffInSeconds?: number | null;
  nextPhaseInSeconds?: number | null;
  sandbox?: boolean;
};

export type TournamentResults = {
  matches: Record<number, ResultMatch>;
  bonuses: BonusPicks;
  updatedAt: string;
  providerCheckedAt?: string;
  providerWarning?: string;
  manualOverride?: boolean;
  providerCalls?: { date: string; count: number };
  providerCallTimestamps?: string[];
  playerStats?: PlayerStatsState;
};

export type GoalAssistEvent = {
  fixtureId: number;
  providerId?: number;
  minute?: number | null;
  team?: string;
  scorer: string;
  assist?: string;
  penalty?: boolean;
  ownGoal?: boolean;
};

export type StoredMatchPlayerStats = {
  fixtureId: number;
  providerId?: number;
  checkedAt: string;
  events: GoalAssistEvent[];
  warning?: string;
};

export type PlayerGoalAssistRow = {
  player: string;
  team?: string;
  goals: number;
  assists: number;
  penaltyGoals: number;
  matches: number[];
};

export type SupplementalPlayerStat = {
  player: string;
  team?: string;
  goals?: number;
  assists?: number;
};

export type PlayerStatsState = {
  scorers: PlayerGoalAssistRow[];
  assists: PlayerGoalAssistRow[];
  matchStats: Record<number, StoredMatchPlayerStats>;
  supplementalPlayerStats?: SupplementalPlayerStat[];
  updatedAt: string;
  providerCheckedAt?: string;
  providerWarning?: string;
  providerCalls?: { date: string; count: number };
  providerCallTimestamps?: string[];
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
