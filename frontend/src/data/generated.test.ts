import { describe, expect, it } from 'vitest';

import { bookFileName, edgeKindCode } from './generated';

describe('generated data helpers', () => {
   it('builds stable per-book adjacency filenames', () => {
      expect(bookFileName({ bookNumber: 45, slug: 'romans' })).toBe('45.romans.json');
   });

   it('maps edge filters to compact edge kind codes', () => {
      expect(edgeKindCode('combined')).toBeNull();
      expect(edgeKindCode('crossrefs')).toBe(0);
      expect(edgeKindCode('study-notes')).toBe(1);
   });
});
