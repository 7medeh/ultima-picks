import {
  normalCDF,
  probOver,
  probUnder,
  getStatFromLog,
  getSeasonAvg,
  calculateProjectedValue,
  calculateStdDev,
  hitRateVsLine,
  runPropsModel,
  assessLineValue,
  checkFloorCeiling,
} from '../../src/models/propsModel';
import { PlayerProfile, PlayerGameLog, OpponentDefenseRating } from '../../src/data/types';

const mockGameLog = (pts: number, reb: number, ast: number, threes: number = 2): PlayerGameLog => ({
  date: '2025-04-10',
  opponent: 'Heat',
  isHome: true,
  minutes: 34,
  points: pts,
  rebounds: reb,
  assists: ast,
  threes,
  steals: 1,
  blocks: 0.5,
  usageRate: 0.28,
});

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
    points: 28.2,
    rebounds: 7.8,
    assists: 5.2,
    threes: 3.4,
    steals: 1.2,
    blocks: 0.5,
    points_rebounds_assists: 41.2,
    points_rebounds: 36.0,
    points_assists: 33.4,
  },
  recentGameLogs: [
    mockGameLog(32, 9, 6),
    mockGameLog(24, 8, 4),
    mockGameLog(29, 7, 5),
    mockGameLog(27, 6, 6),
    mockGameLog(31, 9, 5),
    mockGameLog(22, 8, 4),
    mockGameLog(28, 7, 5),
    mockGameLog(30, 9, 6),
    mockGameLog(26, 8, 5),
    mockGameLog(25, 7, 4),
  ],
  injuryStatus: 'active',
};

const neutralDefense: OpponentDefenseRating = {
  teamId: 2,
  teamName: 'Miami Heat',
  pointsAllowedToPosition: 1.0,
  reboundsAllowedToPosition: 1.0,
  assistsAllowedToPosition: 1.0,
  paceAdjustment: 1.0,
};

const weakDefense: OpponentDefenseRating = {
  ...neutralDefense,
  pointsAllowedToPosition: 1.12,
  paceAdjustment: 1.03,
};

const strongDefense: OpponentDefenseRating = {
  ...neutralDefense,
  pointsAllowedToPosition: 0.88,
  paceAdjustment: 0.97,
};

describe('Props Model', () => {
  describe('normalCDF', () => {
    it('returns 0.5 for z=0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 3);
    });

    it('returns ~0.841 for z=1', () => {
      expect(normalCDF(1)).toBeCloseTo(0.841, 2);
    });

    it('returns ~0.159 for z=-1', () => {
      expect(normalCDF(-1)).toBeCloseTo(0.159, 2);
    });

    it('returns ~0.977 for z=2', () => {
      expect(normalCDF(2)).toBeCloseTo(0.977, 2);
    });

    it('always returns between 0 and 1', () => {
      expect(normalCDF(-5)).toBeGreaterThanOrEqual(0);
      expect(normalCDF(5)).toBeLessThanOrEqual(1);
    });
  });

  describe('probOver / probUnder', () => {
    it('probOver + probUnder ≈ 1 for continuous distribution', () => {
      const o = probOver(26, 5, 24.5);
      const u = probUnder(26, 5, 24.5);
      expect(o + u).toBeCloseTo(1, 2);
    });

    it('probOver > 0.5 when mean > line', () => {
      expect(probOver(30, 5, 24.5)).toBeGreaterThan(0.5);
    });

    it('probUnder > 0.5 when mean < line', () => {
      expect(probUnder(20, 5, 24.5)).toBeGreaterThan(0.5);
    });

    it('returns 0.5 when mean equals line', () => {
      expect(probOver(24.5, 5, 24.5)).toBeCloseTo(0.5, 2);
    });
  });

  describe('getStatFromLog', () => {
    const log = mockGameLog(28, 9, 6, 3);

    it('returns points', () => expect(getStatFromLog(log, 'points')).toBe(28));
    it('returns rebounds', () => expect(getStatFromLog(log, 'rebounds')).toBe(9));
    it('returns assists', () => expect(getStatFromLog(log, 'assists')).toBe(6));
    it('returns threes', () => expect(getStatFromLog(log, 'threes')).toBe(3));
    it('returns PRA combo', () => expect(getStatFromLog(log, 'points_rebounds_assists')).toBe(43));
    it('returns PR combo', () => expect(getStatFromLog(log, 'points_rebounds')).toBe(37));
    it('returns PA combo', () => expect(getStatFromLog(log, 'points_assists')).toBe(34));
  });

  describe('getSeasonAvg', () => {
    it('returns seasonAvgPoints for points', () => {
      expect(getSeasonAvg(mockProfile, 'points')).toBe(26.9);
    });

    it('returns sum for combo stats', () => {
      const pra = getSeasonAvg(mockProfile, 'points_rebounds_assists');
      expect(pra).toBeCloseTo(26.9 + 8.1 + 4.9, 5);
    });
  });

  describe('calculateProjectedValue', () => {
    it('returns a positive value', () => {
      expect(calculateProjectedValue(mockProfile, 'points', neutralDefense)).toBeGreaterThan(0);
    });

    it('is higher against weak defense', () => {
      const neutral = calculateProjectedValue(mockProfile, 'points', neutralDefense);
      const weak = calculateProjectedValue(mockProfile, 'points', weakDefense);
      expect(weak).toBeGreaterThan(neutral);
    });

    it('is lower against strong defense', () => {
      const neutral = calculateProjectedValue(mockProfile, 'points', neutralDefense);
      const strong = calculateProjectedValue(mockProfile, 'points', strongDefense);
      expect(strong).toBeLessThan(neutral);
    });

    it('returns reasonable NBA range for points', () => {
      const proj = calculateProjectedValue(mockProfile, 'points', neutralDefense);
      expect(proj).toBeGreaterThan(15);
      expect(proj).toBeLessThan(50);
    });
  });

  describe('calculateStdDev', () => {
    it('returns a positive value', () => {
      const proj = calculateProjectedValue(mockProfile, 'points', neutralDefense);
      expect(calculateStdDev(mockProfile, 'points', proj)).toBeGreaterThan(0);
    });

    it('returns at least 15% of projected value as floor', () => {
      const proj = calculateProjectedValue(mockProfile, 'points', neutralDefense);
      const stdDev = calculateStdDev(mockProfile, 'points', proj);
      expect(stdDev).toBeGreaterThanOrEqual(proj * 0.15);
    });
  });

  describe('hitRateVsLine', () => {
    it('returns correct hit count (over 25.5 in last 5)', () => {
      // Game logs: 32, 24, 29, 27, 31 — 4 are over 25.5
      const hits = hitRateVsLine(mockProfile, 'points', 25.5, 5);
      expect(hits).toBe(4);
    });

    it('returns 0 for impossible line', () => {
      expect(hitRateVsLine(mockProfile, 'points', 50, 5)).toBe(0);
    });

    it('returns N for very low line', () => {
      expect(hitRateVsLine(mockProfile, 'points', 10, 5)).toBe(5);
    });
  });

  describe('runPropsModel', () => {
    it('returns valid output structure', () => {
      const output = runPropsModel(mockProfile, 'points', 24.5, -115, -105, neutralDefense);
      expect(output.stat).toBe('points');
      expect(output.projectedValue).toBeGreaterThan(0);
      expect(output.overProbability + output.underProbability).toBeCloseTo(1, 1);
    });

    it('shows positive edge when projection is well above line', () => {
      // Proj ~26-27, line = 20 — should heavily favor over
      const output = runPropsModel(mockProfile, 'points', 20, -115, -105, neutralDefense);
      expect(output.overProbability).toBeGreaterThan(0.7);
      expect(output.modelEdge).toBeGreaterThan(0);
    });

    it('shows negative edge when projection is below line', () => {
      const output = runPropsModel(mockProfile, 'points', 35, -115, -105, neutralDefense);
      expect(output.underProbability).toBeGreaterThan(0.6);
      expect(output.modelEdge).toBeLessThan(0);
    });

    it('confidence is between 0 and 1', () => {
      const output = runPropsModel(mockProfile, 'points', 24.5, -115, -105, neutralDefense);
      expect(output.confidence).toBeGreaterThanOrEqual(0);
      expect(output.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('assessLineValue', () => {
    it('returns high score when projection far from line', () => {
      expect(assessLineValue(20, 30)).toBe(100);
    });

    it('returns low score when projection near line', () => {
      expect(assessLineValue(25, 26)).toBe(25);
    });
  });

  describe('checkFloorCeiling', () => {
    it('correctly identifies reachable line (player has exceeded it)', () => {
      // Max in logs is 32 — line of 30 is reachable
      const { floorOk } = checkFloorCeiling(mockProfile, 'points', 30);
      expect(floorOk).toBe(true);
    });

    it('correctly identifies unreachable ceiling (player never hit line)', () => {
      const { floorOk } = checkFloorCeiling(mockProfile, 'points', 50);
      expect(floorOk).toBe(false);
    });

    it('includes range comment', () => {
      const { comment } = checkFloorCeiling(mockProfile, 'points', 25);
      expect(comment).toContain('Range last 10');
    });
  });
});
