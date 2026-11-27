import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/ui';
import { loadVerseTextBook } from '../../data/generated';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import {
   bookHref,
   chapterHref,
   insightsHref,
   navigate,
   useRoute,
   type RouteParams,
} from '../../routing/routes';
import type { Book, EdgeKindFilter, VerseTextBook } from '../../types/generated';
import { formatNumber } from '../../utils/format';
import { isHebrewBook } from './canon';
import { parsePairParam } from './flows';

export type InsightsTab = 'overview' | 'chord' | 'hubs' | 'heatmap' | 'flows' | 'clusters';

export const INSIGHTS_TABS: readonly InsightsTab[] = [ 'overview', 'chord', 'hubs', 'heatmap', 'flows', 'clusters' ];

export interface InsightsLocation {
   tab: InsightsTab;
   kind: EdgeKindFilter;
   /** Params carried on every link so the edition and language survive navigation. */
   carry: RouteParams;
   /** `?pair=23-40` — the book pair open in the Flows drill-down (source → target). */
   pair: { source: number; target: number } | null;
   /** `?book=psalms` — the book selected in the chord diagram. */
   book: string | null;
   /** `?flow=nt-ot` — the testament direction shown in Flows. */
   flow: string | null;
}

/** The Insights view state held in the URL (tab, reference type, selection). */
export function useInsightsLocation(): InsightsLocation {
   const { route, params } = useRoute();
   const tabValue = route.name === 'insights' ? route.tab : undefined;
   const tab = (INSIGHTS_TABS as readonly string[]).includes(tabValue ?? '') ? (tabValue as InsightsTab) : 'overview';
   const search = typeof window === 'undefined' ? '' : window.location.search;
   const { ds, lang, kind } = params;

   return useMemo(() => {
      const query = new URLSearchParams(search);
      const carry: RouteParams = {};

      if (ds) carry.ds = ds;
      if (lang) carry.lang = lang;

      return {
         tab,
         kind: kind ?? 'combined',
         carry,
         pair: parsePairParam(query.get('pair')),
         book: query.get('book'),
         flow: query.get('flow'),
      };
   }, [ tab, kind, ds, lang, search ]);
}

export interface InsightsTarget {
   tab: InsightsTab;
   kind?: EdgeKindFilter;
   carry?: RouteParams;
   pair?: { source: number; target: number } | null;
   book?: string | null;
   flow?: string | null;
}

/** `/insights?tab=…` plus the Insights-only selection params (ignored by the shared parser). */
export function insightsUrl({ tab, kind, carry, pair, book, flow }: InsightsTarget): string {
   const params: RouteParams = { ...carry };

   if (kind && kind !== 'combined') {
      params.kind = kind;
   }

   const base = insightsHref(tab === 'overview' ? undefined : tab, params);
   const extra = new URLSearchParams();

   if (pair) extra.set('pair', `${pair.source}-${pair.target}`);
   if (book) extra.set('book', book);
   if (flow) extra.set('flow', flow);

   const query = extra.toString();

   return query ? `${base}${base.includes('?') ? '&' : '?'}${query}` : base;
}

/** The Flows direction that lists a given directed pair (`all` for same-testament pairs). */
export function flowOfPair(source: number, target: number): string {
   if (!isHebrewBook(source) && isHebrewBook(target)) {
      return 'nt-ot';
   }

   return isHebrewBook(source) && !isHebrewBook(target) ? 'ot-nt' : 'all';
}

/** Href for the verse-pair drill-down of a directed book pair. */
export function pairUrl(source: number, target: number, location: Pick<InsightsLocation, 'carry' | 'kind'>): string {
   return insightsUrl({
      tab: 'flows',
      kind: location.kind,
      carry: location.carry,
      pair: { source, target },
      flow: flowOfPair(source, target),
   });
}

function isPlainLeftClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
   return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export interface RouteLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
   href: string;
   replace?: boolean;
   /** Scroll the page to the top after navigating (new page) — off for in-page state changes. */
   scrollTop?: boolean;
   ref?: React.Ref<HTMLAnchorElement>;
}

/** Internal link: client-side `navigate()` on a plain click, a normal anchor otherwise. */
export function RouteLink({ href, replace, scrollTop = false, onClick, ref, ...rest }: RouteLinkProps): React.ReactElement {
   return (
      <a
         ref={ref}
         href={href}
         {...rest}
         onClick={(event) => {
            onClick?.(event);

            if (event.defaultPrevented || !isPlainLeftClick(event) || (rest.target && rest.target !== '_self')) {
               return;
            }

            event.preventDefault();
            navigate(href, { replace });

            if (scrollTop) {
               window.scrollTo({ top: 0, behavior: 'instant' });
            }
         }}
      />
   );
}

export interface BookLinkProps extends Omit<RouteLinkProps, 'href'> {
   book: Pick<Book, 'bookNumber' | 'name'>;
   params?: RouteParams;
}

/** Link to a book's profile page. Every book name in Insights goes through this. */
export function BookLink({ book, params, children, className, ...rest }: BookLinkProps): React.ReactElement {
   return (
      <RouteLink href={bookHref(book.bookNumber, params)} scrollTop className={cx('ins-link', className)} {...rest}>
         {children ?? book.name}
      </RouteLink>
   );
}

export interface ChapterLinkProps extends Omit<RouteLinkProps, 'href'> {
   bookNumber: number;
   chapterNumber: number;
   params?: RouteParams;
}

/** Link to a chapter in Read mode. */
export function ChapterLink({ bookNumber, chapterNumber, params, ...rest }: ChapterLinkProps): React.ReactElement {
   return <RouteLink href={chapterHref({ bookNumber, chapterNumber }, params)} scrollTop {...rest} />;
}

export interface BarRowProps {
   /** 1-based position, shown as a quiet numeral. */
   rank?: number;
   label: React.ReactNode;
   /** Second line under the label (verse text, a note). */
   detail?: React.ReactNode;
   value: number;
   /** The value that fills the track. */
   max: number;
   /** Bar colour (a CSS colour or custom property); defaults to `--viz-bar`. */
   color?: string;
   /** Second, lighter segment stacked after the main one (same scale). */
   secondary?: { value: number; color: string };
   /** Text after the number, e.g. "references". Read by screen readers. */
   unit?: string;
   trailing?: React.ReactNode;
   className?: string;
}

/**
 * One row of a ranked bar list: label, bar and tabular value. The bar is decorative
 * (`aria-hidden`) because the value is printed next to it.
 */
export function BarRow({
   rank,
   label,
   detail,
   value,
   max,
   color,
   secondary,
   unit,
   trailing,
   className,
}: BarRowProps): React.ReactElement {
   const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
   const secondaryShare = secondary && max > 0 ? Math.max(0, Math.min(1 - share, secondary.value / max)) : 0;

   return (
      <li className={cx('ins-bar-row', className)}>
         {rank !== undefined ? <span className="ins-bar-row__rank tabular">{rank}</span> : null}
         <div className="ins-bar-row__body">
            <div className="ins-bar-row__head">
               <span className="ins-bar-row__label">{label}</span>
               <span className="ins-bar-row__value tabular">
                  {formatNumber(value)}
                  {unit ? <span className="visually-hidden"> {unit}</span> : null}
               </span>
            </div>
            <div className="ins-bar" aria-hidden="true">
               <span
                  className="ins-bar__fill anim-grow-x"
                  style={{ width: `${share * 100}%`, background: color }}
               />
               {secondary && secondaryShare > 0 ? (
                  <span
                     className="ins-bar__fill ins-bar__fill--secondary anim-grow-x"
                     style={{ width: `${secondaryShare * 100}%`, background: secondary.color }}
                  />
               ) : null}
            </div>
            {detail ? <div className="ins-bar-row__detail">{detail}</div> : null}
         </div>
         {trailing ? <div className="ins-bar-row__trailing">{trailing}</div> : null}
      </li>
   );
}

/** The one-sentence finding that leads a view. */
export function Finding({ children }: { children: React.ReactNode }): React.ReactElement {
   return <p className="ins-finding">{children}</p>;
}

export interface LegendItem {
   label: string;
   color: string;
   /** `line` for strokes/ribbons, `square` for fills. */
   shape?: 'square' | 'line';
}

export function Legend({ items, label }: { items: LegendItem[]; label: string }): React.ReactElement {
   return (
      <ul className="ins-legend" aria-label={label}>
         {items.map((item) => (
            <li key={item.label}>
               <span
                  className={cx('ins-legend__swatch', item.shape === 'line' && 'ins-legend__swatch--line')}
                  style={{ background: item.color }}
                  aria-hidden="true"
               />
               {item.label}
            </li>
         ))}
      </ul>
   );
}

/** Skeleton for a panel while its data loads. */
export function PanelSkeleton({ rows = 6, label }: { rows?: number; label?: string }): React.ReactElement {
   const t = useT();

   return (
      <div className="ins-skeleton" role="status" aria-busy="true">
         <span className="visually-hidden">{label ?? t('shell.loading')}</span>
         {Array.from({ length: rows }, (_, index) => (
            <Skeleton key={index} variant="block" height={index === 0 ? 28 : 18} width={`${92 - ((index * 13) % 40)}%`} />
         ))}
      </div>
   );
}

export function PanelError({ error, onRetry }: { error: Error; onRetry?: () => void }): React.ReactElement {
   const t = useT();

   return <ErrorState title={t('insights.error.title')} error={error} onRetry={onRetry} />;
}

export interface VizTooltipState {
   /** Viewport point the tooltip is attached to. */
   x: number;
   y: number;
   content: React.ReactNode;
}

export interface VizTooltipApi {
   /** Show next to a pointer position. */
   showAt: (clientX: number, clientY: number, content: React.ReactNode) => void;
   /** Show above an element (keyboard focus). */
   showFor: (element: Element, content: React.ReactNode) => void;
   hide: () => void;
   /** Internal: store access for `<VizTooltip>`. */
   subscribe: (listener: () => void) => () => void;
   getState: () => VizTooltipState | null;
}

/**
 * One shared chart tooltip (cheaper than a Tooltip per mark for 1,000+ marks). The returned API
 * is stable and the state lives outside React state, so pointer moves re-render only the
 * `<VizTooltip>` bubble, never the chart.
 */
export function useVizTooltip(): VizTooltipApi {
   return useMemo(() => {
      let state: VizTooltipState | null = null;
      const listeners = new Set<() => void>();
      const set = (next: VizTooltipState | null): void => {
         if (next === state) {
            return;
         }

         state = next;
         listeners.forEach((listener) => listener());
      };

      return {
         showAt: (clientX, clientY, content) => set({ x: clientX, y: clientY, content }),
         showFor: (element, content) => {
            const box = element.getBoundingClientRect();

            set({ x: box.left + box.width / 2, y: box.top, content });
         },
         hide: () => set(null),
         subscribe: (listener) => {
            listeners.add(listener);

            return () => listeners.delete(listener);
         },
         getState: () => state,
      };
   }, []);
}

const TOOLTIP_GAP = 12;
const TOOLTIP_EDGE = 8;

/**
 * Chart tooltip, portalled to the body and clamped to the viewport on every side. It is a
 * visual aid only (`aria-hidden`): the same text is the accessible name of the focused mark.
 */
export function VizTooltip({ api }: { api: VizTooltipApi }): React.ReactElement | null {
   const state = useSyncExternalStore(api.subscribe, api.getState, api.getState);
   const ref = useRef<HTMLDivElement | null>(null);
   const [ position, setPosition ] = useState<{ left: number; top: number } | null>(null);

   useLayoutEffect(() => {
      const bubble = ref.current;

      if (!state || !bubble) {
         setPosition(null);

         return;
      }

      const box = bubble.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      let left = state.x - box.width / 2;
      let top = state.y - box.height - TOOLTIP_GAP;

      if (top < TOOLTIP_EDGE) {
         top = state.y + TOOLTIP_GAP + 8;
      }

      left = Math.max(TOOLTIP_EDGE, Math.min(left, viewportWidth - box.width - TOOLTIP_EDGE));
      top = Math.max(TOOLTIP_EDGE, Math.min(top, viewportHeight - box.height - TOOLTIP_EDGE));
      setPosition({ left, top });
   }, [ state ]);

   if (!state || typeof document === 'undefined') {
      return null;
   }

   return createPortal(
      <div
         ref={ref}
         className={cx('ins-tooltip', position && 'is-placed')}
         style={position ?? { left: 0, top: 0 }}
         aria-hidden="true"
      >
         {state.content}
      </div>,
      document.body,
   );
}

/**
 * Verse texts for a set of books (one file per book, cached by the data layer).
 * Returns `undefined` for a book that is still loading and `null` when text is unavailable.
 */
export function useVerseTexts(
   datasetId: string,
   books: Book[] | null | undefined,
   bookNumbers: number[],
): (verseId: number, bookNumber: number) => string | null | undefined {
   const wanted = useMemo(() => Array.from(new Set(bookNumbers)).sort((left, right) => left - right), [ bookNumbers ]);
   const key = wanted.join(',');
   const { data, error } = useAsyncData(
      async () => {
         if (!books || wanted.length === 0) {
            return new Map<number, VerseTextBook | null>();
         }

         const entries = await Promise.all(
            wanted.map(async (bookNumber): Promise<[ number, VerseTextBook | null ]> => {
               const book = books.find((candidate) => candidate.bookNumber === bookNumber);

               if (!book) {
                  return [ bookNumber, null ];
               }

               try {
                  return [ bookNumber, await loadVerseTextBook(datasetId, book) ];
               } catch {
                  return [ bookNumber, null ];
               }
            }),
         );

         return new Map(entries);
      },
      [ datasetId, key, books ],
      { keepPreviousData: true },
   );

   return useCallback(
      (verseId: number, bookNumber: number): string | null | undefined => {
         if (error) {
            return null;
         }

         const book = data?.get(bookNumber);

         if (book === undefined) {
            return undefined;
         }

         return book?.[String(verseId)]?.text ?? null;
      },
      [ data, error ],
   );
}

/** "Show more" pagination state: never renders more than `visible` rows of a long list. */
export function usePagedList<T>(rows: T[], pageSize: number, resetKey: unknown): {
   visible: T[];
   hasMore: boolean;
   remaining: number;
   showMore: () => void;
} {
   const [ state, setState ] = useState({ key: resetKey, count: pageSize });
   const count = Object.is(state.key, resetKey) ? state.count : pageSize;

   return {
      visible: rows.length > count ? rows.slice(0, count) : rows,
      hasMore: rows.length > count,
      remaining: Math.max(0, rows.length - count),
      showMore: () => setState({ key: resetKey, count: count + pageSize }),
   };
}

/** Colour-class legend shared by the book matrix and the chapter heatmap. */
export function HeatLegend({
   thresholds,
   label,
   format = formatNumber,
}: {
   thresholds: number[];
   label: string;
   format?: (value: number) => string;
}): React.ReactElement {
   const t = useT();

   return (
      <div className="ins-heat-legend" role="group" aria-label={label}>
         <span className="t-caption">{label}</span>
         <ol>
            <li>
               <span className="ins-heat ins-heat--0" aria-hidden="true" />
               <span className="tabular">{t('insights.heat.none')}</span>
            </li>
            {thresholds.map((threshold, index) => (
               <li key={threshold}>
                  <span className={`ins-heat ins-heat--${index + 1}`} aria-hidden="true" />
                  <span className="tabular">
                     {t('insights.heat.upTo', { value: format(threshold) })}
                  </span>
               </li>
            ))}
         </ol>
      </div>
   );
}
