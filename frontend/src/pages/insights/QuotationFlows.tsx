import { ArrowLeftRight, ArrowRight, MousePointerClick } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import { VerseLink } from '../../components/VerseLink';
import { Button, Card, CardHeader, Chip, EmptyState, Skeleton, Tabs } from '../../components/ui';
import { loadBookMatrix } from '../../data/generated';
import { rankBookPairs, testamentFlows, type BookPair, type PairFlow } from '../../graph/matrix';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import { navigate } from '../../routing/routes';
import type { Book } from '../../types/generated';
import { formatNumber } from '../../utils/format';
import { canonColor } from './canon';
import { loadBookPairEdges, loadVerseLocator } from './data';
import { flowLinkPath, groupVersePairs, layoutFlows } from './flows';
import type { InsightsPanelProps } from './InsightsPage';
import {
   BarRow,
   BookLink,
   Finding,
   PanelError,
   PanelSkeleton,
   RouteLink,
   VizTooltip,
   insightsUrl,
   pairUrl,
   usePagedList,
   useVerseTexts,
   useVizTooltip,
} from './shared';

type FlowChoice = 'nt-ot' | 'ot-nt' | 'all';

const FLOW_CHOICES: readonly FlowChoice[] = [ 'nt-ot', 'ot-nt', 'all' ];
const DIAGRAM_PAIRS = 14;
const LIST_PAGE = 12;
const PAIR_PAGE = 12;

/**
 * Quotation flows: which books cite which, across the testaments, as a two-column flow diagram
 * and a ranked list. Selecting a pair (here, in the chord, or on a book profile) lists the verse
 * pairs behind it; the selection lives in the URL (`?tab=flows&pair=40-23`).
 */
export function QuotationFlows({ datasetId, books, kind, location }: InsightsPanelProps): React.ReactElement {
   const t = useT();
   const drilldownRef = useRef<HTMLDivElement | null>(null);
   const flow: FlowChoice = (FLOW_CHOICES as readonly string[]).includes(location.flow ?? '')
      ? (location.flow as FlowChoice)
      : 'nt-ot';
   const { data: matrix, error, showLoading } = useAsyncData(
      () => loadBookMatrix(datasetId, kind),
      [ datasetId, kind ],
      { keepPreviousData: true },
   );
   const pairs = useMemo(
      () => (matrix ? rankBookPairs(matrix, books, { flow: flow as PairFlow }) : []),
      [ matrix, books, flow ],
   );
   const totals = useMemo(() => (matrix ? testamentFlows(matrix, books) : null), [ matrix, books ]);
   const paged = usePagedList(pairs, LIST_PAGE, `${datasetId}:${kind}:${flow}`);
   const pair = location.pair;
   const pairKey = pair ? `${pair.source}-${pair.target}` : '';

   useEffect(() => {
      const element = drilldownRef.current;

      if (!pairKey || !element) {
         return;
      }

      const box = element.getBoundingClientRect();

      if (box.top < 0 || box.top > window.innerHeight * 0.6) {
         element.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
   }, [ pairKey ]);

   if (error) {
      return <PanelError error={error} />;
   }

   if (!matrix || !totals || showLoading) {
      return <PanelSkeleton rows={10} />;
   }

   const name = (bookNumber: number): string => books[bookNumber - 1]?.name ?? String(bookNumber);
   const top = pairs[0];
   const flowTotal = flow === 'nt-ot' ? totals['NT->OT'] : flow === 'ot-nt' ? totals['OT->NT'] : null;
   const sourceBook = pair ? books[pair.source - 1] : undefined;
   const targetBook = pair ? books[pair.target - 1] : undefined;

   return (
      <div className="ins-stack">
         {top ? (
            <Finding>
               {flowTotal !== null
                  ? t(flow === 'nt-ot' ? 'insights.flows.finding.ntOt' : 'insights.flows.finding.otNt', {
                     total: formatNumber(flowTotal),
                     source: name(top.sourceBookNumber),
                     target: name(top.targetBookNumber),
                     count: formatNumber(top.weight),
                  })
                  : t('insights.flows.finding.all', {
                     source: name(top.sourceBookNumber),
                     target: name(top.targetBookNumber),
                     count: formatNumber(top.weight),
                  })}
            </Finding>
         ) : null}

         <div className="ins-flows-layout">
            <Card as="section" aria-labelledby="ins-flows-title">
               <CardHeader
                  title={<span id="ins-flows-title">{t('insights.flows.title')}</span>}
                  description={t('insights.flows.description')}
               />
               <Tabs
                  label={t('insights.flows.direction.label')}
                  variant="pill"
                  size="sm"
                  value={flow}
                  onChange={(next) => navigate(insightsUrl({ ...location, tab: 'flows', flow: next }), { replace: true })}
                  items={[
                     { value: 'nt-ot', label: t('insights.flows.direction.ntOt') },
                     { value: 'ot-nt', label: t('insights.flows.direction.otNt') },
                     { value: 'all', label: t('insights.flows.direction.all') },
                  ]}
               />

               {pairs.length === 0 ? (
                  <EmptyState size="inline" title={t('insights.flows.empty.title')} description={t('insights.flows.empty.body')} />
               ) : (
                  <>
                     <FlowDiagram
                        key={`${kind}:${flow}`}
                        pairs={pairs.slice(0, DIAGRAM_PAIRS)}
                        books={books}
                        selectedKey={pairKey}
                        location={location}
                        flow={flow}
                     />
                     <ol className="ins-bar-list ins-pair-list">
                        {paged.visible.map((item, index) => {
                           const key = `${item.sourceBookNumber}-${item.targetBookNumber}`;

                           return (
                              <BarRow
                                 key={key}
                                 rank={index + 1}
                                 className={cx(key === pairKey && 'is-current')}
                                 label={
                                    <RouteLink
                                       className="ins-link"
                                       aria-current={key === pairKey ? 'true' : undefined}
                                       href={insightsUrl({
                                          ...location,
                                          tab: 'flows',
                                          flow,
                                          pair: { source: item.sourceBookNumber, target: item.targetBookNumber },
                                       })}
                                    >
                                       {t('insights.pair.label', {
                                          source: name(item.sourceBookNumber),
                                          target: name(item.targetBookNumber),
                                       })}
                                    </RouteLink>
                                 }
                                 value={item.weight}
                                 max={top?.weight ?? 0}
                                 color={canonColor(item.sourceBookNumber)}
                                 unit={t('insights.unit.references')}
                              />
                           );
                        })}
                     </ol>
                     {paged.hasMore ? (
                        <Button variant="secondary" size="sm" onClick={paged.showMore}>
                           {t('insights.action.showMore', { count: Math.min(LIST_PAGE, paged.remaining) })}
                        </Button>
                     ) : null}
                  </>
               )}
            </Card>

            <div ref={drilldownRef} className="ins-flows-drilldown">
               {pair && sourceBook && targetBook ? (
                  <PairDrilldown
                     key={`${pairKey}:${kind}`}
                     datasetId={datasetId}
                     books={books}
                     sourceBook={sourceBook}
                     targetBook={targetBook}
                     forward={matrix[pair.source - 1]?.[pair.target - 1] ?? 0}
                     backward={matrix[pair.target - 1]?.[pair.source - 1] ?? 0}
                     kind={kind}
                     location={{ ...location, flow }}
                  />
               ) : (
                  <Card>
                     <EmptyState
                        size="inline"
                        icon={<MousePointerClick size={20} />}
                        title={t('insights.pair.empty.title')}
                        description={t('insights.pair.empty.body')}
                     />
                  </Card>
               )}
            </div>
         </div>
      </div>
   );
}

interface FlowDiagramProps {
   pairs: BookPair[];
   books: Book[];
   selectedKey: string;
   location: InsightsPanelProps['location'];
   flow: FlowChoice;
}

const DIAGRAM_WIDTH = 560;
const DIAGRAM_HEIGHT = 400;
const COLUMN_LEFT = 170;
const COLUMN_RIGHT = DIAGRAM_WIDTH - 170;
const BAR_WIDTH = 8;

function FlowDiagram({ pairs, books, selectedKey, location, flow }: FlowDiagramProps): React.ReactElement {
   const t = useT();
   const tooltip = useVizTooltip();
   const layout = useMemo(() => layoutFlows(pairs, { height: DIAGRAM_HEIGHT - 40, nodeGap: 13 }), [ pairs ]);
   const name = (bookNumber: number): string => books[bookNumber - 1]?.name ?? String(bookNumber);
   const offsetY = 30;

   return (
      <figure className="ins-flow-figure">
         <figcaption className="t-caption">{t('insights.flows.diagram.caption', { count: pairs.length })}</figcaption>
         <div className="ins-flow-scroll">
            <svg
               className={cx('ins-flow', selectedKey && 'has-selection')}
               viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
               role="group"
               aria-label={t('insights.flows.diagram.label')}
            >
               <text className="ins-flow__axis" x={COLUMN_LEFT} y={14} textAnchor="end">
                  {t('insights.flows.axis.citing')}
               </text>
               <text className="ins-flow__axis" x={COLUMN_RIGHT} y={14} textAnchor="start">
                  {t('insights.flows.axis.cited')}
               </text>
               <g transform={`translate(0 ${offsetY})`}>
                  {layout.links.map((link, index) => {
                     const key = `${link.sourceBookNumber}-${link.targetBookNumber}`;
                     const label = t('insights.flows.link.label', {
                        source: name(link.sourceBookNumber),
                        target: name(link.targetBookNumber),
                        count: formatNumber(link.weight),
                     });
                     const href = insightsUrl({
                        ...location,
                        tab: 'flows',
                        flow,
                        pair: { source: link.sourceBookNumber, target: link.targetBookNumber },
                     });

                     return (
                        <a
                           key={key}
                           href={href}
                           className={cx('ins-flow__link', key === selectedKey && 'is-selected')}
                           aria-label={label}
                           style={{ '--i': Math.min(index, 11) } as React.CSSProperties}
                           onClick={(event) => {
                              if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                                 event.preventDefault();
                                 navigate(href);
                              }
                           }}
                           onPointerMove={(event) => {
                              if (event.pointerType !== 'touch') {
                                 tooltip.showAt(event.clientX, event.clientY, label);
                              }
                           }}
                           onPointerLeave={tooltip.hide}
                           onFocus={(event) => tooltip.showFor(event.currentTarget, label)}
                           onBlur={tooltip.hide}
                        >
                           <path
                              d={flowLinkPath(COLUMN_LEFT + BAR_WIDTH, link.sourceY, COLUMN_RIGHT, link.targetY)}
                              stroke={canonColor(link.sourceBookNumber)}
                              strokeWidth={Math.max(1.5, link.thickness)}
                           />
                        </a>
                     );
                  })}
                  {layout.sources.map((node) => (
                     <g key={node.bookNumber}>
                        <rect x={COLUMN_LEFT} y={node.y} width={BAR_WIDTH} height={Math.max(2, node.height)} fill={canonColor(node.bookNumber)} />
                        <text className="ins-flow__label" x={COLUMN_LEFT - 8} y={node.y + node.height / 2} textAnchor="end" dominantBaseline="central">
                           {name(node.bookNumber)}
                           <tspan className="ins-flow__value"> {formatNumber(node.value)}</tspan>
                        </text>
                     </g>
                  ))}
                  {layout.targets.map((node) => (
                     <g key={node.bookNumber}>
                        <rect x={COLUMN_RIGHT} y={node.y} width={BAR_WIDTH} height={Math.max(2, node.height)} fill={canonColor(node.bookNumber)} />
                        <text className="ins-flow__label" x={COLUMN_RIGHT + BAR_WIDTH + 8} y={node.y + node.height / 2} textAnchor="start" dominantBaseline="central">
                           {name(node.bookNumber)}
                           <tspan className="ins-flow__value"> {formatNumber(node.value)}</tspan>
                        </text>
                     </g>
                  ))}
               </g>
            </svg>
         </div>
         <VizTooltip api={tooltip} />
      </figure>
   );
}

interface PairDrilldownProps {
   datasetId: string;
   books: Book[];
   sourceBook: Book;
   targetBook: Book;
   forward: number;
   backward: number;
   kind: InsightsPanelProps['kind'];
   location: InsightsPanelProps['location'];
}

/** The verse pairs behind one book-to-book link, with text, a page at a time. */
function PairDrilldown({
   datasetId,
   books,
   sourceBook,
   targetBook,
   forward,
   backward,
   kind,
   location,
}: PairDrilldownProps): React.ReactElement {
   const t = useT();
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ edges, locator ] = await Promise.all([
            loadBookPairEdges(datasetId, sourceBook, targetBook, kind),
            loadVerseLocator(datasetId),
         ]);

         return { edges, locator };
      },
      [ datasetId, sourceBook.bookNumber, targetBook.bookNumber, kind ],
   );
   const edgeCount = data?.edges.length ?? 0;
   const edges = useMemo(() => groupVersePairs(data?.edges ?? []), [ data ]);
   const paged = usePagedList(edges, PAIR_PAGE, `${datasetId}:${sourceBook.bookNumber}:${targetBook.bookNumber}:${kind}`);
   const textBooks = useMemo(
      () => [ sourceBook.bookNumber, targetBook.bookNumber ],
      [ sourceBook.bookNumber, targetBook.bookNumber ],
   );
   const verseText = useVerseTexts(datasetId, books, textBooks);

   return (
      <Card as="section" className="ins-pair anim-rise-in" aria-labelledby="ins-pair-title">
         <CardHeader
            title={
               <span id="ins-pair-title">
                  {t('insights.pair.title', { source: sourceBook.name, target: targetBook.name })}
               </span>
            }
            description={t('insights.pair.summary', {
               source: sourceBook.name,
               target: targetBook.name,
               forward: formatNumber(forward),
               backward: formatNumber(backward),
            })}
            action={
               sourceBook.bookNumber !== targetBook.bookNumber ? (
                  <RouteLink
                     className="ins-more"
                     href={pairUrl(targetBook.bookNumber, sourceBook.bookNumber, location)}
                  >
                     <ArrowLeftRight size={14} aria-hidden="true" />
                     {t('insights.pair.swap')}
                  </RouteLink>
               ) : undefined
            }
         />
         <p className="ins-pair__books t-caption">
            <BookLink book={sourceBook} params={location.carry}>
               {t('insights.book.open', { book: sourceBook.name })}
            </BookLink>
            {sourceBook.bookNumber !== targetBook.bookNumber ? (
               <>
                  {' · '}
                  <BookLink book={targetBook} params={location.carry}>
                     {t('insights.book.open', { book: targetBook.name })}
                  </BookLink>
               </>
            ) : null}
         </p>

         {error ? <PanelError error={error} /> : null}
         {!error && (!data || showLoading) ? <PanelSkeleton rows={6} /> : null}
         {data && !error && edges.length === 0 ? (
            <EmptyState size="inline" title={t('insights.pair.none.title')} description={t('insights.pair.none.body')} />
         ) : null}
         {data && !error && edges.length > 0 ? (
            <>
               <ol className="ins-pair-rows">
                  {paged.visible.map((edge) => {
                     const source = data.locator.locate(edge.source);
                     const target = data.locator.locate(edge.targetStart);

                     if (!source || !target) {
                        return null;
                     }

                     const sourceText = verseText(edge.source, source.bookNumber);
                     const targetText = verseText(edge.targetStart, target.bookNumber);

                     return (
                        <li key={`${edge.source}-${edge.targetStart}-${edge.targetEnd}`} className="ins-pair-row">
                           <div className="ins-pair-row__side">
                              <VerseLink
                                 verse={{ ...source, label: data.locator.labelOf(source) }}
                                 params={location.carry}
                                 className="ins-link t-ref"
                              />
                              <VerseText text={sourceText} />
                           </div>
                           <ArrowRight className="ins-pair-row__arrow" size={16} aria-label={t('insights.pair.cites')} />
                           <div className="ins-pair-row__side">
                              <span className="ins-pair-row__head">
                                 <VerseLink
                                    verse={{ ...target, label: data.locator.rangeLabel(edge.targetStart, edge.targetEnd) }}
                                    params={location.carry}
                                    className="ins-link t-ref"
                                 />
                                 {edge.studyNotes > 0 ? (
                                    <Chip size="sm">
                                       {t('insights.kind.studyNote')}
                                       {edge.studyNotes > 1 ? ` ×${edge.studyNotes}` : ''}
                                    </Chip>
                                 ) : null}
                                 {edge.studyNotes > 0 && edge.crossReferences > 0 ? (
                                    <Chip size="sm">{t('insights.kind.crossref')}</Chip>
                                 ) : null}
                              </span>
                              <VerseText text={targetText} continued={edge.targetEnd > edge.targetStart} />
                           </div>
                        </li>
                     );
                  })}
               </ol>
               <p className="t-caption" role="status">
                  {t('insights.pair.showing', {
                     shown: formatNumber(paged.visible.length),
                     total: formatNumber(edges.length),
                     references: formatNumber(edgeCount),
                  })}
               </p>
               {paged.hasMore ? (
                  <Button variant="secondary" size="sm" onClick={paged.showMore}>
                     {t('insights.action.showMore', { count: Math.min(PAIR_PAGE, paged.remaining) })}
                  </Button>
               ) : null}
            </>
         ) : null}
      </Card>
   );
}

function VerseText({ text, continued }: { text: string | null | undefined; continued?: boolean }): React.ReactElement | null {
   if (text === undefined) {
      return <Skeleton lines={2} />;
   }

   if (!text) {
      return null;
   }

   return (
      <p className="ins-pair-row__text">
         {text}
         {continued ? ' …' : ''}
      </p>
   );
}
