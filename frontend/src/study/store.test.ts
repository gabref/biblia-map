import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
   __resetStudyStoreForTests,
   getNote,
   isBookmarked,
   parseVerseKey,
   recordVisit,
   setNote,
   toggleBookmark,
   useBookmarks,
   useHistory,
   verseKey,
} from './store';

const john316 = { bookNumber: 43, chapterNumber: 3, verseNumber: 16 };

describe('study store stub', () => {
   beforeEach(() => __resetStudyStoreForTests());

   it('builds and parses canonical keys', () => {
      expect(verseKey(john316)).toBe('43.3.16');
      expect(parseVerseKey('43.3.16')).toEqual(john316);
      expect(parseVerseKey('john.3.16')).toBeNull();
   });

   it('toggles bookmarks reactively', () => {
      const { result } = renderHook(() => useBookmarks());

      act(() => {
         expect(toggleBookmark(john316)).toBe(true);
      });
      expect(isBookmarked('43.3.16')).toBe(true);
      expect(isBookmarked(john316, 'other')).toBe(false);
      expect(result.current.bookmarks).toHaveLength(1);

      act(() => {
         expect(toggleBookmark('43.3.16')).toBe(false);
      });
      expect(result.current.bookmarks).toHaveLength(0);
   });

   it('dedupes history, most recent first', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
         recordVisit(john316);
         recordVisit({ bookNumber: 1, chapterNumber: 1, verseNumber: 1 });
         recordVisit(john316, { datasetId: 'nwtsty' });
      });
      expect(result.current.entries.map((entry) => entry.key)).toEqual([ '43.3.16', '1.1.1' ]);
   });

   it('stores notes', () => {
      setNote('43.3.16', 'love');
      expect(getNote('43.3.16')).toBe('love');
      setNote('43.3.16', '  ');
      expect(getNote('43.3.16')).toBe('');
   });
});
