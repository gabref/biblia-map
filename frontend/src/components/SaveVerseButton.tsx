import { Bookmark, BookmarkCheck, Check, Plus } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { useT } from '../i18n';
import { cx } from '../lib/cx';
import { navigate, studyHref } from '../routing/routes';
import {
   DEFAULT_COLLECTION_ID,
   addBookmark,
   createCollection,
   removeBookmark,
   toVerseKey,
   useBookmarks,
   type StudyVerseRef,
   type VerseKey,
} from '../study/store';
import { COLLECTION_NAME_MAX_LENGTH } from '../study/schema';
import { collectionDisplayName } from '../study/labels';
import '../study/study.css';

export interface SaveVerseButtonProps {
   /** Verse to save (any `VerseRef` fits, or a canonical key like `43.3.16`). */
   verse: StudyVerseRef | VerseKey;
   /** Citation used in accessible names, e.g. "John 3:16". */
   label?: string;
   /** Optional inclusive range end, saved with the bookmark (e.g. John 3:16-18). */
   endKey?: VerseKey;
   /**
    * button — icon + "Save"/"Saved" text (detail panel).
    * icon   — icon-only square button (list rows).
    */
   appearance?: 'button' | 'icon';
   size?: 'sm' | 'md';
   /**
    * When the verse is in no collection yet, the first click saves it to "Saved" right away and
    * opens the picker to move/add it elsewhere. Default true.
    */
   quickSave?: boolean;
   className?: string;
}

/**
 * Save-to-collection control: toggles membership in any collection and creates a collection
 * inline. The picker is a non-modal popover (a bottom sheet on narrow screens): focus moves
 * into it, Escape / outside click / tabbing away close it, and focus returns to the trigger.
 */
export function SaveVerseButton({
   verse,
   label,
   endKey,
   appearance = 'button',
   size = 'md',
   quickSave = true,
   className,
}: SaveVerseButtonProps): React.ReactElement {
   const t = useT();
   const key = toVerseKey(verse);
   const { bookmarks, collections } = useBookmarks();
   const [ open, setOpen ] = useState(false);
   const [ placement, setPlacement ] = useState<'below' | 'above'>('below');
   const [ align, setAlign ] = useState<'start' | 'end'>('start');
   const [ newName, setNewName ] = useState('');
   const [ justSaved, setJustSaved ] = useState(false);
   const rootRef = useRef<HTMLSpanElement | null>(null);
   const triggerRef = useRef<HTMLButtonElement | null>(null);
   const popoverRef = useRef<HTMLDivElement | null>(null);
   const popoverId = useId();
   const titleId = useId();
   const inputId = useId();

   const memberOf = new Set(bookmarks.filter((item) => item.key === key).map((item) => item.collectionId));
   const saved = memberOf.size > 0;
   const citation = label ?? t('study.save.thisVerse');

   const close = (restoreFocus: boolean): void => {
      setOpen(false);
      setNewName('');

      if (restoreFocus) {
         triggerRef.current?.focus();
      }
   };

   const handleTrigger = (): void => {
      if (open) {
         close(false);
         return;
      }

      if (quickSave && !saved) {
         addBookmark(key, DEFAULT_COLLECTION_ID, endKey ? { endKey } : undefined);
         setJustSaved(true);
      }

      setOpen(true);
   };

   // Place the popover above the trigger when there is no room below.
   useLayoutEffect(() => {
      if (!open || !triggerRef.current) {
         return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;

      setPlacement(spaceBelow < 340 && rect.top > spaceBelow ? 'above' : 'below');
      // Open towards the side with room: the popover is at most 20rem (320px) wide.
      setAlign(rect.left + 336 > window.innerWidth ? 'end' : 'start');
      popoverRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
   }, [ open ]);

   useEffect(() => {
      if (!open) {
         return undefined;
      }

      const handlePointer = (event: PointerEvent): void => {
         if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
            close(false);
         }
      };

      document.addEventListener('pointerdown', handlePointer);

      return () => document.removeEventListener('pointerdown', handlePointer);
   }, [ open ]);

   useEffect(() => {
      if (!justSaved) {
         return undefined;
      }

      const timer = window.setTimeout(() => setJustSaved(false), 1600);

      return () => window.clearTimeout(timer);
   }, [ justSaved ]);

   const handleKeyDown = (event: React.KeyboardEvent): void => {
      if (event.key === 'Escape') {
         event.stopPropagation();
         close(true);
      }
   };

   const handleBlur = (event: React.FocusEvent): void => {
      const next = event.relatedTarget as Node | null;

      if (open && next && rootRef.current && !rootRef.current.contains(next)) {
         close(false);
      }
   };

   const toggle = (collectionId: string): void => {
      if (memberOf.has(collectionId)) {
         removeBookmark(key, collectionId);
      } else {
         addBookmark(key, collectionId, endKey ? { endKey } : undefined);
      }
   };

   const handleCreate = (event: React.FormEvent): void => {
      event.preventDefault();
      const created = createCollection(newName);

      if (created) {
         addBookmark(key, created.id, endKey ? { endKey } : undefined);
         setNewName('');
      }
   };

   const triggerLabel = saved ? t('study.save.savedIn', { verse: citation, count: memberOf.size }) : t('study.save.saveVerse', { verse: citation });
   const Icon = saved ? BookmarkCheck : Bookmark;
   const iconSize = size === 'sm' ? 15 : 17;

   return (
      <span ref={rootRef} className={cx('study-save', className)} onKeyDown={handleKeyDown} onBlur={handleBlur}>
         <button
            ref={triggerRef}
            type="button"
            className={cx(
               'ui-button',
               appearance === 'icon' ? 'ui-button--icon ui-button--ghost' : 'ui-button--secondary',
               `ui-button--${size}`,
               'study-save__trigger',
               saved && 'is-saved',
               justSaved && 'is-pulsing',
            )}
            aria-label={appearance === 'icon' ? triggerLabel : undefined}
            title={appearance === 'icon' ? triggerLabel : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? popoverId : undefined}
            onClick={handleTrigger}
         >
            <Icon size={iconSize} aria-hidden="true" className="study-save__icon" />
            {appearance === 'button' ? (
               <span className="ui-button__label">{saved ? t('study.save.saved') : t('study.save.save')}</span>
            ) : null}
         </button>

         {open ? (
            <>
               <span className="study-save__scrim" aria-hidden="true" onClick={() => close(true)} />
               <div
                  ref={popoverRef}
                  id={popoverId}
                  role="dialog"
                  aria-labelledby={titleId}
                  className={cx('study-save__popover', `is-${placement}`, `is-align-${align}`)}
               >
                  <p id={titleId} className="study-save__title">
                     {t('study.save.title', { verse: citation })}
                  </p>
                  <ul className="study-save__list">
                     {collections.map((collection) => {
                        const checked = memberOf.has(collection.id);
                        const checkboxId = `${popoverId}-${collection.id}`;

                        return (
                           <li key={collection.id}>
                              <input
                                 id={checkboxId}
                                 type="checkbox"
                                 className="study-save__checkbox"
                                 checked={checked}
                                 onChange={() => toggle(collection.id)}
                              />
                              <label htmlFor={checkboxId} className="study-save__option">
                                 <span className="study-save__box" aria-hidden="true">
                                    {checked ? <Check size={13} /> : null}
                                 </span>
                                 <span className="study-save__name">{collectionDisplayName(collection)}</span>
                                 <span className="study-save__count tabular">
                                    {bookmarks.filter((item) => item.collectionId === collection.id).length}
                                 </span>
                              </label>
                           </li>
                        );
                     })}
                  </ul>
                  <form className="study-save__create" onSubmit={handleCreate}>
                     <label htmlFor={inputId} className="visually-hidden">
                        {t('study.collections.newLabel')}
                     </label>
                     <input
                        id={inputId}
                        className="study-input study-input--sm"
                        value={newName}
                        maxLength={COLLECTION_NAME_MAX_LENGTH}
                        placeholder={t('study.collections.newPlaceholder')}
                        onChange={(event) => setNewName(event.target.value)}
                     />
                     <button type="submit" className="ui-button ui-button--secondary ui-button--sm" disabled={!newName.trim()}>
                        <Plus size={14} aria-hidden="true" />
                        <span className="ui-button__label">{t('study.collections.create')}</span>
                     </button>
                  </form>
                  <div className="study-save__footer">
                     <a
                        href={studyHref()}
                        onClick={(event) => {
                           if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
                              event.preventDefault();
                              close(false);
                              navigate(studyHref());
                           }
                        }}
                     >
                        {t('study.save.manage')}
                     </a>
                     <button type="button" className="ui-button ui-button--ghost ui-button--sm" onClick={() => close(true)}>
                        {t('study.save.done')}
                     </button>
                  </div>
               </div>
            </>
         ) : null}
      </span>
   );
}

export default SaveVerseButton;
