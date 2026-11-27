/**
 * Search-first Home (`/`, owner E-A): value prop + large search, "start here" examples,
 * "continue where you left off", a 3-step hint on first visit, edition picker, link to Insights.
 * The old Overview analytics now live at `/insights` (E-D).
 */
import { ArrowRight, BarChart3, BookmarkPlus, Network, Search, X } from 'lucide-react';
import { useState } from 'react';

import { Card, IconButton } from '../components/ui';
import { VerseCard } from '../components/ui/VerseCard';
import { VerseLink } from '../components/VerseLink';
import { VerseSearchPanel } from '../components/VerseSearch';
import { useInView } from '../hooks/useInView';
import { useT, type MessageKey } from '../i18n';
import { cx } from '../lib/cx';
import { AppLink } from '../routing/AppLink';
import { datasetDescriptionKey, datasetName } from '../routing/datasetNames';
import { insightsHref, type RouteParams, type VerseLocation } from '../routing/routes';
import { bookDisplayName, resultHref, searchCitations, useSearchData, useVersePreview, type SearchData } from '../search';
import { parseVerseKey, useHistory } from '../study/store';
import type { DatasetRegistryEntry } from '../types/generated';
import { readStoredValue, writeStoredValue } from '../utils/storage';
import './HomePage.css';

export interface HomePageProps {
   datasetId: string;
   datasets: readonly DatasetRegistryEntry[];
   onDatasetChange: (datasetId: string) => void;
   params: RouteParams;
   /** BCP-47 language of the dataset, for scripture text. */
   lang?: string;
}

interface Example {
   ref: VerseLocation;
   meta: MessageKey;
}

export const HOME_EXAMPLES: readonly Example[] = [
   { ref: { bookNumber: 43, chapterNumber: 3, verseNumber: 16 }, meta: 'home.examples.john316' },
   { ref: { bookNumber: 1, chapterNumber: 1, verseNumber: 1 }, meta: 'home.examples.gen11' },
   { ref: { bookNumber: 19, chapterNumber: 23, verseNumber: 1 }, meta: 'home.examples.ps231' },
   { ref: { bookNumber: 45, chapterNumber: 8, verseNumber: 28 }, meta: 'home.examples.rom828' },
   { ref: { bookNumber: 19, chapterNumber: 110, verseNumber: 1 }, meta: 'home.examples.ps1101' },
   { ref: { bookNumber: 1, chapterNumber: 3, verseNumber: 15 }, meta: 'home.examples.gen315' },
];

const TRY_QUERIES = [ 'Gv 3:16', 'Ps 23', '1 Cor 13', 'Rivelazione 21:4' ];
const HINT_KEY = 'bibliamap-home-hint-dismissed';

function labelFor(data: SearchData, ref: VerseLocation): string {
   return `${bookDisplayName(data, ref.bookNumber)} ${ref.chapterNumber}:${ref.verseNumber}`;
}

function ExampleCard({
   example,
   datasetId,
   data,
   params,
   lang,
   load,
}: {
   example: Example;
   datasetId: string;
   data: SearchData;
   params: RouteParams;
   lang?: string;
   load: boolean;
}): React.ReactElement {
   const t = useT();
   const preview = useVersePreview(
      datasetId,
      data,
      load ? { bookNumber: example.ref.bookNumber, chapter: example.ref.chapterNumber, verse: example.ref.verseNumber } : null,
   );
   const label = labelFor(data, example.ref);

   return (
      <li>
         <VerseLink verse={example.ref} params={params} className="home-example" aria-label={label}>
            <div lang={lang}>
               <VerseCard
                  reference={label}
                  meta={t(example.meta)}
                  density="compact"
                  className="ui-verse--interactive"
                  text={!load || preview === undefined ? undefined : preview?.text ?? null}
               />
            </div>
         </VerseLink>
      </li>
   );
}

export function HomePage({ datasetId, datasets, onDatasetChange, params, lang }: HomePageProps): React.ReactElement {
   const t = useT();
   const data = useSearchData(datasetId);
   const history = useHistory();
   const [ examplesRef, examplesInView ] = useInView<HTMLElement>('0px 0px 200px 0px');
   const [ hintDismissed, setHintDismissed ] = useState(() => readStoredValue(HINT_KEY) === '1');
   const recent = history.entries
      .map((entry) => parseVerseKey(entry.key))
      .filter((ref): ref is VerseLocation => ref !== null)
      .slice(0, 4);

   const dismissHint = (): void => {
      writeStoredValue(HINT_KEY, '1');
      setHintDismissed(true);
   };

   return (
      <div className="page-stack home">
         <section className="home-hero" aria-labelledby="home-title">
            <p className="eyebrow">{t('home.hero.eyebrow')}</p>
            <h1 id="home-title" className="home-hero__title">
               {t('home.hero.title')}
            </h1>
            <p className="home-hero__lead">{t('home.hero.lead')}</p>
            <div className="home-hero__search">
               <VerseSearchPanel variant="inline" size="lg" datasetId={datasetId} lang={lang} params={params} />
            </div>
            <p className="home-hero__try">
               <span>{t('home.hero.try')}</span>
               {TRY_QUERIES.map((query) => {
                  const result = searchCitations(query, data)[0];

                  return result ? (
                     <AppLink key={query} href={resultHref(result, params)} className="home-hero__query" title={result.label}>
                        {query}
                     </AppLink>
                  ) : null;
               })}
            </p>
         </section>

         {!hintDismissed ? (
            <Card as="section" variant="sunken" padding="md" className="home-steps" aria-labelledby="home-steps-title">
               <div className="home-steps__head">
                  <h2 id="home-steps-title" className="home-section-title">
                     {t('home.steps.title')}
                  </h2>
                  <IconButton label={t('home.steps.dismiss')} size="sm" variant="ghost" onClick={dismissHint}>
                     <X size={16} />
                  </IconButton>
               </div>
               <ol className="home-steps__list">
                  <li>
                     <Search size={18} aria-hidden="true" />
                     <span>
                        <strong>{t('home.steps.searchTitle')}</strong> {t('home.steps.searchBody')}
                     </span>
                  </li>
                  <li>
                     <Network size={18} aria-hidden="true" />
                     <span>
                        <strong>{t('home.steps.connectTitle')}</strong> {t('home.steps.connectBody')}
                     </span>
                  </li>
                  <li>
                     <BookmarkPlus size={18} aria-hidden="true" />
                     <span>
                        <strong>{t('home.steps.saveTitle')}</strong> {t('home.steps.saveBody')}
                     </span>
                  </li>
               </ol>
            </Card>
         ) : null}

         {recent.length > 0 ? (
            <section className="home-section" aria-labelledby="home-continue-title">
               <h2 id="home-continue-title" className="home-section-title">
                  {t('study.history.continue')}
               </h2>
               <ul className="home-continue">
                  {recent.map((ref) => (
                     <li key={`${ref.bookNumber}.${ref.chapterNumber}.${ref.verseNumber}`}>
                        <VerseLink verse={ref} params={params} className="home-continue__link" label={labelFor(data, ref)} />
                     </li>
                  ))}
               </ul>
            </section>
         ) : null}

         <section ref={examplesRef} className="home-section" aria-labelledby="home-examples-title">
            <h2 id="home-examples-title" className="home-section-title">
               {t('home.examples.title')}
            </h2>
            <ul className="home-examples stagger">
               {HOME_EXAMPLES.map((example) => (
                  <ExampleCard
                     key={`${example.ref.bookNumber}.${example.ref.chapterNumber}.${example.ref.verseNumber}`}
                     example={example}
                     datasetId={datasetId}
                     data={data}
                     params={params}
                     lang={lang}
                     load={examplesInView}
                  />
               ))}
            </ul>
         </section>

         <div className="home-columns">
            <section className="home-section" aria-labelledby="home-editions-title">
               <h2 id="home-editions-title" className="home-section-title">
                  {t('home.dataset.title')}
               </h2>
               <p className="home-section-lead">{t('home.dataset.lead')}</p>
               <div className="home-editions" role="radiogroup" aria-labelledby="home-editions-title">
                  {datasets.map((dataset) => {
                     const selected = dataset.datasetId === datasetId;
                     const description = datasetDescriptionKey(dataset.datasetId);

                     return (
                        <label key={dataset.datasetId} className={cx('home-edition', selected && 'is-selected')}>
                           <input
                              type="radio"
                              name="home-edition"
                              value={dataset.datasetId}
                              checked={selected}
                              onChange={() => onDatasetChange(dataset.datasetId)}
                           />
                           <span className="home-edition__body">
                              <span className="home-edition__name">{datasetName(dataset)}</span>
                              <span className="home-edition__description">
                                 {description ? t(description) : dataset.publicationTitle}
                              </span>
                           </span>
                        </label>
                     );
                  })}
               </div>
            </section>

            <Card as="section" variant="outline" padding="lg" className="home-insights" aria-labelledby="home-insights-title">
               <BarChart3 size={22} aria-hidden="true" className="home-insights__icon" />
               <h2 id="home-insights-title" className="home-section-title">
                  {t('home.insights.title')}
               </h2>
               <p className="home-section-lead">{t('home.insights.body')}</p>
               <AppLink href={insightsHref(undefined, params)} className="ui-button ui-button--secondary ui-button--md home-insights__cta">
                  {t('home.insights.cta')}
                  <ArrowRight size={16} aria-hidden="true" />
               </AppLink>
            </Card>
         </div>
      </div>
   );
}
