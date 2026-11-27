import { useEffect, useMemo, useState } from 'react';

import { loadVerseTexts } from '../../data/chapterData';
import type { Book, VerseRef } from '../../types/generated';

/** `${datasetId}:${jwpubVerseId}` → text (`null` = not available). Shared across mounts. */
const textCache = new Map<string, string | null>();

function cacheKey(datasetId: string, verseId: number): string {
   return `${datasetId}:${verseId}`;
}

/**
 * Lazily loads the text of arbitrary verses (any book). Returns a lookup:
 * `undefined` while loading, `null` when unavailable, else the text.
 */
export function useVerseTexts(
   datasetId: string,
   books: Book[],
   refs: Array<VerseRef | null>,
   enabled = true,
): (verseId: number) => string | null | undefined {
   const [ , setVersion ] = useState(0);
   const missingKey = refs
      .filter((ref): ref is VerseRef => ref !== null && !textCache.has(cacheKey(datasetId, ref.jwpubVerseId)))
      .map((ref) => ref.jwpubVerseId)
      .join(',');

   useEffect(() => {
      if (!enabled || !missingKey) {
         return undefined;
      }

      let active = true;
      const missing = refs.filter((ref): ref is VerseRef => ref !== null && !textCache.has(cacheKey(datasetId, ref.jwpubVerseId)));

      loadVerseTexts(datasetId, books, missing).then((texts) => {
         for (const ref of missing) {
            textCache.set(cacheKey(datasetId, ref.jwpubVerseId), texts.get(ref.jwpubVerseId) ?? null);
         }

         if (active) setVersion((version) => version + 1);
      });

      return () => {
         active = false;
      };
      // `missingKey` captures `refs`.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [ datasetId, books, missingKey, enabled ]);

   return useMemo(
      () => (verseId: number) => {
         const key = cacheKey(datasetId, verseId);

         return textCache.has(key) ? textCache.get(key) ?? null : undefined;
      },
      // Recreated on every render so consumers see newly cached texts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [ datasetId, missingKey ],
   );
}
