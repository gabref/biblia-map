import { afterEach, describe, expect, it, vi } from 'vitest';

import { readStoredValue, writeStoredValue } from './storage';

describe('storage helpers', () => {
   afterEach(() => {
      vi.restoreAllMocks();
      window.localStorage.clear();
   });

   it('round-trips values when storage works', () => {
      expect(writeStoredValue('k', 'v')).toBe(true);
      expect(readStoredValue('k')).toBe('v');
      expect(readStoredValue('missing')).toBeNull();
   });

   it('returns null instead of throwing when reads are blocked', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
         throw new DOMException('denied', 'SecurityError');
      });

      expect(readStoredValue('k')).toBeNull();
   });

   it('returns false instead of throwing when writes fail', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
         throw new DOMException('full', 'QuotaExceededError');
      });

      expect(writeStoredValue('k', 'v')).toBe(false);
   });

   it('survives a localStorage getter that throws', () => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', {
         configurable: true,
         get() {
            throw new DOMException('denied', 'SecurityError');
         },
      });

      try {
         expect(readStoredValue('k')).toBeNull();
         expect(writeStoredValue('k', 'v')).toBe(false);
      } finally {
         if (descriptor) {
            Object.defineProperty(window, 'localStorage', descriptor);
         }
      }
   });
});
