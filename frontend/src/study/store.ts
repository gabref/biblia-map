/**
 * Study store (§6.1 contract, implemented by Epic E-C): history, bookmarks & collections and
 * notes, persisted to localStorage under the versioned key `bibliamap.study.v1`.
 *
 * - Every mutation writes the whole document (it is small: ≤ 100 history entries, a few
 *   hundred bookmarks/notes). Writes go through `utils/storage`, so blocked storage or a full
 *   quota never throws; `useStudyStatus()` reports it so the UI can warn about data loss.
 * - Other tabs are kept in sync through the `storage` event.
 * - Unreadable stored data is copied to a `bibliamap.study.v1.backup-<ms>` key before the
 *   store starts over, so nothing is silently destroyed.
 *
 * Verses are identified by a dataset-independent canonical key `${book}.${chapter}.${verse}`
 * (e.g. `43.3.16`), so bookmarks/notes survive dataset switches.
 */
import { useSyncExternalStore } from 'react';

import { readStoredValue, writeStoredValue } from '../utils/storage';
import {
   DEFAULT_COLLECTION_ID,
   HISTORY_LIMIT,
   NOTE_MAX_LENGTH,
   STUDY_STORAGE_KEY,
   cleanCollectionName,
   emptyStudyData,
   migrateStudyData,
   parseStoredStudyData,
   type NoteRecord,
   type StudyData,
} from './schema';

export { DEFAULT_COLLECTION_ID, HISTORY_LIMIT, NOTE_MAX_LENGTH, STUDY_STORAGE_KEY } from './schema';
export type { NoteRecord, StudyData } from './schema';

/** Canonical, dataset-independent verse key: `${bookNumber}.${chapterNumber}.${verseNumber}`. */
export type VerseKey = `${number}.${number}.${number}`;

/** Anything that locates a verse; any `VerseRef` from `types/generated` fits. */
export interface StudyVerseRef {
   bookNumber: number;
   chapterNumber: number;
   verseNumber: number;
}

export interface Bookmark {
   key: VerseKey;
   collectionId: string;
   /** Epoch ms. */
   createdAt: number;
   /** Optional inclusive range end (same chapter or later), e.g. `43.3.18` for John 3:16-18. */
   endKey?: VerseKey;
}

export interface Collection {
   id: string;
   name: string;
   createdAt: number;
   /** Collection-level note (talk outline, theme…). */
   note?: NoteRecord;
}

export interface HistoryEntry {
   key: VerseKey;
   /** Dataset the verse was viewed in, when known. */
   datasetId?: string;
   /** Epoch ms. */
   visitedAt: number;
}

export interface BookmarksState {
   bookmarks: readonly Bookmark[];
   collections: readonly Collection[];
}

export interface HistoryState {
   /** Most recent first, deduped by key, capped at `HISTORY_LIMIT`. */
   entries: readonly HistoryEntry[];
}

export interface StudyStatus {
   /** False when localStorage is blocked or the last write failed (e.g. quota): changes live only in this tab. */
   persistent: boolean;
   /** Set when unreadable stored data was found and copied aside under this key. */
   backupKey?: string;
   /** Malformed entries dropped while loading. */
   droppedEntries: number;
}

/** `{bookNumber: 43, chapterNumber: 3, verseNumber: 16}` → `'43.3.16'`. */
export function verseKey(ref: StudyVerseRef): VerseKey {
   return `${ref.bookNumber}.${ref.chapterNumber}.${ref.verseNumber}`;
}

/** Inverse of `verseKey`; `null` for malformed keys. */
export function parseVerseKey(key: string): StudyVerseRef | null {
   const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(key);

   if (!match) {
      return null;
   }

   return { bookNumber: Number(match[1]), chapterNumber: Number(match[2]), verseNumber: Number(match[3]) };
}

/** Canonical ordering of verse keys (book, chapter, verse). */
export function compareVerseKeys(left: VerseKey, right: VerseKey): number {
   const a = parseVerseKey(left);
   const b = parseVerseKey(right);

   if (!a || !b) {
      return left.localeCompare(right);
   }

   return a.bookNumber - b.bookNumber || a.chapterNumber - b.chapterNumber || a.verseNumber - b.verseNumber;
}

export function toVerseKey(refOrKey: StudyVerseRef | VerseKey): VerseKey {
   return typeof refOrKey === 'string' ? refOrKey : verseKey(refOrKey);
}

// ---- state ----

let data: StudyData | null = null;
let status: StudyStatus = { persistent: true, droppedEntries: 0 };
let bookmarksSnapshot: BookmarksState | null = null;
let historySnapshot: HistoryState | null = null;
let syncAttached = false;
const listeners = new Set<() => void>();

function emit(): void {
   listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
   listeners.add(listener);

   return () => listeners.delete(listener);
}

/** Subscribes to any study-data change (for `useSyncExternalStore`). Returns the unsubscribe function. */
export function subscribeStudy(listener: () => void): () => void {
   return subscribe(listener);
}

function onStorage(event: StorageEvent): void {
   if (event.key !== STUDY_STORAGE_KEY && event.key !== null) {
      return;
   }

   if (event.key === null || event.newValue === null) {
      // Cleared in another tab.
      setData(emptyStudyData(), false);
      return;
   }

   const parsed = parseStoredStudyData(event.newValue);

   if (parsed.data) {
      setData(parsed.data, false);
   }
}

function load(): StudyData {
   if (data) {
      return data;
   }

   const raw = readStoredValue(STUDY_STORAGE_KEY);
   const parsed = parseStoredStudyData(raw);
   let backupKey: string | undefined;

   if (parsed.data) {
      data = parsed.data;
   } else {
      backupKey = `${STUDY_STORAGE_KEY}.backup-${Date.now()}`;

      if (raw === null || !writeStoredValue(backupKey, raw)) {
         backupKey = undefined;
      }

      data = emptyStudyData();
   }

   // Probe persistence: rewriting the same value is a no-op for other tabs (no storage event).
   const persistent = parsed.data && raw !== null ? writeStoredValue(STUDY_STORAGE_KEY, raw) : writeStoredValue(STUDY_STORAGE_KEY, JSON.stringify(data));

   status = { persistent, droppedEntries: parsed.dropped, ...(backupKey ? { backupKey } : {}) };

   if (!syncAttached && typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
      syncAttached = true;
   }

   return data;
}

function setData(next: StudyData, persist = true): void {
   data = next;

   if (persist) {
      const persistent = writeStoredValue(STUDY_STORAGE_KEY, JSON.stringify(next));

      if (persistent !== status.persistent) {
         status = { ...status, persistent };
      }
   }

   emit();
}

function update(recipe: (current: StudyData) => StudyData): void {
   const current = load();
   const next = recipe(current);

   if (next !== current) {
      setData(next);
   }
}

/** Full current document (for export). */
export function getStudyData(): StudyData {
   return load();
}

/** Replaces the whole document (after a validated import merge). Invalid input is ignored. */
export function replaceStudyData(next: StudyData): void {
   const clean = migrateStudyData(next);

   if (clean) {
      setData(clean);
   }
}

export function getStudyStatus(): StudyStatus {
   load();

   return status;
}

// ---- history ----

/** Records a visit (call once per verse view). Moves the verse to the top of history. */
export function recordVisit(ref: StudyVerseRef | VerseKey, opts?: { datasetId?: string }): void {
   const key = toVerseKey(ref);
   const entry: HistoryEntry = { key, visitedAt: Date.now(), ...(opts?.datasetId ? { datasetId: opts.datasetId } : {}) };

   update((current) => ({
      ...current,
      history: [ entry, ...current.history.filter((item) => item.key !== key) ].slice(0, HISTORY_LIMIT),
   }));
}

export function clearHistory(): void {
   update((current) => (current.history.length ? { ...current, history: [] } : current));
}

export function removeHistoryEntry(ref: StudyVerseRef | VerseKey): void {
   const key = toVerseKey(ref);

   update((current) => ({ ...current, history: current.history.filter((item) => item.key !== key) }));
}

// ---- bookmarks ----

/** True if the verse is bookmarked in `collectionId`, or in any collection when omitted. */
export function isBookmarked(ref: StudyVerseRef | VerseKey, collectionId?: string): boolean {
   const key = toVerseKey(ref);

   return load().bookmarks.some((item) => item.key === key && (collectionId === undefined || item.collectionId === collectionId));
}

/** Ids of the collections that contain the verse, in collection order. */
export function collectionsContaining(ref: StudyVerseRef | VerseKey): string[] {
   const key = toVerseKey(ref);
   const current = load();
   const ids = new Set(current.bookmarks.filter((item) => item.key === key).map((item) => item.collectionId));

   return current.collections.filter((collection) => ids.has(collection.id)).map((collection) => collection.id);
}

/** Adds the verse to a collection (no-op when already there or the collection is unknown). Returns `true` if added. */
export function addBookmark(
   ref: StudyVerseRef | VerseKey,
   collectionId: string = DEFAULT_COLLECTION_ID,
   opts?: { endKey?: VerseKey },
): boolean {
   const key = toVerseKey(ref);
   let added = false;

   update((current) => {
      if (!current.collections.some((collection) => collection.id === collectionId)) {
         return current;
      }

      if (current.bookmarks.some((item) => item.key === key && item.collectionId === collectionId)) {
         return current;
      }

      added = true;
      const bookmark: Bookmark = { key, collectionId, createdAt: Date.now() };

      if (opts?.endKey && opts.endKey !== key) {
         bookmark.endKey = opts.endKey;
      }

      return { ...current, bookmarks: [ ...current.bookmarks, bookmark ] };
   });

   return added;
}

export function removeBookmark(ref: StudyVerseRef | VerseKey, collectionId: string = DEFAULT_COLLECTION_ID): void {
   const key = toVerseKey(ref);

   update((current) => ({
      ...current,
      bookmarks: current.bookmarks.filter((item) => !(item.key === key && item.collectionId === collectionId)),
   }));
}

/**
 * Adds/removes the verse in `collectionId` (default: `DEFAULT_COLLECTION_ID`).
 * Returns the new state: `true` if now bookmarked.
 */
export function toggleBookmark(ref: StudyVerseRef | VerseKey, collectionId: string = DEFAULT_COLLECTION_ID): boolean {
   const key = toVerseKey(ref);

   if (isBookmarked(key, collectionId)) {
      removeBookmark(key, collectionId);
      return false;
   }

   return addBookmark(key, collectionId);
}

/** Moves a bookmark to position `toIndex` (clamped) within its collection. */
export function moveBookmark(collectionId: string, ref: StudyVerseRef | VerseKey, toIndex: number): void {
   const key = toVerseKey(ref);

   update((current) => {
      const inCollection = current.bookmarks.filter((item) => item.collectionId === collectionId);
      const from = inCollection.findIndex((item) => item.key === key);
      const to = Math.max(0, Math.min(inCollection.length - 1, Math.round(toIndex)));

      if (from < 0 || from === to) {
         return current;
      }

      const reordered = [ ...inCollection ];
      const [ moved ] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);

      return { ...current, bookmarks: [ ...current.bookmarks.filter((item) => item.collectionId !== collectionId), ...reordered ] };
   });
}

// ---- collections ----

function slugify(name: string): string {
   return name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
}

function newCollectionId(name: string, taken: ReadonlySet<string>): string {
   const base = slugify(name) || 'collection';

   for (let attempt = 0; attempt < 50; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
      const id = `${base}-${suffix}`;

      if (!taken.has(id)) {
         return id;
      }
   }

   return `${base}-${Date.now().toString(36)}`;
}

export function getCollection(id: string): Collection | undefined {
   return load().collections.find((collection) => collection.id === id);
}

/** Creates a collection (name is trimmed; empty names are rejected with `null`). */
export function createCollection(name: string): Collection | null {
   const clean = cleanCollectionName(name);

   if (!clean) {
      return null;
   }

   const current = load();
   const collection: Collection = {
      id: newCollectionId(clean, new Set(current.collections.map((item) => item.id))),
      name: clean,
      createdAt: Date.now(),
   };

   setData({ ...current, collections: [ ...current.collections, collection ] });

   return collection;
}

export function renameCollection(id: string, name: string): boolean {
   const clean = cleanCollectionName(name);
   let renamed = false;

   if (!clean) {
      return false;
   }

   update((current) => {
      if (!current.collections.some((collection) => collection.id === id)) {
         return current;
      }

      renamed = true;

      return { ...current, collections: current.collections.map((collection) => (collection.id === id ? { ...collection, name: clean } : collection)) };
   });

   return renamed;
}

/** Deletes a collection and its bookmarks. The default "Saved" collection cannot be deleted. */
export function deleteCollection(id: string): boolean {
   if (id === DEFAULT_COLLECTION_ID || !getCollection(id)) {
      return false;
   }

   update((current) => ({
      ...current,
      collections: current.collections.filter((collection) => collection.id !== id),
      bookmarks: current.bookmarks.filter((item) => item.collectionId !== id),
   }));

   return true;
}

/** Moves a collection to position `toIndex` (clamped) in the collection list. */
export function moveCollection(id: string, toIndex: number): void {
   update((current) => {
      const from = current.collections.findIndex((collection) => collection.id === id);
      const to = Math.max(0, Math.min(current.collections.length - 1, Math.round(toIndex)));

      if (from < 0 || from === to) {
         return current;
      }

      const collections = [ ...current.collections ];
      const [ moved ] = collections.splice(from, 1);
      collections.splice(to, 0, moved);

      return { ...current, collections };
   });
}

// ---- notes ----

function noteRecord(text: string): NoteRecord | undefined {
   const clipped = text.slice(0, NOTE_MAX_LENGTH);

   return clipped.trim() ? { text: clipped, updatedAt: Date.now() } : undefined;
}

/** Note text for a verse, `''` when none. */
export function getNote(key: VerseKey): string {
   return load().notes[key]?.text ?? '';
}

/** Sets (or, with empty/whitespace text, deletes) the note for a verse. Text is capped at `NOTE_MAX_LENGTH`. */
export function setNote(key: VerseKey, text: string): void {
   update((current) => {
      if ((current.notes[key]?.text ?? '') === text) {
         return current;
      }

      const notes = { ...current.notes };
      const record = noteRecord(text);

      if (record) {
         notes[key] = record;
      } else {
         delete notes[key];
      }

      return { ...current, notes };
   });
}

/** Collection-level note text, `''` when none. */
export function getCollectionNote(id: string): string {
   return getCollection(id)?.note?.text ?? '';
}

export function setCollectionNote(id: string, text: string): void {
   update((current) => {
      const target = current.collections.find((collection) => collection.id === id);

      if (!target || (target.note?.text ?? '') === text) {
         return current;
      }

      const record = noteRecord(text);

      return {
         ...current,
         collections: current.collections.map((collection) => {
            if (collection.id !== id) {
               return collection;
            }

            const { note: _previous, ...rest } = collection;

            return record ? { ...rest, note: record } : rest;
         }),
      };
   });
}

// ---- hooks ----

function getBookmarksSnapshot(): BookmarksState {
   const current = load();

   if (!bookmarksSnapshot || bookmarksSnapshot.bookmarks !== current.bookmarks || bookmarksSnapshot.collections !== current.collections) {
      bookmarksSnapshot = { bookmarks: current.bookmarks, collections: current.collections };
   }

   return bookmarksSnapshot;
}

function getHistorySnapshot(): HistoryState {
   const current = load();

   if (!historySnapshot || historySnapshot.entries !== current.history) {
      historySnapshot = { entries: current.history };
   }

   return historySnapshot;
}

/** Reactive bookmarks + collections. */
export function useBookmarks(): BookmarksState {
   return useSyncExternalStore(subscribe, getBookmarksSnapshot, getBookmarksSnapshot);
}

/** Reactive visit history (most recent first). */
export function useHistory(): HistoryState {
   return useSyncExternalStore(subscribe, getHistorySnapshot, getHistorySnapshot);
}

/** Reactive note for one verse: `[text, setText]`. */
export function useNote(key: VerseKey): [string, (text: string) => void] {
   const text = useSyncExternalStore(subscribe, () => getNote(key), () => getNote(key));

   return [ text, (next: string) => setNote(key, next) ];
}

/** Reactive note for one collection: `[text, setText]`. */
export function useCollectionNote(id: string): [string, (text: string) => void] {
   const text = useSyncExternalStore(subscribe, () => getCollectionNote(id), () => getCollectionNote(id));

   return [ text, (next: string) => setCollectionNote(id, next) ];
}

/** Reactive map of all verse notes. */
export function useNotes(): Readonly<Record<VerseKey, NoteRecord>> {
   const read = (): Record<VerseKey, NoteRecord> => load().notes;

   return useSyncExternalStore(subscribe, read, read);
}

/** Reactive whole document (for export / summaries). */
export function useStudyData(): StudyData {
   return useSyncExternalStore(subscribe, load, load);
}

/** Reactive persistence status (for the data-loss warning banner). */
export function useStudyStatus(): StudyStatus {
   return useSyncExternalStore(subscribe, getStudyStatus, getStudyStatus);
}

// ---- test helpers ----

/** Test helper: forgets the in-memory state so the next access reloads from localStorage. */
export function __reloadStudyStoreForTests(): void {
   data = null;
   bookmarksSnapshot = null;
   historySnapshot = null;
   status = { persistent: true, droppedEntries: 0 };
   emit();
}

/** Test helper: clears the persisted study data and resets the in-memory state. */
export function __resetStudyStoreForTests(): void {
   try {
      window.localStorage.removeItem(STUDY_STORAGE_KEY);
   } catch {
      // Storage unavailable: nothing persisted to clear.
   }

   __reloadStudyStoreForTests();
}
