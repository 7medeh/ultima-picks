import {
  americanToImplied,
  removeVig,
  impliedToAmerican,
  calculateEdge,
  runImpliedProbabilityModel,
} from '../../src/models/impliedProbability';
import { mockOdds } from '../fixtures/mockGameData';

describe('Implied Probability Model', () => {
  describe('americanToImplied', () => {
    it('converts -110 to approximately 0.524', () => {
      expect(americanToImplied(-110)).toBeCloseTo(0.524, 2);
    });

    it('converts +100 to 0.5', () => {
      expect(americanToImplied(100)).toBeCloseTo(0.5, 5);
    });

    it('converts -200 to approximately 0.667', () => {
      expect(americanToImplied(-200)).toBeCloseTo(0.667, 2);
    });

    it('converts +150 to approximately 0.4', () => {
      expect(americanToImplied(150)).toBeCloseTo(0.4, 2);
    });

    it('converts -180 to approximately 0.643', () => {
      expect(americanToImplied(-180)).toBeCloseTo(0.643, 2);
    });

    it('converts +155 to approximately 0.392', () => {
      expect(americanToImplied(155)).toBeCloseTo(0.392, 2);
    });

    it('always returns between 0 and 1', () => {
      expect(americanToImplied(-500)).toBeGreaterThan(0);
      expect(americanToImplied(-500)).toBeLessThan(1);
      expect(americanToImplied(500)).toBeGreaterThan(0);
      expect(americanToImplied(500)).toBeLessThan(1);
    });
  });

  describe('removeVig', () => {
    it('normalized probabilities sum to 1', () => {
      const { homeTrue, awayTrue } = removeVig(0.55, 0.53);
      expect(homeTrue + awayTrue).toBeCloseTo(1, 10);
    });

    it('favored side still has higher probability after vig removal', () => {
      const { homeTrue, awayTrue } = removeVig(0.6, 0.45);
      expect(homeTrue).toBeGreaterThan(awayTrue);
    });

    it('equal implied odds → 50/50 after vig removal', () => {
      const { homeTrue, awayTrue } = removeVig(0.52, 0.52);
      expect(homeTrue).toBeCloseTo(0.5, 5);
      expect(awayTrue).toBeCloseTo(0.5, 5);
    });
  });

  describe('impliedToAmerican', () => {
    it('converts 0.5 to +100', () => {
      expect(impliedToAmerican(0.5)).toBeCloseTo(100, 0);
    });

    it('converts 0.667 to approximately -200', () => {
      expect(impliedToAmerican(0.667)).toBeCloseTo(-200, 0);
    });

    it('converts 0.4 to approximately +150', () => {
      expect(impliedToAmerican(0.4)).toBeCloseTo(150, 0);
    });

    it('round-trips: american → implied → american', () => {
      const original = -180;
      const implied = americanToImplied(original);
      const backToAmerican = impliedToAmerican(implied);
      expect(backToAmerican).toBeCloseTo(original, 0);
    });
  });

  describe('calculateEdge', () => {
    it('returns positive when model is more optimistic', () => {
      expect(calculateEdge(0.6, 0.5)).toBeCloseTo(0.1, 5);
    });

    it('returns negative when market is more optimistic', () => {
      expect(calculateEdge(0.4, 0.55)).toBeCloseTo(-0.15, 5);
    });

    it('returns 0 when equal', () => {
      expect(calculateEdge(0.5, 0.5)).toBe(0);
    });
  });

  describe('runImpliedProbabilityModel', () => {
    it('returns valid ModelOutput structure', () => {
      const output = runImpliedProbabilityModel(mockOdds);
      expect(output.modelName).toBe('impliedProbability');
      expect(output.homeWinProbability + output.awayWinProbability).toBeCloseTo(1, 5);
    });

    it('favored team has higher probability', () => {
      const output = runImpliedProbabilityModel(mockOdds);
      // -180 home = favored
      expect(output.homeWinProbability).toBeGreaterThan(output.awayWinProbability);
    });
  });
});
