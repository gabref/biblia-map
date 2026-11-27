import { describe, expect, it } from 'vitest';

import { targetFromFinderParams, targetFromOpenParams, targetFromText } from './inboundLinks';

const params = (query: string): URLSearchParams => new URLSearchParams(query);

describe('inbound JW Library links', () => {
   it('decodes a finder verse and picks the dataset from wtlocale + pub', () => {
      expect(targetFromFinderParams(params('wtlocale=I&prefer=lang&bible=43003016&pub=nwtsty'))).toEqual({
         kind: 'verse', book: 43, chapter: 3, verse: 16, datasetId: 'nwtsty-i',
      });
      expect(targetFromFinderParams(params('bible=01001001&pub=Rbi8'))).toEqual({ kind: 'verse', book: 1, chapter: 1, verse: 1, datasetId: 'rbi8' });
   });

   it('keeps same-chapter ranges and treats verse 0 as the whole chapter', () => {
      expect(targetFromFinderParams(params('bible=46013004-46013007'))).toEqual({ kind: 'verse', book: 46, chapter: 13, verse: 4, endVerse: 7 });
      expect(targetFromFinderParams(params('bible=01001000-01001999&wtlocale=E&pub=nwtsty'))).toEqual({
         kind: 'chapter', book: 1, chapter: 1, datasetId: 'nwtsty',
      });
      expect(targetFromFinderParams(params('bible=40005003-40007029'))).toEqual({ kind: 'verse', book: 40, chapter: 5, verse: 3 });
   });

   it('accepts book + chapter and rejects garbage', () => {
      expect(targetFromFinderParams(params('book=19&chapter=23'))).toEqual({ kind: 'chapter', book: 19, chapter: 23 });
      expect(targetFromFinderParams(params('bible=67001001'))).toBeNull();
      expect(targetFromFinderParams(params('bible=abc'))).toBeNull();
      expect(targetFromFinderParams(params('docid=1102021201'))).toBeNull();
   });

   it('finds a link inside shared text, including legacy and wol forms', () => {
      expect(targetFromText('Giovanni 3:16 — https://www.jw.org/finder?srcid=jwlshare&wtlocale=I&bible=43003016&pub=nwtsty.')).toMatchObject({
         kind: 'verse', book: 43, verse: 16, datasetId: 'nwtsty-i',
      });
      expect(targetFromText('jwlibrary:///finder?bible=40024014')).toEqual({ kind: 'verse', book: 40, chapter: 24, verse: 14 });
      expect(targetFromText('https://wol.jw.org/it/wol/b/r6/lp-i/nwtsty/43/3')).toEqual({ kind: 'chapter', book: 43, chapter: 3, datasetId: 'nwtsty-i' });
      expect(targetFromText('https://example.com/finder?bible=43003016')).toBeNull();
      expect(targetFromText('Gv 3:16')).toBeNull();
   });

   it('reads Web Share Target fields in order', () => {
      expect(targetFromOpenParams(params(`title=John&url=${encodeURIComponent('https://www.jw.org/finder?bible=43003016')}`))).toMatchObject({ verse: 16 });
   });
});
