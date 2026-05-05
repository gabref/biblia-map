import { useEffect, useState } from 'react';

interface AsyncState<T> {
   data: T | null;
   error: Error | null;
   isLoading: boolean;
   showLoading: boolean;
}

export function useAsyncData<T>(loader: () => Promise<T>, dependencies: React.DependencyList): AsyncState<T> {
   const [state, setState] = useState<AsyncState<T>>({
      data: null,
      error: null,
      isLoading: true,
      showLoading: false,
   });

   useEffect(() => {
      let active = true;
      const loadingTimer = window.setTimeout(() => {
         if (active) {
            setState((current) => ({ ...current, showLoading: true }));
         }
      }, 150);

      setState({
         data: null,
         error: null,
         isLoading: true,
         showLoading: false,
      });

      loader()
         .then((data) => {
            if (active) {
               setState({ data, error: null, isLoading: false, showLoading: false });
            }
         })
         .catch((unknownError: unknown) => {
            if (active) {
               const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
               setState({ data: null, error, isLoading: false, showLoading: false });
            }
         })
         .finally(() => window.clearTimeout(loadingTimer));

      return () => {
         active = false;
         window.clearTimeout(loadingTimer);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, dependencies);

   return state;
}
