import fs from 'fs';
import path from 'path';
import { Team, ModelOutput } from '../data/types';

const BASE_ELO = 1500;
const K_FACTOR = 20;
const HOME_COURT_ELO_BOOST = 100;
const CALIBRATION_PATH = path.resolve('./data/calibration.json');

export function loadEloRatings(): Record<string, number> {
  try {
    if (!fs.existsSync(CALIBRATION_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf-8'));
    return (raw.eloRatings as Record<string, number>) ?? {};
  } catch {
    return {};
  }
}

export function saveEloRatings(ratings: Record<string, number>): void {
  let config: Record<string, unknown> = {};
  if (fs.existsSync(CALIBRATION_PATH)) {
    try { config = JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf-8')); } catch { /* ignore */ }
  }
  config.eloRatings = ratings;
  const tmp = CALIBRATION_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, CALIBRATION_PATH);
}

export function getTeamElo(teamName: string): number {
  const ratings = loadEloRatings();
  return ratings[teamName] ?? BASE_ELO;
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function movMultiplier(pointDiff: number, eloDiff: number): number {
  return Math.log(Math.abs(pointDiff) + 1) * (2.2 / (Math.abs(eloDiff) * 0.001 + 2.2));
}

export function updateElo(
  winnerRating: number,
  loserRating: number,
  pointDiff: number
): { newWinner: number; newLoser: number } {
  const eloDiff = winnerRating - loserRating;
  const expectedWinner = expectedScore(winnerRating, loserRating);
  const multiplier = movMultiplier(pointDiff, eloDiff);
  const delta = K_FACTOR * multiplier * (1 - expectedWinner);
  return {
    newWinner: winnerRating + delta,
    newLoser: loserRating - delta,
  };
}

export function eloToWinProb(
  homeElo: number,
  awayElo: number,
  isNeutralSite: boolean = false
): { homeWin: number; awayWin: number } {
  const adjustedHomeElo = isNeutralSite ? homeElo : homeElo + HOME_COURT_ELO_BOOST;
  const homeWin = expectedScore(adjustedHomeElo, awayElo);
  return { homeWin, awayWin: 1 - homeWin };
}

export function eloToSpread(homeElo: number, awayElo: number): number {
  // 25 Elo points ≈ 1 point on the spread
  return -((homeElo + HOME_COURT_ELO_BOOST - awayElo) / 25);
}

export function runEloModel(homeTeam: Team, awayTeam: Team): ModelOutput {
  const homeElo = getTeamElo(homeTeam.name);
  const awayElo = getTeamElo(awayTeam.name);
  const { homeWin, awayWin } = eloToWinProb(homeElo, awayElo);
  const predictedSpread = eloToSpread(homeElo, awayElo);
  const confidence = Math.abs(homeWin - 0.5) * 2;

  return {
    modelName: 'elo',
    homeWinProbability: homeWin,
    awayWinProbability: awayWin,
    predictedSpread,
    confidence,
  };
}

export function batchUpdateElos(
  results: Array<{ winnerId: number; loserName: string; winnerName: string; pointDiff: number }>
): void {
  const ratings = loadEloRatings();
  for (const r of results) {
    const winnerElo = ratings[r.winnerName] ?? BASE_ELO;
    const loserElo = ratings[r.loserName] ?? BASE_ELO;
    const { newWinner, newLoser } = updateElo(winnerElo, loserElo, r.pointDiff);
    ratings[r.winnerName] = newWinner;
    ratings[r.loserName] = newLoser;
  }
  saveEloRatings(ratings);
}
