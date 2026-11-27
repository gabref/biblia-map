/**
 * Friendly edition names (owner: E-A), for the Home edition picker. Kept apart from
 * `datasets.ts` so the shell's initial bundle does not carry them.
 */
import type { MessageKey } from '../i18n';
import type { DatasetRegistryEntry } from '../types/generated';

interface FriendlyName {
   name: string;
   /** Short label for tight spaces (switchers). */
   short: string;
   description: MessageKey;
}

/** Edition names people recognize, instead of publication symbols. */
const FRIENDLY: Record<string, FriendlyName> = {
   nwtsty: { name: 'Study Bible (EN) 2026', short: 'Study Bible · EN', description: 'home.dataset.nwtsty' },
   'nwtsty-i': { name: 'Bibbia per lo studio (IT) 2026', short: 'Bibbia studio · IT', description: 'home.dataset.nwtsty-i' },
   nwt: { name: 'NWT 2013', short: 'NWT 2013', description: 'home.dataset.nwt' },
   rbi8: { name: 'Reference Bible 1984', short: 'Reference 1984', description: 'home.dataset.rbi8' },
};

/** Friendly edition name, e.g. "Study Bible (EN) 2026"; unknown datasets get symbol + year + language. */
export function datasetName(entry: DatasetRegistryEntry): string {
   const friendly = FRIENDLY[entry.datasetId];

   if (friendly) {
      return friendly.name;
   }

   const language = entry.language && entry.language !== 'English' ? ` (${entry.language})` : '';

   return `${entry.publicationSymbol}${entry.publicationYear ? ` ${entry.publicationYear}` : ''}${language}`;
}

export function datasetShortName(entry: DatasetRegistryEntry): string {
   return FRIENDLY[entry.datasetId]?.short ?? datasetName(entry);
}

/** i18n key of the one-line explanation, when we have one. */
export function datasetDescriptionKey(datasetId: string): MessageKey | undefined {
   return FRIENDLY[datasetId]?.description;
}
