import { useMemo, useState } from 'react';

import { VerseLink } from '../../components/VerseLink';
import { Button, Card, EmptyState, Select, Skeleton, Tabs, type TabItem } from '../../components/ui';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useT } from '../../i18n';
import type { Testament } from '../../types/generated';
import { formatNumber } from '../../utils/format';
import { loadVerseDegrees, loadVerseLocator } from './data';
import { rankHubs, type HubMetric } from './hubs';
import type { InsightsPanelProps } from './InsightsPage';
import { BarRow, BookLink, Finding, PanelError, PanelSkeleton, usePagedList, useVerseTexts } from './shared';

const HUB_LIMIT = 100;
const PAGE_SIZE = 20;

type TestamentFilter = 'all' | Testament;

/**
 * Hub verses: the 100 most cited / most citing verses, filterable by testament and book.
 * Only one page of rows is in the DOM at a time, and verse text is fetched for that page only.
 */
export function HubVerses({ datasetId, books, kind, hasStudyNotes, location }: InsightsPanelProps): React.ReactElement {
   const t = useT();
   const [ metricChoice, setMetric ] = useState<HubMetric>('referenced');
   const [ testament, setTestament ] = useState<TestamentFilter>('all');
   const [ bookValue, setBookValue ] = useState('');
   const metric: HubMetric = metricChoice === 'study' && !hasStudyNotes ? 'referenced' : metricChoice;
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ degrees, locator ] = await Promise.all([ loadVerseDegrees(datasetId), loadVerseLocator(datasetId) ]);

         return { degrees, locator };
      },
      [ datasetId ],
   );
   const bookNumber = bookValue === '' ? undefined : Number(bookValue);
   const selectedBook = bookNumber ? books[bookNumber - 1] : undefined;
   const rows = useMemo(
      () =>
         data
            ? rankHubs(data.degrees, data.locator, {
               metric,
               kind,
               bookNumber,
               testament: bookNumber === undefined && testament !== 'all' ? testament : undefined,
               limit: HUB_LIMIT,
            })
            : [],
      [ data, metric, kind, bookNumber, testament ],
   );
   const paged = usePagedList(rows, PAGE_SIZE, `${datasetId}:${metric}:${kind}:${bookValue}:${testament}`);
   const visibleBooks = useMemo(() => paged.visible.map((row) => row.bookNumber), [ paged.visible ]);
   const verseText = useVerseTexts(datasetId, books, visibleBooks);

   if (error) {
      return <PanelError error={error} />;
   }

   if (!data || showLoading) {
      return <PanelSkeleton rows={10} label={t('insights.hubs.loading')} />;
   }

   const metricTabs: TabItem<HubMetric>[] = [
      { value: 'referenced', label: t('insights.hubs.metric.referenced') },
      { value: 'referring', label: t('insights.hubs.metric.referring') },
      ...(hasStudyNotes ? [ { value: 'study' as const, label: t('insights.hubs.metric.study') } ] : []),
   ];
   const top = rows[0];
   const scopeName = selectedBook?.name
      ?? (testament === 'OT'
         ? t('insights.testament.hebrew')
         : testament === 'NT'
            ? t('insights.testament.greek')
            : t('insights.hubs.scope.all'));
   const unit = metric === 'referring' ? t('insights.unit.citations') : t('insights.unit.references');
   const barColor = metric === 'referring' ? 'var(--outgoing)' : metric === 'study' ? 'var(--both)' : 'var(--incoming)';

   return (
      <div className="ins-stack">
         {top ? (
            <Finding>
               {t(
                  metric === 'referring'
                     ? 'insights.hubs.finding.referring'
                     : metric === 'study'
                        ? 'insights.hubs.finding.study'
                        : 'insights.hubs.finding.referenced',
                  { verse: data.locator.labelOf(top), count: formatNumber(top.value), scope: scopeName },
               )}
            </Finding>
         ) : null}

         <Card as="section" aria-label={t('insights.tab.hubs')}>
            <div className="ins-toolbar">
               <Tabs
                  label={t('insights.hubs.metric.label')}
                  variant="pill"
                  size="sm"
                  items={metricTabs}
                  value={metric}
                  onChange={setMetric}
               />
               <div className="ins-toolbar__group">
                  <Tabs
                     label={t('insights.hubs.testament.label')}
                     variant="pill"
                     size="sm"
                     value={bookNumber === undefined ? testament : 'all'}
                     onChange={(value) => {
                        setTestament(value);
                        setBookValue('');
                     }}
                     items={[
                        { value: 'all', label: t('insights.hubs.testament.all') },
                        { value: 'OT', label: t('insights.testament.hebrewShort') },
                        { value: 'NT', label: t('insights.testament.greekShort') },
                     ]}
                  />
                  <Select
                     size="sm"
                     aria-label={t('insights.hubs.book.label')}
                     value={bookValue}
                     onChange={setBookValue}
                     options={[
                        { value: '', label: t('insights.hubs.book.all') },
                        ...books.map((book) => ({ value: String(book.bookNumber), label: book.name })),
                     ]}
                  />
               </div>
            </div>

            <p className="t-caption ins-toolbar__note" role="status">
               {t('insights.hubs.showing', {
                  shown: formatNumber(paged.visible.length),
                  total: formatNumber(rows.length),
                  scope: scopeName,
               })}
               {selectedBook ? (
                  <>
                     {' · '}
                     <BookLink book={selectedBook} params={location.carry}>
                        {t('insights.book.open', { book: selectedBook.name })}
                     </BookLink>
                  </>
               ) : null}
            </p>

            {rows.length === 0 ? (
               <EmptyState size="inline" title={t('insights.hubs.empty.title')} description={t('insights.hubs.empty.body')} />
            ) : (
               <ol className="ins-bar-list ins-hub-list">
                  {paged.visible.map((row, index) => {
                     const text = verseText(row.jwpubVerseId, row.bookNumber);

                     return (
                        <BarRow
                           key={row.jwpubVerseId}
                           rank={index + 1}
                           label={
                              <VerseLink
                                 verse={{ ...row, label: data.locator.labelOf(row) }}
                                 params={location.carry}
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
                           max={top?.value ?? 0}
                           color={barColor}
                           unit={unit}
                           trailing={
                              <span className="ins-hub-meta t-caption tabular">
                                 {t('insights.hubs.meta', {
                                    incoming: formatNumber(row.incoming),
                                    outgoing: formatNumber(row.outgoing),
                                 })}
                              </span>
                           }
                        />
                     );
                  })}
               </ol>
            )}

            {paged.hasMore ? (
               <Button variant="secondary" size="sm" onClick={paged.showMore}>
                  {t('insights.action.showMore', { count: Math.min(PAGE_SIZE, paged.remaining) })}
               </Button>
            ) : null}
         </Card>
      </div>
   );
}
