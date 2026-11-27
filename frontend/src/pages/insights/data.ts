/**
 * Data access for Insights and the book profile (epic E-D).
 *
 * The optional files of epic E-G are read through the typed loaders in `data/generated.ts`
 * (which feature-detect through `manifest.features`), and every one has a fallback built from
 * files that exist in all datasets, used when the file is absent or fails to load:
 *
 * | Feature            | File                                  | Fallback                               |
 * | ------------------ | ------------------------------------- | -------------------------------------- |
 * | `search-index`     | `search-index.json`                   | `chapters.json` (2.9 MB)                |
 * | `verse-degree`     | `stats.verse-degree.json`             | counted from `edges/combined.compact`  |
 * | `chapter-matrices` | `matrices/chapter/<NN>.<slug>.json`   | the book's two adjacency files         |
 * | `components`       | `stats.components.json`               | union-find over `edges/combined`       |
 *
 * `stats.components.json` has the totals but not the member verses, so it only supplies the
 * Clusters headline while the union-find (which the cluster cards need) is still running.
 *
 * Counting basis: every number in Insights is a raw reference count, the same basis as
 * `matrices/book.*.json` and `stats.*.json`. "All" is cross references plus study-note
 * references, so a verse pair linked by both counts twice. The chapter matrices and the verse
 * degrees use that basis too (and so do their fallbacks), which keeps the book profile's
 * chapter rows summing to the book totals shown next to them.
 */
import {
   isValidDatasetId,
   loadBookMatrix,
   loadBooks,
   loadChapterMatrix as loadChapterMatrixFile,
   loadChapters,
   loadCompactEdges,
   loadComponentsStats,
   loadManifest,
   loadSearchIndex,
   loadSourceAdjacency,
   loadTargetAdjacency,
   loadVerseDegree,
} from '../../data/generated';
import {
   buildRelationshipComponents,
   headlineFromPrecomputed,
   type ClusterHeadline,
   type ClusterSummary,
} from '../../graph/relationshipComponents';
import type { AdjacentEdge, Book, ChapterMatrix, EdgeKindFilter } from '../../types/generated';
import { bookPairEdges, type VersePairEdge } from './flows';
import { chapterMatrixFromAdjacency, type ChapterStat } from './heatmap';
import { computeVerseDegrees, type VerseDegrees } from './hubs';
import { locatorFromChapters, locatorFromSearchIndex, type VerseLocator } from './locator';

/** One row of `stats.books.json`. */
export interface BookStat {
   bookNumber: number;
   book: string;
   testament: 'OT' | 'NT';
   outgoingCrossReferences: number;
   incomingCrossReferences: number;
   outgoingStudyNoteReferences: number;
   incomingStudyNoteReferences: number;
   outgoingCombinedReferences: number;
   incomingCombinedReferences: number;
}

/** Parsed optional/extra files, keyed by `<dataset>/<path>`. Failed loads are not cached. */
const fileCache = new Map<string, Promise<unknown>>();
/** Derived, per-dataset results (locator, degrees, clusters). Small: one entry per edition used. */
const derivedCache = new Map<string, Promise<unknown>>();
const maxDerivedEntries = 12;

export function clearInsightsDataCache(): void {
   fileCache.clear();
   derivedCache.clear();
}

function loadInsightsJson<T>(datasetId: string, relativePath: string): Promise<T> {
   if (!isValidDatasetId(datasetId)) {
      return Promise.reject(new Error(`Invalid dataset id: ${JSON.stringify(datasetId)}`));
   }

   const path = `${datasetId}/${relativePath}`;
   const cached = fileCache.get(path);

   if (cached) {
      return cached as Promise<T>;
   }

   const pending = fetch(`/generated/${path}`).then(async (response) => {
      if (!response.ok) {
         throw new Error(`Generated data file failed to load: ${path} (HTTP ${response.status})`);
      }

      try {
         return (await response.json()) as T;
      } catch {
         // A missing file behind an SPA fallback comes back as index.html with status 200.
         throw new Error(`Generated data file is not valid JSON: ${path}`);
      }
   });

   fileCache.set(path, pending);
   pending.catch(() => {
      if (fileCache.get(path) === pending) {
         fileCache.delete(path);
      }
   });

   return pending;
}

function derived<T>(key: string, build: () => Promise<T>): Promise<T> {
   const cached = derivedCache.get(key);

   if (cached) {
      return cached as Promise<T>;
   }

   const pending = build();

   derivedCache.set(key, pending);
   pending.catch(() => {
      if (derivedCache.get(key) === pending) {
         derivedCache.delete(key);
      }
   });

   while (derivedCache.size > maxDerivedEntries) {
      const oldest = derivedCache.keys().next().value;

      if (oldest === undefined) {
         break;
      }

      derivedCache.delete(oldest);
   }

   return pending;
}

/** Whether the dataset has study-note references at all (decides which filters are offered). */
export async function loadHasStudyNotes(datasetId: string): Promise<boolean> {
   const manifest = await loadManifest(datasetId);

   return manifest.availableEdgeKinds.includes('study_note_reference');
}

export function loadBookStats(datasetId: string): Promise<BookStat[]> {
   return loadInsightsJson<BookStat[]>(datasetId, 'stats.books.json');
}

export function loadChapterStats(datasetId: string): Promise<ChapterStat[]> {
   return loadInsightsJson<ChapterStat[]>(datasetId, 'stats.chapters.json');
}

/** Verse id ⇄ reference lookup. Uses the small search index when the dataset has one. */
export function loadVerseLocator(datasetId: string): Promise<VerseLocator> {
   return derived(`${datasetId}/locator`, async () => {
      const books = await loadBooks(datasetId);

      try {
         const file = await loadSearchIndex(datasetId);
         const locator = file ? locatorFromSearchIndex(file, books) : null;

         if (locator && locator.verseCount > 0) {
            return locator;
         }
      } catch {
         // Fall through to chapters.json: an optional file must never break the page.
      }

      return locatorFromChapters(await loadChapters(datasetId), books);
   });
}

/** Per-verse in/out degree. Precomputed when available, otherwise counted from the edge list. */
export function loadVerseDegrees(datasetId: string): Promise<VerseDegrees> {
   return derived(`${datasetId}/degrees`, async () => {
      try {
         const file = await loadVerseDegree(datasetId);

         if (file && Array.isArray(file.in) && Array.isArray(file.out)) {
            return {
               length: Math.max(file.in.length, file.out.length),
               in: file.in,
               out: file.out,
               inStudy: Array.isArray(file.inStudy) ? file.inStudy : [],
               outStudy: Array.isArray(file.outStudy) ? file.outStudy : [],
            };
         }
      } catch {
         // Fall through to counting.
      }

      const [ locator, edges ] = await Promise.all([
         loadVerseLocator(datasetId),
         loadCompactEdges(datasetId, 'combined'),
      ]);

      return computeVerseDegrees(edges, locator);
   });
}

/** Connected components of the reference graph, computed once per dataset per session. */
export function loadClusterSummary(datasetId: string): Promise<ClusterSummary> {
   return derived(`${datasetId}/clusters`, async () => {
      const [ locator, edges ] = await Promise.all([
         loadVerseLocator(datasetId),
         loadCompactEdges(datasetId, 'combined'),
      ]);

      return buildRelationshipComponents(locator, edges);
   });
}

/**
 * The Clusters headline numbers from `stats.components.json`, or `null` when the dataset has no
 * such file (the panel then waits for `loadClusterSummary`). Never rejects.
 */
export function loadClusterHeadline(datasetId: string): Promise<ClusterHeadline | null> {
   return derived(`${datasetId}/cluster-headline`, async () => {
      try {
         return headlineFromPrecomputed((await loadComponentsStats(datasetId))?.combined);
      } catch {
         return null;
      }
   });
}

/** Chapter → book reference counts for one book. */
export function loadChapterMatrix(datasetId: string, book: Book): Promise<ChapterMatrix> {
   return derived(`${datasetId}/chapter-matrix/${book.bookNumber}`, async () => {
      try {
         const file = await loadChapterMatrixFile(datasetId, book.bookNumber);

         if (file && Array.isArray(file.outgoing) && Array.isArray(file.incoming)) {
            return file;
         }
      } catch {
         // Fall through to the adjacency files.
      }

      const [ locator, sourceAdjacency, targetAdjacency ] = await Promise.all([
         loadVerseLocator(datasetId),
         loadSourceAdjacency(datasetId, book),
         loadTargetAdjacency(datasetId, book),
      ]);
      const outgoing: AdjacentEdge[] = Object.values(sourceAdjacency).flatMap((bucket) => bucket.outgoing);
      const incoming: AdjacentEdge[] = Object.values(targetAdjacency).flatMap((bucket) => bucket.incoming);

      return chapterMatrixFromAdjacency(book.bookNumber, book.chapters, outgoing, incoming, (verseId) =>
         locator.locate(verseId));
   });
}

/** Every reference from a verse in `sourceBook` to a verse in `targetBook` (the pair drill-down). */
export async function loadBookPairEdges(
   datasetId: string,
   sourceBook: Book,
   targetBook: Book,
   kind: EdgeKindFilter,
): Promise<VersePairEdge[]> {
   const [ locator, adjacency ] = await Promise.all([
      loadVerseLocator(datasetId),
      loadSourceAdjacency(datasetId, sourceBook),
   ]);

   return bookPairEdges(adjacency, (verseId) => locator.bookOf(verseId), targetBook.bookNumber, kind);
}

export { loadBookMatrix, loadBooks };
