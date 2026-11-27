/**
 * Locale-aware Intl formatting. Formatters are expensive to build and list views format
 * thousands of values per render, so each (locale, options) pair is built once.
 */
import type { Locale } from './locale';

/** BCP 47 tags used for Intl (region picks the grouping/decimal conventions). */
export const INTL_TAGS: Record<Locale, string> = { en: 'en-US', it: 'it-IT' };

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.PluralRules>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.PluralRules>(
   kind: string,
   locale: Locale,
   options: object | undefined,
   build: (tag: string) => T,
): T {
   const key = `${kind}|${locale}|${options ? JSON.stringify(options) : ''}`;
   let formatter = cache.get(key) as T | undefined;

   if (!formatter) {
      formatter = build(INTL_TAGS[locale]);
      cache.set(key, formatter);
   }

   return formatter;
}

export function numberFormatter(locale: Locale, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
   return cached('n', locale, options, (tag) => new Intl.NumberFormat(tag, options));
}

export function dateFormatter(locale: Locale, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
   return cached('d', locale, options, (tag) => new Intl.DateTimeFormat(tag, options));
}

export function pluralRules(locale: Locale): Intl.PluralRules {
   return cached('p', locale, undefined, (tag) => new Intl.PluralRules(tag));
}

export function formatNumberIn(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
   return numberFormatter(locale, options).format(value);
}

const DEFAULT_DATE: Intl.DateTimeFormatOptions = { dateStyle: 'medium' };
const DEFAULT_DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

function toDate(value: Date | string | number): Date {
   return value instanceof Date ? value : new Date(value);
}

/** Returns `''` for an invalid date instead of throwing. */
export function formatDateIn(locale: Locale, value: Date | string | number, options: Intl.DateTimeFormatOptions = DEFAULT_DATE): string {
   const date = toDate(value);

   return Number.isNaN(date.getTime()) ? '' : dateFormatter(locale, options).format(date);
}

export function formatDateTimeIn(locale: Locale, value: Date | string | number): string {
   return formatDateIn(locale, value, DEFAULT_DATE_TIME);
}

/**
 * Whole-number share of `value / total`. The extremes read "<1%" and ">99%" so 3 of 31,078
 * is not "0%" and 31,070 of 31,078 is not "100%". Italian puts no space before `%` either.
 */
export function formatPercentIn(locale: Locale, value: number, total: number): string {
   const format = (n: number): string => `${formatNumberIn(locale, n)}%`;

   if (total === 0 || value <= 0) {
      return format(0);
   }

   if (value >= total) {
      return format(100);
   }

   const percent = (value / total) * 100;

   if (percent < 1) {
      return `<${format(1)}`;
   }

   if (percent > 99) {
      return `>${format(99)}`;
   }

   return format(Math.round(percent));
}
