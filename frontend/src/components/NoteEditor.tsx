import { Check } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';

import { useT } from '../i18n';
import { cx } from '../lib/cx';
import {
   NOTE_MAX_LENGTH,
   getCollectionNote,
   getNote,
   setCollectionNote,
   setNote,
   subscribeStudy,
   toVerseKey,
   type StudyVerseRef,
   type VerseKey,
} from '../study/store';
import '../study/study.css';

/** Autosave delay after the last keystroke. */
export const NOTE_AUTOSAVE_MS = 500;

export interface NoteEditorProps {
   /** Verse whose note to edit. Give exactly one of `verse` / `collectionId`. */
   verse?: StudyVerseRef | VerseKey;
   /** Collection whose note to edit. */
   collectionId?: string;
   /** Visible label. Defaults to "My note" / "Collection notes". */
   label?: string;
   /** Keep the label for screen readers only. */
   hideLabel?: boolean;
   placeholder?: string;
   /** Initial textarea height in rows (it grows with content). Default 4. */
   rows?: number;
   autoFocus?: boolean;
   /** Hide the "notes stay on this device" hint (e.g. when the page already says so). */
   hideHint?: boolean;
   className?: string;
}

type SaveState = 'idle' | 'pending' | 'saved';

interface Target {
   id: string;
   read: () => string;
   write: (text: string) => void;
}

function noteTarget(verse: NoteEditorProps['verse'], collectionId: string | undefined): Target | null {
   if (verse !== undefined) {
      const key = toVerseKey(verse);

      return { id: `verse:${key}`, read: () => getNote(key), write: (text) => setNote(key, text) };
   }

   if (collectionId) {
      return { id: `collection:${collectionId}`, read: () => getCollectionNote(collectionId), write: (text) => setCollectionNote(collectionId, text) };
   }

   return null;
}

/**
 * Markdown-lite note for a verse or a collection. Autosaves 500 ms after typing stops (and on
 * blur / unmount), shows a character count, and states that notes never leave the device.
 * Keeps in sync with edits from other tabs while the user is not typing.
 */
export function NoteEditor(props: NoteEditorProps): React.ReactElement | null {
   const target = noteTarget(props.verse, props.collectionId);

   if (!target) {
      return null;
   }

   return <NoteEditorField key={target.id} target={target} {...props} />;
}

function NoteEditorField({
   target,
   collectionId,
   label,
   hideLabel = false,
   placeholder,
   rows = 4,
   autoFocus = false,
   hideHint = false,
   className,
}: NoteEditorProps & { target: Target }): React.ReactElement {
   const t = useT();
   const id = useId();
   const stored = useSyncExternalStore(subscribeStudy, target.read, target.read);
   const [ draft, setDraft ] = useState(stored);
   const [ saveState, setSaveState ] = useState<SaveState>('idle');
   const timerRef = useRef<number | undefined>(undefined);
   const draftRef = useRef(stored);
   const dirtyRef = useRef(false);
   const targetRef = useRef(target);
   targetRef.current = target;

   const flush = useCallback((): void => {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;

      if (dirtyRef.current) {
         dirtyRef.current = false;
         targetRef.current.write(draftRef.current);
         setSaveState('saved');
      }
   }, []);

   // Adopt changes made elsewhere (another tab, an import) while there is no unsaved typing.
   useEffect(() => {
      if (!dirtyRef.current && stored !== draftRef.current) {
         draftRef.current = stored;
         setDraft(stored);
      }
   }, [ stored ]);

   useEffect(() => {
      window.addEventListener('pagehide', flush);

      return () => {
         window.removeEventListener('pagehide', flush);
         flush();
      };
   }, [ flush ]);

   const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const next = event.target.value.slice(0, NOTE_MAX_LENGTH);

      draftRef.current = next;
      dirtyRef.current = true;
      setDraft(next);
      setSaveState('pending');
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, NOTE_AUTOSAVE_MS);
   };

   const count = draft.length;
   const nearLimit = count > NOTE_MAX_LENGTH * 0.9;
   const hintId = `${id}-hint`;
   const visibleLabel = label ?? (collectionId ? t('study.note.collectionLabel') : t('study.note.label'));

   return (
      <div className={cx('study-note', className)}>
         <div className="study-note__top">
            <label htmlFor={id} className={cx('study-note__label', hideLabel && 'visually-hidden')}>
               {visibleLabel}
            </label>
            <span className={cx('study-note__status', saveState === 'saved' && 'is-saved')} aria-live="polite">
               {saveState === 'pending' ? t('study.note.saving') : saveState === 'saved' ? (
                  <>
                     <Check size={13} aria-hidden="true" /> {t('study.note.saved')}
                  </>
               ) : null}
            </span>
         </div>
         <textarea
            id={id}
            className="study-input study-note__input"
            value={draft}
            rows={rows}
            maxLength={NOTE_MAX_LENGTH}
            placeholder={placeholder ?? t('study.note.placeholder')}
            autoFocus={autoFocus}
            aria-describedby={hintId}
            onChange={handleChange}
            onBlur={flush}
         />
         <div className="study-note__foot" id={hintId}>
            {hideHint ? <span /> : <span className="study-note__hint">{t('study.note.hint')}</span>}
            <span className={cx('study-note__count tabular', nearLimit && 'is-near-limit')}>
               {t('study.note.count', { count: count.toLocaleString('en'), max: NOTE_MAX_LENGTH.toLocaleString('en') })}
            </span>
         </div>
      </div>
   );
}
