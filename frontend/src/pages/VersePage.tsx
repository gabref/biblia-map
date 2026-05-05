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
   loadSourceAdjacency,
   loadTargetAdjacency,
   loadVerseIndex,
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
   VerseRef,
} from '../types/generated';
import { edgeKindLabel, formatNumber } from '../utils/format';

interface RelatedNode {
   verseId: number;
   label: string;
   count: number;
   edges: AdjacentEdge[];
}

const edgeKindOptions = [
   { value: 'combined', label: 'Combined' },
   { value: 'crossrefs', label: 'Cross refs' },
   { value: 'study-notes', label: 'Study notes' },
] satisfies Array<{ value: EdgeKindFilter; label: string }>;

const directionOptions = [
   { value: 'outgoing', label: 'Outgoing' },
   { value: 'incoming', label: 'Incoming' },
] satisfies Array<{ value: DirectionMode; label: string }>;

export function VersePage(): React.ReactElement {
   const [bookNumber, setBookNumber] = useState(45);
   const [chapterNumber, setChapterNumber] = useState(12);
   const [verseNumber, setVerseNumber] = useState(12);
   const [edgeKind, setEdgeKind] = useState<EdgeKindFilter>('combined');
   const [direction, setDirection] = useState<DirectionMode>('outgoing');
   const [selectedRelatedVerseId, setSelectedRelatedVerseId] = useState<number | null>(null);
   const baseDataState = useAsyncData(
      async () => {
         const [ books, chapters, verseIndex ] = await Promise.all([ loadBooks(), loadChapters(), loadVerseIndex() ]);

         return { books, chapters, verseIndex };
      },
      [],
   );
   const selectedBook = baseDataState.data?.books.find((book) => book.bookNumber === bookNumber) ?? null;
   const adjacencyState = useAsyncData(
      async () => {
         if (!selectedBook) {
            return null;
         }

         return direction === 'outgoing' ? loadSourceAdjacency(selectedBook) : loadTargetAdjacency(selectedBook);
      },
      [ selectedBook?.bookNumber, direction ],
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
   const relatedNodes = useMemo(() => {
      if (!selectedVerse || !baseDataState.data || !adjacencyState.data) {
         return [];
      }

      return buildRelatedNodes({
         selectedVerseId: selectedVerse.jwpubVerseId,
         adjacency: adjacencyState.data,
         direction,
         edgeKind,
         verseIndex: baseDataState.data.verseIndex,
      });
   }, [ adjacencyState.data, baseDataState.data, direction, edgeKind, selectedVerse ]);
   const selectedRelated = relatedNodes.find((node) => node.verseId === selectedRelatedVerseId) ?? relatedNodes[0] ?? null;

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
   }, [ selectedVerse?.jwpubVerseId, direction, edgeKind ]);

   if (baseDataState.error) {
      return <ErrorState title="Verse data is unavailable" error={baseDataState.error} />;
   }

   if (adjacencyState.error) {
      return <ErrorState title="Adjacency data is unavailable" error={adjacencyState.error} />;
   }

   if (!baseDataState.data || baseDataState.showLoading) {
      return <LoadingShimmer rows={7} />;
   }

   return (
      <div className="page-stack">
         <PageHeader
            eyebrow="Local graph"
            title="Verse explorer"
            description="Select one verse and load only that book's adjacency file for incoming or outgoing references."
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
         </FilterPanel>

         <section className="verse-layout">
            <article className="graph-frame verse-frame">
               <div className="graph-toolbar">
                  <span>
                     <Search size={17} />
                     {selectedVerseRef?.label ?? 'Select a verse'}
                  </span>
                  <strong>{formatNumber(relatedNodes.reduce((total, node) => total + node.count, 0))} references</strong>
               </div>
               {adjacencyState.showLoading ? (
                  <LoadingShimmer rows={4} />
               ) : (
                  <VerseGraph
                     selectedVerse={selectedVerseRef}
                     relatedNodes={relatedNodes}
                     direction={direction}
                     selectedRelatedVerseId={selectedRelated?.verseId ?? null}
                     onSelect={setSelectedRelatedVerseId}
                  />
               )}
            </article>

            <aside className="side-panel">
               <div className="panel-heading">
                  <Info size={20} />
                  <h2>Connection detail</h2>
               </div>
               <ConnectionDetail
                  selectedVerse={selectedVerseRef}
                  relatedNode={selectedRelated}
                  direction={direction}
                  books={baseDataState.data.books}
               />
            </aside>
         </section>
      </div>
   );
}

interface BuildRelatedNodesInput {
   selectedVerseId: number;
   adjacency: SourceAdjacency | TargetAdjacency | null;
   direction: DirectionMode;
   edgeKind: EdgeKindFilter;
   verseIndex: Record<string, VerseRef>;
}

export function buildRelatedNodes({
   selectedVerseId,
   adjacency,
   direction,
   edgeKind,
   verseIndex,
}: BuildRelatedNodesInput): RelatedNode[] {
   if (!adjacency) {
      return [];
   }

   const bucket = adjacency[String(selectedVerseId)];
   const edges =
      direction === 'outgoing'
         ? ((bucket as { outgoing?: AdjacentEdge[] } | undefined)?.outgoing ?? [])
         : ((bucket as { incoming?: AdjacentEdge[] } | undefined)?.incoming ?? []);
   const kindCode = edgeKindCode(edgeKind);
   const grouped = new Map<number, AdjacentEdge[]>();

   for (const edge of edges) {
      if (kindCode !== null && edge.kind !== kindCode) {
         continue;
      }

      const relatedVerseId = direction === 'outgoing' ? edge.targetStart : edge.source;
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

interface VerseGraphProps {
   selectedVerse: VerseRef | null;
   relatedNodes: RelatedNode[];
   direction: DirectionMode;
   selectedRelatedVerseId: number | null;
   onSelect: (verseId: number) => void;
}

function VerseGraph({
   selectedVerse,
   relatedNodes,
   direction,
   selectedRelatedVerseId,
   onSelect,
}: VerseGraphProps): React.ReactElement {
   const radius = 220;

   return (
      <svg className="verse-graph" viewBox="-360 -280 720 560" role="img">
         <title>Selected verse local reference graph</title>
         {relatedNodes.map((node, index) => {
            const angle = (index / Math.max(relatedNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const active = node.verseId === selectedRelatedVerseId;

            return (
               <g key={node.verseId}>
                  <path
                     d={direction === 'outgoing' ? `M 0 0 L ${x} ${y}` : `M ${x} ${y} L 0 0`}
                     className={direction === 'outgoing' ? 'verse-link outgoing' : 'verse-link incoming'}
                  />
                  <circle
                     cx={x}
                     cy={y}
                     r={active ? 24 : 18}
                     className={active ? 'verse-node active' : 'verse-node'}
                     onClick={() => onSelect(node.verseId)}
                  />
                  <text x={x} y={y + 36} textAnchor="middle" className="verse-node-label">
                     {shortVerseLabel(node.label)}
                  </text>
               </g>
            );
         })}
         <circle cx={0} cy={0} r={42} className="center-node" />
         <text x={0} y={-4} textAnchor="middle" className="center-label">
            {selectedVerse ? selectedVerse.label.split(' ')[0] : 'Verse'}
         </text>
         <text x={0} y={16} textAnchor="middle" className="center-label small">
            {selectedVerse ? selectedVerse.label.replace(`${selectedVerse.label.split(' ')[0]} `, '') : ''}
         </text>
      </svg>
   );
}

interface ConnectionDetailProps {
   selectedVerse: VerseRef | null;
   relatedNode: RelatedNode | null;
   direction: DirectionMode;
   books: Book[];
}

function ConnectionDetail({
   selectedVerse,
   relatedNode,
   direction,
   books,
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

   const firstEdge = relatedNode.edges[0];
   const sourceLabel = direction === 'outgoing' ? selectedVerse.label : relatedNode.label;
   const targetLabel = direction === 'outgoing' ? relatedNode.label : selectedVerse.label;
   const book = books.find((candidate) => candidate.bookNumber === selectedVerse.bookNumber);

   return (
      <div className="detail-stack">
         <div className="detail-verse">
            {direction === 'outgoing' ? <ArrowUpFromLine size={18} /> : <ArrowDownToLine size={18} />}
            <div>
               <span>{sourceLabel}</span>
               <strong>{targetLabel}</strong>
            </div>
         </div>
         <dl className="metadata-list">
            <div>
               <dt>Dataset book</dt>
               <dd>{book?.name ?? 'Unknown'}</dd>
            </div>
            <div>
               <dt>Reference count</dt>
               <dd>{formatNumber(relatedNode.count)}</dd>
            </div>
            <div>
               <dt>Type</dt>
               <dd>{relatedNode.edges.map((edge) => edgeKindLabel(edge.kind)).filter(unique).join(', ')}</dd>
            </div>
            <div>
               <dt>Target range</dt>
               <dd>
                  {firstEdge.targetStart === firstEdge.targetEnd
                     ? String(firstEdge.targetStart)
                     : `${firstEdge.targetStart}-${firstEdge.targetEnd}`}
               </dd>
            </div>
            <div>
               <dt>Study note</dt>
               <dd>{firstEdge.commentaryId ? `Commentary ${firstEdge.commentaryId}` : 'None'}</dd>
            </div>
         </dl>
         <p className="muted-copy">Verse text is not generated in this metadata-only build.</p>
      </div>
   );
}

function shortVerseLabel(label: string): string {
   const parts = label.split(' ');

   if (parts.length <= 2) {
      return label;
   }

   return `${parts.slice(0, -1).join(' ').slice(0, 14)} ${parts.at(-1)}`;
}

function unique(value: string, index: number, values: string[]): boolean {
   return values.indexOf(value) === index;
}
