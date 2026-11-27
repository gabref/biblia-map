import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import type { Book } from '../types/generated';
import {
   BOOKS,
   NAVIGATE_EVENT,
   bookHref,
   bookNumberFromSlug,
   bookSlug,
   chapterHref,
   insightsHref,
   navigate,
   parseLocation,
   routeHref,
   studyHref,
   useRoute,
   verseHref,
} from './routes';

const datasetBooks = import.meta.glob<Book[]>('../../public/generated/*/books.json', { eager: true, import: 'default' });

function parse(path: string): ReturnType<typeof parseLocation> {
   return parseLocation(new URL(path, 'https://bibliamap.test'));
}

describe('book slug table', () => {
   it('has 66 books matching every dataset books.json', () => {
      expect(BOOKS).toHaveLength(66);
      expect(Object.keys(datasetBooks).length).toBeGreaterThan(0);

      for (const [ path, books ] of Object.entries(datasetBooks)) {
         expect(books.map((book) => [ book.bookNumber, book.slug, book.chapters ]), path).toEqual(
            BOOKS.map((book) => [ book.bookNumber, book.slug, book.chapters ]),
         );
      }
   });

   it('maps slugs both ways', () => {
      expect(bookSlug(43)).toBe('john');
      expect(bookNumberFromSlug('JOHN')).toBe(43);
      expect(bookNumberFromSlug('song-of-solomon')).toBe(22);
      expect(bookNumberFromSlug('43')).toBe(43);
      expect(bookNumberFromSlug('67')).toBeNull();
      expect(bookNumberFromSlug('giovanni')).toBeNull();
      expect(() => bookSlug(0)).toThrow(RangeError);
   });
});

describe('parseLocation / hrefs', () => {
   it('round-trips verse, chapter and book hrefs for all 66 slugs', () => {
      for (const book of BOOKS) {
         const verse = { bookNumber: book.bookNumber, chapterNumber: book.chapters, verseNumber: 1 };

         expect(parse(verseHref(verse)).route).toEqual({ name: 'verse', book: book.bookNumber, chapter: book.chapters, verse: 1 });
         expect(parse(chapterHref(verse)).route).toEqual({ name: 'read', book: book.bookNumber, chapter: book.chapters });
         expect(parse(bookHref(book)).route).toEqual({ name: 'book', book: book.bookNumber });
      }
   });

   it('parses the spec example with params', () => {
      expect(parse('/verse/john/3/16?ds=nwtsty&kind=study-notes')).toEqual({
         route: { name: 'verse', book: 43, chapter: 3, verse: 16 },
         params: { ds: 'nwtsty', kind: 'study-notes' },
      });
      expect(verseHref({ bookNumber: 43, chapterNumber: 3, verseNumber: 16 }, { ds: 'nwtsty', kind: 'combined', dir: 'all', depth: 1 }))
         .toBe('/verse/john/3/16?ds=nwtsty&kind=combined&dir=all&depth=1');
   });

   it('drops invalid params instead of throwing', () => {
      expect(parse('/verse/john/3/16?ds=../x&kind=bogus&dir=up&depth=9&lang=english').params).toEqual({});
      expect(parse('/?depth=2&lang=IT&dir=incoming').params).toEqual({ depth: 2, lang: 'it', dir: 'incoming' });
   });

   it('rejects invalid refs as notFound', () => {
      for (const path of [ '/verse/john/22/1', '/verse/nope/1/1', '/verse/john/3', '/verse/john/0/1', '/verse/john/3/x', '/read/john', '/book/x', '/zzz', '/about/x', '/verse/%E0%A4%A' ]) {
         expect(parse(path).route, path).toEqual({ name: 'notFound' });
      }
   });

   it('handles home, about, study, insights and legacy paths', () => {
      expect(parse('/').route).toEqual({ name: 'home' });
      expect(parse('/about/').route).toEqual({ name: 'about' });
      expect(parse('/study').route).toEqual({ name: 'study' });
      expect(parse('/study/talk-1/print').route).toEqual({ name: 'study', collectionId: 'talk-1', print: true });
      expect(parse('/insights?tab=hubs').route).toEqual({ name: 'insights', tab: 'hubs' });
      expect(parse('/verse').route).toEqual({ name: 'verse', book: 43, chapter: 3, verse: 16, fallback: true });

      expect(parse('/overview')).toEqual({ route: { name: 'insights' }, params: {}, redirectTo: '/insights' });
      expect(parse('/chord?ds=rbi8')).toEqual({ route: { name: 'insights', tab: 'chord' }, params: { ds: 'rbi8' }, redirectTo: '/insights?tab=chord&ds=rbi8' });
      expect(parse('/blocks').redirectTo).toBe('/insights?tab=clusters');
   });

   it('turns JW Library hand-offs on /open into canonical pages', () => {
      expect(parse('/open?bible=43003016&wtlocale=I&pub=nwtsty').redirectTo).toBe('/verse/john/3/16?ds=nwtsty-i');
      expect(parse('/open?bible=19023000-19023999&wtlocale=E&pub=nwtsty').redirectTo).toBe('/read/psalms/23?ds=nwtsty');
      expect(parse('/open?ds=rbi8&bible=43003016&wtlocale=I').redirectTo).toBe('/verse/john/3/16?ds=rbi8');
      expect(parse(`/open?text=${encodeURIComponent('Look: https://www.jw.org/finder?bible=40024014&pub=nwt')}`).redirectTo).toBe('/verse/matthew/24/14?ds=nwt');
      expect(parse('/open?text=hello').redirectTo).toBe('/');
   });

   it('routeHref inverts parseLocation', () => {
      for (const path of [ '/', '/about', '/study', '/study/a%20b', '/insights?tab=hubs', '/book/jude', '/read/psalms/119', '/verse/3-john/1/14?ds=nwt' ]) {
         const { route, params } = parse(path);

         expect(routeHref(route, params)).toBe(path);
      }

      expect(studyHref('x', { print: true })).toBe('/study/x/print');
      expect(insightsHref()).toBe('/insights');
   });
});

describe('navigate / useRoute', () => {
   afterEach(() => window.history.replaceState({}, '', '/'));

   it('pushes, replaces, notifies and follows popstate', () => {
      const events: string[] = [];
      const onNavigate = (event: Event): void => {
         events.push((event as CustomEvent<{ href: string }>).detail.href);
      };

      window.addEventListener(NAVIGATE_EVENT, onNavigate);
      const { result } = renderHook(() => useRoute());

      expect(result.current.route).toEqual({ name: 'home' });

      const lengthBefore = window.history.length;

      act(() => navigate('/verse/john/3/16'));
      expect(result.current.route).toEqual({ name: 'verse', book: 43, chapter: 3, verse: 16 });
      expect(window.history.length).toBe(lengthBefore + 1);

      act(() => navigate('/verse/john/3/16?kind=crossrefs', { replace: true }));
      expect(result.current.params).toEqual({ kind: 'crossrefs' });
      expect(window.history.length).toBe(lengthBefore + 1);

      act(() => {
         window.history.replaceState({}, '', '/about');
         window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(result.current.route).toEqual({ name: 'about' });

      expect(events).toEqual([ '/verse/john/3/16', '/verse/john/3/16?kind=crossrefs' ]);
      window.removeEventListener(NAVIGATE_EVENT, onNavigate);
   });
});
