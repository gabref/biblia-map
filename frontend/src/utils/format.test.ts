import { describe, expect, it } from 'vitest';

import { edgeKindLabel, formatNumber, formatPercent } from './format';

describe('formatPercent', () => {
   it('rounds ordinary shares', () => {
      expect(formatPercent(1, 4)).toBe('25%');
      expect(formatPercent(2, 3)).toBe('67%');
   });

   it('does not report a non-empty share as 0%', () => {
      expect(formatPercent(3, 31_078)).toBe('<1%');
   });

   it('does not report a partial share as 100%', () => {
      expect(formatPercent(31_070, 31_078)).toBe('>99%');
   });

   it('keeps exact extremes and empty totals', () => {
      expect(formatPercent(0, 10)).toBe('0%');
      expect(formatPercent(10, 10)).toBe('100%');
      expect(formatPercent(5, 0)).toBe('0%');
   });
});

describe('formatNumber', () => {
   it('groups thousands', () => {
      expect(formatNumber(1234567)).toBe('1,234,567');
   });
});

describe('edgeKindLabel', () => {
   it('labels every edge kind code', () => {
      expect(edgeKindLabel(0)).toBe('Cross reference');
      expect(edgeKindLabel(1)).toBe('Study note');
      expect(edgeKindLabel(2)).toBe('Footnote');
   });
});
