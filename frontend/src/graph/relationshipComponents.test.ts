import { describe, expect, it } from 'vitest';

import {
   buildRelationshipComponents,
   headlineFromPrecomputed,
   headlineFromSummary,
   type VerseSpace,
} from './relationshipComponents';
import type { CompactEdges } from '../types/generated';

/** Verse ids 0–9; ids 0–4 are book 1, ids 6–9 are book 2; id 5 is a gap (not a verse). */
const space: VerseSpace = {
   idSpace: 10,
   forEachVerse(visit) {
      for (const verseId of [ 0, 1, 2, 3, 4, 6, 7, 8, 9 ]) {
         visit(verseId, { bookNumber: verseId < 5 ? 1 : 2 });
      }
   },
};

function edges(rows: Array<[ number, number, number ]>): CompactEdges {
   return {
      source: rows.map((row) => row[0]),
      targetStart: rows.map((row) => row[1]),
      targetEnd: rows.map((row) => row[2]),
      kind: rows.map(() => 0),
      paragraphOrdinal: rows.map(() => null),
      sortPosition: rows.map(() => null),
      commentaryId: rows.map(() => null),
      documentId: rows.map(() => null),
   };
}

describe('buildRelationshipComponents', () => {
   it('separates the main web, small clusters and isolated verses', () => {
      // 0 → 1..3 (range) and 3 → 6 form the main web {0,1,2,3,6}; 7 ↔ 8 is a pair; 4 and 9 are isolated.
      const summary = buildRelationshipComponents(space, edges([ [ 0, 1, 3 ], [ 3, 6, 6 ], [ 7, 8, 8 ], [ 8, 7, 7 ] ]));

      expect(summary.totalVerses).toBe(9);
      expect(summary.totalEdges).toBe(4);
      expect(summary.componentCount).toBe(4);
      expect(summary.giant).toMatchObject({ size: 5, edgeCount: 2 });
      expect(summary.giant?.books).toEqual([ { bookNumber: 1, count: 4 }, { bookNumber: 2, count: 1 } ]);
      expect(summary.smallClusters).toEqual([
         { id: 1, size: 2, edgeCount: 2, verseIds: [ 7, 8 ], books: [ { bookNumber: 2, count: 2 } ] },
      ]);
      expect(summary.smallClusterVerses).toBe(2);
      expect(summary.isolatedCount).toBe(2);
      expect(summary.isolatedByBook).toEqual([
         { bookNumber: 1, verseIds: [ 4 ] },
         { bookNumber: 2, verseIds: [ 9 ] },
      ]);
   });

   it('ignores ids that are not verses and edges that point outside the id space', () => {
      const summary = buildRelationshipComponents(space, edges([ [ 4, 5, 5 ], [ 5, 6, 6 ], [ 9, 40, 42 ], [ 99, 0, 0 ] ]));

      expect(summary.giant).toBeNull();
      expect(summary.smallClusters).toEqual([]);
      expect(summary.isolatedCount).toBe(9);
   });

   it('buckets component sizes by powers of two', () => {
      const summary = buildRelationshipComponents(space, edges([ [ 0, 1, 3 ], [ 3, 6, 6 ], [ 7, 8, 8 ] ]));

      expect(summary.sizeBuckets).toEqual([
         { min: 1, max: 1, clusters: 2, verses: 2 },
         { min: 2, max: 3, clusters: 1, verses: 2 },
         { min: 4, max: 7, clusters: 1, verses: 5 },
      ]);
   });

   it('survives a long chain without overflowing the stack', () => {
      const size = 50_000;
      const chain: VerseSpace = {
         idSpace: size,
         forEachVerse(visit) {
            for (let verseId = 0; verseId < size; verseId += 1) {
               visit(verseId, { bookNumber: 1 });
            }
         },
      };
      const rows: Array<[ number, number, number ]> = [];

      for (let verseId = size - 1; verseId > 0; verseId -= 1) {
         rows.push([ verseId, verseId - 1, verseId - 1 ]);
      }

      expect(buildRelationshipComponents(chain, edges(rows)).giant?.size).toBe(size);
   });
});

describe('cluster headline', () => {
   it('reads the totals of a stats.components.json entry', () => {
      // rbi8 `combined`: 1,931 blocks = the main web + 220 small clusters + 1,710 single verses.
      expect(
         headlineFromPrecomputed({ totalVerses: 31102, blockCount: 1931, isolatedVerses: 1710, largestBlock: { size: 28887 } }),
      ).toEqual({ totalVerses: 31102, giantSize: 28887, smallClusterCount: 220, isolatedCount: 1710 });
   });

   it('handles a graph without a main web and rejects malformed entries', () => {
      expect(headlineFromPrecomputed({ totalVerses: 4, blockCount: 4, isolatedVerses: 4, largestBlock: null })).toEqual({
         totalVerses: 4,
         giantSize: 0,
         smallClusterCount: 0,
         isolatedCount: 4,
      });
      expect(headlineFromPrecomputed(undefined)).toBeNull();
      expect(headlineFromPrecomputed({ totalVerses: 31102 })).toBeNull();
      expect(headlineFromPrecomputed({ totalVerses: 0, blockCount: 0, isolatedVerses: 0, largestBlock: null })).toBeNull();
   });

   it('agrees with the computed summary', () => {
      const space: VerseSpace = {
         idSpace: 10,
         forEachVerse: (visit) => {
            for (let verseId = 0; verseId < 10; verseId += 1) visit(verseId, { bookNumber: 1 });
         },
      };
      const summary = buildRelationshipComponents(space, edges([ [ 0, 1, 3 ], [ 3, 6, 6 ], [ 7, 8, 8 ] ]));

      expect(headlineFromSummary(summary)).toEqual(
         headlineFromPrecomputed({
            totalVerses: summary.totalVerses,
            blockCount: summary.componentCount,
            isolatedVerses: summary.isolatedCount,
            largestBlock: summary.giant ? { size: summary.giant.size } : null,
         }),
      );
   });
});
