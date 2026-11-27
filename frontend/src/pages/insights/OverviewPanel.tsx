import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { VerseLink } from '../../components/VerseLink';
import { Button, Card, CardHeader, Tabs, VerseCard } from '../../components/ui';
import { loadBookMatrix, loadStatsSummary } from '../../data/generated';
import { rankBookPairs, testamentFlows, type TestamentFlowKey } from '../../graph/matrix';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useT } from '../../i18n';
import type { Book, VerseStat } from '../../types/generated';
import { formatNumber, formatPercent } from '../../utils/format';
import { canonColor } from './canon';
import { loadBookStats, type BookStat } from './data';
import type { InsightsPanelProps } from './InsightsPage';
import {
   BarRow,
   BookLink,
   ChapterLink,
   Finding,
   PanelError,
   PanelSkeleton,
   RouteLink,
   insightsUrl,
   pairUrl,
   useVerseTexts,
} from './shared';

type RankingSide = 'citing' | 'cited';

const RANKING_PREVIEW = 8;

/** Verse number from a citation label ("John 3:16" → 16); summary stats omit it. */
export function verseNumberFromLabel(label: string): number | null {
   const match = /[:.](\d{1,3})\s*$/.exec(label);

   return match ? Number(match[1]) : null;
}

function bookStatValue(stat: BookStat, side: RankingSide, kind: InsightsPanelProps['kind']): number {
   if (side === 'citing') {
      return kind === 'crossrefs'
         ? stat.outgoingCrossReferences
         : kind === 'study-notes'
            ? stat.outgoingStudyNoteReferences
            : stat.outgoingCombinedReferences;
   }

   return kind === 'crossrefs'
      ? stat.incomingCrossReferences
      : kind === 'study-notes'
         ? stat.incomingStudyNoteReferences
         : stat.incomingCombinedReferences;
}

export function OverviewPanel({ datasetId, books, kind, location }: InsightsPanelProps): React.ReactElement {
   const t = useT();
   const [ side, setSide ] = useState<RankingSide>('cited');
   const [ showAllBooks, setShowAllBooks ] = useState(false);
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ summary, bookStats, matrix ] = await Promise.all([
            loadStatsSummary(datasetId),
            loadBookStats(datasetId),
            loadBookMatrix(datasetId, kind),
         ]);

         return { summary, bookStats, matrix };
      },
      [ datasetId, kind ],
      { keepPreviousData: true },
   );
   const startVerses = useMemo(() => (data ? withVerseNumbers(data.summary.topReferencedVerses).slice(0, 4) : []), [ data ]);
   const verseText = useVerseTexts(
      datasetId,
      books,
      useMemo(() => startVerses.map((verse) => verse.bookNumber), [ startVerses ]),
   );
   const ranking = useMemo(() => {
      if (!data) {
         return [];
      }

      return data.bookStats
         .map((stat) => ({ stat, value: bookStatValue(stat, side, kind) }))
         .filter((row) => row.value > 0)
         .sort((left, right) => right.value - left.value || left.stat.bookNumber - right.stat.bookNumber);
   }, [ data, side, kind ]);
   const pairs = useMemo(() => (data ? rankBookPairs(data.matrix, books, { limit: 8 }) : []), [ data, books ]);
   const flows = useMemo(() => (data ? testamentFlows(data.matrix, books) : null), [ data, books ]);

   if (error) {
      return <PanelError error={error} />;
   }

   if (!data || !flows || showLoading) {
      return <PanelSkeleton rows={8} />;
   }

   const { summary } = data;
   const bookByNumber = (bookNumber: number): Book | undefined => books[bookNumber - 1];
   const rankingRows = showAllBooks ? ranking : ranking.slice(0, RANKING_PREVIEW);
   const rankingMax = ranking[0]?.value ?? 0;
   const flowTotal = flows['OT->OT'] + flows['OT->NT'] + flows['NT->OT'] + flows['NT->NT'];
   const crossTestament = flows['OT->NT'] + flows['NT->OT'];
   const flowMax = Math.max(flows['OT->OT'], flows['OT->NT'], flows['NT->OT'], flows['NT->NT']);
   const citingVerses = withVerseNumbers(summary.topSourceVerses).slice(0, 6);
   const stats = [
      { label: t('insights.overview.stat.references'), value: summary.totalCombinedReferences },
      {
         label: t('insights.overview.stat.crossrefs'),
         value: summary.totalCrossReferences,
         detail: formatPercent(summary.totalCrossReferences, summary.totalCombinedReferences),
      },
      {
         label: t('insights.overview.stat.studyNotes'),
         value: summary.totalStudyNoteReferences,
         detail: formatPercent(summary.totalStudyNoteReferences, summary.totalCombinedReferences),
      },
      { label: t('insights.overview.stat.citedVerses'), value: summary.distinctTargetVerses },
      { label: t('insights.overview.stat.bookLinks'), value: summary.distinctBookToBookLinks },
   ].filter((stat) => stat.value > 0);

   return (
      <div className="ins-stack">
         <Finding>
            {t('insights.overview.finding', {
               references: formatNumber(summary.totalCombinedReferences),
               verses: formatNumber(summary.extraction.mappedVerses),
               share: formatPercent(summary.totalCrossReferences, summary.totalCombinedReferences),
            })}
         </Finding>

         <dl className="ins-stat-strip stagger" aria-label={t('insights.overview.stats.label')}>
            {stats.map((stat) => (
               <div key={stat.label} className="ins-stat">
                  <dt>{stat.label}</dt>
                  <dd>
                     <span className="t-numeral">{formatNumber(stat.value)}</span>
                     {stat.detail ? <span className="ins-stat__detail">{stat.detail}</span> : null}
                  </dd>
               </div>
            ))}
         </dl>

         <section aria-labelledby="ins-start-title" className="ins-section">
            <div className="ins-section__head">
               <div>
                  <h2 id="ins-start-title" className="t-title">
                     {t('insights.overview.start.title')}
                  </h2>
                  <p className="t-caption">{t('insights.overview.start.description')}</p>
               </div>
               <RouteLink className="ins-more" href={insightsUrl({ ...location, tab: 'hubs', pair: null, book: null, flow: null })}>
                  {t('insights.overview.start.more')}
                  <ArrowRight size={14} aria-hidden="true" />
               </RouteLink>
            </div>
            <div className="ins-verse-grid stagger">
               {startVerses.map((verse) => (
                  <VerseLink
                     key={verse.verseId}
                     verse={verse}
                     params={location.carry}
                     className="ins-card-link"
                     aria-label={t('insights.overview.start.open', { verse: verse.label, count: formatNumber(verse.count) })}
                  >
                     <VerseCard
                        reference={verse.label}
                        text={verseText(verse.verseId, verse.bookNumber)}
                        density="compact"
                        meta={t('insights.count.citedBy', { count: formatNumber(verse.count) })}
                     />
                  </VerseLink>
               ))}
            </div>
         </section>

         <div className="ins-grid ins-grid--2">
            <Card as="section" aria-labelledby="ins-books-title">
               <CardHeader
                  title={<span id="ins-books-title">{t('insights.overview.books.title')}</span>}
                  description={
                     side === 'cited'
                        ? t('insights.overview.books.citedDescription')
                        : t('insights.overview.books.citingDescription')
                  }
                  action={
                     <Tabs
                        label={t('insights.overview.books.title')}
                        variant="pill"
                        size="sm"
                        value={side}
                        onChange={setSide}
                        items={[
                           { value: 'cited', label: t('insights.overview.books.cited') },
                           { value: 'citing', label: t('insights.overview.books.citing') },
                        ]}
                     />
                  }
               />
               <ol className="ins-bar-list" key={`${side}:${kind}`}>
                  {rankingRows.map((row, index) => {
                     const book = bookByNumber(row.stat.bookNumber);

                     return (
                        <BarRow
                           key={row.stat.bookNumber}
                           rank={index + 1}
                           label={
                              book
                                 ? <BookLink book={book} params={location.carry} />
                                 : row.stat.book
                           }
                           value={row.value}
                           max={rankingMax}
                           color={canonColor(row.stat.bookNumber)}
                           unit={t('insights.unit.references')}
                        />
                     );
                  })}
               </ol>
               {ranking.length > RANKING_PREVIEW ? (
                  <Button
                     variant="ghost"
                     size="sm"
                     aria-expanded={showAllBooks}
                     onClick={() => setShowAllBooks((value) => !value)}
                  >
                     {showAllBooks
                        ? t('insights.action.showFewer')
                        : t('insights.overview.books.showAll', { count: ranking.length })}
                  </Button>
               ) : null}
            </Card>

            <div className="ins-stack">
               <Card as="section" aria-labelledby="ins-testament-title">
                  <CardHeader
                     title={<span id="ins-testament-title">{t('insights.overview.testament.title')}</span>}
                     description={t('insights.overview.testament.finding', {
                        share: formatPercent(crossTestament, flowTotal),
                        ntToOt: formatNumber(flows['NT->OT']),
                        otToNt: formatNumber(flows['OT->NT']),
                     })}
                  />
                  <table className="ins-flow-matrix">
                     <caption className="visually-hidden">{t('insights.overview.testament.caption')}</caption>
                     <thead>
                        <tr>
                           <td />
                           <th scope="col">{t('insights.testament.citesHebrew')}</th>
                           <th scope="col">{t('insights.testament.citesGreek')}</th>
                        </tr>
                     </thead>
                     <tbody>
                        {([ 'OT', 'NT' ] as const).map((source) => (
                           <tr key={source}>
                              <th scope="row">
                                 {source === 'OT' ? t('insights.testament.hebrew') : t('insights.testament.greek')}
                              </th>
                              {([ 'OT', 'NT' ] as const).map((target) => {
                                 const key = `${source}->${target}` as TestamentFlowKey;
                                 const value = flows[key];
                                 const strength = flowMax > 0 ? Math.round((value / flowMax) * 100) : 0;

                                 return (
                                    <td key={target}>
                                       <RouteLink
                                          className="ins-flow-matrix__cell"
                                          style={{ '--ins-strength': `${Math.max(6, strength)}%` } as React.CSSProperties}
                                          href={insightsUrl({
                                             ...location,
                                             tab: 'flows',
                                             pair: null,
                                             book: null,
                                             flow: `${source.toLowerCase()}-${target.toLowerCase()}`,
                                          })}
                                          aria-label={t('insights.overview.testament.cell', {
                                             source: source === 'OT' ? t('insights.testament.hebrew') : t('insights.testament.greek'),
                                             target: target === 'OT' ? t('insights.testament.hebrew') : t('insights.testament.greek'),
                                             count: formatNumber(value),
                                          })}
                                       >
                                          <span className="t-numeral">{formatNumber(value)}</span>
                                          <span className="t-caption">{formatPercent(value, flowTotal)}</span>
                                       </RouteLink>
                                    </td>
                                 );
                              })}
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </Card>

               <Card as="section" aria-labelledby="ins-pairs-title">
                  <CardHeader
                     title={<span id="ins-pairs-title">{t('insights.overview.pairs.title')}</span>}
                     description={t('insights.overview.pairs.description')}
                     action={
                        <RouteLink
                           className="ins-more"
                           href={insightsUrl({ ...location, tab: 'flows', pair: null, book: null, flow: null })}
                        >
                           {t('insights.action.seeAll')}
                           <ArrowRight size={14} aria-hidden="true" />
                        </RouteLink>
                     }
                  />
                  <ol className="ins-bar-list" key={kind}>
                     {pairs.map((pair, index) => (
                        <BarRow
                           key={`${pair.sourceBookNumber}-${pair.targetBookNumber}`}
                           rank={index + 1}
                           label={
                              <RouteLink
                                 className="ins-link"
                                 href={pairUrl(pair.sourceBookNumber, pair.targetBookNumber, location)}
                              >
                                 {t('insights.pair.label', {
                                    source: bookByNumber(pair.sourceBookNumber)?.name ?? pair.sourceBookNumber,
                                    target: bookByNumber(pair.targetBookNumber)?.name ?? pair.targetBookNumber,
                                 })}
                              </RouteLink>
                           }
                           value={pair.weight}
                           max={pairs[0]?.weight ?? 0}
                           color={canonColor(pair.sourceBookNumber)}
                           unit={t('insights.unit.references')}
                        />
                     ))}
                  </ol>
               </Card>
            </div>
         </div>

         <div className="ins-grid ins-grid--2">
            <Card as="section" aria-labelledby="ins-citing-title">
               <CardHeader
                  title={<span id="ins-citing-title">{t('insights.overview.citing.title')}</span>}
                  description={t('insights.overview.citing.description')}
                  action={
                     <RouteLink className="ins-more" href={insightsUrl({ ...location, tab: 'hubs', pair: null, book: null, flow: null })}>
                        {t('insights.action.seeAll')}
                        <ArrowRight size={14} aria-hidden="true" />
                     </RouteLink>
                  }
               />
               <ol className="ins-bar-list">
                  {citingVerses.map((verse, index) => (
                     <BarRow
                        key={verse.verseId}
                        rank={index + 1}
                        label={<VerseLink verse={verse} params={location.carry} className="ins-link t-ref" />}
                        value={verse.count}
                        max={citingVerses[0]?.count ?? 0}
                        color="var(--outgoing)"
                        unit={t('insights.unit.references')}
                     />
                  ))}
               </ol>
            </Card>

            <Card as="section" aria-labelledby="ins-dense-title">
               <CardHeader
                  title={<span id="ins-dense-title">{t('insights.overview.chapters.title')}</span>}
                  description={t('insights.overview.chapters.description')}
                  action={
                     <RouteLink
                        className="ins-more"
                        href={insightsUrl({ ...location, tab: 'heatmap', pair: null, book: null, flow: null })}
                     >
                        {t('insights.overview.chapters.more')}
                        <ArrowRight size={14} aria-hidden="true" />
                     </RouteLink>
                  }
               />
               <ol className="ins-bar-list">
                  {summary.topDenseChapters.slice(0, 6).map((chapter, index) => (
                     <BarRow
                        key={chapter.label}
                        rank={index + 1}
                        label={
                           <ChapterLink
                              className="ins-link t-ref"
                              bookNumber={chapter.bookNumber}
                              chapterNumber={chapter.chapterNumber}
                              params={location.carry}
                           >
                              {chapter.label}
                           </ChapterLink>
                        }
                        value={chapter.count}
                        max={summary.topDenseChapters[0]?.count ?? 0}
                        unit={t('insights.unit.references')}
                     />
                  ))}
               </ol>
            </Card>
         </div>
      </div>
   );
}

type LinkableVerse = VerseStat & { verseNumber: number };

function withVerseNumbers(verses: VerseStat[]): LinkableVerse[] {
   return verses.flatMap((verse) => {
      const verseNumber = verseNumberFromLabel(verse.label);

      return verseNumber === null ? [] : [ { ...verse, verseNumber } ];
   });
}
