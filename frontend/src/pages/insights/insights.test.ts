import { describe, expect, it } from 'vitest';

import type { BookPair } from '../../graph/matrix';
import type { Chapter, SourceAdjacency, VerseIndex } from '../../types/generated';
import { canonSection, canonSectionIndex, isHebrewBook } from './canon';
import { bookPairEdges, groupVersePairs, layoutFlows, parsePairParam } from './flows';
import { bucketOf, chapterMatrixFromAdjacency, chapterValue, legendStops, quantileThresholds } from './heatmap';
import { computeVerseDegrees, hasStudyDegrees, rankHubs } from './hubs';
import { locatorFromChapters, locatorFromSearchIndex, locatorFromVerseIndex } from './locator';
import { verseNumberFromLabel } from './OverviewPanel';
import { flowOfPair, insightsUrl, pairUrl } from './shared';

const books = [
   { bookNumber: 1, name: 'Genesis' },
   { bookNumber: 40, name: 'Matthew' },
];

/**
 * Genesis 1:1-3 = ids 0-2, Genesis 2:1-2 = ids 3-4, (id 5 is a gap), Matthew 1:1-3 = ids 6-8.
 */
const searchIndex = {
   books: [
      { bookNumber: 1, chapters: [ [ 0, 1, 3 ], [ 3, 1, 2 ] ] as Array<[ number, number, number ]> },
      { bookNumber: 40, chapters: [ [ 6, 1, 3 ] ] as Array<[ number, number, number ]> },
   ],
};
const locator = locatorFromSearchIndex(searchIndex, books);

describe('VerseLocator', () => {
   it('maps ids to references and back', () => {
      expect(locator.verseCount).toBe(8);
      expect(locator.idSpace).toBe(9);
      expect(locator.locate(4)).toEqual({ jwpubVerseId: 4, bookNumber: 1, chapterNumber: 2, verseNumber: 2 });
      expect(locator.locate(5)).toBeNull();
      expect(locator.locate(99)).toBeNull();
      expect(locator.idOf(40, 1, 3)).toBe(8);
      expect(locator.idOf(40, 1, 4)).toBeNull();
      expect(locator.bookOf(7)).toBe(40);
      expect(locator.bookOf(5)).toBe(0);
   });

   it('labels verses and ranges with the dataset book names', () => {
      expect(locator.label(6)).toBe('Matthew 1:1');
      expect(locator.rangeLabel(0, 0)).toBe('Genesis 1:1');
      expect(locator.rangeLabel(0, 2)).toBe('Genesis 1:1-3');
      expect(locator.rangeLabel(2, 3)).toBe('Genesis 1:3–2:1');
      expect(locator.chapterSizes(1, 2)).toEqual([ 3, 2 ]);
   });

   it('builds the same runs from the verse index and from chapters.json', () => {
      const verseIndex: VerseIndex = {};
      const chapters: Chapter[] = [];

      locator.forEachVerse((verseId, run) => {
         const verseNumber = run.firstVerseNumber + (verseId - run.firstId);
         const label = `${run.bookNumber} ${run.chapterNumber}:${verseNumber}`;

         verseIndex[String(verseId)] = {
            jwpubVerseId: verseId,
            canonicalVerseId: verseId,
            bookNumber: run.bookNumber,
            chapterNumber: run.chapterNumber,
            verseNumber,
            label,
         };

         let chapter = chapters.find(
            (candidate) => candidate.bookNumber === run.bookNumber && candidate.chapterNumber === run.chapterNumber,
         );

         if (!chapter) {
            chapter = {
               bookNumber: run.bookNumber,
               chapterNumber: run.chapterNumber,
               label: '',
               firstVerseId: verseId,
               lastVerseId: verseId,
               verses: [],
            };
            chapters.push(chapter);
         }

         chapter.verses.push({ jwpubVerseId: verseId, canonicalVerseId: verseId, verseNumber, label });
      });

      expect(locatorFromVerseIndex(verseIndex, books).runs).toEqual(locator.runs);
      expect(locatorFromChapters(chapters, books).runs).toEqual(locator.runs);
   });

   it('splits a chapter whose verse numbers skip', () => {
      const skipping = locatorFromChapters(
         [
            {
               bookNumber: 1,
               chapterNumber: 1,
               label: '',
               firstVerseId: 0,
               lastVerseId: 2,
               verses: [
                  { jwpubVerseId: 0, canonicalVerseId: 0, verseNumber: 1, label: '' },
                  { jwpubVerseId: 1, canonicalVerseId: 1, verseNumber: 2, label: '' },
                  { jwpubVerseId: 2, canonicalVerseId: 2, verseNumber: 4, label: '' },
               ],
            },
         ],
         books,
      );

      expect(skipping.runs).toHaveLength(2);
      expect(skipping.locate(2)?.verseNumber).toBe(4);
      expect(skipping.idOf(1, 1, 4)).toBe(2);
      expect(skipping.idOf(1, 1, 3)).toBeNull();
   });
});

describe('hub verses', () => {
   // 0 → 6 (cross), 1 → 6..8 (cross range), 7 → 0 (study), 3 → 5 (gap target, ignored), 0 → 6 (study).
   const edges = {
      source: [ 0, 1, 7, 3, 0 ],
      targetStart: [ 6, 6, 0, 5, 6 ],
      targetEnd: [ 6, 8, 0, 5, 6 ],
      kind: [ 0, 0, 1, 0, 1 ] as Array<0 | 1>,
   };
   const degrees = computeVerseDegrees(edges, locator);

   it('counts in/out degree per kind, expanding ranges and skipping non-verses', () => {
      expect(Array.from(degrees.in)).toEqual([ 0, 0, 0, 0, 0, 0, 2, 1, 1 ]);
      expect(Array.from(degrees.out)).toEqual([ 1, 1, 0, 1, 0, 0, 0, 0, 0 ]);
      expect(Array.from(degrees.inStudy)).toEqual([ 1, 0, 0, 0, 0, 0, 1, 0, 0 ]);
      expect(Array.from(degrees.outStudy)).toEqual([ 1, 0, 0, 0, 0, 0, 0, 1, 0 ]);
      expect(hasStudyDegrees(degrees)).toBe(true);
   });

   it('ranks the most cited verses, with ties in canonical order', () => {
      const rows = rankHubs(degrees, locator, { metric: 'referenced' });

      expect(rows.map((row) => [ row.jwpubVerseId, row.value ])).toEqual([ [ 6, 3 ], [ 0, 1 ], [ 7, 1 ], [ 8, 1 ] ]);
      expect(rows[0]).toMatchObject({ bookNumber: 40, chapterNumber: 1, verseNumber: 1, incoming: 3, outgoing: 0 });
   });

   it('filters by reference type, book, testament and limit', () => {
      expect(rankHubs(degrees, locator, { metric: 'referenced', kind: 'crossrefs' })[0].value).toBe(2);
      expect(rankHubs(degrees, locator, { metric: 'referring', kind: 'combined', limit: 1 })).toMatchObject([
         { jwpubVerseId: 0, value: 2 },
      ]);
      expect(rankHubs(degrees, locator, { metric: 'referring', bookNumber: 40 }).map((row) => row.jwpubVerseId)).toEqual([ 7 ]);
      expect(rankHubs(degrees, locator, { metric: 'referenced', testament: 'OT' }).map((row) => row.jwpubVerseId)).toEqual([ 0 ]);
      expect(rankHubs(degrees, locator, { metric: 'study' }).map((row) => row.jwpubVerseId)).toEqual([ 0, 6 ]);
   });
});

describe('quotation flows', () => {
   const pairs: BookPair[] = [
      { sourceBookNumber: 40, targetBookNumber: 23, weight: 60, reverseWeight: 0 },
      { sourceBookNumber: 40, targetBookNumber: 19, weight: 30, reverseWeight: 0 },
      { sourceBookNumber: 45, targetBookNumber: 19, weight: 10, reverseWeight: 0 },
   ];

   it('lays out both columns on one scale and keeps every band inside its bar', () => {
      const layout = layoutFlows(pairs, { height: 110, nodeGap: 10 });

      // 100 references over 100 usable units (110 - one gap): one unit per reference.
      expect(layout.sources.map((node) => [ node.bookNumber, node.y, node.height ])).toEqual([ [ 40, 0, 90 ], [ 45, 100, 10 ] ]);
      expect(layout.targets.map((node) => [ node.bookNumber, node.y, node.height ])).toEqual([ [ 19, 0, 40 ], [ 23, 50, 60 ] ]);

      const [ toIsaiah, toPsalms, romans ] = layout.links;

      expect(toPsalms).toMatchObject({ sourceY: 15, targetY: 15, thickness: 30 });
      expect(toIsaiah).toMatchObject({ sourceY: 60, targetY: 80, thickness: 60 });
      expect(romans).toMatchObject({ sourceY: 105, targetY: 35, thickness: 10 });
   });

   it('returns an empty layout without references', () => {
      expect(layoutFlows([], { height: 100 })).toEqual({ sources: [], targets: [], links: [] });
   });

   it('extracts the verse pairs behind a book pair from source adjacency', () => {
      const edge = (source: number, targetStart: number, targetEnd: number, kind: 0 | 1) => ({ source, targetStart, targetEnd, kind });
      const adjacency: SourceAdjacency = {
         '1': { outgoing: [ edge(1, 7, 8, 0), edge(1, 3, 3, 0) ] },
         '0': { outgoing: [ edge(0, 6, 6, 1), edge(0, 6, 6, 0) ] },
      };
      const bookOf = (verseId: number): number => locator.bookOf(verseId);

      expect(bookPairEdges(adjacency, bookOf, 40)).toEqual([
         { source: 0, targetStart: 6, targetEnd: 6, kind: 0 },
         { source: 0, targetStart: 6, targetEnd: 6, kind: 1 },
         { source: 1, targetStart: 7, targetEnd: 8, kind: 0 },
      ]);
      expect(bookPairEdges(adjacency, bookOf, 40, 'study-notes')).toHaveLength(1);
      expect(groupVersePairs(bookPairEdges(adjacency, bookOf, 40))).toEqual([
         { source: 0, targetStart: 6, targetEnd: 6, crossReferences: 1, studyNotes: 1 },
         { source: 1, targetStart: 7, targetEnd: 8, crossReferences: 1, studyNotes: 0 },
      ]);
      expect(bookPairEdges(adjacency, bookOf, 1, 'crossrefs')).toEqual([ { source: 1, targetStart: 3, targetEnd: 3, kind: 0 } ]);
   });

   it('parses and builds pair URLs', () => {
      expect(parsePairParam('23-40')).toEqual({ source: 23, target: 40 });
      expect(parsePairParam('0-40')).toBeNull();
      expect(parsePairParam('23-67')).toBeNull();
      expect(parsePairParam('isaiah')).toBeNull();
      expect(parsePairParam(null)).toBeNull();
      expect(flowOfPair(40, 23)).toBe('nt-ot');
      expect(flowOfPair(23, 40)).toBe('ot-nt');
      expect(flowOfPair(19, 23)).toBe('all');
      expect(pairUrl(40, 23, { carry: { ds: 'rbi8' }, kind: 'crossrefs' })).toBe(
         '/insights?tab=flows&ds=rbi8&kind=crossrefs&pair=40-23&flow=nt-ot',
      );
      expect(insightsUrl({ tab: 'overview' })).toBe('/insights');
      expect(insightsUrl({ tab: 'overview', book: 'psalms' })).toBe('/insights?book=psalms');
      expect(insightsUrl({ tab: 'chord', kind: 'combined', book: 'psalms' })).toBe('/insights?tab=chord&book=psalms');
   });
});

describe('heatmap scale', () => {
   it('picks strictly increasing quantile thresholds from non-zero values', () => {
      expect(quantileThresholds([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 0 ], 4)).toEqual([ 2, 4, 6, 8 ]);
      expect(quantileThresholds([ 5, 5, 5, 5 ], 4)).toEqual([ 5 ]);
      expect(quantileThresholds([ 0, 0 ], 4)).toEqual([]);
   });

   it('assigns values to colour classes', () => {
      const thresholds = [ 2, 4, 6, 8 ];

      expect([ 0, 1, 2, 3, 6, 8, 99 ].map((value) => bucketOf(value, thresholds))).toEqual([ 0, 1, 1, 2, 3, 4, 4 ]);
      expect(bucketOf(3, [])).toBe(0);
      expect(legendStops(thresholds, true)).toEqual([
         { bucket: 1, from: 1, to: 2 },
         { bucket: 2, from: 3, to: 4 },
         { bucket: 3, from: 5, to: 6 },
         { bucket: 4, from: 7, to: 8 },
      ]);
   });

   it('reads the chosen metric of a chapter', () => {
      const stat = { incoming: 7, outgoing: 3 };

      expect(chapterValue(stat, 'total')).toBe(10);
      expect(chapterValue(stat, 'incoming')).toBe(7);
      expect(chapterValue(stat, 'outgoing')).toBe(3);
   });

   it('aggregates chapter → book counts from adjacency, counting ranged edges once', () => {
      const locate = (verseId: number) => locator.locate(verseId);
      const outgoing = [
         { source: 0, targetStart: 6, targetEnd: 6, kind: 0 },
         { source: 1, targetStart: 6, targetEnd: 6, kind: 1 },
         { source: 3, targetStart: 0, targetEnd: 0, kind: 0 },
      ];
      // Matthew 1:1 → Genesis 1:1-2 appears under both target verses in target adjacency.
      const incoming = [
         { source: 6, targetStart: 0, targetEnd: 1, kind: 0 },
         { source: 6, targetStart: 0, targetEnd: 1, kind: 0 },
         { source: 3, targetStart: 0, targetEnd: 0, kind: 0 },
      ];

      expect(chapterMatrixFromAdjacency(1, 2, outgoing, incoming, locate)).toEqual({
         bookNumber: 1,
         chapters: 2,
         outgoing: [ [ [ 40, 1, 1, 2 ] ], [ [ 1, 1, 0, 1 ] ] ],
         incoming: [ [ [ 1, 1, 0, 1 ], [ 40, 1, 0, 1 ] ], [] ],
      });
   });
});

describe('canon sections', () => {
   it('assigns every book to one of seven sections', () => {
      expect(canonSection(1).id).toBe('law');
      expect(canonSection(19).id).toBe('poetry');
      expect(canonSection(39).id).toBe('prophets');
      expect(canonSection(44).id).toBe('gospels');
      expect(canonSection(65).id).toBe('letters');
      expect(canonSection(66).id).toBe('revelation');
      expect(new Set(Array.from({ length: 66 }, (_, index) => canonSectionIndex(index + 1))).size).toBe(7);
      expect(isHebrewBook(39)).toBe(true);
      expect(isHebrewBook(40)).toBe(false);
   });
});

describe('verseNumberFromLabel', () => {
   it('reads the verse number from a citation', () => {
      expect(verseNumberFromLabel('John 3:16')).toBe(16);
      expect(verseNumberFromLabel('1 Giovanni 4:8')).toBe(8);
      expect(verseNumberFromLabel('Jude 1:25')).toBe(25);
      expect(verseNumberFromLabel('Genesis')).toBeNull();
   });
});
