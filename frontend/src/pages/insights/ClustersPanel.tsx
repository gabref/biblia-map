import { useMemo, useState } from 'react';

import { VerseLink } from '../../components/VerseLink';
import { Button, Card, CardHeader, EmptyState, Select, Skeleton, Tabs } from '../../components/ui';
import {
   headlineFromSummary,
   type ClusterHeadline,
   type ClusterSizeBucket,
   type ClusterSummary,
   type ReferenceCluster,
} from '../../graph/relationshipComponents';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useT } from '../../i18n';
import type { Book } from '../../types/generated';
import { formatNumber, formatPercent } from '../../utils/format';
import { canonColor } from './canon';
import { loadClusterHeadline, loadClusterSummary, loadVerseLocator } from './data';
import type { InsightsPanelProps } from './InsightsPage';
import type { VerseLocator } from './locator';
import { BookLink, Finding, PanelError, PanelSkeleton, usePagedList, useVerseTexts } from './shared';

type ClusterView = 'clusters' | 'isolated';
type SizeFilter = 'groups' | 'pairs';

const CLUSTER_PAGE = 9;
const ISOLATED_PAGE = 80;
const MEMBER_PREVIEW = 10;

/**
 * Clusters: the connected components of the reference graph, told as a finding. The main web is
 * summarised; the study material is the small self-contained clusters and the verses that no
 * reference touches. The union-find runs once per dataset per session (see `data.ts`).
 */
export function ClustersPanel({ datasetId, books, location }: InsightsPanelProps): React.ReactElement {
   const t = useT();
   const [ view, setView ] = useState<ClusterView>('clusters');
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ summary, locator ] = await Promise.all([ loadClusterSummary(datasetId), loadVerseLocator(datasetId) ]);

         return { summary, locator };
      },
      [ datasetId ],
   );
   // Precomputed totals (when the edition ships them) show the finding before the union-find ends.
   const precomputed = useAsyncData(() => loadClusterHeadline(datasetId), [ datasetId ]);

   if (error) {
      return <PanelError error={error} />;
   }

   if (!data) {
      return (
         <div className="ins-stack">
            {precomputed.data ? <ClusterFinding headline={precomputed.data} /> : null}
            {precomputed.data || showLoading ? <PanelSkeleton rows={10} label={t('insights.clusters.loading')} /> : null}
         </div>
      );
   }

   const { summary, locator } = data;
   const giantSize = summary.giant?.size ?? 0;
   const segments = [
      { id: 'giant', label: t('insights.clusters.segment.giant'), value: giantSize, color: 'var(--accent)' },
      { id: 'small', label: t('insights.clusters.segment.small'), value: summary.smallClusterVerses, color: 'var(--gilt)' },
      { id: 'isolated', label: t('insights.clusters.segment.isolated'), value: summary.isolatedCount, color: 'var(--ink-3)' },
   ];

   return (
      <div className="ins-stack">
         <ClusterFinding headline={headlineFromSummary(summary)} />

         <div className="ins-grid ins-grid--2">
            <Card as="section" aria-labelledby="ins-strip-title">
               <CardHeader
                  title={<span id="ins-strip-title">{t('insights.clusters.strip.title')}</span>}
                  description={t('insights.clusters.strip.description', { total: formatNumber(summary.totalVerses) })}
               />
               <div className="ins-strip" role="img" aria-label={segments.map((segment) => `${segment.label}: ${formatNumber(segment.value)}`).join(', ')}>
                  {segments.filter((segment) => segment.value > 0).map((segment) => (
                     <span
                        key={segment.id}
                        className="ins-strip__segment anim-grow-x"
                        style={{ flexGrow: segment.value, background: segment.color }}
                     />
                  ))}
               </div>
               <dl className="ins-strip-legend">
                  {segments.map((segment) => (
                     <div key={segment.id}>
                        <dt>
                           <span className="ins-legend__swatch" style={{ background: segment.color }} aria-hidden="true" />
                           {segment.label}
                        </dt>
                        <dd>
                           {formatNumber(segment.value)}
                           <span className="t-caption"> {formatPercent(segment.value, summary.totalVerses)}</span>
                        </dd>
                     </div>
                  ))}
               </dl>
               {summary.giant ? (
                  <div className="ins-giant">
                     <h3 className="t-label">{t('insights.clusters.giant.title')}</h3>
                     <p className="t-caption">
                        {t('insights.clusters.giant.description', {
                           verses: formatNumber(summary.giant.size),
                           links: formatNumber(summary.giant.edgeCount),
                        })}
                     </p>
                     <ul className="ins-chip-list">
                        {summary.giant.books.slice(0, 8).map((entry) => {
                           const book = books[entry.bookNumber - 1];

                           return book ? (
                              <li key={entry.bookNumber}>
                                 <BookLink book={book} params={location.carry} className="ins-book-chip">
                                    <span className="ins-dot" style={{ background: canonColor(book.bookNumber) }} aria-hidden="true" />
                                    {book.name}
                                    <span className="tabular">{formatNumber(entry.count)}</span>
                                 </BookLink>
                              </li>
                           ) : null;
                        })}
                     </ul>
                  </div>
               ) : null}
            </Card>

            <Card as="section" aria-labelledby="ins-histogram-title">
               <CardHeader
                  title={<span id="ins-histogram-title">{t('insights.clusters.histogram.title')}</span>}
                  description={t('insights.clusters.histogram.description')}
               />
               <SizeHistogram buckets={summary.sizeBuckets} />
            </Card>
         </div>

         <Card as="section" aria-label={t('insights.clusters.browse.label')}>
            <Tabs
               label={t('insights.clusters.browse.label')}
               variant="underline"
               value={view}
               onChange={setView}
               items={[
                  { value: 'clusters', label: t('insights.clusters.tab.clusters'), count: formatNumber(summary.smallClusters.length) },
                  { value: 'isolated', label: t('insights.clusters.tab.isolated'), count: formatNumber(summary.isolatedCount) },
               ]}
            />
            {view === 'clusters' ? (
               <SmallClusters datasetId={datasetId} books={books} summary={summary} locator={locator} location={location} />
            ) : (
               <IsolatedVerses datasetId={datasetId} books={books} summary={summary} locator={locator} location={location} />
            )}
         </Card>
      </div>
   );
}

/** Cluster-size histogram: power-of-two size classes on x, number of clusters on a log y axis. */
function ClusterFinding({ headline }: { headline: ClusterHeadline }): React.ReactElement {
   const t = useT();

   return (
      <Finding>
         {t('insights.clusters.finding', {
            share: formatPercent(headline.giantSize, headline.totalVerses),
            total: formatNumber(headline.totalVerses),
            clusters: formatNumber(headline.smallClusterCount),
            isolated: formatNumber(headline.isolatedCount),
         })}
      </Finding>
   );
}

function SizeHistogram({ buckets }: { buckets: ClusterSizeBucket[] }): React.ReactElement {
   const t = useT();
   const maxLog = Math.max(1, ...buckets.map((bucket) => Math.log10(bucket.clusters + 1)));
   const ticks = [ 1, 10, 100, 1000, 10000 ].filter((tick) => Math.log10(tick + 1) <= maxLog * 1.02);
   const rangeLabel = (bucket: ClusterSizeBucket): string =>
      bucket.min === bucket.max
         ? formatNumber(bucket.min)
         : bucket.min >= 1024
            ? `${formatNumber(bucket.min)}+`
            : `${formatNumber(bucket.min)}–${formatNumber(bucket.max)}`;

   return (
      <figure className="ins-histogram">
         <div className="ins-histogram__plot">
            <span className="ins-histogram__ylabel t-caption">{t('insights.clusters.histogram.y')}</span>
            <div className="ins-histogram__area">
               {ticks.map((tick) => (
                  <span
                     key={tick}
                     className="ins-histogram__tick tabular"
                     style={{ bottom: `${(Math.log10(tick + 1) / maxLog) * 100}%` }}
                     aria-hidden="true"
                  >
                     {formatNumber(tick)}
                  </span>
               ))}
               <ol className="ins-histogram__bars">
                  {buckets.map((bucket, index) => {
                     const gap = index > 0 && bucket.min > buckets[index - 1].max + 1;

                     return (
                        <li key={bucket.min} className={gap ? 'has-gap' : undefined}>
                           <span className="ins-histogram__value tabular">{formatNumber(bucket.clusters)}</span>
                           <span
                              className="ins-histogram__bar"
                              style={{ height: `${(Math.log10(bucket.clusters + 1) / maxLog) * 100}%` }}
                              aria-hidden="true"
                           />
                           <span className="ins-histogram__x tabular">{rangeLabel(bucket)}</span>
                           <span className="visually-hidden">
                              {t('insights.clusters.histogram.bar', {
                                 range: rangeLabel(bucket),
                                 clusters: formatNumber(bucket.clusters),
                              })}
                           </span>
                        </li>
                     );
                  })}
               </ol>
            </div>
         </div>
         <figcaption className="t-caption">{t('insights.clusters.histogram.x')}</figcaption>
      </figure>
   );
}

interface BrowseProps {
   datasetId: string;
   books: Book[];
   summary: ClusterSummary;
   locator: VerseLocator;
   location: InsightsPanelProps['location'];
}

function SmallClusters({ datasetId, books, summary, locator, location }: BrowseProps): React.ReactElement {
   const t = useT();
   const [ filter, setFilter ] = useState<SizeFilter>('groups');
   const groups = useMemo(() => summary.smallClusters.filter((cluster) => cluster.size >= 3), [ summary ]);
   const pairs = useMemo(() => summary.smallClusters.filter((cluster) => cluster.size === 2), [ summary ]);
   const effective: SizeFilter = filter === 'groups' && groups.length === 0 ? 'pairs' : filter;
   const clusters = effective === 'groups' ? groups : pairs;
   const paged = usePagedList(clusters, CLUSTER_PAGE, `${datasetId}:${effective}`);

   if (summary.smallClusters.length === 0) {
      return <EmptyState size="inline" title={t('insights.clusters.none.title')} description={t('insights.clusters.none.body')} />;
   }

   return (
      <div className="ins-stack ins-stack--tight">
         <div className="ins-toolbar">
            <p className="t-caption">{t('insights.clusters.small.description')}</p>
            <Tabs
               label={t('insights.clusters.size.label')}
               variant="pill"
               size="sm"
               value={effective}
               onChange={setFilter}
               items={[
                  { value: 'groups', label: t('insights.clusters.size.groups'), count: formatNumber(groups.length), disabled: groups.length === 0 },
                  { value: 'pairs', label: t('insights.clusters.size.pairs'), count: formatNumber(pairs.length), disabled: pairs.length === 0 },
               ]}
            />
         </div>
         <ul className="ins-cluster-grid">
            {paged.visible.map((cluster) => (
               <ClusterCard
                  key={cluster.id}
                  datasetId={datasetId}
                  books={books}
                  cluster={cluster}
                  locator={locator}
                  location={location}
               />
            ))}
         </ul>
         {paged.hasMore ? (
            <Button variant="secondary" size="sm" onClick={paged.showMore}>
               {t('insights.action.showMore', { count: Math.min(CLUSTER_PAGE, paged.remaining) })}
            </Button>
         ) : null}
      </div>
   );
}

interface ClusterCardProps {
   datasetId: string;
   books: Book[];
   cluster: ReferenceCluster;
   locator: VerseLocator;
   location: InsightsPanelProps['location'];
}

function ClusterCard({ datasetId, books, cluster, locator, location }: ClusterCardProps): React.ReactElement {
   const t = useT();
   const [ expanded, setExpanded ] = useState(false);
   const members = expanded ? cluster.verseIds : cluster.verseIds.slice(0, MEMBER_PREVIEW);
   const textBooks = useMemo(
      () => (expanded ? cluster.books.map((entry) => entry.bookNumber) : []),
      [ expanded, cluster ],
   );
   const verseText = useVerseTexts(datasetId, books, textBooks);
   const hidden = cluster.verseIds.length - members.length;

   return (
      <li className="ins-cluster">
         <div className="ins-cluster__head">
            <h3 className="t-label">
               {t('insights.clusters.card.title', { verses: formatNumber(cluster.size), links: formatNumber(cluster.edgeCount) })}
            </h3>
            <p className="t-caption">
               {cluster.books.map((entry, index) => {
                  const book = books[entry.bookNumber - 1];

                  return book ? (
                     <span key={entry.bookNumber}>
                        {index > 0 ? ' · ' : ''}
                        <BookLink book={book} params={location.carry} />
                     </span>
                  ) : null;
               })}
            </p>
         </div>
         <ul className={expanded ? 'ins-cluster__verses' : 'ins-chip-list'}>
            {members.map((verseId) => {
               const verse = locator.locate(verseId);

               if (!verse) {
                  return null;
               }

               const link = (
                  <VerseLink
                     verse={{ ...verse, label: locator.labelOf(verse) }}
                     params={location.carry}
                     className={expanded ? 'ins-link t-ref' : 'ins-verse-chip t-ref'}
                  />
               );

               if (!expanded) {
                  return <li key={verseId}>{link}</li>;
               }

               const text = verseText(verseId, verse.bookNumber);

               return (
                  <li key={verseId}>
                     {link}
                     {text === undefined ? <Skeleton lines={1} /> : text ? <p className="ins-pair-row__text">{text}</p> : null}
                  </li>
               );
            })}
            {hidden > 0 ? <li className="t-caption">{t('insights.clusters.card.more', { count: hidden })}</li> : null}
         </ul>
         <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? t('insights.clusters.card.hideText') : t('insights.clusters.card.showText')}
         </Button>
      </li>
   );
}

function IsolatedVerses({ datasetId, books, summary, locator, location }: BrowseProps): React.ReactElement {
   const t = useT();
   const largest = useMemo(() => {
      let best: { bookNumber: number; verseIds: number[] } | null = null;

      for (const item of summary.isolatedByBook) {
         if (!best || item.verseIds.length > best.verseIds.length) {
            best = item;
         }
      }

      return best?.bookNumber ?? null;
   }, [ summary ]);
   const [ bookChoice, setBookChoice ] = useState<string>('');
   const bookNumber = bookChoice === '' ? largest : Number(bookChoice);
   const entry = summary.isolatedByBook.find((item) => item.bookNumber === bookNumber);
   const paged = usePagedList(entry?.verseIds ?? [], ISOLATED_PAGE, `${datasetId}:${bookNumber}`);
   const book = bookNumber ? books[bookNumber - 1] : undefined;

   if (summary.isolatedCount === 0 || !entry || !book) {
      return <EmptyState size="inline" title={t('insights.clusters.isolated.none.title')} description={t('insights.clusters.isolated.none.body')} />;
   }

   return (
      <div className="ins-stack ins-stack--tight">
         <div className="ins-toolbar">
            <p className="t-caption">
               {t('insights.clusters.isolated.description', {
                  book: book.name,
                  count: formatNumber(entry.verseIds.length),
               })}
            </p>
            <Select
               size="sm"
               aria-label={t('insights.clusters.isolated.book')}
               value={String(bookNumber)}
               onChange={setBookChoice}
               options={summary.isolatedByBook.map((item) => ({
                  value: String(item.bookNumber),
                  label: `${books[item.bookNumber - 1]?.name ?? item.bookNumber} (${formatNumber(item.verseIds.length)})`,
               }))}
            />
         </div>
         <ul className="ins-chip-list">
            {paged.visible.map((verseId) => {
               const verse = locator.locate(verseId);

               return verse ? (
                  <li key={verseId}>
                     <VerseLink
                        verse={{ ...verse, label: locator.labelOf(verse) }}
                        params={location.carry}
                        className="ins-verse-chip t-ref"
                     />
                  </li>
               ) : null;
            })}
         </ul>
         {paged.hasMore ? (
            <Button variant="secondary" size="sm" onClick={paged.showMore}>
               {t('insights.action.showMore', { count: Math.min(ISOLATED_PAGE, paged.remaining) })}
            </Button>
         ) : null}
         <p className="t-caption">{t('insights.clusters.isolated.note')}</p>
      </div>
   );
}
