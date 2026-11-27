import { lazy } from 'react';

import {
   loadBookMatrix,
   loadBooks,
   loadChapters,
   loadCompactEdges,
   loadManifest,
   loadStatsSummary,
} from '../data/generated';

/**
 * Route-level code splitting. Each page (and its heavy deps such as d3) lives in its own chunk.
 * `preloadRoute` warms both the chunk and the JSON the page reads on mount, so it can be called
 * on boot (in parallel with datasets.json), on nav hover/focus, and when the browser is idle.
 */
const chunkLoaders = {
   overview: () => import('./OverviewPage').then((module) => ({ default: module.OverviewPage })),
   chord: () => import('./ChordPage').then((module) => ({ default: module.ChordPage })),
   verse: () => import('./VersePage').then((module) => ({ default: module.VersePage })),
   blocks: () => import('./RelationshipBlocksPage').then((module) => ({ default: module.RelationshipBlocksPage })),
   about: () => import('./AboutPage').then((module) => ({ default: module.AboutPage })),
   styleguide: () => import('./StyleguidePage').then((module) => ({ default: module.StyleguidePage })),
};

export type LazyRouteId = keyof typeof chunkLoaders;

const dataPrefetchers: Record<LazyRouteId, (datasetId: string) => Array<Promise<unknown>>> = {
   overview: (datasetId) => [ loadManifest(datasetId), loadStatsSummary(datasetId) ],
   about: (datasetId) => [ loadManifest(datasetId), loadStatsSummary(datasetId) ],
   styleguide: () => [],
   chord: (datasetId) => [ loadBooks(datasetId), loadBookMatrix(datasetId, 'combined') ],
   verse: (datasetId) => [ loadManifest(datasetId), loadBooks(datasetId), loadChapters(datasetId) ],
   // Blocks needs the full edge list (~3 MB raw); only prefetch it when the user shows intent.
   blocks: (datasetId) => [ loadManifest(datasetId), loadBooks(datasetId), loadChapters(datasetId), loadCompactEdges(datasetId, 'combined') ],
};

export const OverviewPage = lazy(chunkLoaders.overview);
export const ChordPage = lazy(chunkLoaders.chord);
export const VersePage = lazy(chunkLoaders.verse);
export const RelationshipBlocksPage = lazy(chunkLoaders.blocks);
export const AboutPage = lazy(chunkLoaders.about);
export const StyleguidePage = lazy(chunkLoaders.styleguide);

export function preloadRoute(routeId: LazyRouteId, datasetId?: string | null): void {
   void chunkLoaders[routeId]().catch(() => undefined);

   if (datasetId && !prefersReducedData()) {
      for (const request of dataPrefetchers[routeId](datasetId)) {
         // Failures surface (and are retried) when the page itself loads the same file.
         request.catch(() => undefined);
      }
   }
}

export function routeIdFromPath(path: string): LazyRouteId {
   for (const routeId of [ 'chord', 'verse', 'blocks', 'about', 'styleguide' ] as const) {
      if (path.startsWith(`/${routeId}`)) {
         return routeId;
      }
   }

   return 'overview';
}

/** Fetch the remaining route chunks (JS only, a few KB each) once the main thread is idle. */
export function preloadRouteChunksWhenIdle(): void {
   const run = (): void => {
      for (const load of Object.values(chunkLoaders)) {
         void load().catch(() => undefined);
      }
   };

   if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 4000 });
   } else {
      window.setTimeout(run, 2000);
   }
}

function prefersReducedData(): boolean {
   const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;

   return connection?.saveData === true;
}
