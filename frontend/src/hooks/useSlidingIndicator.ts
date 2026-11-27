import { useLayoutEffect, useState } from 'react';

/**
 * Positions a sliding highlight under the active item of a tab list / segmented control.
 * Writes --ind-x, --ind-y, --ind-w, --ind-h (px) on the container and sets
 * data-indicator="ready" once measured; CSS draws and animates the highlight.
 * The active item must carry data-active="true".
 *
 * Returns a callback ref (so it also works when the container mounts after the first render).
 */
export function useSlidingIndicator<TElement extends HTMLElement>(activeKey: string): React.RefCallback<TElement> {
   const [ container, setContainer ] = useState<TElement | null>(null);

   useLayoutEffect(() => {
      if (!container) {
         return undefined;
      }

      const measure = (): void => {
         const active = container.querySelector<HTMLElement>('[data-active="true"]');

         if (!active || active.offsetWidth === 0) {
            container.removeAttribute('data-indicator');

            return;
         }

         container.style.setProperty('--ind-x', `${active.offsetLeft}px`);
         container.style.setProperty('--ind-y', `${active.offsetTop}px`);
         container.style.setProperty('--ind-w', `${active.offsetWidth}px`);
         container.style.setProperty('--ind-h', `${active.offsetHeight}px`);
         container.setAttribute('data-indicator', 'ready');
      };

      measure();

      if (typeof ResizeObserver === 'undefined') {
         return undefined;
      }

      const observer = new ResizeObserver(measure);

      observer.observe(container);

      return () => observer.disconnect();
   }, [ activeKey, container ]);

   return setContainer;
}
