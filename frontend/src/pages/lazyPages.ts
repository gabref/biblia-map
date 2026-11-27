/**
 * Compatibility shim. Route-level code splitting now lives in `routing/pageRegistry.tsx`
 * (owner E-A), which keeps the boot / hover / idle prefetch behaviour introduced here.
 * `main.tsx` still imports these names.
 */
import { pageNameFromPath, preloadPage, preloadPagesWhenIdle, type ShellPageName } from '../routing/pageRegistry';

export type LazyRouteId = ShellPageName;

export function preloadRoute(routeId: LazyRouteId, datasetId?: string | null): void {
   preloadPage(routeId, datasetId);
}

export function routeIdFromPath(path: string): LazyRouteId {
   return pageNameFromPath(path);
}

export function preloadRouteChunksWhenIdle(): void {
   preloadPagesWhenIdle();
}
