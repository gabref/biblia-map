/**
 * Lookup tables derived once from `verse-index.json`: verse by id, verses per chapter and
 * canonical order. This replaces `chapters.json` (2.9 MB) on the Verse page, and it never
 * assumes ids or `books.json` are dense: unknown ids resolve to `undefined`, not Genesis.
 */
import type { Book, VerseIndex, VerseRef } from '../../types/generated';

export interface VerseCatalog {
   /** Verse by jwpub id. */
   byId: (verseId: number) => VerseRef | undefined;
   has: (verseId: number) => boolean;
   /** Book number of a verse id, `null` when unknown. */
   bookOf: (verseId: number) => number | null;
   find: (bookNumber: number, chapterNumber: number, verseNumber: number) => VerseRef | undefined;
   /** Chapter numbers of a book, ascending. */
   chapters: (bookNumber: number) => number[];
   /** Verses of a chapter in order. */
   verses: (bookNumber: number, chapterNumber: number) => VerseRef[];
   /** The verse `delta` places away in canonical order (crossing chapters and books). */
   step: (verseId: number, delta: number) => VerseRef | undefined;
}

const catalogs = new WeakMap<VerseIndex, VerseCatalog>();

export function buildVerseCatalog(verseIndex: VerseIndex): VerseCatalog {
   const cached = catalogs.get(verseIndex);

   if (cached) {
      return cached;
   }

   const ordered = Object.values(verseIndex).sort((left, right) => left.canonicalVerseId - right.canonicalVerseId);
   const position = new Map<number, number>();
   const byChapter = new Map<string, VerseRef[]>();
   const chaptersByBook = new Map<number, number[]>();

   ordered.forEach((ref, index) => {
      position.set(ref.jwpubVerseId, index);

      const chapterKey = `${ref.bookNumber}.${ref.chapterNumber}`;
      const verses = byChapter.get(chapterKey);

      if (verses) {
         verses.push(ref);
      } else {
         byChapter.set(chapterKey, [ ref ]);

         const chapters = chaptersByBook.get(ref.bookNumber);

         if (chapters) {
            chapters.push(ref.chapterNumber);
         } else {
            chaptersByBook.set(ref.bookNumber, [ ref.chapterNumber ]);
         }
      }
   });

   const byId = (verseId: number): VerseRef | undefined => verseIndex[String(verseId)];
   const catalog: VerseCatalog = {
      byId,
      has: (verseId) => position.has(verseId),
      bookOf: (verseId) => byId(verseId)?.bookNumber ?? null,
      find: (bookNumber, chapterNumber, verseNumber) =>
         byChapter.get(`${bookNumber}.${chapterNumber}`)?.find((ref) => ref.verseNumber === verseNumber),
      chapters: (bookNumber) => chaptersByBook.get(bookNumber) ?? [],
      verses: (bookNumber, chapterNumber) => byChapter.get(`${bookNumber}.${chapterNumber}`) ?? [],
      step: (verseId, delta) => {
         const index = position.get(verseId);

         return index === undefined ? undefined : ordered[index + delta];
      },
   };

   catalogs.set(verseIndex, catalog);

   return catalog;
}

/** Books by number, so a partial or unordered `books.json` never maps to the wrong book. */
export function buildBookMap(books: readonly Book[]): Map<number, Book> {
   return new Map(books.map((book) => [ book.bookNumber, book ]));
}
