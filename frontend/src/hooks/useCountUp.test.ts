import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCountUp } from './useCountUp';

function mockReducedMotion(matches: boolean): void {
   vi.stubGlobal('matchMedia', (query: string) => ({
      matches: matches && query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
   }));
}

describe('useCountUp', () => {
   afterEach(() => {
      vi.unstubAllGlobals();
   });

   it('shows the final value immediately when reduced motion is preferred', () => {
      mockReducedMotion(true);
      const { result } = renderHook(() => useCountUp(31_078));

      expect(result.current).toBe(31_078);
   });

   it('animates from zero otherwise', () => {
      mockReducedMotion(false);
      const { result } = renderHook(() => useCountUp(31_078));

      expect(result.current).toBe(0);
   });
});
