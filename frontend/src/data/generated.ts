import type {
   Book,
   BookMatrix,
   Chapter,
   CompactEdges,
   DatasetManifest,
   DatasetRegistryEntry,
   EdgeKindFilter,
   SourceAdjacency,
   StatsSummary,
   TargetAdjacency,
   VerseTextBook,
   VerseIndex,
} from '../types/generated';

const generatedBasePath = '/generated';

export async function loadDatasets(): Promise<DatasetRegistryEntry[]> {
   return loadGeneratedJson<DatasetRegistryEntry[]>('datasets.json');
}

export async function loadManifest(datasetId: string): Promise<DatasetManifest> {
   return loadDatasetJson<DatasetManifest>(datasetId, 'manifest.json');
}

export async function loadBooks(datasetId: string): Promise<Book[]> {
   return loadDatasetJson<Book[]>(datasetId, 'books.json');
}

export async function loadChapters(datasetId: string): Promise<Chapter[]> {
   return loadDatasetJson<Chapter[]>(datasetId, 'chapters.json');
}

/**
 * The verse index is derived from `chapters.json` instead of fetching `verse-index.json`:
 * every VerseRef is fully contained in the chapter verse lists (verified for all datasets),
 * so pages that need both files (Verse, Overview details, Blocks) download ~4 MB less JSON.
 */
export async function loadVerseIndex(datasetId: string): Promise<VerseIndex> {
   return buildVerseIndex(await loadChapters(datasetId));
}

const verseIndexByChapters = new WeakMap<Chapter[], VerseIndex>();

export function buildVerseIndex(chapters: Chapter[]): VerseIndex {
   const cached = verseIndexByChapters.get(chapters);

   if (cached) {
      return cached;
   }

   const verseIndex: VerseIndex = {};

   for (const chapter of chapters) {
      for (const verse of chapter.verses) {
         verseIndex[String(verse.jwpubVerseId)] = {
            jwpubVerseId: verse.jwpubVerseId,
            canonicalVerseId: verse.canonicalVerseId,
            bookNumber: chapter.bookNumber,
            chapterNumber: chapter.chapterNumber,
            verseNumber: verse.verseNumber,
            label: verse.label,
         };
      }
   }

   verseIndexByChapters.set(chapters, verseIndex);

   return verseIndex;
}

export async function loadStatsSummary(datasetId: string): Promise<StatsSummary> {
   return loadDatasetJson<StatsSummary>(datasetId, 'stats.summary.json');
}

export async function loadBookMatrix(datasetId: string, edgeKind: EdgeKindFilter): Promise<BookMatrix> {
   const matrixName = edgeKind === 'combined' ? 'combined' : edgeKind === 'crossrefs' ? 'crossrefs' : 'study-notes';

   return loadDatasetJson<BookMatrix>(datasetId, `matrices/book.${matrixName}.json`);
}

export async function loadCompactEdges(datasetId: string, edgeKind: EdgeKindFilter): Promise<CompactEdges> {
   const edgeName = edgeKind === 'combined' ? 'combined' : edgeKind === 'crossrefs' ? 'crossrefs' : 'study-notes';

   return loadDatasetJson<CompactEdges>(datasetId, `edges/${edgeName}.compact.json`);
}

export async function loadSourceAdjacency(datasetId: string, book: Book): Promise<SourceAdjacency> {
   return loadDatasetJson<SourceAdjacency>(datasetId, `adjacency/source/${bookFileName(book)}`);
}

export async function loadTargetAdjacency(datasetId: string, book: Book): Promise<TargetAdjacency> {
   return loadDatasetJson<TargetAdjacency>(datasetId, `adjacency/target/${bookFileName(book)}`);
}

export async function loadVerseTextBook(datasetId: string, book: Book): Promise<VerseTextBook> {
   return loadDatasetJson<VerseTextBook>(datasetId, `verse-text/${bookFileName(book)}`);
}

export function bookFileName(book: Pick<Book, 'bookNumber' | 'slug'>): string {
   return `${book.bookNumber.toString().padStart(2, '0')}.${book.slug}.json`;
}

export function edgeKindCode(edgeKind: EdgeKindFilter): number | null {
   switch (edgeKind) {
      case 'crossrefs':
         return 0;
      case 'study-notes':
         return 1;
      case 'combined':
         return null;
   }
}

const datasetIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Parsed generated files, keyed by relative path. Pages reload the same multi-megabyte files
 * (verse-index.json is ~4 MB, chapters.json ~3 MB) every time they mount, and the verse explorer
 * re-requests the same per-book adjacency files for every verse it shows. Sharing the in-flight
 * promise also dedupes concurrent requests for the same file. Least recently used entries are
 * evicted once the cache is full; failed loads are never cached, so a retry refetches.
 */
const maxCachedFiles = 64;
const generatedCache = new Map<string, Promise<unknown>>();

export function clearGeneratedDataCache(): void {
   generatedCache.clear();
}

export function isValidDatasetId(datasetId: string): boolean {
   return datasetIdPattern.test(datasetId);
}

async function loadDatasetJson<T>(datasetId: string, relativePath: string): Promise<T> {
   if (!isValidDatasetId(datasetId)) {
      throw new Error(`Invalid dataset id: ${JSON.stringify(datasetId)}`);
   }

   return loadGeneratedJson<T>(`${datasetId}/${relativePath}`);
}

function loadGeneratedJson<T>(relativePath: string): Promise<T> {
   const cached = generatedCache.get(relativePath);

   if (cached) {
      // Refresh recency: Map iteration order is insertion order.
      generatedCache.delete(relativePath);
      generatedCache.set(relativePath, cached);
      return cached as Promise<T>;
   }

   const pending = fetchGeneratedJson<T>(relativePath);
   generatedCache.set(relativePath, pending);
   pending.catch(() => {
      if (generatedCache.get(relativePath) === pending) {
         generatedCache.delete(relativePath);
      }
   });

   while (generatedCache.size > maxCachedFiles) {
      const oldestKey = generatedCache.keys().next().value;

      if (oldestKey === undefined) {
         break;
      }

      generatedCache.delete(oldestKey);
   }

   return pending;
}

async function fetchGeneratedJson<T>(relativePath: string): Promise<T> {
   const response = await fetch(`${generatedBasePath}/${relativePath}`);

   if (!response.ok) {
      throw new Error(`Generated data file failed to load: ${relativePath} (HTTP ${response.status})`);
   }

   try {
      return (await response.json()) as T;
   } catch {
      // A missing file behind an SPA fallback comes back as index.html with status 200.
      const contentType = response.headers.get('content-type') ?? 'unknown content type';
      throw new Error(`Generated data file is not valid JSON: ${relativePath} (${contentType})`);
   }
}

// ---------------------------------------------------------------------------
// Sprint 2 (E-G) optional files. Kept in this appended block (with its own type import) so
// other edits to this module do not conflict. Every loader resolves to `null` when the dataset's
// manifest does not list the feature, so callers can fall back to the Sprint 1 files.
// ---------------------------------------------------------------------------

import type {
   ChapterMatrix,
   ComponentsStats,
   CompareBook,
   CompareIndex,
   DatasetFeature,
   FootnotesBook,
   SearchIndex,
   StudyNotesBook,
   VerseDegree,
} from '../types/generated';

export function hasDatasetFeature(manifest: Pick<DatasetManifest, 'features'>, feature: DatasetFeature): boolean {
   return manifest.features?.includes(feature) ?? false;
}

async function loadFeatureJson<T>(datasetId: string, feature: DatasetFeature, relativePath: string): Promise<T | null> {
   const manifest = await loadManifest(datasetId);

   if (!hasDatasetFeature(manifest, feature)) {
      return null;
   }

   return loadDatasetJson<T>(datasetId, relativePath);
}

async function featureBookPath(datasetId: string, directory: string, bookNumber: number): Promise<string> {
   const book = (await loadBooks(datasetId)).find((candidate) => candidate.bookNumber === bookNumber);

   if (!book) {
      throw new Error(`Unknown book number ${bookNumber} in dataset ${datasetId}`);
   }

   return `${directory}/${bookFileName(book)}`;
}

/** `search-index.json` (~30 KB): books, localized names, aliases and chapter verse runs. */
export async function loadSearchIndex(datasetId: string): Promise<SearchIndex | null> {
   return loadFeatureJson<SearchIndex>(datasetId, 'search-index', 'search-index.json');
}

/** `stats.verse-degree.json` (~250 KB): per-verse degree arrays indexed by jwpubVerseId. */
export async function loadVerseDegree(datasetId: string): Promise<VerseDegree | null> {
   return loadFeatureJson<VerseDegree>(datasetId, 'verse-degree', 'stats.verse-degree.json');
}

/** `stats.components.json`: relationship blocks per edge filter (Blocks page), precomputed. */
export async function loadComponentsStats(datasetId: string): Promise<ComponentsStats | null> {
   return loadFeatureJson<ComponentsStats>(datasetId, 'components', 'stats.components.json');
}

/** `matrices/chapter/<NN>.<slug>.json`: chapter → book reference counts for one book. */
export async function loadChapterMatrix(datasetId: string, bookNumber: number): Promise<ChapterMatrix | null> {
   const manifest = await loadManifest(datasetId);

   if (!hasDatasetFeature(manifest, 'chapter-matrices')) {
      return null;
   }

   return loadDatasetJson<ChapterMatrix>(datasetId, await featureBookPath(datasetId, 'matrices/chapter', bookNumber));
}

/** `study-notes/<NN>.<slug>.json`: study-note text by jwpubVerseId (nwtsty / nwtsty-i only). */
export async function loadStudyNotes(datasetId: string, bookNumber: number): Promise<StudyNotesBook | null> {
   const manifest = await loadManifest(datasetId);

   if (!hasDatasetFeature(manifest, 'study-note-text')) {
      return null;
   }

   return loadDatasetJson<StudyNotesBook>(datasetId, await featureBookPath(datasetId, 'study-notes', bookNumber));
}

/** `footnotes/<NN>.<slug>.json`: translation footnotes by jwpubVerseId. */
export async function loadFootnotes(datasetId: string, bookNumber: number): Promise<FootnotesBook | null> {
   const manifest = await loadManifest(datasetId);

   if (!hasDatasetFeature(manifest, 'footnote-text')) {
      return null;
   }

   return loadDatasetJson<FootnotesBook>(datasetId, await featureBookPath(datasetId, 'footnotes', bookNumber));
}

/** `/generated/compare/index.json`, or `null` when no edition diffs were generated. */
export async function loadCompareIndex(): Promise<CompareIndex | null> {
   try {
      return await loadGeneratedJson<CompareIndex>('compare/index.json');
   } catch {
      return null;
   }
}

/**
 * `/generated/compare/<a>__<b>/<NN>.<slug>.json`; `pairId` comes from `loadCompareIndex()`.
 * Book file names use the canonical English slugs, identical in every dataset.
 */
export async function loadCompareBook(pairId: string, book: Pick<Book, 'bookNumber' | 'slug'>): Promise<CompareBook | null> {
   const compareIndex = await loadCompareIndex();

   if (!compareIndex?.pairs.some((pair) => pair.id === pairId)) {
      return null;
   }

   return loadGeneratedJson<CompareBook>(`compare/${pairId}/${bookFileName(book)}`);
}

/** Normalizes user input the same way the extractor builds `SearchBook.keys`. */
export function normalizeSearchKey(value: string): string {
   return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Finds the book whose name, abbreviation or alias matches `query` (exact normalized key). */
export function findSearchBook(index: SearchIndex, query: string): SearchIndex['books'][number] | undefined {
   const key = normalizeSearchKey(query);

   return key ? index.books.find((book) => book.keys.includes(key)) : undefined;
}

/** Resolves a reference to its jwpubVerseId with `search-index.json` alone, or `null` if it does not exist. */
export function searchIndexVerseId(index: SearchIndex, bookNumber: number, chapter: number, verse: number): number | null {
   const run = index.books.find((book) => book.bookNumber === bookNumber)?.chapters[chapter - 1];

   if (run) {
      const [firstVerseId, firstVerseNumber, verseCount] = run;

      if (verse >= firstVerseNumber && verse < firstVerseNumber + verseCount) {
         return firstVerseId + (verse - firstVerseNumber);
      }
   }

   const irregular = index.irregularVerses.find(
      ([, book, chapterNumber, verseNumber]) => book === bookNumber && chapterNumber === chapter && verseNumber === verse,
   );

   return irregular ? irregular[0] : null;
}
