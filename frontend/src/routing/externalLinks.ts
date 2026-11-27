/**
 * Links that leave BibliaMap. JW Library (current and next-generation app) claims
 * `https://www.jw.org/finder` links, so one URL opens the verse in the app when it is
 * installed and on jw.org otherwise. The `bible=` key uses the same BBCCCVVV encoding
 * as `canonicalVerseId`, so no mapping is needed.
 */

/** BCP 47 language → jw.org `wtlocale` (MEPS symbol). */
const WT_LOCALES: Readonly<Record<string, string>> = {
   en: 'E',
   it: 'I',
   es: 'S',
   pt: 'T',
   fr: 'F',
   de: 'X',
};

const FINDER_BASE = 'https://www.jw.org/finder';

export interface JwFinderOptions {
   /** BCP 47 language of the dataset, e.g. `it`. Unknown or missing falls back to English. */
   lang: string | undefined;
   /** Publication symbol of the dataset, e.g. `nwtsty`. */
   publicationSymbol: string | undefined;
}

function isVerseId(id: number): boolean {
   return Number.isInteger(id) && id >= 1_001_000 && id <= 66_999_999;
}

/** Zero-padded BBCCCVVV, the form jw.org finder expects (`01001001`). */
export function bibleKey(canonicalVerseId: number): string {
   return String(canonicalVerseId).padStart(8, '0');
}

/**
 * `https://www.jw.org/finder?…&bible=43003016&pub=nwtsty` for a verse, or a
 * `start-end` range when `endVerseId` is a later verse. `null` for an invalid id.
 */
export function jwFinderHref(canonicalVerseId: number, options: JwFinderOptions, endVerseId?: number): string | null {
   if (!isVerseId(canonicalVerseId)) {
      return null;
   }

   const wtlocale = WT_LOCALES[options.lang ?? ''] ?? 'E';
   const range = endVerseId !== undefined && isVerseId(endVerseId) && endVerseId > canonicalVerseId
      ? `${bibleKey(canonicalVerseId)}-${bibleKey(endVerseId)}`
      : bibleKey(canonicalVerseId);
   const query = new URLSearchParams({ wtlocale, prefer: 'lang', bible: range });

   if (options.publicationSymbol) {
      query.set('pub', options.publicationSymbol.toLowerCase());
   }

   return `${FINDER_BASE}?${query.toString()}`;
}
