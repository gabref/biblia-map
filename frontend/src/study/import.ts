/**
 * Import of a study backup (JSON) with **merge** semantics — an import never deletes or
 * overwrites what is already on this device:
 *
 * - Collections match by id, then by name (case-insensitive); unmatched ones are added.
 * - Bookmarks are added when the verse is not yet in the (matched) collection.
 * - Notes: added when missing locally; when both sides differ, the imported text is appended
 *   below the local one (skipped if one already contains the other, so re-importing the same
 *   file is a no-op).
 * - History: union by verse, keeping the most recent visit, capped at `HISTORY_LIMIT`.
 */
import { HISTORY_LIMIT, STUDY_EXPORT_FORMAT, migrateStudyData, type NoteRecord, type SanitizeReport, type StudyData } from './schema';
import type { Bookmark, Collection, HistoryEntry, VerseKey } from './store';

export type ImportError = 'json' | 'format' | 'version' | 'empty';

export type ParsedImport =
   | { ok: true; data: StudyData; dropped: number }
   | { ok: false; error: ImportError };

export interface ImportSummary {
   collectionsAdded: number;
   bookmarksAdded: number;
   notesAdded: number;
   /** Notes that existed on both sides with different text (combined). */
   notesMerged: number;
   historyAdded: number;
   /** Malformed entries in the file that were ignored. */
   dropped: number;
   /** True when the import changes nothing. */
   nothingNew: boolean;
}

export interface ImportPlan {
   next: StudyData;
   summary: ImportSummary;
}

/** Max accepted file size (characters). A large study is well under 1 MB. */
export const IMPORT_MAX_LENGTH = 5_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates an export file (or a raw stored document). Never throws. */
export function parseImportText(text: string): ParsedImport {
   if (!text.trim()) {
      return { ok: false, error: 'empty' };
   }

   if (text.length > IMPORT_MAX_LENGTH) {
      return { ok: false, error: 'format' };
   }

   let raw: unknown;

   try {
      raw = JSON.parse(text);
   } catch {
      return { ok: false, error: 'json' };
   }

   if (!isRecord(raw)) {
      return { ok: false, error: 'format' };
   }

   let document: unknown = raw;

   if ('format' in raw) {
      if (raw.format !== STUDY_EXPORT_FORMAT) {
         return { ok: false, error: 'format' };
      }

      document = isRecord(raw.data) ? { version: raw.version, ...raw.data } : null;
   }

   if (!isRecord(document) || !('collections' in document || 'bookmarks' in document || 'notes' in document || 'history' in document)) {
      return { ok: false, error: 'format' };
   }

   if (typeof document.version !== 'number') {
      return { ok: false, error: 'format' };
   }

   const report: SanitizeReport = { dropped: 0 };
   const data = migrateStudyData(document, report);

   return data ? { ok: true, data, dropped: report.dropped } : { ok: false, error: 'version' };
}

function normalizeName(name: string): string {
   return name.trim().toLocaleLowerCase();
}

/** Combines two notes without losing either. Returns `null` when `local` already covers `incoming`. */
function mergeNote(local: NoteRecord | undefined, incoming: NoteRecord | undefined): { note: NoteRecord; kind: 'added' | 'merged' } | null {
   if (!incoming || !incoming.text.trim()) {
      return null;
   }

   if (!local || !local.text.trim()) {
      return { note: incoming, kind: 'added' };
   }

   const localText = local.text.trim();
   const incomingText = incoming.text.trim();

   if (localText.includes(incomingText)) {
      return null;
   }

   if (incomingText.includes(localText)) {
      return { note: { text: incoming.text, updatedAt: Math.max(local.updatedAt, incoming.updatedAt) }, kind: 'merged' };
   }

   return { note: { text: `${local.text.trimEnd()}\n\n${incoming.text.trim()}`, updatedAt: Math.max(local.updatedAt, incoming.updatedAt) }, kind: 'merged' };
}

/** Pure merge of `incoming` into `current`. */
export function planImport(current: StudyData, incoming: StudyData, dropped = 0): ImportPlan {
   const summary: ImportSummary = {
      collectionsAdded: 0,
      bookmarksAdded: 0,
      notesAdded: 0,
      notesMerged: 0,
      historyAdded: 0,
      dropped,
      nothingNew: true,
   };

   const countNote = (kind: 'added' | 'merged'): void => {
      if (kind === 'added') {
         summary.notesAdded += 1;
      } else {
         summary.notesMerged += 1;
      }
   };

   // Collections.
   const collections: Collection[] = current.collections.map((collection) => ({ ...collection }));
   const byId = new Map(collections.map((collection) => [ collection.id, collection ]));
   const byName = new Map(collections.map((collection) => [ normalizeName(collection.name), collection ]));
   const idMap = new Map<string, string>();

   for (const imported of incoming.collections) {
      const match = byId.get(imported.id) ?? byName.get(normalizeName(imported.name));

      if (match) {
         idMap.set(imported.id, match.id);
         const merged = mergeNote(match.note, imported.note);

         if (merged) {
            match.note = merged.note;
            countNote(merged.kind);
         }

         continue;
      }

      const added: Collection = { ...imported };
      collections.push(added);
      byId.set(added.id, added);
      byName.set(normalizeName(added.name), added);
      idMap.set(imported.id, added.id);
      summary.collectionsAdded += 1;

      if (added.note) {
         summary.notesAdded += 1;
      }
   }

   // Bookmarks.
   const bookmarks: Bookmark[] = [ ...current.bookmarks ];
   const existing = new Set(bookmarks.map((item) => `${item.collectionId}|${item.key}`));

   for (const imported of incoming.bookmarks) {
      const collectionId = idMap.get(imported.collectionId);

      if (!collectionId || existing.has(`${collectionId}|${imported.key}`)) {
         continue;
      }

      existing.add(`${collectionId}|${imported.key}`);
      bookmarks.push({ ...imported, collectionId });
      summary.bookmarksAdded += 1;
   }

   // Verse notes.
   const notes: Record<VerseKey, NoteRecord> = { ...current.notes };

   for (const [ key, note ] of Object.entries(incoming.notes) as Array<[ VerseKey, NoteRecord ]>) {
      const merged = mergeNote(notes[key], note);

      if (merged) {
         notes[key] = merged.note;
         countNote(merged.kind);
      }
   }

   // History.
   const visits = new Map<VerseKey, HistoryEntry>(current.history.map((entry) => [ entry.key, entry ]));

   for (const entry of incoming.history) {
      const local = visits.get(entry.key);

      if (!local) {
         summary.historyAdded += 1;
         visits.set(entry.key, entry);
      } else if (entry.visitedAt > local.visitedAt) {
         visits.set(entry.key, entry);
      }
   }

   const history = [ ...visits.values() ].sort((left, right) => right.visitedAt - left.visitedAt).slice(0, HISTORY_LIMIT);
   const localKeys = new Set(current.history.map((entry) => entry.key));
   summary.historyAdded = history.filter((entry) => !localKeys.has(entry.key)).length;

   summary.nothingNew = summary.collectionsAdded + summary.bookmarksAdded + summary.notesAdded + summary.notesMerged + summary.historyAdded === 0;

   return { next: { ...current, collections, bookmarks, notes, history }, summary };
}
