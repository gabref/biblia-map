/**
 * Dataset selection rules (owner: E-A).
 *
 * Priority: `?ds=` in the URL > the last choice in localStorage > `DEFAULT_DATASET_ID`.
 * Values that are not in the registry are ignored (no crash), falling through to the next.
 * Friendly edition names (Home only) are in `datasetNames.ts`, out of the shell bundle.
 */
import type { DatasetRegistryEntry } from '../types/generated';
import { datasetStorageKey, readStoredValue, writeStoredValue } from '../utils/storage';

export const DEFAULT_DATASET_ID = 'nwtsty';

export interface DatasetChoice {
   /** The dataset to show. */
   datasetId: string;
   /** Where it came from. */
   source: 'url' | 'storage' | 'default' | 'first';
   /** `?ds=` was present but unknown, so the URL should drop it. */
   invalidUrlValue: boolean;
}

export function resolveDatasetId(
   urlValue: string | undefined,
   storedValue: string | null,
   available: readonly Pick<DatasetRegistryEntry, 'datasetId'>[],
): DatasetChoice {
   const known = (id: string | null | undefined): id is string => !!id && available.some((entry) => entry.datasetId === id);
   const invalidUrlValue = urlValue !== undefined && !known(urlValue);

   if (known(urlValue)) return { datasetId: urlValue, source: 'url', invalidUrlValue };
   if (known(storedValue)) return { datasetId: storedValue, source: 'storage', invalidUrlValue };
   if (known(DEFAULT_DATASET_ID)) return { datasetId: DEFAULT_DATASET_ID, source: 'default', invalidUrlValue };

   return { datasetId: available[0]?.datasetId ?? DEFAULT_DATASET_ID, source: 'first', invalidUrlValue };
}

export function readStoredDatasetId(): string | null {
   return readStoredValue(datasetStorageKey);
}

export function storeDatasetId(datasetId: string): void {
   writeStoredValue(datasetStorageKey, datasetId);
}

/** BCP-47 language of a dataset, for `lang` attributes on scripture. */
export function datasetLang(entry: Pick<DatasetRegistryEntry, 'language'> | null | undefined): string | undefined {
   const language = entry?.language?.toLowerCase();

   if (!language) return undefined;
   if (language.startsWith('english')) return 'en';
   if (language.startsWith('ital')) return 'it';

   return undefined;
}
