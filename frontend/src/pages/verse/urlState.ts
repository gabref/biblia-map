/**
 * URL state of the Verse Study page. The verse lives in the path, the filters in the query
 * (`?kind=&dir=&depth=`); defaults are left out so shared links stay short. Filter changes
 * use `replaceState`, moving to another verse pushes a history entry.
 */
import type { RouteParams, VerseLocation } from '../../routing/routes';
import { verseHref } from '../../routing/routes';
import type { DirectionMode, EdgeKindFilter } from '../../types/generated';

export type GraphDepth = 1 | 2;

export interface VerseFilters {
   kind: EdgeKindFilter;
   dir: DirectionMode;
   depth: GraphDepth;
}

export const DEFAULT_FILTERS: VerseFilters = { kind: 'combined', dir: 'all', depth: 1 };

/**
 * `window` event E-A's `[` / `]` shortcuts dispatch to move to the previous / next verse:
 * `window.dispatchEvent(new CustomEvent(VERSE_STEP_EVENT, { detail: { delta: -1 } }))`.
 */
export const VERSE_STEP_EVENT = 'bibliamap:verse-step';

export interface VerseStepEventDetail {
   /** -1 = previous verse, 1 = next verse. */
   delta: -1 | 1;
}

/** Filters from validated route params. Depth 3 no longer exists: anything but 2 is 1. */
export function filtersFromParams(params: RouteParams): VerseFilters {
   return {
      kind: params.kind ?? DEFAULT_FILTERS.kind,
      dir: params.dir ?? DEFAULT_FILTERS.dir,
      depth: params.depth === 2 ? 2 : 1,
   };
}

/** Query params for a set of filters, keeping pass-through params (`ds`, `lang`) and dropping defaults. */
export function paramsForFilters(filters: VerseFilters, passthrough: RouteParams = {}): RouteParams {
   const params: RouteParams = {};

   if (passthrough.ds) params.ds = passthrough.ds;
   if (passthrough.lang) params.lang = passthrough.lang;
   if (filters.kind !== DEFAULT_FILTERS.kind) params.kind = filters.kind;
   if (filters.dir !== DEFAULT_FILTERS.dir) params.dir = filters.dir;
   if (filters.depth !== DEFAULT_FILTERS.depth) params.depth = filters.depth;

   return params;
}

/** Canonical href of the study page for a verse + filters. */
export function verseStudyHref(verse: VerseLocation, filters: VerseFilters, passthrough?: RouteParams): string {
   return verseHref(verse, paramsForFilters(filters, passthrough));
}

/** Number of filters that differ from the defaults (shown on the mobile "Filters" button). */
export function activeFilterCount(filters: VerseFilters): number {
   return (
      Number(filters.kind !== DEFAULT_FILTERS.kind) +
      Number(filters.dir !== DEFAULT_FILTERS.dir) +
      Number(filters.depth !== DEFAULT_FILTERS.depth)
   );
}
