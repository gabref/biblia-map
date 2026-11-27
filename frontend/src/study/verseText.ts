/**
 * Resolves canonical verse keys to localized labels and text in a dataset, for the study page,
 * the Markdown study sheet and the print view. Uses the cached loaders in `data/generated`.
 */
import { loadBooks, loadChapters, loadSourceAdjacency, loadVerseTextBook } from '../data/generated';
import { fallbackVerseLabel } from '../components/VerseLink';
import type { Book, Chapter, ChapterVerse, VerseTextBook } from '../types/generated';
import { parseVerseKey, verseKey, type StudyVerseRef, type VerseKey } from './store';

export interface ResolvedConnection {
   key: VerseKey;
   label: string;
   text: string | null;
}

export interface ResolvedVerse {
   key: VerseKey;
   endKey?: VerseKey;
   /** Localized citation, e.g. "John 3:16-18". */
   label: string;
   /** `null` when the dataset has no text for it. */
   text: string | null;
   /** Top outgoing references, when requested. */
   connections?: ResolvedConnection[];
}

export interface ResolveRequest {
   key: VerseKey;
   endKey?: VerseKey;
}

interface DatasetIndex {
   books: Map<number, Book>;
   /** `book.chapter.verse` → chapter verse. */
   byKey: Map<string, ChapterVerse & { bookNumber: number; chapterNumber: number }>;
   byJwpubId: Map<number, ChapterVerse & { bookNumber: number; chapterNumber: number }>;
   chapters: Map<string, Chapter>;
}

const indexCache = new Map<string, Promise<DatasetIndex>>();

function datasetIndex(datasetId: string): Promise<DatasetIndex> {
   let pending = indexCache.get(datasetId);

   if (!pending) {
      pending = Promise.all([ loadBooks(datasetId), loadChapters(datasetId) ]).then(([ books, chapters ]) => {
         const index: DatasetIndex = { books: new Map(), byKey: new Map(), byJwpubId: new Map(), chapters: new Map() };

         books.forEach((book) => index.books.set(book.bookNumber, book));
         chapters.forEach((chapter) => {
            index.chapters.set(`${chapter.bookNumber}.${chapter.chapterNumber}`, chapter);
            chapter.verses.forEach((verse) => {
               const entry = { ...verse, bookNumber: chapter.bookNumber, chapterNumber: chapter.chapterNumber };
               index.byKey.set(`${chapter.bookNumber}.${chapter.chapterNumber}.${verse.verseNumber}`, entry);
               index.byJwpubId.set(verse.jwpubVerseId, entry);
            });
         });

         return index;
      });
      pending.catch(() => indexCache.delete(datasetId));
      indexCache.set(datasetId, pending);
   }

   return pending;
}

/** "John 3:16" + end → "John 3:16-18" (same chapter) or "John 3:16–4:2". */
export function rangeLabel(startLabel: string, start: StudyVerseRef, end?: StudyVerseRef): string {
   if (!end || (end.bookNumber === start.bookNumber && end.chapterNumber === start.chapterNumber && end.verseNumber === start.verseNumber)) {
      return startLabel;
   }

   if (end.bookNumber !== start.bookNumber) {
      return `${startLabel}–${fallbackVerseLabel(end)}`;
   }

   return end.chapterNumber === start.chapterNumber
      ? `${startLabel}-${end.verseNumber}`
      : `${startLabel}–${end.chapterNumber}:${end.verseNumber}`;
}

/** Verse keys from `start` to `end` inclusive (same book only; capped at 200 verses). */
function expandRange(index: DatasetIndex, start: StudyVerseRef, end?: StudyVerseRef): VerseKey[] {
   if (!end || end.bookNumber !== start.bookNumber) {
      return [ verseKey(start) ];
   }

   const keys: VerseKey[] = [];

   for (let chapter = start.chapterNumber; chapter <= end.chapterNumber && keys.length < 200; chapter += 1) {
      const verses = index.chapters.get(`${start.bookNumber}.${chapter}`)?.verses ?? [];

      for (const verse of verses) {
         const afterStart = chapter > start.chapterNumber || verse.verseNumber >= start.verseNumber;
         const beforeEnd = chapter < end.chapterNumber || verse.verseNumber <= end.verseNumber;

         if (afterStart && beforeEnd) {
            keys.push(`${start.bookNumber}.${chapter}.${verse.verseNumber}`);
         }
      }
   }

   return keys.length ? keys : [ verseKey(start) ];
}

/**
 * Resolves keys to labels + text in `datasetId`. With `connections > 0`, also returns the top
 * N outgoing references of each (first) verse, in the dataset's reference order.
 */
export async function resolveStudyVerses(
   datasetId: string,
   requests: readonly ResolveRequest[],
   opts: { connections?: number } = {},
): Promise<ResolvedVerse[]> {
   const index = await datasetIndex(datasetId);
   const textBooks = new Map<number, Promise<VerseTextBook | null>>();

   const textBook = (bookNumber: number): Promise<VerseTextBook | null> => {
      let pending = textBooks.get(bookNumber);

      if (!pending) {
         const book = index.books.get(bookNumber);
         pending = book ? loadVerseTextBook(datasetId, book).catch(() => null) : Promise.resolve(null);
         textBooks.set(bookNumber, pending);
      }

      return pending;
   };

   const textFor = async (keys: readonly VerseKey[]): Promise<string | null> => {
      const parts: string[] = [];

      for (const key of keys) {
         const entry = index.byKey.get(key);
         const text = entry ? (await textBook(entry.bookNumber))?.[String(entry.jwpubVerseId)]?.text : undefined;

         if (text) {
            parts.push(text);
         }
      }

      return parts.length ? parts.join(' ') : null;
   };

   const connectionCount = Math.max(0, Math.floor(opts.connections ?? 0));

   return Promise.all(requests.map(async (request): Promise<ResolvedVerse> => {
      const start = parseVerseKey(request.key);
      const end = request.endKey ? parseVerseKey(request.endKey) ?? undefined : undefined;

      if (!start) {
         return { key: request.key, label: request.key, text: null };
      }

      const entry = index.byKey.get(request.key);
      const label = rangeLabel(entry?.label ?? fallbackVerseLabel(start), start, end);
      const resolved: ResolvedVerse = {
         key: request.key,
         ...(request.endKey ? { endKey: request.endKey } : {}),
         label,
         text: await textFor(expandRange(index, start, end)),
      };

      if (connectionCount > 0 && entry) {
         const book = index.books.get(entry.bookNumber);
         const adjacency = book ? await loadSourceAdjacency(datasetId, book).catch(() => null) : null;
         const outgoing = adjacency?.[String(entry.jwpubVerseId)]?.outgoing ?? [];
         const seen = new Set<number>();
         const connections: ResolvedConnection[] = [];

         for (const edge of outgoing) {
            if (connections.length >= connectionCount) {
               break;
            }

            if (seen.has(edge.targetStart) || edge.targetStart === entry.jwpubVerseId) {
               continue;
            }

            seen.add(edge.targetStart);
            const target = index.byJwpubId.get(edge.targetStart);

            if (!target) {
               continue;
            }

            const targetRef = { bookNumber: target.bookNumber, chapterNumber: target.chapterNumber, verseNumber: target.verseNumber };
            const endTarget = edge.targetEnd !== edge.targetStart ? index.byJwpubId.get(edge.targetEnd) : undefined;
            const targetKeys: VerseKey[] = [];

            for (let id = edge.targetStart; id <= (endTarget ? edge.targetEnd : edge.targetStart) && targetKeys.length < 20; id += 1) {
               const item = index.byJwpubId.get(id);

               if (item) {
                  targetKeys.push(`${item.bookNumber}.${item.chapterNumber}.${item.verseNumber}`);
               }
            }

            connections.push({
               key: verseKey(targetRef),
               label: rangeLabel(target.label, targetRef, endTarget ? { bookNumber: endTarget.bookNumber, chapterNumber: endTarget.chapterNumber, verseNumber: endTarget.verseNumber } : undefined),
               text: await textFor(targetKeys),
            });
         }

         resolved.connections = connections;
      }

      return resolved;
   }));
}

/** Test helper. */
export function __clearStudyVerseCacheForTests(): void {
   indexCache.clear();
}
