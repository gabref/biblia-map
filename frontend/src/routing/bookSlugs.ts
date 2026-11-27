/**
 * Static, synchronous table of the 66 canonical books.
 *
 * Slugs are the canonical English `slug` field of `public/generated/<ds>/books.json`
 * (identical for every dataset; verified by `routes.test.ts`). URLs always use these
 * slugs so links are language-agnostic. Display names in the dataset language must
 * still come from the dataset's `books.json`; `nameEn` is only a fallback label.
 */
export interface BookSlugEntry {
   bookNumber: number;
   slug: string;
   nameEn: string;
   chapters: number;
}

export const BOOKS: readonly BookSlugEntry[] = [
   { bookNumber: 1, slug: 'genesis', nameEn: 'Genesis', chapters: 50 },
   { bookNumber: 2, slug: 'exodus', nameEn: 'Exodus', chapters: 40 },
   { bookNumber: 3, slug: 'leviticus', nameEn: 'Leviticus', chapters: 27 },
   { bookNumber: 4, slug: 'numbers', nameEn: 'Numbers', chapters: 36 },
   { bookNumber: 5, slug: 'deuteronomy', nameEn: 'Deuteronomy', chapters: 34 },
   { bookNumber: 6, slug: 'joshua', nameEn: 'Joshua', chapters: 24 },
   { bookNumber: 7, slug: 'judges', nameEn: 'Judges', chapters: 21 },
   { bookNumber: 8, slug: 'ruth', nameEn: 'Ruth', chapters: 4 },
   { bookNumber: 9, slug: '1-samuel', nameEn: '1 Samuel', chapters: 31 },
   { bookNumber: 10, slug: '2-samuel', nameEn: '2 Samuel', chapters: 24 },
   { bookNumber: 11, slug: '1-kings', nameEn: '1 Kings', chapters: 22 },
   { bookNumber: 12, slug: '2-kings', nameEn: '2 Kings', chapters: 25 },
   { bookNumber: 13, slug: '1-chronicles', nameEn: '1 Chronicles', chapters: 29 },
   { bookNumber: 14, slug: '2-chronicles', nameEn: '2 Chronicles', chapters: 36 },
   { bookNumber: 15, slug: 'ezra', nameEn: 'Ezra', chapters: 10 },
   { bookNumber: 16, slug: 'nehemiah', nameEn: 'Nehemiah', chapters: 13 },
   { bookNumber: 17, slug: 'esther', nameEn: 'Esther', chapters: 10 },
   { bookNumber: 18, slug: 'job', nameEn: 'Job', chapters: 42 },
   { bookNumber: 19, slug: 'psalms', nameEn: 'Psalms', chapters: 150 },
   { bookNumber: 20, slug: 'proverbs', nameEn: 'Proverbs', chapters: 31 },
   { bookNumber: 21, slug: 'ecclesiastes', nameEn: 'Ecclesiastes', chapters: 12 },
   { bookNumber: 22, slug: 'song-of-solomon', nameEn: 'Song of Solomon', chapters: 8 },
   { bookNumber: 23, slug: 'isaiah', nameEn: 'Isaiah', chapters: 66 },
   { bookNumber: 24, slug: 'jeremiah', nameEn: 'Jeremiah', chapters: 52 },
   { bookNumber: 25, slug: 'lamentations', nameEn: 'Lamentations', chapters: 5 },
   { bookNumber: 26, slug: 'ezekiel', nameEn: 'Ezekiel', chapters: 48 },
   { bookNumber: 27, slug: 'daniel', nameEn: 'Daniel', chapters: 12 },
   { bookNumber: 28, slug: 'hosea', nameEn: 'Hosea', chapters: 14 },
   { bookNumber: 29, slug: 'joel', nameEn: 'Joel', chapters: 3 },
   { bookNumber: 30, slug: 'amos', nameEn: 'Amos', chapters: 9 },
   { bookNumber: 31, slug: 'obadiah', nameEn: 'Obadiah', chapters: 1 },
   { bookNumber: 32, slug: 'jonah', nameEn: 'Jonah', chapters: 4 },
   { bookNumber: 33, slug: 'micah', nameEn: 'Micah', chapters: 7 },
   { bookNumber: 34, slug: 'nahum', nameEn: 'Nahum', chapters: 3 },
   { bookNumber: 35, slug: 'habakkuk', nameEn: 'Habakkuk', chapters: 3 },
   { bookNumber: 36, slug: 'zephaniah', nameEn: 'Zephaniah', chapters: 3 },
   { bookNumber: 37, slug: 'haggai', nameEn: 'Haggai', chapters: 2 },
   { bookNumber: 38, slug: 'zechariah', nameEn: 'Zechariah', chapters: 14 },
   { bookNumber: 39, slug: 'malachi', nameEn: 'Malachi', chapters: 4 },
   { bookNumber: 40, slug: 'matthew', nameEn: 'Matthew', chapters: 28 },
   { bookNumber: 41, slug: 'mark', nameEn: 'Mark', chapters: 16 },
   { bookNumber: 42, slug: 'luke', nameEn: 'Luke', chapters: 24 },
   { bookNumber: 43, slug: 'john', nameEn: 'John', chapters: 21 },
   { bookNumber: 44, slug: 'acts', nameEn: 'Acts', chapters: 28 },
   { bookNumber: 45, slug: 'romans', nameEn: 'Romans', chapters: 16 },
   { bookNumber: 46, slug: '1-corinthians', nameEn: '1 Corinthians', chapters: 16 },
   { bookNumber: 47, slug: '2-corinthians', nameEn: '2 Corinthians', chapters: 13 },
   { bookNumber: 48, slug: 'galatians', nameEn: 'Galatians', chapters: 6 },
   { bookNumber: 49, slug: 'ephesians', nameEn: 'Ephesians', chapters: 6 },
   { bookNumber: 50, slug: 'philippians', nameEn: 'Philippians', chapters: 4 },
   { bookNumber: 51, slug: 'colossians', nameEn: 'Colossians', chapters: 4 },
   { bookNumber: 52, slug: '1-thessalonians', nameEn: '1 Thessalonians', chapters: 5 },
   { bookNumber: 53, slug: '2-thessalonians', nameEn: '2 Thessalonians', chapters: 3 },
   { bookNumber: 54, slug: '1-timothy', nameEn: '1 Timothy', chapters: 6 },
   { bookNumber: 55, slug: '2-timothy', nameEn: '2 Timothy', chapters: 4 },
   { bookNumber: 56, slug: 'titus', nameEn: 'Titus', chapters: 3 },
   { bookNumber: 57, slug: 'philemon', nameEn: 'Philemon', chapters: 1 },
   { bookNumber: 58, slug: 'hebrews', nameEn: 'Hebrews', chapters: 13 },
   { bookNumber: 59, slug: 'james', nameEn: 'James', chapters: 5 },
   { bookNumber: 60, slug: '1-peter', nameEn: '1 Peter', chapters: 5 },
   { bookNumber: 61, slug: '2-peter', nameEn: '2 Peter', chapters: 3 },
   { bookNumber: 62, slug: '1-john', nameEn: '1 John', chapters: 5 },
   { bookNumber: 63, slug: '2-john', nameEn: '2 John', chapters: 1 },
   { bookNumber: 64, slug: '3-john', nameEn: '3 John', chapters: 1 },
   { bookNumber: 65, slug: 'jude', nameEn: 'Jude', chapters: 1 },
   { bookNumber: 66, slug: 'revelation', nameEn: 'Revelation', chapters: 22 },
];

const BY_SLUG = new Map(BOOKS.map((book) => [ book.slug, book ]));

/** Book entry by number (1-66), or `undefined` when out of range. */
export function bookByNumber(bookNumber: number): BookSlugEntry | undefined {
   return Number.isInteger(bookNumber) ? BOOKS[bookNumber - 1] : undefined;
}

/** Canonical English slug for a book number, e.g. 43 → `john`. Throws `RangeError` when out of range. */
export function bookSlug(bookNumber: number): string {
   const book = bookByNumber(bookNumber);

   if (!book) {
      throw new RangeError(`Unknown book number: ${bookNumber}`);
   }

   return book.slug;
}

/** Book number for a slug (case-insensitive; a numeric string such as `"43"` is also accepted), else `null`. */
export function bookNumberFromSlug(slug: string): number | null {
   const normalized = slug.trim().toLowerCase();
   const bySlug = BY_SLUG.get(normalized);

   if (bySlug) {
      return bySlug.bookNumber;
   }

   if (/^\d{1,2}$/.test(normalized)) {
      const number = Number(normalized);

      return bookByNumber(number) ? number : null;
   }

   return null;
}
