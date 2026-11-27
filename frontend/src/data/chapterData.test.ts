import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdjacentEdge, VerseIndex, VerseRef } from '../types/generated';
import {
   adjacentChapter,
   buildChapterVerses,
   chapterMatrixCounts,
   chapterSummary,
   chapterVerseRefs,
   chaptersInBook,
   clearOptionalDataCache,
   connectionLabel,
   detectFeatures,
   displayVerseText,
   groupByBook,
   heatLevel,
   heatStep,
   loadOptionalJson,
   normalizeStudyNotes,
   normalizeVerseDegree,
   summarizeChapter,
   topConnections,
   verseConnections,
   verseCount,
   type ChapterData,
} from './chapterData';

function ref(id: number, bookNumber: number, chapterNumber: number, verseNumber: number, name = 'Book'): VerseRef {
   return {
      jwpubVerseId: id,
      canonicalVerseId: bookNumber * 1_000_000 + chapterNumber * 1000 + verseNumber,
      bookNumber,
      chapterNumber,
      verseNumber,
      label: `${name} ${chapterNumber}:${verseNumber}`,
   };
}

const index: VerseIndex = Object.fromEntries(
   [
      ref(1, 43, 3, 16, 'John'),
      ref(2, 43, 3, 17, 'John'),
      ref(3, 43, 3, 18, 'John'),
      ref(10, 1, 1, 1, 'Genesis'),
      ref(11, 1, 1, 2, 'Genesis'),
      ref(20, 45, 5, 8, 'Romans'),
      ref(21, 45, 6, 1, 'Romans'),
      ref(30, 62, 4, 9, '1 John'),
   ].map((item) => [ String(item.jwpubVerseId), item ]),
);

function edge(source: number, targetStart: number, kind: 0 | 1 = 0, targetEnd = targetStart): AdjacentEdge {
   return { source, targetStart, targetEnd, kind };
}

const john316 = {
   outgoing: [ edge(1, 20), edge(1, 20, 1), edge(1, 30, 1), edge(1, 10, 0, 11) ],
   incoming: [ edge(21, 1), edge(30, 1, 1) ],
};

describe('verse counts and heat', () => {
   it('counts by kind and direction', () => {
      expect(verseCount(john316, 'combined', 'all')).toBe(5);
      expect(verseCount(john316, 'crossrefs', 'all')).toBe(3);
      expect(verseCount(john316, 'study-notes', 'outgoing')).toBe(2);
      expect(verseCount(john316, 'combined', 'incoming')).toBe(2);
   });

   it('scales heat with a square root and steps 1..5', () => {
      expect(heatLevel(0, 10)).toBe(0);
      expect(heatLevel(10, 10)).toBe(1);
      expect(heatLevel(1, 4)).toBeCloseTo(0.5);
      expect(heatStep(0, 10)).toBe(0);
      expect(heatStep(1, 1000)).toBe(1);
      expect(heatStep(10, 10)).toBe(5);
      expect(heatLevel(3, 0)).toBe(0);
   });
});

describe('verse connections', () => {
   it('dedupes by related verse and merges kinds', () => {
      const connections = verseConnections(john316, index, 'combined', 'all');

      expect(connections).toHaveLength(5);
      expect(connections[0]).toMatchObject({ verseId: 20, direction: 'outgoing', kinds: [ 0, 1 ] });
      expect(connections.filter((item) => item.direction === 'incoming').map((item) => item.verseId)).toEqual([ 21, 30 ]);
   });

   it('filters by kind and direction', () => {
      expect(verseConnections(john316, index, 'study-notes', 'outgoing').map((item) => item.verseId)).toEqual([ 20, 30 ]);
      expect(verseConnections(john316, index, 'crossrefs', 'incoming').map((item) => item.verseId)).toEqual([ 21 ]);
   });

   it('labels ranges', () => {
      const range = verseConnections(john316, index, 'combined', 'outgoing').find((item) => item.verseId === 10);

      expect(range && connectionLabel(range)).toBe('Genesis 1:1-2');
      expect(connectionLabel({ verseId: 20, ref: index['20'], endRef: index['21'] })).toBe('Romans 5:8–6:1');
      expect(connectionLabel({ verseId: 20, ref: index['20'], endRef: index['30'] })).toBe('Romans 5:8–1 John 4:9');
      expect(connectionLabel({ verseId: 99, ref: null, endRef: null })).toBe('#99');
   });

   it('groups by book in canonical order', () => {
      const groups = groupByBook(verseConnections(john316, index, 'combined', 'all'));

      expect(groups.map((group) => group.bookNumber)).toEqual([ 1, 45, 62 ]);
      expect(groups[1].items).toHaveLength(2);
   });

   it('ranks top connections by precomputed degree when available', () => {
      const connections = verseConnections(john316, index, 'combined', 'outgoing');
      const degree = { in: Array(40).fill(0), out: Array(40).fill(0) };
      degree.in[30] = 9;
      degree.in[10] = 4;

      expect(topConnections(connections, 2).map((item) => item.verseId)).toEqual([ 20, 30 ]);
      expect(topConnections(connections, 2, degree).map((item) => item.verseId)).toEqual([ 30, 10 ]);
   });
});

describe('chapter summary', () => {
   const verses = [ john316, { outgoing: [ edge(2, 21) ], incoming: [] } ];

   it('aggregates target books and chapters', () => {
      const summary = summarizeChapter(verses, index, 'combined', 'all');

      expect(summary.total).toBe(6);
      expect(summary.books[0]).toEqual({ bookNumber: 45, count: 3, outgoing: 2, incoming: 1 });
      expect(summary.books.map((item) => item.bookNumber)).toEqual([ 45, 62, 1 ]);
      expect(summary.chapters[0]).toEqual({ bookNumber: 45, chapterNumber: 6, count: 2 });
      expect(summary.total).toBe(verses.reduce((sum, verse) => sum + verseCount(verse, 'combined', 'all'), 0));
      expect(summary.source).toBe('adjacency');
   });

   it('lists chapters of one book', () => {
      expect(chaptersInBook(verses, index, 'combined', 'all', 45)).toEqual([
         { bookNumber: 45, chapterNumber: 6, count: 2 },
         { bookNumber: 45, chapterNumber: 5, count: 1 },
      ]);
   });

   it('uses the precomputed matrix only for outgoing with a matching kind', () => {
      const data = {
         chapterNumber: 2,
         verses,
         verseIndex: index,
         chapterMatrix: { combined: [ [ 1 ], [ 0, 5, 0, 2 ] ] },
      } as unknown as ChapterData;

      expect(chapterSummary(data, 'combined', 'outgoing')).toMatchObject({
         source: 'matrix',
         total: 7,
         books: [ { bookNumber: 2, count: 5 }, { bookNumber: 4, count: 2 } ],
      });
      expect(chapterSummary(data, 'crossrefs', 'outgoing').source).toBe('adjacency');
      expect(chapterSummary(data, 'combined', 'all').source).toBe('adjacency');
   });
});

describe('E-G optional file normalizers', () => {
   it('detects features from candidate names', () => {
      expect(detectFeatures({ datasetId: 'x' })).toEqual({ verseDegree: false, chapterMatrix: false, studyNotes: false });
      expect(detectFeatures({ datasetId: 'x', features: [ 'verse-degree', 'study-notes', 'chapter-matrices' ] }))
         .toEqual({ verseDegree: true, chapterMatrix: true, studyNotes: true });
   });

   it('normalizes verse degree', () => {
      expect(normalizeVerseDegree({ in: [ 1 ], out: [ 2 ], inStudy: [ 0 ] })).toEqual({ in: [ 1 ], out: [ 2 ], inStudy: [ 0 ] });
      expect(normalizeVerseDegree({ incoming: [ 1 ], outgoing: [ 2 ] })).toEqual({ in: [ 1 ], out: [ 2 ] });
      expect(normalizeVerseDegree({ in: 'x' })).toBeNull();
      expect(normalizeVerseDegree(null)).toBeNull();
   });

   it('reads chapter matrix variants', () => {
      expect(chapterMatrixCounts([ [ 0, 3 ] ], 1, 'combined')).toEqual(new Map([ [ 2, 3 ] ]));
      expect(chapterMatrixCounts([ [ 0, 3 ] ], 1, 'crossrefs')).toBeNull();
      expect(chapterMatrixCounts({ chapters: { 3: { 40: 7 } } }, 3, 'combined')).toEqual(new Map([ [ 40, 7 ] ]));
      expect(chapterMatrixCounts({ crossrefs: { 1: [ 1 ] } }, 1, 'crossrefs')).toEqual(new Map([ [ 1, 1 ] ]));
      expect(chapterMatrixCounts({ crossrefs: { 1: [ 1 ] } }, 1, 'study-notes')).toBeNull();
      expect(chapterMatrixCounts([ [ 1 ] ], 4, 'combined')).toBeNull();
      expect(chapterMatrixCounts('nope', 1, 'combined')).toBeNull();
   });

   it('reads study note variants', () => {
      expect(normalizeStudyNotes({ 5: 'Note', 6: [ { text: 'A' }, { text: ' ' } ] })).toEqual(new Map([ [ 5, [ 'Note' ] ], [ 6, [ 'A' ] ] ]));
      expect(normalizeStudyNotes({ notes: { 7: { text: 'B' } } })).toEqual(new Map([ [ 7, [ 'B' ] ] ]));
      expect(normalizeStudyNotes([ { verseId: 8, text: 'C' }, { verseId: 8, text: 'D' }, { text: 'no id' } ]))
         .toEqual(new Map([ [ 8, [ 'C', 'D' ] ] ]));
      expect(normalizeStudyNotes(42)).toBeNull();
   });
});

describe('navigation helpers', () => {
   it('crosses book boundaries and stops at the ends', () => {
      expect(adjacentChapter(43, 3, 1)).toEqual({ bookNumber: 43, chapterNumber: 4 });
      expect(adjacentChapter(43, 21, 1)).toEqual({ bookNumber: 44, chapterNumber: 1 });
      expect(adjacentChapter(43, 1, -1)).toEqual({ bookNumber: 42, chapterNumber: 24 });
      expect(adjacentChapter(1, 1, -1)).toBeNull();
      expect(adjacentChapter(66, 22, 1)).toBeNull();
      expect(adjacentChapter(99, 1, 1)).toBeNull();
   });

   it('builds chapter verses from the index in verse order', () => {
      const shuffled: VerseIndex = { 3: index['3'], 1: index['1'], 2: index['2'], 10: index['10'] };
      const refs = chapterVerseRefs(shuffled, 43, 3);

      expect(refs.map((item) => item.verseNumber)).toEqual([ 16, 17, 18 ]);
      expect(chapterVerseRefs(shuffled, 43, 4)).toEqual([]);

      const verses = buildChapterVerses(refs, { 1: { label: 'John 3:16', text: 'For God…' } }, { 1: { outgoing: [ edge(1, 20) ] } }, {});

      expect(verses[0]).toMatchObject({ text: 'For God…', outgoing: [ edge(1, 20) ], incoming: [] });
      expect(verses[1].text).toBeNull();
   });
});

describe('displayVerseText', () => {
   it('restores spaces between joined poetic lines only', () => {
      expect(displayVerseText('Your word is a lamp to my foot,And a light')).toBe('Your word is a lamp to my foot, And a light');
      expect(displayVerseText('me?“Why')).toBe('me? “Why');
      expect(displayVerseText('John 3:16 and 1,000 men; Nic·o·de′mus')).toBe('John 3:16 and 1,000 men; Nic·o·de′mus');
      expect(displayVerseText('perché,È')).toBe('perché, È');
   });
});

describe('loadOptionalJson', () => {
   afterEach(() => {
      vi.unstubAllGlobals();
      clearOptionalDataCache();
   });

   it('resolves null on 404, network error and invalid ids, and caches', async () => {
      const fetchMock = vi.fn<typeof fetch>()
         .mockResolvedValueOnce(new Response('{"a":1}', { status: 200 }))
         .mockResolvedValueOnce(new Response('', { status: 404 }))
         .mockRejectedValueOnce(new Error('offline'));
      vi.stubGlobal('fetch', fetchMock);

      await expect(loadOptionalJson('nwtsty', 'a.json')).resolves.toEqual({ a: 1 });
      await expect(loadOptionalJson('nwtsty', 'a.json')).resolves.toEqual({ a: 1 });
      await expect(loadOptionalJson('nwtsty', 'b.json')).resolves.toBeNull();
      await expect(loadOptionalJson('nwtsty', 'c.json')).resolves.toBeNull();
      await expect(loadOptionalJson('../x', 'd.json')).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenCalledWith('/generated/nwtsty/a.json');
   });
});
