/**
 * Day-1 i18n contract (§6.1). **Epic E-F owns the implementation**; today it is an
 * English-only stub with the final signatures.
 *
 * Usage: `t('verse.connections.count', { count: 12 })`. Add new strings to `en.ts` under
 * your epic's namespace (`home.`, `verse.`, `study.`, `insights.`, `read.`, `shell.`).
 * Keys are typed (`MessageKey`), so a typo is a compile error.
 *
 * Inside components prefer `const t = useT()` so a later locale switch re-renders.
 */
import { en, type MessageKey, type Messages } from './en';

export { en } from './en';
export type { MessageKey, Messages } from './en';

export type Locale = 'en' | 'it';
export type TranslateVars = Record<string, string | number>;
export type TranslateFn = (key: MessageKey, vars?: TranslateVars) => string;

export const DEFAULT_LOCALE: Locale = 'en';

const dictionaries: Record<Locale, Partial<Messages>> = { en, it: {} };

/** Replaces `{name}` placeholders; unknown placeholders are left as-is. */
export function interpolate(template: string, vars?: TranslateVars): string {
   if (!vars) {
      return template;
   }

   return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Translates `key` in the current locale (stub: always English). Missing keys return the key itself. */
export function t(key: MessageKey, vars?: TranslateVars): string {
   const template = dictionaries[DEFAULT_LOCALE][key] ?? en[key] ?? key;

   return interpolate(template, vars);
}

/** Current UI locale. Stub: always `'en'` (E-F: `?lang=` > localStorage > dataset > navigator). */
export function useLocale(): Locale {
   return DEFAULT_LOCALE;
}

/** Hook form of `t`, bound to the current locale. */
export function useT(): TranslateFn {
   return t;
}
