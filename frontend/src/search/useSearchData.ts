import { useEffect, useState } from 'react';

import { bookByNumber } from '../routing/bookSlugs';
import {
   STATIC_SEARCH_DATA,
   findSearchBook,
   loadSearchData,
   loadVersePreview,
   type SearchData,
   type VersePreview,
} from './searchData';

/**
 * Search data for a dataset. Returns the static English table immediately and swaps in the
 * dataset's localized data once loaded, so the search box is usable from the first paint.
 */
export function useSearchData(datasetId: string | null | undefined): SearchData {
   const [ state, setState ] = useState<{ id: string; data: SearchData } | null>(null);

   useEffect(() => {
      if (!datasetId) {
         return undefined;
      }

      let cancelled = false;

      loadSearchData(datasetId)
         .then((data) => {
            if (!cancelled) setState({ id: datasetId, data });
         })
         .catch(() => undefined);

      return () => {
         cancelled = true;
      };
   }, [ datasetId ]);

   return state && state.id === datasetId ? state.data : STATIC_SEARCH_DATA;
}

/** Localized book name from search data, falling back to English. */
export function bookDisplayName(data: SearchData, bookNumber: number): string {
   return findSearchBook(data, bookNumber)?.name ?? bookByNumber(bookNumber)?.nameEn ?? `Book ${bookNumber}`;
}

export type PreviewState = VersePreview | null | undefined;

/**
 * Text of one verse: `undefined` while loading, `null` when unavailable. Pass `null` as the
 * location to skip loading.
 */
export function useVersePreview(
   datasetId: string,
   data: SearchData,
   location: { bookNumber: number; chapter: number; verse: number } | null,
): PreviewState {
   const key = location ? `${datasetId}:${location.bookNumber}.${location.chapter}.${location.verse}` : null;
   const [ state, setState ] = useState<{ key: string; value: VersePreview | null } | null>(null);

   useEffect(() => {
      if (!key || !location || data.source === 'static') {
         return undefined;
      }

      const book = findSearchBook(data, location.bookNumber);

      if (!book) {
         setState({ key, value: null });
         return undefined;
      }

      let cancelled = false;

      loadVersePreview(datasetId, book, location.chapter, location.verse)
         .then((value) => {
            if (!cancelled) setState({ key, value });
         })
         .catch(() => {
            if (!cancelled) setState({ key, value: null });
         });

      return () => {
         cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures location + dataset.
   }, [ key, data ]);

   if (!key) {
      return null;
   }

   return state && state.key === key ? state.value : undefined;
}
