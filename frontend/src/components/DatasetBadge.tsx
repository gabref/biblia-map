import { Database } from 'lucide-react';

import { INTL_TAGS, hasMessage, normalizeLocale, translate, useLocale, type Locale } from '../i18n';
import type { DatasetRegistryEntry } from '../types/generated';

interface DatasetBadgeProps {
   datasets: DatasetRegistryEntry[];
   selectedDatasetId: string;
   onChange: (datasetId: string) => void;
}

const displayNames = new Map<Locale, Intl.DisplayNames | null>();

/** "Italian" in the registry → "Italian" / "italiano", via Intl.DisplayNames when available. */
function languageName(language: string, locale: Locale): string {
   const code = normalizeLocale(language);

   if (!code) {
      return language;
   }

   if (!displayNames.has(locale)) {
      try {
         displayNames.set(locale, new Intl.DisplayNames([ INTL_TAGS[locale] ], { type: 'language' }));
      } catch {
         displayNames.set(locale, null);
      }
   }

   const name = displayNames.get(locale)?.of(code) ?? language;

   return name.charAt(0).toLocaleUpperCase(INTL_TAGS[locale]) + name.slice(1);
}

/**
 * Plain-language edition name, e.g. "Study Bible (English, 2026)". Unknown editions fall back
 * to their publication symbol.
 */
export function datasetDisplayName(dataset: DatasetRegistryEntry, locale: Locale): string {
   const key = `shell.dataset.name.${dataset.publicationSymbol.toLowerCase()}`;
   const name = hasMessage(key) ? translate(locale, key) : dataset.publicationSymbol;
   const language = languageName(dataset.language, locale);

   return dataset.publicationYear
      ? translate(locale, 'shell.dataset.option', { name, language, year: dataset.publicationYear })
      : translate(locale, 'shell.dataset.optionNoYear', { name, language });
}

/** Edition switcher. The full publication title is exposed as the control's tooltip. */
export function DatasetBadge({
   datasets,
   selectedDatasetId,
   onChange,
}: DatasetBadgeProps): React.ReactElement {
   const locale = useLocale();
   const selected = datasets.find((dataset) => dataset.datasetId === selectedDatasetId);

   return (
      <div className="dataset-badge">
         <Database size={18} aria-hidden="true" />
         <label>
            <span>{translate(locale, 'shell.dataset.label')}</span>
            <select
               value={selectedDatasetId}
               title={selected?.publicationTitle}
               onChange={(event) => onChange(event.target.value)}
            >
               {datasets.map((dataset) => (
                  <option key={dataset.datasetId} value={dataset.datasetId}>
                     {datasetDisplayName(dataset, locale)}
                  </option>
               ))}
            </select>
         </label>
      </div>
   );
}
