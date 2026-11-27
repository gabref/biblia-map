/**
 * BibliaMap i18n (owner: E-F). English source strings live in `en.ts`, Italian in `it.ts`
 * (a `Partial<Messages>`: a missing Italian key falls back to English, then to the key).
 *
 * In components:
 *
 *    const t = useT();                       // re-renders when the language changes
 *    t('verse.connections.count', { count }) // "{count, plural, one {# link} other {# links}}"
 *    const { formatNumber, formatDate } = useFormat();
 *
 * Outside React (loaders, utils) call `t()` / `getLocale()` directly; they read the current
 * locale but do not subscribe.
 *
 * Message syntax:
 *  - `{name}` — replaced by `vars.name` (numbers are NOT auto-formatted: years would get a
 *    thousands separator; pass `formatNumber(n)` when you want grouping).
 *  - `{count, plural, =0 {none} one {# verse} other {# verses}}` — Intl.PluralRules for the
 *    locale; `#` is the locale-formatted number. Exact `=N` branches win over categories.
 *
 * Language resolution and the switcher API are in `locale.ts` (re-exported here).
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { en, type MessageKey, type Messages } from './en';
import { formatDateIn, formatDateTimeIn, formatNumberIn, formatPercentIn, pluralRules } from './format';
import { it } from './it';
import { DEFAULT_LOCALE, getLocale, subscribeLocale, type Locale } from './locale';

export { en } from './en';
export type { MessageKey, Messages } from './en';
export { it as itMessages } from './it';
export {
   DEFAULT_LOCALE,
   LOCALES,
   LOCALE_NAMES,
   LOCALE_STORAGE_KEY,
   datasetLocale,
   getLocale,
   normalizeLocale,
   resolveLocale,
   setDatasetLocaleHint,
   setLocale,
   subscribeLocale,
} from './locale';
export type { Locale, LocaleInputs } from './locale';
export { INTL_TAGS, formatDateIn, formatDateTimeIn, formatNumberIn, formatPercentIn } from './format';
export { bookName } from './bookNames';

export type TranslateVars = Record<string, string | number>;
export type TranslateFn = (key: MessageKey, vars?: TranslateVars) => string;

const dictionaries: Record<Locale, Partial<Messages>> = { en, it };

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchingBrace(source: string, open: number): number {
   let depth = 0;

   for (let index = open; index < source.length; index += 1) {
      const char = source[index];

      if (char === '{') {
         depth += 1;
      } else if (char === '}') {
         depth -= 1;

         if (depth === 0) {
            return index;
         }
      }
   }

   return -1;
}

function pluralBranch(body: string, value: number, locale: Locale): string | null {
   const branches = new Map<string, string>();
   let index = 0;

   while (index < body.length) {
      const open = body.indexOf('{', index);

      if (open === -1) {
         break;
      }

      const selector = body.slice(index, open).trim();
      const close = matchingBrace(body, open);

      if (!selector || close === -1) {
         return null;
      }

      branches.set(selector, body.slice(open + 1, close));
      index = close + 1;
   }

   const branch = branches.get(`=${value}`) ?? branches.get(pluralRules(locale).select(value)) ?? branches.get('other');

   return branch ?? null;
}

/**
 * Fills `{name}` placeholders and `{name, plural, ...}` blocks. Unknown placeholders and
 * malformed blocks are left as-is (visible in the UI rather than silently dropped).
 */
export function interpolate(template: string, vars?: TranslateVars, locale: Locale = getLocale()): string {
   if (!vars || !template.includes('{')) {
      return template;
   }

   let output = '';
   let index = 0;

   while (index < template.length) {
      const open = template.indexOf('{', index);

      if (open === -1) {
         output += template.slice(index);
         break;
      }

      output += template.slice(index, open);
      const close = matchingBrace(template, open);

      if (close === -1) {
         output += template.slice(open);
         break;
      }

      const inner = template.slice(open + 1, close);
      const simple = /^\s*(\w+)\s*$/.exec(inner);
      const plural = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
      let replacement: string | null = null;

      if (simple && simple[1] in vars) {
         replacement = String(vars[simple[1]]);
      } else if (plural && plural[1] in vars) {
         const value = Number(vars[plural[1]]);
         const branch = Number.isFinite(value) ? pluralBranch(plural[2], value, locale) : null;

         if (branch !== null) {
            replacement = interpolate(branch, vars, locale).replace(/#/g, formatNumberIn(locale, value));
         }
      }

      output += replacement ?? template.slice(open, close + 1);
      index = close + 1;
   }

   return output;
}

/** Translate in an explicit locale. */
export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
   const template = dictionaries[locale][key] ?? en[key] ?? key;

   return interpolate(template, vars, locale);
}

/** Translate in the current locale. Missing keys return the key itself. */
export function t(key: MessageKey, vars?: TranslateVars): string {
   return translate(getLocale(), key, vars);
}

/** `true` when `key` exists in English (for keys built at runtime, e.g. `shell.edgeKind.${kind}`). */
export function hasMessage(key: string): key is MessageKey {
   return key in en;
}

function getServerLocale(): Locale {
   return DEFAULT_LOCALE;
}

/** Current UI locale; re-renders on change. */
export function useLocale(): Locale {
   return useSyncExternalStore(subscribeLocale, getLocale, getServerLocale);
}

/** `t` bound to the current locale; a new function identity per locale (safe in deps). */
export function useT(): TranslateFn {
   const locale = useLocale();

   return useCallback((key: MessageKey, vars?: TranslateVars) => translate(locale, key, vars), [ locale ]);
}

export interface FormatApi {
   locale: Locale;
   formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
   formatPercent: (value: number, total: number) => string;
   formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
   formatDateTime: (value: Date | string | number) => string;
}

/** Locale-bound Intl helpers (cached formatters). */
export function useFormat(): FormatApi {
   const locale = useLocale();

   return useMemo(
      () => ({
         locale,
         formatNumber: (value, options) => formatNumberIn(locale, value, options),
         formatPercent: (value, total) => formatPercentIn(locale, value, total),
         formatDate: (value, options) => formatDateIn(locale, value, options),
         formatDateTime: (value) => formatDateTimeIn(locale, value),
      }),
      [ locale ],
   );
}
