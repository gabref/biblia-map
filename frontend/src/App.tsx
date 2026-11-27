import { ArrowUpRight, BarChart3, BookOpen, Bookmark, CircleHelp, GitBranch, Home, Keyboard } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DatasetBadge } from './components/DatasetBadge';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { LoadingShimmer } from './components/LoadingShimmer';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { useToast } from './components/ui/Toast';
import { VerseSearchTrigger } from './components/VerseSearchTrigger';
import { loadDatasets } from './data/generated';
import { useAsyncData } from './hooks/useAsyncData';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useStudySummary } from './hooks/useStudySummary';
import { useSlidingIndicator } from './hooks/useSlidingIndicator';
import { useTheme } from './hooks/useTheme';
import { bookName, useLocale, useT, type Locale, type MessageKey, type TranslateFn } from './i18n';
import type { HomePageProps } from './pages/HomePage';
import { AppLink } from './routing/AppLink';
import { DEFAULT_DATASET_ID, datasetLang, readStoredDatasetId, resolveDatasetId, storeDatasetId } from './routing/datasets';
import { pages, preloadPage, type ShellPageName } from './routing/pageRegistry';
import {
   DEFAULT_VERSE,
   NAVIGATE_EVENT,
   bookByNumber,
   chapterHref,
   insightsHref,
   navigate,
   routeHref,
   studyHref,
   useRoute,
   verseHref,
   type AppRoute,
   type NavigateEventDetail,
   type RouteParams,
   type VerseLocation,
} from './routing/routes';
import type { SearchData } from './search/searchData';

const STYLEGUIDE_PATH = /^\/styleguide\/?$/;

const loadPalette = (): Promise<{ default: typeof import('./components/VerseSearch').VerseSearchPalette }> =>
   import('./components/VerseSearch').then((m) => ({ default: m.VerseSearchPalette }));
const VerseSearchPalette = lazy(loadPalette);
// Only shown when datasets.json fails: not worth shipping in the initial bundle.
const ErrorState = lazy(() => import('./components/ErrorState').then((m) => ({ default: m.ErrorState })));
const ShortcutsSheet = lazy(() => import('./routing/ShortcutsSheet').then((m) => ({ default: m.ShortcutsSheet })));

type NavId = 'home' | 'verse' | 'read' | 'insights' | 'study';

interface NavItem {
   id: NavId;
   href: string;
   label: MessageKey;
   icon: React.ReactNode;
}

function pageNameOf(route: AppRoute, styleguide: boolean): ShellPageName {
   return styleguide ? 'styleguide' : route.name;
}

/** Same path, with `ds` set (or removed when `null`). Keeps every other query param. */
function hrefWithDataset(datasetId: string | null): string {
   const url = new URL(window.location.href);

   if (datasetId) {
      url.searchParams.set('ds', datasetId);
   } else {
      url.searchParams.delete('ds');
   }

   return `${url.pathname}${url.search}${url.hash}`;
}

function displayBookName(book: number, locale: Locale): string {
   return bookName(book, locale) ?? bookByNumber(book)?.nameEn ?? String(book);
}

function verseLabel(ref: VerseLocation, locale: Locale): string {
   return `${displayBookName(ref.bookNumber, locale)} ${ref.chapterNumber}:${ref.verseNumber}`;
}

/** Default `document.title` per route; pages may refine it after mount. */
export function routeTitle(route: AppRoute, styleguide: boolean, locale: Locale, t: TranslateFn): string {
   const name = (book: number): string => displayBookName(book, locale);
   let title: string | null;

   if (styleguide) {
      title = t('shell.nav.styleguide');
   } else {
      switch (route.name) {
         case 'home':
            title = null;
            break;
         case 'verse':
            title = `${name(route.book)} ${route.chapter}:${route.verse}`;
            break;
         case 'read':
            title = `${name(route.book)} ${route.chapter} · ${t('shell.nav.read')}`;
            break;
         case 'book':
            title = name(route.book);
            break;
         case 'insights':
            title = t('shell.nav.insights');
            break;
         case 'study':
            title = t('shell.nav.study');
            break;
         case 'about':
            title = t('shell.nav.about');
            break;
         case 'notFound':
            title = t('home.notFound.title');
            break;
      }
   }

   return title ? t('shell.title.page', { page: title }) : t('shell.title.home');
}

/** Moves focus to the page's first <h1> (waiting for lazy pages to render it). */
function focusPageHeading(main: HTMLElement | null): () => void {
   if (!main) {
      return () => undefined;
   }

   const tryFocus = (): boolean => {
      const heading = main.querySelector('h1');

      if (!heading) {
         return false;
      }

      if (!heading.hasAttribute('tabindex')) {
         heading.setAttribute('tabindex', '-1');
      }

      heading.focus({ preventScroll: true });
      return true;
   };

   if (tryFocus()) {
      return () => undefined;
   }

   const observer = new MutationObserver(() => {
      if (tryFocus()) {
         observer.disconnect();
      }
   });
   const timeout = window.setTimeout(() => observer.disconnect(), 5000);

   observer.observe(main, { childList: true, subtree: true });

   return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
   };
}

export function App(): React.ReactElement {
   const t = useT();
   const { toast } = useToast();
   const location = useRoute();
   const { route, params } = location;
   const pathname = window.location.pathname;
   const isStyleguide = STYLEGUIDE_PATH.test(pathname);
   const pageName = pageNameOf(route, isStyleguide);
   const datasetsState = useAsyncData(loadDatasets, []);
   const [ storedDatasetId, setStoredDatasetId ] = useState(readStoredDatasetId);
   const datasets = useMemo(() => datasetsState.data ?? [], [ datasetsState.data ]);
   const choice = resolveDatasetId(params.ds, storedDatasetId, datasets);
   const dataset = datasets.find((entry) => entry.datasetId === choice.datasetId) ?? null;
   const datasetId = dataset?.datasetId ?? choice.datasetId;
   const lang = datasetLang(dataset);
   const locale = useLocale();
   const study = useStudySummary();
   const { lastVisited, savedCount } = study;
   const theme = useTheme();
   const mainRef = useRef<HTMLElement | null>(null);
   const pendingFocus = useRef<'push' | 'pop' | null>(null);
   const [ paletteOpen, setPaletteOpenState ] = useState(false);
   // The palette chunk loads on first use (or idle prefetch), not with the shell.
   const [ paletteRequested, setPaletteRequested ] = useState(false);
   const setPaletteOpen = useCallback((open: boolean) => {
      if (open) setPaletteRequested(true);
      setPaletteOpenState(open);
   }, []);
   const [ helpOpen, setHelpOpenState ] = useState(false);
   const [ helpRequested, setHelpRequested ] = useState(false);
   const setHelpOpen = useCallback((open: boolean) => {
      if (open) setHelpRequested(true);
      setHelpOpenState(open);
   }, []);

   /** Params every in-app link carries: the shared query params, plus `ds` when not the default. */
   const linkParams: RouteParams = useMemo(
      () => ({ ...params, ds: params.ds || datasetId !== DEFAULT_DATASET_ID ? datasetId : undefined }),
      [ params, datasetId ],
   );

   // ---- Redirects: legacy paths, legacy bare /verse, unknown ?ds= ----
   useEffect(() => {
      if (location.redirectTo) {
         navigate(location.redirectTo, { replace: true });
      }
   }, [ location.redirectTo ]);

   const isVerseFallback = route.name === 'verse' && route.fallback === true;

   useEffect(() => {
      if (isVerseFallback && study.ready) {
         navigate(verseHref(lastVisited ?? DEFAULT_VERSE, params), { replace: true });
      }
      // Only when the fallback URL is shown (and history is known); `lastVisited` is read at that moment.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [ isVerseFallback, study.ready ]);

   useEffect(() => {
      if (datasets.length > 0 && choice.invalidUrlValue) {
         navigate(hrefWithDataset(datasetId !== DEFAULT_DATASET_ID ? datasetId : null), { replace: true });
      }
   }, [ datasets.length, choice.invalidUrlValue, datasetId ]);

   // ---- Scroll reset + heading focus after client-side navigation ----
   useEffect(() => {
      const onNavigate = (event: Event): void => {
         const { replace } = (event as CustomEvent<NavigateEventDetail>).detail;

         pendingFocus.current = replace ? null : 'push';
      };
      const onPopState = (): void => {
         pendingFocus.current = 'pop';
      };

      window.addEventListener(NAVIGATE_EVENT, onNavigate);
      window.addEventListener('popstate', onPopState);

      return () => {
         window.removeEventListener(NAVIGATE_EVENT, onNavigate);
         window.removeEventListener('popstate', onPopState);
      };
   }, []);

   const previousPage = useRef<ShellPageName>(pageName);

   useEffect(() => {
      const kind = pendingFocus.current;
      const fromPage = previousPage.current;

      pendingFocus.current = null;
      previousPage.current = pageName;

      // Read mode scrolls itself on chapter changes (top or #vN): leave scroll and focus to it.
      if (!kind || (pageName === 'read' && (fromPage === 'read' || window.location.hash))) {
         return undefined;
      }

      if (kind === 'push') {
         // A new page starts at the top, instantly: the route's own entrance animation carries the change.
         window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }

      return focusPageHeading(mainRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per path change only.
   }, [ pathname ]);

   // ---- Title ----
   useEffect(() => {
      document.title = routeTitle(route, isStyleguide, locale, t);
   }, [ route, isStyleguide, locale, t ]);

   // ---- Keyboard ----
   const currentVerse: VerseLocation | null =
      route.name === 'verse' && !route.fallback ? { bookNumber: route.book, chapterNumber: route.chapter, verseNumber: route.verse } : null;
   // Chapter lengths for `[` / `]` across chapters: the search data chunk + index load lazily, on verse routes only.
   const onVerseRoute = currentVerse !== null;
   const [ verseCounts, setVerseCounts ] = useState<{ datasetId: string; data: SearchData; of: typeof import('./search/searchData').verseCountOf } | null>(null);

   useEffect(() => {
      if (!onVerseRoute || verseCounts?.datasetId === datasetId) return undefined;

      let live = true;

      import('./search/searchData')
         .then(async (module) => ({ datasetId, data: await module.loadSearchData(datasetId), of: module.verseCountOf }))
         .then((next) => live && setVerseCounts(next), () => undefined);

      return () => {
         live = false;
      };
   }, [ onVerseRoute, datasetId, verseCounts?.datasetId ]);

   const verseCount = useCallback(
      (bookNumber: number, chapterNumber: number) => {
         if (!verseCounts || verseCounts.datasetId !== datasetId) return undefined;

         const book = verseCounts.data.books.find((candidate) => candidate.bookNumber === bookNumber);

         return book ? verseCounts.of(book, chapterNumber) : undefined;
      },
      [ verseCounts, datasetId ],
   );

   useKeyboardShortcuts({
      onOpenSearch: () => {
         setHelpOpen(false);
         setPaletteOpen(true);
      },
      onOpenHelp: () => {
         if (!paletteOpen) setHelpOpen(true);
      },
      verse: currentVerse,
      params: linkParams,
      verseCount,
      onBookmarkToggled: (verse, saved) => {
         toast({ title: t(saved ? 'home.shortcuts.saved' : 'home.shortcuts.unsaved', { ref: verseLabel(verse, locale) }), tone: saved ? 'success' : 'neutral' });
      },
      enabled: !paletteOpen,
   });

   const handleDatasetChange = (nextId: string): void => {
      storeDatasetId(nextId);
      setStoredDatasetId(nextId);

      if (params.ds || nextId !== DEFAULT_DATASET_ID) {
         navigate(hrefWithDataset(nextId), { replace: true });
      } else {
         navigate(hrefWithDataset(null), { replace: true });
      }
   };

   const navItems: NavItem[] = useMemo(() => {
      const verseTarget = currentVerse ?? lastVisited ?? DEFAULT_VERSE;
      const readTarget = route.name === 'read' ? { bookNumber: route.book, chapterNumber: route.chapter } : verseTarget;

      return [
         { id: 'home', href: routeHref({ name: 'home' }, linkParams), label: 'shell.nav.home', icon: <Home size={18} /> },
         { id: 'verse', href: verseHref(verseTarget, linkParams), label: 'shell.nav.verse', icon: <GitBranch size={18} /> },
         { id: 'read', href: chapterHref(readTarget, linkParams), label: 'shell.nav.read', icon: <BookOpen size={18} /> },
         { id: 'insights', href: insightsHref(undefined, linkParams), label: 'shell.nav.insights', icon: <BarChart3 size={18} /> },
         { id: 'study', href: studyHref(undefined, undefined, linkParams), label: 'shell.nav.study', icon: <Bookmark size={18} /> },
      ];
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [ linkParams, lastVisited, currentVerse?.bookNumber, currentVerse?.chapterNumber, currentVerse?.verseNumber, route ]);

   const activeNav: NavId | null =
      !isStyleguide && (route.name === 'home' || route.name === 'verse' || route.name === 'read' || route.name === 'insights' || route.name === 'study')
         ? route.name
         : route.name === 'book' && !isStyleguide
            ? 'insights'
            : null;
   const navRef = useSlidingIndicator<HTMLElement>(activeNav ?? 'none');

   if (datasetsState.error) {
      return (
         <main className="main-surface">
            <Suspense fallback={null}>
               <ErrorState title={t('shell.error.registry')} error={datasetsState.error} />
            </Suspense>
         </main>
      );
   }

   if (!dataset || datasetsState.showLoading) {
      return (
         <main className="main-surface">
            <LoadingShimmer rows={5} />
         </main>
      );
   }

   return (
      <div className="app-shell">
         <a
            className="skip-link"
            href="#main-content"
            onClick={(event) => {
               event.preventDefault();
               mainRef.current?.focus();
            }}
         >
            {t('shell.skipToContent')}
         </a>
         <aside className="sidebar" aria-label={t('shell.nav.primary')}>
            <AppLink href={routeHref({ name: 'home' }, linkParams)} className="brand" aria-label={t('shell.brand.home')}>
               <span className="brand-mark">
                  <img src="/favicon.svg" alt="" />
               </span>
               <span>
                  <span className="brand-title">{t('shell.brand.title')}</span>
                  <span className="brand-subtitle">{t('shell.brand.subtitle')}</span>
               </span>
            </AppLink>

            <div className="shell-search">
               <VerseSearchTrigger onOpen={() => setPaletteOpen(true)} onIntent={() => void loadPalette()} />
            </div>

            <nav ref={navRef} className="nav-list" aria-label={t('home.nav.pages')}>
               {navItems.map((item) => {
                  const active = item.id === activeNav;

                  return (
                     <AppLink
                        key={item.id}
                        href={item.href}
                        className={active ? 'nav-link active' : 'nav-link'}
                        aria-current={active ? 'page' : undefined}
                        data-active={active}
                        onPointerEnter={() => preloadPage(item.id, datasetId)}
                        onFocus={() => preloadPage(item.id, datasetId)}
                     >
                        {item.icon}
                        <span>{t(item.label)}</span>
                        {item.id === 'study' && savedCount > 0 ? (
                           <span className="nav-count" aria-label={t('home.nav.savedCount', { count: savedCount })}>
                              {savedCount > 99 ? '99+' : savedCount}
                           </span>
                        ) : null}
                     </AppLink>
                  );
               })}
            </nav>

            <div className="sidebar-footer">
               <div className="sidebar-tools">
                  <DatasetBadge datasets={datasets} selectedDatasetId={datasetId} onChange={handleDatasetChange} />
                  <LanguageSwitcher />
                  <ThemeToggle theme={theme} />
               </div>
               <p className="sidebar-links">
                  <AppLink href={routeHref({ name: 'about' }, linkParams)} aria-current={route.name === 'about' ? 'page' : undefined}>
                     <CircleHelp size={14} aria-hidden="true" />
                     {t('shell.nav.about')}
                  </AppLink>
                  <button type="button" className="sidebar-links__button" onClick={() => setHelpOpen(true)}>
                     <Keyboard size={14} aria-hidden="true" />
                     {t('home.shortcuts.title')}
                  </button>
               </p>
               <CreditLinks className="sidebar-credit" />
            </div>
         </aside>

         <main ref={mainRef} id="main-content" className="main-surface" tabIndex={-1}>
            <div key={`${pageName}:${datasetId}`} className="route-view">
               <Suspense fallback={<LoadingShimmer rows={6} />}>
                  {renderPage({ route, pageName, datasetId, params: linkParams, lang, datasets, onDatasetChange: handleDatasetChange, pathname })}
               </Suspense>
            </div>
         </main>
         <CreditLinks className="mobile-credit">
            <AppLink href={routeHref({ name: 'about' }, linkParams)}>{t('shell.nav.about')}</AppLink>
            <button type="button" className="sidebar-links__button" onClick={() => setHelpOpen(true)}>
               {t('home.shortcuts.title')}
            </button>
         </CreditLinks>

         {paletteRequested ? (
            <Suspense fallback={null}>
               <VerseSearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} datasetId={datasetId} lang={lang} params={linkParams} />
            </Suspense>
         ) : null}
         {helpRequested ? (
            <Suspense fallback={null}>
               <ShortcutsSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
            </Suspense>
         ) : null}
      </div>
   );
}

interface RenderArgs {
   route: AppRoute;
   pageName: ShellPageName;
   datasetId: string;
   params: RouteParams;
   lang?: string;
   datasets: HomePageProps['datasets'];
   onDatasetChange: (datasetId: string) => void;
   pathname: string;
}

function renderPage({ route, pageName, datasetId, params, lang, datasets, onDatasetChange, pathname }: RenderArgs): React.ReactNode {
   if (pageName === 'styleguide') {
      return <pages.styleguide />;
   }

   switch (route.name) {
      case 'home':
         return <pages.home datasetId={datasetId} datasets={datasets} onDatasetChange={onDatasetChange} params={params} lang={lang} />;
      case 'verse':
         // The legacy bare `/verse` redirects in an effect; render nothing for that one frame.
         return route.fallback ? <LoadingShimmer rows={6} /> : <pages.verse datasetId={datasetId} params={params} book={route.book} chapter={route.chapter} verse={route.verse} />;
      case 'read':
         return <pages.read datasetId={datasetId} params={params} book={route.book} chapter={route.chapter} />;
      case 'insights':
         return <pages.insights datasetId={datasetId} params={params} tab={route.tab} />;
      case 'book':
         return bookByNumber(route.book) ? <pages.book datasetId={datasetId} params={params} book={route.book} /> : null;
      case 'study':
         return <pages.study datasetId={datasetId} params={params} collectionId={route.collectionId} print={route.print} />;
      case 'about':
         return <pages.about datasetId={datasetId} params={params} />;
      case 'notFound':
         return <pages.notFound path={pathname} datasetId={datasetId} params={params} lang={lang} />;
   }
}

function CreditLinks({ className, children }: { className: string; children?: React.ReactNode }): React.ReactElement {
   const t = useT();

   return (
      <p className={className}>
         {children}
         <span>
            {t('shell.credit.builtBy')}{' '}
            <a href="https://gabudev.cloud/" target="_blank" rel="noreferrer">
               gabudev.cloud
            </a>
         </span>
         <a href="https://github.com/gabref/biblia-map" target="_blank" rel="noreferrer">
            {t('shell.credit.source')}
            <ArrowUpRight size={13} aria-hidden="true" />
         </a>
      </p>
   );
}
