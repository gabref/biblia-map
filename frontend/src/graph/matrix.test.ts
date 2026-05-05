import { describe, expect, it } from 'vitest';

import { filterBookMatrix, matrixTotal } from './matrix';
import type { Book, BookMatrix } from '../types/generated';

const books: Book[] = [
   {
      bookNumber: 1,
      name: 'Genesis',
      shortName: 'Gen.',
      slug: 'genesis',
      testament: 'OT',
      chapters: 50,
   },
   {
      bookNumber: 40,
      name: 'Matthew',
      shortName: 'Matt.',
      slug: 'matthew',
      testament: 'NT',
      chapters: 28,
   },
];

describe('filterBookMatrix', () => {
   it('applies scope, minimum weight, and self-link filters', () => {
      const matrix: BookMatrix = [
         [ 10, 5 ],
         [ 8, 4 ],
      ];

      const filtered = filterBookMatrix(matrix, books, {
         minWeight: 6,
         scope: 'all',
         showSelfLinks: false,
      });

      expect(filtered).toEqual([
         [ 0, 0 ],
         [ 8, 0 ],
      ]);
      expect(matrixTotal(filtered)).toBe(8);
   });
});
