import { GameStats, InjuredPlayer, ModelOutput } from '../data/types';

const HOME_COURT_BONUS = 3.5; // Power rating points for home court

export function calculateSOS(opponentElos: number[]): number {
  if (opponentElos.length === 0) return 1500;
  return opponentElos.reduce((a, b) => a + b, 0) / opponentElos.length;
}

const STATUS_MULTIPLIERS: Record<InjuredPlayer['status'], number> = {
  out: 1.0,
  doubtful: 0.75,
  questionable: 0.5,
  probable: 0.15,
};

export function calculateInjuryImpact(
  injuryReport: InjuredPlayer[],
  totalTeamMinutes: number = 240
): number {
  if (injuryReport.length === 0) return 0;
  const impact = injuryReport.reduce((sum, player) => {
    const multiplier = STATUS_MULTIPLIERS[player.status];
    return sum + (player.minutesPerGame * multiplier);
  }, 0);
  return Math.min(1, impact / totalTeamMinutes);
}

export function calculateMomentumScore(
  last10: { wins: number; losses: number },
  pointDiff: number
): number {
  const totalGames = last10.wins + last10.losses;
  if (totalGames === 0) return 50;
  const winRate = last10.wins / totalGames;
  // Normalize point diff: cap at ±15
  const normalizedDiff = Math.max(-15, Math.min(15, pointDiff)) / 15;
  return Math.round((winRate * 0.7 + (normalizedDiff + 1) / 2 * 0.3) * 100);
}

export function calculatePowerRating(stats: GameStats, sos: number = 1500): number {
  const sosAdjustment = (sos - 1500) / 100; // Normalize around league average
  const injuryImpact = calculateInjuryImpact(stats.injuryReport);
  const momentum = calculateMomentumScore(stats.last10Record, stats.last10PointDiff) / 100;
  const injuryAdjustedNetRtg = stats.netRating * (1 - injuryImpact);

  return (
    injuryAdjustedNetRtg * 0.40 +
    sosAdjustment * 0.20 +
    momentum * 10 * 0.25 + // Scale momentum (0-1) to usable units
    injuryAdjustedNetRtg * (1 - injuryImpact) * 0.15
  );
}

export function powerRatingToWinProb(
  homePowerRating: number,
  awayPowerRating: number,
  homeCourtBonus: number = HOME_COURT_BONUS
): { homeWin: number; awayWin: number } {
  const diff = (homePowerRating + homeCourtBonus) - awayPowerRating;
  const homeWin = 1 / (1 + Math.exp(-0.15 * diff));
  return { homeWin, awayWin: 1 - homeWin };
}

export function powerRatingToSpread(
  homePowerRating: number,
  awayPowerRating: number
): number {
  // 1 power rating point ≈ 0.8 points on spread
  return -((homePowerRating - awayPowerRating) * 0.8);
}

export function runPowerRatingModel(
  homeStats: GameStats,
  awayStats: GameStats
): ModelOutput {
  const homePower = calculatePowerRating(homeStats);
  const awayPower = calculatePowerRating(awayStats);
  const { homeWin, awayWin } = powerRatingToWinProb(homePower, awayPower);
  const predictedSpread = powerRatingToSpread(homePower, awayPower);
  const confidence = Math.abs(homeWin - 0.5) * 2;

  return {
    modelName: 'powerRating',
    homeWinProbability: homeWin,
    awayWinProbability: awayWin,
    predictedSpread,
    confidence,
  };
}
