import type { CompactEdges, PrecomputedRelationshipComponents } from '../types/generated';

/**
 * The set of verses to scan. `VerseLocator` (pages/insights/locator.ts) satisfies this; ids are
 * `jwpubVerseId`s, which are dense enough to index typed arrays directly.
 */
export interface VerseSpace {
   /** Largest verse id + 1. */
   idSpace: number;
   forEachVerse(visit: (verseId: number, run: { bookNumber: number }) => void): void;
}

export interface ClusterBookCount {
   bookNumber: number;
   count: number;
}

/** A connected group of verses that never touches the main web of references. */
export interface ReferenceCluster {
   /** 1-based rank among the small clusters (largest first). */
   id: number;
   size: number;
   edgeCount: number;
   /** Member verses in canonical order. */
   verseIds: number[];
   books: ClusterBookCount[];
}

export interface GiantComponent {
   size: number;
   edgeCount: number;
   /** Books by number of member verses, largest first (all 66 at most). */
   books: ClusterBookCount[];
}

/** Components grouped by size in power-of-two buckets: 1, 2–3, 4–7, 8–15, … */
export interface ClusterSizeBucket {
   min: number;
   max: number;
   clusters: number;
   verses: number;
}

export interface ClusterSummary {
   totalVerses: number;
   totalEdges: number;
   /** Number of connected components, isolated verses included. */
   componentCount: number;
   /** The largest component (when it has at least two verses). */
   giant: GiantComponent | null;
   /** Every other component with at least two verses, largest first. */
   smallClusters: ReferenceCluster[];
   smallClusterVerses: number;
   /** Verses that neither cite nor are cited by any other verse. */
   isolatedCount: number;
   /** Isolated verse ids per book, canonical order; only books that have any. */
   isolatedByBook: Array<{ bookNumber: number; verseIds: number[] }>;
   sizeBuckets: ClusterSizeBucket[];
}

/** The four numbers of the Clusters finding sentence. */
export interface ClusterHeadline {
   totalVerses: number;
   giantSize: number;
   /** Components with at least two verses, the main web excluded. */
   smallClusterCount: number;
   isolatedCount: number;
}

export function headlineFromSummary(summary: ClusterSummary): ClusterHeadline {
   return {
      totalVerses: summary.totalVerses,
      giantSize: summary.giant?.size ?? 0,
      smallClusterCount: summary.smallClusters.length,
      isolatedCount: summary.isolatedCount,
   };
}

/** One edge filter of `stats.components.json`; only the fields read here. */
type PrecomputedTotals = Partial<Pick<PrecomputedRelationshipComponents, 'totalVerses' | 'blockCount' | 'isolatedVerses'>> & {
   largestBlock?: { size: number } | null;
};

/**
 * Headline from a `stats.components.json` entry, whose `blockCount` includes single-verse blocks.
 * `null` when the entry is missing or malformed, so callers fall back to computing.
 */
export function headlineFromPrecomputed(entry: PrecomputedTotals | null | undefined): ClusterHeadline | null {
   if (!entry) {
      return null;
   }

   const { totalVerses, blockCount, isolatedVerses } = entry;

   if (!isCount(totalVerses) || !isCount(blockCount) || !isCount(isolatedVerses) || totalVerses === 0) {
      return null;
   }

   const largest = entry.largestBlock?.size;
   const giantSize = isCount(largest) && largest >= 2 ? largest : 0;

   return {
      totalVerses,
      giantSize,
      smallClusterCount: Math.max(0, blockCount - isolatedVerses - (giantSize > 0 ? 1 : 0)),
      isolatedCount: isolatedVerses,
   };
}

function isCount(value: unknown): value is number {
   return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Connected components of the undirected reference graph (union-find over typed arrays).
 * A cited range links the source to every verse in the range.
 */
export function buildRelationshipComponents(space: VerseSpace, edges: CompactEdges): ClusterSummary {
   const idSpace = space.idSpace;
   const parent = new Int32Array(idSpace).fill(-1);
   const rank = new Uint8Array(idSpace);
   const bookOf = new Uint8Array(idSpace);
   let totalVerses = 0;

   space.forEachVerse((verseId, run) => {
      parent[verseId] = verseId;
      bookOf[verseId] = run.bookNumber;
      totalVerses += 1;
   });

   const find = (start: number): number => {
      let root = start;

      while (parent[root] !== root) {
         root = parent[root];
      }

      // Path compression.
      let node = start;

      while (parent[node] !== root) {
         const next = parent[node];
         parent[node] = root;
         node = next;
      }

      return root;
   };

   const union = (left: number, right: number): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);

      if (leftRoot === rightRoot) {
         return;
      }

      if (rank[leftRoot] < rank[rightRoot]) {
         parent[leftRoot] = rightRoot;
      } else if (rank[leftRoot] > rank[rightRoot]) {
         parent[rightRoot] = leftRoot;
      } else {
         parent[rightRoot] = leftRoot;
         rank[leftRoot] += 1;
      }
   };

   const isVerse = (verseId: number): boolean => verseId >= 0 && verseId < idSpace && parent[verseId] !== -1;
   const edgeTotal = edges.source.length;

   for (let edgeIndex = 0; edgeIndex < edgeTotal; edgeIndex += 1) {
      const source = edges.source[edgeIndex];

      if (!isVerse(source)) {
         continue;
      }

      const end = Math.max(edges.targetEnd[edgeIndex], edges.targetStart[edgeIndex]);

      for (let target = edges.targetStart[edgeIndex]; target <= end; target += 1) {
         if (isVerse(target)) {
            union(source, target);
         }
      }
   }

   // Component sizes and edge counts, keyed by root id.
   const sizeOf = new Int32Array(idSpace);
   const edgesOf = new Int32Array(idSpace);

   for (let verseId = 0; verseId < idSpace; verseId += 1) {
      if (parent[verseId] !== -1) {
         sizeOf[find(verseId)] += 1;
      }
   }

   for (let edgeIndex = 0; edgeIndex < edgeTotal; edgeIndex += 1) {
      const source = edges.source[edgeIndex];

      if (isVerse(source)) {
         edgesOf[find(source)] += 1;
      }
   }

   let giantRoot = -1;
   let componentCount = 0;
   const bucketMap = new Map<number, ClusterSizeBucket>();

   for (let root = 0; root < idSpace; root += 1) {
      const size = sizeOf[root];

      if (size === 0) {
         continue;
      }

      componentCount += 1;

      if (size >= 2 && (giantRoot === -1 || size > sizeOf[giantRoot])) {
         giantRoot = root;
      }

      const exponent = Math.floor(Math.log2(size));
      const bucket = bucketMap.get(exponent) ?? { min: 2 ** exponent, max: 2 ** (exponent + 1) - 1, clusters: 0, verses: 0 };

      bucket.clusters += 1;
      bucket.verses += size;
      bucketMap.set(exponent, bucket);
   }

   const giantBooks = new Map<number, number>();
   const isolated = new Map<number, number[]>();
   const members = new Map<number, number[]>();

   for (let verseId = 0; verseId < idSpace; verseId += 1) {
      if (parent[verseId] === -1) {
         continue;
      }

      const root = find(verseId);
      const book = bookOf[verseId];

      if (root === giantRoot) {
         giantBooks.set(book, (giantBooks.get(book) ?? 0) + 1);
      } else if (sizeOf[root] === 1) {
         pushTo(isolated, book, verseId);
      } else {
         pushTo(members, root, verseId);
      }
   }

   const smallClusters = Array.from(members.entries())
      .map(([ root, verseIds ]) => {
         const books = new Map<number, number>();

         for (const verseId of verseIds) {
            books.set(bookOf[verseId], (books.get(bookOf[verseId]) ?? 0) + 1);
         }

         return { id: 0, size: verseIds.length, edgeCount: edgesOf[root], verseIds, books: sortedBookCounts(books) };
      })
      .sort((left, right) => right.size - left.size || left.verseIds[0] - right.verseIds[0])
      .map((cluster, index) => ({ ...cluster, id: index + 1 }));

   const isolatedByBook = Array.from(isolated.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([ bookNumber, verseIds ]) => ({ bookNumber, verseIds }));

   return {
      totalVerses,
      totalEdges: edgeTotal,
      componentCount,
      giant: giantRoot === -1
         ? null
         : { size: sizeOf[giantRoot], edgeCount: edgesOf[giantRoot], books: sortedBookCounts(giantBooks) },
      smallClusters,
      smallClusterVerses: smallClusters.reduce((total, cluster) => total + cluster.size, 0),
      isolatedCount: isolatedByBook.reduce((total, entry) => total + entry.verseIds.length, 0),
      isolatedByBook,
      sizeBuckets: Array.from(bucketMap.values()).sort((left, right) => left.min - right.min),
   };
}

function pushTo(map: Map<number, number[]>, key: number, value: number): void {
   const list = map.get(key);

   if (list) {
      list.push(value);
   } else {
      map.set(key, [ value ]);
   }
}

function sortedBookCounts(counts: Map<number, number>): ClusterBookCount[] {
   return Array.from(counts.entries())
      .map(([ bookNumber, count ]) => ({ bookNumber, count }))
      .sort((left, right) => right.count - left.count || left.bookNumber - right.bookNumber);
}
