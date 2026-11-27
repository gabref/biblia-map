/**
 * UI locale resolution and the tiny external store behind `useLocale()`.
 *
 * Priority (product review F-2):
 *   1. `?lang=` in the URL — captured as a session override, so it survives navigations
 *      that drop the query string, until the user picks a language in the switcher;
 *   2. the stored choice (`localStorage['bibliamap-lang']`, via utils/storage);
 *   3. the language of the selected dataset, when it is not English (`nwtsty-i` → `it`;
 *      English editions are the default selection, so they defer to the browser);
 *   4. `navigator.languages` / `navigator.language`;
 *   5. English.
 */
import { NAVIGATE_EVENT, navigate } from '../routing/routes';
import { datasetStorageKey, readStoredValue, writeStoredValue } from '../utils/storage';

export type Locale = 'en' | 'it';

export const LOCALES: readonly Locale[] = [ 'en', 'it' ];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'bibliamap-lang';

/** Endonyms, shown in the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', it: 'Italiano' };

/** `'it'`, `'IT'`, `'it-CH'`, `'Italian'`, `'italiano'` → `'it'`; anything unsupported → `null`. */
export function normalizeLocale(value: string | null | undefined): Locale | null {
   if (!value) {
      return null;
   }

   const lower = value.trim().toLowerCase();

   if (lower === 'italian' || lower === 'italiano') {
      return 'it';
   }

   if (lower === 'english' || lower === 'inglese') {
      return 'en';
   }

   const primary = lower.split(/[-_]/)[0];

   return (LOCALES as readonly string[]).includes(primary) ? (primary as Locale) : null;
}

/**
 * UI language implied by a dataset. Accepts a registry `language` ("Italian") or a dataset id;
 * ids use a `-<letter>` suffix for non-English editions (`nwtsty-i` = Italian).
 */
export function datasetLocale(dataset: string | { datasetId?: string; language?: string } | null | undefined): Locale | null {
   if (!dataset) {
      return null;
   }

   if (typeof dataset !== 'string') {
      return normalizeLocale(dataset.language) ?? datasetLocale(dataset.datasetId);
   }

   const fromName = normalizeLocale(dataset);

   if (fromName) {
      return fromName;
   }

   if (/-i$/i.test(dataset)) {
      return 'it';
   }

   return /^[a-z0-9]+$/i.test(dataset) ? 'en' : null;
}

export interface LocaleInputs {
   urlLang?: string | null;
   storedLang?: string | null;
   /** Dataset id or registry language. */
   dataset?: string | null;
   navigatorLanguages?: readonly string[];
}

/** Pure resolver; see the module comment for the order. */
export function resolveLocale({ urlLang, storedLang, dataset, navigatorLanguages = [] }: LocaleInputs): Locale {
   const fromDataset = datasetLocale(dataset);
   // English editions are the default selection, not a signal: they defer to the browser.
   const explicit = normalizeLocale(urlLang)
      ?? normalizeLocale(storedLang)
      ?? (fromDataset && fromDataset !== DEFAULT_LOCALE ? fromDataset : null);

   if (explicit) {
      return explicit;
   }

   for (const candidate of navigatorLanguages) {
      const locale = normalizeLocale(candidate);

      if (locale) {
         return locale;
      }
   }

   return DEFAULT_LOCALE;
}

// ---------- Store ----------

let sessionOverride: Locale | null = null;
let datasetHint: string | null = null;
let current: Locale = DEFAULT_LOCALE;
let initialised = false;
const listeners = new Set<() => void>();

function navigatorLanguages(): readonly string[] {
   if (typeof navigator === 'undefined') {
      return [];
   }

   return navigator.languages?.length ? navigator.languages : navigator.language ? [ navigator.language ] : [];
}

function urlLang(): string | null {
   if (typeof window === 'undefined') {
      return null;
   }

   try {
      return new URL(window.location.href).searchParams.get('lang');
   } catch {
      return null;
   }
}

function urlDataset(): string | null {
   if (typeof window === 'undefined') {
      return null;
   }

   try {
      return new URL(window.location.href).searchParams.get('ds');
   } catch {
      return null;
   }
}

function compute(): Locale {
   return resolveLocale({
      urlLang: sessionOverride,
      storedLang: readStoredValue(LOCALE_STORAGE_KEY),
      dataset: datasetHint ?? urlDataset() ?? readStoredValue(datasetStorageKey),
      navigatorLanguages: navigatorLanguages(),
   });
}

function applyDocumentLang(locale: Locale): void {
   if (typeof document !== 'undefined' && document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
   }
}

function update(): void {
   const next = compute();

   applyDocumentLang(next);

   if (next !== current) {
      current = next;
      listeners.forEach((listener) => listener());
   }
}

function captureUrlOverride(): void {
   const fromUrl = normalizeLocale(urlLang());

   if (fromUrl) {
      sessionOverride = fromUrl;
   }
}

function onLocationChange(): void {
   captureUrlOverride();
   update();
}

function ensureInitialised(): void {
   if (initialised) {
      return;
   }

   initialised = true;
   captureUrlOverride();
   current = compute();
   applyDocumentLang(current);

   if (typeof window !== 'undefined') {
      window.addEventListener('popstate', onLocationChange);
      window.addEventListener(NAVIGATE_EVENT, onLocationChange);
      // Another tab changed the language or the dataset.
      window.addEventListener('storage', (event) => {
         if (event.key === LOCALE_STORAGE_KEY || event.key === datasetStorageKey) {
            update();
         }
      });
   }
}

/** The current UI locale (non-reactive; components use `useLocale()`). */
export function getLocale(): Locale {
   ensureInitialised();

   return current;
}

export function subscribeLocale(listener: () => void): () => void {
   ensureInitialised();
   listeners.add(listener);

   return () => {
      listeners.delete(listener);
   };
}

/**
 * The user picked a language: remember it, drop any `?lang=` session override, and keep a
 * `?lang=` already in the URL in step (so reload/share shows the same language).
 */
export function setLocale(locale: Locale): void {
   ensureInitialised();
   sessionOverride = null;
   writeStoredValue(LOCALE_STORAGE_KEY, locale);

   if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);

      if (url.searchParams.has('lang') && url.searchParams.get('lang') !== locale) {
         url.searchParams.set('lang', locale);
         // navigate() fires NAVIGATE_EVENT, which re-captures the (now matching) override.
         navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
      }
   }

   update();
}

/**
 * Tell i18n which dataset is selected (id or `DatasetRegistryEntry`). Only matters while the
 * user has no explicit language: switching to the Italian edition then switches the UI too.
 * Without this call the dataset falls back to `?ds=` or the stored dataset id.
 */
export function setDatasetLocaleHint(dataset: string | { datasetId: string; language?: string } | null): void {
   ensureInitialised();

   if (dataset === null) {
      datasetHint = null;
   } else if (typeof dataset === 'string') {
      datasetHint = dataset;
   } else {
      datasetHint = dataset.language && normalizeLocale(dataset.language) ? dataset.language : dataset.datasetId;
   }

   update();
}

/** Test helper: forget all in-memory state and re-read the environment. */
export function resetLocaleForTests(): void {
   sessionOverride = null;
   datasetHint = null;
   captureUrlOverride();
   current = compute();
   applyDocumentLang(current);
   listeners.forEach((listener) => listener());
}
