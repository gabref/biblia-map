import { REDUCED_MOTION_QUERY } from '../lib/motion';
import { useMediaQuery } from './useMediaQuery';

/** True when the user asked the OS for reduced motion. Gate JS-driven animation on this. */
export function usePrefersReducedMotion(): boolean {
   return useMediaQuery(REDUCED_MOTION_QUERY);
}
