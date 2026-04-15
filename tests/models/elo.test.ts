import {
  expectedScore,
  updateElo,
  movMultiplier,
  eloToWinProb,
  eloToSpread,
  runEloModel,
} from '../../src/models/elo';
import { mockHomeTeam, mockAwayTeam } from '../fixtures/mockGameData';

describe('Elo Model', () => {
  describe('expectedScore', () => {
    it('returns 0.5 when ratings are equal', () => {
      expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
    });

    it('returns > 0.5 when ratingA > ratingB', () => {
      expect(expectedScore(1600, 1500)).toBeGreaterThan(0.5);
    });

    it('returns < 0.5 when ratingA < ratingB', () => {
      expect(expectedScore(1400, 1500)).toBeLessThan(0.5);
    });

    it('100 point difference gives approximately 64% win prob', () => {
      expect(expectedScore(1600, 1500)).toBeCloseTo(0.64, 1);
    });
  });

  describe('movMultiplier', () => {
    it('is always positive', () => {
      expect(movMultiplier(10, 100)).toBeGreaterThan(0);
      expect(movMultiplier(1, 0)).toBeGreaterThan(0);
    });

    it('larger margin of victory = larger multiplier', () => {
      const small = movMultiplier(3, 100);
      const large = movMultiplier(20, 100);
      expect(large).toBeGreaterThan(small);
    });
  });

  describe('updateElo', () => {
    it('winner gains Elo, loser loses Elo', () => {
      const { newWinner, newLoser } = updateElo(1500, 1500, 10);
      expect(newWinner).toBeGreaterThan(1500);
      expect(newLoser).toBeLessThan(1500);
    });

    it('upset gives larger Elo gain', () => {
      const { newWinner: upsetWinner } = updateElo(1400, 1600, 10);
      const { newWinner: expectedWinner } = updateElo(1600, 1400, 10);
      expect(upsetWinner - 1400).toBeGreaterThan(expectedWinner - 1600);
    });
  });

  describe('eloToWinProb', () => {
    it('home team advantage: home wins more than 50% with equal Elo', () => {
      const { homeWin } = eloToWinProb(1500, 1500, false);
      expect(homeWin).toBeGreaterThan(0.5);
    });

    it('neutral site: equal teams get 50/50', () => {
      const { homeWin } = eloToWinProb(1500, 1500, true);
      expect(homeWin).toBeCloseTo(0.5, 3);
    });

    it('probabilities sum to 1', () => {
      const { homeWin, awayWin } = eloToWinProb(1550, 1480, false);
      expect(homeWin + awayWin).toBeCloseTo(1, 5);
    });
  });

  describe('eloToSpread', () => {
    it('favored team has negative spread', () => {
      const spread = eloToSpread(1600, 1500);
      expect(spread).toBeLessThan(0);
    });

    it('equal teams have spread near 0 (after HCA adjustment)', () => {
      const spread = eloToSpread(1500, 1500);
      // Home court is +100 Elo = ~4 points
      expect(Math.abs(spread)).toBeGreaterThan(0);
    });
  });

  describe('runEloModel', () => {
    it('returns valid ModelOutput structure', () => {
      const output = runEloModel(mockHomeTeam, mockAwayTeam);
      expect(output.modelName).toBe('elo');
      expect(output.homeWinProbability).toBeGreaterThan(0);
      expect(output.homeWinProbability).toBeLessThan(1);
      expect(output.awayWinProbability).toBeGreaterThan(0);
      expect(output.awayWinProbability).toBeLessThan(1);
    });
  });
});
