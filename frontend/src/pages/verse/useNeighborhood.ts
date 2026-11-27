/**
 * Data hooks of the Verse Study page: base tables, the ego graph of the studied verse and
 * lazily loaded verse text. Parsed adjacency/text books are kept in small module-level
 * stores so lookups during ranking and rendering are synchronous.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
   loadBooks,
   loadManifest,
   loadSourceAdjacency,
   loadStatsSummary,
   loadTargetAdjacency,
   loadVerseIndex,
   loadVerseTextBook,
} from '../../data/generated';
import {
   abbreviateBookNames,
   adjacencyFileKey,
   buildFirstHop,
   MAX_ADJACENCY_FILES,
   planAdjacencyFiles,
   rankSecondHop,
   type AdjacencyFile,
   type AdjacencyLookup,
   type NeighborNode,
} from '../../graph/neighborhood';
import { useAsyncData, type AsyncState } from '../../hooks/useAsyncData';
import type {
   AdjacentEdge,
   Book,
   DatasetManifest,
   DirectionMode,
   EdgeKindFilter,
   SourceAdjacency,
   StatsSummary,
   TargetAdjacency,
   VerseTextBook,
} from '../../types/generated';
import { buildBookMap, buildVerseCatalog, type VerseCatalog } from './catalog';
import type { GraphDepth } from './urlState';

export interface VerseBase {
   manifest: DatasetManifest;
   books: Book[];
   bookMap: Map<number, Book>;
   catalog: VerseCatalog;
   /** Short book names for graph labels. */
   abbreviations: Map<number, string>;
   /** `null` when the summary could not be loaded (the study-note filter then stays enabled). */
   summary: StatsSummary | null;
}

export function useVerseBase(datasetId: string, retryToken: number): AsyncState<VerseBase> {
   return useAsyncData(async () => {
      const [ manifest, books, verseIndex, summary ] = await Promise.all([
         loadManifest(datasetId),
         loadBooks(datasetId),
         loadVerseIndex(datasetId),
         loadStatsSummary(datasetId).catch(() => null),
      ]);

      return {
         manifest,
         books,
         bookMap: buildBookMap(books),
         catalog: buildVerseCatalog(verseIndex),
         abbreviations: abbreviateBookNames(books),
         summary,
      };
   }, [ datasetId, retryToken ]);
}

// ---------------------------------------------------------------- adjacency store

const MAX_STORED_ADJACENCY = 90;
const adjacencyStore = new Map<string, SourceAdjacency | TargetAdjacency>();

function storeKey(datasetId: string, file: AdjacencyFile): string {
   return `${datasetId}:${adjacencyFileKey(file)}`;
}

async function ensureAdjacency(datasetId: string, book: Book, mode: AdjacencyFile['mode']): Promise<void> {
   const key = storeKey(datasetId, { mode, bookNumber: book.bookNumber });

   if (adjacencyStore.has(key)) {
      return;
   }

   const adjacency = mode === 'source' ? await loadSourceAdjacency(datasetId, book) : await loadTargetAdjacency(datasetId, book);

   adjacencyStore.set(key, adjacency);

   while (adjacencyStore.size > MAX_STORED_ADJACENCY) {
      const oldest = adjacencyStore.keys().next().value;

      if (oldest === undefined) {
         break;
      }

      adjacencyStore.delete(oldest);
   }
}

function storedFileKeys(datasetId: string): Set<string> {
   const prefix = `${datasetId}:`;
   const keys = new Set<string>();

   for (const key of adjacencyStore.keys()) {
      if (key.startsWith(prefix)) {
         keys.add(key.slice(prefix.length));
      }
   }

   return keys;
}

const NO_EDGES: readonly AdjacentEdge[] = [];

function storeLookup(datasetId: string, catalog: VerseCatalog): AdjacencyLookup {
   const read = (mode: AdjacencyFile['mode'], verseId: number): SourceAdjacency | TargetAdjacency | null | undefined => {
      const bookNumber = catalog.bookOf(verseId);

      // An unknown verse has no edges; it must never fall back to another book's file.
      return bookNumber === null ? null : adjacencyStore.get(storeKey(datasetId, { mode, bookNumber }));
   };

   return {
      outgoing: (verseId) => {
         const file = read('source', verseId) as SourceAdjacency | null | undefined;

         return file === undefined ? undefined : (file?.[String(verseId)]?.outgoing ?? NO_EDGES);
      },
      incoming: (verseId) => {
         const file = read('target', verseId) as TargetAdjacency | null | undefined;

         return file === undefined ? undefined : (file?.[String(verseId)]?.incoming ?? NO_EDGES);
      },
   };
}

// ---------------------------------------------------------------- neighbourhood

interface CenterEdges {
   centerId: number;
   outgoing: readonly AdjacentEdge[];
   incoming: readonly AdjacentEdge[];
}

export interface ExtendedState {
   loading: boolean;
   /** Adjacency files fetched so far / to fetch for this view. */
   loadedFiles: number;
   totalFiles: number;
   /** Files left out by the budget (the "load the rest" action fetches them). */
   deferredFiles: number;
   /** First-hop verses whose own connections were explored. */
   coveredNodes: number;
   totalNodes: number;
}

export interface DirectionCounts {
   all: number;
   outgoing: number;
   incoming: number;
}

export interface Neighborhood {
   /** Verse the data below belongs to; differs from the requested verse while `isStale`. */
   centerId: number | null;
   /** Nothing to show yet (first load). */
   isLoading: boolean;
   /** Still showing the previous verse while the requested one loads. */
   isStale: boolean;
   error: Error | null;
   firstHop: NeighborNode[];
   /** Connected passages per direction under the current reference type. */
   counts: DirectionCounts;
   /** Ranked second-hop verses (empty at depth 1 or while loading). */
   secondHop: NeighborNode[];
   extended: ExtendedState | null;
   /** Fetches the adjacency files the budget left out. */
   loadDeferred: () => void;
   retry: () => void;
}

export interface NeighborhoodInput {
   datasetId: string;
   base: VerseBase;
   centerId: number | null;
   direction: DirectionMode;
   edgeKind: EdgeKindFilter;
   depth: GraphDepth;
}

const NO_NODES: NeighborNode[] = [];

export function useNeighborhood({ datasetId, base, centerId, direction, edgeKind, depth }: NeighborhoodInput): Neighborhood {
   const [ retryToken, setRetryToken ] = useState(0);
   const centerState = useAsyncData<CenterEdges | null>(
      async () => {
         const bookNumber = centerId === null ? null : base.catalog.bookOf(centerId);
         const book = bookNumber === null ? undefined : base.bookMap.get(bookNumber);

         if (centerId === null || !book) {
            return null;
         }

         // Both directions are always loaded (two files) so the direction tabs can show counts.
         await Promise.all([ ensureAdjacency(datasetId, book, 'source'), ensureAdjacency(datasetId, book, 'target') ]);

         const lookup = storeLookup(datasetId, base.catalog);

         return { centerId, outgoing: lookup.outgoing(centerId) ?? NO_EDGES, incoming: lookup.incoming(centerId) ?? NO_EDGES };
      },
      [ datasetId, base, centerId, retryToken ],
      { keepPreviousData: true },
   );
   const center = centerState.data;
   const firstHop = useMemo(
      () => (center ? buildFirstHop({ ...center, direction, edgeKind }) : NO_NODES),
      [ center, direction, edgeKind ],
   );
   const counts = useMemo<DirectionCounts>(() => {
      if (!center) {
         return { all: 0, outgoing: 0, incoming: 0 };
      }

      const count = (mode: DirectionMode): number =>
         mode === direction ? firstHop.length : buildFirstHop({ ...center, direction: mode, edgeKind }).length;

      return { all: count('all'), outgoing: count('outgoing'), incoming: count('incoming') };
   }, [ center, direction, edgeKind, firstHop ]);

   // Depth 2: fetch the planned adjacency files with progress, then rank once.
   const [ budgetRounds, setBudgetRounds ] = useState(1);
   const [ extended, setExtended ] = useState<{ owner: NeighborNode[]; state: ExtendedState; ranked: NeighborNode[] } | null>(null);
   const roundsOwner = useRef<number | null>(null);

   if (roundsOwner.current !== centerId) {
      roundsOwner.current = centerId;

      if (budgetRounds !== 1) {
         setBudgetRounds(1);
      }
   }

   useEffect(() => {
      if (depth !== 2 || !center || firstHop.length === 0) {
         setExtended(null);

         return undefined;
      }

      let active = true;
      const lookup = storeLookup(datasetId, base.catalog);
      const centerFiles = 2;
      const plan = planAdjacencyFiles({
         firstHop,
         bookOf: base.catalog.bookOf,
         direction,
         loaded: storedFileKeys(datasetId),
         maxFiles: budgetRounds > 1 ? Number.POSITIVE_INFINITY : MAX_ADJACENCY_FILES - centerFiles,
      });
      const progress: ExtendedState = {
         loading: plan.files.length > 0,
         loadedFiles: 0,
         totalFiles: plan.files.length,
         deferredFiles: plan.deferred.length,
         coveredNodes: plan.coveredNodes,
         totalNodes: plan.totalNodes,
      };
      const rank = (): NeighborNode[] => rankSecondHop({ centerId: center.centerId, firstHop, lookup, direction, edgeKind });

      if (plan.files.length === 0) {
         setExtended({ owner: firstHop, state: progress, ranked: rank() });

         return undefined;
      }

      setExtended((previous) => ({
         owner: firstHop,
         state: progress,
         // Keep what is already drawn for this verse while more files arrive.
         ranked: previous && previous.owner === firstHop ? previous.ranked : NO_NODES,
      }));

      let done = 0;
      let progressFrame = 0;

      void Promise.all(
         plan.files.map(async (file) => {
            const book = base.bookMap.get(file.bookNumber);

            try {
               if (book) {
                  await ensureAdjacency(datasetId, book, file.mode);
               }
            } catch {
               // A book that fails to load only means fewer second-hop verses.
            }

            done += 1;

            // Files land in bursts: one progress render per frame, not one per file.
            if (active && progressFrame === 0) {
               progressFrame = window.requestAnimationFrame(() => {
                  progressFrame = 0;
                  setExtended((previous) =>
                     previous && previous.owner === firstHop && previous.state.loading
                        ? { ...previous, state: { ...previous.state, loadedFiles: done } }
                        : previous,
                  );
               });
            }
         }),
      ).then(() => {
         window.cancelAnimationFrame(progressFrame);

         if (active) {
            setExtended({ owner: firstHop, state: { ...progress, loading: false, loadedFiles: done }, ranked: rank() });
         }
      });

      return () => {
         active = false;
         window.cancelAnimationFrame(progressFrame);
      };
   }, [ base, budgetRounds, center, datasetId, depth, direction, edgeKind, firstHop ]);

   const current = extended && extended.owner === firstHop ? extended : null;
   const loadDeferred = useCallback(() => setBudgetRounds((rounds) => rounds + 1), []);
   const retry = useCallback(() => setRetryToken((token) => token + 1), []);

   return {
      centerId: center?.centerId ?? null,
      isLoading: centerState.isLoading && !center,
      isStale: centerState.isStale || (centerState.isLoading && center !== null && center.centerId !== centerId),
      error: centerState.error,
      firstHop,
      counts,
      secondHop: depth === 2 ? (current?.ranked ?? NO_NODES) : NO_NODES,
      extended: depth === 2 ? (current?.state ?? null) : null,
      loadDeferred,
      retry,
   };
}

// ---------------------------------------------------------------- verse text

const textStore = new Map<string, VerseTextBook | null>();
const textPending = new Set<string>();

export interface VerseTexts {
   /** Text of one verse: `undefined` while its book loads, `null` when the dataset has none. */
   get: (verseId: number) => string | null | undefined;
   /** Asks for a book's text (no-op when loaded or loading). */
   request: (bookNumber: number) => void;
}

/**
 * Verse text per book, fetched only when something on screen asks for it (the studied verse,
 * a book group scrolled into view, a hovered node), so opening a verse stays light.
 */
export function useVerseTexts(datasetId: string, base: VerseBase): VerseTexts {
   const [ version, setVersion ] = useState(0);
   const frame = useRef(0);
   const mounted = useRef(true);

   useEffect(() => {
      mounted.current = true;

      return () => {
         mounted.current = false;
         window.cancelAnimationFrame(frame.current);
      };
   }, []);

   const request = useCallback(
      (bookNumber: number): void => {
         const key = `${datasetId}:${bookNumber}`;
         const book = base.bookMap.get(bookNumber);

         if (!base.manifest.hasVerseText || !book || textStore.has(key) || textPending.has(key)) {
            return;
         }

         textPending.add(key);
         loadVerseTextBook(datasetId, book)
            .then((text) => textStore.set(key, text))
            .catch(() => textStore.set(key, null))
            .finally(() => {
               textPending.delete(key);

               if (mounted.current) {
                  // Several books usually land together: one render per frame is enough.
                  window.cancelAnimationFrame(frame.current);
                  frame.current = window.requestAnimationFrame(() => setVersion((value) => value + 1));
               }
            });
      },
      [ base, datasetId ],
   );

   return useMemo<VerseTexts>(
      () => ({
         request,
         get: (verseId) => {
            if (!base.manifest.hasVerseText) {
               return null;
            }

            const bookNumber = base.catalog.bookOf(verseId);

            if (bookNumber === null) {
               return null;
            }

            const book = textStore.get(`${datasetId}:${bookNumber}`);

            return book === undefined ? undefined : (book?.[String(verseId)]?.text ?? null);
         },
      }),
      // `version` is the change signal for the module-level store.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [ base, datasetId, request, version ],
   );
}
