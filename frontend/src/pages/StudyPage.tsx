import { BookOpen, ChevronDown, ChevronUp, FolderPlus, GripVertical, History, Library, NotebookPen, Plus, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';

import { Button, Card, CardHeader, EmptyState, IconButton, useToast } from '../components/ui';
import { VerseLink, fallbackVerseLabel } from '../components/VerseLink';
import { useT } from '../i18n';
import { cx } from '../lib/cx';
import { DEFAULT_VERSE, navigate, studyHref, useRoute, verseHref, type RouteParams } from '../routing/routes';
import { COLLECTION_NAME_MAX_LENGTH } from '../study/schema';
import { collectionDisplayName, plural, relativeTime, studyDatasetId } from '../study/labels';
import {
   clearHistory,
   createCollection,
   getStudyData,
   moveCollection,
   parseVerseKey,
   removeHistoryEntry,
   replaceStudyData,
   useBookmarks,
   useHistory,
   useNotes,
   useStudyStatus,
   type VerseKey,
} from '../study/store';
import '../study/study.css';
import { BackupPanel } from './study/BackupPanel';
import { CollectionView } from './study/CollectionView';
import { PrintView } from './study/PrintView';
import { useDragReorder } from './study/useDragReorder';

export interface StudyPageProps {
   /** Dataset for verse text. Defaults to `?ds=`, then the shell's stored choice, then `nwtsty`. */
   datasetId?: string;
}

/** `/study`, `/study/<collectionId>` and `/study/<collectionId>/print` (Epic E-C). Reads `useRoute()`. */
export function StudyPage({ datasetId }: StudyPageProps = {}): React.ReactElement {
   const { route, params } = useRoute();
   const activeDataset = datasetId ?? studyDatasetId(params.ds);
   const linkParams: RouteParams = params.ds ? { ds: params.ds } : {};
   const collectionId = route.name === 'study' ? route.collectionId : undefined;
   const print = route.name === 'study' && route.print === true;

   if (collectionId && print) {
      return <PrintView collectionId={collectionId} datasetId={activeDataset} params={linkParams} />;
   }

   return (
      <div className="study-page">
         <StorageBanner />
         {collectionId ? (
            <CollectionView key={collectionId} collectionId={collectionId} datasetId={activeDataset} params={linkParams} />
         ) : (
            <StudyOverview params={linkParams} />
         )}
      </div>
   );
}

export default StudyPage;

function StorageBanner(): React.ReactElement | null {
   const t = useT();
   const status = useStudyStatus();

   if (status.persistent && !status.backupKey) {
      return null;
   }

   return (
      <div className="study-banner anim-fade-in" role="alert">
         <TriangleAlert size={18} aria-hidden="true" />
         <div>
            <strong>{status.persistent ? t('study.storage.recoveredTitle') : t('study.storage.unavailableTitle')}</strong>
            <p>
               {status.persistent
                  ? t('study.storage.recoveredBody', { key: status.backupKey ?? '' })
                  : t('study.storage.unavailableBody')}
            </p>
         </div>
      </div>
   );
}

function StudyOverview({ params }: { params: RouteParams }): React.ReactElement {
   const t = useT();

   return (
      <>
         <header className="study-header">
            <p className="t-eyebrow">{t('study.page.eyebrow')}</p>
            <h1>{t('study.page.title')}</h1>
            <p className="study-header__lead">{t('study.page.description')}</p>
         </header>
         <div className="study-grid">
            <div className="study-grid__main">
               <CollectionsPanel params={params} />
               <NotesPanel params={params} />
            </div>
            <div className="study-grid__side">
               <HistoryPanel params={params} />
               <BackupPanel />
            </div>
         </div>
      </>
   );
}

function CollectionsPanel({ params }: { params: RouteParams }): React.ReactElement {
   const t = useT();
   const { collections, bookmarks } = useBookmarks();
   const [ name, setName ] = useState('');
   const [ creating, setCreating ] = useState(false);
   const drag = useDragReorder((id, toIndex) => moveCollection(id, toIndex));

   const handleCreate = (event: React.FormEvent): void => {
      event.preventDefault();
      const created = createCollection(name);

      if (created) {
         setName('');
         setCreating(false);
      }
   };

   return (
      <Card as="section" aria-labelledby="study-collections-title" className="study-panel">
         <CardHeader
            title={<span id="study-collections-title">{t('study.collections.title')}</span>}
            description={t('study.collections.description')}
            icon={<Library size={18} />}
            action={creating ? null : (
               <Button size="sm" leading={<FolderPlus size={15} aria-hidden="true" />} onClick={() => setCreating(true)}>
                  {t('study.collections.new')}
               </Button>
            )}
         />
         {creating ? (
            <form className="study-inline-form anim-fade-in" onSubmit={handleCreate}>
               <label htmlFor="study-new-collection" className="visually-hidden">{t('study.collections.newLabel')}</label>
               <input
                  id="study-new-collection"
                  className="study-input"
                  value={name}
                  maxLength={COLLECTION_NAME_MAX_LENGTH}
                  placeholder={t('study.collections.newPlaceholder')}
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                     if (event.key === 'Escape') {
                        setCreating(false);
                        setName('');
                     }
                  }}
               />
               <Button type="submit" variant="primary" size="sm" disabled={!name.trim()} leading={<Plus size={15} aria-hidden="true" />}>
                  {t('study.collections.create')}
               </Button>
               <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setName(''); }}>
                  {t('study.common.cancel')}
               </Button>
            </form>
         ) : null}
         <ol className="study-collections stagger">
            {collections.map((collection, index) => {
               const items = bookmarks.filter((item) => item.collectionId === collection.id);
               const href = studyHref(collection.id, undefined, params);
               const displayName = collectionDisplayName(collection);

               return (
                  <li key={collection.id} className={cx('study-row', drag.isOver(index) && 'is-drop-target', drag.isDragging(collection.id) && 'is-dragging')} {...drag.itemProps(index)}>
                     <span className="study-row__grip" {...drag.handleProps(collection.id)} title={t('study.reorder.drag')}>
                        <GripVertical size={16} aria-hidden="true" />
                     </span>
                     <a
                        className="study-row__main"
                        href={href}
                        onClick={(event) => {
                           if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                              event.preventDefault();
                              navigate(href);
                           }
                        }}
                     >
                        <span className="study-row__title">{displayName}</span>
                        <span className="study-row__meta">
                           {plural('study.collections.verseCount', items.length)}
                           {collection.note ? ` · ${t('study.collections.hasNote')}` : ''}
                        </span>
                     </a>
                     <span className="study-row__actions">
                        <IconButton size="sm" label={t('study.reorder.up', { name: displayName })} disabled={index === 0} onClick={() => moveCollection(collection.id, index - 1)}>
                           <ChevronUp size={16} />
                        </IconButton>
                        <IconButton
                           size="sm"
                           label={t('study.reorder.down', { name: displayName })}
                           disabled={index === collections.length - 1}
                           onClick={() => moveCollection(collection.id, index + 1)}
                        >
                           <ChevronDown size={16} />
                        </IconButton>
                     </span>
                  </li>
               );
            })}
         </ol>
         {bookmarks.length === 0 ? (
            <EmptyState
               icon={<BookOpen size={20} />}
               title={t('study.collections.emptyTitle')}
               description={t('study.collections.emptyBody')}
               action={(
                  <Button variant="primary" size="sm" onClick={() => navigate(verseHref(DEFAULT_VERSE, params))}>
                     {t('study.collections.emptyAction')}
                  </Button>
               )}
            />
         ) : null}
      </Card>
   );
}

const HISTORY_PREVIEW = 12;

function HistoryPanel({ params }: { params: RouteParams }): React.ReactElement {
   const t = useT();
   const { toast } = useToast();
   const { entries } = useHistory();
   const [ showAll, setShowAll ] = useState(false);
   const visible = showAll ? entries : entries.slice(0, HISTORY_PREVIEW);

   const handleClear = (): void => {
      const previous = getStudyData().history;

      clearHistory();
      toast({
         title: t('study.history.cleared'),
         action: { label: t('study.common.undo'), onClick: () => replaceStudyData({ ...getStudyData(), history: previous }) },
      });
   };

   return (
      <Card as="section" aria-labelledby="study-history-title" className="study-panel">
         <CardHeader
            title={<span id="study-history-title">{t('study.history.title')}</span>}
            description={entries.length ? plural('study.history.count', entries.length) : undefined}
            icon={<History size={18} />}
            action={entries.length ? (
               <Button size="sm" variant="ghost" onClick={handleClear}>
                  {t('study.history.clear')}
               </Button>
            ) : null}
         />
         {entries.length === 0 ? (
            <EmptyState
               icon={<History size={20} />}
               title={t('study.history.emptyTitle')}
               description={t('study.history.emptyBody')}
            />
         ) : (
            <>
               <ol className="study-history">
                  {visible.map((entry) => {
                     const ref = parseVerseKey(entry.key);

                     if (!ref) {
                        return null;
                     }

                     return (
                        <li key={entry.key} className="study-history__item">
                           <VerseLink verse={ref} params={{ ...params, ...(entry.datasetId ? { ds: entry.datasetId } : {}) }} className="study-history__link t-ref" />
                           <span className="study-history__meta">
                              <time dateTime={new Date(entry.visitedAt).toISOString()}>{relativeTime(entry.visitedAt)}</time>
                              {entry.datasetId ? <span className="t-mono">{entry.datasetId}</span> : null}
                           </span>
                           <IconButton size="sm" label={t('study.history.remove', { verse: fallbackVerseLabel(ref) })} onClick={() => removeHistoryEntry(entry.key)}>
                              <X size={14} />
                           </IconButton>
                        </li>
                     );
                  })}
               </ol>
               {entries.length > HISTORY_PREVIEW ? (
                  <Button size="sm" variant="ghost" block onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
                     {showAll ? t('study.history.showLess') : t('study.history.showAll', { count: entries.length })}
                  </Button>
               ) : null}
            </>
         )}
      </Card>
   );
}

function NotesPanel({ params }: { params: RouteParams }): React.ReactElement {
   const t = useT();
   const notes = useNotes();
   const items = (Object.entries(notes) as Array<[ VerseKey, { text: string; updatedAt: number } ]>)
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt);

   return (
      <Card as="section" aria-labelledby="study-notes-title" className="study-panel">
         <CardHeader
            title={<span id="study-notes-title">{t('study.notes.title')}</span>}
            description={t('study.notes.description')}
            icon={<NotebookPen size={18} />}
         />
         {items.length === 0 ? (
            <EmptyState icon={<NotebookPen size={20} />} title={t('study.notes.emptyTitle')} description={t('study.notes.emptyBody')} />
         ) : (
            <ul className="study-notes">
               {items.map(([ key, note ]) => {
                  const ref = parseVerseKey(key);

                  return ref ? (
                     <li key={key} className="study-notes__item">
                        <div className="study-notes__head">
                           <VerseLink verse={ref} params={params} className="t-ref" />
                           <time className="study-notes__time" dateTime={new Date(note.updatedAt).toISOString()}>{relativeTime(note.updatedAt)}</time>
                        </div>
                        <p className="study-notes__text">{note.text}</p>
                     </li>
                  ) : null;
               })}
            </ul>
         )}
      </Card>
   );
}
