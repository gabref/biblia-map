import { AArrowDown, AArrowUp, BookOpen, ChevronLeft, ChevronRight, Copy, NotebookPen, Rows3 } from 'lucide-react';
import { Suspense, useState } from 'react';

import type { NoteEditorProps } from '../../components/NoteEditor';
import { SaveVerseButton } from '../../components/SaveVerseButton';
import { Button, IconButton, VerseCard } from '../../components/ui';
import { VerseLink } from '../../components/VerseLink';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import type { RouteParams, VerseLocation } from '../../routing/routes';
import { useNote, verseKey } from '../../study/store';
import type { VerseRef } from '../../types/generated';
import { eagerLazy } from './eagerLazy';
import { isPlainClick } from './StudyTrail';

// The note editor only renders once a note exists or is asked for: its own chunk, warmed with the page.
const NoteEditor = eagerLazy<NoteEditorProps>(() => import('../../components/NoteEditor').then((module) => ({ default: module.NoteEditor })));

export interface ContextVerse {
   ref: VerseRef;
   text: string | null | undefined;
}

export interface StudiedVerseProps {
   verse: VerseRef;
   text: string | null | undefined;
   /** One-line summary under the citation, e.g. "42 cited · 46 citing". */
   meta: string;
   before: readonly ContextVerse[];
   after: readonly ContextVerse[];
   previous: VerseRef | undefined;
   next: VerseRef | undefined;
   params: RouteParams;
   chapterHref: string;
   /** BCP 47 language of the scripture text, when known. */
   lang: string | undefined;
   /** Phone layout: icon-only secondary actions so the bar stays two rows. */
   compact: boolean;
   showContext: boolean;
   onToggleContext: () => void;
   textScale: number;
   canShrink: boolean;
   canGrow: boolean;
   onScale: (delta: -1 | 1) => void;
   /** `undefined` while the header is the target of a shared-element morph from a list row. */
   transitionName: string | undefined;
   onStudy: (verse: VerseLocation) => void;
   onCopy: () => void;
   onOpenChapter: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

function ContextLines({
   verses,
   params,
   onStudy,
}: {
   verses: readonly ContextVerse[];
   params: RouteParams;
   onStudy: (verse: VerseLocation) => void;
}): React.ReactElement | null {
   const t = useT();

   if (verses.length === 0) {
      return null;
   }

   return (
      <p className="vs-context">
         {verses.map(({ ref, text }) => (
            <span key={ref.jwpubVerseId} className="vs-context__verse">
               <VerseLink
                  verse={ref}
                  params={params}
                  className="vs-context__num"
                  aria-label={t('verse.action.study', { verse: ref.label })}
                  onClick={(event) => {
                     if (isPlainClick(event)) {
                        event.preventDefault();
                        onStudy(ref);
                     }
                  }}
               >
                  {ref.verseNumber}
               </VerseLink>{' '}
               {text ?? (text === undefined ? '…' : '')}{' '}
            </span>
         ))}
      </p>
   );
}

/** The student's own note (E-C `NoteEditor`), folded away until there is one or it is asked for. */
function VerseNote({ verse, compact }: { verse: VerseRef; compact: boolean }): React.ReactElement {
   const t = useT();
   const [ note ] = useNote(verseKey(verse));
   const [ open, setOpen ] = useState(false);

   if (!open && note.length === 0) {
      return (
         compact ? (
            <IconButton label={t('verse.note.add')} size="sm" onClick={() => setOpen(true)}>
               <NotebookPen size={15} />
            </IconButton>
         ) : (
            <Button size="sm" variant="ghost" leading={<NotebookPen size={15} />} onClick={() => setOpen(true)}>
               {t('verse.note.add')}
            </Button>
         )
      );
   }

   return (
      <Suspense fallback={null}>
         <NoteEditor verse={verse} rows={3} autoFocus={open && note.length === 0} className="anim-fade-in" />
      </Suspense>
   );
}

/**
 * The verse on the desk: large, set as scripture, with the two verses either side for
 * context, and the actions a student takes on it (step, read the chapter, save, note).
 */
export function StudiedVerse({
   verse,
   text,
   meta,
   before,
   after,
   previous,
   next,
   params,
   chapterHref,
   lang,
   compact,
   showContext,
   onToggleContext,
   textScale,
   canShrink,
   canGrow,
   onScale,
   transitionName,
   onStudy,
   onCopy,
   onOpenChapter,
}: StudiedVerseProps): React.ReactElement {
   const t = useT();
   const stepLink = (target: VerseRef | undefined, direction: 'previous' | 'next'): React.ReactElement => {
      const icon = direction === 'previous' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />;
      const className = 'ui-button ui-button--icon ui-button--secondary ui-button--sm';

      if (!target) {
         return (
            <button type="button" className={className} disabled aria-label={t(`verse.step.${direction}`)}>
               {icon}
            </button>
         );
      }

      return (
         <VerseLink
            verse={target}
            params={params}
            className={className}
            aria-label={t(`verse.step.${direction}To`, { verse: target.label })}
            title={target.label}
            onClick={(event) => {
               if (isPlainClick(event)) {
                  event.preventDefault();
                  onStudy(target);
               }
            }}
         >
            {icon}
         </VerseLink>
      );
   };

   return (
      <section
         className={cx('vs-studied', !showContext && 'vs-studied--bare')}
         aria-label={t('verse.studied.label', { verse: verse.label })}
         style={{ '--vs-scale': textScale } as React.CSSProperties}
      >
         <div className="vs-studied__scripture" lang={lang}>
            {showContext ? <ContextLines verses={before} params={params} onStudy={onStudy} /> : null}
            <VerseCard
               reference={verse.label}
               text={text}
               tone="selected"
               meta={meta}
               transitionName={transitionName}
               className="vs-studied__card"
            />
            {showContext ? <ContextLines verses={after} params={params} onStudy={onStudy} /> : null}
         </div>

         <div className="vs-studied__bar">
            <div className="vs-studied__steps">
               {stepLink(previous, 'previous')}
               {stepLink(next, 'next')}
            </div>
            <a className="ui-button ui-button--ghost ui-button--sm" href={chapterHref} onClick={onOpenChapter}>
               <BookOpen size={15} aria-hidden="true" />
               <span className="ui-button__label">{t('verse.action.readInContext')}</span>
            </a>
            <SaveVerseButton verse={verse} label={verse.label} size="sm" appearance={compact ? 'icon' : 'button'} />
            <div className="vs-studied__note">
               <VerseNote key={verse.canonicalVerseId} verse={verse} compact={compact} />
            </div>
            <span className="vs-studied__spacer" />
            <IconButton label={t('verse.action.copy', { verse: verse.label })} size="sm" onClick={onCopy}>
               <Copy size={15} />
            </IconButton>
            <IconButton
               label={showContext ? t('verse.context.hide') : t('verse.context.show')}
               size="sm"
               aria-pressed={showContext}
               onClick={onToggleContext}
            >
               <Rows3 size={15} />
            </IconButton>
            <IconButton label={t('verse.text.smaller')} size="sm" disabled={!canShrink} onClick={() => onScale(-1)}>
               <AArrowDown size={16} />
            </IconButton>
            <IconButton label={t('verse.text.larger')} size="sm" disabled={!canGrow} onClick={() => onScale(1)}>
               <AArrowUp size={16} />
            </IconButton>
         </div>
      </section>
   );
}
