import { useMemo, useState } from 'react';

import { Card, Tabs } from '../../components/ui';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import { formatNumber } from '../../utils/format';
import { CANON_SECTIONS } from './canon';
import { loadChapterStats, loadVerseLocator } from './data';
import { bucketOf, chapterValue, quantileThresholds, type ChapterStat, type HeatmapMetric } from './heatmap';
import type { InsightsPanelProps } from './InsightsPage';
import {
   BookLink,
   ChapterLink,
   Finding,
   HeatLegend,
   PanelError,
   PanelSkeleton,
   VizTooltip,
   useVizTooltip,
} from './shared';

type Normalise = 'count' | 'perVerse';

const STEPS = 6;

function formatDensity(value: number): string {
   return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

/**
 * Chapter heatmap: one cell per chapter (1,189 links), coloured by how many references touch
 * it. Cells wrap inside each book row, so the grid never needs page-level horizontal scroll.
 */
export function ChapterHeatmap({ datasetId, books, location }: InsightsPanelProps): React.ReactElement {
   const t = useT();
   const tooltip = useVizTooltip();
   const [ metric, setMetric ] = useState<HeatmapMetric>('total');
   const [ normalise, setNormalise ] = useState<Normalise>('count');
   const { data: stats, error, showLoading } = useAsyncData(() => loadChapterStats(datasetId), [ datasetId ]);
   // Verse counts are only needed for the per-verse view; load them on demand.
   const locatorState = useAsyncData(
      () => (normalise === 'perVerse' ? loadVerseLocator(datasetId) : Promise.resolve(null)),
      [ datasetId, normalise ],
      { keepPreviousData: true },
   );
   const locator = normalise === 'perVerse' ? locatorState.data : null;
   const model = useMemo(() => {
      if (!stats) {
         return null;
      }

      const byBook = new Map<number, ChapterStat[]>();

      for (const stat of stats) {
         const list = byBook.get(stat.bookNumber);

         if (list) {
            list.push(stat);
         } else {
            byBook.set(stat.bookNumber, [ stat ]);
         }
      }

      const values = new Map<ChapterStat, number>();
      let densest: ChapterStat | null = null;

      for (const book of books) {
         const sizes = locator ? locator.chapterSizes(book.bookNumber, book.chapters) : null;

         for (const stat of byBook.get(book.bookNumber) ?? []) {
            const count = chapterValue(stat, metric);
            const verses = sizes?.[stat.chapterNumber - 1] ?? 0;
            const value = sizes ? (verses > 0 ? count / verses : 0) : count;

            values.set(stat, value);

            if (!densest || value > (values.get(densest) ?? 0)) {
               densest = stat;
            }
         }
      }

      return { byBook, values, densest, thresholds: quantileThresholds(Array.from(values.values()), STEPS) };
   }, [ stats, books, metric, locator ]);

   if (error || locatorState.error) {
      return <PanelError error={(error ?? locatorState.error) as Error} />;
   }

   if (!model || showLoading) {
      return <PanelSkeleton rows={10} />;
   }

   const perVerse = normalise === 'perVerse' && locator !== null;
   const format = perVerse ? formatDensity : formatNumber;
   const describe = (stat: ChapterStat): string =>
      t(perVerse ? 'insights.heatmap.cell.perVerse' : 'insights.heatmap.cell.count', {
         chapter: stat.label,
         value: format(model.values.get(stat) ?? 0),
         incoming: formatNumber(stat.incoming),
         outgoing: formatNumber(stat.outgoing),
      });
   const showFromTarget = (target: EventTarget, pointer?: { x: number; y: number }): void => {
      const cell = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null;

      if (!cell) {
         tooltip.hide();

         return;
      }

      if (pointer) {
         tooltip.showAt(pointer.x, pointer.y, cell.dataset.tip);
      } else {
         tooltip.showFor(cell, cell.dataset.tip);
      }
   };

   return (
      <div className="ins-stack">
         {model.densest ? (
            <Finding>
               {t(perVerse ? 'insights.heatmap.finding.perVerse' : 'insights.heatmap.finding.count', {
                  chapter: model.densest.label,
                  value: format(model.values.get(model.densest) ?? 0),
               })}
            </Finding>
         ) : null}

         <Card as="section" aria-label={t('insights.tab.heatmap')}>
            <div className="ins-toolbar">
               <Tabs
                  label={t('insights.heatmap.metric.label')}
                  variant="pill"
                  size="sm"
                  value={metric}
                  onChange={setMetric}
                  items={[
                     { value: 'total', label: t('insights.heatmap.metric.total') },
                     { value: 'incoming', label: t('insights.heatmap.metric.incoming') },
                     { value: 'outgoing', label: t('insights.heatmap.metric.outgoing') },
                  ]}
               />
               <Tabs
                  label={t('insights.heatmap.normalise.label')}
                  variant="pill"
                  size="sm"
                  value={normalise}
                  onChange={setNormalise}
                  items={[
                     { value: 'count', label: t('insights.heatmap.normalise.count') },
                     { value: 'perVerse', label: t('insights.heatmap.normalise.perVerse') },
                  ]}
               />
            </div>

            <HeatLegend
               thresholds={model.thresholds}
               label={perVerse ? t('insights.heatmap.legend.perVerse') : t('insights.heatmap.legend.count')}
               format={format}
            />

            <div
               className="ins-hm"
               onPointerOver={(event) => {
                  if (event.pointerType !== 'touch') {
                     showFromTarget(event.target, { x: event.clientX, y: event.clientY });
                  }
               }}
               onPointerLeave={tooltip.hide}
               onFocus={(event) => showFromTarget(event.target)}
               onBlur={tooltip.hide}
            >
               {CANON_SECTIONS.map((section) => (
                  <section key={section.id} className="ins-hm__section" aria-label={t(section.labelKey)}>
                     <h2 className="ins-hm__section-title t-eyebrow">
                        <span className="ins-dot" style={{ background: section.color }} aria-hidden="true" />
                        {t(section.labelKey)}
                     </h2>
                     {books
                        .filter((book) => book.bookNumber >= section.first && book.bookNumber <= section.last)
                        .map((book) => (
                           <div key={book.bookNumber} className="ins-hm__row">
                              <BookLink book={book} params={location.carry} className="ins-hm__book" />
                              <div className="ins-hm__cells">
                                 {(model.byBook.get(book.bookNumber) ?? []).map((stat) => {
                                    const label = describe(stat);

                                    return (
                                       <ChapterLink
                                          key={stat.chapterNumber}
                                          bookNumber={stat.bookNumber}
                                          chapterNumber={stat.chapterNumber}
                                          params={location.carry}
                                          className={cx(
                                             'ins-hm__cell ins-heat',
                                             `ins-heat--${bucketOf(model.values.get(stat) ?? 0, model.thresholds)}`,
                                             stat.chapterNumber % 10 === 0 && 'ins-hm__cell--tenth',
                                          )}
                                          aria-label={label}
                                          data-tip={label}
                                       />
                                    );
                                 })}
                              </div>
                           </div>
                        ))}
                  </section>
               ))}
            </div>
            <p className="t-caption">{t('insights.heatmap.hint')}</p>
            <VizTooltip api={tooltip} />
         </Card>
      </div>
   );
}
