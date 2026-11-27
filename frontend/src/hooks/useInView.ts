import { useEffect, useRef, useState } from 'react';

/**
 * True once the referenced element has scrolled into view (and stays true).
 * Use to start entrance animations or defer heavy charts. Resolves immediately
 * where IntersectionObserver is unavailable.
 */
export function useInView<TElement extends Element>(
   rootMargin = '0px 0px -10% 0px',
): [ React.RefObject<TElement | null>, boolean ] {
   const ref = useRef<TElement | null>(null);
   const [ inView, setInView ] = useState(false);

   useEffect(() => {
      const element = ref.current;

      if (!element || typeof IntersectionObserver === 'undefined') {
         setInView(true);

         return undefined;
      }

      const observer = new IntersectionObserver(
         (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
               setInView(true);
               observer.disconnect();
            }
         },
         { rootMargin },
      );

      observer.observe(element);

      return () => observer.disconnect();
   }, [ rootMargin ]);

   return [ ref, inView ];
}
