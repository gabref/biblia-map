/**
 * Global keyboard shortcuts (owner: E-A). Mounted once by the shell.
 *
 *   /  or  ⌘K / Ctrl+K   open verse search
 *   ?                    shortcuts help
 *   [  /  ]              previous / next verse (verse route only; see routing/verseStep.ts)
 *   b                    save / unsave the current verse (verse route only)
 *   Esc                  closes the top-most overlay (native <dialog> behaviour)
 *
 * Single-key shortcuts are ignored while typing in a field (useHotkey).
 */
import { useHotkey } from './useHotkey';
import { navigate, verseHref, type RouteParams, type VerseLocation } from '../routing/routes';
import { loadStudyStore } from './useStudySummary';

export interface ShortcutDefinition {
   keys: readonly string[];
   /** i18n key of the description. */
   description:
      | 'home.shortcuts.search'
      | 'home.shortcuts.help'
      | 'home.shortcuts.prevVerse'
      | 'home.shortcuts.nextVerse'
      | 'home.shortcuts.bookmark'
      | 'home.shortcuts.close';
}

/** For the `?` help sheet. `mod` renders as ⌘ on Apple platforms, Ctrl elsewhere. */
export const SHORTCUTS: readonly ShortcutDefinition[] = [
   { keys: [ '/' ], description: 'home.shortcuts.search' },
   { keys: [ 'mod', 'K' ], description: 'home.shortcuts.search' },
   { keys: [ '[' ], description: 'home.shortcuts.prevVerse' },
   { keys: [ ']' ], description: 'home.shortcuts.nextVerse' },
   { keys: [ 'B' ], description: 'home.shortcuts.bookmark' },
   { keys: [ '?' ], description: 'home.shortcuts.help' },
   { keys: [ 'Esc' ], description: 'home.shortcuts.close' },
];

export function isApplePlatform(): boolean {
   return typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

export interface KeyboardShortcutsOptions {
   onOpenSearch: () => void;
   onOpenHelp: () => void;
   /** The verse being viewed, or `null` when not on a verse route. */
   verse: VerseLocation | null;
   /** Params carried into prev/next verse links (dataset, filters). */
   params?: RouteParams;
   /** Chapter lengths when known (search index); improves prev/next across chapters. */
   verseCount?: (bookNumber: number, chapterNumber: number) => number | undefined;
   /** Called after `b` toggles the bookmark; `saved` is the new state. */
   onBookmarkToggled?: (verse: VerseLocation, saved: boolean) => void;
   /** Disable everything (e.g. while a modal owns the keyboard). */
   enabled?: boolean;
}

export function useKeyboardShortcuts({
   onOpenSearch,
   onOpenHelp,
   verse,
   params,
   verseCount,
   onBookmarkToggled,
   enabled = true,
}: KeyboardShortcutsOptions): void {
   useHotkey('/', () => onOpenSearch(), { enabled });
   useHotkey('k', () => onOpenSearch(), { mod: true, enabled });
   useHotkey('?', () => onOpenHelp(), { enabled });

   const step = (delta: -1 | 1): void => {
      if (!verse) {
         return;
      }

      // Code-split (also imported by the Verse page, which listens for the step event).
      void import('../routing/verseStep').then(({ adjacentVerse, requestVerseStep }) => {
         if (requestVerseStep(delta)) {
            return;
         }

         const target = adjacentVerse(verse, delta, verseCount);

         if (target) {
            navigate(verseHref(target, params));
         }
      });
   };

   useHotkey('[', () => step(-1), { enabled: enabled && verse !== null });
   useHotkey(']', () => step(1), { enabled: enabled && verse !== null });
   useHotkey(
      'b',
      () => {
         if (verse) {
            // The study store is code-split; it is usually loaded already (nav badge).
            void loadStudyStore().then((store) => onBookmarkToggled?.(verse, store.toggleBookmark(verse)));
         }
      },
      { enabled: enabled && verse !== null },
   );
}
