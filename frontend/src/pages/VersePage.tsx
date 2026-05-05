import {
   ArrowDownToLine,
   ArrowUpFromLine,
   BookOpenCheck,
   GitBranch,
   Info,
   Maximize2,
   Search,
   ZoomIn,
   ZoomOut,
} from 'lucide-react';
import {
   forceCenter,
   forceCollide,
   forceLink,
   forceManyBody,
   forceRadial,
   forceSimulation,
   type Simulation,
   type SimulationLinkDatum,
   type SimulationNodeDatum,
} from 'd3-force';
import { useEffect, useMemo, useRef, useState } from 'react';

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

interface ForceGraphNode extends SimulationNodeDatum {
   verseId: number;
   label: string;
   depth: number;
   incomingCount: number;
   outgoingCount: number;
   edges: GraphLink[];
   selected: boolean;
}

interface ForceGraphLink extends SimulationLinkDatum<ForceGraphNode> {
   source: number | string | ForceGraphNode;
   target: number | string | ForceGraphNode;
   direction: LinkDirection;
   kind: number;
   edge: AdjacentEdge;
   key: string;
}

interface DragState {
   verseId: number;
   pointerId: number;
   offsetX: number;
   offsetY: number;
}

interface PanState {
   pointerId: number;
   startX: number;
   startY: number;
   viewX: number;
   viewY: number;
}

interface GraphViewTransform {
   x: number;
   y: number;
   scale: number;
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
   const selectedDetailVerseId = selectedRelatedVerseId ?? selectedVerseRef?.jwpubVerseId ?? null;
   const selectedRelated = nodes.find((node) => node.verseId === selectedDetailVerseId) ?? null;

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
      setSelectedRelatedVerseId(selectedVerse?.jwpubVerseId ?? null);
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
               <div className="direction-legend" aria-label="Reference direction color key">
                  <span>
                     <i className="direction-swatch outgoing" />
                     Outgoing from selected verse
                  </span>
                  <span>
                     <i className="direction-swatch incoming" />
                     Incoming to selected verse
                  </span>
               </div>
               {neighborhoodState.showLoading ? (
                  <LoadingShimmer rows={4} />
               ) : (
                  <VerseGraph
                     selectedVerse={selectedVerseRef}
                     nodes={nodes}
                     links={links}
                     layers={layers}
                     selectedRelatedVerseId={selectedDetailVerseId}
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
                  selectedDetailVerseId={selectedDetailVerseId}
                  relatedNode={selectedRelated}
                  links={links}
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
   layers: number;
   selectedRelatedVerseId: number | null;
   onSelect: (verseId: number) => void;
}

function VerseGraph({
   selectedVerse,
   nodes,
   links,
   layers,
   selectedRelatedVerseId,
   onSelect,
}: VerseGraphProps): React.ReactElement {
   const graphData = useMemo(
      () => buildForceGraph(selectedVerse, nodes, links),
      [ links, nodes, selectedVerse ],
   );
   const [renderNodes, setRenderNodes] = useState<ForceGraphNode[]>(graphData.nodes);
   const [renderLinks, setRenderLinks] = useState<ForceGraphLink[]>(graphData.links);
   const [view, setView] = useState<GraphViewTransform>({ x: 0, y: 0, scale: 1 });
   const simulationRef = useRef<Simulation<ForceGraphNode, ForceGraphLink> | null>(null);
   const dragStateRef = useRef<DragState | null>(null);
   const panStateRef = useRef<PanState | null>(null);
   const viewRef = useRef<GraphViewTransform>(view);

   useEffect(() => {
      viewRef.current = view;
   }, [ view ]);

   useEffect(() => {
      setView({ x: 0, y: 0, scale: 1 });
   }, [ graphData ]);

   useEffect(() => {
      const simulationNodes = graphData.nodes.map((node, index) => seedForceNode(node, index));
      const simulationLinks = graphData.links.map((link) => ({ ...link }));
      const layerSpread = Math.max(0, layers - 1);
      const simulation = forceSimulation<ForceGraphNode>(simulationNodes)
         .force(
            'link',
            forceLink<ForceGraphNode, ForceGraphLink>(simulationLinks)
               .id((node) => String(node.verseId))
               .distance((link) => {
                  const source = forceEndpoint(link.source);
                  const target = forceEndpoint(link.target);
                  const touchesSelected = Boolean(source?.selected || target?.selected);

                  return touchesSelected
                     ? 156 + layerSpread * 42
                     : link.direction === 'outgoing'
                        ? 124 + layerSpread * 22
                        : 142 + layerSpread * 24;
               })
               .strength((link) => (forceEndpoint(link.source)?.selected || forceEndpoint(link.target)?.selected ? 0.38 : 0.46)),
         )
         .force('charge', forceManyBody<ForceGraphNode>().strength((node) => (node.selected ? -780 - layerSpread * 260 : -250 - node.depth * 36)))
         .force('collide', forceCollide<ForceGraphNode>().radius((node) => nodeRadius(node) + 22 + layerSpread * 8))
         .force(
            'radial',
            forceRadial<ForceGraphNode>(
               (node) => (node.selected ? 0 : 136 + Math.min(node.depth, 3) * (112 + layerSpread * 30)),
               0,
               0,
            ).strength(0.42),
         )
         .force('center', forceCenter(0, 0))
         .alpha(0.95)
         .alphaDecay(0.032);

      simulationRef.current = simulation;
      simulation.tick(12);
      setRenderNodes([ ...simulationNodes ]);
      setRenderLinks([ ...simulationLinks ]);
      simulation.on('tick', () => {
         setRenderNodes([ ...simulationNodes ]);
         setRenderLinks([ ...simulationLinks ]);
      });

      return () => {
         simulation.stop();
         if (simulationRef.current === simulation) {
            simulationRef.current = null;
         }
      };
   }, [ graphData, layers ]);

   const handlePointerDown = (node: ForceGraphNode, event: React.PointerEvent<SVGGElement>): void => {
      event.stopPropagation();
      const point = svgPoint(event);
      const graphPoint = point ? viewToGraphPoint(point, viewRef.current) : null;
      const simulationNode = simulationRef.current?.nodes().find((candidate) => candidate.verseId === node.verseId);

      if (!graphPoint || !simulationNode) {
         onSelect(node.verseId);
         return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onSelect(node.verseId);
      simulationNode.fx = simulationNode.x ?? graphPoint.x;
      simulationNode.fy = simulationNode.y ?? graphPoint.y;
      dragStateRef.current = {
         verseId: node.verseId,
         pointerId: event.pointerId,
         offsetX: graphPoint.x - (simulationNode.x ?? 0),
         offsetY: graphPoint.y - (simulationNode.y ?? 0),
      };
      simulationRef.current?.alphaTarget(0.18).restart();
   };

   const handlePointerMove = (event: React.PointerEvent<SVGGElement>): void => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
         return;
      }

      const point = svgPoint(event);
      const graphPoint = point ? viewToGraphPoint(point, viewRef.current) : null;
      const simulation = simulationRef.current;
      const simulationNode = simulation?.nodes().find((candidate) => candidate.verseId === dragState.verseId);

      if (!graphPoint || !simulation || !simulationNode) {
         return;
      }

      simulationNode.fx = graphPoint.x - dragState.offsetX;
      simulationNode.fy = graphPoint.y - dragState.offsetY;
      simulationNode.x = simulationNode.fx;
      simulationNode.y = simulationNode.fy;
      simulation.alphaTarget(0.18).restart();
      setRenderNodes([ ...simulation.nodes() ]);
      setRenderLinks([ ...renderLinks ]);
   };

   const handlePointerUp = (event: React.PointerEvent<SVGGElement>): void => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
         return;
      }

      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      simulationRef.current?.alphaTarget(0);
   };

   const handleGraphPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
      if (event.button !== 0 || !isPanStartTarget(event.target)) {
         return;
      }

      const point = svgPoint(event);
      if (!point) {
         return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panStateRef.current = {
         pointerId: event.pointerId,
         startX: point.x,
         startY: point.y,
         viewX: viewRef.current.x,
         viewY: viewRef.current.y,
      };
   };

   const handleGraphPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId) {
         return;
      }

      const point = svgPoint(event);
      if (!point) {
         return;
      }

      setView((current) => ({
         ...current,
         x: panState.viewX + point.x - panState.startX,
         y: panState.viewY + point.y - panState.startY,
      }));
   };

   const handleGraphPointerUp = (event: React.PointerEvent<SVGSVGElement>): void => {
      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId) {
         return;
      }

      panStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
   };

   const zoomBy = (factor: number): void => {
      setView((current) => ({
         ...current,
         scale: clamp(current.scale * factor, 0.45, 2.8),
      }));
   };

   const resetView = (): void => {
      setView({ x: 0, y: 0, scale: 1 });
   };

   const handleWheel = (event: React.WheelEvent<SVGSVGElement>): void => {
      event.preventDefault();

      const point = svgPoint(event);
      if (!point) {
         return;
      }

      const current = viewRef.current;
      const nextScale = clamp(current.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.45, 2.8);
      const graphPoint = viewToGraphPoint(point, current);

      setView({
         scale: nextScale,
         x: point.x - graphPoint.x * nextScale,
         y: point.y - graphPoint.y * nextScale,
      });
   };

   return (
      <div className="verse-graph-shell">
         <div className="graph-controls" aria-label="Graph zoom controls">
            <button className="icon-button compact" type="button" onClick={() => zoomBy(1.18)} title="Zoom in">
               <ZoomIn size={16} />
            </button>
            <button className="icon-button compact" type="button" onClick={() => zoomBy(0.84)} title="Zoom out">
               <ZoomOut size={16} />
            </button>
            <button className="icon-button compact" type="button" onClick={resetView} title="Reset view">
               <Maximize2 size={16} />
            </button>
         </div>
         <svg
            className="verse-graph"
            viewBox="-480 -340 960 680"
            role="img"
            aria-label="Selected verse local reference graph"
            onPointerDown={handleGraphPointerDown}
            onPointerMove={handleGraphPointerMove}
            onPointerUp={handleGraphPointerUp}
            onPointerCancel={handleGraphPointerUp}
            onWheel={handleWheel}
         >
            <defs>
               <marker id="arrow-outgoing" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#d1a447" />
               </marker>
               <marker id="arrow-incoming" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#6f9fe8" />
               </marker>
            </defs>
            <rect className="graph-pan-surface" x="-480" y="-340" width="960" height="680" />
            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
               <g className="verse-link-layer">
                  {renderLinks.map((link) => {
                     const source = forceEndpoint(link.source);
                     const target = forceEndpoint(link.target);

                     if (
                        !source ||
                        !target ||
                        source.x === undefined ||
                        source.y === undefined ||
                        target.x === undefined ||
                        target.y === undefined
                     ) {
                        return null;
                     }

                     return (
                        <path
                           key={link.key}
                           d={straightLinkPath(source, target)}
                           className={link.direction === 'outgoing' ? 'verse-link outgoing' : 'verse-link incoming'}
                           markerEnd={link.direction === 'outgoing' ? 'url(#arrow-outgoing)' : 'url(#arrow-incoming)'}
                        />
                     );
                  })}
               </g>
               <g className="verse-node-layer">
                  {renderNodes.map((node) => {
                     const active = !node.selected && node.verseId === selectedRelatedVerseId;
                     const centerActive = node.selected && node.verseId === selectedRelatedVerseId;
                     const x = node.x ?? 0;
                     const y = node.y ?? 0;

                     return (
                        <g
                           key={node.verseId}
                           className="force-node-group"
                           transform={`translate(${x} ${y})`}
                           onPointerDown={(event) => handlePointerDown(node, event)}
                           onPointerMove={handlePointerMove}
                           onPointerUp={handlePointerUp}
                           onPointerCancel={handlePointerUp}
                        >
                           {node.selected ? (
                              <>
                                 <circle r={nodeRadius(node)} className={centerActive ? 'center-node active' : 'center-node'} />
                                 <text y={-4} textAnchor="middle" className="center-label">
                                    {selectedVerse ? selectedVerse.label.split(' ')[0] : 'Verse'}
                                 </text>
                                 <text y={16} textAnchor="middle" className="center-label small">
                                    {selectedVerse ? selectedVerse.label.replace(`${selectedVerse.label.split(' ')[0]} `, '') : ''}
                                 </text>
                              </>
                           ) : (
                              <>
                                 <circle
                                    r={active ? nodeRadius(node) + 5 : nodeRadius(node)}
                                    className={nodeClassName(node, active)}
                                    onClick={() => onSelect(node.verseId)}
                                 />
                                 <text y={nodeRadius(node) + 17} textAnchor="middle" className="verse-node-label">
                                    {shortVerseLabel(node.label)}
                                 </text>
                              </>
                           )}
                        </g>
                     );
                  })}
               </g>
            </g>
         </svg>
      </div>
   );
}

export function buildForceGraph(selectedVerse: VerseRef | null, nodes: GraphNode[], links: GraphLink[]): {
   nodes: ForceGraphNode[];
   links: ForceGraphLink[];
} {
   const nodeMap = new Map<number, ForceGraphNode>();

   if (selectedVerse) {
      nodeMap.set(selectedVerse.jwpubVerseId, {
         verseId: selectedVerse.jwpubVerseId,
         label: selectedVerse.label,
         depth: 0,
         incomingCount: 0,
         outgoingCount: 0,
         edges: [],
         selected: true,
      });
   }

   for (const node of nodes.slice(0, 139)) {
      nodeMap.set(node.verseId, { ...node, selected: false });
   }

   const graphLinks = links
      .filter((link) => nodeMap.has(link.source) && nodeMap.has(link.target))
      .slice(0, 280)
      .map((link, index) => ({
         source: String(link.source),
         target: String(link.target),
         direction: link.direction,
         kind: link.kind,
         edge: link.edge,
         key: `${link.source}-${link.target}-${link.kind}-${index}`,
      }));

   for (const link of graphLinks) {
      const source = nodeMap.get(Number(link.source));
      const target = nodeMap.get(Number(link.target));

      if (source?.selected) {
         source.outgoingCount += link.direction === 'outgoing' ? 1 : 0;
         source.incomingCount += link.direction === 'incoming' ? 1 : 0;
      }

      if (target?.selected) {
         target.outgoingCount += link.direction === 'outgoing' ? 1 : 0;
         target.incomingCount += link.direction === 'incoming' ? 1 : 0;
      }
   }

   return {
      nodes: Array.from(nodeMap.values()),
      links: graphLinks,
   };
}

function seedForceNode(node: ForceGraphNode, index: number): ForceGraphNode {
   if (node.selected) {
      return { ...node, x: 0, y: 0, fx: 0, fy: 0 };
   }

   const goldenAngle = Math.PI * (3 - Math.sqrt(5));
   const radius = 120 + Math.min(node.depth, 3) * 96;
   const angle = index * goldenAngle;

   return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
   };
}

function forceEndpoint(endpoint: number | string | ForceGraphNode | undefined): ForceGraphNode | null {
   if (typeof endpoint === 'object' && endpoint !== null) {
      return endpoint;
   }

   return null;
}

function straightLinkPath(source: ForceGraphNode, target: ForceGraphNode): string {
   const sourceX = source.x ?? 0;
   const sourceY = source.y ?? 0;
   const targetX = target.x ?? 0;
   const targetY = target.y ?? 0;

   return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
}

function svgPoint(event: React.PointerEvent<SVGElement> | React.WheelEvent<SVGSVGElement>): { x: number; y: number } | null {
   const currentTarget = event.currentTarget;
   const svg = currentTarget instanceof SVGSVGElement ? currentTarget : currentTarget.ownerSVGElement;
   const matrix = svg?.getScreenCTM();

   if (!svg || !matrix) {
      return null;
   }

   const point = svg.createSVGPoint();
   point.x = event.clientX;
   point.y = event.clientY;

   return point.matrixTransform(matrix.inverse());
}

function viewToGraphPoint(point: { x: number; y: number }, view: GraphViewTransform): { x: number; y: number } {
   return {
      x: (point.x - view.x) / view.scale,
      y: (point.y - view.y) / view.scale,
   };
}

function isPanStartTarget(target: EventTarget): boolean {
   return target instanceof SVGSVGElement || (target instanceof Element && target.classList.contains('graph-pan-surface'));
}

function clamp(value: number, min: number, max: number): number {
   return Math.min(max, Math.max(min, value));
}

function nodeRadius(node: Pick<ForceGraphNode, 'depth' | 'edges' | 'selected'>): number {
   if (node.selected) {
      return 47;
   }

   return Math.min(27, 12 + Math.max(0, 4 - node.depth) * 2 + Math.sqrt(node.edges.length) * 2);
}

function nodeClassName(node: Pick<ForceGraphNode, 'incomingCount' | 'outgoingCount'>, active: boolean): string {
   const directionClass = node.incomingCount > 0 && node.outgoingCount > 0
      ? 'both'
      : node.incomingCount > 0
         ? 'incoming'
         : 'outgoing';

   return active ? `verse-node ${directionClass} active` : `verse-node ${directionClass}`;
}

interface ConnectionDetailProps {
   selectedVerse: VerseRef | null;
   selectedDetailVerseId: number | null;
   relatedNode: GraphNode | null;
   links: GraphLink[];
   books: Book[];
   verseIndex: VerseIndex;
   verseTextByBook?: Map<number, VerseTextBook>;
   hasVerseText: boolean;
}

function ConnectionDetail({
   selectedVerse,
   selectedDetailVerseId,
   relatedNode,
   links,
   books,
   verseIndex,
   verseTextByBook,
   hasVerseText,
}: ConnectionDetailProps): React.ReactElement {
   if (!selectedVerse) {
      return <p className="muted-copy">No verse selected.</p>;
   }

   if (selectedDetailVerseId === selectedVerse.jwpubVerseId) {
      const selectedText = lookupVerseText(verseTextByBook, selectedVerse, books);
      const outgoingCount = links.filter((link) => link.source === selectedVerse.jwpubVerseId).length;
      const incomingCount = links.filter((link) => link.target === selectedVerse.jwpubVerseId).length;

      return (
         <div className="detail-stack">
            <div className="detail-verse">
               <BookOpenCheck size={18} />
               <div>
                  <span>Selected verse</span>
                  <strong>{selectedVerse.label}</strong>
               </div>
            </div>
            {selectedText ? <p className="verse-copy">{selectedText}</p> : null}
            <dl className="metadata-list">
               <div>
                  <dt>Outgoing</dt>
                  <dd>{formatNumber(outgoingCount)}</dd>
               </div>
               <div>
                  <dt>Incoming</dt>
                  <dd>{formatNumber(incomingCount)}</dd>
               </div>
               <div>
                  <dt>Visible links</dt>
                  <dd>{formatNumber(links.length)}</dd>
               </div>
            </dl>
         </div>
      );
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
   const incomingEdges = ((bucket as { incoming?: AdjacentEdge[] } | undefined)?.incoming ?? []).map((edge) => ({
      edge,
      direction: 'incoming' as const,
   }));
   const outgoingEdges = ((bucket as { outgoing?: AdjacentEdge[] } | undefined)?.outgoing ?? []).map((edge) => ({
      edge,
      direction: 'outgoing' as const,
   }));
   const edges = direction === 'incoming'
      ? incomingEdges
      : direction === 'outgoing'
         ? outgoingEdges
         : [ ...outgoingEdges, ...incomingEdges ];
   const kindCode = edgeKindCode(edgeKind);
   const grouped = new Map<number, AdjacentEdge[]>();

   for (const { edge, direction: edgeDirection } of edges) {
      if (kindCode !== null && edge.kind !== kindCode) {
         continue;
      }

      const relatedVerseId = edgeDirection === 'incoming' ? edge.source : edge.targetStart;
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
