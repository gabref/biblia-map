/**
 * Day-1 routing contract (owner: E-A). See docs/product/product-review.md §6.1.
 *
 * URL scheme (book segments are always the canonical English slug from `books.json`):
 *
 * | Path                                   | Route                                    |
 * | -------------------------------------- | ---------------------------------------- |
 * | `/`                                    | `{ name: 'home' }`                        |
 * | `/verse/<book>/<chapter>/<verse>`      | `{ name: 'verse', book, chapter, verse }` |
 * | `/verse` (legacy, no ref)              | verse John 3:16 with `fallback: true`     |
 * | `/read/<book>/<chapter>`               | `{ name: 'read', book, chapter }`         |
 * | `/book/<book>`                         | `{ name: 'book', book }`                  |
 * | `/insights?tab=<tab>`                  | `{ name: 'insights', tab? }`              |
 * | `/overview` (legacy)                   | insights, no tab (`redirectTo` set)       |
 * | `/chord` (legacy)                      | insights tab `chord` (`redirectTo` set)   |
 * | `/blocks` (legacy)                     | insights tab `clusters` (`redirectTo` set)|
 * | `/study`, `/study/<id>`, `/study/<id>/print` | `{ name: 'study', collectionId?, print? }` |
 * | `/about`                               | `{ name: 'about' }`                       |
 * | anything else / invalid ref            | `{ name: 'notFound' }`                    |
 *
 * Query params shared by all routes: `?ds=nwtsty&kind=combined&dir=all&depth=1&lang=en`.
 * Invalid values are dropped (never throw), so callers fall back to their defaults.
 *
 * Navigation: call `navigate(href)` (or render `<VerseLink>`); every component that
 * cares about the location reads it with `useRoute()`. Use `replace: true` for filter
 * changes and `pushState` (the default) for verse changes.
 */
import { useMemo, useSyncExternalStore } from 'react';

import type { DirectionMode, EdgeKindFilter } from '../types/generated';
import { bookByNumber, bookNumberFromSlug, bookSlug } from './bookSlugs';

export { BOOKS, bookByNumber, bookNumberFromSlug, bookSlug } from './bookSlugs';
export type { BookSlugEntry } from './bookSlugs';

export type AppRoute =
   | { name: 'home' }
   | {
      name: 'verse';
      book: number;
      chapter: number;
      verse: number;
      /** True for the legacy bare `/verse` URL: the ref is the default, and E-A may substitute the last visited verse. */
      fallback?: boolean;
   }
   | { name: 'read'; book: number; chapter: number }
   | { name: 'insights'; tab?: string }
   | { name: 'book'; book: number }
   | { name: 'study'; collectionId?: string; print?: boolean }
   | { name: 'about' }
   | { name: 'notFound' };

export type AppRouteName = AppRoute['name'];

export interface RouteParams {
   /** Dataset id, e.g. `nwtsty`. Not validated against the registry here (the shell does that). */
   ds?: string;
   kind?: EdgeKindFilter;
   dir?: DirectionMode;
   /** Graph depth: 1 (direct) or 2 (extended). */
   depth?: number;
   /** UI language override (owner E-F), two-letter code. */
   lang?: string;
}

export interface ParsedLocation {
   route: AppRoute;
   params: RouteParams;
   /** Set for legacy paths (`/overview`, `/chord`, `/blocks`): the canonical href to `navigate(..., { replace: true })` to. */
   redirectTo?: string;
}

/** Minimal verse locator; structurally compatible with `VerseRef` from `types/generated`. */
export interface VerseLocation {
   bookNumber: number;
   chapterNumber: number;
   verseNumber: number;
}

export interface ChapterLocation {
   bookNumber: number;
   chapterNumber: number;
}

/** Default verse for the legacy `/verse` URL and empty states: John 3:16. */
export const DEFAULT_VERSE: VerseLocation = { bookNumber: 43, chapterNumber: 3, verseNumber: 16 };

/** Name of the `CustomEvent` dispatched on `window` after every `navigate()` call. */
export const NAVIGATE_EVENT = 'bibliamap:navigate';

export interface NavigateEventDetail {
   href: string;
   replace: boolean;
}

const EDGE_KINDS: readonly EdgeKindFilter[] = [ 'combined', 'crossrefs', 'study-notes' ];
const DIRECTIONS: readonly DirectionMode[] = [ 'outgoing', 'incoming', 'all' ];
const MAX_DEPTH = 2;
/** Longest chapter (Psalm 119) has 176 verses. */
const MAX_VERSE = 176;

const LEGACY_INSIGHTS: Record<string, string | undefined> = {
   overview: undefined,
   chord: 'chord',
   blocks: 'clusters',
};

function positiveInt(segment: string | undefined): number | null {
   if (!segment || !/^\d{1,3}$/.test(segment)) {
      return null;
   }

   const value = Number(segment);

   return value >= 1 ? value : null;
}

function parseParams(search: URLSearchParams): RouteParams {
   const params: RouteParams = {};
   const ds = search.get('ds')?.trim();
   const kind = search.get('kind');
   const dir = search.get('dir');
   const depth = positiveInt(search.get('depth') ?? undefined);
   const lang = search.get('lang')?.trim().toLowerCase();

   if (ds && /^[a-z0-9][a-z0-9-]{0,31}$/i.test(ds)) {
      params.ds = ds;
   }

   if (kind && (EDGE_KINDS as readonly string[]).includes(kind)) {
      params.kind = kind as EdgeKindFilter;
   }

   if (dir && (DIRECTIONS as readonly string[]).includes(dir)) {
      params.dir = dir as DirectionMode;
   }

   if (depth !== null && depth <= MAX_DEPTH) {
      params.depth = depth;
   }

   if (lang && /^[a-z]{2}$/.test(lang)) {
      params.lang = lang;
   }

   return params;
}

function parsePath(segments: string[], search: URLSearchParams): Omit<ParsedLocation, 'params'> {
   const notFound: AppRoute = { name: 'notFound' };
   const [ head, ...rest ] = segments;

   if (head === undefined) {
      return { route: { name: 'home' } };
   }

   switch (head) {
      case 'verse': {
         if (rest.length === 0) {
            return {
               route: {
                  name: 'verse',
                  book: DEFAULT_VERSE.bookNumber,
                  chapter: DEFAULT_VERSE.chapterNumber,
                  verse: DEFAULT_VERSE.verseNumber,
                  fallback: true,
               },
            };
         }

         if (rest.length !== 3) {
            return { route: notFound };
         }

         const book = bookNumberFromSlug(rest[0]);
         const chapter = positiveInt(rest[1]);
         const verse = positiveInt(rest[2]);

         if (book === null || chapter === null || verse === null) {
            return { route: notFound };
         }

         if (chapter > (bookByNumber(book)?.chapters ?? 0) || verse > MAX_VERSE) {
            return { route: notFound };
         }

         return { route: { name: 'verse', book, chapter, verse } };
      }
      case 'read': {
         if (rest.length !== 2) {
            return { route: notFound };
         }

         const book = bookNumberFromSlug(rest[0]);
         const chapter = positiveInt(rest[1]);

         if (book === null || chapter === null || chapter > (bookByNumber(book)?.chapters ?? 0)) {
            return { route: notFound };
         }

         return { route: { name: 'read', book, chapter } };
      }
      case 'book': {
         const book = rest.length === 1 ? bookNumberFromSlug(rest[0]) : null;

         return { route: book === null ? notFound : { name: 'book', book } };
      }
      case 'insights': {
         if (rest.length > 0) {
            return { route: notFound };
         }

         const tab = search.get('tab')?.trim();

         return { route: tab ? { name: 'insights', tab } : { name: 'insights' } };
      }
      case 'overview':
      case 'chord':
      case 'blocks': {
         if (rest.length > 0) {
            return { route: notFound };
         }

         const tab = LEGACY_INSIGHTS[head];
         const route: AppRoute = tab ? { name: 'insights', tab } : { name: 'insights' };

         return { route, redirectTo: '' };
      }
      case 'study': {
         if (rest.length === 0) {
            return { route: { name: 'study' } };
         }

         if (rest.length === 1) {
            return { route: { name: 'study', collectionId: rest[0] } };
         }

         if (rest.length === 2 && rest[1] === 'print') {
            return { route: { name: 'study', collectionId: rest[0], print: true } };
         }

         return { route: notFound };
      }
      case 'about':
         return { route: rest.length === 0 ? { name: 'about' } : notFound };
      default:
         return { route: notFound };
   }
}

/** Parses a full URL into a route + validated query params. Never throws. */
export function parseLocation(url: URL): ParsedLocation {
   let segments: string[];

   try {
      segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
   } catch {
      return { route: { name: 'notFound' }, params: parseParams(url.searchParams) };
   }

   const params = parseParams(url.searchParams);
   const { route, redirectTo } = parsePath(segments, url.searchParams);

   if (redirectTo !== undefined) {
      return { route, params, redirectTo: routeHref(route, params) };
   }

   return { route, params };
}

function withQuery(path: string, params: RouteParams | undefined, extra?: Array<[string, string]>): string {
   const search = new URLSearchParams(extra);

   if (params?.ds) search.set('ds', params.ds);
   if (params?.kind) search.set('kind', params.kind);
   if (params?.dir) search.set('dir', params.dir);
   if (params?.depth !== undefined) search.set('depth', String(params.depth));
   if (params?.lang) search.set('lang', params.lang);

   const query = search.toString();

   return query ? `${path}?${query}` : path;
}

/** `/verse/john/3/16?ds=…&kind=…&dir=…&depth=…` (only the params given are emitted). */
export function verseHref(ref: VerseLocation, params?: RouteParams): string {
   return withQuery(`/verse/${bookSlug(ref.bookNumber)}/${ref.chapterNumber}/${ref.verseNumber}`, params);
}

/** `/read/john/3` (Read mode, owner E-E). */
export function chapterHref(ref: ChapterLocation, params?: RouteParams): string {
   return withQuery(`/read/${bookSlug(ref.bookNumber)}/${ref.chapterNumber}`, params);
}

/** `/book/john` (book profile, owner E-D). Accepts a book number or any object with `bookNumber`. */
export function bookHref(book: number | { bookNumber: number }, params?: RouteParams): string {
   const bookNumber = typeof book === 'number' ? book : book.bookNumber;

   return withQuery(`/book/${bookSlug(bookNumber)}`, params);
}

/** `/insights` or `/insights?tab=<tab>` (owner E-D). */
export function insightsHref(tab?: string, params?: RouteParams): string {
   return withQuery('/insights', params, tab ? [ [ 'tab', tab ] ] : undefined);
}

/** `/study`, `/study/<collectionId>`, or `/study/<collectionId>/print` (owner E-C). */
export function studyHref(collectionId?: string, opts?: { print?: boolean }, params?: RouteParams): string {
   if (!collectionId) {
      return withQuery('/study', params);
   }

   const base = `/study/${encodeURIComponent(collectionId)}`;

   return withQuery(opts?.print ? `${base}/print` : base, params);
}

/** Canonical href for any route (inverse of `parseLocation`). `notFound` maps to `/`. */
export function routeHref(route: AppRoute, params?: RouteParams): string {
   switch (route.name) {
      case 'home':
      case 'notFound':
         return withQuery('/', params);
      case 'verse':
         return verseHref({ bookNumber: route.book, chapterNumber: route.chapter, verseNumber: route.verse }, params);
      case 'read':
         return chapterHref({ bookNumber: route.book, chapterNumber: route.chapter }, params);
      case 'book':
         return bookHref(route.book, params);
      case 'insights':
         return insightsHref(route.tab, params);
      case 'study':
         return studyHref(route.collectionId, { print: route.print }, params);
      case 'about':
         return withQuery('/about', params);
   }
}

/**
 * Client-side navigation: `pushState` (or `replaceState` with `replace: true`), then
 * dispatches `NAVIGATE_EVENT` on `window` so `useRoute()` subscribers re-render.
 * Does not scroll; the shell decides scroll behaviour.
 */
export function navigate(href: string, opts?: { replace?: boolean }): void {
   const replace = opts?.replace ?? false;

   if (replace) {
      window.history.replaceState(window.history.state, '', href);
   } else {
      window.history.pushState({}, '', href);
   }

   window.dispatchEvent(new CustomEvent<NavigateEventDetail>(NAVIGATE_EVENT, { detail: { href, replace } }));
}

function subscribe(onChange: () => void): () => void {
   window.addEventListener('popstate', onChange);
   window.addEventListener(NAVIGATE_EVENT, onChange);

   return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener(NAVIGATE_EVENT, onChange);
   };
}

function getHref(): string {
   return window.location.href;
}

/** Current parsed location; re-renders on `navigate()` and browser back/forward. */
export function useRoute(): ParsedLocation {
   const href = useSyncExternalStore(subscribe, getHref, getHref);

   return useMemo(() => parseLocation(new URL(href)), [ href ]);
}
