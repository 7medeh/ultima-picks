import {
  calculateModelConsensus,
  scoreMarketDisagreement,
  calculateBeliefScore,
  getBeliefLabel,
  generateBeliefRationale,
} from '../../src/engine/belief';
import { mockGame } from '../fixtures/mockGameData';
import { ModelOutput } from '../../src/data/types';

const mockModels: ModelOutput[] = [
  { modelName: 'poisson', homeWinProbability: 0.62, awayWinProbability: 0.38, predictedSpread: -3.5, confidence: 0.6 },
  { modelName: 'elo', homeWinProbability: 0.65, awayWinProbability: 0.35, predictedSpread: -4.0, confidence: 0.65 },
  { modelName: 'powerRating', homeWinProbability: 0.60, awayWinProbability: 0.40, predictedSpread: -3.0, confidence: 0.55 },
  { modelName: 'impliedProbability', homeWinProbability: 0.58, awayWinProbability: 0.42, predictedSpread: -4.5, confidence: 0.7 },
];

const divergingModels: ModelOutput[] = [
  { modelName: 'poisson', homeWinProbability: 0.70, awayWinProbability: 0.30, predictedSpread: -5, confidence: 0.7 },
  { modelName: 'elo', homeWinProbability: 0.45, awayWinProbability: 0.55, predictedSpread: 2, confidence: 0.4 },
  { modelName: 'powerRating', homeWinProbability: 0.80, awayWinProbability: 0.20, predictedSpread: -7, confidence: 0.8 },
  { modelName: 'impliedProbability', homeWinProbability: 0.40, awayWinProbability: 0.60, predictedSpread: 3, confidence: 0.4 },
];

describe('Belief Engine', () => {
  describe('calculateModelConsensus', () => {
    it('returns high consensus for closely aligned models', () => {
      const { consensusScore } = calculateModelConsensus(mockModels);
      expect(consensusScore).toBeGreaterThan(70);
    });

    it('returns low consensus for diverging models', () => {
      const { consensusScore } = calculateModelConsensus(divergingModels);
      expect(consensusScore).toBeLessThan(60);
    });

    it('returns avgProbability between 0 and 1', () => {
      const { avgProbability } = calculateModelConsensus(mockModels);
      expect(avgProbability).toBeGreaterThan(0);
      expect(avgProbability).toBeLessThan(1);
    });

    it('std deviation is higher for diverging models', () => {
      const { stdDeviation: low } = calculateModelConsensus(mockModels);
      const { stdDeviation: high } = calculateModelConsensus(divergingModels);
      expect(high).toBeGreaterThan(low);
    });
  });

  describe('scoreMarketDisagreement', () => {
    it('returns 100 for 15%+ edge', () => {
      expect(scoreMarketDisagreement(0.65, 0.50)).toBe(100);
    });

    it('returns 25 for zero edge', () => {
      expect(scoreMarketDisagreement(0.50, 0.50)).toBe(25);
    });

    it('returns 0 for negative edge', () => {
      expect(scoreMarketDisagreement(0.40, 0.55)).toBe(0);
    });

    it('returns 50 for 5% edge', () => {
      expect(scoreMarketDisagreement(0.55, 0.50)).toBe(50);
    });
  });

  describe('calculateBeliefScore', () => {
    it('returns a value between 0 and 100', () => {
      const score = calculateBeliefScore(75, 80, 0.56, 75);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('higher CVS = higher belief score', () => {
      const lowCVS = calculateBeliefScore(60, 75, 0.52, 50);
      const highCVS = calculateBeliefScore(85, 75, 0.52, 50);
      expect(highCVS).toBeGreaterThan(lowCVS);
    });

    it('higher consensus = higher belief score', () => {
      const lowConsensus = calculateBeliefScore(70, 40, 0.52, 50);
      const highConsensus = calculateBeliefScore(70, 90, 0.52, 50);
      expect(highConsensus).toBeGreaterThan(lowConsensus);
    });
  });

  describe('getBeliefLabel', () => {
    it('returns CONVICTION for 75+', () => {
      expect(getBeliefLabel(80)).toBe('CONVICTION');
    });

    it('returns LEAN for 60-74', () => {
      expect(getBeliefLabel(65)).toBe('LEAN');
    });

    it('returns SPECULATIVE for below 60', () => {
      expect(getBeliefLabel(50)).toBe('SPECULATIVE');
    });
  });

  describe('generateBeliefRationale', () => {
    it('returns a non-empty array of strings', () => {
      const rationale = generateBeliefRationale(
        mockGame,
        'home',
        mockModels,
        75,
        80,
        { team1Wins: 3, team2Wins: 1 }
      );
      expect(Array.isArray(rationale)).toBe(true);
      expect(rationale.length).toBeGreaterThan(0);
    });

    it('all items are non-empty strings', () => {
      const rationale = generateBeliefRationale(
        mockGame,
        'home',
        mockModels,
        75,
        80,
        { team1Wins: 3, team2Wins: 1 }
      );
      for (const item of rationale) {
        expect(typeof item).toBe('string');
        expect(item.length).toBeGreaterThan(0);
      }
    });

    it('includes emoji indicators', () => {
      const rationale = generateBeliefRationale(
        mockGame,
        'home',
        mockModels,
        75,
        80,
        { team1Wins: 3, team2Wins: 1 }
      );
      const hasEmoji = rationale.some((r) => r.startsWith('✅') || r.startsWith('⚠️') || r.startsWith('❌'));
      expect(hasEmoji).toBe(true);
    });

    it('generates rationale for away team too', () => {
      const rationale = generateBeliefRationale(
        mockGame,
        'away',
        mockModels,
        60,
        55,
        { team1Wins: 1, team2Wins: 3 }
      );
      expect(rationale.length).toBeGreaterThan(0);
    });
  });
});
