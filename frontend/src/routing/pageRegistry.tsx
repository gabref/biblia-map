/**
 * Route → page registry (owner: E-A). Every page is code-split with React.lazy (boot preloads
 * the current one in parallel with datasets.json, see main.tsx / pages/lazyPages.ts);
 * `App.tsx` renders `pages[route.name]` inside <Suspense>.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────┐
 * │ OTHER STREAMS: to mount your page, change ONLY your line in `pageLoaders` below,     │
 * │ e.g. for E-C:                                                                        │
 * │    study: () => import('../pages/StudyPage').then((m) => ({ default: m.StudyPage })), │
 * │ Your component receives the props type named next to the line (extra props are fine │
 * │ to ignore). Don't edit App.tsx; ask E-A if you need a new prop.                      │
 * └──────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Shell guarantees for every page: one dataset id that exists in the registry; scroll reset
 * and focus moved to the page's first <h1> after client-side navigation (render one <h1>);
 * a default `document.title` per route (a page may set a more specific one after mount).
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { loadBookMatrix, loadBooks, loadChapters, loadManifest, loadStatsSummary } from '../data/generated';
import type { HomePageProps } from '../pages/HomePage';
import type { NotFoundPageProps } from './NotFoundPage';
import { parseLocation, type AppRoute, type RouteParams } from './routes';

interface BasePageProps {
   datasetId: string;
   /** Validated query params (`ds`, `kind`, `dir`, `depth`, `lang`). */
   params: RouteParams;
}

/** E-B — `/verse/<book>/<chapter>/<verse>` */
export interface VersePageProps extends BasePageProps {
   book: number;
   chapter: number;
   verse: number;
}

/** E-E — `/read/<book>/<chapter>` */
export interface ReadPageProps extends BasePageProps {
   book: number;
   chapter: number;
}

/** E-D — `/insights?tab=<tab>` (legacy `/overview`, `/chord`, `/blocks` redirect here). */
export interface InsightsPageProps extends BasePageProps {
   tab?: string;
}

/** E-D — `/book/<book>` */
export interface BookPageProps extends BasePageProps {
   book: number;
}

/** E-C — `/study`, `/study/<collectionId>`, `/study/<collectionId>/print` */
export interface StudyPageProps extends BasePageProps {
   collectionId?: string;
   print?: boolean;
}

/** E-F — `/about` */
export type AboutPageProps = BasePageProps;

export interface PagePropsByRoute {
   home: HomePageProps;
   notFound: NotFoundPageProps;
   verse: VersePageProps;
   read: ReadPageProps;
   insights: InsightsPageProps;
   book: BookPageProps;
   study: StudyPageProps;
   about: AboutPageProps;
   styleguide: Record<string, never>;
}

export type RegisteredPage = keyof PagePropsByRoute;

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;
type Loaders = { [K in RegisteredPage]: Loader<PagePropsByRoute[K]> };

export const pageLoaders: Loaders = {
   home: () => import('../pages/HomePage').then((m) => ({ default: m.HomePage })),
   notFound: () => import('./NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
   // E-B (reads the verse and filters from useRoute(); listens to the `[` / `]` step event).
   verse: () => import('../pages/verse/VersePage').then((m) => ({ default: m.VersePage })),
   // E-E (manages its own scroll on chapter change / #vN).
   read: () => import('../pages/read/ReadPage').then((m) => ({ default: m.ReadPage })),
   // E-D: () => import('../pages/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })),
   insights: () => import('./placeholders').then((m) => ({ default: m.InsightsPlaceholder })),
   // E-D: () => import('../pages/insights/BookPage').then((m) => ({ default: m.BookPage })),
   book: () => import('./placeholders').then((m) => ({ default: m.BookPlaceholder })),
   // E-C (reads collectionId / print from useRoute() itself).
   study: () => import('../pages/StudyPage').then((m) => ({ default: m.StudyPage })),
   about: () => import('../pages/AboutPage').then((m) => ({ default: m.AboutPage })),
   styleguide: () => import('../pages/StyleguidePage').then((m) => ({ default: m.StyleguidePage })),
};

type LazyPages = { [K in RegisteredPage]: LazyExoticComponent<ComponentType<PagePropsByRoute[K]>> };

export const pages: LazyPages = {
   home: lazy(pageLoaders.home),
   notFound: lazy(pageLoaders.notFound),
   verse: lazy(pageLoaders.verse),
   read: lazy(pageLoaders.read),
   insights: lazy(pageLoaders.insights),
   book: lazy(pageLoaders.book),
   study: lazy(pageLoaders.study),
   about: lazy(pageLoaders.about),
   styleguide: lazy(pageLoaders.styleguide),
};

export function isRegisteredPage(name: AppRoute['name'] | 'styleguide'): name is RegisteredPage {
   return name in pageLoaders;
}

/** Any route name the shell can render, plus the `/styleguide` dev page. */
export type ShellPageName = AppRoute['name'] | 'styleguide';

/**
 * JSON each page reads on mount, warmed together with its chunk (boot, nav hover/focus).
 * Pages load the same files through `data/generated` (shared promise cache), so a prefetch
 * is never wasted. Keep heavy files (edges, adjacency) out of here.
 */
const dataPrefetchers: Record<ShellPageName, (datasetId: string, route?: AppRoute) => Array<Promise<unknown>>> = {
   // Home / not found: search data (search-index.json, when present, is fetched by the search itself).
   home: (datasetId) => [ loadManifest(datasetId), loadBooks(datasetId) ],
   notFound: (datasetId) => [ loadManifest(datasetId), loadBooks(datasetId) ],
   verse: (datasetId) => [ loadManifest(datasetId), loadBooks(datasetId), loadChapters(datasetId), loadStatsSummary(datasetId) ],
   read: (datasetId) => [ loadManifest(datasetId), loadBooks(datasetId), loadChapters(datasetId) ],
   insights: (datasetId, route) => {
      const tab = route?.name === 'insights' ? route.tab : undefined;

      if (tab === 'chord') return [ loadBooks(datasetId), loadBookMatrix(datasetId, 'combined') ];
      if (tab === 'clusters') return [ loadManifest(datasetId), loadBooks(datasetId) ];

      return [ loadManifest(datasetId), loadStatsSummary(datasetId) ];
   },
   book: (datasetId) => [ loadManifest(datasetId), loadBooks(datasetId) ],
   study: () => [],
   about: (datasetId) => [ loadManifest(datasetId), loadStatsSummary(datasetId) ],
   styleguide: () => [],
};

function prefersReducedData(): boolean {
   const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;

   return connection?.saveData === true;
}

/**
 * Warm a page's chunk and, when `datasetId` is given, the JSON it reads on mount.
 * Call on boot and on nav hover/focus. Failures surface when the page itself loads.
 */
export function preloadPage(name: ShellPageName, datasetId?: string | null, route?: AppRoute): void {
   if (isRegisteredPage(name)) {
      void pageLoaders[name]().catch(() => undefined);
   }

   if (datasetId && !prefersReducedData()) {
      for (const request of dataPrefetchers[name](datasetId, route)) {
         request.catch(() => undefined);
      }
   }
}

/** Page name for a URL path (`/styleguide` included), for boot-time preloading. */
export function pageNameFromPath(path: string): ShellPageName {
   if (/^\/styleguide\/?$/.test(path)) {
      return 'styleguide';
   }

   return parseLocation(new URL(path, 'https://bibliamap.invalid')).route.name;
}

/** Fetch the remaining page chunks (JS only) once the main thread is idle. */
export function preloadPagesWhenIdle(): () => void {
   const run = (): void => {
      (Object.keys(pageLoaders) as RegisteredPage[])
         .filter((name) => name !== 'styleguide')
         .forEach((name) => preloadPage(name));
   };

   if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 4000 });

      return () => window.cancelIdleCallback(id);
   }

   const id = window.setTimeout(run, 2000);

   return () => window.clearTimeout(id);
}
