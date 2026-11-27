import { ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import type { VerseLocation } from '../../routing/routes';
import type { Book, VerseRef } from '../../types/generated';
import type { VerseCatalog } from './catalog';

type Step = 'book' | 'chapter' | 'verse';

export interface VersePickerProps {
   books: readonly Book[];
   catalog: VerseCatalog;
   /** The verse being studied. */
   verse: VerseRef;
   bookName: string;
   onPick: (verse: VerseLocation) => void;
}

/**
 * "Romans › 1 › 12": each segment opens a grid (books, then chapters, then verses), so any
 * verse is three clicks away without scrolling a long select. Picking a book moves on to
 * its chapters, picking a chapter to its verses, picking a verse studies it.
 */
export function VersePicker({ books, catalog, verse, bookName, onPick }: VersePickerProps): React.ReactElement {
   const t = useT();
   const panelId = useId();
   const rootRef = useRef<HTMLDivElement | null>(null);
   const panelRef = useRef<HTMLDivElement | null>(null);
   const [ step, setStep ] = useState<Step | null>(null);
   const [ draft, setDraft ] = useState({ bookNumber: verse.bookNumber, chapterNumber: verse.chapterNumber });
   const open = step !== null;

   const openAt = (next: Step): void => {
      if (step === next) {
         setStep(null);

         return;
      }

      if (!open) {
         setDraft({ bookNumber: verse.bookNumber, chapterNumber: verse.chapterNumber });
      }

      setStep(next);
   };

   const close = (restoreFocus: boolean): void => {
      const current = step;

      setStep(null);

      if (restoreFocus && current) {
         rootRef.current?.querySelector<HTMLButtonElement>(`[data-step="${current}"]`)?.focus();
      }
   };

   useEffect(() => {
      if (!open) {
         return undefined;
      }

      const handlePointerDown = (event: PointerEvent): void => {
         if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
            setStep(null);
         }
      };

      document.addEventListener('pointerdown', handlePointerDown);

      return () => document.removeEventListener('pointerdown', handlePointerDown);
   }, [ open ]);

   // Move focus into the grid: onto the current choice, so arrows/Tab start from "here".
   useEffect(() => {
      if (!step) {
         return;
      }

      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLButtonElement>('[aria-current="true"]') ?? panel?.querySelector<HTMLButtonElement>('button');

      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
   }, [ step, draft.bookNumber, draft.chapterNumber ]);

   const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape' && open) {
         event.stopPropagation();
         close(true);

         return;
      }

      const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

      if (!(event.key in offsets) || !panelRef.current || !(event.target instanceof HTMLButtonElement)) {
         return;
      }

      const buttons = Array.from(panelRef.current.querySelectorAll<HTMLButtonElement>('.vs-picker__grid button'));
      const index = buttons.indexOf(event.target);

      if (index >= 0) {
         event.preventDefault();
         buttons[(index + offsets[event.key] + buttons.length) % buttons.length]?.focus();
      }
   };

   const pickBook = (bookNumber: number): void => {
      const chapters = catalog.chapters(bookNumber);

      if (chapters.length === 1) {
         setDraft({ bookNumber, chapterNumber: chapters[0] });
         setStep('verse');
      } else {
         setDraft({ bookNumber, chapterNumber: bookNumber === verse.bookNumber ? verse.chapterNumber : (chapters[0] ?? 1) });
         setStep('chapter');
      }
   };

   const pickChapter = (chapterNumber: number): void => {
      setDraft((previous) => ({ ...previous, chapterNumber }));
      setStep('verse');
   };

   const pickVerse = (verseNumber: number): void => {
      setStep(null);
      onPick({ bookNumber: draft.bookNumber, chapterNumber: draft.chapterNumber, verseNumber });
   };

   const draftBook = books.find((book) => book.bookNumber === draft.bookNumber);
   const isCurrentChapter = draft.bookNumber === verse.bookNumber && draft.chapterNumber === verse.chapterNumber;
   const segments: Array<{ step: Step; text: string; label: string }> = [
      { step: 'book', text: bookName, label: t('verse.picker.book', { book: bookName }) },
      { step: 'chapter', text: String(verse.chapterNumber), label: t('verse.picker.chapter', { chapter: verse.chapterNumber }) },
      { step: 'verse', text: String(verse.verseNumber), label: t('verse.picker.verse', { verse: verse.verseNumber }) },
   ];

   return (
      <div ref={rootRef} className="vs-picker" onKeyDown={handleKeyDown}>
         <nav className="vs-picker__crumbs" aria-label={t('verse.picker.label')}>
            {segments.map((segment, index) => (
               <span key={segment.step} className="vs-picker__segment">
                  {index > 0 ? <ChevronRight className="vs-picker__sep" size={16} aria-hidden="true" /> : null}
                  <button
                     type="button"
                     data-step={segment.step}
                     className={cx('vs-picker__crumb', segment.step === 'book' && 'vs-picker__crumb--book', step === segment.step && 'is-open')}
                     aria-label={segment.label}
                     aria-expanded={step === segment.step}
                     aria-controls={open ? panelId : undefined}
                     onClick={() => openAt(segment.step)}
                  >
                     {segment.text}
                  </button>
               </span>
            ))}
         </nav>

         {step ? (
            <div ref={panelRef} id={panelId} className="vs-picker__panel anim-sink-in" role="group" aria-label={t(`verse.picker.choose.${step}`)}>
               <p className="vs-picker__hint">
                  {step === 'book'
                     ? t('verse.picker.choose.book')
                     : step === 'chapter'
                        ? t('verse.picker.chapterOf', { book: draftBook?.name ?? '' })
                        : t('verse.picker.verseOf', { book: draftBook?.name ?? '', chapter: draft.chapterNumber })}
               </p>

               {step === 'book' ? (
                  ([ 'OT', 'NT' ] as const).map((testament) => (
                     <div key={testament} className="vs-picker__group">
                        <p className="t-eyebrow">{t(testament === 'OT' ? 'verse.testament.ot' : 'verse.testament.nt')}</p>
                        <div className="vs-picker__grid vs-picker__grid--books">
                           {books
                              .filter((book) => book.testament === testament)
                              .map((book) => (
                                 <button
                                    key={book.bookNumber}
                                    type="button"
                                    className="vs-picker__cell"
                                    aria-current={book.bookNumber === draft.bookNumber ? 'true' : undefined}
                                    onClick={() => pickBook(book.bookNumber)}
                                 >
                                    {book.name}
                                 </button>
                              ))}
                        </div>
                     </div>
                  ))
               ) : step === 'chapter' ? (
                  <div className="vs-picker__grid">
                     {catalog.chapters(draft.bookNumber).map((chapterNumber) => (
                        <button
                           key={chapterNumber}
                           type="button"
                           className="vs-picker__cell"
                           aria-current={chapterNumber === draft.chapterNumber ? 'true' : undefined}
                           onClick={() => pickChapter(chapterNumber)}
                        >
                           {chapterNumber}
                        </button>
                     ))}
                  </div>
               ) : (
                  <div className="vs-picker__grid">
                     {catalog.verses(draft.bookNumber, draft.chapterNumber).map((ref) => (
                        <button
                           key={ref.jwpubVerseId}
                           type="button"
                           className="vs-picker__cell"
                           aria-current={isCurrentChapter && ref.verseNumber === verse.verseNumber ? 'true' : undefined}
                           onClick={() => pickVerse(ref.verseNumber)}
                        >
                           {ref.verseNumber}
                        </button>
                     ))}
                  </div>
               )}
            </div>
         ) : null}
      </div>
   );
}
