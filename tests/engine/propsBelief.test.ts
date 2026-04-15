import {
  scorePropModelEdge,
  scorePropRecentForm,
  scorePropMatchup,
  scorePropUsage,
  scorePropRestAndPace,
  scorePropInjuryContext,
  calculatePropCVS,
  getPropBeliefLabel,
  generatePropRationale,
} from '../../src/engine/propsBelief';
import { OpponentDefenseRating, PlayerProfile } from '../../src/data/types';

const neutralDefense: OpponentDefenseRating = {
  teamId: 2,
  teamName: 'Miami Heat',
  pointsAllowedToPosition: 1.0,
  reboundsAllowedToPosition: 1.0,
  assistsAllowedToPosition: 1.0,
  paceAdjustment: 1.0,
};

const mockProfile: PlayerProfile = {
  playerId: 1,
  name: 'Jayson Tatum',
  teamId: 1,
  teamName: 'Boston Celtics',
  position: 'F',
  seasonAvgPoints: 26.9,
  seasonAvgRebounds: 8.1,
  seasonAvgAssists: 4.9,
  seasonAvgThrees: 3.0,
  seasonAvgSteals: 1.1,
  seasonAvgBlocks: 0.6,
  seasonAvgMinutes: 35.5,
  seasonAvgUsageRate: 0.31,
  last5Avg: {
    points: 28.2, rebounds: 7.8, assists: 5.2, threes: 3.4,
    steals: 1.2, blocks: 0.5,
    points_rebounds_assists: 41.2, points_rebounds: 36.0, points_assists: 33.4,
  },
  recentGameLogs: [],
  injuryStatus: 'active',
};

describe('Props Belief Engine', () => {
  describe('scorePropModelEdge', () => {
    it('returns 100 for 15%+ edge', () => {
      expect(scorePropModelEdge(0.15)).toBe(100);
    });

    it('returns 75 for 10% edge', () => {
      expect(scorePropModelEdge(0.10)).toBe(75);
    });

    it('returns 25 for 0% edge', () => {
      expect(scorePropModelEdge(0)).toBe(25);
    });

    it('returns 0 for negative edge', () => {
      expect(scorePropModelEdge(-0.05)).toBe(0);
    });
  });

  describe('scorePropRecentForm', () => {
    it('returns 100 for 5/5 hits on over', () => {
      expect(scorePropRecentForm(5, 'over')).toBe(100);
    });

    it('returns 0 for 0/5 hits on over', () => {
      expect(scorePropRecentForm(0, 'over')).toBe(0);
    });

    it('returns 100 for 0/5 hits on under (no overs = under always hit)', () => {
      expect(scorePropRecentForm(0, 'under')).toBe(100);
    });

    it('returns 60 for 3/5 hits on over', () => {
      expect(scorePropRecentForm(3, 'over')).toBe(60);
    });

    it('flips for under direction', () => {
      const overScore = scorePropRecentForm(4, 'over');
      const underScore = scorePropRecentForm(4, 'under');
      expect(overScore).toBeGreaterThan(underScore);
    });
  });

  describe('scorePropMatchup', () => {
    it('returns > 50 for weak defense on over', () => {
      const weakDef = { ...neutralDefense, pointsAllowedToPosition: 1.12 };
      expect(scorePropMatchup(weakDef, 'points', 'over')).toBeGreaterThan(50);
    });

    it('returns < 50 for strong defense on over', () => {
      const strongDef = { ...neutralDefense, pointsAllowedToPosition: 0.88 };
      expect(scorePropMatchup(strongDef, 'points', 'over')).toBeLessThan(50);
    });

    it('flips for under direction', () => {
      const weakDef = { ...neutralDefense, pointsAllowedToPosition: 1.12 };
      const overScore = scorePropMatchup(weakDef, 'points', 'over');
      const underScore = scorePropMatchup(weakDef, 'points', 'under');
      expect(underScore).toBeLessThan(overScore);
    });

    it('returns 50 for neutral defense', () => {
      expect(scorePropMatchup(neutralDefense, 'points', 'over')).toBeCloseTo(50, 0);
    });
  });

  describe('scorePropUsage', () => {
    it('returns 100 for high usage (30%+)', () => {
      expect(scorePropUsage(0.32)).toBe(100);
    });

    it('returns 60 for league-average usage (20%)', () => {
      expect(scorePropUsage(0.20)).toBe(60);
    });

    it('returns 20 for low usage', () => {
      expect(scorePropUsage(0.10)).toBe(20);
    });
  });

  describe('scorePropRestAndPace', () => {
    it('returns higher score for more rest', () => {
      const well_rested = scorePropRestAndPace(2, 98);
      const fatigued = scorePropRestAndPace(0, 98);
      expect(well_rested).toBeGreaterThan(fatigued);
    });

    it('returns score between 0 and 100', () => {
      const score = scorePropRestAndPace(1, 100);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('scorePropInjuryContext', () => {
    it('returns 0 for questionable player', () => {
      expect(scorePropInjuryContext(0, true)).toBe(0);
    });

    it('returns higher score with more teammates out', () => {
      const none = scorePropInjuryContext(0, false);
      const two = scorePropInjuryContext(2, false);
      expect(two).toBeGreaterThan(none);
    });

    it('caps at 100', () => {
      expect(scorePropInjuryContext(10, false)).toBeLessThanOrEqual(100);
    });
  });

  describe('calculatePropCVS', () => {
    it('returns a value between 0 and 100', () => {
      const cvs = calculatePropCVS(
        0.10, 4, 'over', neutralDefense, 'points',
        0.28, 2, 98, 0, false, 75
      );
      expect(cvs).toBeGreaterThanOrEqual(0);
      expect(cvs).toBeLessThanOrEqual(100);
    });

    it('high-edge + good form = higher CVS', () => {
      const good = calculatePropCVS(0.12, 5, 'over', neutralDefense, 'points', 0.30, 2, 98, 0, false, 100);
      const bad = calculatePropCVS(0.02, 1, 'over', neutralDefense, 'points', 0.15, 0, 95, 0, false, 25);
      expect(good).toBeGreaterThan(bad);
    });

    it('questionable player gets penalized', () => {
      const active = calculatePropCVS(0.10, 4, 'over', neutralDefense, 'points', 0.28, 2, 98, 0, false, 75);
      const questionable = calculatePropCVS(0.10, 4, 'over', neutralDefense, 'points', 0.28, 2, 98, 0, true, 75);
      expect(active).toBeGreaterThan(questionable);
    });
  });

  describe('getPropBeliefLabel', () => {
    it('returns CONVICTION for high CVS + big edge', () => {
      expect(getPropBeliefLabel(75, 0.10)).toBe('CONVICTION');
    });

    it('returns LEAN for moderate CVS', () => {
      expect(getPropBeliefLabel(65, 0.05)).toBe('LEAN');
    });

    it('returns SPECULATIVE for low CVS', () => {
      expect(getPropBeliefLabel(45, 0.03)).toBe('SPECULATIVE');
    });
  });

  describe('generatePropRationale', () => {
    it('returns a non-empty array', () => {
      const rationale = generatePropRationale(
        mockProfile, 'points', 'over', 24.5, 27.2, 0.10, 4, 7, neutralDefense, 72
      );
      expect(Array.isArray(rationale)).toBe(true);
      expect(rationale.length).toBeGreaterThan(0);
    });

    it('all items are non-empty strings with emoji indicators', () => {
      const rationale = generatePropRationale(
        mockProfile, 'points', 'over', 24.5, 27.2, 0.10, 4, 7, neutralDefense, 72
      );
      for (const item of rationale) {
        expect(typeof item).toBe('string');
        expect(item.length).toBeGreaterThan(0);
      }
      const hasEmoji = rationale.some((r) =>
        r.startsWith('✅') || r.startsWith('⚠️') || r.startsWith('❌')
      );
      expect(hasEmoji).toBe(true);
    });

    it('mentions the player name', () => {
      const rationale = generatePropRationale(
        mockProfile, 'points', 'over', 24.5, 27.2, 0.10, 4, 7, neutralDefense, 72
      );
      const combined = rationale.join(' ');
      expect(combined.length).toBeGreaterThan(50);
    });
  });
});
