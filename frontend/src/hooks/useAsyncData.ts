import { useEffect, useState } from 'react';

export interface AsyncState<T> {
   data: T | null;
   error: Error | null;
   isLoading: boolean;
   showLoading: boolean;
   /** True while `data` belongs to the previous dependencies (only with `keepPreviousData`). */
   isStale: boolean;
}

export interface AsyncDataOptions {
   /**
    * Keep returning the last successful `data` while a reload for new dependencies is in flight,
    * instead of resetting to `null`. Lets a page keep its controls mounted while a filter change
    * reloads (e.g. the chord edge-kind toggle) rather than flashing a full-page shimmer.
    */
   keepPreviousData?: boolean;
   /** Delay before `showLoading` turns on, so fast (cached) loads never flash a shimmer. */
   loadingDelayMs?: number;
}

interface InternalState<T> {
   dependencies: React.DependencyList;
   data: T | null;
   error: Error | null;
   isLoading: boolean;
   showLoading: boolean;
   isStale: boolean;
}

export function useAsyncData<T>(
   loader: () => Promise<T>,
   dependencies: React.DependencyList,
   options: AsyncDataOptions = {},
): AsyncState<T> {
   const { keepPreviousData = false, loadingDelayMs = 150 } = options;
   const [state, setState] = useState<InternalState<T>>(() => ({
      dependencies,
      data: null,
      error: null,
      isLoading: true,
      showLoading: false,
      isStale: false,
   }));

   // Reset synchronously during render when the dependencies change. Resetting inside the effect
   // (as before) let consumers render once with the *previous* dependencies' data next to the new
   // dependencies, e.g. the verse page started neighborhood loads for the new dataset using the old
   // dataset's verse index.
   let current = state;
   if (!dependenciesEqual(state.dependencies, dependencies)) {
      const keep = keepPreviousData && state.data !== null;
      current = {
         dependencies,
         data: keep ? state.data : null,
         error: null,
         isLoading: true,
         showLoading: false,
         isStale: keep,
      };
      setState(current);
   }

   useEffect(() => {
      let active = true;
      const loadingTimer = window.setTimeout(() => {
         if (active) {
            setState((previous) => ({ ...previous, showLoading: true }));
         }
      }, loadingDelayMs);

      // `Promise.resolve().then(loader)` also routes a synchronous throw into the rejection path.
      Promise.resolve()
         .then(loader)
         .then((data) => {
            if (active) {
               setState({ dependencies, data, error: null, isLoading: false, showLoading: false, isStale: false });
            }
         })
         .catch((unknownError: unknown) => {
            if (active) {
               const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
               setState({ dependencies, data: null, error, isLoading: false, showLoading: false, isStale: false });
            }
         })
         .finally(() => window.clearTimeout(loadingTimer));

      return () => {
         active = false;
         window.clearTimeout(loadingTimer);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, dependencies);

   return {
      data: current.data,
      error: current.error,
      isLoading: current.isLoading,
      showLoading: current.showLoading,
      isStale: current.isStale,
   };
}

function dependenciesEqual(left: React.DependencyList, right: React.DependencyList): boolean {
   return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}
