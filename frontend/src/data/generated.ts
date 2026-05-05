import type {
   Book,
   BookMatrix,
   Chapter,
   DatasetManifest,
   EdgeKindFilter,
   SourceAdjacency,
   StatsSummary,
   TargetAdjacency,
   VerseIndex,
} from '../types/generated';

const datasetBasePath = '/generated/nwtsty';

export async function loadManifest(): Promise<DatasetManifest> {
   return loadGeneratedJson<DatasetManifest>('manifest.json');
}

export async function loadBooks(): Promise<Book[]> {
   return loadGeneratedJson<Book[]>('books.json');
}

export async function loadChapters(): Promise<Chapter[]> {
   return loadGeneratedJson<Chapter[]>('chapters.json');
}

export async function loadVerseIndex(): Promise<VerseIndex> {
   return loadGeneratedJson<VerseIndex>('verse-index.json');
}

export async function loadStatsSummary(): Promise<StatsSummary> {
   return loadGeneratedJson<StatsSummary>('stats.summary.json');
}

export async function loadBookMatrix(edgeKind: EdgeKindFilter): Promise<BookMatrix> {
   const matrixName = edgeKind === 'combined' ? 'combined' : edgeKind === 'crossrefs' ? 'crossrefs' : 'study-notes';

   return loadGeneratedJson<BookMatrix>(`matrices/book.${matrixName}.json`);
}

export async function loadSourceAdjacency(book: Book): Promise<SourceAdjacency> {
   return loadGeneratedJson<SourceAdjacency>(`adjacency/source/${bookFileName(book)}`);
}

export async function loadTargetAdjacency(book: Book): Promise<TargetAdjacency> {
   return loadGeneratedJson<TargetAdjacency>(`adjacency/target/${bookFileName(book)}`);
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

async function loadGeneratedJson<T>(relativePath: string): Promise<T> {
   const response = await fetch(`${datasetBasePath}/${relativePath}`);

   if (!response.ok) {
      throw new Error(`Generated data file failed to load: ${relativePath}`);
   }

   return response.json() as Promise<T>;
}
