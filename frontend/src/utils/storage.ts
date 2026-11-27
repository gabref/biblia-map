/**
 * Safe wrappers around `window.localStorage`.
 *
 * Accessing `localStorage` throws a `SecurityError` when storage is blocked (Safari private
 * windows on older versions, "block all cookies" settings, sandboxed iframes), and `setItem`
 * throws `QuotaExceededError` when storage is full. An uncaught throw during the first render
 * leaves the whole app blank, so every access goes through these helpers.
 */

function storage(): Storage | null {
   try {
      return typeof window === 'undefined' ? null : window.localStorage;
   } catch {
      return null;
   }
}

export function readStoredValue(key: string): string | null {
   try {
      return storage()?.getItem(key) ?? null;
   } catch {
      return null;
   }
}

/** Returns `true` when the value was persisted. */
export function writeStoredValue(key: string, value: string): boolean {
   try {
      const target = storage();

      if (!target) {
         return false;
      }

      target.setItem(key, value);
      return true;
   } catch {
      return false;
   }
}

export const datasetStorageKey = 'bibliamap-dataset';
