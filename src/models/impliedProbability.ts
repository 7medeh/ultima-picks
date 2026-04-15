import { GameOdds, ModelOutput } from '../data/types';

export function americanToImplied(americanOdds: number): number {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

export function removeVig(
  homeImplied: number,
  awayImplied: number
): { homeTrue: number; awayTrue: number } {
  const totalImplied = homeImplied + awayImplied;
  return {
    homeTrue: homeImplied / totalImplied,
    awayTrue: awayImplied / totalImplied,
  };
}

export function impliedToAmerican(probability: number): number {
  if (probability > 0.5) {
    return -((probability / (1 - probability)) * 100);
  } else {
    return ((1 - probability) / probability) * 100;
  }
}

export function calculateEdge(modelProb: number, marketImpliedProb: number): number {
  return modelProb - marketImpliedProb;
}

export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return americanOdds / 100 + 1;
  } else {
    return 100 / Math.abs(americanOdds) + 1;
  }
}

export function runImpliedProbabilityModel(odds: GameOdds): ModelOutput {
  const homeImplied = americanToImplied(odds.homeMoneyline);
  const awayImplied = americanToImplied(odds.awayMoneyline);
  const { homeTrue, awayTrue } = removeVig(homeImplied, awayImplied);

  // Spread as implied model: use spread to compute expected point diff
  const predictedSpread = odds.spread;

  // Market consensus confidence: tighter spread = more confident market
  const vigPercent = (homeImplied + awayImplied) - 1;
  const confidence = Math.max(0.5, 1 - vigPercent * 5);

  return {
    modelName: 'impliedProbability',
    homeWinProbability: homeTrue,
    awayWinProbability: awayTrue,
    predictedSpread,
    confidence,
  };
}
