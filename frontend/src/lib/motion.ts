import { flushSync } from 'react-dom';

/** Mirrors the --dur-* tokens in styles/tokens.css (milliseconds). */
export const DURATION = {
   instant: 90,
   fast: 140,
   base: 220,
   slow: 360,
   slower: 560,
} as const;

/** Mirrors the --ease-* tokens, for the Web Animations API and d3 transitions. */
export const EASING = {
   standard: 'cubic-bezier(0.2, 0, 0, 1)',
   enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
   exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
   spring: 'cubic-bezier(0.34, 1.36, 0.64, 1)',
} as const;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
   return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION_QUERY).matches
      : false;
}

/** Duration to hand to JS-driven animation: 0 when the user asked for reduced motion. */
export function motionDuration(ms: number): number {
   return prefersReducedMotion() ? 0 : ms;
}

/** Ease-out cubic, the default curve for JS tweens (count-ups, zoom, pan). */
export function easeOutCubic(progress: number): number {
   return 1 - (1 - progress) ** 3;
}

interface ViewTransitionDocument {
   startViewTransition?: (callback: () => void) => { finished: Promise<void> };
}

/**
 * Run a state update inside a View Transition so the browser cross-fades (and morphs
 * elements sharing a `view-transition-name`) between the old and new DOM.
 * Falls back to a plain update when unsupported or when reduced motion is requested.
 */
export function withViewTransition(update: () => void): void {
   const doc = document as unknown as ViewTransitionDocument;

   if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
      update();

      return;
   }

   doc.startViewTransition(() => flushSync(update));
}
