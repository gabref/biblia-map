import { describe, expect, it } from 'vitest';

import {
   bookTotals,
   filterBookMatrix,
   matrixLinkCount,
   matrixMaximum,
   matrixTotal,
   partnerBooks,
   rankBookPairs,
   testamentFlows,
   weightBounds,
} from './matrix';
import type { Book, BookMatrix } from '../types/generated';

function book(bookNumber: number, name: string, testament: 'OT' | 'NT'): Book {
   return { bookNumber, name, shortName: name, slug: name.toLowerCase(), testament, chapters: 1 };
}

const books: Book[] = [ book(1, 'Genesis', 'OT'), book(23, 'Isaiah', 'OT'), book(40, 'Matthew', 'NT') ];

/** Rows cite columns. */
const matrix: BookMatrix = [
   [ 10, 5, 2 ],
   [ 8, 4, 1 ],
   [ 7, 9, 3 ],
];

describe('filterBookMatrix', () => {
   it('applies scope, minimum weight, and self-link filters', () => {
      const filtered = filterBookMatrix(matrix, books, { minWeight: 6, scope: 'all', showSelfLinks: false });

      expect(filtered).toEqual([
         [ 0, 0, 0 ],
         [ 8, 0, 0 ],
         [ 7, 9, 0 ],
      ]);
      expect(matrixTotal(filtered)).toBe(24);
      expect(matrixLinkCount(filtered)).toBe(3);
      expect(matrixMaximum(filtered)).toBe(9);
   });

   it('keeps only links inside the chosen testament', () => {
      expect(filterBookMatrix(matrix, books, { minWeight: 1, scope: 'ot', showSelfLinks: true })).toEqual([
         [ 10, 5, 0 ],
         [ 8, 4, 0 ],
         [ 0, 0, 0 ],
      ]);
   });
});

describe('bookTotals', () => {
   it('counts the diagonal once, separately from outgoing and incoming', () => {
      expect(bookTotals(matrix)).toEqual([
         { outgoing: 7, incoming: 15, self: 10, total: 32 },
         { outgoing: 9, incoming: 14, self: 4, total: 27 },
         { outgoing: 16, incoming: 3, self: 3, total: 22 },
      ]);
   });
});

describe('weightBounds', () => {
   it('shows everything when there are few links', () => {
      expect(weightBounds(matrix)).toEqual({ max: 2, defaultValue: 1 });
   });

   it('derives the default threshold from the strongest links, ignoring self-links', () => {
      // 30 off-diagonal weights 1..30 plus a huge diagonal that must not influence the range.
      const size = 6;
      const wide: BookMatrix = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
      let weight = 1;

      for (let row = 0; row < size; row += 1) {
         for (let column = 0; column < size; column += 1) {
            wide[row][column] = row === column ? 9999 : weight++;
         }
      }

      const bounds = weightBounds(wide, 10);

      // Twelfth strongest of 30..1 is 19; the tenth strongest is 21, clamped to the maximum.
      expect(bounds.max).toBe(19);
      expect(bounds.defaultValue).toBe(19);
      expect(weightBounds(wide, 20).defaultValue).toBe(11);
   });

   it('handles an empty matrix', () => {
      expect(weightBounds([ [ 0, 0 ], [ 0, 0 ] ])).toEqual({ max: 1, defaultValue: 1 });
   });
});

describe('rankBookPairs', () => {
   it('ranks directed pairs and excludes self-links by default', () => {
      const pairs = rankBookPairs(matrix, books);

      expect(pairs.map((pair) => [ pair.sourceBookNumber, pair.targetBookNumber, pair.weight, pair.reverseWeight ])).toEqual([
         [ 40, 23, 9, 1 ],
         [ 23, 1, 8, 5 ],
         [ 40, 1, 7, 2 ],
         [ 1, 23, 5, 8 ],
         [ 1, 40, 2, 7 ],
         [ 23, 40, 1, 9 ],
      ]);
      expect(rankBookPairs(matrix, books, { includeSelf: true, limit: 1 })[0]).toMatchObject({
         sourceBookNumber: 1,
         targetBookNumber: 1,
         weight: 10,
      });
   });

   it('filters by testament direction', () => {
      expect(rankBookPairs(matrix, books, { flow: 'nt-ot' }).map((pair) => pair.targetBookNumber)).toEqual([ 23, 1 ]);
      expect(rankBookPairs(matrix, books, { flow: 'ot-nt' }).map((pair) => pair.sourceBookNumber)).toEqual([ 1, 23 ]);
      expect(rankBookPairs(matrix, books, { flow: 'nt-nt' })).toEqual([]);
   });
});

describe('partnerBooks', () => {
   it('lists the books a book cites and is cited by, without itself', () => {
      expect(partnerBooks(matrix, books, 23, 'outgoing')).toEqual([
         { bookNumber: 1, weight: 8 },
         { bookNumber: 40, weight: 1 },
      ]);
      expect(partnerBooks(matrix, books, 23, 'incoming')).toEqual([
         { bookNumber: 40, weight: 9 },
         { bookNumber: 1, weight: 5 },
      ]);
      expect(partnerBooks(matrix, books, 23, 'incoming', { testament: 'OT', limit: 5 })).toEqual([
         { bookNumber: 1, weight: 5 },
      ]);
      expect(partnerBooks(matrix, books, 99, 'incoming')).toEqual([]);
   });
});

describe('testamentFlows', () => {
   it('sums the 2×2 testament matrix including self-links', () => {
      expect(testamentFlows(matrix, books)).toEqual({ 'OT->OT': 27, 'OT->NT': 3, 'NT->OT': 16, 'NT->NT': 3 });
   });
});
