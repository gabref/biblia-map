import { useEffect, useRef, useState } from 'react';

import { easeOutCubic, prefersReducedMotion } from '../lib/motion';

/**
 * Tween a number toward `value`. Starts from 0 on mount and from the number currently
 * shown on later changes. Honours the OS "reduce motion" setting (WCAG 2.3.3) by
 * jumping straight to the value.
 */
export function useCountUp(value: number, durationMs = 800): number {
   const [ displayValue, setDisplayValue ] = useState(() => (prefersReducedMotion() ? value : 0));
   const shownRef = useRef(displayValue);

   useEffect(() => {
      if (prefersReducedMotion() || durationMs <= 0 || typeof window.requestAnimationFrame !== 'function') {
         shownRef.current = value;
         setDisplayValue(value);

         return undefined;
      }

      const from = shownRef.current;
      const startTime = window.performance.now();
      let animationFrame = 0;

      const tick = (now: number): void => {
         const progress = Math.min(1, (now - startTime) / durationMs);
         const next = Math.round(from + (value - from) * easeOutCubic(progress));

         shownRef.current = next;
         setDisplayValue(next);

         if (progress < 1) {
            animationFrame = window.requestAnimationFrame(tick);
         }
      };

      animationFrame = window.requestAnimationFrame(tick);

      return () => window.cancelAnimationFrame(animationFrame);
   }, [ durationMs, value ]);

   return displayValue;
}
