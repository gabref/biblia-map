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
   let maximum = 0;

   for (const row of matrix) {
      for (const weight of row) {
         if (weight > maximum) {
            maximum = weight;
         }
      }
   }

   return maximum;
}

export function matrixTotal(matrix: BookMatrix): number {
   return matrix.reduce((total, row) => total + row.reduce((rowTotal, weight) => rowTotal + weight, 0), 0);
}

/** Number of non-zero cells, i.e. directed book-to-book links that are drawn. */
export function matrixLinkCount(matrix: BookMatrix): number {
   return matrix.reduce(
      (total, row) => total + row.reduce((rowTotal, weight) => rowTotal + (weight > 0 ? 1 : 0), 0),
      0,
   );
}

export interface BookTotals {
   /** References from this book to other books. */
   outgoing: number;
   /** References from other books to this book. */
   incoming: number;
   /** References that stay inside the book (the diagonal), counted once. */
   self: number;
   /** `outgoing + incoming + self`. */
   total: number;
}

/**
 * Per-book totals. The diagonal is reported separately: summing a row and a column (as the old
 * chord legend did) counts every self-link twice.
 */
export function bookTotals(matrix: BookMatrix): BookTotals[] {
   return matrix.map((row, index) => {
      const self = row[index] ?? 0;
      const outgoing = row.reduce((total, weight) => total + weight, 0) - self;
      const incoming = matrix.reduce((total, sourceRow) => total + (sourceRow[index] ?? 0), 0) - self;

      return { outgoing, incoming, self, total: outgoing + incoming + self };
   });
}

export interface WeightBounds {
   /** Slider maximum: high enough to isolate the strongest links, never above the largest weight. */
   max: number;
   /** Default threshold: keeps roughly the `targetLinks` strongest links. */
   defaultValue: number;
}

/**
 * Derives the "minimum weight" slider range from the data. A fixed 1–250 range with a default of
 * 25 hid nearly every study-note link (most are below 25) and was far too coarse for Rbi8.
 */
export function weightBounds(matrix: BookMatrix, targetLinks = 220): WeightBounds {
   const weights: number[] = [];

   matrix.forEach((row, sourceIndex) => {
      row.forEach((weight, targetIndex) => {
         if (weight > 0 && sourceIndex !== targetIndex) {
            weights.push(weight);
         }
      });
   });

   if (weights.length === 0) {
      return { max: 1, defaultValue: 1 };
   }

   weights.sort((left, right) => right - left);

   // Keep at least the ~12 strongest links visible at the top of the range.
   const max = Math.max(2, weights[Math.min(11, weights.length - 1)]);
   const defaultValue = weights.length <= targetLinks ? 1 : Math.min(max, Math.max(1, weights[targetLinks - 1]));

   return { max, defaultValue };
}

export type PairFlow = 'all' | 'ot-nt' | 'nt-ot' | 'ot-ot' | 'nt-nt';

export interface BookPair {
   sourceBookNumber: number;
   targetBookNumber: number;
   /** References from source to target. */
   weight: number;
   /** References in the opposite direction (target to source). */
   reverseWeight: number;
}

export interface RankPairsOptions {
   flow?: PairFlow;
   /** Include a book's references to itself. Off by default: "Psalms → Psalms" tops every list. */
   includeSelf?: boolean;
   limit?: number;
}

/** Directed book pairs, strongest first (ties: canonical order). */
export function rankBookPairs(matrix: BookMatrix, books: Book[], options: RankPairsOptions = {}): BookPair[] {
   const { flow = 'all', includeSelf = false, limit } = options;
   const pairs: BookPair[] = [];

   matrix.forEach((row, sourceIndex) => {
      const source = books[sourceIndex];

      if (!source) {
         return;
      }

      row.forEach((weight, targetIndex) => {
         const target = books[targetIndex];

         if (!target || weight <= 0 || (!includeSelf && sourceIndex === targetIndex)) {
            return;
         }

         if (flow !== 'all' && flow !== `${source.testament.toLowerCase()}-${target.testament.toLowerCase()}`) {
            return;
         }

         pairs.push({
            sourceBookNumber: source.bookNumber,
            targetBookNumber: target.bookNumber,
            weight,
            reverseWeight: matrix[targetIndex]?.[sourceIndex] ?? 0,
         });
      });
   });

   pairs.sort(
      (left, right) =>
         right.weight - left.weight
         || left.sourceBookNumber - right.sourceBookNumber
         || left.targetBookNumber - right.targetBookNumber,
   );

   return limit === undefined ? pairs : pairs.slice(0, limit);
}

export interface PartnerBook {
   bookNumber: number;
   weight: number;
}

/**
 * Books most connected to `bookNumber`: `outgoing` = books it cites, `incoming` = books citing it.
 * The book itself is excluded.
 */
export function partnerBooks(
   matrix: BookMatrix,
   books: Book[],
   bookNumber: number,
   direction: 'outgoing' | 'incoming',
   options: { limit?: number; testament?: Testament } = {},
): PartnerBook[] {
   const index = books.findIndex((book) => book.bookNumber === bookNumber);

   if (index < 0) {
      return [];
   }

   const partners: PartnerBook[] = [];

   books.forEach((book, otherIndex) => {
      if (otherIndex === index || (options.testament && book.testament !== options.testament)) {
         return;
      }

      const weight = direction === 'outgoing' ? matrix[index]?.[otherIndex] ?? 0 : matrix[otherIndex]?.[index] ?? 0;

      if (weight > 0) {
         partners.push({ bookNumber: book.bookNumber, weight });
      }
   });

   partners.sort((left, right) => right.weight - left.weight || left.bookNumber - right.bookNumber);

   return options.limit === undefined ? partners : partners.slice(0, options.limit);
}

export type TestamentFlowKey = 'OT->OT' | 'OT->NT' | 'NT->OT' | 'NT->NT';

/** The 2×2 testament matrix (source testament → target testament), self-links included. */
export function testamentFlows(matrix: BookMatrix, books: Book[]): Record<TestamentFlowKey, number> {
   const flows: Record<TestamentFlowKey, number> = { 'OT->OT': 0, 'OT->NT': 0, 'NT->OT': 0, 'NT->NT': 0 };

   matrix.forEach((row, sourceIndex) => {
      const source = books[sourceIndex];

      row.forEach((weight, targetIndex) => {
         const target = books[targetIndex];

         if (source && target) {
            flows[`${source.testament}->${target.testament}`] += weight;
         }
      });
   });

   return flows;
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
