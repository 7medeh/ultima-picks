import {
  kellyFraction,
  fractionalKelly,
  kellyToUnits,
  americanToDecimal,
  parlayExpectedValue,
  combineParlayOdds,
} from '../../src/models/kelly';

describe('Kelly Criterion', () => {
  describe('americanToDecimal', () => {
    it('converts -110 to approximately 1.909', () => {
      expect(americanToDecimal(-110)).toBeCloseTo(1.909, 2);
    });

    it('converts +150 to 2.5', () => {
      expect(americanToDecimal(150)).toBeCloseTo(2.5, 5);
    });

    it('converts +100 to 2.0', () => {
      expect(americanToDecimal(100)).toBeCloseTo(2.0, 5);
    });

    it('converts -200 to 1.5', () => {
      expect(americanToDecimal(-200)).toBeCloseTo(1.5, 5);
    });
  });

  describe('kellyFraction', () => {
    it('returns 0 at break-even (prob matches decimal odds)', () => {
      // At -110, decimal = 1.909, b = 0.909. Break-even = 1/1.909 ≈ 0.524
      expect(kellyFraction(0.524, 1.909)).toBeCloseTo(0, 1);
    });

    it('returns positive for favorable bet', () => {
      expect(kellyFraction(0.6, 2.0)).toBeGreaterThan(0);
    });

    it('returns negative for unfavorable bet', () => {
      expect(kellyFraction(0.3, 1.5)).toBeLessThan(0);
    });

    it('returns correct value for known input', () => {
      // b=1, p=0.6, q=0.4: f = (1*0.6 - 0.4)/1 = 0.2
      expect(kellyFraction(0.6, 2.0)).toBeCloseTo(0.2, 5);
    });
  });

  describe('fractionalKelly', () => {
    it('returns 25% of full Kelly by default', () => {
      const full = kellyFraction(0.6, 2.0);
      const frac = fractionalKelly(0.6, 2.0);
      expect(frac).toBeCloseTo(full * 0.25, 5);
    });

    it('never returns negative', () => {
      expect(fractionalKelly(0.3, 1.5)).toBe(0);
    });

    it('respects custom fraction', () => {
      const full = kellyFraction(0.6, 2.0);
      const half = fractionalKelly(0.6, 2.0, 0.5);
      expect(half).toBeCloseTo(full * 0.5, 5);
    });
  });

  describe('kellyToUnits', () => {
    it('returns 0 for Kelly < 0.02', () => {
      expect(kellyToUnits(0.01)).toBe(0);
    });

    it('returns 1 for Kelly between 0.02 and 0.04', () => {
      expect(kellyToUnits(0.03)).toBe(1);
    });

    it('returns 3 for Kelly between 0.07 and 0.10', () => {
      expect(kellyToUnits(0.08)).toBe(3);
    });

    it('returns 5 for Kelly >= 0.14', () => {
      expect(kellyToUnits(0.20)).toBe(5);
    });
  });

  describe('parlayExpectedValue', () => {
    it('returns negative EV for -EV individual picks', () => {
      const picks = [
        { winProbability: 0.45, americanOdds: -110 },
        { winProbability: 0.45, americanOdds: -110 },
      ];
      expect(parlayExpectedValue(picks)).toBeLessThan(0);
    });

    it('returns positive EV for picks with edges', () => {
      const picks = [
        { winProbability: 0.65, americanOdds: -110 },
        { winProbability: 0.65, americanOdds: -110 },
      ];
      expect(parlayExpectedValue(picks)).toBeGreaterThan(0);
    });
  });

  describe('combineParlayOdds', () => {
    it('combines two -110 picks into valid parlay odds', () => {
      const combined = combineParlayOdds([-110, -110]);
      // Two -110 legs at 1.909 each = 1.909^2 ≈ 3.644 = +264
      expect(combined).toBeGreaterThan(200);
      expect(combined).toBeLessThan(350);
    });

    it('larger parlay = higher odds', () => {
      const twoLeg = combineParlayOdds([-110, -110]);
      const fourLeg = combineParlayOdds([-110, -110, -110, -110]);
      expect(fourLeg).toBeGreaterThan(twoLeg);
    });

    it('single pick returns same as individual', () => {
      const single = combineParlayOdds([150]);
      // Should be close to 150 (decimal 2.5 → +150)
      expect(single).toBeCloseTo(150, -1);
    });
  });
});
