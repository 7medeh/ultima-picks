export interface Team {
  id: number;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

export interface GameStats {
  teamId: number;
  teamName: string;
  offensiveRating: number;
  defensiveRating: number;
  netRating: number;
  pace: number;
  last10Record: { wins: number; losses: number };
  last10PointDiff: number;
  homeRecord: { wins: number; losses: number };
  awayRecord: { wins: number; losses: number };
  daysOfRest: number;
  strengthOfSchedule: number;
  turnoversPerGame: number;
  reboundDifferential: number;
  threePointRateAllowed: number;
  injuryReport: InjuredPlayer[];
  topPlayers: PlayerStat[];
}

export interface InjuredPlayer {
  name: string;
  status: 'out' | 'doubtful' | 'questionable' | 'probable';
  minutesPerGame: number;
  pointsPerGame: number;
  isTopThreeInMinutes: boolean;
}

export interface PlayerStat {
  name: string;
  minutesPerGame: number;
  pointsPerGame: number;
  per: number;
  usageRate: number;
}

export interface UpcomingGame {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  gameDate: string;
  gameDatetime: string;
  seriesInfo?: string;
  odds: GameOdds;
  homeTeamStats: GameStats;
  awayTeamStats: GameStats;
}

export interface GameOdds {
  homeMoneyline: number;
  awayMoneyline: number;
  spread: number;
  homeSpreadOdds: number;
  awaySpreadOdds: number;
  totalLine: number;
  overOdds: number;
  underOdds: number;
  bookmaker: string;
  lastUpdated: string;
}

export interface ModelOutput {
  modelName: string;
  homeWinProbability: number;
  awayWinProbability: number;
  predictedSpread: number;
  confidence: number;
}

export type PickType = 'moneyline' | 'spread' | 'total';
export type PickSide = 'home' | 'away' | 'over' | 'under';
export type BeliefLabel = 'CONVICTION' | 'LEAN' | 'SPECULATIVE';
export type PickResult = 'WIN' | 'LOSS' | 'PUSH' | 'PENDING';

export interface Belief {
  pickId: string;
  generatedAt: string;
  game: string;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  pickType: PickType;
  pickSide: PickSide;
  pickValue: string;
  pickedTeamOrSide: string;
  odds: number;

  poissonWinProb: number;
  eloWinProb: number;
  powerRatingEdge: number;
  impliedProbability: number;
  modelConsensusScore: number;
  modelStdDeviation: number;

  cvsScore: number;
  beliefScore: number;
  beliefLabel: BeliefLabel;

  kellyFraction: number;
  recommendedUnits: number;

  beliefRationale: string[];
  scoutingReport: string;

  result: PickResult;
  actualOutcome: string | null;
  resultFetchedAt: string | null;

  parlayId?: string;
}

export type ParlayMode = 'auto' | 'on-demand';

export interface ParlayCard {
  parlayId: string;
  generatedAt: string;
  targetDate: string;
  mode: ParlayMode;
  picks: Belief[];
  combinedOdds: number;
  expectedValue: number;
  totalCvsScore: number;
  recommendedUnits: number;
  result: PickResult;
  gamesAvailable: number;
  picksEligible: number;
}

export interface ModelWeights {
  poisson: number;
  elo: number;
  powerRating: number;
  impliedProbability: number;
  lastUpdated: string;
  version: number;
}

export interface CVSWeights {
  modelEdge: number;
  eloProb: number;
  restAdvantage: number;
  homeCourtFactor: number;
  injuryImpact: number;
  momentumScore: number;
  h2hHistory: number;
  lastUpdated: string;
}

export interface FactorPerformance {
  factorName: string;
  rollingCorrelation20: number;
  rollingCorrelation50: number;
  rollingCorrelation100: number;
  lastUpdated: string;
}

export interface RecalibrationResult {
  runAt: string;
  picksResolved: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  modelWeightChanges: Record<string, { before: number; after: number; delta: number }>;
  cvsThresholdChange: { before: number; after: number } | null;
  factorPerformanceUpdates: FactorPerformance[];
  anomaliesDetected: string[];
  learningLogEntry: string;
}

export interface GameResult {
  gameId: string;
  homeScore: number;
  awayScore: number;
  finalScore: string;
}

export interface SimulationReport {
  season: number;
  weeksSimulated: number;
  totalPicks: number;
  overallWinRate: number;
  parlayResults: { week: number; legs: number; hit: boolean; odds: number }[];
  parlayHitRate: number;
  weeklyWinRates: number[];
  modelWeightEvolution: ModelWeights[];
  roiByWeek: number[];
  bestWeek: { week: number; winRate: number };
  worstWeek: { week: number; winRate: number };
  finalModelWeights: ModelWeights;
}

export interface CalibrationConfig {
  modelWeights: ModelWeights;
  cvsWeights: CVSWeights;
  cvsThreshold: number;
  beliefThresholds: {
    conviction: number;
    lean: number;
  };
  learningRate: number;
  minModelWeight: number;
  maxModelWeight: number;
}
