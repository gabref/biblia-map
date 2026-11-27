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

export async function loadVerseIndex(datasetId: string): Promise<VerseIndex> {
   return loadDatasetJson<VerseIndex>(datasetId, 'verse-index.json');
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
