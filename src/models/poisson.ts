import { GameStats, ModelOutput } from '../data/types';

const LEAGUE_AVG_OFF_RTG = 112.0;
const LEAGUE_AVG_PACE = 98.0;

// Log-space PMF to avoid factorial overflow for NBA score ranges (80-150)
function logPoissonPMF(lambda: number, k: number): number {
  // log P(X=k) = k*log(lambda) - lambda - log(k!)
  // log(k!) via Stirling or iterative sum
  let logKFactorial = 0;
  for (let i = 2; i <= k; i++) logKFactorial += Math.log(i);
  return k * Math.log(lambda) - lambda - logKFactorial;
}

export function poissonPMF(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k === 0) return Math.exp(-lambda);
  // For small k use direct formula; for larger k use log-space to avoid overflow
  if (k <= 20 && lambda <= 20) {
    let logKFact = 0;
    for (let i = 2; i <= k; i++) logKFact += Math.log(i);
    return Math.exp(k * Math.log(lambda) - lambda - logKFact);
  }
  return Math.exp(logPoissonPMF(lambda, k));
}

export function calculateExpectedPoints(
  teamOffRtg: number,
  oppDefRtg: number,
  teamPace: number,
  oppPace: number,
  leagueAvgOffRtg: number = LEAGUE_AVG_OFF_RTG,
  leagueAvgPace: number = LEAGUE_AVG_PACE
): number {
  // pace = possessions per 48 min; use average of both teams
  const avgPace = (teamPace + oppPace) / 2;
  // Defense adjustment: oppDefRtg > leagueAvg = bad defense = more points scored
  const adjustedOffRtg = teamOffRtg * (oppDefRtg / leagueAvgOffRtg);
  return (adjustedOffRtg / 100) * avgPace;
}

export function buildScoreMatrix(
  homeLambda: number,
  awayLambda: number,
  minScore: number = 80,
  maxScore: number = 150
): number[][] {
  const size = maxScore - minScore + 1;
  const matrix: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      matrix[i][j] = poissonPMF(homeLambda, i + minScore) * poissonPMF(awayLambda, j + minScore);
    }
  }
  return matrix;
}

export function calculateOutcomeProbabilities(
  scoreMatrix: number[][]
): { homeWin: number; awayWin: number; push: number } {
  let homeWin = 0;
  let awayWin = 0;
  let push = 0;

  for (let i = 0; i < scoreMatrix.length; i++) {
    for (let j = 0; j < scoreMatrix[i].length; j++) {
      const prob = scoreMatrix[i][j];
      if (i > j) homeWin += prob;
      else if (j > i) awayWin += prob;
      else push += prob;
    }
  }
  return { homeWin, awayWin, push };
}

export function calculateTotalProbabilities(
  scoreMatrix: number[][],
  totalLine: number,
  minScore: number = 80
): { over: number; under: number; push: number } {
  let over = 0;
  let under = 0;
  let push = 0;

  for (let i = 0; i < scoreMatrix.length; i++) {
    for (let j = 0; j < scoreMatrix[i].length; j++) {
      const total = (i + minScore) + (j + minScore);
      const prob = scoreMatrix[i][j];
      if (total > totalLine) over += prob;
      else if (total < totalLine) under += prob;
      else push += prob;
    }
  }
  return { over, under, push };
}

export function runPoissonModel(homeStats: GameStats, awayStats: GameStats): ModelOutput {
  const homeLambda = calculateExpectedPoints(
    homeStats.offensiveRating,
    awayStats.defensiveRating,
    homeStats.pace,
    awayStats.pace
  );
  const awayLambda = calculateExpectedPoints(
    awayStats.offensiveRating,
    homeStats.defensiveRating,
    awayStats.pace,
    homeStats.pace
  );

  const matrix = buildScoreMatrix(homeLambda, awayLambda);
  const { homeWin, awayWin } = calculateOutcomeProbabilities(matrix);
  const total = homeWin + awayWin;
  const normalizedHome = total > 0 ? homeWin / total : 0.5;
  const normalizedAway = total > 0 ? awayWin / total : 0.5;

  const predictedSpread = -(homeLambda - awayLambda);

  // Confidence based on how far from 50/50
  const confidence = Math.abs(normalizedHome - 0.5) * 2;

  return {
    modelName: 'poisson',
    homeWinProbability: normalizedHome,
    awayWinProbability: normalizedAway,
    predictedSpread,
    confidence,
  };
}
