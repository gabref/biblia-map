import { useEffect, useState } from 'react';

export function useCountUp(value: number, durationMs = 900): number {
   const [displayValue, setDisplayValue] = useState(0);

   useEffect(() => {
      const startTime = window.performance.now();
      let animationFrame = 0;

      const tick = (now: number): void => {
         const progress = Math.min(1, (now - startTime) / durationMs);
         const eased = 1 - (1 - progress) ** 3;
         setDisplayValue(Math.round(value * eased));

         if (progress < 1) {
            animationFrame = window.requestAnimationFrame(tick);
         }
      };

      animationFrame = window.requestAnimationFrame(tick);

      return () => window.cancelAnimationFrame(animationFrame);
   }, [ durationMs, value ]);

   return displayValue;
}
