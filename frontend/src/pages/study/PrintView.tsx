import { ArrowLeft, Printer } from 'lucide-react';
import { useState } from 'react';

import { Button, EmptyState, Skeleton } from '../../components/ui';
import { useT } from '../../i18n';
import { navigate, studyHref, type RouteParams } from '../../routing/routes';
import { collectionDisplayName } from '../../study/labels';
import { useBookmarks, useNotes } from '../../study/store';
import { datasetLang, resolvedKey, useDatasets, useResolvedVerses } from './useResolvedVerses';

interface PrintViewProps {
   collectionId: string;
   datasetId: string;
   params: RouteParams;
}

/**
 * `/study/<id>/print`: a clean serif study sheet. On screen it shows a small toolbar; when
 * printed, `@media print` in study.css hides the app shell and the toolbar.
 */
export function PrintView({ collectionId, datasetId, params }: PrintViewProps): React.ReactElement {
   const t = useT();
   const { collections, bookmarks } = useBookmarks();
   const notes = useNotes();
   const collection = collections.find((item) => item.id === collectionId);
   const items = bookmarks.filter((item) => item.collectionId === collectionId);
   const [ connections, setConnections ] = useState(false);
   const [ includeNotes, setIncludeNotes ] = useState(true);
   const verses = useResolvedVerses(datasetId, items, connections ? 3 : 0);
   const datasets = useDatasets();
   const dataset = datasets.data?.find((item) => item.datasetId === datasetId);
   const backHref = studyHref(collectionId, undefined, params);

   if (!collection) {
      return (
         <EmptyState
            size="page"
            title={t('study.collection.notFoundTitle')}
            description={t('study.collection.notFoundBody')}
            action={<Button variant="primary" onClick={() => navigate(studyHref(undefined, undefined, params))}>{t('study.collection.back')}</Button>}
         />
      );
   }

   const ready = verses.data !== null && !verses.isStale;

   return (
      <div className="study-print-page">
         <div className="study-print-toolbar" role="toolbar" aria-label={t('study.print.toolbar')}>
            <Button variant="ghost" leading={<ArrowLeft size={15} aria-hidden="true" />} onClick={() => navigate(backHref)}>
               {t('study.print.back')}
            </Button>
            <label className="study-check">
               <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
               {t('study.sheet.includeNotes')}
            </label>
            <label className="study-check">
               <input type="checkbox" checked={connections} onChange={(event) => setConnections(event.target.checked)} />
               {t('study.print.connections')}
            </label>
            <Button variant="primary" leading={<Printer size={15} aria-hidden="true" />} disabled={!ready} onClick={() => window.print()}>
               {t('study.print.print')}
            </Button>
         </div>

         <article className="study-print" lang={datasetLang(dataset)}>
            <header className="study-print__header">
               <h1>{collectionDisplayName(collection)}</h1>
               <p className="study-print__meta">
                  {[ t('study.sheet.subtitle'), dataset?.publicationTitle, new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }) ]
                     .filter(Boolean)
                     .join(' · ')}
               </p>
               {includeNotes && collection.note ? <p className="study-print__note">{collection.note.text}</p> : null}
            </header>
            {items.length === 0 ? <p className="study-print__empty">{t('study.sheet.empty')}</p> : null}
            {items.map((item) => {
               const resolved = verses.data?.get(resolvedKey(item));
               const note = includeNotes ? notes[item.key]?.text : undefined;

               return (
                  <section key={item.key} className="study-print__verse">
                     <h2 className="study-print__ref">{resolved?.label ?? item.key}</h2>
                     {resolved ? (
                        <p className="t-scripture">{resolved.text ?? t('study.sheet.noText')}</p>
                     ) : verses.error ? (
                        <p className="t-scripture">{t('study.sheet.noText')}</p>
                     ) : (
                        <Skeleton lines={2} />
                     )}
                     {note ? (
                        <div className="study-print__my-note">
                           <p className="study-print__label">{t('study.sheet.myNote')}</p>
                           <p>{note}</p>
                        </div>
                     ) : null}
                     {resolved?.connections?.length ? (
                        <div className="study-print__connections">
                           <p className="study-print__label">{t('study.sheet.connected')}</p>
                           <ul>
                              {resolved.connections.map((connection) => (
                                 <li key={connection.key}>
                                    <strong>{connection.label}</strong>
                                    {connection.text ? ` — ${connection.text}` : ''}
                                 </li>
                              ))}
                           </ul>
                        </div>
                     ) : null}
                  </section>
               );
            })}
         </article>
      </div>
   );
}
