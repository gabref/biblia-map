import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, FileText, GripVertical, NotebookPen, Pencil, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { NoteEditor } from '../../components/NoteEditor';
import { Button, EmptyState, IconButton, Sheet, VerseCard, useToast } from '../../components/ui';
import { VerseLink, fallbackVerseLabel } from '../../components/VerseLink';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import { DEFAULT_VERSE, navigate, studyHref, verseHref, type RouteParams } from '../../routing/routes';
import { COLLECTION_NAME_MAX_LENGTH } from '../../study/schema';
import { collectionDisplayName, plural } from '../../study/labels';
import {
   DEFAULT_COLLECTION_ID,
   addBookmark,
   deleteCollection,
   getStudyData,
   moveBookmark,
   parseVerseKey,
   removeBookmark,
   renameCollection,
   replaceStudyData,
   useBookmarks,
   useNotes,
   type Bookmark,
} from '../../study/store';
import { SheetExportDialog } from './SheetExportDialog';
import { datasetLang, resolvedKey, useDatasets, useResolvedVerses } from './useResolvedVerses';
import { useDragReorder } from './useDragReorder';

interface CollectionViewProps {
   collectionId: string;
   datasetId: string;
   params: RouteParams;
}

function go(href: string) {
   return (event: React.MouseEvent<HTMLAnchorElement>): void => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
         event.preventDefault();
         navigate(href);
      }
   };
}

export function CollectionView({ collectionId, datasetId, params }: CollectionViewProps): React.ReactElement {
   const t = useT();
   const { toast } = useToast();
   const { collections, bookmarks } = useBookmarks();
   const collection = collections.find((item) => item.id === collectionId);
   const items = bookmarks.filter((item) => item.collectionId === collectionId);
   const verses = useResolvedVerses(datasetId, items);
   const datasets = useDatasets();
   const dataset = datasets.data?.find((item) => item.datasetId === datasetId);
   const [ renaming, setRenaming ] = useState(false);
   const [ draftName, setDraftName ] = useState('');
   const [ exportOpen, setExportOpen ] = useState(false);
   const [ deleteOpen, setDeleteOpen ] = useState(false);
   const drag = useDragReorder((key, toIndex) => moveBookmark(collectionId, key as Bookmark['key'], toIndex));
   const backHref = studyHref(undefined, undefined, params);

   if (!collection) {
      return (
         <EmptyState
            size="page"
            icon={<BookOpen size={24} />}
            title={t('study.collection.notFoundTitle')}
            description={t('study.collection.notFoundBody')}
            action={<Button variant="primary" onClick={() => navigate(backHref)}>{t('study.collection.back')}</Button>}
         />
      );
   }

   const displayName = collectionDisplayName(collection);

   const handleRename = (event: React.FormEvent): void => {
      event.preventDefault();

      if (renameCollection(collection.id, draftName)) {
         setRenaming(false);
      }
   };

   const handleRemove = (item: Bookmark, label: string): void => {
      removeBookmark(item.key, collectionId);
      toast({
         title: t('study.collection.removed', { verse: label }),
         action: { label: t('study.common.undo'), onClick: () => addBookmark(item.key, collectionId, item.endKey ? { endKey: item.endKey } : undefined) },
      });
   };

   const handleDelete = (): void => {
      const snapshot = getStudyData();

      deleteCollection(collection.id);
      setDeleteOpen(false);
      navigate(backHref, { replace: true });
      toast({
         title: t('study.collection.deleted', { name: displayName }),
         action: { label: t('study.common.undo'), onClick: () => replaceStudyData(snapshot) },
      });
   };

   return (
      <>
         <a className="study-back" href={backHref} onClick={go(backHref)}>
            <ArrowLeft size={15} aria-hidden="true" /> {t('study.collection.back')}
         </a>
         <header className="study-header study-header--collection">
            <p className="t-eyebrow">{t('study.collection.eyebrow')}</p>
            {renaming ? (
               <form className="study-inline-form" onSubmit={handleRename}>
                  <label htmlFor="study-rename" className="visually-hidden">{t('study.collection.renameLabel')}</label>
                  <input
                     id="study-rename"
                     className="study-input study-input--title"
                     value={draftName}
                     maxLength={COLLECTION_NAME_MAX_LENGTH}
                     autoFocus
                     onChange={(event) => setDraftName(event.target.value)}
                     onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                           setRenaming(false);
                        }
                     }}
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={!draftName.trim()}>{t('study.common.save')}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>{t('study.common.cancel')}</Button>
               </form>
            ) : (
               <div className="study-header__title-row">
                  <h1>{displayName}</h1>
                  <IconButton
                     label={t('study.collection.rename')}
                     onClick={() => {
                        setDraftName(displayName);
                        setRenaming(true);
                     }}
                  >
                     <Pencil size={16} />
                  </IconButton>
               </div>
            )}
            <p className="study-header__lead">{plural('study.collections.verseCount', items.length)}</p>
            <div className="study-toolbar">
               <Button leading={<FileText size={15} aria-hidden="true" />} disabled={items.length === 0} onClick={() => setExportOpen(true)}>
                  {t('study.sheet.open')}
               </Button>
               <Button
                  leading={<Printer size={15} aria-hidden="true" />}
                  disabled={items.length === 0}
                  onClick={() => navigate(studyHref(collection.id, { print: true }, params))}
               >
                  {t('study.print.open')}
               </Button>
               {collection.id !== DEFAULT_COLLECTION_ID ? (
                  <Button variant="ghost" leading={<Trash2 size={15} aria-hidden="true" />} onClick={() => setDeleteOpen(true)}>
                     {t('study.collection.delete')}
                  </Button>
               ) : null}
            </div>
         </header>

         <div className="study-collection">
            <section className="study-collection__verses" aria-labelledby="study-verses-title">
               <h2 id="study-verses-title" className="visually-hidden">{t('study.collection.versesTitle')}</h2>
               {items.length === 0 ? (
                  <EmptyState
                     icon={<BookOpen size={20} />}
                     title={t('study.collection.emptyTitle')}
                     description={t('study.collection.emptyBody')}
                     action={(
                        <Button variant="primary" size="sm" onClick={() => navigate(verseHref(DEFAULT_VERSE, params))}>
                           {t('study.collections.emptyAction')}
                        </Button>
                     )}
                  />
               ) : (
                  <ol className="study-verses stagger" lang={datasetLang(dataset)}>
                     {items.map((item, index) => {
                        const ref = parseVerseKey(item.key);
                        const resolved = verses.data?.get(resolvedKey(item));
                        const label = resolved?.label ?? (ref ? fallbackVerseLabel(ref) : item.key);

                        return (
                           <li
                              key={item.key}
                              className={cx('study-verse', drag.isOver(index) && 'is-drop-target', drag.isDragging(item.key) && 'is-dragging')}
                              {...drag.itemProps(index)}
                           >
                              <span className="study-row__grip" {...drag.handleProps(item.key)} title={t('study.reorder.drag')}>
                                 <GripVertical size={16} aria-hidden="true" />
                              </span>
                              <div className="study-verse__body">
                                 <VerseCard
                                    reference={label}
                                    text={verses.error ? null : resolved ? resolved.text : undefined}
                                    meta={ref ? (
                                       <VerseLink verse={ref} params={params} className="study-verse__open">
                                          {t('study.collection.openVerse')}
                                       </VerseLink>
                                    ) : null}
                                    actions={(
                                       <>
                                          <IconButton size="sm" label={t('study.reorder.up', { name: label })} disabled={index === 0} onClick={() => moveBookmark(collectionId, item.key, index - 1)}>
                                             <ChevronUp size={16} />
                                          </IconButton>
                                          <IconButton
                                             size="sm"
                                             label={t('study.reorder.down', { name: label })}
                                             disabled={index === items.length - 1}
                                             onClick={() => moveBookmark(collectionId, item.key, index + 1)}
                                          >
                                             <ChevronDown size={16} />
                                          </IconButton>
                                          <IconButton size="sm" label={t('study.collection.remove', { verse: label })} onClick={() => handleRemove(item, label)}>
                                             <Trash2 size={15} />
                                          </IconButton>
                                       </>
                                    )}
                                 />
                                 <VerseNote item={item} label={label} />
                              </div>
                           </li>
                        );
                     })}
                  </ol>
               )}
            </section>
            <aside className="study-collection__aside">
               <NoteEditor
                  collectionId={collection.id}
                  label={t('study.note.collectionLabel')}
                  placeholder={t('study.note.collectionPlaceholder')}
                  rows={6}
               />
            </aside>
         </div>

         <SheetExportDialog
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            collection={collection}
            items={items}
            datasetId={datasetId}
         />
         <Sheet
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            side="center"
            size="sm"
            title={t('study.collection.deleteTitle', { name: displayName })}
            description={plural('study.collection.deleteBody', items.length)}
            footer={(
               <>
                  <Button variant="ghost" onClick={() => setDeleteOpen(false)}>{t('study.common.cancel')}</Button>
                  <Button variant="danger" onClick={handleDelete}>{t('study.collection.delete')}</Button>
               </>
            )}
         >
            <p className="t-caption">{t('study.collection.deleteHint')}</p>
         </Sheet>
      </>
   );
}

function VerseNote({ item, label }: { item: Bookmark; label: string }): React.ReactElement {
   const t = useT();
   const notes = useNotes();
   const hasNote = Boolean(notes[item.key]);
   const [ open, setOpen ] = useState(false);

   if (!hasNote && !open) {
      return (
         <Button size="sm" variant="ghost" className="study-verse__add-note" leading={<NotebookPen size={14} aria-hidden="true" />} onClick={() => setOpen(true)}>
            {t('study.note.add')}
         </Button>
      );
   }

   return (
      <NoteEditor
         verse={item.key}
         label={t('study.note.labelFor', { verse: label })}
         hideLabel
         rows={2}
         autoFocus={open && !hasNote}
         hideHint
         className="study-verse__note"
      />
   );
}
