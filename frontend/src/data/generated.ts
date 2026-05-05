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

async function loadDatasetJson<T>(datasetId: string, relativePath: string): Promise<T> {
   return loadGeneratedJson<T>(`${datasetId}/${relativePath}`);
}

async function loadGeneratedJson<T>(relativePath: string): Promise<T> {
   const response = await fetch(`${generatedBasePath}/${relativePath}`);

   if (!response.ok) {
      throw new Error(`Generated data file failed to load: ${relativePath}`);
   }

   return response.json() as Promise<T>;
}
