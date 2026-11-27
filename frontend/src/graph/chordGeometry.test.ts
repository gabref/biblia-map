import { describe, expect, it } from 'vitest';

import { arcFitsLabel, isLowerHalf, mergeSpans, midAngle, polarPoint, radialLabel, ringPath } from './chordGeometry';

describe('chordGeometry', () => {
   it('places angle 0 at twelve o\'clock and goes clockwise', () => {
      expect(polarPoint(10, 0).x).toBeCloseTo(0);
      expect(polarPoint(10, 0).y).toBeCloseTo(-10);
      expect(polarPoint(10, Math.PI / 2).x).toBeCloseTo(10);
      expect(polarPoint(10, Math.PI).y).toBeCloseTo(10);
   });

   it('flips radial labels on the left half so they never read upside down', () => {
      expect(radialLabel(Math.PI / 2, 100)).toEqual({ transform: 'rotate(0.00) translate(100,0)', anchor: 'start' });
      expect(radialLabel((3 * Math.PI) / 2, 100)).toEqual({
         transform: 'rotate(180.00) translate(100,0) rotate(180)',
         anchor: 'end',
      });
   });

   it('decides whether an arc can carry a label', () => {
      expect(arcFitsLabel({ startAngle: 0, endAngle: 0.05 }, 280, 13)).toBe(true);
      expect(arcFitsLabel({ startAngle: 0, endAngle: 0.04 }, 280, 13)).toBe(false);
   });

   it('merges consecutive groups with the same key and skips empty ones', () => {
      const groups = [
         { index: 0, startAngle: 0, endAngle: 1 },
         { index: 1, startAngle: 1.1, endAngle: 2 },
         { index: 2, startAngle: 2.1, endAngle: 2.1 },
         { index: 3, startAngle: 2.2, endAngle: 3 },
      ];

      expect(mergeSpans(groups, (index) => (index < 2 ? 'a' : 'b'))).toEqual([
         { key: 'a', startAngle: 0, endAngle: 2 },
         { key: 'b', startAngle: 2.2, endAngle: 3 },
      ]);
   });

   it('draws ring paths in either direction', () => {
      expect(ringPath(10, 0, Math.PI / 2)).toBe('M 0.00 -10.00 A 10 10 0 0 1 10.00 0.00');
      expect(ringPath(10, 0, Math.PI / 2, true)).toBe('M 10.00 0.00 A 10 10 0 0 0 0.00 -10.00');
      expect(midAngle({ startAngle: 1, endAngle: 2 })).toBe(1.5);
      expect(isLowerHalf({ startAngle: 3, endAngle: 3.2 })).toBe(true);
      expect(isLowerHalf({ startAngle: 0, endAngle: 0.5 })).toBe(false);
   });
});
