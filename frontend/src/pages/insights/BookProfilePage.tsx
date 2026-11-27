import { ArrowLeft, ArrowRight, BookOpen, Network } from 'lucide-react';
import { useMemo, useState } from 'react';

import { VerseLink } from '../../components/VerseLink';
import { Card, CardHeader, EmptyState, Select, Skeleton, Tabs, type TabItem } from '../../components/ui';
import { loadBookMatrix, loadBooks, loadManifest } from '../../data/generated';
import { bookTotals, partnerBooks, type PartnerBook } from '../../graph/matrix';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useT } from '../../i18n';
import { bookHref, bookSlug, navigate, useRoute, type RouteParams } from '../../routing/routes';
import type { Book, BookMatrix, EdgeKindFilter } from '../../types/generated';
import { formatNumber, formatPercent } from '../../utils/format';
import { canonColor, canonSection } from './canon';
import { loadChapterMatrix, loadChapterStats, loadVerseDegrees, loadVerseLocator } from './data';
import type { ChapterStat } from './heatmap';
import { rankHubs, type HubMetric } from './hubs';
import './insights.css';
import {
   BarRow,
   BookLink,
   ChapterLink,
   Legend,
   PanelError,
   PanelSkeleton,
   RouteLink,
   VizTooltip,
   insightsUrl,
   pairUrl,
   useVerseTexts,
   useVizTooltip,
} from './shared';

export interface BookProfilePageProps {
   datasetId: string;
   /** Book number to show (the route registry's `book` prop). Defaults to the current `/book/<slug>` route. */
   book?: number;
}

interface ProfileContext {
   datasetId: string;
   book: Book;
   books: Book[];
   kind: EdgeKindFilter;
   carry: RouteParams;
}

/**
 * Book profile (`/book/<slug>`): what a book cites and is cited by, its most connected verses,
 * where its chapters are densest, and how it links the two testaments.
 */
export function BookProfilePage({ datasetId, book: bookNumberProp }: BookProfilePageProps): React.ReactElement {
   const t = useT();
   const { route, params } = useRoute();
   const bookNumber = bookNumberProp ?? (route.name === 'book' ? route.book : 1);
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ manifest, books ] = await Promise.all([ loadManifest(datasetId), loadBooks(datasetId) ]);

         return { manifest, books };
      },
      [ datasetId ],
   );
   const hasStudyNotes = data?.manifest.availableEdgeKinds.includes('study_note_reference') ?? false;
   const kind: EdgeKindFilter = hasStudyNotes ? params.kind ?? 'combined' : 'combined';
   const carry = useMemo<RouteParams>(() => {
      const next: RouteParams = {};

      if (params.ds) next.ds = params.ds;
      if (params.lang) next.lang = params.lang;

      return next;
   }, [ params.ds, params.lang ]);
   const matrixState = useAsyncData(() => loadBookMatrix(datasetId, kind), [ datasetId, kind ], { keepPreviousData: true });

   if (error || matrixState.error) {
      return <PanelError error={(error ?? matrixState.error) as Error} />;
   }

   const book = data?.books[bookNumber - 1];

   if (!data || !matrixState.data || showLoading || !book) {
      return (
         <div className="page-stack ins-page">
            <PanelSkeleton rows={10} />
         </div>
      );
   }

   const { books } = data;
   const matrix = matrixState.data;
   const context: ProfileContext = { datasetId, book, books, kind, carry };
   const location = { carry, kind };
   const totals = bookTotals(matrix)[bookNumber - 1] ?? { outgoing: 0, incoming: 0, self: 0, total: 0 };
   const section = canonSection(bookNumber);
   const previous = books[bookNumber - 2];
   const next = books[bookNumber];
   const kindParams = (value: EdgeKindFilter): RouteParams => (value === 'combined' ? carry : { ...carry, kind: value });
   const kindTabs: TabItem<EdgeKindFilter>[] = [
      { value: 'combined', label: t('insights.kind.combined') },
      { value: 'crossrefs', label: t('insights.kind.crossrefs') },
      { value: 'study-notes', label: t('insights.kind.studyNotes') },
   ];
   const cites = partnerBooks(matrix, books, bookNumber, 'outgoing');
   const citedBy = partnerBooks(matrix, books, bookNumber, 'incoming');
   const otherTestament = book.testament === 'OT' ? 'NT' : 'OT';
   const crossOut = cites.filter((partner) => books[partner.bookNumber - 1]?.testament === otherTestament);
   const crossIn = citedBy.filter((partner) => books[partner.bookNumber - 1]?.testament === otherTestament);
   const sum = (partners: PartnerBook[]): number => partners.reduce((total, partner) => total + partner.weight, 0);
   // The classic question: how the Greek Scriptures use the Hebrew Scriptures.
   const quotation = book.testament === 'OT'
      ? { partners: crossIn, direction: 'incoming' as const }
      : { partners: crossOut, direction: 'outgoing' as const };

   return (
      <div className="page-stack ins-page ins-book">
         <header className="page-header ins-header">
            <div>
               <p className="eyebrow">
                  {t('insights.book.eyebrow', {
                     section: t(section.labelKey),
                     testament: book.testament === 'OT' ? t('insights.testament.hebrew') : t('insights.testament.greek'),
                  })}
               </p>
               <h1>
                  <span className="ins-dot ins-dot--lg" style={{ background: section.color }} aria-hidden="true" />
                  {book.name}
               </h1>
               <p className="page-description">
                  {t('insights.book.description', {
                     chapters: formatNumber(book.chapters),
                     outgoing: formatNumber(totals.outgoing),
                     incoming: formatNumber(totals.incoming),
                  })}
               </p>
               <nav className="ins-book-nav" aria-label={t('insights.book.nav.label')}>
                  <ChapterLink className="ins-more" bookNumber={bookNumber} chapterNumber={1} params={carry}>
                     <BookOpen size={14} aria-hidden="true" />
                     {t('insights.book.read', { book: book.name })}
                  </ChapterLink>
                  <RouteLink
                     className="ins-more"
                     scrollTop
                     href={insightsUrl({ tab: 'chord', kind, carry, book: bookSlug(bookNumber) })}
                  >
                     <Network size={14} aria-hidden="true" />
                     {t('insights.book.graph')}
                  </RouteLink>
                  {previous ? (
                     <BookLink book={previous} params={kindParams(kind)} className="ins-more">
                        <ArrowLeft size={14} aria-hidden="true" />
                        {previous.name}
                     </BookLink>
                  ) : null}
                  {next ? (
                     <BookLink book={next} params={kindParams(kind)} className="ins-more">
                        {next.name}
                        <ArrowRight size={14} aria-hidden="true" />
                     </BookLink>
                  ) : null}
               </nav>
            </div>
            {hasStudyNotes ? (
               <div className="page-header-actions ins-header__filter">
                  <span className="t-caption">{t('insights.kind.label')}</span>
                  <Tabs
                     label={t('insights.kind.label')}
                     variant="pill"
                     size="sm"
                     items={kindTabs}
                     value={kind}
                     onChange={(value) => navigate(bookHref(bookNumber, kindParams(value)), { replace: true })}
                  />
               </div>
            ) : null}
         </header>

         <dl className="ins-stat-strip stagger" aria-label={t('insights.book.stats.label')}>
            <div className="ins-stat">
               <dt>{t('insights.book.stat.cites')}</dt>
               <dd><span className="t-numeral">{formatNumber(totals.outgoing)}</span></dd>
            </div>
            <div className="ins-stat">
               <dt>{t('insights.book.stat.citedBy')}</dt>
               <dd><span className="t-numeral">{formatNumber(totals.incoming)}</span></dd>
            </div>
            <div className="ins-stat">
               <dt>{t('insights.book.stat.internal')}</dt>
               <dd><span className="t-numeral">{formatNumber(totals.self)}</span></dd>
            </div>
            <div className="ins-stat">
               <dt>{t('insights.book.stat.crossTestament')}</dt>
               <dd>
                  <span className="t-numeral">{formatNumber(sum(crossOut) + sum(crossIn))}</span>
                  <span className="ins-stat__detail">
                     {formatPercent(sum(crossOut) + sum(crossIn), totals.outgoing + totals.incoming)}
                  </span>
               </dd>
            </div>
         </dl>

         <div className="ins-grid ins-grid--2">
            <PartnerCard
               id="ins-book-cites"
               title={t('insights.book.cites.title', { book: book.name })}
               description={t('insights.book.cites.description')}
               partners={cites.slice(0, 8)}
               direction="outgoing"
               context={context}
            />
            <PartnerCard
               id="ins-book-cited"
               title={t('insights.book.citedBy.title', { book: book.name })}
               description={t('insights.book.citedBy.description')}
               partners={citedBy.slice(0, 8)}
               direction="incoming"
               context={context}
            />
         </div>

         <ChapterDensity key={`chapters:${bookNumber}`} context={context} />

         <div className="ins-grid ins-grid--2">
            <BookHubs key={`hubs:${bookNumber}`} context={context} hasStudyNotes={hasStudyNotes} />

            <div className="ins-stack">
               <Card as="section" aria-labelledby="ins-book-split">
                  <CardHeader
                     title={<span id="ins-book-split">{t('insights.book.split.title')}</span>}
                     description={t('insights.book.split.description')}
                  />
                  <TestamentSplit
                     label={t('insights.book.split.outgoing', { book: book.name })}
                     matrix={matrix}
                     books={books}
                     bookNumber={bookNumber}
                     direction="outgoing"
                  />
                  <TestamentSplit
                     label={t('insights.book.split.incoming', { book: book.name })}
                     matrix={matrix}
                     books={books}
                     bookNumber={bookNumber}
                     direction="incoming"
                  />
                  <Legend
                     label={t('insights.book.split.legend')}
                     items={[
                        { label: t('insights.testament.hebrew'), color: 'var(--canon-history)' },
                        { label: t('insights.testament.greek'), color: 'var(--canon-gospels)' },
                     ]}
                  />
               </Card>

               <Card as="section" aria-labelledby="ins-book-quotation">
                  <CardHeader
                     title={
                        <span id="ins-book-quotation">
                           {book.testament === 'OT'
                              ? t('insights.book.quotation.otTitle', { book: book.name })
                              : t('insights.book.quotation.ntTitle', { book: book.name })}
                        </span>
                     }
                     description={
                        book.testament === 'OT'
                           ? t('insights.book.quotation.otDescription', { count: formatNumber(sum(crossIn)) })
                           : t('insights.book.quotation.ntDescription', { count: formatNumber(sum(crossOut)) })
                     }
                  />
                  <PartnerList
                     partners={quotation.partners.slice(0, 8)}
                     direction={quotation.direction}
                     context={context}
                     location={location}
                  />
               </Card>
            </div>
         </div>
      </div>
   );
}

interface PartnerListProps {
   partners: PartnerBook[];
   direction: 'outgoing' | 'incoming';
   context: ProfileContext;
   location: { carry: RouteParams; kind: EdgeKindFilter };
}

function PartnerList({ partners, direction, context, location }: PartnerListProps): React.ReactElement {
   const t = useT();
   const { book, books } = context;

   if (partners.length === 0) {
      return <EmptyState size="inline" title={t('insights.empty.none')} />;
   }

   return (
      <ol className="ins-bar-list">
         {partners.map((partner, index) => {
            const other = books[partner.bookNumber - 1];
            const source = direction === 'outgoing' ? book.bookNumber : partner.bookNumber;
            const target = direction === 'outgoing' ? partner.bookNumber : book.bookNumber;

            if (!other) {
               return null;
            }

            return (
               <BarRow
                  key={partner.bookNumber}
                  rank={index + 1}
                  label={<BookLink book={other} params={location.kind === 'combined' ? location.carry : { ...location.carry, kind: location.kind }} />}
                  value={partner.weight}
                  max={partners[0]?.weight ?? 0}
                  color={canonColor(partner.bookNumber)}
                  unit={t('insights.unit.references')}
                  trailing={
                     <RouteLink
                        className="ins-more ins-more--quiet"
                        scrollTop
                        href={pairUrl(source, target, location)}
                        aria-label={t('insights.pair.open', {
                           source: books[source - 1]?.name ?? '',
                           target: books[target - 1]?.name ?? '',
                        })}
                     >
                        {t('insights.pair.verses')}
                        <ArrowRight size={13} aria-hidden="true" />
                     </RouteLink>
                  }
               />
            );
         })}
      </ol>
   );
}

interface PartnerCardProps extends Omit<PartnerListProps, 'location'> {
   id: string;
   title: string;
   description: string;
}

function PartnerCard({ id, title, description, partners, direction, context }: PartnerCardProps): React.ReactElement {
   return (
      <Card as="section" aria-labelledby={id}>
         <CardHeader title={<span id={id}>{title}</span>} description={description} />
         <PartnerList
            partners={partners}
            direction={direction}
            context={context}
            location={{ carry: context.carry, kind: context.kind }}
         />
      </Card>
   );
}

function TestamentSplit({
   label,
   matrix,
   books,
   bookNumber,
   direction,
}: {
   label: string;
   matrix: BookMatrix;
   books: Book[];
   bookNumber: number;
   direction: 'outgoing' | 'incoming';
}): React.ReactElement {
   const t = useT();
   let hebrew = 0;
   let greek = 0;

   books.forEach((other, index) => {
      const weight = direction === 'outgoing' ? matrix[bookNumber - 1]?.[index] ?? 0 : matrix[index]?.[bookNumber - 1] ?? 0;

      if (other.testament === 'OT') {
         hebrew += weight;
      } else {
         greek += weight;
      }
   });

   const total = hebrew + greek;

   return (
      <div className="ins-split">
         <p className="t-label">{label}</p>
         {total === 0 ? (
            <p className="t-caption">{t('insights.empty.none')}</p>
         ) : (
            <>
               <div className="ins-strip ins-strip--thin" aria-hidden="true">
                  {hebrew > 0 ? <span className="ins-strip__segment" style={{ flexGrow: hebrew, background: 'var(--canon-history)' }} /> : null}
                  {greek > 0 ? <span className="ins-strip__segment" style={{ flexGrow: greek, background: 'var(--canon-gospels)' }} /> : null}
               </div>
               <p className="ins-split__values tabular">
                  <span>
                     {t('insights.testament.hebrew')}: {formatNumber(hebrew)} ({formatPercent(hebrew, total)})
                  </span>
                  <span>
                     {t('insights.testament.greek')}: {formatNumber(greek)} ({formatPercent(greek, total)})
                  </span>
               </p>
            </>
         )}
      </div>
   );
}

/** Per-chapter reference density: one stacked bar per chapter, each a link to Read mode. */
function ChapterDensity({ context }: { context: ProfileContext }): React.ReactElement {
   const t = useT();
   const { datasetId, book, books, carry, kind } = context;
   const tooltip = useVizTooltip();
   const [ chapterChoice, setChapterChoice ] = useState<number | null>(null);
   const { data: stats, error } = useAsyncData(
      async () => (await loadChapterStats(datasetId)).filter((stat) => stat.bookNumber === book.bookNumber),
      [ datasetId, book.bookNumber ],
   );
   const densest = useMemo(
      () => (stats ?? []).reduce<ChapterStat | null>(
         (best, stat) => (!best || stat.incoming + stat.outgoing > best.incoming + best.outgoing ? stat : best),
         null,
      ),
      [ stats ],
   );
   const chapter = chapterChoice ?? densest?.chapterNumber ?? 1;
   const matrixState = useAsyncData(() => loadChapterMatrix(datasetId, book), [ datasetId, book.bookNumber ]);
   const column = kind === 'crossrefs' ? 1 : kind === 'study-notes' ? 2 : 3;
   const chapterPartners = (side: 'outgoing' | 'incoming'): PartnerBook[] =>
      (matrixState.data?.[side][chapter - 1] ?? [])
         .map((row) => ({ bookNumber: row[0], weight: row[column] }))
         .filter((partner) => partner.weight > 0)
         .sort((left, right) => right.weight - left.weight || left.bookNumber - right.bookNumber)
         .slice(0, 5);

   if (error) {
      return <PanelError error={error} />;
   }

   if (!stats) {
      return <Card><PanelSkeleton rows={4} /></Card>;
   }

   const max = Math.max(1, ...stats.map((stat) => stat.incoming + stat.outgoing));
   const describe = (stat: ChapterStat): string =>
      t('insights.book.chapters.bar', {
         chapter: stat.label,
         incoming: formatNumber(stat.incoming),
         outgoing: formatNumber(stat.outgoing),
      });

   return (
      <Card as="section" aria-labelledby="ins-book-chapters">
         <CardHeader
            title={<span id="ins-book-chapters">{t('insights.book.chapters.title')}</span>}
            description={
               densest
                  ? t('insights.book.chapters.finding', {
                     chapter: densest.label,
                     count: formatNumber(densest.incoming + densest.outgoing),
                  })
                  : undefined
            }
         />
         <div className="ins-spark-scroll">
            <div className="ins-spark" style={{ '--ins-chapters': stats.length } as React.CSSProperties}>
               <span className="ins-spark__max tabular" aria-hidden="true">{formatNumber(max)}</span>
               <ol className="ins-spark__bars">
                  {stats.map((stat) => {
                     const label = describe(stat);

                     return (
                        <li key={stat.chapterNumber}>
                           <ChapterLink
                              bookNumber={stat.bookNumber}
                              chapterNumber={stat.chapterNumber}
                              params={carry}
                              className={stat.chapterNumber === chapter ? 'ins-spark__bar is-current' : 'ins-spark__bar'}
                              aria-label={label}
                              onPointerMove={(event) => {
                                 if (event.pointerType !== 'touch') {
                                    tooltip.showAt(event.clientX, event.clientY, label);
                                 }
                              }}
                              onPointerLeave={tooltip.hide}
                              onFocus={(event) => tooltip.showFor(event.currentTarget, label)}
                              onBlur={tooltip.hide}
                           >
                              <span style={{ height: `${(stat.outgoing / max) * 100}%`, background: 'var(--outgoing)' }} />
                              <span style={{ height: `${(stat.incoming / max) * 100}%`, background: 'var(--incoming)' }} />
                           </ChapterLink>
                           <span className="ins-spark__x tabular" aria-hidden="true">
                              {stat.chapterNumber === 1 || stat.chapterNumber % 10 === 0 || stats.length <= 12 ? stat.chapterNumber : ''}
                           </span>
                        </li>
                     );
                  })}
               </ol>
            </div>
         </div>
         <div className="ins-toolbar">
            <Legend
               label={t('insights.book.chapters.legend')}
               items={[
                  { label: t('insights.book.chapters.incoming'), color: 'var(--incoming)' },
                  { label: t('insights.book.chapters.outgoing'), color: 'var(--outgoing)' },
               ]}
            />
            <span className="t-caption">{t('insights.book.chapters.axis')}</span>
         </div>

         <div className="ins-chapter-detail">
            <div className="ins-toolbar">
               <h3 className="t-label">{t('insights.book.chapter.title')}</h3>
               <div className="ins-toolbar__group">
                  <Select
                     size="sm"
                     aria-label={t('insights.book.chapter.select')}
                     value={String(chapter)}
                     onChange={(value) => setChapterChoice(Number(value))}
                     options={stats.map((stat) => ({ value: String(stat.chapterNumber), label: stat.label }))}
                  />
                  <ChapterLink className="ins-more" bookNumber={book.bookNumber} chapterNumber={chapter} params={carry}>
                     <BookOpen size={14} aria-hidden="true" />
                     {t('insights.book.chapter.read')}
                  </ChapterLink>
               </div>
            </div>
            {matrixState.error ? <p className="t-caption">{t('insights.error.title')}</p> : null}
            {!matrixState.data && !matrixState.error ? <Skeleton lines={3} /> : null}
            {matrixState.data ? (
               <div className="ins-grid ins-grid--2">
                  {([ 'outgoing', 'incoming' ] as const).map((side) => {
                     const partners = chapterPartners(side);

                     return (
                        <div key={side}>
                           <p className="t-caption">
                              {side === 'outgoing' ? t('insights.book.chapter.cites') : t('insights.book.chapter.citedBy')}
                           </p>
                           {partners.length === 0 ? (
                              <p className="t-caption">{t('insights.empty.none')}</p>
                           ) : (
                              <ol className="ins-bar-list ins-bar-list--tight">
                                 {partners.map((partner) => {
                                    const other = books[partner.bookNumber - 1];

                                    return other ? (
                                       <BarRow
                                          key={partner.bookNumber}
                                          label={<BookLink book={other} params={carry} />}
                                          value={partner.weight}
                                          max={partners[0]?.weight ?? 0}
                                          color={side === 'outgoing' ? 'var(--outgoing)' : 'var(--incoming)'}
                                          unit={t('insights.unit.references')}
                                       />
                                    ) : null;
                                 })}
                              </ol>
                           )}
                        </div>
                     );
                  })}
               </div>
            ) : null}
         </div>
         <VizTooltip api={tooltip} />
      </Card>
   );
}

function BookHubs({ context, hasStudyNotes }: { context: ProfileContext; hasStudyNotes: boolean }): React.ReactElement {
   const t = useT();
   const { datasetId, book, books, kind, carry } = context;
   const [ metricChoice, setMetric ] = useState<HubMetric>('referenced');
   const metric: HubMetric = metricChoice === 'study' && !hasStudyNotes ? 'referenced' : metricChoice;
   const { data, error } = useAsyncData(
      async () => {
         const [ degrees, locator ] = await Promise.all([ loadVerseDegrees(datasetId), loadVerseLocator(datasetId) ]);

         return { degrees, locator };
      },
      [ datasetId ],
   );
   const rows = useMemo(
      () => (data ? rankHubs(data.degrees, data.locator, { metric, kind, bookNumber: book.bookNumber, limit: 8 }) : []),
      [ data, metric, kind, book.bookNumber ],
   );
   const textBooks = useMemo(() => [ book.bookNumber ], [ book.bookNumber ]);
   const verseText = useVerseTexts(datasetId, books, textBooks);

   return (
      <Card as="section" aria-labelledby="ins-book-hubs">
         <CardHeader
            title={<span id="ins-book-hubs">{t('insights.book.hubs.title', { book: book.name })}</span>}
            description={t('insights.book.hubs.description')}
            action={
               <Tabs
                  label={t('insights.hubs.metric.label')}
                  variant="pill"
                  size="sm"
                  value={metric}
                  onChange={setMetric}
                  items={[
                     { value: 'referenced', label: t('insights.book.hubs.referenced') },
                     { value: 'referring', label: t('insights.book.hubs.referring') },
                  ]}
               />
            }
         />
         {error ? <PanelError error={error} /> : null}
         {!data && !error ? <PanelSkeleton rows={6} /> : null}
         {data && rows.length === 0 ? <EmptyState size="inline" title={t('insights.empty.none')} /> : null}
         {data && rows.length > 0 ? (
            <ol className="ins-bar-list ins-hub-list" key={metric}>
               {rows.map((row, index) => {
                  const text = verseText(row.jwpubVerseId, row.bookNumber);

                  return (
                     <BarRow
                        key={row.jwpubVerseId}
                        rank={index + 1}
                        label={
                           <VerseLink
                              verse={{ ...row, label: data.locator.labelOf(row) }}
                              params={carry}
                              className="ins-link t-ref"
                           />
                        }
                        detail={
                           text === undefined
                              ? <Skeleton lines={1} />
                              : text
                                 ? <span className="ins-verse-preview">{text}</span>
                                 : null
                        }
                        value={row.value}
                        max={rows[0]?.value ?? 0}
                        color={metric === 'referring' ? 'var(--outgoing)' : 'var(--incoming)'}
                        unit={t('insights.unit.references')}
                     />
                  );
               })}
            </ol>
         ) : null}
      </Card>
   );
}
