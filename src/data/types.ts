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

export type PickType = 'moneyline' | 'spread' | 'total' | 'prop';
export type PickSide = 'home' | 'away' | 'over' | 'under';
export type BeliefLabel = 'CONVICTION' | 'LEAN' | 'SPECULATIVE';
export type PickResult = 'WIN' | 'LOSS' | 'PUSH' | 'PENDING';

// ---------------------------------------------------------------------------
// Player Props
// ---------------------------------------------------------------------------

export type PropStat =
  | 'points'
  | 'rebounds'
  | 'assists'
  | 'threes'
  | 'steals'
  | 'blocks'
  | 'points_rebounds_assists'
  | 'points_rebounds'
  | 'points_assists';

export type PropDirection = 'over' | 'under';

export interface PlayerGameLog {
  date: string;
  opponent: string;
  isHome: boolean;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
  steals: number;
  blocks: number;
  usageRate: number;
}

export interface PlayerProfile {
  playerId: number;
  name: string;
  teamId: number;
  teamName: string;
  position: string;
  // Season averages
  seasonAvgPoints: number;
  seasonAvgRebounds: number;
  seasonAvgAssists: number;
  seasonAvgThrees: number;
  seasonAvgSteals: number;
  seasonAvgBlocks: number;
  seasonAvgMinutes: number;
  seasonAvgUsageRate: number;
  // Recent form (last 5 games)
  last5Avg: Record<PropStat, number>;
  // Last 10 game logs for variance calculation
  recentGameLogs: PlayerGameLog[];
  // Injury status
  injuryStatus: InjuredPlayer['status'] | 'active';
}

export interface PropOddsLine {
  playerId?: number;      // BDL player ID (populated when fetched from BDL)
  playerName: string;
  stat: PropStat;
  line: number;           // e.g. 24.5 for points
  overOdds: number;       // American odds
  underOdds: number;
  bookmaker: string;
  lastUpdated: string;
}

export interface OpponentDefenseRating {
  teamId: number;
  teamName: string;
  // Points/rebounds/assists allowed to each position per game vs league avg
  pointsAllowedToPosition: number;    // e.g. 1.08 = 8% more than league avg
  reboundsAllowedToPosition: number;
  assistsAllowedToPosition: number;
  paceAdjustment: number;             // opponent pace vs league avg
}

export interface PropModelOutput {
  stat: PropStat;
  projectedValue: number;    // Our projected stat total
  projectedStdDev: number;   // Standard deviation of projection
  overProbability: number;   // P(stat > line)
  underProbability: number;  // P(stat < line)
  pushProbability: number;   // P(stat == line)
  modelEdge: number;         // overProb - marketImpliedOverProb
  confidence: number;        // 0-1
}

export interface PropCVSWeights {
  modelEdge: number;
  recentForm: number;
  matchupStrength: number;
  usageRate: number;
  restAndPace: number;
  injuryContext: number;
  lineValue: number;
  lastUpdated: string;
}

export interface PropBelief {
  propId: string;
  generatedAt: string;
  gameId: string;
  game: string;
  gameDate: string;
  playerName: string;
  teamName: string;
  opponentName: string;
  stat: PropStat;
  direction: PropDirection;
  line: number;
  odds: number;

  // Model outputs
  projectedValue: number;
  projectedStdDev: number;
  overProbability: number;
  underProbability: number;
  marketImpliedProb: number;
  modelEdge: number;

  // Season and recent context
  seasonAvg: number;
  last5Avg: number;
  last10Avg: number;
  hitsOverLineInLast5: number;     // how many of last 5 games exceeded the line
  hitsOverLineInLast10: number;

  // Matchup context
  opponentRankVsPosition: number;  // 1-30, 1=best defense
  matchupAdjustment: number;       // multiplier on projection

  // Scoring
  cvsScore: number;
  beliefScore: number;
  beliefLabel: BeliefLabel;
  kellyFraction: number;
  recommendedUnits: number;

  // Output
  rationale: string[];
  scoutingReport: string;

  result: PickResult;
  actualValue: number | null;
  resultFetchedAt: string | null;

  parlayId?: string;
}

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

  // Set when this Belief wraps a player prop
  propDetails?: {
    playerName: string;
    stat: PropStat;
    direction: PropDirection;
    line: number;
    projectedValue: number;
    projectedStdDev: number;
    seasonAvg: number;
    last5Avg: number;
    hitsOverLineInLast5: number;
    propId: string;
  };
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
