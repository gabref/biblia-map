import { useEffect, useState } from 'react';

function matches(query: string): boolean {
   return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;
}

/** Subscribe to a CSS media query. Returns false where matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
   const [ matched, setMatched ] = useState(() => matches(query));

   useEffect(() => {
      if (typeof window.matchMedia !== 'function') {
         return undefined;
      }

      const list = window.matchMedia(query);
      const handleChange = (): void => setMatched(list.matches);

      handleChange();
      list.addEventListener('change', handleChange);

      return () => list.removeEventListener('change', handleChange);
   }, [ query ]);

   return matched;
}
