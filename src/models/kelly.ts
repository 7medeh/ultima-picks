import { americanToDecimal } from './impliedProbability';

export { americanToDecimal };

export function kellyFraction(winProbability: number, decimalOdds: number): number {
  const b = decimalOdds - 1;
  const p = winProbability;
  const q = 1 - p;
  return (b * p - q) / b;
}

export function fractionalKelly(
  winProbability: number,
  decimalOdds: number,
  fraction: number = 0.25
): number {
  return Math.max(0, kellyFraction(winProbability, decimalOdds) * fraction);
}

export function kellyToUnits(kf: number): number {
  if (kf < 0.02) return 0;
  if (kf < 0.04) return 1;
  if (kf < 0.07) return 2;
  if (kf < 0.10) return 3;
  if (kf < 0.14) return 4;
  return 5;
}

export function parlayExpectedValue(
  picks: Array<{ winProbability: number; americanOdds: number }>
): number {
  const combinedProb = picks.reduce((acc, p) => acc * p.winProbability, 1);
  const combinedDecimalOdds = picks.reduce(
    (acc, p) => acc * americanToDecimal(p.americanOdds),
    1
  );
  return combinedProb * combinedDecimalOdds - 1;
}

export function combineParlayOdds(individualOdds: number[]): number {
  const combined = individualOdds.reduce(
    (acc, odds) => acc * americanToDecimal(odds),
    1
  );
  // Convert back to American
  if (combined >= 2) {
    return Math.round((combined - 1) * 100);
  } else {
    return Math.round(-100 / (combined - 1));
  }
}
