/**
 * Persisted study data: the versioned schema stored under `bibliamap.study.v1` and the
 * lenient validator used both when loading localStorage and when importing a backup file.
 *
 * Validation salvages what it can: a malformed bookmark or note is dropped, never the
 * whole document, so one bad entry cannot wipe a student's study.
 */
import type { Bookmark, Collection, HistoryEntry, VerseKey } from './store';

export const STUDY_STORAGE_KEY = 'bibliamap.study.v1';
export const STUDY_SCHEMA_VERSION = 1;
/** Envelope `format` tag of exported backup files. */
export const STUDY_EXPORT_FORMAT = 'bibliamap-study';
export const DEFAULT_COLLECTION_ID = 'saved';
export const DEFAULT_COLLECTION_NAME = 'Saved';
export const HISTORY_LIMIT = 100;
/** Hard cap for one note (verse or collection), in characters. */
export const NOTE_MAX_LENGTH = 10_000;
export const COLLECTION_NAME_MAX_LENGTH = 80;

export interface NoteRecord {
   text: string;
   /** Epoch ms. */
   updatedAt: number;
}

/** Version 1 of the persisted document. Array order is display order (collections and bookmarks). */
export interface StudyData {
   version: typeof STUDY_SCHEMA_VERSION;
   collections: Collection[];
   bookmarks: Bookmark[];
   /** Verse notes by canonical verse key. */
   notes: Record<VerseKey, NoteRecord>;
   /** Most recent first, deduped by key, at most `HISTORY_LIMIT`. */
   history: HistoryEntry[];
}

export interface StudyExportFile {
   format: typeof STUDY_EXPORT_FORMAT;
   version: typeof STUDY_SCHEMA_VERSION;
   /** ISO timestamp. */
   exportedAt: string;
   data: StudyData;
}

export interface SanitizeReport {
   /** Entries that were present but malformed and therefore dropped. */
   dropped: number;
}

const VERSE_KEY_PATTERN = /^[1-9]\d{0,2}\.[1-9]\d{0,2}\.[1-9]\d{0,2}$/;
const COLLECTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isVerseKey(value: unknown): value is VerseKey {
   return typeof value === 'string' && VERSE_KEY_PATTERN.test(value);
}

export function isCollectionId(value: unknown): value is string {
   return typeof value === 'string' && COLLECTION_ID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown, fallback: number): number {
   return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export function defaultCollection(): Collection {
   return { id: DEFAULT_COLLECTION_ID, name: DEFAULT_COLLECTION_NAME, createdAt: 0 };
}

export function emptyStudyData(): StudyData {
   return { version: STUDY_SCHEMA_VERSION, collections: [ defaultCollection() ], bookmarks: [], notes: {}, history: [] };
}

export function cleanCollectionName(name: string): string {
   return name.replace(/\s+/g, ' ').trim().slice(0, COLLECTION_NAME_MAX_LENGTH);
}

/**
 * Migration hook: turns any previously persisted shape into the current `StudyData`.
 * Add a `case` per future version (`case 1: raw = migrateV1toV2(raw)` falling through).
 * Returns `null` for documents that are not study data at all, or come from a newer app.
 */
export function migrateStudyData(raw: unknown, report: SanitizeReport = { dropped: 0 }): StudyData | null {
   if (!isRecord(raw)) {
      return null;
   }

   const version = raw.version;

   switch (version) {
      case STUDY_SCHEMA_VERSION:
         return sanitizeV1(raw, report);
      default:
         return null;
   }
}

function sanitizeV1(raw: Record<string, unknown>, report: SanitizeReport): StudyData {
   const now = Date.now();
   const collections: Collection[] = [];
   const seenCollections = new Set<string>();

   for (const item of Array.isArray(raw.collections) ? raw.collections : []) {
      if (!isRecord(item) || !isCollectionId(item.id) || typeof item.name !== 'string' || seenCollections.has(item.id)) {
         report.dropped += 1;
         continue;
      }

      const name = cleanCollectionName(item.name) || (item.id === DEFAULT_COLLECTION_ID ? DEFAULT_COLLECTION_NAME : '');

      if (!name) {
         report.dropped += 1;
         continue;
      }

      const collection: Collection = { id: item.id, name, createdAt: timestamp(item.createdAt, now) };

      if (isRecord(item.note) && typeof item.note.text === 'string' && item.note.text.trim()) {
         collection.note = { text: item.note.text.slice(0, NOTE_MAX_LENGTH), updatedAt: timestamp(item.note.updatedAt, now) };
      }

      seenCollections.add(item.id);
      collections.push(collection);
   }

   if (!seenCollections.has(DEFAULT_COLLECTION_ID)) {
      collections.unshift(defaultCollection());
      seenCollections.add(DEFAULT_COLLECTION_ID);
   }

   const bookmarks: Bookmark[] = [];
   const seenBookmarks = new Set<string>();

   for (const item of Array.isArray(raw.bookmarks) ? raw.bookmarks : []) {
      if (!isRecord(item) || !isVerseKey(item.key) || typeof item.collectionId !== 'string' || !seenCollections.has(item.collectionId)) {
         report.dropped += 1;
         continue;
      }

      const id = `${item.collectionId}|${item.key}`;

      if (seenBookmarks.has(id)) {
         continue;
      }

      const bookmark: Bookmark = { key: item.key, collectionId: item.collectionId, createdAt: timestamp(item.createdAt, now) };

      if (isVerseKey(item.endKey) && item.endKey !== item.key) {
         bookmark.endKey = item.endKey;
      }

      seenBookmarks.add(id);
      bookmarks.push(bookmark);
   }

   const notes: Record<VerseKey, NoteRecord> = {};

   if (isRecord(raw.notes)) {
      for (const [ key, value ] of Object.entries(raw.notes)) {
         if (!isVerseKey(key) || !isRecord(value) || typeof value.text !== 'string') {
            report.dropped += 1;
            continue;
         }

         if (value.text.trim()) {
            notes[key] = { text: value.text.slice(0, NOTE_MAX_LENGTH), updatedAt: timestamp(value.updatedAt, now) };
         }
      }
   }

   const history: HistoryEntry[] = [];
   const seenHistory = new Set<string>();

   for (const item of Array.isArray(raw.history) ? raw.history : []) {
      if (!isRecord(item) || !isVerseKey(item.key)) {
         report.dropped += 1;
         continue;
      }

      if (seenHistory.has(item.key)) {
         continue;
      }

      const entry: HistoryEntry = { key: item.key, visitedAt: timestamp(item.visitedAt, 0) };

      if (typeof item.datasetId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(item.datasetId)) {
         entry.datasetId = item.datasetId;
      }

      seenHistory.add(item.key);
      history.push(entry);
   }

   history.sort((left, right) => right.visitedAt - left.visitedAt);

   return { version: STUDY_SCHEMA_VERSION, collections, bookmarks, notes, history: history.slice(0, HISTORY_LIMIT) };
}

/** Parses the localStorage payload. `null` raw → empty data; unreadable → `{ data: null }`. */
export function parseStoredStudyData(rawText: string | null): { data: StudyData | null; dropped: number } {
   if (rawText === null) {
      return { data: emptyStudyData(), dropped: 0 };
   }

   const report: SanitizeReport = { dropped: 0 };

   try {
      return { data: migrateStudyData(JSON.parse(rawText) as unknown, report), dropped: report.dropped };
   } catch {
      return { data: null, dropped: 0 };
   }
}
