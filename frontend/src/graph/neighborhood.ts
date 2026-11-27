/**
 * Ego graph of one verse (Epic E-B): the verses it cites, the verses citing it, and
 * (depth 2) the verses that share the most links with those. Pure functions, no I/O.
 *
 * A graph node is a *passage* (`start..end` jwpub verse ids), not a single verse, so a
 * range reference such as "Ps 104:1-35" stays one node with its full label everywhere.
 */
import type { AdjacentEdge, DirectionMode, EdgeKindFilter, VerseRef } from '../types/generated';

export type LinkDirection = 'outgoing' | 'incoming';
export type NodeDirection = LinkDirection | 'both';

/** Second-hop verses shown per "page" (the "Show 40 more" step). */
export const SECOND_HOP_PAGE = 40;
/** Adjacency files one depth-2 view may fetch before the user asks for more. */
export const MAX_ADJACENCY_FILES = 25;
/** Hard cap of first-hop nodes drawn in the graph (the list always shows all). */
export const MAX_FIRST_HOP_GRAPH_NODES = 150;
/** Longest range expanded verse by verse (Psalm 119 has 176 verses). */
export const MAX_RANGE_VERSES = 200;

/** One edge seen from the node that owns it. `outgoing` = the inner node cites this passage. */
export interface NeighborEdge {
   direction: LinkDirection;
   edge: AdjacentEdge;
}

/** Link between a second-hop node and one of the first-hop nodes it is reached through. */
export interface ViaLink {
   /** Key of the first-hop node. */
   from: string;
   /** `outgoing` = the first-hop verse cites this node; `incoming` = this node cites it. */
   direction: NodeDirection;
   count: number;
}

export interface NeighborNode {
   key: string;
   /** First verse of the passage (the verse to study when the node is opened). */
   verseId: number;
   /** Last verse of the passage; equals `verseId` for a single verse. */
   endVerseId: number;
   depth: 1 | 2;
   direction: NodeDirection;
   /** Depth 1: every edge between the centre and this passage. Depth 2: edges to first-hop nodes. */
   edges: NeighborEdge[];
   crossRefCount: number;
   studyNoteCount: number;
   /** Depth 2 only: the first-hop nodes this verse is linked to. */
   via: ViaLink[];
   /** Depth 2 only: number of distinct first-hop nodes linked (the ranking score). */
   score: number;
}

export interface EgoLink {
   key: string;
   /** Inner endpoint: the centre key (depth 1) or a first-hop key (depth 2). */
   a: string;
   /** Outer endpoint. */
   b: string;
   /** `outgoing` = a cites b, `incoming` = b cites a. */
   direction: NodeDirection;
   depth: 1 | 2;
   count: number;
   /** True when every edge behind the link comes from a study note. */
   studyNoteOnly: boolean;
}

export interface EgoGraph {
   centerId: number;
   centerKey: string;
   /** First-hop nodes drawn (capped), then second-hop nodes drawn (capped). */
   nodes: NeighborNode[];
   links: EgoLink[];
   firstHopTotal: number;
   firstHopShown: number;
   secondHopTotal: number;
   secondHopShown: number;
}

export interface AdjacencyLookup {
   /** Outgoing edges of a verse; `undefined` when its adjacency file is not loaded. */
   outgoing: (verseId: number) => readonly AdjacentEdge[] | undefined;
   /** Incoming edges of a verse; `undefined` when its adjacency file is not loaded. */
   incoming: (verseId: number) => readonly AdjacentEdge[] | undefined;
}

export function passageKey(start: number, end: number = start): string {
   return `${start}-${Math.max(start, end)}`;
}

/** Reversed ranges in the source data are treated as a single verse. */
export function edgeRangeEnd(edge: Pick<AdjacentEdge, 'targetStart' | 'targetEnd'>): number {
   return edge.targetEnd > edge.targetStart ? edge.targetEnd : edge.targetStart;
}

export function matchesKind(edge: Pick<AdjacentEdge, 'kind'>, edgeKind: EdgeKindFilter): boolean {
   if (edgeKind === 'combined') {
      return true;
   }

   return edgeKind === 'crossrefs' ? edge.kind === 0 : edge.kind === 1;
}

function emptyNode(key: string, verseId: number, endVerseId: number, depth: 1 | 2): NeighborNode {
   return {
      key,
      verseId,
      endVerseId,
      depth,
      direction: 'outgoing',
      edges: [],
      crossRefCount: 0,
      studyNoteCount: 0,
      via: [],
      score: 0,
   };
}

function addEdge(node: NeighborNode, direction: LinkDirection, edge: AdjacentEdge): void {
   node.direction = node.edges.length === 0 ? direction : node.direction === direction ? direction : 'both';
   node.edges.push({ direction, edge });

   if (edge.kind === 1) {
      node.studyNoteCount += 1;
   } else {
      node.crossRefCount += 1;
   }
}

function byCanonicalOrder(left: NeighborNode, right: NeighborNode): number {
   return left.verseId - right.verseId || left.endVerseId - right.endVerseId;
}

export interface FirstHopInput {
   centerId: number;
   outgoing: readonly AdjacentEdge[];
   incoming: readonly AdjacentEdge[];
   direction: DirectionMode;
   edgeKind: EdgeKindFilter;
}

/**
 * Direct connections of the centre verse, one node per distinct passage, in canonical order.
 * A passage linked in both directions is one node with `direction: 'both'`.
 */
export function buildFirstHop({ centerId, outgoing, incoming, direction, edgeKind }: FirstHopInput): NeighborNode[] {
   const nodes = new Map<string, NeighborNode>();
   const upsert = (start: number, end: number): NeighborNode => {
      const key = passageKey(start, end);
      let node = nodes.get(key);

      if (!node) {
         node = emptyNode(key, start, end, 1);
         nodes.set(key, node);
      }

      return node;
   };

   if (direction !== 'incoming') {
      for (const edge of outgoing) {
         const end = edgeRangeEnd(edge);

         // A verse citing exactly itself is not a connection.
         if (!matchesKind(edge, edgeKind) || (edge.targetStart === centerId && end === centerId)) {
            continue;
         }

         addEdge(upsert(edge.targetStart, end), 'outgoing', edge);
      }
   }

   if (direction !== 'outgoing') {
      for (const edge of incoming) {
         if (!matchesKind(edge, edgeKind) || edge.source === centerId) {
            continue;
         }

         addEdge(upsert(edge.source, edge.source), 'incoming', edge);
      }
   }

   return Array.from(nodes.values()).sort(byCanonicalOrder);
}

export interface SecondHopInput {
   centerId: number;
   firstHop: readonly NeighborNode[];
   lookup: AdjacencyLookup;
   direction: DirectionMode;
   edgeKind: EdgeKindFilter;
}

/**
 * Every verse one step beyond the first hop, ranked by how many first-hop verses it shares a
 * link with (then by total links, then canonical order). The centre and first-hop passages are
 * excluded. First-hop verses whose adjacency is not loaded simply contribute nothing.
 */
export function rankSecondHop({ centerId, firstHop, lookup, direction, edgeKind }: SecondHopInput): NeighborNode[] {
   const firstHopKeys = new Set(firstHop.map((node) => node.key));
   const candidates = new Map<string, NeighborNode>();
   const viaByNode = new Map<string, Map<string, ViaLink>>();

   const record = (parent: NeighborNode, start: number, end: number, linkDirection: LinkDirection, edge: AdjacentEdge): void => {
      const key = passageKey(start, end);

      if (firstHopKeys.has(key) || (start <= centerId && centerId <= end) || key === parent.key) {
         return;
      }

      let node = candidates.get(key);

      if (!node) {
         node = emptyNode(key, start, end, 2);
         candidates.set(key, node);
         viaByNode.set(key, new Map());
      }

      addEdge(node, linkDirection, edge);

      const via = viaByNode.get(key) as Map<string, ViaLink>;
      const existing = via.get(parent.key);

      if (existing) {
         existing.count += 1;
         existing.direction = existing.direction === linkDirection ? linkDirection : 'both';
      } else {
         via.set(parent.key, { from: parent.key, direction: linkDirection, count: 1 });
      }
   };

   for (const parent of firstHop) {
      if (direction !== 'incoming') {
         for (const edge of lookup.outgoing(parent.verseId) ?? []) {
            if (matchesKind(edge, edgeKind)) {
               record(parent, edge.targetStart, edgeRangeEnd(edge), 'outgoing', edge);
            }
         }
      }

      if (direction !== 'outgoing') {
         for (const edge of lookup.incoming(parent.verseId) ?? []) {
            if (matchesKind(edge, edgeKind)) {
               record(parent, edge.source, edge.source, 'incoming', edge);
            }
         }
      }
   }

   for (const node of candidates.values()) {
      node.via = Array.from((viaByNode.get(node.key) as Map<string, ViaLink>).values());
      node.score = node.via.length;
   }

   return Array.from(candidates.values()).sort(
      (left, right) => right.score - left.score || right.edges.length - left.edges.length || byCanonicalOrder(left, right),
   );
}

export interface EgoGraphInput {
   centerId: number;
   firstHop: readonly NeighborNode[];
   /** Output of `rankSecondHop` (already ranked); omit or pass `[]` at depth 1. */
   secondHop?: readonly NeighborNode[];
   /** Second-hop nodes to draw. */
   secondHopLimit?: number;
   /** First-hop nodes to draw; the best connected ones are kept when over the cap. */
   maxFirstHop?: number;
}

/**
 * The graph that is actually drawn. Both caps are enforced here, and links only ever join
 * nodes that are present, so the counts shown to the user always match the picture.
 */
export function buildEgoGraph({
   centerId,
   firstHop,
   secondHop = [],
   secondHopLimit = SECOND_HOP_PAGE,
   maxFirstHop = MAX_FIRST_HOP_GRAPH_NODES,
}: EgoGraphInput): EgoGraph {
   const centerKey = passageKey(centerId);
   let shownFirst = firstHop.slice();

   if (shownFirst.length > maxFirstHop) {
      shownFirst = shownFirst
         .slice()
         .sort((left, right) => right.edges.length - left.edges.length || byCanonicalOrder(left, right))
         .slice(0, Math.max(0, maxFirstHop))
         .sort(byCanonicalOrder);
   }

   const shownFirstKeys = new Set(shownFirst.map((node) => node.key));
   const shownSecond = secondHop
      .filter((node) => node.via.some((via) => shownFirstKeys.has(via.from)))
      .slice(0, Math.max(0, secondHopLimit));
   const links: EgoLink[] = [];

   for (const node of shownFirst) {
      links.push({
         key: `${centerKey}>${node.key}`,
         a: centerKey,
         b: node.key,
         direction: node.direction,
         depth: 1,
         count: node.edges.length,
         studyNoteOnly: node.crossRefCount === 0 && node.studyNoteCount > 0,
      });
   }

   for (const node of shownSecond) {
      for (const via of node.via) {
         if (!shownFirstKeys.has(via.from)) {
            continue;
         }

         links.push({
            key: `${via.from}>${node.key}`,
            a: via.from,
            b: node.key,
            direction: via.direction,
            depth: 2,
            count: via.count,
            studyNoteOnly: node.crossRefCount === 0 && node.studyNoteCount > 0,
         });
      }
   }

   return {
      centerId,
      centerKey,
      nodes: [ ...shownFirst, ...shownSecond ],
      links,
      firstHopTotal: firstHop.length,
      firstHopShown: shownFirst.length,
      secondHopTotal: secondHop.length,
      secondHopShown: shownSecond.length,
   };
}

export interface AdjacencyFile {
   mode: 'source' | 'target';
   bookNumber: number;
}

export function adjacencyFileKey(file: AdjacencyFile): string {
   return `${file.mode}:${file.bookNumber}`;
}

export interface AdjacencyPlanInput {
   firstHop: readonly NeighborNode[];
   /** Book of a verse id, or `null` when the verse is unknown (it is then skipped, never guessed). */
   bookOf: (verseId: number) => number | null;
   direction: DirectionMode;
   /** Files already in memory (`adjacencyFileKey`); they cost nothing. */
   loaded?: ReadonlySet<string>;
   /** Files this plan may fetch. */
   maxFiles: number;
}

export interface AdjacencyPlan {
   /** Files to fetch now, most useful first (never more than `maxFiles`). */
   files: AdjacencyFile[];
   /** Files left out by the budget. */
   deferred: AdjacencyFile[];
   /** First-hop nodes whose adjacency is (or will be) fully available after `files` load. */
   coveredNodes: number;
   totalNodes: number;
}

/**
 * Which per-book adjacency files a depth-2 view needs, most first-hop verses first, cut at
 * the file budget. Books are loaded whole (all modes the direction needs) or not at all.
 */
export function planAdjacencyFiles({ firstHop, bookOf, direction, loaded, maxFiles }: AdjacencyPlanInput): AdjacencyPlan {
   const nodesPerBook = new Map<number, number>();
   let totalNodes = 0;

   for (const node of firstHop) {
      const bookNumber = bookOf(node.verseId);

      if (bookNumber === null) {
         continue;
      }

      totalNodes += 1;
      nodesPerBook.set(bookNumber, (nodesPerBook.get(bookNumber) ?? 0) + 1);
   }

   const modes: Array<AdjacencyFile['mode']> =
      direction === 'outgoing' ? [ 'source' ] : direction === 'incoming' ? [ 'target' ] : [ 'source', 'target' ];
   const books = Array.from(nodesPerBook.entries()).sort((left, right) => right[1] - left[1] || left[0] - right[0]);
   const files: AdjacencyFile[] = [];
   const deferred: AdjacencyFile[] = [];
   let coveredNodes = 0;

   for (const [ bookNumber, count ] of books) {
      const missing = modes
         .map((mode) => ({ mode, bookNumber }))
         .filter((file) => !loaded?.has(adjacencyFileKey(file)));

      if (files.length + missing.length <= maxFiles) {
         files.push(...missing);
         coveredNodes += count;
      } else {
         deferred.push(...missing);
      }
   }

   return { files, deferred, coveredNodes, totalNodes };
}

/** Verse ids of a passage that exist in the dataset, capped so a bad range cannot explode. */
export function passageVerseIds(
   start: number,
   end: number,
   has: (verseId: number) => boolean,
   max: number = MAX_RANGE_VERSES,
): number[] {
   const last = Math.min(Math.max(start, end), start + max - 1);
   const ids: number[] = [];

   for (let verseId = start; verseId <= last; verseId += 1) {
      if (has(verseId)) {
         ids.push(verseId);
      }
   }

   return ids.length > 0 ? ids : [ start ];
}

export interface PassageLabelOptions {
   /** Replaces the book name, e.g. with an abbreviation for graph labels. */
   bookName?: (bookNumber: number) => string | undefined;
}

type LabelRef = Pick<VerseRef, 'bookNumber' | 'chapterNumber' | 'verseNumber' | 'label'>;

function verseLabel(ref: LabelRef, options?: PassageLabelOptions): string {
   const name = options?.bookName?.(ref.bookNumber);

   return name ? `${name} ${ref.chapterNumber}:${ref.verseNumber}` : ref.label;
}

/**
 * Citation for a passage: "John 3:16", "Psalm 104:1-35", "John 7:53–8:11" or, across
 * books, "Malachi 4:6 – Matthew 1:1". Unknown verses fall back to "Verse <id>".
 */
export function formatPassageLabel(
   start: number,
   end: number,
   lookup: (verseId: number) => LabelRef | undefined,
   options?: PassageLabelOptions,
): string {
   const first = lookup(start);

   if (!first) {
      return `Verse ${start}`;
   }

   const label = verseLabel(first, options);
   const last = end > start ? lookup(end) : undefined;

   if (!last || end <= start) {
      return label;
   }

   if (last.bookNumber !== first.bookNumber) {
      return `${label} – ${verseLabel(last, options)}`;
   }

   if (last.chapterNumber !== first.chapterNumber) {
      return `${label}–${last.chapterNumber}:${last.verseNumber}`;
   }

   return `${label}-${last.verseNumber}`;
}

export interface BookGroup<TNode> {
   bookNumber: number;
   nodes: TNode[];
}

/** Groups nodes by the book of their first verse, books in canonical order. Unknown verses are dropped. */
export function groupByBook<TNode extends Pick<NeighborNode, 'verseId'>>(
   nodes: readonly TNode[],
   bookOf: (verseId: number) => number | null,
): Array<BookGroup<TNode>> {
   const groups = new Map<number, TNode[]>();

   for (const node of nodes) {
      const bookNumber = bookOf(node.verseId);

      if (bookNumber === null) {
         continue;
      }

      const group = groups.get(bookNumber);

      if (group) {
         group.push(node);
      } else {
         groups.set(bookNumber, [ node ]);
      }
   }

   return Array.from(groups.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([ bookNumber, groupNodes ]) => ({ bookNumber, nodes: groupNodes }));
}

/**
 * Short, unique book labels for graph nodes, derived from the dataset's own names so they work
 * in any language: "1 Corinthians" → "1 Cor.", "Giovanni" → "Giov.", "John" → "John".
 */
export function abbreviateBookNames(books: ReadonlyArray<{ bookNumber: number; name: string }>): Map<number, string> {
   const parts = books.map((book) => {
      const match = /^(\d+\s+)?(.*)$/.exec(book.name.trim()) as RegExpExecArray;
      const prefix = match[1] ?? '';
      const word = (match[2] ?? '').split(/\s+/)[0] ?? '';

      return { bookNumber: book.bookNumber, prefix, word, single: !/\s/.test(match[2] ?? '') };
   });
   const make = (part: (typeof parts)[number], length: number): string => {
      if (part.word.length <= Math.max(length + 1, 5)) {
         return `${part.prefix}${part.word}`;
      }

      return `${part.prefix}${part.word.slice(0, length)}.`;
   };
   const lengths = new Map(parts.map((part) => [ part.bookNumber, 3 ]));
   let result = new Map<number, string>();

   for (let round = 0; round < 8; round += 1) {
      result = new Map(parts.map((part) => [ part.bookNumber, make(part, lengths.get(part.bookNumber) as number) ]));

      const seen = new Map<string, number[]>();

      for (const [ bookNumber, label ] of result) {
         seen.set(label, [ ...(seen.get(label) ?? []), bookNumber ]);
      }

      const clashes = Array.from(seen.values()).filter((group) => group.length > 1);

      if (clashes.length === 0) {
         break;
      }

      for (const group of clashes) {
         for (const bookNumber of group) {
            lengths.set(bookNumber, (lengths.get(bookNumber) as number) + 1);
         }
      }
   }

   return result;
}
