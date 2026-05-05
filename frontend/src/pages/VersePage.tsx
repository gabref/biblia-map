import { ArrowDownToLine, ArrowUpFromLine, BookOpenCheck, GitBranch, Info, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorState } from '../components/ErrorState';
import { FilterPanel } from '../components/FilterPanel';
import { LoadingShimmer } from '../components/LoadingShimmer';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import {
   edgeKindCode,
   loadBooks,
   loadChapters,
   loadManifest,
   loadSourceAdjacency,
   loadTargetAdjacency,
   loadVerseIndex,
   loadVerseTextBook,
} from '../data/generated';
import { useAsyncData } from '../hooks/useAsyncData';
import type {
   AdjacentEdge,
   Book,
   Chapter,
   DirectionMode,
   EdgeKindFilter,
   SourceAdjacency,
   TargetAdjacency,
   VerseIndex,
   VerseRef,
   VerseTextBook,
} from '../types/generated';
import { edgeKindLabel, formatNumber } from '../utils/format';

type LinkDirection = 'outgoing' | 'incoming';

interface GraphNode {
   verseId: number;
   label: string;
   depth: number;
   incomingCount: number;
   outgoingCount: number;
   edges: GraphLink[];
}

interface GraphLink {
   source: number;
   target: number;
   direction: LinkDirection;
   kind: number;
   edge: AdjacentEdge;
}

interface Neighborhood {
   nodes: GraphNode[];
   links: GraphLink[];
}

interface VersePageProps {
   datasetId: string;
}

const edgeKindOptions = [
   { value: 'combined', label: 'Combined' },
   { value: 'crossrefs', label: 'Cross refs' },
   { value: 'study-notes', label: 'Study notes' },
] satisfies Array<{ value: EdgeKindFilter; label: string }>;

const directionOptions = [
   { value: 'all', label: 'All' },
   { value: 'outgoing', label: 'Outgoing' },
   { value: 'incoming', label: 'Incoming' },
] satisfies Array<{ value: DirectionMode; label: string }>;

export function VersePage({ datasetId }: VersePageProps): React.ReactElement {
   const [bookNumber, setBookNumber] = useState(45);
   const [chapterNumber, setChapterNumber] = useState(12);
   const [verseNumber, setVerseNumber] = useState(12);
   const [edgeKind, setEdgeKind] = useState<EdgeKindFilter>('combined');
   const [direction, setDirection] = useState<DirectionMode>('all');
   const [layers, setLayers] = useState(1);
   const [selectedRelatedVerseId, setSelectedRelatedVerseId] = useState<number | null>(null);
   const baseDataState = useAsyncData(
      async () => {
         const [ manifest, books, chapters, verseIndex ] = await Promise.all([
            loadManifest(datasetId),
            loadBooks(datasetId),
            loadChapters(datasetId),
            loadVerseIndex(datasetId),
         ]);

         return { manifest, books, chapters, verseIndex };
      },
      [ datasetId ],
   );
   const chaptersForBook = useMemo(
      () => baseDataState.data?.chapters.filter((chapter) => chapter.bookNumber === bookNumber) ?? [],
      [ baseDataState.data?.chapters, bookNumber ],
   );
   const selectedChapter =
      chaptersForBook.find((chapter) => chapter.chapterNumber === chapterNumber) ?? chaptersForBook[0] ?? null;
   const selectedVerse =
      selectedChapter?.verses.find((verse) => verse.verseNumber === verseNumber) ?? selectedChapter?.verses[0] ?? null;
   const selectedVerseRef = selectedVerse
      ? baseDataState.data?.verseIndex[String(selectedVerse.jwpubVerseId)] ?? null
      : null;
   const neighborhoodState = useAsyncData(
      async () => {
         if (!baseDataState.data || !selectedVerseRef) {
            return { neighborhood: { nodes: [], links: [] }, verseTextByBook: new Map<number, VerseTextBook>() };
         }

         const neighborhood = await loadNeighborhood({
            datasetId,
            selectedVerseId: selectedVerseRef.jwpubVerseId,
            direction,
            edgeKind,
            layers,
            books: baseDataState.data.books,
            verseIndex: baseDataState.data.verseIndex,
         });
         const verseTextByBook = await loadVerseTextForNeighborhood(
            datasetId,
            baseDataState.data.books,
            baseDataState.data.verseIndex,
            [ selectedVerseRef.jwpubVerseId, ...neighborhood.nodes.map((node) => node.verseId) ],
            baseDataState.data.manifest.hasVerseText,
         );

         return { neighborhood, verseTextByBook };
      },
      [ baseDataState.data, datasetId, direction, edgeKind, layers, selectedVerseRef?.jwpubVerseId ],
   );
   const nodes = neighborhoodState.data?.neighborhood.nodes ?? [];
   const links = neighborhoodState.data?.neighborhood.links ?? [];
   const selectedRelated = nodes.find((node) => node.verseId === selectedRelatedVerseId) ?? nodes[0] ?? null;

   useEffect(() => {
      if (!selectedChapter) {
         return;
      }

      if (!selectedChapter.verses.some((verse) => verse.verseNumber === verseNumber)) {
         setVerseNumber(selectedChapter.verses[0]?.verseNumber ?? 1);
      }
   }, [ selectedChapter, verseNumber ]);

   useEffect(() => {
      if (!chaptersForBook.some((chapter) => chapter.chapterNumber === chapterNumber)) {
         setChapterNumber(chaptersForBook[0]?.chapterNumber ?? 1);
      }
   }, [ chapterNumber, chaptersForBook ]);

   useEffect(() => {
      setSelectedRelatedVerseId(null);
   }, [ selectedVerse?.jwpubVerseId, direction, edgeKind, layers ]);

   if (baseDataState.error) {
      return <ErrorState title="Verse data is unavailable" error={baseDataState.error} />;
   }

   if (neighborhoodState.error) {
      return <ErrorState title="Adjacency data is unavailable" error={neighborhoodState.error} />;
   }

   if (!baseDataState.data || baseDataState.showLoading) {
      return <LoadingShimmer rows={7} />;
   }

   const selectedText = selectedVerseRef
      ? lookupVerseText(neighborhoodState.data?.verseTextByBook, selectedVerseRef, baseDataState.data.books)
      : null;

   return (
      <div className="page-stack">
         <PageHeader
            eyebrow="Local graph"
            title="Verse explorer"
            description="Select one verse and load only the adjacency files needed for the visible neighborhood."
         />

         <FilterPanel title="Verse selection">
            <label className="select-control">
               <span>Book</span>
               <select
                  value={bookNumber}
                  onChange={(event) => {
                     setBookNumber(Number(event.target.value));
                     setChapterNumber(1);
                     setVerseNumber(1);
                  }}
               >
                  {baseDataState.data.books.map((book) => (
                     <option key={book.bookNumber} value={book.bookNumber}>
                        {book.name}
                     </option>
                  ))}
               </select>
            </label>

            <label className="select-control">
               <span>Chapter</span>
               <select value={chapterNumber} onChange={(event) => setChapterNumber(Number(event.target.value))}>
                  {chaptersForBook.map((chapter) => (
                     <option key={chapter.chapterNumber} value={chapter.chapterNumber}>
                        {chapter.chapterNumber}
                     </option>
                  ))}
               </select>
            </label>

            <label className="select-control">
               <span>Verse</span>
               <select value={verseNumber} onChange={(event) => setVerseNumber(Number(event.target.value))}>
                  {selectedChapter?.verses.map((verse) => (
                     <option key={verse.jwpubVerseId} value={verse.verseNumber}>
                        {verse.verseNumber}
                     </option>
                  ))}
               </select>
            </label>

            <SegmentedControl label="Direction" options={directionOptions} value={direction} onChange={setDirection} />
            <SegmentedControl label="Reference type" options={edgeKindOptions} value={edgeKind} onChange={setEdgeKind} />
            <label className="range-control compact-range">
               <span>Layers</span>
               <input
                  type="range"
                  min={1}
                  max={3}
                  step={1}
                  value={layers}
                  onChange={(event) => setLayers(Number(event.target.value))}
               />
               <strong>{layers}</strong>
            </label>
         </FilterPanel>

         <section className="verse-layout">
            <article className="graph-frame verse-frame">
               <div className="graph-toolbar">
                  <span>
                     <Search size={17} />
                     {selectedVerseRef?.label ?? 'Select a verse'}
                  </span>
                  <strong>
                     {formatNumber(links.length)} links across {formatNumber(nodes.length)} verses
                  </strong>
               </div>
               {selectedText ? <p className="selected-verse-text">{selectedText}</p> : null}
               {neighborhoodState.showLoading ? (
                  <LoadingShimmer rows={4} />
               ) : (
                  <VerseGraph
                     selectedVerse={selectedVerseRef}
                     nodes={nodes}
                     links={links}
                     selectedRelatedVerseId={selectedRelated?.verseId ?? null}
                     onSelect={setSelectedRelatedVerseId}
                  />
               )}
            </article>

            <aside className="side-panel">
               <div className="panel-heading">
                  <Info size={20} />
                  <div>
                     <h2>Connection detail</h2>
                     <p>Reference direction, type, and verse text for the selected node.</p>
                  </div>
               </div>
               <ConnectionDetail
                  selectedVerse={selectedVerseRef}
                  relatedNode={selectedRelated}
                  books={baseDataState.data.books}
                  verseIndex={baseDataState.data.verseIndex}
                  verseTextByBook={neighborhoodState.data?.verseTextByBook}
                  hasVerseText={baseDataState.data.manifest.hasVerseText}
               />
            </aside>
         </section>
      </div>
   );
}

interface LoadNeighborhoodInput {
   datasetId: string;
   selectedVerseId: number;
   direction: DirectionMode;
   edgeKind: EdgeKindFilter;
   layers: number;
   books: Book[];
   verseIndex: VerseIndex;
}

async function loadNeighborhood({
   datasetId,
   selectedVerseId,
   direction,
   edgeKind,
   layers,
   books,
   verseIndex,
}: LoadNeighborhoodInput): Promise<Neighborhood> {
   const sourceCache = new Map<number, SourceAdjacency>();
   const targetCache = new Map<number, TargetAdjacency>();
   const nodes = new Map<number, GraphNode>();
   const links: GraphLink[] = [];
   let frontier = new Set([ selectedVerseId ]);
   const seen = new Set([ selectedVerseId ]);
   const kindCode = edgeKindCode(edgeKind);
   const maxNodes = 140;

   for (let depth = 1; depth <= layers && frontier.size > 0 && nodes.size < maxNodes; depth += 1) {
      const nextFrontier = new Set<number>();
      const sourceAdjacency = direction !== 'incoming'
         ? await loadAdjacencyForFrontier(datasetId, books, verseIndex, frontier, sourceCache, 'source')
         : new Map<number, SourceAdjacency>();
      const targetAdjacency = direction !== 'outgoing'
         ? await loadAdjacencyForFrontier(datasetId, books, verseIndex, frontier, targetCache, 'target')
         : new Map<number, TargetAdjacency>();

      for (const verseId of frontier) {
         if (direction !== 'incoming') {
            const outgoing = sourceAdjacency.get(bookNumberForVerse(verseIndex, verseId))?.[String(verseId)]?.outgoing ?? [];
            collectLinks(outgoing, 'outgoing', verseId, depth);
         }

         if (direction !== 'outgoing') {
            const incoming = targetAdjacency.get(bookNumberForVerse(verseIndex, verseId))?.[String(verseId)]?.incoming ?? [];
            collectLinks(incoming, 'incoming', verseId, depth);
         }
      }

      frontier = nextFrontier;

      function collectLinks(edges: AdjacentEdge[], linkDirection: LinkDirection, centerVerseId: number, depth: number): void {
         for (const edge of edges) {
            if (kindCode !== null && edge.kind !== kindCode) {
               continue;
            }

            const relatedVerseId = linkDirection === 'outgoing' ? edge.targetStart : edge.source;
            const link: GraphLink = {
               source: linkDirection === 'outgoing' ? centerVerseId : relatedVerseId,
               target: linkDirection === 'outgoing' ? relatedVerseId : centerVerseId,
               direction: linkDirection,
               kind: edge.kind,
               edge,
            };
            links.push(link);
            upsertNode(nodes, relatedVerseId, depth, verseIndex, link);

            if (!seen.has(relatedVerseId) && nodes.size < maxNodes) {
               seen.add(relatedVerseId);
               nextFrontier.add(relatedVerseId);
            }
         }
      }
   }

   return {
      nodes: Array.from(nodes.values()).sort((left, right) => left.depth - right.depth || right.edges.length - left.edges.length),
      links,
   };
}

async function loadAdjacencyForFrontier<TMode extends 'source' | 'target'>(
   datasetId: string,
   books: Book[],
   verseIndex: VerseIndex,
   frontier: Set<number>,
   cache: TMode extends 'source' ? Map<number, SourceAdjacency> : Map<number, TargetAdjacency>,
   mode: TMode,
): Promise<TMode extends 'source' ? Map<number, SourceAdjacency> : Map<number, TargetAdjacency>> {
   const bookNumbers = Array.from(frontier).map((verseId) => bookNumberForVerse(verseIndex, verseId));
   const uniqueBookNumbers = Array.from(new Set(bookNumbers));

   await Promise.all(
      uniqueBookNumbers.map(async (bookNumber) => {
         if (cache.has(bookNumber)) {
            return;
         }

         const book = books[bookNumber - 1];
         if (!book) {
            return;
         }

         const adjacency = mode === 'source'
            ? await loadSourceAdjacency(datasetId, book)
            : await loadTargetAdjacency(datasetId, book);
         cache.set(bookNumber, adjacency as never);
      }),
   );

   return cache;
}

function upsertNode(
   nodes: Map<number, GraphNode>,
   verseId: number,
   depth: number,
   verseIndex: VerseIndex,
   link: GraphLink,
): void {
   const existing = nodes.get(verseId);

   if (existing) {
      existing.depth = Math.min(existing.depth, depth);
      existing.incomingCount += link.direction === 'incoming' ? 1 : 0;
      existing.outgoingCount += link.direction === 'outgoing' ? 1 : 0;
      existing.edges.push(link);
      return;
   }

   nodes.set(verseId, {
      verseId,
      label: verseIndex[String(verseId)]?.label ?? `Verse ${verseId}`,
      depth,
      incomingCount: link.direction === 'incoming' ? 1 : 0,
      outgoingCount: link.direction === 'outgoing' ? 1 : 0,
      edges: [ link ],
   });
}

function bookNumberForVerse(verseIndex: VerseIndex, verseId: number): number {
   return verseIndex[String(verseId)]?.bookNumber ?? 1;
}

async function loadVerseTextForNeighborhood(
   datasetId: string,
   books: Book[],
   verseIndex: VerseIndex,
   verseIds: number[],
   hasVerseText: boolean,
): Promise<Map<number, VerseTextBook>> {
   const textByBook = new Map<number, VerseTextBook>();

   if (!hasVerseText) {
      return textByBook;
   }

   const bookNumbers = Array.from(new Set(verseIds.map((verseId) => bookNumberForVerse(verseIndex, verseId))));
   await Promise.all(
      bookNumbers.map(async (bookNumber) => {
         const book = books[bookNumber - 1];
         if (!book) {
            return;
         }

         textByBook.set(bookNumber, await loadVerseTextBook(datasetId, book));
      }),
   );

   return textByBook;
}

interface VerseGraphProps {
   selectedVerse: VerseRef | null;
   nodes: GraphNode[];
   links: GraphLink[];
   selectedRelatedVerseId: number | null;
   onSelect: (verseId: number) => void;
}

function VerseGraph({
   selectedVerse,
   nodes,
   links,
   selectedRelatedVerseId,
   onSelect,
}: VerseGraphProps): React.ReactElement {
   const positionedNodes = positionNodes(nodes);
   const positionById = new Map(positionedNodes.map((node) => [ node.verseId, node ]));

   return (
      <svg className="verse-graph" viewBox="-420 -320 840 640" role="img" aria-label="Selected verse local reference graph">
         {links.slice(0, 220).map((link, index) => {
            const source = link.source === selectedVerse?.jwpubVerseId ? { x: 0, y: 0 } : positionById.get(link.source);
            const target = link.target === selectedVerse?.jwpubVerseId ? { x: 0, y: 0 } : positionById.get(link.target);

            if (!source || !target) {
               return null;
            }

            return (
               <path
                  key={`${link.source}-${link.target}-${index}`}
                  d={`M ${source.x} ${source.y} L ${target.x} ${target.y}`}
                  className={link.direction === 'outgoing' ? 'verse-link outgoing' : 'verse-link incoming'}
               />
            );
         })}
         {positionedNodes.map((node) => {
            const active = node.verseId === selectedRelatedVerseId;

            return (
               <g key={node.verseId}>
                  <circle
                     cx={node.x}
                     cy={node.y}
                     r={active ? 24 : node.depth === 1 ? 18 : 13}
                     className={nodeClassName(node, active)}
                     onClick={() => onSelect(node.verseId)}
                  />
                  <text x={node.x} y={node.y + 34} textAnchor="middle" className="verse-node-label">
                     {shortVerseLabel(node.label)}
                  </text>
               </g>
            );
         })}
         <circle cx={0} cy={0} r={46} className="center-node" />
         <text x={0} y={-4} textAnchor="middle" className="center-label">
            {selectedVerse ? selectedVerse.label.split(' ')[0] : 'Verse'}
         </text>
         <text x={0} y={16} textAnchor="middle" className="center-label small">
            {selectedVerse ? selectedVerse.label.replace(`${selectedVerse.label.split(' ')[0]} `, '') : ''}
         </text>
      </svg>
   );
}

interface PositionedNode extends GraphNode {
   x: number;
   y: number;
}

function positionNodes(nodes: GraphNode[]): PositionedNode[] {
   const byDepth = new Map<number, GraphNode[]>();

   for (const node of nodes.slice(0, 140)) {
      byDepth.set(node.depth, [ ...(byDepth.get(node.depth) ?? []), node ]);
   }

   return Array.from(byDepth.entries()).flatMap(([ depth, depthNodes ]) => {
      const radius = 145 + (depth - 1) * 115;

      return depthNodes.map((node, index) => {
         const angle = (index / Math.max(depthNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;

         return {
            ...node,
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
         };
      });
   });
}

function nodeClassName(node: GraphNode, active: boolean): string {
   const directionClass = node.incomingCount > 0 && node.outgoingCount > 0
      ? 'both'
      : node.incomingCount > 0
         ? 'incoming'
         : 'outgoing';

   return active ? `verse-node ${directionClass} active` : `verse-node ${directionClass}`;
}

interface ConnectionDetailProps {
   selectedVerse: VerseRef | null;
   relatedNode: GraphNode | null;
   books: Book[];
   verseIndex: VerseIndex;
   verseTextByBook?: Map<number, VerseTextBook>;
   hasVerseText: boolean;
}

function ConnectionDetail({
   selectedVerse,
   relatedNode,
   books,
   verseIndex,
   verseTextByBook,
   hasVerseText,
}: ConnectionDetailProps): React.ReactElement {
   if (!selectedVerse) {
      return <p className="muted-copy">No verse selected.</p>;
   }

   if (!relatedNode) {
      return (
         <div className="empty-state">
            <BookOpenCheck size={28} />
            <p>No references match the current filters.</p>
         </div>
      );
   }

   const firstLink = relatedNode.edges[0];
   const sourceLabel = verseIndex[String(firstLink.source)]?.label ?? `Verse ${firstLink.source}`;
   const targetLabel = verseIndex[String(firstLink.target)]?.label ?? `Verse ${firstLink.target}`;
   const relatedRef = verseIndex[String(relatedNode.verseId)] ?? null;
   const relatedText = relatedRef ? lookupVerseText(verseTextByBook, relatedRef, books) : null;

   return (
      <div className="detail-stack">
         <div className="detail-verse">
            {firstLink.direction === 'outgoing' ? <ArrowUpFromLine size={18} /> : <ArrowDownToLine size={18} />}
            <div>
               <span>{sourceLabel}</span>
               <strong>{targetLabel}</strong>
            </div>
         </div>
         {relatedText ? <p className="verse-copy">{relatedText}</p> : null}
         {!relatedText && hasVerseText ? <p className="muted-copy">Verse text is not available for this node yet.</p> : null}
         {!hasVerseText ? <p className="muted-copy">This dataset was generated without verse text.</p> : null}
         <dl className="metadata-list">
            <div>
               <dt>Reference type</dt>
               <dd>{relatedNode.edges.map((link) => edgeKindLabel(link.kind)).filter(unique).join(', ')}</dd>
            </div>
            <div>
               <dt>Direction</dt>
               <dd>{relatedNode.incomingCount > 0 && relatedNode.outgoingCount > 0 ? 'Incoming and outgoing' : firstLink.direction}</dd>
            </div>
            <div>
               <dt>Connections</dt>
               <dd>{formatNumber(relatedNode.edges.length)}</dd>
            </div>
            <div>
               <dt>Study note</dt>
               <dd>{relatedNode.edges.some((link) => link.edge.commentaryId) ? 'Includes study-note references' : 'No'}</dd>
            </div>
         </dl>
      </div>
   );
}

function lookupVerseText(
   textByBook: Map<number, VerseTextBook> | undefined,
   verse: VerseRef,
   books: Book[],
): string | null {
   const book = books[verse.bookNumber - 1];

   if (!book) {
      return null;
   }

   return textByBook?.get(book.bookNumber)?.[String(verse.jwpubVerseId)]?.text ?? null;
}

function shortVerseLabel(label: string): string {
   const parts = label.split(' ');

   if (parts.length <= 2) {
      return label;
   }

   return `${parts.slice(0, -1).join(' ').slice(0, 16)} ${parts.at(-1)}`;
}

function unique(value: string, index: number, values: string[]): boolean {
   return values.indexOf(value) === index;
}

interface BuildRelatedNodesInput {
   selectedVerseId: number;
   adjacency: SourceAdjacency | TargetAdjacency | null;
   direction: DirectionMode;
   edgeKind: EdgeKindFilter;
   verseIndex: Record<string, VerseRef>;
}

interface RelatedNodeCompat {
   verseId: number;
   label: string;
   count: number;
   edges: AdjacentEdge[];
}

export function buildRelatedNodes({
   selectedVerseId,
   adjacency,
   direction,
   edgeKind,
   verseIndex,
}: BuildRelatedNodesInput): RelatedNodeCompat[] {
   if (!adjacency) {
      return [];
   }

   const bucket = adjacency[String(selectedVerseId)];
   const edges =
      direction === 'incoming'
         ? ((bucket as { incoming?: AdjacentEdge[] } | undefined)?.incoming ?? [])
         : ((bucket as { outgoing?: AdjacentEdge[] } | undefined)?.outgoing ?? []);
   const kindCode = edgeKindCode(edgeKind);
   const grouped = new Map<number, AdjacentEdge[]>();

   for (const edge of edges) {
      if (kindCode !== null && edge.kind !== kindCode) {
         continue;
      }

      const relatedVerseId = direction === 'incoming' ? edge.source : edge.targetStart;
      const existing = grouped.get(relatedVerseId) ?? [];
      existing.push(edge);
      grouped.set(relatedVerseId, existing);
   }

   return Array.from(grouped.entries())
      .map(([ verseId, nodeEdges ]) => ({
         verseId,
         label: verseIndex[String(verseId)]?.label ?? `Verse ${verseId}`,
         count: nodeEdges.length,
         edges: nodeEdges,
      }))
      .sort((left, right) => right.count - left.count || left.verseId - right.verseId)
      .slice(0, 36);
}
