import type { Book, Chapter, SearchBook, SearchIndex, VerseIndex } from '../../types/generated';

export interface VerseLocationRef {
   jwpubVerseId: number;
   bookNumber: number;
   chapterNumber: number;
   verseNumber: number;
}

/** A contiguous run of verses inside one chapter: ids and verse numbers both step by one. */
export interface VerseRun {
   firstId: number;
   count: number;
   bookNumber: number;
   chapterNumber: number;
   firstVerseNumber: number;
}

/** The part of `search-index.json` (`SearchIndex`) the locator reads. */
export interface SearchIndexLike {
   books: Array<Pick<SearchBook, 'bookNumber' | 'chapters'>>;
   irregularVerses?: SearchIndex['irregularVerses'];
}

/**
 * Maps `jwpubVerseId` ⇄ book/chapter/verse without holding the 4 MB verse index: ~1,200 runs
 * and a binary search. Built from `search-index.json` when the dataset has it, otherwise from
 * `verse-index.json`.
 */
export class VerseLocator {
   public readonly runs: readonly VerseRun[];
   public readonly verseCount: number;
   /** Largest verse id + 1 (ids are dense enough to index typed arrays directly). */
   public readonly idSpace: number;
   private readonly bookNames: Map<number, string>;
   private readonly chapterRuns = new Map<number, VerseRun[]>();

   public constructor(runs: VerseRun[], books: Array<Pick<Book, 'bookNumber' | 'name'>>) {
      this.runs = runs.filter((run) => run.count > 0).sort((left, right) => left.firstId - right.firstId);
      this.verseCount = this.runs.reduce((total, run) => total + run.count, 0);
      this.idSpace = this.runs.reduce((maximum, run) => Math.max(maximum, run.firstId + run.count), 0);
      this.bookNames = new Map(books.map((book) => [ book.bookNumber, book.name ]));

      for (const run of this.runs) {
         const key = chapterKey(run.bookNumber, run.chapterNumber);
         const list = this.chapterRuns.get(key);

         if (list) {
            list.push(run);
         } else {
            this.chapterRuns.set(key, [ run ]);
         }
      }
   }

   public locate(verseId: number): VerseLocationRef | null {
      const run = this.runOf(verseId);

      if (!run) {
         return null;
      }

      return {
         jwpubVerseId: verseId,
         bookNumber: run.bookNumber,
         chapterNumber: run.chapterNumber,
         verseNumber: run.firstVerseNumber + (verseId - run.firstId),
      };
   }

   public bookOf(verseId: number): number {
      return this.runOf(verseId)?.bookNumber ?? 0;
   }

   public idOf(bookNumber: number, chapterNumber: number, verseNumber: number): number | null {
      for (const run of this.chapterRuns.get(chapterKey(bookNumber, chapterNumber)) ?? []) {
         const offset = verseNumber - run.firstVerseNumber;

         if (offset >= 0 && offset < run.count) {
            return run.firstId + offset;
         }
      }

      return null;
   }

   public bookName(bookNumber: number): string {
      return this.bookNames.get(bookNumber) ?? `Book ${bookNumber}`;
   }

   /** Localized citation, e.g. "John 3:16" (same shape as the labels in `verse-index.json`). */
   public label(verseId: number): string {
      const location = this.locate(verseId);

      return location ? this.labelOf(location) : `#${verseId}`;
   }

   public labelOf(location: Omit<VerseLocationRef, 'jwpubVerseId'>): string {
      return `${this.bookName(location.bookNumber)} ${location.chapterNumber}:${location.verseNumber}`;
   }

   /** Citation for a cited range: "Isaiah 53:4-6", or "Isaiah 52:13–53:2" across chapters. */
   public rangeLabel(startId: number, endId: number): string {
      const start = this.locate(startId);
      const end = endId > startId ? this.locate(endId) : null;

      if (!start) {
         return `#${startId}`;
      }

      if (!end || end.bookNumber !== start.bookNumber) {
         return this.labelOf(start);
      }

      if (end.chapterNumber === start.chapterNumber) {
         return `${this.labelOf(start)}-${end.verseNumber}`;
      }

      return `${this.labelOf(start)}–${end.chapterNumber}:${end.verseNumber}`;
   }

   /** Verses per chapter for one book (index = chapter - 1). */
   public chapterSizes(bookNumber: number, chapters: number): number[] {
      const sizes = Array.from({ length: chapters }, () => 0);

      for (const run of this.runs) {
         if (run.bookNumber === bookNumber && run.chapterNumber >= 1) {
            if (run.chapterNumber > sizes.length) {
               sizes.length = run.chapterNumber;
               sizes.fill(0, chapters);
            }

            sizes[run.chapterNumber - 1] = (sizes[run.chapterNumber - 1] ?? 0) + run.count;
         }
      }

      return sizes;
   }

   /** Calls `visit` for every verse id, in id order. */
   public forEachVerse(visit: (verseId: number, run: VerseRun) => void): void {
      for (const run of this.runs) {
         for (let offset = 0; offset < run.count; offset += 1) {
            visit(run.firstId + offset, run);
         }
      }
   }

   private runOf(verseId: number): VerseRun | null {
      let low = 0;
      let high = this.runs.length - 1;

      while (low <= high) {
         const middle = (low + high) >> 1;
         const run = this.runs[middle];

         if (verseId < run.firstId) {
            high = middle - 1;
         } else if (verseId >= run.firstId + run.count) {
            low = middle + 1;
         } else {
            return run;
         }
      }

      return null;
   }
}

function chapterKey(bookNumber: number, chapterNumber: number): number {
   return bookNumber * 1000 + chapterNumber;
}

export function locatorFromSearchIndex(
   file: SearchIndexLike,
   books: Array<Pick<Book, 'bookNumber' | 'name'>>,
): VerseLocator {
   const runs: VerseRun[] = [];

   for (const book of file.books) {
      book.chapters.forEach(([ firstId, firstVerseNumber, count ], index) => {
         runs.push({ firstId, count, bookNumber: book.bookNumber, chapterNumber: index + 1, firstVerseNumber });
      });
   }

   for (const [ verseId, bookNumber, chapterNumber, verseNumber ] of file.irregularVerses ?? []) {
      runs.push({ firstId: verseId, count: 1, bookNumber, chapterNumber, firstVerseNumber: verseNumber });
   }

   return new VerseLocator(runs, books);
}

export function locatorFromVerseIndex(
   verseIndex: VerseIndex,
   books: Array<Pick<Book, 'bookNumber' | 'name'>>,
): VerseLocator {
   const verses = Object.values(verseIndex).sort((left, right) => left.jwpubVerseId - right.jwpubVerseId);
   const runs: VerseRun[] = [];
   let current: VerseRun | null = null;

   for (const verse of verses) {
      if (
         current
         && current.bookNumber === verse.bookNumber
         && current.chapterNumber === verse.chapterNumber
         && verse.jwpubVerseId === current.firstId + current.count
         && verse.verseNumber === current.firstVerseNumber + current.count
      ) {
         current.count += 1;
         continue;
      }

      current = {
         firstId: verse.jwpubVerseId,
         count: 1,
         bookNumber: verse.bookNumber,
         chapterNumber: verse.chapterNumber,
         firstVerseNumber: verse.verseNumber,
      };
      runs.push(current);
   }

   return new VerseLocator(runs, books);
}

/** Fallback for datasets without a search index: runs straight from `chapters.json`. */
export function locatorFromChapters(
   chapters: Chapter[],
   books: Array<Pick<Book, 'bookNumber' | 'name'>>,
): VerseLocator {
   const runs: VerseRun[] = [];

   for (const chapter of chapters) {
      let current: VerseRun | null = null;

      for (const verse of chapter.verses) {
         if (
            current
            && verse.jwpubVerseId === current.firstId + current.count
            && verse.verseNumber === current.firstVerseNumber + current.count
         ) {
            current.count += 1;
            continue;
         }

         current = {
            firstId: verse.jwpubVerseId,
            count: 1,
            bookNumber: chapter.bookNumber,
            chapterNumber: chapter.chapterNumber,
            firstVerseNumber: verse.verseNumber,
         };
         runs.push(current);
      }
   }

   return new VerseLocator(runs, books);
}
