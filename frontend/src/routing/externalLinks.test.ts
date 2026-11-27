import { describe, expect, it } from 'vitest';

import { bibleKey, jwFinderHref } from './externalLinks';

describe('jwFinderHref', () => {
   it('builds a jw.org finder link in the dataset language', () => {
      expect(jwFinderHref(43_003_016, { lang: 'it', publicationSymbol: 'nwtsty' })).toBe(
         'https://www.jw.org/finder?wtlocale=I&prefer=lang&bible=43003016&pub=nwtsty',
      );
   });

   it('pads Genesis ids and lowercases the symbol', () => {
      expect(bibleKey(1_001_001)).toBe('01001001');
      expect(jwFinderHref(1_001_001, { lang: 'en', publicationSymbol: 'Rbi8' })).toBe(
         'https://www.jw.org/finder?wtlocale=E&prefer=lang&bible=01001001&pub=rbi8',
      );
   });

   it('encodes a forward range and ignores a backward one', () => {
      expect(jwFinderHref(46_013_004, { lang: 'en', publicationSymbol: 'nwt' }, 46_013_007)).toContain(
         'bible=46013004-46013007',
      );
      expect(jwFinderHref(46_013_004, { lang: 'en', publicationSymbol: 'nwt' }, 46_013_001)).toContain('bible=46013004&');
   });

   it('falls back to English and omits a missing pub', () => {
      expect(jwFinderHref(43_003_016, { lang: undefined, publicationSymbol: undefined })).toBe(
         'https://www.jw.org/finder?wtlocale=E&prefer=lang&bible=43003016',
      );
   });

   it('rejects ids outside the canon', () => {
      expect(jwFinderHref(0, { lang: 'en', publicationSymbol: 'nwt' })).toBeNull();
      expect(jwFinderHref(67_001_001, { lang: 'en', publicationSymbol: 'nwt' })).toBeNull();
   });
});
