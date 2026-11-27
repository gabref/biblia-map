/**
 * Previous / next verse (`[` and `]` shortcuts, owner E-A).
 *
 * The shortcut dispatches a cancelable `VERSE_STEP_EVENT` on `window` first. The Verse page
 * (E-B) can handle it — e.g. to animate, or because it knows chapter lengths — and call
 * `event.preventDefault()`; otherwise the shell navigates with `adjacentVerse()`.
 *
 *    useEffect(() => onVerseStep((delta, event) => { event.preventDefault(); goTo(delta); }), []);
 */
import type { VerseLocation } from './routes';
import { bookByNumber } from './bookSlugs';

export const VERSE_STEP_EVENT = 'bibliamap:verse-step';

export interface VerseStepDetail {
   delta: -1 | 1;
}

/** Fires the step event; returns `true` when a listener handled it (called `preventDefault`). */
export function requestVerseStep(delta: -1 | 1): boolean {
   const event = new CustomEvent<VerseStepDetail>(VERSE_STEP_EVENT, { detail: { delta }, cancelable: true });

   return !window.dispatchEvent(event);
}

/** Subscribe to step requests; returns the unsubscribe function. */
export function onVerseStep(handler: (delta: -1 | 1, event: CustomEvent<VerseStepDetail>) => void): () => void {
   const listener = (event: Event): void => {
      const custom = event as CustomEvent<VerseStepDetail>;
      handler(custom.detail.delta, custom);
   };

   window.addEventListener(VERSE_STEP_EVENT, listener);

   return () => window.removeEventListener(VERSE_STEP_EVENT, listener);
}

/**
 * The verse before/after `ref`. `verseCount(book, chapter)` gives chapter lengths when known;
 * without it, "next" stays in the chapter (it cannot know the last verse) and "previous" from
 * verse 1 returns `null` (it cannot know the previous chapter's last verse).
 * Never crosses book boundaries.
 */
export function adjacentVerse(
   ref: VerseLocation,
   delta: -1 | 1,
   verseCount?: (bookNumber: number, chapterNumber: number) => number | undefined,
): VerseLocation | null {
   const chapters = bookByNumber(ref.bookNumber)?.chapters ?? 0;

   if (delta === -1) {
      if (ref.verseNumber > 1) {
         return { ...ref, verseNumber: ref.verseNumber - 1 };
      }

      if (ref.chapterNumber <= 1) {
         return null;
      }

      const previousLength = verseCount?.(ref.bookNumber, ref.chapterNumber - 1);

      return previousLength ? { ...ref, chapterNumber: ref.chapterNumber - 1, verseNumber: previousLength } : null;
   }

   const length = verseCount?.(ref.bookNumber, ref.chapterNumber);

   if (length === undefined || ref.verseNumber < length) {
      return { ...ref, verseNumber: ref.verseNumber + 1 };
   }

   return ref.chapterNumber < chapters ? { ...ref, chapterNumber: ref.chapterNumber + 1, verseNumber: 1 } : null;
}
