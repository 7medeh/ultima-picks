import {
  scoreModelEdge,
  scoreEloProb,
  scoreRestAdvantage,
  scoreHomeCourtFactor,
  scoreInjuryImpact,
  scoreMomentum,
  scoreH2H,
  calculateCVS,
  getCVSLabel,
} from '../../src/engine/cvs';
import { mockGame } from '../fixtures/mockGameData';
import { ModelOutput } from '../../src/data/types';
import { runPoissonModel } from '../../src/models/poisson';
import { runEloModel } from '../../src/models/elo';
import { runPowerRatingModel } from '../../src/models/powerRating';
import { runImpliedProbabilityModel } from '../../src/models/impliedProbability';

describe('CVS Engine', () => {
  describe('scoreModelEdge', () => {
    it('returns 100 for 15%+ edge', () => {
      expect(scoreModelEdge(0.65, 0.50)).toBe(100);
    });

    it('returns 0 for zero edge', () => {
      expect(scoreModelEdge(0.50, 0.50)).toBe(0);
    });

    it('returns 0 for negative edge', () => {
      expect(scoreModelEdge(0.40, 0.55)).toBe(0);
    });

    it('scales linearly for 0-15% range', () => {
      const score7 = scoreModelEdge(0.57, 0.50);
      expect(score7).toBeGreaterThan(0);
      expect(score7).toBeLessThan(100);
    });
  });

  describe('scoreEloProb', () => {
    it('returns 60 for 60% win probability', () => {
      expect(scoreEloProb(0.60)).toBe(60);
    });

    it('returns 100 for 100% win probability', () => {
      expect(scoreEloProb(1.0)).toBe(100);
    });
  });

  describe('scoreRestAdvantage', () => {
    it('returns 100 for 2+ days advantage', () => {
      expect(scoreRestAdvantage(3, 1)).toBe(100);
    });

    it('returns 70 for 1 day advantage', () => {
      expect(scoreRestAdvantage(2, 1)).toBe(70);
    });

    it('returns 50 for equal rest', () => {
      expect(scoreRestAdvantage(2, 2)).toBe(50);
    });

    it('returns 30 for 1 day disadvantage', () => {
      expect(scoreRestAdvantage(1, 2)).toBe(30);
    });

    it('returns 0 for 2+ days disadvantage', () => {
      expect(scoreRestAdvantage(0, 2)).toBe(0);
    });
  });

  describe('scoreHomeCourtFactor', () => {
    it('returns 65 for home team pick', () => {
      expect(scoreHomeCourtFactor(true)).toBe(65);
    });

    it('returns 35 for away team pick', () => {
      expect(scoreHomeCourtFactor(false)).toBe(35);
    });
  });

  describe('scoreInjuryImpact', () => {
    it('returns 0 for no injury impact', () => {
      expect(scoreInjuryImpact(0)).toBe(0);
    });

    it('returns higher score for more injured opponent', () => {
      expect(scoreInjuryImpact(0.5)).toBeGreaterThan(scoreInjuryImpact(0.2));
    });

    it('caps at 100', () => {
      expect(scoreInjuryImpact(1.0)).toBeLessThanOrEqual(100);
    });
  });

  describe('scoreMomentum', () => {
    it('returns high score for hot team', () => {
      expect(scoreMomentum({ wins: 9, losses: 1 }, 8)).toBeGreaterThan(70);
    });

    it('returns low score for cold team', () => {
      expect(scoreMomentum({ wins: 1, losses: 9 }, -8)).toBeLessThan(30);
    });

    it('returns near 50 for .500 team', () => {
      const score = scoreMomentum({ wins: 5, losses: 5 }, 0);
      expect(score).toBeGreaterThan(40);
      expect(score).toBeLessThan(60);
    });
  });

  describe('scoreH2H', () => {
    it('returns 50 for no H2H history', () => {
      expect(scoreH2H({ team1Wins: 0, team2Wins: 0 })).toBe(50);
    });

    it('caps at 80 for perfect H2H record', () => {
      expect(scoreH2H({ team1Wins: 10, team2Wins: 0 })).toBe(80);
    });

    it('floors at 20 for winless H2H', () => {
      expect(scoreH2H({ team1Wins: 0, team2Wins: 10 })).toBe(20);
    });
  });

  describe('calculateCVS', () => {
    let modelOutputs: ModelOutput[];

    beforeEach(() => {
      modelOutputs = [
        runPoissonModel(mockGame.homeTeamStats, mockGame.awayTeamStats),
        runEloModel(mockGame.homeTeam, mockGame.awayTeam),
        runPowerRatingModel(mockGame.homeTeamStats, mockGame.awayTeamStats),
        runImpliedProbabilityModel(mockGame.odds),
      ];
    });

    it('returns a number between 0 and 100', () => {
      const cvs = calculateCVS(mockGame, 'home', modelOutputs, { team1Wins: 3, team2Wins: 1 });
      expect(cvs).toBeGreaterThanOrEqual(0);
      expect(cvs).toBeLessThanOrEqual(100);
    });

    it('home pick with strong stats scores higher than away', () => {
      const homeCVS = calculateCVS(mockGame, 'home', modelOutputs, { team1Wins: 3, team2Wins: 1 });
      const awayCVS = calculateCVS(mockGame, 'away', modelOutputs, { team1Wins: 1, team2Wins: 3 });
      expect(homeCVS).toBeGreaterThan(awayCVS);
    });
  });

  describe('getCVSLabel', () => {
    it('returns STRONG LOCK for 80+', () => {
      expect(getCVSLabel(85)).toBe('STRONG LOCK');
    });

    it('returns VALUE PLAY for 68-79', () => {
      expect(getCVSLabel(72)).toBe('VALUE PLAY');
    });

    it('returns RADAR for 60-67', () => {
      expect(getCVSLabel(63)).toBe('RADAR');
    });

    it('returns REJECT for below 60', () => {
      expect(getCVSLabel(55)).toBe('REJECT');
    });
  });
});
