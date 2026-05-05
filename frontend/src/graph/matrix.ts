import type { Book, BookMatrix, Testament } from '../types/generated';

export type ChordScope = 'all' | 'ot' | 'nt';

interface MatrixFilterOptions {
   minWeight: number;
   showSelfLinks: boolean;
   scope: ChordScope;
}

export function filterBookMatrix(matrix: BookMatrix, books: Book[], options: MatrixFilterOptions): BookMatrix {
   return matrix.map((row, sourceIndex) =>
      row.map((weight, targetIndex) => {
         const sourceBook = books[sourceIndex];
         const targetBook = books[targetIndex];

         if (!sourceBook || !targetBook) {
            return 0;
         }

         if (!options.showSelfLinks && sourceIndex === targetIndex) {
            return 0;
         }

         if (!bookInScope(sourceBook.testament, options.scope) || !bookInScope(targetBook.testament, options.scope)) {
            return 0;
         }

         return weight >= options.minWeight ? weight : 0;
      }),
   );
}

export function matrixMaximum(matrix: BookMatrix): number {
   return matrix.reduce((maximum, row) => Math.max(maximum, ...row), 0);
}

export function matrixTotal(matrix: BookMatrix): number {
   return matrix.reduce((total, row) => total + row.reduce((rowTotal, weight) => rowTotal + weight, 0), 0);
}

function bookInScope(testament: Testament, scope: ChordScope): boolean {
   if (scope === 'ot') {
      return testament === 'OT';
   }

   if (scope === 'nt') {
      return testament === 'NT';
   }

   return true;
}
