import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatNumber, formatPercent } from '../utils/format';
import {
   LOCALE_STORAGE_KEY,
   datasetLocale,
   en,
   formatDateIn,
   getLocale,
   interpolate,
   itMessages,
   normalizeLocale,
   resolveLocale,
   setDatasetLocaleHint,
   setLocale,
   t,
   translate,
   useFormat,
   useLocale,
   useT,
   type MessageKey,
} from './index';
import enSource from './en.ts?raw';
import { resetLocaleForTests } from './locale';

function setNavigatorLanguages(languages: string[]): void {
   vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages);
   vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
}

beforeEach(() => {
   window.localStorage.clear();
   window.history.replaceState({}, '', '/');
   setNavigatorLanguages([ 'en-US' ]);
   resetLocaleForTests();
});

afterEach(() => {
   vi.restoreAllMocks();
   window.localStorage.clear();
   window.history.replaceState({}, '', '/');
   resetLocaleForTests();
});

describe('normalizeLocale / datasetLocale', () => {
   it('accepts codes, regions and language names', () => {
      expect(normalizeLocale('it')).toBe('it');
      expect(normalizeLocale('IT-ch')).toBe('it');
      expect(normalizeLocale('en_GB')).toBe('en');
      expect(normalizeLocale('Italian')).toBe('it');
      expect(normalizeLocale('fr')).toBeNull();
      expect(normalizeLocale('')).toBeNull();
      expect(normalizeLocale(null)).toBeNull();
   });

   it('maps datasets to a language', () => {
      expect(datasetLocale('nwtsty-i')).toBe('it');
      expect(datasetLocale('nwtsty')).toBe('en');
      expect(datasetLocale({ datasetId: 'x', language: 'Italian' })).toBe('it');
      expect(datasetLocale({ datasetId: 'nwtsty-i' })).toBe('it');
      expect(datasetLocale(null)).toBeNull();
   });
});

describe('resolveLocale (pure)', () => {
   it('prefers the URL over everything', () => {
      expect(resolveLocale({ urlLang: 'it', storedLang: 'en', dataset: 'nwt', navigatorLanguages: [ 'en' ] })).toBe('it');
   });

   it('then the stored choice', () => {
      expect(resolveLocale({ urlLang: 'xx', storedLang: 'en', dataset: 'nwtsty-i', navigatorLanguages: [ 'it' ] })).toBe('en');
   });

   it('then a non-English dataset', () => {
      expect(resolveLocale({ dataset: 'nwtsty-i', navigatorLanguages: [ 'en-US' ] })).toBe('it');
   });

   it('lets an English dataset defer to the browser', () => {
      expect(resolveLocale({ dataset: 'nwtsty', navigatorLanguages: [ 'it-IT', 'en' ] })).toBe('it');
   });

   it('takes the first supported browser language, else English', () => {
      expect(resolveLocale({ navigatorLanguages: [ 'fr-FR', 'it', 'en' ] })).toBe('it');
      expect(resolveLocale({ navigatorLanguages: [ 'de' ] })).toBe('en');
      expect(resolveLocale({})).toBe('en');
   });
});

describe('locale store', () => {
   it('reads ?lang= from the URL and keeps it after navigating away', () => {
      window.history.replaceState({}, '', '/about?lang=it');
      resetLocaleForTests();
      expect(getLocale()).toBe('it');
      expect(document.documentElement.lang).toBe('it');

      window.history.pushState({}, '', '/verse/john/3/16');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(getLocale()).toBe('it');
   });

   it('reads localStorage, then the stored dataset, then navigator', () => {
      setNavigatorLanguages([ 'it-IT' ]);
      resetLocaleForTests();
      expect(getLocale()).toBe('it');

      window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
      resetLocaleForTests();
      expect(getLocale()).toBe('en');

      window.localStorage.clear();
      setNavigatorLanguages([ 'en-US' ]);
      window.localStorage.setItem('bibliamap-dataset', 'nwtsty-i');
      resetLocaleForTests();
      expect(getLocale()).toBe('it');
   });

   it('follows the dataset hint until the user chooses a language', () => {
      setDatasetLocaleHint('nwtsty-i');
      expect(getLocale()).toBe('it');
      setDatasetLocaleHint({ datasetId: 'nwtsty', language: 'English' });
      expect(getLocale()).toBe('en');

      setLocale('en');
      setDatasetLocaleHint('nwtsty-i');
      expect(getLocale()).toBe('en');
      expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
   });

   it('setLocale overrides ?lang= and rewrites it in the URL', () => {
      window.history.replaceState({}, '', '/about?lang=it&ds=nwt');
      resetLocaleForTests();
      setLocale('en');
      expect(getLocale()).toBe('en');
      expect(window.location.search).toBe('?lang=en&ds=nwt');
   });

   it('survives blocked localStorage', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
         throw new DOMException('blocked', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
         throw new DOMException('blocked', 'SecurityError');
      });
      resetLocaleForTests();
      expect(getLocale()).toBe('en');
      expect(() => setLocale('it')).not.toThrow();
      expect(getLocale()).toBe('en');
   });

   it('re-renders hooks on change', () => {
      const { result, unmount } = renderHook(() => ({ locale: useLocale(), t: useT(), format: useFormat() }));

      expect(result.current.locale).toBe('en');
      expect(result.current.t('shell.nav.home')).toBe('Home');
      expect(result.current.format.formatNumber(1234.5)).toBe('1,234.5');

      act(() => setLocale('it'));
      expect(result.current.locale).toBe('it');
      expect(result.current.t('shell.nav.read')).toBe('Leggi');
      expect(result.current.format.formatNumber(12345.5)).toBe('12.345,5');
      expect(document.documentElement.lang).toBe('it');
      unmount();
   });
});

describe('translation', () => {
   it('returns the current locale with English fallback', () => {
      expect(t('shell.nav.home')).toBe('Home');
      expect(translate('it', 'shell.loading')).toBe('Caricamento…');
      // A key missing in Italian falls back to English, an unknown key to itself.
      expect(translate('it', 'nope.missing' as MessageKey)).toBe('nope.missing');
   });

   it('interpolates placeholders and leaves unknown ones', () => {
      expect(t('verse.connections.count', { count: 12 })).toBe('12 connections');
      expect(interpolate('{a} {b}', { a: 1 })).toBe('1 {b}');
      expect(interpolate('no vars {a}')).toBe('no vars {a}');
      expect(interpolate('{a', { a: 1 })).toBe('{a');
   });

   it('selects plural branches per locale', () => {
      const template = '{count, plural, =0 {none} one {# verse} other {# verses in {book}}}';

      expect(interpolate(template, { count: 0, book: 'John' }, 'en')).toBe('none');
      expect(interpolate(template, { count: 1, book: 'John' }, 'en')).toBe('1 verse');
      expect(interpolate(template, { count: 1200, book: 'John' }, 'en')).toBe('1,200 verses in John');
      expect(interpolate(template, { count: 1200, book: 'Giovanni' }, 'it')).toBe('1200 verses in Giovanni');
      expect(translate('it', 'shell.filters.activeCount', { count: 2 })).toBe('2 filtri attivi');
      expect(translate('it', 'shell.filters.activeCount', { count: 1 })).toBe('1 filtro attivo');
   });

   it('formats numbers, percents and dates by locale', () => {
      expect(formatNumber(65666)).toBe('65,666');
      expect(formatPercent(3, 31_078)).toBe('<1%');
      setLocale('it');
      expect(formatNumber(65666)).toBe('65.666');
      expect(formatPercent(1, 4)).toBe('25%');
      expect(formatDateIn('it', '2026-08-01T12:00:00Z', { dateStyle: 'long', timeZone: 'UTC' })).toBe('1 agosto 2026');
      expect(formatDateIn('en', 'not a date')).toBe('');
   });
});

describe('it.ts parity', () => {
   const placeholders = (value: string): string =>
      [ ...new Set([ ...value.matchAll(/\{\s*(\w+)\s*(?:,\s*plural\s*,|\})/g) ].map((match) => match[1])) ].sort().join(',');

   it('has no keys that English lacks, and matching placeholders', () => {
      for (const [ key, value ] of Object.entries(itMessages)) {
         expect(key in en, `unknown Italian key ${key}`).toBe(true);
         expect(placeholders(value as string), key).toBe(placeholders(en[key as MessageKey]));
      }
   });

   it('the check script sees the same keys as TypeScript', () => {
      const parsed = [ ...enSource.matchAll(/^\s*(['"])([\w.-]+)\1\s*:/gm) ].map((match) => match[2]);

      expect(parsed.sort()).toEqual(Object.keys(en).sort());
   });
});
