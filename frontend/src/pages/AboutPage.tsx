import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, Crosshair, MousePointerClick } from 'lucide-react';

import { datasetDisplayName } from '../components/DatasetBadge';
import { ErrorState } from '../components/ErrorState';
import { LoadingShimmer } from '../components/LoadingShimmer';
import { PageHeader } from '../components/PageHeader';
import { Kbd } from '../components/ui/Kbd';
import { loadDatasets, loadManifest, loadStatsSummary } from '../data/generated';
import { useAsyncData } from '../hooks/useAsyncData';
import { datasetLocale, useFormat, useT, type MessageKey } from '../i18n';
import type { DatasetRegistryEntry, StatsSummary } from '../types/generated';
import '../styles/about.css';

interface AboutPageProps {
   datasetId: string;
}

interface EditionFacts {
   dataset: DatasetRegistryEntry;
   summary: StatsSummary | null;
}

const EDITION_DESCRIPTIONS: Record<string, MessageKey> = {
   nwtsty: 'about.editions.desc.nwtsty',
   'nwtsty-i': 'about.editions.desc.nwtstyIt',
   nwt: 'about.editions.desc.nwt',
   rbi8: 'about.editions.desc.rbi8',
};

const SECTIONS = [
   { id: 'editions', key: 'about.editions.title' },
   { id: 'references', key: 'about.refs.title' },
   { id: 'legend', key: 'about.legend.title' },
   { id: 'pages', key: 'about.pages.title' },
   { id: 'shortcuts', key: 'about.shortcuts.title' },
   { id: 'source', key: 'about.source.title' },
] as const satisfies ReadonlyArray<{ id: string; key: MessageKey }>;

function isMac(): boolean {
   return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function AboutPage({ datasetId }: AboutPageProps): React.ReactElement {
   const t = useT();
   const { locale, formatNumber, formatDateTime } = useFormat();
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ datasets, manifest ] = await Promise.all([ loadDatasets(), loadManifest(datasetId) ]);
         // One small summary per edition; an edition whose stats fail just shows no counts.
         const editions: EditionFacts[] = await Promise.all(
            datasets.map(async (dataset) => ({
               dataset,
               summary: await loadStatsSummary(dataset.datasetId).catch(() => null),
            })),
         );

         return { manifest, editions };
      },
      [ datasetId ],
   );

   if (error) {
      return <ErrorState title={t('about.error')} error={error} />;
   }

   if (!data || showLoading) {
      return <LoadingShimmer rows={5} />;
   }

   const current = data.editions.find((edition) => edition.dataset.datasetId === datasetId);
   const summary = current?.summary ?? null;
   const skipped = summary
      ? summary.extraction.skippedRows.directUnmapped + summary.extraction.skippedRows.studyNoteUnmapped
      : 0;
   const contentLang = datasetLocale(data.manifest) ?? undefined;
   const mod = isMac() ? '⌘' : 'Ctrl';

   const shortcuts: Array<{ keys: React.ReactNode; action: MessageKey }> = [
      {
         keys: (
            <>
               <Kbd>/</Kbd> <span className="about-kbd-or">{t('about.shortcuts.or')}</span> <Kbd>{mod}</Kbd>
               <Kbd>K</Kbd>
            </>
         ),
         action: 'about.shortcuts.search',
      },
      {
         keys: (
            <>
               <Kbd>[</Kbd> <Kbd>]</Kbd>
            </>
         ),
         action: 'about.shortcuts.prevNext',
      },
      {
         keys: (
            <>
               <Kbd>+</Kbd> <Kbd>−</Kbd> <Kbd>0</Kbd>
            </>
         ),
         action: 'about.shortcuts.zoom',
      },
      { keys: <Kbd>Esc</Kbd>, action: 'about.shortcuts.close' },
      { keys: <Kbd>?</Kbd>, action: 'about.shortcuts.help' },
   ];

   return (
      <div className="page-stack about-page">
         <PageHeader eyebrow={t('about.eyebrow')} title={t('about.title')} description={t('about.lead')} />

         <p className="about-note">{t('about.private')}</p>

         <div className="about-layout">
            <nav className="about-toc" aria-labelledby="about-toc-title">
               <h2 id="about-toc-title" className="t-eyebrow">
                  {t('about.toc')}
               </h2>
               <ul>
                  {SECTIONS.map((section) => (
                     <li key={section.id}>
                        <a href={`#about-${section.id}`}>{t(section.key)}</a>
                     </li>
                  ))}
               </ul>
            </nav>

            <article className="about-article">
               <section id="about-editions" className="about-section" aria-labelledby="about-editions-title">
                  <h2 id="about-editions-title">{t('about.editions.title')}</h2>
                  <p>{t('about.editions.intro')}</p>
                  <ul className="about-editions">
                     {data.editions.map(({ dataset, summary: facts }) => {
                        const isCurrent = dataset.datasetId === datasetId;

                        return (
                           <li key={dataset.datasetId} className={isCurrent ? 'is-current' : undefined} aria-current={isCurrent ? 'true' : undefined}>
                              <div className="about-edition-head">
                                 <strong>{datasetDisplayName(dataset, locale)}</strong>
                                 {isCurrent ? <span className="about-current-tag">{t('about.editions.current')}</span> : null}
                              </div>
                              <p>{t(EDITION_DESCRIPTIONS[dataset.datasetId] ?? 'about.editions.desc.other')}</p>
                              {facts ? (
                                 <p className="about-edition-facts">
                                    {t('about.editions.crossRefs', { count: formatNumber(facts.totalCrossReferences) })}
                                    {' · '}
                                    {facts.totalStudyNoteReferences > 0
                                       ? t('about.editions.studyNotes', { count: formatNumber(facts.totalStudyNoteReferences) })
                                       : t('about.editions.noStudyNotes')}
                                 </p>
                              ) : null}
                           </li>
                        );
                     })}
                  </ul>
               </section>

               <section id="about-references" className="about-section" aria-labelledby="about-references-title">
                  <h2 id="about-references-title">{t('about.refs.title')}</h2>
                  <dl className="about-terms">
                     <div>
                        <dt>{t('about.refs.crossref.term')}</dt>
                        <dd>{t('about.refs.crossref.body')}</dd>
                     </div>
                     <div>
                        <dt>{t('about.refs.studyNote.term')}</dt>
                        <dd>{t('about.refs.studyNote.body')}</dd>
                     </div>
                  </dl>
                  <h3>{t('about.refs.direction.title')}</h3>
                  <p>{t('about.refs.direction.body')}</p>
               </section>

               <section id="about-legend" className="about-section" aria-labelledby="about-legend-title">
                  <h2 id="about-legend-title">{t('about.legend.title')}</h2>
                  <ul className="about-legend">
                     <li>
                        <span className="about-swatch about-swatch--outgoing" aria-hidden="true">
                           <ArrowUpRight size={14} strokeWidth={2.4} />
                        </span>
                        {t('about.legend.outgoing')}
                     </li>
                     <li>
                        <span className="about-swatch about-swatch--incoming" aria-hidden="true">
                           <ArrowDownLeft size={14} strokeWidth={2.4} />
                        </span>
                        {t('about.legend.incoming')}
                     </li>
                     <li>
                        <span className="about-swatch about-swatch--both" aria-hidden="true">
                           <ArrowLeftRight size={14} strokeWidth={2.4} />
                        </span>
                        {t('about.legend.both')}
                     </li>
                     <li>
                        <span className="about-swatch about-swatch--selected" aria-hidden="true">
                           <Crosshair size={14} strokeWidth={2.4} />
                        </span>
                        {t('about.legend.selected')}
                     </li>
                     <li>
                        <span className="about-swatch about-swatch--accent" aria-hidden="true">
                           <MousePointerClick size={14} strokeWidth={2.4} />
                        </span>
                        {t('about.legend.accent')}
                     </li>
                  </ul>
               </section>

               <section id="about-pages" className="about-section" aria-labelledby="about-pages-title">
                  <h2 id="about-pages-title">{t('about.pages.title')}</h2>
                  <dl className="about-terms">
                     {(
                        [
                           [ 'shell.nav.home', 'about.pages.home' ],
                           [ 'shell.nav.verse', 'about.pages.verse' ],
                           [ 'shell.nav.read', 'about.pages.read' ],
                           [ 'shell.nav.insights', 'about.pages.insights' ],
                           [ 'shell.nav.study', 'about.pages.study' ],
                        ] as const
                     ).map(([ name, body ]) => (
                        <div key={name}>
                           <dt>{t(name)}</dt>
                           <dd>{t(body)}</dd>
                        </div>
                     ))}
                  </dl>
               </section>

               <section id="about-shortcuts" className="about-section" aria-labelledby="about-shortcuts-title">
                  <h2 id="about-shortcuts-title">{t('about.shortcuts.title')}</h2>
                  <table className="about-shortcuts">
                     <thead>
                        <tr>
                           <th scope="col">{t('about.shortcuts.key')}</th>
                           <th scope="col">{t('about.shortcuts.action')}</th>
                        </tr>
                     </thead>
                     <tbody>
                        {shortcuts.map((shortcut) => (
                           <tr key={shortcut.action}>
                              <td>{shortcut.keys}</td>
                              <td>{t(shortcut.action)}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </section>

               <section id="about-source" className="about-section" aria-labelledby="about-source-title">
                  <h2 id="about-source-title">{t('about.source.title')}</h2>
                  <p>{t('about.source.body')}</p>
                  {skipped > 0 ? <p>{t('about.source.gaps', { count: formatNumber(skipped) })}</p> : null}
               </section>

               <details className="about-technical">
                  <summary>
                     <ChevronRight size={16} aria-hidden="true" className="about-technical__chevron" />
                     {t('about.technical.title')}
                  </summary>
                  <div className="about-technical__body">
                     <p>{t('about.technical.body')}</p>
                     <dl className="metadata-list">
                        <div>
                           <dt>{t('about.technical.publication')}</dt>
                           <dd lang={contentLang}>{data.manifest.publicationTitle}</dd>
                        </div>
                        <div>
                           <dt>{t('about.technical.symbol')}</dt>
                           <dd>{data.manifest.publicationSymbol}</dd>
                        </div>
                        <div>
                           <dt>{t('about.technical.year')}</dt>
                           <dd>{data.manifest.publicationYear ?? t('about.technical.unknown')}</dd>
                        </div>
                        <div>
                           <dt>{t('about.technical.language')}</dt>
                           <dd>{data.manifest.language}</dd>
                        </div>
                        <div>
                           <dt>{t('about.technical.generated')}</dt>
                           <dd>{formatDateTime(data.manifest.generatedAt) || t('about.technical.unknown')}</dd>
                        </div>
                        {summary ? (
                           <>
                              <div>
                                 <dt>{t('about.technical.crossRefs')}</dt>
                                 <dd>{formatNumber(summary.totalCrossReferences)}</dd>
                              </div>
                              <div>
                                 <dt>{t('about.technical.studyNotes')}</dt>
                                 <dd>{formatNumber(summary.totalStudyNoteReferences)}</dd>
                              </div>
                              <div>
                                 <dt>{t('about.technical.skipped')}</dt>
                                 <dd>{formatNumber(skipped)}</dd>
                              </div>
                           </>
                        ) : null}
                     </dl>
                     <p>
                        <a href="https://github.com/gabref/biblia-map" target="_blank" rel="noreferrer">
                           {t('about.technical.sourceLink')}
                        </a>
                     </p>
                  </div>
               </details>
            </article>
         </div>
      </div>
   );
}
