/** Small display helpers shared by the study UI. */
import { t, type MessageKey, type TranslateVars } from '../i18n';
import { datasetStorageKey, readStoredValue } from '../utils/storage';
import { DEFAULT_COLLECTION_NAME } from './schema';
import { DEFAULT_COLLECTION_ID, type Collection } from './store';

/** Fallback dataset for verse text when neither `?ds=` nor a stored choice exists. */
export const STUDY_FALLBACK_DATASET = 'nwtsty';

/** Dataset for verse text: `?ds=` > the shell's stored choice > `nwtsty`. */
export function studyDatasetId(routeDataset?: string): string {
   return routeDataset ?? readStoredValue(datasetStorageKey) ?? STUDY_FALLBACK_DATASET;
}

/** The default collection keeps its translated name until the user renames it. */
export function collectionDisplayName(collection: Pick<Collection, 'id' | 'name'>): string {
   return collection.id === DEFAULT_COLLECTION_ID && collection.name === DEFAULT_COLLECTION_NAME
      ? t('study.collections.defaultName')
      : collection.name;
}

/** Picks `${base}.one` or `${base}.other` and passes `count`. */
export function plural(base: string, count: number, vars?: TranslateVars): string {
   const key = `${base}.${count === 1 ? 'one' : 'other'}` as MessageKey;

   return t(key, { count, ...vars });
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or a date. */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
   const seconds = Math.max(0, Math.round((now - timestamp) / 1000));

   if (seconds < 60) {
      return t('study.time.justNow');
   }

   if (seconds < 3600) {
      return t('study.time.minutes', { count: Math.floor(seconds / 60) });
   }

   if (seconds < 86_400) {
      return t('study.time.hours', { count: Math.floor(seconds / 3600) });
   }

   if (seconds < 2 * 86_400) {
      return t('study.time.yesterday');
   }

   return new Date(timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric', year: now - timestamp > 300 * 86_400_000 ? 'numeric' : undefined });
}
