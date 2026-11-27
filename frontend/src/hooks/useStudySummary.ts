/**
 * What the shell needs from My study (owner: E-A): the last visited verse (nav target, bare
 * `/verse`) and the saved-verse count (nav badge). The store itself (`study/store`, with its
 * schema and sanitizers) is code-split: the shell loads it after first paint instead of
 * shipping it in the initial bundle. Pages that need the full store import it directly.
 */
import { useEffect, useState } from 'react';

import type { VerseLocation } from '../routing/routes';

type StudyStore = typeof import('../study/store');

let storePromise: Promise<StudyStore> | null = null;

/** The study store module (one shared request). */
export function loadStudyStore(): Promise<StudyStore> {
   storePromise ??= import('../study/store');
   storePromise.catch(() => {
      storePromise = null;
   });

   return storePromise;
}

export interface StudySummary {
   lastVisited: VerseLocation | null;
   savedCount: number;
   /** False until the store has loaded; `lastVisited` is unknown before that. */
   ready: boolean;
}

const INITIAL: StudySummary = { lastVisited: null, savedCount: 0, ready: false };

function summarize(store: StudyStore): StudySummary {
   const data = store.getStudyData();
   const first = data.history[0];

   return {
      lastVisited: (first && store.parseVerseKey(first.key)) || null,
      savedCount: new Set(data.bookmarks.map((bookmark) => bookmark.key)).size,
      ready: true,
   };
}

function sameSummary(a: StudySummary, b: StudySummary): boolean {
   return (
      a.ready === b.ready &&
      a.savedCount === b.savedCount &&
      a.lastVisited?.bookNumber === b.lastVisited?.bookNumber &&
      a.lastVisited?.chapterNumber === b.lastVisited?.chapterNumber &&
      a.lastVisited?.verseNumber === b.lastVisited?.verseNumber
   );
}

export function useStudySummary(): StudySummary {
   const [ summary, setSummary ] = useState<StudySummary>(INITIAL);

   useEffect(() => {
      let unsubscribe: (() => void) | undefined;
      let live = true;

      loadStudyStore().then(
         (store) => {
            if (!live) return;

            const update = (): void => {
               const next = summarize(store);

               setSummary((previous) => (sameSummary(previous, next) ? previous : next));
            };

            update();
            unsubscribe = store.subscribeStudy(update);
         },
         // Chunk failed (offline): keep defaults, the nav still works with John 3:16.
         () => live && setSummary({ ...INITIAL, ready: true }),
      );

      return () => {
         live = false;
         unsubscribe?.();
      };
   }, []);

   return summary;
}
