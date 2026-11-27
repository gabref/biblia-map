import { List, SlidersHorizontal, Waypoints } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorState } from '../../components/ErrorState';
import { Button, EmptyState, Sheet, Skeleton, Tabs, useToast, type TabItem } from '../../components/ui';
import {
   buildEgoGraph,
   formatPassageLabel,
   passageKey,
   passageVerseIds,
   SECOND_HOP_PAGE,
   type NeighborNode,
} from '../../graph/neighborhood';
import { hasDatasetFeature } from '../../data/generated';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import { prefersReducedMotion, withViewTransition } from '../../lib/motion';
import { chapterHref, DEFAULT_VERSE, navigate, useRoute, type VerseLocation } from '../../routing/routes';
import { jwFinderHref } from '../../routing/externalLinks';
import { parseVerseKey, recordVisit, verseKey } from '../../study/store';
import type { EdgeKindFilter, VerseRef } from '../../types/generated';
import { readStoredValue, writeStoredValue } from '../../utils/storage';
import { ConnectionList, type ConnectionItem } from './ConnectionList';
import type { DetailContext, DetailPanelProps, PassageVerse } from './DetailPanel';
import { StudiedVerse, type ContextVerse } from './StudiedVerse';
import { isPlainClick, StudyTrail, type TrailItem } from './StudyTrail';
import { lastTrailVerse, pushTrail, readTrail, writeTrail } from './trail';
import {
   activeFilterCount,
   filtersFromParams,
   VERSE_STEP_EVENT,
   verseStudyHref,
   type GraphDepth,
   type VerseFilters,
   type VerseStepEventDetail,
} from './urlState';
import { useNeighborhood, useVerseBase, useVerseTexts, type VerseBase } from './useNeighborhood';
import { eagerLazy } from './eagerLazy';
import type { GraphPreview } from './VerseGraph';
import { VersePicker } from './VersePicker';
import './verse.css';

// The map (layout + SVG interaction) and the detail panel are their own chunks; both start loading
// with the page, not after it, so neither adds a request waterfall.
const VerseMap = eagerLazy(() => import('./VerseMap'));
const LazyDetailPanel = eagerLazy<DetailPanelProps>(() => import('./DetailPanel').then((module) => ({ default: module.DetailPanel })));

function DetailPanel(props: DetailPanelProps): React.ReactElement {
   return (
      <Suspense fallback={<Skeleton variant="text" lines={3} />}>
         <LazyDetailPanel {...props} />
      </Suspense>
   );
}

export interface VersePageProps {
   datasetId: string;
   /**
    * Route details the page registry (E-A) hands to every page. The workspace reads the verse and
    * its filters from the URL through `useRoute()`, so these are accepted and not needed.
    */
   params?: unknown;
   book?: unknown;
   chapter?: unknown;
   verse?: unknown;
}

const TEXT_SCALES = [ 0.88, 1, 1.14, 1.3 ];
const TEXT_SCALE_KEY = 'bibliamap.verse.textScale';
const CONTEXT_KEY = 'bibliamap.verse.context';
const WIDE_QUERY = '(min-width: 1120px)';
const LANGUAGE_TAGS: Record<string, string> = {
   English: 'en',
   Italian: 'it',
   Spanish: 'es',
   Portuguese: 'pt',
   French: 'fr',
   German: 'de',
};

/** Verse Study workspace (Epic E-B). Reads the verse and filters from the URL via `useRoute()`. */
export function VersePage({ datasetId }: VersePageProps): React.ReactElement {
   const t = useT();
   const [ retryToken, setRetryToken ] = useState(0);
   const baseState = useVerseBase(datasetId, retryToken);

   if (baseState.error) {
      return <ErrorState title={t('verse.error.base')} error={baseState.error} onRetry={() => setRetryToken((token) => token + 1)} />;
   }

   if (!baseState.data) {
      return <VerseSkeleton />;
   }

   return <VerseWorkspace datasetId={datasetId} base={baseState.data} />;
}

function VerseSkeleton(): React.ReactElement {
   const t = useT();

   return (
      <div className="vs-page" role="status" aria-label={t('verse.loading')} aria-busy="true">
         <Skeleton variant="block" width="15rem" height="2.25rem" />
         <div className="vs-desk">
            <div className="vs-desk__main">
               <Skeleton variant="block" height="11rem" />
               <Skeleton variant="block" height="24rem" className="vs-skeleton-graph" />
            </div>
            <div className="vs-desk__side">
               <Skeleton variant="block" height="30rem" />
            </div>
         </div>
      </div>
   );
}

interface WorkspaceProps {
   datasetId: string;
   base: VerseBase;
}

function VerseWorkspace({ datasetId, base }: WorkspaceProps): React.ReactElement {
   const t = useT();
   const { toast } = useToast();
   const { route, params } = useRoute();
   const { catalog, bookMap, abbreviations } = base;
   const wide = useMediaQuery(WIDE_QUERY);
   const filters = useMemo(() => filtersFromParams(params), [ params ]);
   const [ trail, setTrail ] = useState(readTrail);

   // ---------------------------------------------------------------- which verse
   const isFallback = route.name === 'verse' && route.fallback === true;
   const requested: VerseLocation =
      route.name === 'verse'
         ? { bookNumber: route.book, chapterNumber: route.chapter, verseNumber: route.verse }
         : DEFAULT_VERSE;
   const target = isFallback ? (lastTrailVerse(trail) ?? requested) : requested;
   const center = catalog.find(target.bookNumber, target.chapterNumber, target.verseNumber) ?? null;
   const centerId = center?.jwpubVerseId ?? null;
   const centerKey = centerId === null ? null : passageKey(centerId);

   // ---------------------------------------------------------------- view state
   const [ selectedKey, setSelectedKey ] = useState<string | null>(null);
   const [ hoveredKey, setHoveredKey ] = useState<string | null>(null);
   const [ farLimit, setFarLimit ] = useState(SECOND_HOP_PAGE);
   const [ flashKey, setFlashKey ] = useState<string | null>(null);
   const [ originKey, setOriginKey ] = useState<string | null>(null);
   const [ morphKey, setMorphKey ] = useState<string | null>(null);
   const [ view, setView ] = useState<'list' | 'graph'>('list');
   const [ filtersOpen, setFiltersOpen ] = useState(false);
   const [ scaleIndex, setScaleIndex ] = useState(() => {
      const stored = Number(readStoredValue(TEXT_SCALE_KEY));

      return Number.isInteger(stored) && stored >= 0 && stored < TEXT_SCALES.length && readStoredValue(TEXT_SCALE_KEY) !== null ? stored : 1;
   });
   const [ showContext, setShowContext ] = useState(() => {
      const stored = readStoredValue(CONTEXT_KEY);

      return stored === null ? typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches : stored === '1';
   });
   const pageRef = useRef<HTMLDivElement | null>(null);
   const switchRef = useRef<HTMLDivElement | null>(null);
   const [ trackedCenter, setTrackedCenter ] = useState(centerId);

   if (trackedCenter !== centerId) {
      setTrackedCenter(centerId);
      setSelectedKey(null);
      setHoveredKey(null);
      setFarLimit(SECOND_HOP_PAGE);
      setFlashKey(trackedCenter === null ? null : passageKey(trackedCenter));
   }

   // ---------------------------------------------------------------- data
   const neighborhood = useNeighborhood({
      datasetId,
      base,
      centerId,
      direction: filters.dir,
      edgeKind: filters.kind,
      depth: filters.depth,
   });
   const texts = useVerseTexts(datasetId, base);
   const graph = useMemo(
      () =>
         buildEgoGraph({
            centerId: neighborhood.centerId ?? centerId ?? 0,
            firstHop: neighborhood.firstHop,
            secondHop: neighborhood.secondHop,
            secondHopLimit: farLimit,
         }),
      [ centerId, farLimit, neighborhood.centerId, neighborhood.firstHop, neighborhood.secondHop ],
   );
   const fullLabel = useCallback(
      (node: Pick<NeighborNode, 'verseId' | 'endVerseId'>): string => formatPassageLabel(node.verseId, node.endVerseId, catalog.byId),
      [ catalog ],
   );
   const graphCenterLabel = catalog.byId(graph.centerId)?.label ?? '';
   const nodeLabel = useCallback(
      (node: Pick<NeighborNode, 'verseId' | 'endVerseId'>): string =>
         formatPassageLabel(node.verseId, node.endVerseId, catalog.byId, { bookName: (bookNumber) => abbreviations.get(bookNumber) }),
      [ abbreviations, catalog ],
   );
   const passageVerses = useCallback(
      (node: Pick<NeighborNode, 'verseId' | 'endVerseId'>): PassageVerse[] =>
         passageVerseIds(node.verseId, node.endVerseId, catalog.has)
            .map((verseId) => catalog.byId(verseId))
            .filter((ref): ref is VerseRef => ref !== undefined)
            .map((ref) => ({ ref, text: texts.get(ref.jwpubVerseId) })),
      [ catalog, texts ],
   );
   const passageText = useCallback(
      (node: Pick<NeighborNode, 'verseId' | 'endVerseId'>): string | null | undefined => {
         const verses = passageVerses(node);

         if (verses.length === 0) {
            return null;
         }

         if (verses.some((verse) => verse.text === undefined)) {
            return undefined;
         }

         const available = verses.filter((verse) => verse.text !== null);

         if (available.length === 0) {
            return null;
         }

         return verses.length === 1
            ? (available[0].text as string)
            : available.map((verse) => `${verse.ref.verseNumber} ${verse.text as string}`).join(' ');
      },
      [ passageVerses ],
   );
   const toItem = useCallback(
      (node: NeighborNode): ConnectionItem => {
         const ref = catalog.byId(node.verseId);
         const endRef = node.endVerseId !== node.verseId ? catalog.byId(node.endVerseId) : undefined;

         return {
            node,
            key: node.key,
            label: fullLabel(node),
            text: passageText(node),
            ref,
            testament: ref ? (bookMap.get(ref.bookNumber)?.testament ?? null) : null,
            endKey: endRef ? verseKey(endRef) : undefined,
         };
      },
      [ bookMap, catalog, fullLabel, passageText ],
   );
   const items = useMemo(() => neighborhood.firstHop.map(toItem), [ neighborhood.firstHop, toItem ]);
   const farItems = useMemo(
      () => graph.nodes.filter((node) => node.depth === 2).map(toItem),
      [ graph, toItem ],
   );
   const itemByKey = useMemo(() => new Map([ ...items, ...farItems ].map((item) => [ item.key, item ])), [ farItems, items ]);
   const itemsRef = useRef(itemByKey);

   useEffect(() => {
      itemsRef.current = itemByKey;
   }, [ itemByKey ]);

   const selectedItem = selectedKey ? (itemByKey.get(selectedKey) ?? null) : null;
   const centerLabel = center?.label ?? '';

   // ---------------------------------------------------------------- navigation
   const setFilters = useCallback(
      (patch: Partial<VerseFilters>): void => {
         if (center) {
            navigate(verseStudyHref(center, { ...filters, ...patch }, params), { replace: true });
         }
      },
      [ center, filters, params ],
   );
   const study = useCallback(
      (verse: VerseLocation, fromKey?: string): void => {
         const href = verseStudyHref(verse, filters, params);
         const canMorph =
            fromKey !== undefined &&
            !prefersReducedMotion() &&
            typeof (document as { startViewTransition?: unknown }).startViewTransition === 'function';

         setOriginKey(fromKey ?? null);

         if (canMorph) {
            // The row takes the shared-element name first, so it morphs into the header.
            flushSync(() => setMorphKey(fromKey ?? null));
         }

         withViewTransition(() => {
            navigate(href);
            setMorphKey(null);

            if (window.scrollY > 0 && (pageRef.current?.getBoundingClientRect().top ?? 0) < 0) {
               window.scrollTo({ top: 0, behavior: 'instant' });
            }
         });
      },
      [ filters, params ],
   );
   const studyKey = useCallback(
      (key: string): void => {
         const ref = itemsRef.current.get(key)?.ref;

         if (ref) {
            study(ref, key);
         }
      },
      [ study ],
   );
   const previous = centerId === null ? undefined : catalog.step(centerId, -1);
   const next = centerId === null ? undefined : catalog.step(centerId, 1);

   // `/verse` without a reference: land on the last studied verse (or John 3:16) at its real URL.
   useEffect(() => {
      if (isFallback && center) {
         navigate(verseStudyHref(center, filters, params), { replace: true });
      }
   }, [ center, filters, isFallback, params ]);

   // E-A's `[` / `]` shortcuts.
   useEffect(() => {
      const handleStep = (event: Event): void => {
         const delta = (event as CustomEvent<VerseStepEventDetail>).detail?.delta;
         const verse = delta === -1 ? previous : delta === 1 ? next : undefined;

         if (verse) {
            study(verse);
         }
      };

      window.addEventListener(VERSE_STEP_EVENT, handleStep);

      return () => window.removeEventListener(VERSE_STEP_EVENT, handleStep);
   }, [ next, previous, study ]);

   // One visit per studied verse: history (E-C), the session trail and the tab title.
   useEffect(() => {
      if (!center) {
         return;
      }

      recordVisit(center, { datasetId });
      setTrail((current) => {
         const updated = pushTrail(current, verseKey(center));

         writeTrail(updated);

         return updated;
      });
      document.title = `${center.label} · BibliaMap`;
      texts.request(center.bookNumber);
      // `texts.request` is stable per dataset; the visit must not repeat when text arrives.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [ center, datasetId ]);

   // The previous centre stays marked for two seconds after moving on.
   useEffect(() => {
      if (!flashKey) {
         return undefined;
      }

      const timer = window.setTimeout(() => setFlashKey(null), 2000);

      return () => window.clearTimeout(timer);
   }, [ flashKey ]);

   // ---------------------------------------------------------------- hover (list ⇄ graph)
   const hoverTimer = useRef<number | undefined>(undefined);
   const handleHover = useCallback(
      (key: string | null): void => {
         window.clearTimeout(hoverTimer.current);

         if (key === null) {
            // A short grace period avoids flicker when the pointer crosses gaps between marks.
            hoverTimer.current = window.setTimeout(() => setHoveredKey(null), 120);

            return;
         }

         const bookNumber = itemsRef.current.get(key)?.ref?.bookNumber;

         if (bookNumber !== undefined) {
            texts.request(bookNumber);
         }

         setHoveredKey(key);
      },
      [ texts ],
   );

   useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

   const handleSelect = useCallback(
      (key: string | null): void => {
         const bookNumber = key ? itemsRef.current.get(key)?.ref?.bookNumber : undefined;

         if (bookNumber !== undefined) {
            texts.request(bookNumber);
         }

         setSelectedKey(key);
      },
      [ texts ],
   );

   // ---------------------------------------------------------------- actions
   const copyText = useCallback(
      (label: string, text: string | null | undefined): void => {
         const content = text ? `${label} — ${text}` : label;

         void (navigator.clipboard?.writeText(content) ?? Promise.reject(new Error('clipboard unavailable'))).then(
            () => toast(t('verse.toast.copied', { verse: label })),
            () => toast({ title: t('verse.toast.copyFailed'), tone: 'danger' }),
         );
      },
      [ t, toast ],
   );
   const copyKey = useCallback(
      (key: string): void => {
         const item = itemsRef.current.get(key);

         if (item) {
            copyText(item.label, item.text);
         }
      },
      [ copyText ],
   );
   const handleInternalLink = useCallback((event: React.MouseEvent<HTMLAnchorElement>): void => {
      if (isPlainClick(event)) {
         event.preventDefault();
         navigate(event.currentTarget.getAttribute('href') as string);
      }
   }, []);
   const lang = LANGUAGE_TAGS[base.manifest.language];
   const readHref = useCallback(
      (verse: VerseRef): string => `${chapterHref(verse, params.ds ? { ds: params.ds } : undefined)}#v${verse.verseNumber}`,
      [ params.ds ],
   );
   const jwLibraryHref = useCallback(
      (first: VerseRef, last?: VerseRef): string | null =>
         jwFinderHref(first.canonicalVerseId, { lang, publicationSymbol: base.manifest.publicationSymbol }, last?.canonicalVerseId),
      [ base.manifest.publicationSymbol, lang ],
   );
   const detailContext = useMemo<DetailContext>(
      () => ({
         datasetId,
         catalog,
         bookMap,
         studyNoteText: hasDatasetFeature(base.manifest, 'study-note-text'),
         linkParams: params.ds ? { ds: params.ds } : undefined,
         lang,
         passageVerses,
         labelOf: (key) => itemsRef.current.get(key)?.label ?? null,
         chapterHref: readHref,
         jwLibraryHref,
         onStudy: studyKey,
         onSelect: handleSelect,
         onCopy: copyKey,
         onNavigate: handleInternalLink,
      }),
      [ base.manifest, bookMap, catalog, copyKey, datasetId, handleInternalLink, handleSelect, jwLibraryHref, lang, params.ds, passageVerses, readHref, studyKey ],
   );
   const renderDetail = useCallback(
      (item: ConnectionItem): React.ReactNode => <DetailPanel node={item.node} label={item.label} context={detailContext} />,
      [ detailContext ],
   );
   const describeNode = useCallback(
      (key: string): string => {
         const item = itemsRef.current.get(key);

         if (!item) {
            return t('verse.graph.node.center', { verse: catalog.byId(Number(key.split('-')[0]))?.label ?? '' });
         }

         return item.node.depth === 2
            ? t('verse.graph.node.far', { verse: item.label, count: item.node.score })
            : t(`verse.graph.node.${item.node.direction}`, { verse: item.label });
      },
      // Labels depend on the items; rebuild when they do.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [ catalog, itemByKey, t ],
   );
   const preview = useCallback(
      (key: string): GraphPreview | null => {
         const item = itemByKey.get(key);

         if (!item) {
            return null;
         }

         return {
            reference: item.label,
            text: item.text,
            meta: item.node.depth === 2 ? t('verse.list.via', { count: item.node.score }) : t(`verse.direction.${item.node.direction}`),
         };
      },
      [ itemByKey, t ],
   );

   // ---------------------------------------------------------------- render
   if (!center) {
      const fallback = catalog.find(target.bookNumber, target.chapterNumber, 1) ?? catalog.find(DEFAULT_VERSE.bookNumber, DEFAULT_VERSE.chapterNumber, DEFAULT_VERSE.verseNumber);

      return (
         <div className="vs-page">
            <EmptyState
               size="page"
               icon={<Waypoints size={26} />}
               title={t('verse.missing.title')}
               description={t('verse.missing.body')}
               action={
                  fallback ? (
                     <Button variant="primary" onClick={() => study(fallback)}>
                        {t('verse.missing.action', { verse: fallback.label })}
                     </Button>
                  ) : undefined
               }
            />
         </div>
      );
   }

   const chapterVerses = catalog.verses(center.bookNumber, center.chapterNumber);
   const position = chapterVerses.findIndex((verse) => verse.jwpubVerseId === center.jwpubVerseId);
   const contextOf = (verses: VerseRef[]): ContextVerse[] => verses.map((ref) => ({ ref, text: texts.get(ref.jwpubVerseId) }));
   const trailItems: TrailItem[] = trail
      .map((key): TrailItem | null => {
         const location = parseVerseKey(key);
         const ref = location ? catalog.find(location.bookNumber, location.chapterNumber, location.verseNumber) : undefined;

         return ref ? { key, label: ref.label, verse: ref, current: ref.jwpubVerseId === center.jwpubVerseId } : null;
      })
      .filter((item): item is TrailItem => item !== null);
   const studyNotesAvailable = base.summary === null || base.summary.totalStudyNoteReferences > 0;
   const kindTabs: Array<TabItem<EdgeKindFilter>> = [
      { value: 'combined', label: t('verse.filter.kind.all') },
      { value: 'crossrefs', label: t('verse.filter.kind.crossrefs') },
      { value: 'study-notes', label: t('verse.filter.kind.studyNotes'), disabled: !studyNotesAvailable },
   ];
   const depthTabs: Array<TabItem<'1' | '2'>> = [
      { value: '1', label: t('verse.filter.depth.direct') },
      { value: '2', label: t('verse.filter.depth.extended') },
   ];
   const depthControl = (
      <Tabs
         label={t('verse.filter.depth.label')}
         items={depthTabs}
         value={String(filters.depth) as '1' | '2'}
         onChange={(value) => setFilters({ depth: Number(value) as GraphDepth })}
         variant="pill"
         size="sm"
      />
   );
   const extended = neighborhood.extended;
   const summary =
      filters.depth === 2 && graph.secondHopShown > 0
         ? t('verse.graph.summaryFar', { near: graph.firstHopShown, far: graph.secondHopShown })
         : t('verse.graph.summary', { near: graph.firstHopShown });
   const hasGraph = graph.nodes.length > 0;
   const graphCard = (
      <section className="vs-map" aria-label={t('verse.graph.title')}>
         <header className="vs-map__head">
            <div>
               <h2 className="vs-map__title">{t('verse.graph.title')}</h2>
               <p className="t-caption" role="status">
                  {neighborhood.isLoading ? t('verse.list.loading') : summary}
                  {graph.firstHopShown < graph.firstHopTotal ? ` · ${t('verse.graph.capped', { total: graph.firstHopTotal })}` : ''}
               </p>
            </div>
            {wide ? depthControl : null}
         </header>
         <div className="vs-map__canvas">
            {neighborhood.isLoading ? (
               <Skeleton variant="block" height="100%" />
            ) : hasGraph ? (
               <Suspense fallback={<Skeleton variant="block" height="100%" />}>
                  <VerseMap
                     graph={graph}
                     centerLabel={graphCenterLabel}
                     nodeLabel={nodeLabel}
                     label={t('verse.graph.label', { verse: centerLabel })}
                     description={t('verse.graph.description', {
                        verse: centerLabel,
                        outgoing: neighborhood.counts.outgoing,
                        incoming: neighborhood.counts.incoming,
                     })}
                     selectedKey={selectedKey}
                     hoveredKey={hoveredKey}
                     flashKey={flashKey}
                     originKey={originKey}
                     busy={neighborhood.isStale}
                     onHover={handleHover}
                     onSelect={handleSelect}
                     onStudy={studyKey}
                     describeNode={describeNode}
                     preview={preview}
                  />
               </Suspense>
            ) : (
               <EmptyState
                  icon={<Waypoints size={22} />}
                  title={t('verse.empty.title', { verse: centerLabel })}
                  description={filters.kind !== 'combined' ? t('verse.empty.kind') : filters.dir !== 'all' ? t('verse.empty.direction') : t('verse.empty.none')}
               />
            )}
            {extended?.loading ? (
               <p className="vs-progress vs-map__progress" role="status">
                  <span className="ui-spinner" aria-hidden="true" />
                  {t('verse.extended.loading', { loaded: extended.loadedFiles, total: extended.totalFiles })}
               </p>
            ) : null}
         </div>
         <footer className="vs-map__foot">
            <ul className="vs-legend" aria-label={t('verse.legend.label')}>
               <li className="vs-legend__item vs-legend__item--outgoing">{t('verse.legend.outgoing')}</li>
               <li className="vs-legend__item vs-legend__item--incoming">{t('verse.legend.incoming')}</li>
               <li className="vs-legend__item vs-legend__item--both">{t('verse.legend.both')}</li>
               {studyNotesAvailable ? <li className="vs-legend__item vs-legend__item--note">{t('verse.legend.note')}</li> : null}
               {filters.depth === 2 ? <li className="vs-legend__item vs-legend__item--far">{t('verse.legend.far')}</li> : null}
            </ul>
            {filters.depth === 2 && !extended?.loading && graph.secondHopShown < graph.secondHopTotal ? (
               <Button size="sm" onClick={() => setFarLimit((limit) => limit + SECOND_HOP_PAGE)}>
                  {t('verse.extended.showMore', { count: Math.min(SECOND_HOP_PAGE, graph.secondHopTotal - graph.secondHopShown) })}
               </Button>
            ) : (
               <p className="t-caption vs-map__hint">{t('verse.graph.hint')}</p>
            )}
         </footer>
      </section>
   );
   const list = (
      <ConnectionList
         centerLabel={centerLabel}
         items={items}
         farItems={farItems}
         farTotal={graph.secondHopTotal}
         extended={extended}
         filters={filters}
         counts={neighborhood.counts}
         studyNotesAvailable={studyNotesAvailable}
         showKind={wide}
         loading={neighborhood.isLoading}
         stale={neighborhood.isStale}
         selectedKey={selectedKey}
         hoveredKey={hoveredKey}
         morphKey={morphKey}
         params={params}
         bookName={(bookNumber) => bookMap.get(bookNumber)?.name ?? ''}
         requestText={texts.request}
         onFilters={setFilters}
         onSelect={handleSelect}
         onHover={handleHover}
         onStudy={studyKey}
         onCopy={copyKey}
         onShowMore={() => setFarLimit((limit) => limit + SECOND_HOP_PAGE)}
         onLoadDeferred={neighborhood.loadDeferred}
         renderDetail={renderDetail}
         emptyAction={
            next ? (
               <Button size="sm" onClick={() => study(next)}>
                  {t('verse.empty.tryNext', { verse: next.label })}
               </Button>
            ) : undefined
         }
      />
   );
   const mobileFilterCount = activeFilterCount({ ...filters, dir: 'all' });

   return (
      <div ref={pageRef} className={cx('vs-page', wide ? 'vs-page--wide' : 'vs-page--narrow')}>
         <h1 className="visually-hidden">{t('verse.page.title', { verse: centerLabel })}</h1>
         <header className="vs-top">
            <VersePicker
               books={base.books}
               catalog={catalog}
               verse={center}
               bookName={bookMap.get(center.bookNumber)?.name ?? ''}
               onPick={(verse) => study(verse)}
            />
            <StudyTrail items={trailItems} params={params} onStudy={(verse) => study(verse)} />
         </header>

         {neighborhood.error ? (
            <ErrorState title={t('verse.error.neighborhood')} error={neighborhood.error} onRetry={neighborhood.retry} />
         ) : null}

         <div className="vs-desk">
            <div className="vs-desk__main">
               <StudiedVerse
                  verse={center}
                  text={texts.get(center.jwpubVerseId)}
                  meta={t('verse.studied.meta', { outgoing: neighborhood.counts.outgoing, incoming: neighborhood.counts.incoming })}
                  before={contextOf(chapterVerses.slice(Math.max(0, position - 2), position))}
                  after={contextOf(chapterVerses.slice(position + 1, position + 3))}
                  previous={previous}
                  next={next}
                  params={params}
                  chapterHref={readHref(center)}
                  jwLibraryHref={jwLibraryHref(center)}
                  lang={lang}
                  compact={!wide}
                  showContext={showContext}
                  onToggleContext={() => {
                     writeStoredValue(CONTEXT_KEY, showContext ? '0' : '1');
                     setShowContext(!showContext);
                  }}
                  textScale={TEXT_SCALES[scaleIndex]}
                  canShrink={scaleIndex > 0}
                  canGrow={scaleIndex < TEXT_SCALES.length - 1}
                  onScale={(delta) => {
                     const updated = Math.max(0, Math.min(TEXT_SCALES.length - 1, scaleIndex + delta));

                     writeStoredValue(TEXT_SCALE_KEY, String(updated));
                     setScaleIndex(updated);
                  }}
                  transitionName={morphKey ? undefined : 'studied-verse'}
                  onStudy={(verse) => study(verse)}
                  onCopy={() => copyText(center.label, texts.get(center.jwpubVerseId))}
                  onOpenChapter={handleInternalLink}
               />
               {wide ? graphCard : null}
            </div>

            <div className="vs-desk__side" style={{ '--vs-scale': TEXT_SCALES[scaleIndex] } as React.CSSProperties}>
               {!wide ? (
                  <div ref={switchRef} className="vs-switch">
                     <Tabs
                        label={t('verse.view.label')}
                        items={[
                           { value: 'list', label: t('verse.view.list'), icon: <List size={15} /> },
                           { value: 'graph', label: t('verse.view.graph'), icon: <Waypoints size={15} /> },
                        ]}
                        value={view}
                        onChange={(value) => {
                           setView(value);
                           // The map sits below the verse: bring it up when it is asked for.
                           switchRef.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
                        }}
                        variant="pill"
                        size="sm"
                     />
                     <Button size="sm" leading={<SlidersHorizontal size={15} />} onClick={() => setFiltersOpen(true)}>
                        {mobileFilterCount > 0 ? t('verse.filter.buttonCount', { count: mobileFilterCount }) : t('verse.filter.button')}
                     </Button>
                  </div>
               ) : null}
               {!wide && view === 'graph' ? graphCard : list}
            </div>
         </div>

         {!wide ? (
            <>
               <Sheet
                  open={filtersOpen}
                  onClose={() => setFiltersOpen(false)}
                  side="bottom"
                  size="sm"
                  title={t('verse.filter.title')}
                  footer={
                     <Button variant="primary" block onClick={() => setFiltersOpen(false)}>
                        {t('verse.filter.done')}
                     </Button>
                  }
               >
                  <div className="vs-filter-sheet">
                     <div className="vs-filter-sheet__group">
                        <p className="t-label">{t('verse.filter.kind.label')}</p>
                        <Tabs
                           label={t('verse.filter.kind.label')}
                           items={kindTabs}
                           value={filters.kind}
                           onChange={(kind) => setFilters({ kind })}
                           variant="pill"
                           size="sm"
                           block
                        />
                        {!studyNotesAvailable ? <p className="t-caption">{t('verse.filter.kind.noStudyNotes')}</p> : null}
                     </div>
                     <div className="vs-filter-sheet__group">
                        <p className="t-label">{t('verse.filter.depth.label')}</p>
                        {depthControl}
                        <p className="t-caption">{t('verse.filter.depth.hint')}</p>
                     </div>
                  </div>
               </Sheet>
               <Sheet
                  open={view === 'graph' && selectedItem !== null}
                  onClose={() => setSelectedKey(null)}
                  side="bottom"
                  title={selectedItem?.label ?? ''}
                  description={selectedItem ? preview(selectedItem.key)?.meta : undefined}
               >
                  {selectedItem ? <DetailPanel node={selectedItem.node} label={selectedItem.label} context={detailContext} /> : null}
               </Sheet>
            </>
         ) : null}
      </div>
   );
}
