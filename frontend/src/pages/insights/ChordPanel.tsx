import { descending } from 'd3-array';
import { chord as chordLayout, ribbon as ribbonGenerator, type Chord, type ChordGroup, type Chords } from 'd3-chord';
import { arc as arcGenerator } from 'd3-shape';
import { ArrowRight, RotateCcw, X } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Card, Select, Tabs } from '../../components/ui';
import { loadBookMatrix } from '../../data/generated';
import {
   arcFitsLabel,
   isLowerHalf,
   mergeSpans,
   midAngle,
   polarPoint,
   radialLabel,
   ringPath,
} from '../../graph/chordGeometry';
import {
   bookTotals,
   filterBookMatrix,
   matrixLinkCount,
   matrixTotal,
   partnerBooks,
   rankBookPairs,
   weightBounds,
   type BookTotals,
   type ChordScope,
} from '../../graph/matrix';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useT, type TranslateFn } from '../../i18n';
import { cx } from '../../lib/cx';
import { bookNumberFromSlug, bookSlug, navigate } from '../../routing/routes';
import type { Book, BookMatrix } from '../../types/generated';
import { formatNumber } from '../../utils/format';
import { CANON_SECTIONS, canonColor, canonSectionIndex } from './canon';
import { bucketOf, quantileThresholds } from './heatmap';
import type { InsightsPanelProps } from './InsightsPage';
import {
   BarRow,
   BookLink,
   Finding,
   HeatLegend,
   Legend,
   PanelError,
   PanelSkeleton,
   RouteLink,
   VizTooltip,
   insightsUrl,
   pairUrl,
   useVizTooltip,
   type VizTooltipApi,
} from './shared';

type ChordView = 'chord' | 'matrix';

const SIZE = 770;
const INNER_RADIUS = 262;
const OUTER_RADIUS = 280;
const LABEL_RADIUS = OUTER_RADIUS + 8;
const RING_RADIUS = OUTER_RADIUS + 66;
const LIFT = 7;
const HOVER_CLEAR_MS = 120;

/** Short arc label: the dataset's abbreviation when it has one, else the first letters of the name. */
export function abbreviateBook(book: Pick<Book, 'name' | 'shortName'>): string {
   const short = book.shortName?.trim();

   if (short && short.length <= 6 && short !== book.name) {
      return short.replace(/\.$/, '');
   }

   const match = /^(\d)\s*(.+)$/.exec(book.name);

   return match ? `${match[1]} ${match[2].slice(0, 2)}` : book.name.slice(0, 3);
}

/** Both directions of a book pair, e.g. "Isaiah → Matthew: 60 · Matthew → Isaiah: 85". */
function pairSummary(t: TranslateFn, books: Book[], matrix: BookMatrix, source: number, target: number): string {
   const forward = matrix[source]?.[target] ?? 0;
   const backward = matrix[target]?.[source] ?? 0;
   const sourceName = books[source]?.name ?? '';
   const targetName = books[target]?.name ?? '';

   if (source === target) {
      return t('insights.chord.tooltip.self', { book: sourceName, count: formatNumber(forward) });
   }

   return t('insights.chord.tooltip.pair', {
      source: sourceName,
      target: targetName,
      forward: formatNumber(forward),
      backward: formatNumber(backward),
   });
}

export function ChordPanel({ datasetId, books, kind, location }: InsightsPanelProps): React.ReactElement {
   const t = useT();
   const narrow = useMediaQuery('(max-width: 600px)');
   const [ viewChoice, setViewChoice ] = useState<ChordView | null>(null);
   const [ scope, setScope ] = useState<ChordScope>('all');
   const [ minWeightChoice, setMinWeightChoice ] = useState<number | null>(null);
   const [ showSelfLinks, setShowSelfLinks ] = useState(false);
   const tooltip = useVizTooltip();
   const { data: matrix, error, showLoading, isStale } = useAsyncData(
      () => loadBookMatrix(datasetId, kind),
      [ datasetId, kind ],
      { keepPreviousData: true },
   );

   // The derived slider default belongs to one matrix; drop a manual choice when the data changes.
   useEffect(() => setMinWeightChoice(null), [ datasetId, kind ]);

   const bounds = useMemo(() => (matrix ? weightBounds(matrix) : { max: 1, defaultValue: 1 }), [ matrix ]);
   const minWeight = Math.min(bounds.max, minWeightChoice ?? bounds.defaultValue);
   const filtered = useMemo(
      () => (matrix ? filterBookMatrix(matrix, books, { minWeight, scope, showSelfLinks }) : []),
      [ matrix, books, minWeight, scope, showSelfLinks ],
   );
   const totals = useMemo(() => (matrix ? bookTotals(matrix) : []), [ matrix ]);
   const topPairs = useMemo(
      () => rankBookPairs(filtered, books, { includeSelf: false, limit: 10 }),
      [ filtered, books ],
   );
   const view: ChordView = viewChoice ?? (narrow ? 'matrix' : 'chord');
   const selectedNumber = location.book ? bookNumberFromSlug(location.book) : null;
   const selectedIndex = selectedNumber ? selectedNumber - 1 : null;
   const selectBook = (index: number | null): void => {
      tooltip.hide();
      navigate(
         insightsUrl({ ...location, tab: 'chord', pair: null, flow: null, book: index === null ? null : bookSlug(index + 1) }),
         { replace: true },
      );
   };
   const toggleBook = (index: number): void => selectBook(index === selectedIndex ? null : index);

   if (error) {
      return <PanelError error={error} />;
   }

   if (!matrix || showLoading) {
      return <PanelSkeleton rows={8} />;
   }

   const filtersChanged = scope !== 'all' || showSelfLinks || minWeightChoice !== null;
   const visibleLinks = matrixLinkCount(filtered);
   const selectedBook = selectedIndex !== null ? books[selectedIndex] : null;
   const strongest = rankBookPairs(matrix, books, { limit: 1 })[0];

   return (
      <div className="ins-stack">
         <div className="ins-chord-layout">
            <Card
               as="section"
               padding="none"
               className={cx('ins-chord-frame', isStale && 'is-stale')}
               aria-label={t('insights.chord.title')}
               onKeyDown={(event: React.KeyboardEvent) => {
                  if (event.key === 'Escape' && selectedIndex !== null) {
                     selectBook(null);
                  }
               }}
            >
               <div className="ins-chord-controls">
                  <Tabs
                     label={t('insights.chord.scope.label')}
                     variant="pill"
                     size="sm"
                     value={scope}
                     onChange={setScope}
                     items={[
                        { value: 'all', label: t('insights.chord.scope.all') },
                        { value: 'ot', label: t('insights.testament.hebrewShort') },
                        { value: 'nt', label: t('insights.testament.greekShort') },
                     ]}
                  />
                  <label className="ins-range">
                     <span>
                        {t('insights.chord.minWeight', { count: formatNumber(minWeight) })}
                     </span>
                     <input
                        type="range"
                        min={1}
                        max={bounds.max}
                        step={1}
                        value={minWeight}
                        onChange={(event) => setMinWeightChoice(Number(event.target.value))}
                     />
                  </label>
                  <label className="toggle-control">
                     <input
                        type="checkbox"
                        checked={showSelfLinks}
                        onChange={(event) => setShowSelfLinks(event.target.checked)}
                     />
                     <span>{t('insights.chord.selfLinks')}</span>
                  </label>
                  <Button
                     variant="ghost"
                     size="sm"
                     leading={<RotateCcw size={14} />}
                     disabled={!filtersChanged}
                     onClick={() => {
                        setScope('all');
                        setShowSelfLinks(false);
                        setMinWeightChoice(null);
                     }}
                  >
                     {t('insights.chord.reset')}
                  </Button>
               </div>

               <div className="ins-chord-status">
                  <p className="t-caption" role="status">
                     {t('insights.chord.visible', {
                        links: formatNumber(visibleLinks),
                        references: formatNumber(matrixTotal(filtered)),
                     })}
                  </p>
                  <Tabs
                     label={t('insights.chord.view.label')}
                     variant="pill"
                     size="sm"
                     value={view}
                     onChange={setViewChoice}
                     items={[
                        { value: 'chord', label: t('insights.chord.view.chord') },
                        { value: 'matrix', label: t('insights.chord.view.matrix') },
                     ]}
                  />
               </div>

               {visibleLinks === 0 ? (
                  <p className="ins-empty">{t('insights.chord.empty')}</p>
               ) : view === 'chord' ? (
                  <ChordDiagram
                     key={`${datasetId}:${kind}`}
                     books={books}
                     matrix={filtered}
                     totals={totals}
                     selectedIndex={selectedIndex}
                     tooltip={tooltip}
                     onToggleBook={toggleBook}
                     onClear={() => selectBook(null)}
                     onOpenPair={(source, target) => navigate(pairUrl(source + 1, target + 1, location))}
                  />
               ) : (
                  <BookMatrixGrid
                     books={books}
                     matrix={filtered}
                     selectedIndex={selectedIndex}
                     tooltip={tooltip}
                     onOpenPair={(source, target) => navigate(pairUrl(source + 1, target + 1, location))}
                  />
               )}

               <div className="ins-chord-footer">
                  <Legend
                     label={t('insights.canon.legend')}
                     items={CANON_SECTIONS.map((section) => ({ label: t(section.labelKey), color: section.color }))}
                  />
                  {selectedBook && view === 'chord' ? (
                     <Legend
                        label={t('insights.chord.direction.legend')}
                        items={[
                           { label: t('insights.chord.direction.outgoing', { book: selectedBook.name }), color: 'var(--outgoing)', shape: 'line' },
                           { label: t('insights.chord.direction.incoming', { book: selectedBook.name }), color: 'var(--incoming)', shape: 'line' },
                        ]}
                     />
                  ) : null}
               </div>
               <VizTooltip api={tooltip} />
            </Card>

            <Card as="aside" className="ins-chord-side" aria-label={t('insights.chord.side.label')}>
               {strongest && !selectedBook ? (
                  <Finding>
                     {t('insights.chord.finding', {
                        source: books[strongest.sourceBookNumber - 1]?.name ?? '',
                        target: books[strongest.targetBookNumber - 1]?.name ?? '',
                        count: formatNumber(strongest.weight),
                     })}
                  </Finding>
               ) : null}
               <Select
                  size="sm"
                  aria-label={t('insights.chord.select.label')}
                  value={selectedIndex === null ? '' : String(selectedIndex)}
                  onChange={(value) => selectBook(value === '' ? null : Number(value))}
                  options={[
                     { value: '', label: t('insights.chord.select.all') },
                     ...books.map((book, index) => ({ value: String(index), label: book.name })),
                  ]}
               />
               {selectedBook && selectedIndex !== null ? (
                  <SelectionSummary
                     key={selectedBook.bookNumber}
                     book={selectedBook}
                     books={books}
                     matrix={matrix}
                     totals={totals[selectedIndex]}
                     location={location}
                     onClear={() => selectBook(null)}
                  />
               ) : (
                  <div className="ins-chord-side__body anim-fade-in">
                     <h2 className="t-title">{t('insights.chord.top.title')}</h2>
                     <p className="t-caption">{t('insights.chord.top.description')}</p>
                     <ol className="ins-bar-list">
                        {topPairs.map((pair, index) => (
                           <BarRow
                              key={`${pair.sourceBookNumber}-${pair.targetBookNumber}`}
                              rank={index + 1}
                              label={
                                 <RouteLink
                                    className="ins-link"
                                    href={pairUrl(pair.sourceBookNumber, pair.targetBookNumber, location)}
                                 >
                                    {t('insights.pair.label', {
                                       source: books[pair.sourceBookNumber - 1]?.name ?? '',
                                       target: books[pair.targetBookNumber - 1]?.name ?? '',
                                    })}
                                 </RouteLink>
                              }
                              value={pair.weight}
                              max={topPairs[0]?.weight ?? 0}
                              color={canonColor(pair.sourceBookNumber)}
                              unit={t('insights.unit.references')}
                           />
                        ))}
                     </ol>
                  </div>
               )}
            </Card>
         </div>
      </div>
   );
}

interface SelectionSummaryProps {
   book: Book;
   books: Book[];
   matrix: BookMatrix;
   totals: BookTotals | undefined;
   location: InsightsPanelProps['location'];
   onClear: () => void;
}

function SelectionSummary({ book, books, matrix, totals, location, onClear }: SelectionSummaryProps): React.ReactElement {
   const t = useT();
   const cites = partnerBooks(matrix, books, book.bookNumber, 'outgoing', { limit: 5 });
   const citedBy = partnerBooks(matrix, books, book.bookNumber, 'incoming', { limit: 5 });

   return (
      <div className="ins-chord-side__body anim-fade-in">
         <div className="ins-chord-side__title">
            <h2 className="t-title">
               <span className="ins-dot" style={{ background: canonColor(book.bookNumber) }} aria-hidden="true" />
               {book.name}
            </h2>
            <Button variant="ghost" size="sm" leading={<X size={14} />} onClick={onClear}>
               {t('insights.chord.clear')}
            </Button>
         </div>
         <dl className="ins-mini-stats">
            <div>
               <dt>{t('insights.book.stat.cites')}</dt>
               <dd>{formatNumber(totals?.outgoing ?? 0)}</dd>
            </div>
            <div>
               <dt>{t('insights.book.stat.citedBy')}</dt>
               <dd>{formatNumber(totals?.incoming ?? 0)}</dd>
            </div>
            <div>
               <dt>{t('insights.book.stat.internal')}</dt>
               <dd>{formatNumber(totals?.self ?? 0)}</dd>
            </div>
         </dl>
         {([ [ 'outgoing', cites ], [ 'incoming', citedBy ] ] as const).map(([ direction, partners ]) => (
            <section key={direction}>
               <h3 className="t-label">
                  {direction === 'outgoing' ? t('insights.chord.partners.cites') : t('insights.chord.partners.citedBy')}
               </h3>
               {partners.length === 0 ? (
                  <p className="t-caption">{t('insights.empty.none')}</p>
               ) : (
                  <ol className="ins-bar-list ins-bar-list--tight">
                     {partners.map((partner) => {
                        const other = books[partner.bookNumber - 1];
                        const source = direction === 'outgoing' ? book.bookNumber : partner.bookNumber;
                        const target = direction === 'outgoing' ? partner.bookNumber : book.bookNumber;

                        return (
                           <BarRow
                              key={partner.bookNumber}
                              label={
                                 <RouteLink
                                    className="ins-link"
                                    href={pairUrl(source, target, location)}
                                    aria-label={t('insights.pair.open', {
                                       source: books[source - 1]?.name ?? '',
                                       target: books[target - 1]?.name ?? '',
                                    })}
                                 >
                                    {other?.name}
                                 </RouteLink>
                              }
                              value={partner.weight}
                              max={partners[0]?.weight ?? 0}
                              color={direction === 'outgoing' ? 'var(--outgoing)' : 'var(--incoming)'}
                              unit={t('insights.unit.references')}
                           />
                        );
                     })}
                  </ol>
               )}
            </section>
         ))}
         <BookLink book={book} params={location.carry} className="ins-more">
            {t('insights.book.open', { book: book.name })}
            <ArrowRight size={14} aria-hidden="true" />
         </BookLink>
      </div>
   );
}

interface ChordDiagramProps {
   books: Book[];
   /** The filtered matrix that is drawn. */
   matrix: BookMatrix;
   totals: BookTotals[];
   selectedIndex: number | null;
   tooltip: VizTooltipApi;
   onToggleBook: (index: number) => void;
   onClear: () => void;
   onOpenPair: (sourceIndex: number, targetIndex: number) => void;
}

interface ChordGeometry {
   chords: Chords;
   ribbons: Array<{ chord: Chord; d: string; key: string }>;
   arcs: Array<{ group: ChordGroup; d: string }>;
}

const ChordDiagram = memo(function ChordDiagram({
   books,
   matrix,
   totals,
   selectedIndex,
   tooltip,
   onToggleBook,
   onClear,
   onOpenPair,
}: ChordDiagramProps): React.ReactElement {
   const t = useT();
   const [ hoverIndex, setHoverIndex ] = useState<number | null>(null);
   const [ rovingIndex, setRovingIndex ] = useState(0);
   const hoverTimer = useRef<number | undefined>(undefined);
   const arcRefs = useRef<Array<SVGGElement | null>>([]);
   // Layout and path strings depend only on the matrix: hover and selection never recompute them.
   const geometry = useMemo<ChordGeometry>(() => {
      const chords = chordLayout().padAngle(0.012).sortSubgroups(descending)(matrix);
      const ribbonPath = ribbonGenerator<Chord, never>().radius(INNER_RADIUS - 2);
      const arcPath = arcGenerator<ChordGroup>().innerRadius(INNER_RADIUS).outerRadius(OUTER_RADIUS);

      return {
         chords,
         ribbons: chords.map((chord) => ({
            chord,
            d: String(ribbonPath(chord as never) ?? ''),
            key: `${chord.source.index}-${chord.target.index}`,
         })),
         arcs: chords.groups.map((group) => ({ group, d: arcPath(group) ?? '' })),
      };
   }, [ matrix ]);
   const sections = useMemo(
      () => mergeSpans(geometry.chords.groups, (index) => canonSectionIndex(index + 1)),
      [ geometry ],
   );

   useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

   const focusIndex = hoverIndex ?? selectedIndex;
   const related = useMemo(() => {
      if (focusIndex === null) {
         return null;
      }

      const set = new Set<number>([ focusIndex ]);

      matrix[focusIndex]?.forEach((weight, index) => {
         if (weight > 0 || (matrix[index]?.[focusIndex] ?? 0) > 0) {
            set.add(index);
         }
      });

      return set;
   }, [ focusIndex, matrix ]);
   const enter = (index: number): void => {
      window.clearTimeout(hoverTimer.current);
      setHoverIndex(index);
   };
   const leave = (): void => {
      window.clearTimeout(hoverTimer.current);
      // A short delay avoids flicker when the pointer crosses the gap between two marks.
      hoverTimer.current = window.setTimeout(() => setHoverIndex(null), HOVER_CLEAR_MS);
      tooltip.hide();
   };
   const arcLabel = (index: number): string =>
      t('insights.chord.arc.label', {
         book: books[index]?.name ?? '',
         outgoing: formatNumber(totals[index]?.outgoing ?? 0),
         incoming: formatNumber(totals[index]?.incoming ?? 0),
      });
   const drawn = geometry.arcs.filter((arc) => arc.group.value > 0).map((arc) => arc.group.index);
   const tabStop = drawn.includes(rovingIndex) ? rovingIndex : drawn[0] ?? 0;
   const moveFocus = (from: number, step: number): void => {
      const position = drawn.indexOf(from);
      const next = drawn[(position + step + drawn.length) % drawn.length];

      if (next !== undefined) {
         setRovingIndex(next);
         arcRefs.current[next]?.focus();
      }
   };

   return (
      <div className="ins-chord-canvas">
         <svg
            className={cx('ins-chord', focusIndex !== null && 'has-focus', selectedIndex !== null && 'has-selection')}
            viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
            role="group"
            aria-label={t('insights.chord.svg.label')}
         >
            <rect
               className="ins-chord__backdrop"
               x={-SIZE / 2}
               y={-SIZE / 2}
               width={SIZE}
               height={SIZE}
               onClick={onClear}
            />
            <g className="ins-chord__ribbons">
               {geometry.ribbons.map(({ chord, d, key }) => {
                  const source = chord.source.index;
                  const target = chord.target.index;
                  const touchesFocus = focusIndex !== null && (source === focusIndex || target === focusIndex);
                  const touchesSelection = selectedIndex !== null && (source === selectedIndex || target === selectedIndex);
                  let fill = canonColor(source + 1);

                  if (touchesSelection && selectedIndex !== null) {
                     const other = source === selectedIndex ? target : source;
                     const outgoing = matrix[selectedIndex]?.[other] ?? 0;
                     const incoming = matrix[other]?.[selectedIndex] ?? 0;

                     fill = outgoing >= incoming ? 'var(--outgoing)' : 'var(--incoming)';
                  }

                  return (
                     <path
                        key={key}
                        d={d}
                        className={cx(
                           'ins-chord__ribbon',
                           focusIndex !== null && (touchesFocus ? 'is-focused' : 'is-dimmed'),
                        )}
                        style={{ fill, '--i': canonSectionIndex(source + 1) } as React.CSSProperties}
                        onPointerEnter={(event) => {
                           if (event.pointerType !== 'touch') {
                              tooltip.showAt(event.clientX, event.clientY, pairSummary(t, books, matrix, source, target));
                           }
                        }}
                        onPointerMove={(event) => {
                           if (event.pointerType !== 'touch') {
                              tooltip.showAt(event.clientX, event.clientY, pairSummary(t, books, matrix, source, target));
                           }
                        }}
                        onPointerLeave={tooltip.hide}
                        onClick={() => onOpenPair(source, target)}
                     />
                  );
               })}
            </g>
            <g className="ins-chord__sections" aria-hidden="true">
               {sections.map((span) => {
                  const section = CANON_SECTIONS[span.key];
                  const lower = isLowerHalf(span);
                  const label = t(section.labelKey);
                  const fits = (span.endAngle - span.startAngle) * RING_RADIUS > label.length * 8 + 12;
                  const id = `ins-chord-section-${section.id}`;

                  return (
                     <g key={section.id}>
                        <path d={ringPath(RING_RADIUS, span.startAngle, span.endAngle)} stroke={section.color} className="ins-chord__ring" />
                        {fits ? (
                           <>
                              <path
                                 id={id}
                                 d={ringPath(RING_RADIUS + (lower ? 18 : 8), span.startAngle, span.endAngle, lower)}
                                 fill="none"
                              />
                              <text className="ins-chord__section-label">
                                 <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                                    {label}
                                 </textPath>
                              </text>
                           </>
                        ) : null}
                     </g>
                  );
               })}
            </g>
            <g className="ins-chord__arcs">
               {geometry.arcs.map(({ group, d }) => {
                  if (group.value <= 0) {
                     return null;
                  }

                  const index = group.index;
                  const book = books[index];
                  const angle = midAngle(group);
                  const selected = index === selectedIndex;
                  const lift = selected ? polarPoint(LIFT, angle) : { x: 0, y: 0 };
                  const label = radialLabel(angle, LABEL_RADIUS);
                  const showLabel = selected || index === hoverIndex || arcFitsLabel(group, LABEL_RADIUS, 15);

                  return (
                     <g
                        key={book.bookNumber}
                        ref={(element) => {
                           arcRefs.current[index] = element;
                        }}
                        className={cx(
                           'ins-chord__arc',
                           selected && 'is-selected',
                           related && (related.has(index) ? 'is-focused' : 'is-dimmed'),
                        )}
                        style={{ transform: `translate(${lift.x.toFixed(2)}px, ${lift.y.toFixed(2)}px)` }}
                        role="button"
                        tabIndex={index === tabStop ? 0 : -1}
                        aria-pressed={selected}
                        aria-label={arcLabel(index)}
                        onClick={() => onToggleBook(index)}
                        onKeyDown={(event) => {
                           if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onToggleBook(index);
                           } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                              event.preventDefault();
                              moveFocus(index, 1);
                           } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                              event.preventDefault();
                              moveFocus(index, -1);
                           }
                        }}
                        onPointerEnter={(event) => {
                           enter(index);

                           if (event.pointerType !== 'touch') {
                              tooltip.showAt(event.clientX, event.clientY, arcLabel(index));
                           }
                        }}
                        onPointerMove={(event) => {
                           if (event.pointerType !== 'touch') {
                              tooltip.showAt(event.clientX, event.clientY, arcLabel(index));
                           }
                        }}
                        onPointerLeave={leave}
                        onFocus={(event) => {
                           enter(index);
                           setRovingIndex(index);
                           tooltip.showFor(event.currentTarget, arcLabel(index));
                        }}
                        onBlur={leave}
                     >
                        <path d={d} fill={canonColor(book.bookNumber)} className="ins-chord__arc-path" />
                        {showLabel ? (
                           <text
                              className="ins-chord__label"
                              transform={label.transform}
                              textAnchor={label.anchor}
                              dominantBaseline="central"
                           >
                              {abbreviateBook(book)}
                           </text>
                        ) : null}
                     </g>
                  );
               })}
            </g>
         </svg>
         <p className="ins-chord-hint t-caption">{t('insights.chord.hint')}</p>
      </div>
   );
});

interface BookMatrixGridProps {
   books: Book[];
   matrix: BookMatrix;
   selectedIndex: number | null;
   tooltip: VizTooltipApi;
   onOpenPair: (sourceIndex: number, targetIndex: number) => void;
}

const CELL = 10;
const MATRIX_MARGIN = 26;
const MATRIX_STEPS = 5;

/**
 * The same 66×66 data as a heatmap: rows cite, columns are cited. One tab stop; arrow keys move
 * a cell cursor and Enter opens the verse pairs, so it is the keyboard and phone-friendly form.
 */
const BookMatrixGrid = memo(function BookMatrixGrid({
   books,
   matrix,
   selectedIndex,
   tooltip,
   onOpenPair,
}: BookMatrixGridProps): React.ReactElement {
   const t = useT();
   const svgRef = useRef<SVGSVGElement | null>(null);
   const [ cursor, setCursor ] = useState<{ row: number; column: number } | null>(null);
   const size = books.length * CELL;
   const { cells, thresholds } = useMemo(() => {
      const values: number[] = [];
      const list: Array<{ row: number; column: number; weight: number }> = [];

      matrix.forEach((row, rowIndex) => {
         row.forEach((weight, columnIndex) => {
            if (weight > 0) {
               values.push(weight);
               list.push({ row: rowIndex, column: columnIndex, weight });
            }
         });
      });

      return { cells: list, thresholds: quantileThresholds(values, MATRIX_STEPS) };
   }, [ matrix ]);
   const describe = (row: number, column: number): string => pairSummary(t, books, matrix, row, column);
   const cellFromEvent = (event: React.PointerEvent | React.MouseEvent): { row: number; column: number } | null => {
      const svg = svgRef.current;

      if (!svg) {
         return null;
      }

      const box = svg.getBoundingClientRect();
      const scale = (size + MATRIX_MARGIN) / box.width;
      const column = Math.floor(((event.clientX - box.left) * scale - MATRIX_MARGIN) / CELL);
      const row = Math.floor(((event.clientY - box.top) * scale - MATRIX_MARGIN) / CELL);

      return row >= 0 && column >= 0 && row < books.length && column < books.length ? { row, column } : null;
   };
   const showCursorTooltip = (next: { row: number; column: number }): void => {
      const svg = svgRef.current;

      if (!svg) {
         return;
      }

      const box = svg.getBoundingClientRect();
      const scale = box.width / (size + MATRIX_MARGIN);

      tooltip.showAt(
         box.left + (MATRIX_MARGIN + (next.column + 0.5) * CELL) * scale,
         box.top + (MATRIX_MARGIN + next.row * CELL) * scale,
         describe(next.row, next.column),
      );
   };
   const sectionEdges = CANON_SECTIONS.slice(1).map((section) => (section.first - 1) * CELL);

   return (
      <div className="ins-matrix-scroll">
         <svg
            ref={svgRef}
            className="ins-matrix"
            viewBox={`0 0 ${size + MATRIX_MARGIN} ${size + MATRIX_MARGIN}`}
            role="application"
            tabIndex={0}
            aria-label={t('insights.matrix.label')}
            aria-describedby="ins-matrix-live"
            onPointerMove={(event) => {
               const cell = cellFromEvent(event);

               if (cell && event.pointerType !== 'touch') {
                  tooltip.showAt(event.clientX, event.clientY, describe(cell.row, cell.column));
               } else {
                  tooltip.hide();
               }
            }}
            onPointerLeave={tooltip.hide}
            onClick={(event) => {
               const cell = cellFromEvent(event);

               if (cell && (matrix[cell.row]?.[cell.column] ?? 0) > 0) {
                  onOpenPair(cell.row, cell.column);
               }
            }}
            onFocus={() => {
               const next = cursor ?? { row: selectedIndex ?? 0, column: selectedIndex ?? 0 };

               setCursor(next);
               showCursorTooltip(next);
            }}
            onBlur={() => {
               setCursor(null);
               tooltip.hide();
            }}
            onKeyDown={(event) => {
               const current = cursor ?? { row: 0, column: 0 };
               const moves: Record<string, [ number, number ]> = {
                  ArrowUp: [ -1, 0 ],
                  ArrowDown: [ 1, 0 ],
                  ArrowLeft: [ 0, -1 ],
                  ArrowRight: [ 0, 1 ],
               };
               const move = moves[event.key];

               if (move) {
                  event.preventDefault();

                  const next = {
                     row: Math.max(0, Math.min(books.length - 1, current.row + move[0])),
                     column: Math.max(0, Math.min(books.length - 1, current.column + move[1])),
                  };

                  setCursor(next);
                  showCursorTooltip(next);
               } else if (event.key === 'Enter' && (matrix[current.row]?.[current.column] ?? 0) > 0) {
                  event.preventDefault();
                  onOpenPair(current.row, current.column);
               }
            }}
         >
            <text className="ins-matrix__axis" x={MATRIX_MARGIN} y={8}>
               {t('insights.matrix.columns')}
            </text>
            <text className="ins-matrix__axis" transform={`translate(8 ${MATRIX_MARGIN}) rotate(90)`}>
               {t('insights.matrix.rows')}
            </text>
            <g transform={`translate(${MATRIX_MARGIN} ${MATRIX_MARGIN})`}>
               <rect className="ins-matrix__bg" width={size} height={size} />
               {CANON_SECTIONS.map((section) => {
                  const start = (section.first - 1) * CELL;
                  const length = (section.last - section.first + 1) * CELL;

                  return (
                     <g key={section.id}>
                        <rect x={start} y={-9} width={length} height={5} fill={section.color} />
                        <rect x={-9} y={start} width={5} height={length} fill={section.color} />
                     </g>
                  );
               })}
               {selectedIndex !== null ? (
                  <>
                     <rect className="ins-matrix__band" x={0} y={selectedIndex * CELL} width={size} height={CELL} />
                     <rect className="ins-matrix__band" x={selectedIndex * CELL} y={0} width={CELL} height={size} />
                  </>
               ) : null}
               {cells.map((cell) => (
                  <rect
                     key={`${cell.row}-${cell.column}`}
                     className={`ins-heat ins-heat--${bucketOf(cell.weight, thresholds)}`}
                     x={cell.column * CELL + 0.5}
                     y={cell.row * CELL + 0.5}
                     width={CELL - 1}
                     height={CELL - 1}
                  />
               ))}
               {sectionEdges.map((edge) => (
                  <g key={edge} className="ins-matrix__divider">
                     <line x1={edge} y1={0} x2={edge} y2={size} />
                     <line x1={0} y1={edge} x2={size} y2={edge} />
                  </g>
               ))}
               {cursor ? (
                  <rect
                     className="ins-matrix__cursor"
                     x={cursor.column * CELL}
                     y={cursor.row * CELL}
                     width={CELL}
                     height={CELL}
                  />
               ) : null}
            </g>
         </svg>
         <p id="ins-matrix-live" className="visually-hidden" aria-live="polite">
            {cursor ? describe(cursor.row, cursor.column) : t('insights.matrix.help')}
         </p>
         <HeatLegend thresholds={thresholds} label={t('insights.matrix.legend')} />
      </div>
   );
});
