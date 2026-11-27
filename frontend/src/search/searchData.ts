/**
 * Data the verse search needs: book names in the dataset language, chapter counts and, when
 * available, verse counts per chapter.
 *
 * Source order (never loads the 4 MB `verse-index.json` or the 2.9 MB `chapters.json`):
 *   1. `search-index.json` (epic E-G) when `manifest.features` includes `'search-index'`;
 *   2. otherwise `books.json` (< 10 KB): names + chapter counts, verse numbers capped at 176.
 */
import { BOOKS } from '../routing/bookSlugs';
import { loadBooks, loadManifest, loadSearchIndex, loadVerseTextBook } from '../data/generated';
import type { Book, DatasetManifest } from '../types/generated';
import type { AliasLanguage } from '../data/bookAliases';

/** `[firstJwpubVerseId, firstVerseNumber, verseCount]`, index = chapter - 1 (E-G `search-index.json`). */
export type ChapterRun = readonly [ number, number, number ];

export interface SearchBook {
   bookNumber: number;
   slug: string;
   /** Display name in the dataset language. */
   name: string;
   shortName?: string;
   chapters: number;
   /** Extra display aliases from the index. */
   aliases?: readonly string[];
   /** Extra normalized lookup keys from the index. */
   keys?: readonly string[];
   /** Present only with `search-index.json`. */
   chapterRuns?: readonly ChapterRun[];
}

export interface SearchData {
   datasetId: string;
   /** Alias language for tie-breaks and labels; `undefined` for languages without a table. */
   language?: AliasLanguage;
   books: readonly SearchBook[];
   source: 'search-index' | 'books' | 'static';
}

export const SEARCH_INDEX_FEATURE = 'search-index';
/** Longest chapter (Psalm 119). Upper bound when verse counts are unknown. */
export const MAX_VERSE_FALLBACK = 176;

export function aliasLanguageOf(language: string | undefined): AliasLanguage | undefined {
   const value = language?.toLowerCase() ?? '';

   if (value.startsWith('en')) return 'en';
   if (value.startsWith('it')) return 'it';

   return undefined;
}

/** English-only search data that needs no network (used until the dataset's data arrives). */
export const STATIC_SEARCH_DATA: SearchData = {
   datasetId: '',
   language: 'en',
   source: 'static',
   books: BOOKS.map((book) => ({ bookNumber: book.bookNumber, slug: book.slug, name: book.nameEn, chapters: book.chapters })),
};

const cache = new Map<string, Promise<SearchData>>();

export function clearSearchDataCache(): void {
   cache.clear();
}

/** Loads (and caches per dataset) the search data. Rejects only if `books.json` is unavailable too. */
export function loadSearchData(datasetId: string): Promise<SearchData> {
   const cached = cache.get(datasetId);

   if (cached) {
      return cached;
   }

   const pending = resolveSearchData(datasetId);

   cache.set(datasetId, pending);
   pending.catch(() => cache.delete(datasetId));

   return pending;
}

async function resolveSearchData(datasetId: string): Promise<SearchData> {
   let manifest: DatasetManifest | null = null;

   try {
      manifest = await loadManifest(datasetId);
   } catch {
      manifest = null;
   }

   const language = aliasLanguageOf(manifest?.language);

   if (manifest?.features?.includes(SEARCH_INDEX_FEATURE)) {
      try {
         const index = await loadSearchIndex(datasetId);

         if (!index || index.books.length === 0) {
            throw new Error('search-index.json is empty');
         }

         return {
            datasetId,
            language: aliasLanguageOf(index.language) ?? language,
            source: 'search-index',
            books: index.books.map((book) => ({
               bookNumber: book.bookNumber,
               slug: book.slug,
               name: book.name,
               shortName: book.shortName,
               chapters: book.chapters.length,
               aliases: book.aliases ?? [],
               keys: book.keys ?? [],
               chapterRuns: book.chapters,
            })),
         };
      } catch {
         // Fall through to books.json: the index is an optimization, not a requirement.
      }
   }

   const books: Book[] = await loadBooks(datasetId);

   return {
      datasetId,
      language,
      source: 'books',
      books: books.map((book) => ({
         bookNumber: book.bookNumber,
         slug: book.slug,
         name: book.name,
         shortName: book.shortName,
         chapters: book.chapters,
      })),
   };
}

export function findSearchBook(data: SearchData, bookNumber: number): SearchBook | undefined {
   return data.books.find((book) => book.bookNumber === bookNumber);
}

/** Verse count of a chapter when known (search index), else `undefined`. */
export function verseCountOf(book: SearchBook, chapter: number): number | undefined {
   const run = book.chapterRuns?.[chapter - 1];

   return run && run[2] > 0 ? run[2] : undefined;
}

/** jwpub verse id from the search index, when known. */
export function verseIdOf(book: SearchBook, chapter: number, verse: number): number | undefined {
   const run = book.chapterRuns?.[chapter - 1];

   if (!run || verse < run[1] || verse >= run[1] + run[2]) {
      return undefined;
   }

   return run[0] + (verse - run[1]);
}

export interface VersePreview {
   label: string;
   text: string;
}

/**
 * Text of one verse for previews. Loads `verse-text/<book>.json` (cached by the data layer).
 * Resolves `null` when the verse does not exist in the dataset.
 */
export async function loadVersePreview(
   datasetId: string,
   book: SearchBook,
   chapter: number,
   verse: number,
): Promise<VersePreview | null> {
   const texts = await loadVerseTextBook(datasetId, { bookNumber: book.bookNumber, slug: book.slug } as Book);
   const id = verseIdOf(book, chapter, verse);

   if (id !== undefined) {
      return texts[String(id)] ?? null;
   }

   // Without the index, labels end in "<chapter>:<verse>" in every dataset language.
   const suffix = ` ${chapter}:${verse}`;

   for (const entry of Object.values(texts)) {
      if (entry.label.endsWith(suffix)) {
         return entry;
      }
   }

   return null;
}
