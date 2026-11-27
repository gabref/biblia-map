import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
   DEFAULT_COLLECTION_ID,
   HISTORY_LIMIT,
   NOTE_MAX_LENGTH,
   STUDY_STORAGE_KEY,
   __reloadStudyStoreForTests,
   __resetStudyStoreForTests,
   addBookmark,
   clearHistory,
   collectionsContaining,
   compareVerseKeys,
   createCollection,
   deleteCollection,
   getCollectionNote,
   getNote,
   getStudyData,
   getStudyStatus,
   isBookmarked,
   moveBookmark,
   moveCollection,
   parseVerseKey,
   recordVisit,
   removeHistoryEntry,
   renameCollection,
   setCollectionNote,
   setNote,
   toggleBookmark,
   useBookmarks,
   useHistory,
   useNote,
   verseKey,
   type VerseKey,
} from './store';

const john316 = { bookNumber: 43, chapterNumber: 3, verseNumber: 16 };

function stored(): Record<string, unknown> {
   return JSON.parse(window.localStorage.getItem(STUDY_STORAGE_KEY) ?? 'null') as Record<string, unknown>;
}

describe('study store', () => {
   beforeEach(() => {
      window.localStorage.clear();
      __resetStudyStoreForTests();
   });

   afterEach(() => {
      vi.restoreAllMocks();
   });

   it('builds, parses and orders canonical keys', () => {
      expect(verseKey(john316)).toBe('43.3.16');
      expect(parseVerseKey('43.3.16')).toEqual(john316);
      expect(parseVerseKey('john.3.16')).toBeNull();
      expect([ '43.3.16', '1.1.1', '43.1.2' ].sort((a, b) => compareVerseKeys(a as VerseKey, b as VerseKey))).toEqual([ '1.1.1', '43.1.2', '43.3.16' ]);
   });

   it('toggles bookmarks reactively and persists them', () => {
      const { result } = renderHook(() => useBookmarks());

      act(() => {
         expect(toggleBookmark(john316)).toBe(true);
      });
      expect(isBookmarked('43.3.16')).toBe(true);
      expect(isBookmarked(john316, 'other')).toBe(false);
      expect(result.current.bookmarks).toHaveLength(1);
      expect((stored().bookmarks as unknown[]).length).toBe(1);

      act(() => {
         expect(toggleBookmark('43.3.16')).toBe(false);
      });
      expect(result.current.bookmarks).toHaveLength(0);
   });

   it('keeps snapshots referentially stable between unrelated reads', () => {
      const { result, rerender } = renderHook(() => useBookmarks());
      const first = result.current;

      rerender();
      expect(result.current).toBe(first);
      act(() => recordVisit(john316));
      expect(result.current).toBe(first);
   });

   it('dedupes history most recent first, caps it and records the dataset', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
         recordVisit(john316);
         recordVisit({ bookNumber: 1, chapterNumber: 1, verseNumber: 1 });
         recordVisit(john316, { datasetId: 'nwtsty' });
      });
      expect(result.current.entries.map((entry) => entry.key)).toEqual([ '43.3.16', '1.1.1' ]);
      expect(result.current.entries[0].datasetId).toBe('nwtsty');

      act(() => {
         for (let verse = 1; verse <= HISTORY_LIMIT + 20; verse += 1) {
            recordVisit({ bookNumber: 19, chapterNumber: 119, verseNumber: Math.min(verse, 176) });
         }
      });
      expect(result.current.entries.length).toBeLessThanOrEqual(HISTORY_LIMIT);

      act(() => removeHistoryEntry(john316));
      expect(result.current.entries.some((entry) => entry.key === '43.3.16')).toBe(false);
      act(() => clearHistory());
      expect(result.current.entries).toEqual([]);
   });

   it('stores and deletes notes, capped at the max length', () => {
      setNote('43.3.16', 'love');
      expect(getNote('43.3.16')).toBe('love');
      setNote('43.3.16', 'x'.repeat(NOTE_MAX_LENGTH + 50));
      expect(getNote('43.3.16')).toHaveLength(NOTE_MAX_LENGTH);
      setNote('43.3.16', '  ');
      expect(getNote('43.3.16')).toBe('');
      expect(getStudyData().notes).toEqual({});
   });

   it('exposes reactive notes', () => {
      const { result } = renderHook(() => useNote('43.3.16'));

      act(() => result.current[1]('hello'));
      expect(result.current[0]).toBe('hello');
   });

   it('manages collections: create, rename, reorder, delete (not the default)', () => {
      const talk = createCollection('  Talk:   God’s love ');

      expect(talk).not.toBeNull();
      expect(talk?.name).toBe('Talk: God’s love');
      expect(talk?.id).toMatch(/^talk-god-s-love-[a-z0-9]{4}$/);
      expect(createCollection('   ')).toBeNull();

      addBookmark(john316, talk!.id);
      addBookmark(john316, DEFAULT_COLLECTION_ID);
      expect(collectionsContaining(john316)).toEqual([ DEFAULT_COLLECTION_ID, talk!.id ]);

      expect(renameCollection(talk!.id, 'Love')).toBe(true);
      expect(renameCollection('missing', 'x')).toBe(false);

      moveCollection(talk!.id, 0);
      expect(getStudyData().collections.map((item) => item.id)).toEqual([ talk!.id, DEFAULT_COLLECTION_ID ]);
      expect(collectionsContaining(john316)).toEqual([ talk!.id, DEFAULT_COLLECTION_ID ]);

      setCollectionNote(talk!.id, 'Outline');
      expect(getCollectionNote(talk!.id)).toBe('Outline');
      setCollectionNote(talk!.id, '');
      expect(getCollectionNote(talk!.id)).toBe('');

      expect(deleteCollection(DEFAULT_COLLECTION_ID)).toBe(false);
      expect(deleteCollection(talk!.id)).toBe(true);
      expect(isBookmarked(john316, talk!.id)).toBe(false);
      expect(isBookmarked(john316, DEFAULT_COLLECTION_ID)).toBe(true);
   });

   it('ignores bookmarks into unknown collections and keeps range ends', () => {
      expect(addBookmark(john316, 'nope')).toBe(false);
      expect(addBookmark(john316, DEFAULT_COLLECTION_ID, { endKey: '43.3.18' })).toBe(true);
      expect(addBookmark(john316, DEFAULT_COLLECTION_ID)).toBe(false);
      expect(getStudyData().bookmarks[0].endKey).toBe('43.3.18');
   });

   it('reorders bookmarks within a collection only', () => {
      const other = createCollection('Other')!;
      const keys: VerseKey[] = [ '1.1.1', '1.1.2', '1.1.3' ];

      keys.forEach((key) => addBookmark(key));
      addBookmark('2.2.2', other.id);
      moveBookmark(DEFAULT_COLLECTION_ID, '1.1.3', 0);
      moveBookmark(DEFAULT_COLLECTION_ID, '1.1.1', 99);

      const saved = getStudyData().bookmarks.filter((item) => item.collectionId === DEFAULT_COLLECTION_ID).map((item) => item.key);
      expect(saved).toEqual([ '1.1.3', '1.1.2', '1.1.1' ]);
      expect(isBookmarked('2.2.2', other.id)).toBe(true);
   });

   it('reloads persisted data', () => {
      addBookmark(john316);
      setNote('43.3.16', 'kept');
      __reloadStudyStoreForTests();
      expect(isBookmarked(john316)).toBe(true);
      expect(getNote('43.3.16')).toBe('kept');
      expect(getStudyStatus()).toEqual({ persistent: true, droppedEntries: 0 });
   });

   it('backs up corrupted storage and starts fresh', () => {
      window.localStorage.setItem(STUDY_STORAGE_KEY, '{not json');
      vi.spyOn(Date, 'now').mockReturnValue(1234);
      __reloadStudyStoreForTests();

      expect(getStudyData().bookmarks).toEqual([]);
      expect(getStudyData().collections.map((item) => item.id)).toEqual([ DEFAULT_COLLECTION_ID ]);
      expect(getStudyStatus().backupKey).toBe(`${STUDY_STORAGE_KEY}.backup-1234`);
      expect(window.localStorage.getItem(`${STUDY_STORAGE_KEY}.backup-1234`)).toBe('{not json');
   });

   it('salvages valid entries from partly damaged data', () => {
      window.localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify({
         version: 1,
         collections: [ { id: 'saved', name: 'Saved', createdAt: 0 }, { id: 'BAD ID', name: 'x' } ],
         bookmarks: [ { key: '43.3.16', collectionId: 'saved', createdAt: 5 }, { key: 'oops', collectionId: 'saved' } ],
         notes: { '43.3.16': { text: 'ok', updatedAt: 1 }, nope: { text: 'x' } },
         history: 'garbage',
      }));
      __reloadStudyStoreForTests();

      expect(isBookmarked('43.3.16')).toBe(true);
      expect(getNote('43.3.16')).toBe('ok');
      expect(getStudyStatus().droppedEntries).toBe(3);
      expect(getStudyStatus().backupKey).toBeUndefined();
   });

   it('reports when storage is unavailable but keeps working in memory', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
         throw new DOMException('full', 'QuotaExceededError');
      });
      __reloadStudyStoreForTests();

      expect(getStudyStatus().persistent).toBe(false);
      expect(toggleBookmark(john316)).toBe(true);
      expect(isBookmarked(john316)).toBe(true);
   });

   it('syncs changes from other tabs via the storage event', () => {
      const { result } = renderHook(() => useBookmarks());

      getStudyData();
      const otherTab = {
         version: 1,
         collections: [ { id: 'saved', name: 'Saved', createdAt: 0 } ],
         bookmarks: [ { key: '1.1.1', collectionId: 'saved', createdAt: 1 } ],
         notes: {},
         history: [],
      };

      act(() => {
         window.dispatchEvent(new StorageEvent('storage', { key: STUDY_STORAGE_KEY, newValue: JSON.stringify(otherTab) }));
      });
      expect(result.current.bookmarks.map((item) => item.key)).toEqual([ '1.1.1' ]);

      act(() => {
         window.dispatchEvent(new StorageEvent('storage', { key: STUDY_STORAGE_KEY, newValue: '{broken' }));
         window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'x' }));
      });
      expect(result.current.bookmarks.map((item) => item.key)).toEqual([ '1.1.1' ]);

      act(() => {
         window.dispatchEvent(new StorageEvent('storage', { key: null }));
      });
      expect(result.current.bookmarks).toEqual([]);
   });
});
