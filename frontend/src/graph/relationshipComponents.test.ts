import { describe, expect, it } from 'vitest';

import { buildRelationshipComponents } from './relationshipComponents';
import type { Book, CompactEdges, VerseIndex } from '../types/generated';

const books: Book[] = [
   { bookNumber: 1, name: 'Genesis', shortName: 'Gen.', slug: 'genesis', testament: 'OT', chapters: 50 },
   { bookNumber: 2, name: 'Exodus', shortName: 'Ex.', slug: 'exodus', testament: 'OT', chapters: 40 },
];

const verseIndex: VerseIndex = {
   '1': {
      jwpubVerseId: 1,
      canonicalVerseId: 1,
      bookNumber: 1,
      chapterNumber: 1,
      verseNumber: 1,
      label: 'Genesis 1:1',
   },
   '2': {
      jwpubVerseId: 2,
      canonicalVerseId: 2,
      bookNumber: 1,
      chapterNumber: 1,
      verseNumber: 2,
      label: 'Genesis 1:2',
   },
   '3': {
      jwpubVerseId: 3,
      canonicalVerseId: 3,
      bookNumber: 2,
      chapterNumber: 1,
      verseNumber: 1,
      label: 'Exodus 1:1',
   },
   '4': {
      jwpubVerseId: 4,
      canonicalVerseId: 4,
      bookNumber: 2,
      chapterNumber: 1,
      verseNumber: 2,
      label: 'Exodus 1:2',
   },
};

describe('buildRelationshipComponents', () => {
   it('groups verses into undirected reference blocks and preserves isolated verses', () => {
      const edges: CompactEdges = {
         source: [ 1 ],
         targetStart: [ 2 ],
         targetEnd: [ 3 ],
         kind: [ 0 ],
         paragraphOrdinal: [ null ],
         sortPosition: [ null ],
         commentaryId: [ null ],
         documentId: [ null ],
      };

      const summary = buildRelationshipComponents(verseIndex, edges, books);

      expect(summary.blockCount).toBe(2);
      expect(summary.isolatedVerses).toBe(1);
      expect(summary.largestBlock).toMatchObject({
         size: 3,
         edgeCount: 1,
      });
      expect(summary.components[0].topBooks.map((book) => book.name)).toEqual([ 'Genesis', 'Exodus' ]);
   });
});
