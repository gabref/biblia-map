/**
 * Day-1 study store contract (§6.1). **Epic E-C owns the implementation**: these are
 * in-memory stubs with the FINAL signatures so other epics (E-B buttons, E-A `b` shortcut
 * and Home "Continue") can wire against them today. E-C will swap the internals for
 * versioned localStorage (`bibliamap.study.v1`) without changing these exports.
 *
 * Verses are identified by a dataset-independent canonical key `${book}.${chapter}.${verse}`
 * (e.g. `43.3.16`), so bookmarks/notes survive dataset switches.
 */
import { useSyncExternalStore } from 'react';

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
}

export interface Collection {
   id: string;
   name: string;
   createdAt: number;
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

/** The default "Saved" collection, always present. */
export const DEFAULT_COLLECTION_ID = 'saved';
export const HISTORY_LIMIT = 100;

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

function toKey(refOrKey: StudyVerseRef | VerseKey): VerseKey {
   return typeof refOrKey === 'string' ? refOrKey : verseKey(refOrKey);
}

// ---- in-memory stub state (E-C replaces) ----

let bookmarksState: BookmarksState = {
   bookmarks: [],
   collections: [ { id: DEFAULT_COLLECTION_ID, name: 'Saved', createdAt: 0 } ],
};
let historyState: HistoryState = { entries: [] };
const notes = new Map<VerseKey, string>();
const listeners = new Set<() => void>();

function emit(): void {
   listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
   listeners.add(listener);

   return () => listeners.delete(listener);
}

/** Records a visit (call once per verse view). Moves the verse to the top of history. */
export function recordVisit(ref: StudyVerseRef | VerseKey, opts?: { datasetId?: string }): void {
   const key = toKey(ref);
   const entry: HistoryEntry = { key, visitedAt: Date.now(), ...(opts?.datasetId ? { datasetId: opts.datasetId } : {}) };

   historyState = { entries: [ entry, ...historyState.entries.filter((item) => item.key !== key) ].slice(0, HISTORY_LIMIT) };
   emit();
}

export function clearHistory(): void {
   historyState = { entries: [] };
   emit();
}

/** True if the verse is bookmarked in `collectionId`, or in any collection when omitted. */
export function isBookmarked(ref: StudyVerseRef | VerseKey, collectionId?: string): boolean {
   const key = toKey(ref);

   return bookmarksState.bookmarks.some((item) => item.key === key && (collectionId === undefined || item.collectionId === collectionId));
}

/**
 * Adds/removes the verse in `collectionId` (default: `DEFAULT_COLLECTION_ID`).
 * Returns the new state: `true` if now bookmarked.
 */
export function toggleBookmark(ref: StudyVerseRef | VerseKey, collectionId: string = DEFAULT_COLLECTION_ID): boolean {
   const key = toKey(ref);
   const exists = isBookmarked(key, collectionId);

   bookmarksState = {
      ...bookmarksState,
      bookmarks: exists
         ? bookmarksState.bookmarks.filter((item) => !(item.key === key && item.collectionId === collectionId))
         : [ ...bookmarksState.bookmarks, { key, collectionId, createdAt: Date.now() } ],
   };
   emit();

   return !exists;
}

/** Note text for a verse, `''` when none. */
export function getNote(key: VerseKey): string {
   return notes.get(key) ?? '';
}

/** Sets (or, with empty/whitespace text, deletes) the note for a verse. */
export function setNote(key: VerseKey, text: string): void {
   if (text.trim()) {
      notes.set(key, text);
   } else {
      notes.delete(key);
   }

   emit();
}

/** Reactive bookmarks + collections. */
export function useBookmarks(): BookmarksState {
   return useSyncExternalStore(subscribe, () => bookmarksState, () => bookmarksState);
}

/** Reactive visit history (most recent first). */
export function useHistory(): HistoryState {
   return useSyncExternalStore(subscribe, () => historyState, () => historyState);
}

/** Reactive note for one verse: `[text, setText]`. */
export function useNote(key: VerseKey): [string, (text: string) => void] {
   const text = useSyncExternalStore(subscribe, () => getNote(key), () => getNote(key));

   return [ text, (next: string) => setNote(key, next) ];
}

/** Test helper: resets the stub state. */
export function __resetStudyStoreForTests(): void {
   bookmarksState = { bookmarks: [], collections: [ { id: DEFAULT_COLLECTION_ID, name: 'Saved', createdAt: 0 } ] };
   historyState = { entries: [] };
   notes.clear();
   emit();
}
