import { describe, expect, it } from 'vitest';

import { routeIdFromPath } from '../pages/lazyPages';
import type { Chapter } from '../types/generated';
import { buildVerseIndex } from './generated';

const chapters: Chapter[] = [
   {
      bookNumber: 1,
      chapterNumber: 1,
      label: 'Genesis 1',
      firstVerseId: 0,
      lastVerseId: 1,
      verses: [
         { jwpubVerseId: 0, canonicalVerseId: 1001001, verseNumber: 1, label: 'Genesis 1:1' },
         { jwpubVerseId: 1, canonicalVerseId: 1001002, verseNumber: 2, label: 'Genesis 1:2' },
      ],
   },
   {
      bookNumber: 43,
      chapterNumber: 3,
      label: 'John 3',
      firstVerseId: 26136,
      lastVerseId: 26136,
      verses: [ { jwpubVerseId: 26136, canonicalVerseId: 43003016, verseNumber: 16, label: 'John 3:16' } ],
   },
];

describe('buildVerseIndex', () => {
   it('derives the same VerseRef records verse-index.json contains', () => {
      const index = buildVerseIndex(chapters);

      expect(Object.keys(index)).toHaveLength(3);
      expect(index['26136']).toEqual({
         jwpubVerseId: 26136,
         canonicalVerseId: 43003016,
         bookNumber: 43,
         chapterNumber: 3,
         verseNumber: 16,
         label: 'John 3:16',
      });
   });

   it('memoizes per chapters array', () => {
      expect(buildVerseIndex(chapters)).toBe(buildVerseIndex(chapters));
   });
});

describe('routeIdFromPath', () => {
   it('maps paths to lazily loaded routes', () => {
      expect(routeIdFromPath('/')).toBe('overview');
      expect(routeIdFromPath('/verse/43/3/16')).toBe('verse');
      expect(routeIdFromPath('/chord')).toBe('chord');
      expect(routeIdFromPath('/unknown')).toBe('overview');
   });
});
