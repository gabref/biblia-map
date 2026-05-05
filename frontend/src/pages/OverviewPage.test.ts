import { describe, expect, it } from 'vitest';

import { buildOverviewDetails } from './OverviewPage';
import type { Book, CompactEdges, VerseIndex } from '../types/generated';

const books: Book[] = [
   { bookNumber: 1, name: 'Genesis', shortName: 'Gen.', slug: 'genesis', testament: 'OT', chapters: 50 },
   { bookNumber: 40, name: 'Matthew', shortName: 'Matt.', slug: 'matthew', testament: 'NT', chapters: 28 },
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
   '40001': {
      jwpubVerseId: 40001,
      canonicalVerseId: 40001,
      bookNumber: 40,
      chapterNumber: 1,
      verseNumber: 1,
      label: 'Matthew 1:1',
   },
};

describe('buildOverviewDetails', () => {
   it('builds complete sorted rows from matrix and compact edge data', () => {
      const edges: CompactEdges = {
         source: [ 1, 1 ],
         targetStart: [ 2, 40001 ],
         targetEnd: [ 2, 40001 ],
         kind: [ 0, 1 ],
         paragraphOrdinal: [ null, null ],
         sortPosition: [ null, null ],
         commentaryId: [ null, 10 ],
         documentId: [ null, 20 ],
      };

      const details = buildOverviewDetails(books, [
         [ 1, 3 ],
         [ 0, 2 ],
      ], edges, verseIndex);

      expect(details.outgoingBooks.rows[0]).toMatchObject({ label: 'Genesis', value: 4 });
      expect(details.referencedVerses.rows.map((row) => row.label)).toEqual([ 'Genesis 1:2', 'Matthew 1:1' ]);
      expect(details.denseChapters.rows[0]).toMatchObject({ label: 'Genesis 1', value: 3 });
   });
});
