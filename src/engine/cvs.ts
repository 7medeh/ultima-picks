import fs from 'fs';
import path from 'path';
import { CVSWeights, UpcomingGame, PickSide, ModelOutput } from '../data/types';

const CALIBRATION_PATH = path.resolve('./data/calibration.json');

export const DEFAULT_CVS_WEIGHTS: CVSWeights = {
  modelEdge: 0.25,
  eloProb: 0.20,
  restAdvantage: 0.10,
  homeCourtFactor: 0.10,
  injuryImpact: 0.15,
  momentumScore: 0.10,
  h2hHistory: 0.10,
  lastUpdated: new Date().toISOString(),
};

export function loadCVSWeights(): CVSWeights {
  try {
    if (!fs.existsSync(CALIBRATION_PATH)) return DEFAULT_CVS_WEIGHTS;
    const raw = JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf-8'));
    return (raw.cvsWeights as CVSWeights) ?? DEFAULT_CVS_WEIGHTS;
  } catch {
    return DEFAULT_CVS_WEIGHTS;
  }
}

export function scoreModelEdge(modelWinProb: number, marketImpliedProb: number): number {
  const edge = modelWinProb - marketImpliedProb;
  return Math.min(100, Math.max(0, (edge / 0.15) * 100));
}

export function scoreEloProb(eloWinProb: number): number {
  return eloWinProb * 100;
}

export function scoreRestAdvantage(pickedTeamRest: number, opponentRest: number): number {
  const diff = pickedTeamRest - opponentRest;
  if (diff >= 2) return 100;
  if (diff === 1) return 70;
  if (diff === 0) return 50;
  if (diff === -1) return 30;
  return 0;
}

export function scoreHomeCourtFactor(isPickingHomeTeam: boolean): number {
  return isPickingHomeTeam ? 65 : 35;
}

export function scoreInjuryImpact(opponentInjuryImpact: number): number {
  // injuryImpact 0-1, high = opponent more injured = good for us
  return Math.min(100, opponentInjuryImpact * 150);
}

export function scoreMomentum(
  last10: { wins: number; losses: number },
  pointDiff: number
): number {
  const total = last10.wins + last10.losses;
  if (total === 0) return 50;
  const winRate = last10.wins / total;
  // 10-0=100, 8-2=85, 5-5=50, 2-8=15, 0-10=0
  const baseScore = winRate * 100;
  // Weight in point diff slightly
  const diffBonus = Math.max(-10, Math.min(10, pointDiff)) * 0.5;
  return Math.min(100, Math.max(0, baseScore + diffBonus));
}

export function scoreH2H(h2hRecord: { team1Wins: number; team2Wins: number }): number {
  const total = h2hRecord.team1Wins + h2hRecord.team2Wins;
  if (total === 0) return 50;
  const winRate = h2hRecord.team1Wins / total;
  // Cap at 80, floor at 20
  return Math.min(80, Math.max(20, winRate * 100));
}

export function calculateCVS(
  game: UpcomingGame,
  pickSide: PickSide,
  modelOutputs: ModelOutput[],
  h2hRecord: { team1Wins: number; team2Wins: number },
  weights?: CVSWeights
): number {
  const w = weights ?? loadCVSWeights();

  const isHome = pickSide === 'home';
  const isOver = pickSide === 'over';
  const isUnder = pickSide === 'under';
  const isTotalBet = isOver || isUnder;

  // For totals, we approximate using model average for the "picked" side
  const avgModelProb = isTotalBet
    ? modelOutputs.reduce((acc, m) => acc + m.homeWinProbability, 0) / modelOutputs.length
    : isHome
    ? modelOutputs.reduce((acc, m) => acc + m.homeWinProbability, 0) / modelOutputs.length
    : modelOutputs.reduce((acc, m) => acc + m.awayWinProbability, 0) / modelOutputs.length;

  const { americanToImplied, removeVig } = require('../models/impliedProbability');
  const homeImplied: number = americanToImplied(game.odds.homeMoneyline);
  const awayImplied: number = americanToImplied(game.odds.awayMoneyline);
  const { homeTrue, awayTrue } = removeVig(homeImplied, awayImplied);
  const marketProb = isTotalBet ? 0.5 : isHome ? homeTrue : awayTrue;

  const eloOutput = modelOutputs.find((m) => m.modelName === 'elo');
  const eloWinProb = isTotalBet
    ? 0.5
    : isHome
    ? eloOutput?.homeWinProbability ?? 0.5
    : eloOutput?.awayWinProbability ?? 0.5;

  const pickedTeamStats = isHome ? game.homeTeamStats : game.awayTeamStats;
  const opponentStats = isHome ? game.awayTeamStats : game.homeTeamStats;

  const { calculateInjuryImpact } = require('../models/powerRating');
  const opponentInjuryImpact: number = calculateInjuryImpact(opponentStats.injuryReport);

  const scores = {
    modelEdge: scoreModelEdge(avgModelProb, marketProb),
    eloProb: scoreEloProb(eloWinProb),
    restAdvantage: isTotalBet ? 50 : scoreRestAdvantage(pickedTeamStats.daysOfRest, opponentStats.daysOfRest),
    homeCourtFactor: isTotalBet ? 50 : scoreHomeCourtFactor(isHome),
    injuryImpact: scoreInjuryImpact(opponentInjuryImpact),
    momentumScore: scoreMomentum(pickedTeamStats.last10Record, pickedTeamStats.last10PointDiff),
    h2hHistory: scoreH2H(h2hRecord),
  };

  const cvs =
    scores.modelEdge * w.modelEdge +
    scores.eloProb * w.eloProb +
    scores.restAdvantage * w.restAdvantage +
    scores.homeCourtFactor * w.homeCourtFactor +
    scores.injuryImpact * w.injuryImpact +
    scores.momentumScore * w.momentumScore +
    scores.h2hHistory * w.h2hHistory;

  return Math.min(100, Math.max(0, cvs));
}

export function getCVSLabel(score: number): 'STRONG LOCK' | 'VALUE PLAY' | 'RADAR' | 'REJECT' {
  if (score >= 80) return 'STRONG LOCK';
  if (score >= 68) return 'VALUE PLAY';
  if (score >= 60) return 'RADAR';
  return 'REJECT';
}
