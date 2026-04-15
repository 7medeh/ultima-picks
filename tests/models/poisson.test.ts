import {
  poissonPMF,
  calculateExpectedPoints,
  buildScoreMatrix,
  calculateOutcomeProbabilities,
  calculateTotalProbabilities,
  runPoissonModel,
} from '../../src/models/poisson';
import { mockHomeStats, mockAwayStats } from '../fixtures/mockGameData';

describe('Poisson Model', () => {
  describe('poissonPMF', () => {
    it('returns 1 for lambda=0, k=0', () => {
      expect(poissonPMF(0, 0)).toBeCloseTo(1, 5);
    });

    it('returns correct PMF for lambda=1, k=0', () => {
      expect(poissonPMF(1, 0)).toBeCloseTo(Math.exp(-1), 5);
    });

    it('returns correct PMF for lambda=110, k=110', () => {
      const val = poissonPMF(110, 110);
      expect(val).toBeGreaterThan(0);
      expect(val).toBeLessThan(0.1);
    });
  });

  describe('calculateExpectedPoints', () => {
    it('returns a reasonable score range for NBA (90-140)', () => {
      const pts = calculateExpectedPoints(115, 112, 98, 98);
      expect(pts).toBeGreaterThan(85);
      expect(pts).toBeLessThan(145);
    });

    it('increases when offensive rating is higher', () => {
      const low = calculateExpectedPoints(108, 112, 98, 98);
      const high = calculateExpectedPoints(120, 112, 98, 98);
      expect(high).toBeGreaterThan(low);
    });

    it('decreases when defensive rating is lower (better defense)', () => {
      const weak = calculateExpectedPoints(115, 115, 98, 98);
      const strong = calculateExpectedPoints(115, 100, 98, 98);
      expect(strong).toBeLessThan(weak);
    });
  });

  describe('buildScoreMatrix', () => {
    it('builds a square matrix of correct size', () => {
      const matrix = buildScoreMatrix(112, 108, 80, 90);
      expect(matrix.length).toBe(11);
      expect(matrix[0].length).toBe(11);
    });

    it('all values are non-negative', () => {
      const matrix = buildScoreMatrix(112, 108);
      for (const row of matrix) {
        for (const val of row) {
          expect(val).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('probabilities sum to approximately 1', () => {
      const matrix = buildScoreMatrix(112, 108);
      const total = matrix.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0);
      expect(total).toBeCloseTo(1, 1);
    });
  });

  describe('calculateOutcomeProbabilities', () => {
    it('probabilities sum to approximately 1', () => {
      const matrix = buildScoreMatrix(112, 108);
      const { homeWin, awayWin, push } = calculateOutcomeProbabilities(matrix);
      expect(homeWin + awayWin + push).toBeCloseTo(1, 2);
    });

    it('favors home team when home lambda is higher', () => {
      const matrix = buildScoreMatrix(120, 100);
      const { homeWin, awayWin } = calculateOutcomeProbabilities(matrix);
      expect(homeWin).toBeGreaterThan(awayWin);
    });

    it('favors away team when away lambda is higher', () => {
      const matrix = buildScoreMatrix(100, 120);
      const { homeWin, awayWin } = calculateOutcomeProbabilities(matrix);
      expect(awayWin).toBeGreaterThan(homeWin);
    });
  });

  describe('calculateTotalProbabilities', () => {
    it('over + under + push sums to approximately 1', () => {
      const matrix = buildScoreMatrix(112, 108);
      const { over, under, push } = calculateTotalProbabilities(matrix, 218.5);
      expect(over + under + push).toBeCloseTo(1, 2);
    });

    it('over is higher when lambda sum exceeds totalLine', () => {
      // High scoring game
      const matrix = buildScoreMatrix(125, 125, 80, 160);
      const { over } = calculateTotalProbabilities(matrix, 210, 80);
      expect(over).toBeGreaterThan(0.5);
    });
  });

  describe('runPoissonModel', () => {
    it('returns a valid ModelOutput', () => {
      const output = runPoissonModel(mockHomeStats, mockAwayStats);
      expect(output.modelName).toBe('poisson');
      expect(output.homeWinProbability).toBeGreaterThan(0);
      expect(output.homeWinProbability).toBeLessThan(1);
      expect(output.awayWinProbability).toBeGreaterThan(0);
      expect(output.awayWinProbability).toBeLessThan(1);
      expect(output.homeWinProbability + output.awayWinProbability).toBeCloseTo(1, 2);
    });

    it('favors team with better offensive/defensive rating', () => {
      const output = runPoissonModel(mockHomeStats, mockAwayStats);
      // Home has better net rating, so should win more often
      expect(output.homeWinProbability).toBeGreaterThan(output.awayWinProbability);
    });
  });
});
