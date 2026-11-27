/**
 * Study trail: the verses visited in this browser tab, oldest first, kept in `sessionStorage`.
 * A verse appears once; revisiting it only moves the "current" marker, so the trail reads as
 * the path the student took (John 3:16 → 1 John 4:9 → Romans 5:8).
 */
import { parseVerseKey, type StudyVerseRef, type VerseKey } from '../../study/store';

export const TRAIL_LIMIT = 8;
export const TRAIL_STORAGE_KEY = 'bibliamap.verse.trail.v1';

/** Adds `key` at the end unless it is already on the trail; keeps the newest `limit` entries. */
export function pushTrail(trail: readonly VerseKey[], key: VerseKey, limit: number = TRAIL_LIMIT): VerseKey[] {
   if (trail.includes(key)) {
      return trail.slice(-limit);
   }

   return [ ...trail, key ].slice(-limit);
}

function session(): Storage | null {
   try {
      return typeof window === 'undefined' ? null : window.sessionStorage;
   } catch {
      return null;
   }
}

export function readTrail(): VerseKey[] {
   try {
      const raw = session()?.getItem(TRAIL_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(parsed)) {
         return [];
      }

      return parsed
         .filter((item): item is VerseKey => typeof item === 'string' && parseVerseKey(item) !== null)
         .slice(-TRAIL_LIMIT);
   } catch {
      return [];
   }
}

export function writeTrail(trail: readonly VerseKey[]): void {
   try {
      session()?.setItem(TRAIL_STORAGE_KEY, JSON.stringify(trail));
   } catch {
      // Storage blocked or full: the trail just lasts for this page view.
   }
}

/** The most recently added verse, used when `/verse` is opened without a reference. */
export function lastTrailVerse(trail: readonly VerseKey[]): StudyVerseRef | null {
   const last = trail[trail.length - 1];

   return last ? parseVerseKey(last) : null;
}
