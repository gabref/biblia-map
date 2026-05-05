import { descending } from 'd3-array';
import { chord as chordLayout, type Chord, type ChordGroup } from 'd3-chord';
import { arc } from 'd3-shape';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ErrorState } from '../components/ErrorState';
import { FilterPanel } from '../components/FilterPanel';
import { LoadingShimmer } from '../components/LoadingShimmer';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { loadBookMatrix, loadBooks } from '../data/generated';
import { chordLinePath, polarPoint } from '../graph/chordGeometry';
import { type ChordScope, filterBookMatrix, matrixTotal } from '../graph/matrix';
import { useAsyncData } from '../hooks/useAsyncData';
import type { Book, BookMatrix, EdgeKindFilter } from '../types/generated';
import { formatNumber } from '../utils/format';

interface TooltipState {
   x: number;
   y: number;
   label: string;
}

const edgeKindOptions = [
   { value: 'combined', label: 'Combined' },
   { value: 'crossrefs', label: 'Cross refs' },
   { value: 'study-notes', label: 'Study notes' },
] satisfies Array<{ value: EdgeKindFilter; label: string }>;

const scopeOptions = [
   { value: 'all', label: 'All' },
   { value: 'ot', label: 'Old' },
   { value: 'nt', label: 'New' },
] satisfies Array<{ value: ChordScope; label: string }>;

export function ChordPage(): React.ReactElement {
   const [edgeKind, setEdgeKind] = useState<EdgeKindFilter>('combined');
   const [scope, setScope] = useState<ChordScope>('all');
   const [minWeight, setMinWeight] = useState(25);
   const [showSelfLinks, setShowSelfLinks] = useState(true);
   const [selectedBookNumber, setSelectedBookNumber] = useState<number | null>(null);
   const [tooltip, setTooltip] = useState<TooltipState | null>(null);
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ books, matrix ] = await Promise.all([ loadBooks(), loadBookMatrix(edgeKind) ]);

         return { books, matrix };
      },
      [ edgeKind ],
   );

   const filteredMatrix = useMemo(() => {
      if (!data) {
         return [];
      }

      const scopedMatrix = filterBookMatrix(data.matrix, data.books, {
         minWeight,
         scope,
         showSelfLinks,
      });

      if (!selectedBookNumber) {
         return scopedMatrix;
      }

      const selectedIndex = selectedBookNumber - 1;

      return scopedMatrix.map((row, sourceIndex) =>
         row.map((weight, targetIndex) => (sourceIndex === selectedIndex || targetIndex === selectedIndex ? weight : 0)),
      );
   }, [ data, minWeight, scope, selectedBookNumber, showSelfLinks ]);

   if (error) {
      return <ErrorState title="Chord data is unavailable" error={error} />;
   }

   if (!data || showLoading) {
      return <LoadingShimmer rows={7} />;
   }

   const visibleTotal = matrixTotal(filteredMatrix);
   const selectedBook = selectedBookNumber ? data.books[selectedBookNumber - 1] : null;

   return (
      <div className="page-stack">
         <PageHeader
            eyebrow="Book-to-book graph"
            title="Chord diagram"
            description="The chord view reads only 66 by 66 precomputed matrices, so global exploration stays light."
         >
            <button className="icon-button" type="button" onClick={() => setSelectedBookNumber(null)} title="Clear book">
               <RotateCcw size={18} />
            </button>
         </PageHeader>

         <FilterPanel title="Chord filters">
            <SegmentedControl label="Reference type" options={edgeKindOptions} value={edgeKind} onChange={setEdgeKind} />
            <SegmentedControl label="Scope" options={scopeOptions} value={scope} onChange={setScope} />
            <label className="range-control">
               <span>Minimum weight</span>
               <input
                  type="range"
                  min={1}
                  max={250}
                  step={1}
                  value={minWeight}
                  onChange={(event) => setMinWeight(Number(event.target.value))}
               />
               <strong>{minWeight}</strong>
            </label>
            <label className="toggle-control">
               <input
                  type="checkbox"
                  checked={showSelfLinks}
                  onChange={(event) => setShowSelfLinks(event.target.checked)}
               />
               <span>Self-links</span>
            </label>
         </FilterPanel>

         <section className="graph-frame">
            <div className="graph-toolbar">
               <span>
                  <SlidersHorizontal size={17} />
                  {formatNumber(visibleTotal)} visible references
               </span>
               <strong>{selectedBook ? selectedBook.name : 'All books'}</strong>
            </div>
            <ChordGraph
               books={data.books}
               matrix={filteredMatrix}
               onSelectBook={setSelectedBookNumber}
               onTooltip={setTooltip}
            />
            {tooltip ? (
               <div className="graph-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                  {tooltip.label}
               </div>
            ) : null}
         </section>
      </div>
   );
}

interface ChordGraphProps {
   books: Book[];
   matrix: BookMatrix;
   onSelectBook: (bookNumber: number) => void;
   onTooltip: (tooltip: TooltipState | null) => void;
}

function ChordGraph({ books, matrix, onSelectBook, onTooltip }: ChordGraphProps): React.ReactElement {
   const width = 900;
   const height = 760;
   const outerRadius = 322;
   const innerRadius = 292;
   const pathArc = arc<ChordGroup>().innerRadius(innerRadius).outerRadius(outerRadius);
   const chords = useMemo(
      () =>
         chordLayout()
            .padAngle(0.018)
            .sortSubgroups(descending)(matrix),
      [ matrix ],
   );

   return (
      <svg className="chord-svg" viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`} role="img">
         <title>Book-to-book chord diagram</title>
         <g className="chord-links">
            {chords.map((link) => (
               <ChordLink
                  key={`${link.source.index}-${link.target.index}-${link.source.startAngle.toFixed(4)}`}
                  link={link}
                  books={books}
                  radius={innerRadius}
                  onTooltip={onTooltip}
               />
            ))}
         </g>
         <g className="chord-arcs">
            {chords.groups.map((group) => {
               const book = books[group.index];
               const labelPoint = polarPoint(outerRadius + 34, (group.startAngle + group.endAngle) / 2);

               return (
                  <g key={book.bookNumber}>
                     <path
                        d={pathArc(group) ?? ''}
                        fill={bookColor(book)}
                        className="chord-arc"
                        onClick={() => onSelectBook(book.bookNumber)}
                     >
                        <title>{book.name}</title>
                     </path>
                     <text
                        x={labelPoint.x}
                        y={labelPoint.y}
                        className="chord-label"
                        textAnchor={labelPoint.x >= 0 ? 'start' : 'end'}
                     >
                        {book.shortName}
                     </text>
                  </g>
               );
            })}
         </g>
      </svg>
   );
}

interface ChordLinkProps {
   link: Chord;
   books: Book[];
   radius: number;
   onTooltip: (tooltip: TooltipState | null) => void;
}

function ChordLink({ link, books, radius, onTooltip }: ChordLinkProps): React.ReactElement {
   const sourceBook = books[link.source.index];
   const targetBook = books[link.target.index];
   const sourceAngle = (link.source.startAngle + link.source.endAngle) / 2;
   const targetAngle = (link.target.startAngle + link.target.endAngle) / 2;
   const weight = Math.max(link.source.value, link.target.value);
   const strokeWidth = Math.max(0.7, Math.min(8, Math.sqrt(weight) / 2.1));
   const label = `${sourceBook.name} to ${targetBook.name}: ${formatNumber(weight)}`;

   return (
      <path
         d={chordLinePath(sourceAngle, targetAngle, radius)}
         className="chord-link"
         stroke={bookColor(sourceBook)}
         strokeWidth={strokeWidth}
         onMouseEnter={(event) => onTooltip({ x: event.clientX + 12, y: event.clientY + 12, label })}
         onMouseMove={(event) => onTooltip({ x: event.clientX + 12, y: event.clientY + 12, label })}
         onMouseLeave={() => onTooltip(null)}
      />
   );
}

function bookColor(book: Book): string {
   if (book.testament === 'OT') {
      return book.bookNumber % 3 === 0 ? '#b98432' : '#d1a447';
   }

   return book.bookNumber % 2 === 0 ? '#3f7d78' : '#5576a8';
}
