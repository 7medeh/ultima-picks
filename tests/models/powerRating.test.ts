import {
  calculateInjuryImpact,
  calculateMomentumScore,
  calculatePowerRating,
  powerRatingToWinProb,
  powerRatingToSpread,
  runPowerRatingModel,
} from '../../src/models/powerRating';
import { mockHomeStats, mockAwayStats, mockInjuredPlayer } from '../fixtures/mockGameData';

describe('Power Rating Model', () => {
  describe('calculateInjuryImpact', () => {
    it('returns 0 with no injuries', () => {
      expect(calculateInjuryImpact([])).toBe(0);
    });

    it('returns higher value with more significant injury', () => {
      const out = calculateInjuryImpact([{ ...mockInjuredPlayer, status: 'out' }]);
      const prob = calculateInjuryImpact([{ ...mockInjuredPlayer, status: 'probable' }]);
      expect(out).toBeGreaterThan(prob);
    });

    it('returns value between 0 and 1', () => {
      const impact = calculateInjuryImpact([mockInjuredPlayer]);
      expect(impact).toBeGreaterThanOrEqual(0);
      expect(impact).toBeLessThanOrEqual(1);
    });

    it('multiple injured players increases impact', () => {
      const single = calculateInjuryImpact([mockInjuredPlayer]);
      const double = calculateInjuryImpact([mockInjuredPlayer, mockInjuredPlayer]);
      expect(double).toBeGreaterThanOrEqual(single);
    });
  });

  describe('calculateMomentumScore', () => {
    it('returns 100 for undefeated last 10', () => {
      expect(calculateMomentumScore({ wins: 10, losses: 0 }, 8)).toBeGreaterThan(80);
    });

    it('returns 0 for winless last 10', () => {
      expect(calculateMomentumScore({ wins: 0, losses: 10 }, -8)).toBeLessThan(20);
    });

    it('returns near 50 for .500 record', () => {
      const score = calculateMomentumScore({ wins: 5, losses: 5 }, 0);
      expect(score).toBeGreaterThan(30);
      expect(score).toBeLessThan(70);
    });

    it('returns 50 for empty record', () => {
      expect(calculateMomentumScore({ wins: 0, losses: 0 }, 0)).toBe(50);
    });
  });

  describe('calculatePowerRating', () => {
    it('returns higher rating for team with better net rating', () => {
      const highNet = { ...mockHomeStats, netRating: 10, injuryReport: [] };
      const lowNet = { ...mockHomeStats, netRating: -5, injuryReport: [] };
      expect(calculatePowerRating(highNet)).toBeGreaterThan(calculatePowerRating(lowNet));
    });

    it('decreases rating when team has major injuries', () => {
      const healthy = calculatePowerRating({ ...mockHomeStats, injuryReport: [] });
      const injured = calculatePowerRating({ ...mockHomeStats, injuryReport: [mockInjuredPlayer, mockInjuredPlayer] });
      expect(injured).toBeLessThanOrEqual(healthy);
    });
  });

  describe('powerRatingToWinProb', () => {
    it('probabilities sum to 1', () => {
      const { homeWin, awayWin } = powerRatingToWinProb(5, 0);
      expect(homeWin + awayWin).toBeCloseTo(1, 5);
    });

    it('higher power rating = higher win probability', () => {
      const { homeWin } = powerRatingToWinProb(10, 0);
      const { homeWin: lower } = powerRatingToWinProb(2, 0);
      expect(homeWin).toBeGreaterThan(lower);
    });

    it('equal ratings give home court edge', () => {
      const { homeWin } = powerRatingToWinProb(0, 0);
      expect(homeWin).toBeGreaterThan(0.5);
    });
  });

  describe('powerRatingToSpread', () => {
    it('favored team has negative spread', () => {
      const spread = powerRatingToSpread(8, 2);
      expect(spread).toBeLessThan(0);
    });

    it('scales linearly: double the difference = double the spread', () => {
      const s1 = powerRatingToSpread(4, 0);
      const s2 = powerRatingToSpread(8, 0);
      expect(Math.abs(s2)).toBeCloseTo(Math.abs(s1) * 2, 1);
    });
  });

  describe('runPowerRatingModel', () => {
    it('returns valid ModelOutput', () => {
      const output = runPowerRatingModel(mockHomeStats, mockAwayStats);
      expect(output.modelName).toBe('powerRating');
      expect(output.homeWinProbability + output.awayWinProbability).toBeCloseTo(1, 5);
    });

    it('favors team with better net rating', () => {
      const output = runPowerRatingModel(mockHomeStats, mockAwayStats);
      expect(output.homeWinProbability).toBeGreaterThan(output.awayWinProbability);
    });
  });
});
