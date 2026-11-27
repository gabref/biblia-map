import { loadDatasets } from '../../data/generated';
import { useAsyncData, type AsyncState } from '../../hooks/useAsyncData';
import type { DatasetRegistryEntry } from '../../types/generated';
import type { Bookmark } from '../../study/store';
import { resolveStudyVerses, type ResolvedVerse } from '../../study/verseText';

/** Labels + text for a list of bookmarks in `datasetId`; keyed on the verse list, not identity. */
export function useResolvedVerses(
   datasetId: string,
   bookmarks: readonly Pick<Bookmark, 'key' | 'endKey'>[],
   connections = 0,
): AsyncState<Map<string, ResolvedVerse>> {
   const signature = bookmarks.map((item) => `${item.key}-${item.endKey ?? ''}`).join(',');

   return useAsyncData(
      async () => {
         const resolved = await resolveStudyVerses(datasetId, bookmarks, { connections });

         return new Map(resolved.map((verse) => [ `${verse.key}-${verse.endKey ?? ''}`, verse ]));
      },
      [ datasetId, signature, connections ],
      { keepPreviousData: true },
   );
}

export function resolvedKey(item: Pick<Bookmark, 'key' | 'endKey'>): string {
   return `${item.key}-${item.endKey ?? ''}`;
}

export function useDatasets(): AsyncState<DatasetRegistryEntry[]> {
   return useAsyncData(loadDatasets, []);
}

/** BCP-47 tag for scripture containers, from the dataset's language name. */
export function datasetLang(dataset: DatasetRegistryEntry | undefined): string | undefined {
   switch (dataset?.language) {
      case 'English':
         return 'en';
      case 'Italian':
         return 'it';
      default:
         return undefined;
   }
}
