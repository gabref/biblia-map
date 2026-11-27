/**
 * Lazily loaded message dictionaries and the "rendered locale" store.
 *
 * `en.ts` / `it.ts` are NOT in the entry chunk: each is a dynamic-import chunk and only the
 * active one is fetched. `en.ts` stays the typed source of keys (`import type` only here).
 *
 * Two locales exist side by side:
 *  - the *requested* locale (`getLocale()` in `locale.ts`): resolved synchronously from
 *    `?lang=` > stored > dataset > navigator, changes as soon as the user switches;
 *  - the *rendered* locale (`getRenderedLocale()`): the requested one once its dictionary has
 *    loaded. Hooks follow this one, so a switch never shows raw keys — the UI stays in the old
 *    language for the few ms the other chunk takes, then re-renders.
 *
 * `main.tsx` awaits `initI18n()` before the first render.
 */
import type { Messages } from './en';
import { DEFAULT_LOCALE, getLocale, subscribeLocale, type Locale } from './locale';

type Dictionary = Partial<Messages>;

const loaders: Record<Locale, () => Promise<Dictionary>> = {
   en: () => import('./en').then((module) => module.en),
   it: () => import('./it').then((module) => module.it),
};

const dictionaries: Partial<Record<Locale, Dictionary>> = {};
const pending = new Map<Locale, Promise<void>>();
const listeners = new Set<() => void>();
let rendered: Locale | null = null;
let storeReady = false;

/** The loaded dictionary for `locale`, if any. */
export function dictionaryFor(locale: Locale): Dictionary | undefined {
   return dictionaries[locale];
}

export function isLocaleLoaded(locale: Locale): boolean {
   return dictionaries[locale] !== undefined;
}

/** Fetches a locale's dictionary once (concurrent calls share the request). */
export function loadLocale(locale: Locale): Promise<void> {
   if (dictionaries[locale]) {
      return Promise.resolve();
   }

   let request = pending.get(locale);

   if (!request) {
      request = loaders[locale]().then(
         (dictionary) => {
            dictionaries[locale] = dictionary;
            pending.delete(locale);
            syncRendered();
         },
         (error: unknown) => {
            pending.delete(locale);
            throw error;
         },
      );
      pending.set(locale, request);
   }

   return request;
}

function notify(): void {
   listeners.forEach((listener) => listener());
}

/** Moves the rendered locale to the requested one when its dictionary is ready, else loads it. */
function syncRendered(): void {
   const wanted = getLocale();

   if (dictionaries[wanted]) {
      if (rendered !== wanted) {
         rendered = wanted;
         notify();
      }

      return;
   }

   // Keep showing the previous language; a failed load (offline) leaves it in place.
   loadLocale(wanted).catch(() => undefined);
}

function ensureStore(): void {
   if (storeReady) {
      return;
   }

   storeReady = true;
   subscribeLocale(syncRendered);
}

/** Locale the UI is rendered in: the requested one once loaded (see the module comment). */
export function getRenderedLocale(): Locale {
   ensureStore();

   if (rendered === null || !dictionaries[rendered]) {
      const wanted = getLocale();

      if (dictionaries[wanted]) {
         rendered = wanted;
      } else {
         return rendered ?? wanted;
      }
   }

   return rendered;
}

export function subscribeRenderedLocale(listener: () => void): () => void {
   ensureStore();
   listeners.add(listener);

   return () => {
      listeners.delete(listener);
   };
}

function whenIdle(callback: () => void): void {
   if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(callback, { timeout: 5000 });
   } else {
      setTimeout(callback, 2000);
   }
}

/**
 * Loads the active locale's dictionary; call (and await) before the first render. Never
 * rejects: if the chunk cannot be fetched the app still renders (with English if that loaded,
 * else keys). For a non-English locale English is fetched later, when idle, as the fallback
 * for keys a translation may lack.
 */
export async function initI18n(): Promise<Locale> {
   ensureStore();
   const locale = getLocale();

   try {
      await loadLocale(locale);
   } catch {
      await loadLocale(DEFAULT_LOCALE).catch(() => undefined);
   }

   syncRendered();

   if (locale !== DEFAULT_LOCALE) {
      whenIdle(() => {
         loadLocale(DEFAULT_LOCALE).catch(() => undefined);
      });
   }

   return getRenderedLocale();
}
