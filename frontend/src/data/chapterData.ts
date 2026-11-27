/**
 * Read mode data helpers (Epic E-E). Imports from `generated.ts`, never edits it.
 *
 * A chapter view needs, for one book: the verse text, the source + target adjacency (both
 * cached by `generated.ts`), and the verse index to resolve connection targets to refs.
 * Three OPTIONAL files from Epic E-G are feature-detected via `manifest.json` `features`
 * and used when present; every consumer has a fallback computed from the adjacency:
 *
 * - `stats.verse-degree.json`         per-verse degree → ranks "top references" in previews
 * - `matrices/chapter/<NN>.<slug>.json` chapter → target-book counts → chapter summary (outgoing)
 * - `study-notes/<NN>.<slug>.json`    study-note text per verse → shown in the verse panel
 *
 * The expected shapes of those files are guesses until E-G merges; they are isolated in the
 * "E-G optional files" section below, behind tolerant normalizers that return `null` for
 * anything unrecognized (so a shape mismatch silently falls back instead of breaking).
 */
import type {
   AdjacentEdge,
   Book,
   DatasetManifest,
   DirectionMode,
   EdgeKindCode,
   EdgeKindFilter,
   SourceAdjacency,
   TargetAdjacency,
   VerseIndex,
   VerseRef,
   VerseTextBook,
} from '../types/generated';
import { BOOKS } from '../routing/routes';
import {
   bookFileName,
   edgeKindCode,
   isValidDatasetId,
   loadBooks,
   loadManifest,
   loadSourceAdjacency,
   loadTargetAdjacency,
   loadVerseIndex,
   loadVerseTextBook,
} from './generated';

// =====================================================================================
// E-G optional files: expected shapes (align these once E-G merges)
// =====================================================================================

/** `stats.verse-degree.json` (G2): arrays indexed by jwpubVerseId. */
export interface VerseDegreeFile {
   in: number[];
   out: number[];
   inStudy?: number[];
   outStudy?: number[];
}

/**
 * `matrices/chapter/<NN>.<slug>.json` (G3). Accepted variants (rows are per source chapter,
 * columns are per target book 1..66, values are outgoing reference counts):
 * - `number[][]` (row i = chapter i+1, column j = book j+1)
 * - `Record<chapter, number[] | Record<bookNumber, number>>`
 * - either of the above wrapped as `{ chapters: … }` or split by kind as
 *   `{ combined?: …, crossrefs?: …, 'study-notes'?: …, studyNotes?: … }`
 */
export type ChapterMatrixFile = unknown;

/**
 * `study-notes/<NN>.<slug>.json`. Accepted variants:
 * - `Record<jwpubVerseId, string | string[] | {text: string}[] | {text: string}>`
 * - `{ notes|verses: <the map above> }`
 * - `Array<{ verseId|jwpubVerseId|source: number; text: string }>`
 */
export type StudyNotesFile = unknown;

/** Normalized per-chapter counts: target book number → outgoing count. */
export type BookCountMap = Map<number, number>;

export interface OptionalFeatures {
   verseDegree: boolean;
   chapterMatrix: boolean;
   studyNotes: boolean;
}

/** Candidate `features` names per file (E-G has not fixed the strings yet). */
const FEATURE_NAMES: Record<keyof OptionalFeatures, readonly string[]> = {
   verseDegree: [ 'verse-degree', 'stats.verse-degree', 'verseDegree' ],
   chapterMatrix: [ 'chapter-matrices', 'chapter-matrix', 'matrices.chapter', 'matrices/chapter', 'chapterMatrix' ],
   studyNotes: [ 'study-notes', 'study-note-text', 'studyNotes', 'study-notes-text' ],
};

export function detectFeatures(manifest: Pick<DatasetManifest, 'datasetId'> & { features?: unknown }): OptionalFeatures {
   const list = Array.isArray(manifest.features) ? manifest.features.filter((item): item is string => typeof item === 'string') : [];
   const has = (names: readonly string[]): boolean => names.some((name) => list.includes(name));

   return {
      verseDegree: has(FEATURE_NAMES.verseDegree),
      chapterMatrix: has(FEATURE_NAMES.chapterMatrix),
      studyNotes: has(FEATURE_NAMES.studyNotes),
   };
}

function isNumberArray(value: unknown): value is number[] {
   return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

export function normalizeVerseDegree(raw: unknown): VerseDegreeFile | null {
   if (!raw || typeof raw !== 'object') {
      return null;
   }

   const record = raw as Record<string, unknown>;
   const incoming = record.in ?? record.incoming;
   const outgoing = record.out ?? record.outgoing;

   if (!isNumberArray(incoming) || !isNumberArray(outgoing)) {
      return null;
   }

   return {
      in: incoming,
      out: outgoing,
      ...(isNumberArray(record.inStudy) ? { inStudy: record.inStudy } : {}),
      ...(isNumberArray(record.outStudy) ? { outStudy: record.outStudy } : {}),
   };
}

/** Total degree (in + out) of a verse in the precomputed file, or `null` if out of range. */
export function verseDegreeTotal(degree: VerseDegreeFile, verseId: number): number | null {
   const incoming = degree.in[verseId];
   const outgoing = degree.out[verseId];

   if (incoming === undefined && outgoing === undefined) {
      return null;
   }

   return (incoming ?? 0) + (outgoing ?? 0);
}

function rowToCounts(row: unknown): BookCountMap | null {
   const counts: BookCountMap = new Map();

   if (isNumberArray(row)) {
      row.forEach((count, index) => {
         if (count > 0) counts.set(index + 1, count);
      });
      return counts;
   }

   if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const [ key, value ] of Object.entries(row as Record<string, unknown>)) {
         const bookNumber = Number(key);

         if (Number.isInteger(bookNumber) && bookNumber >= 1 && typeof value === 'number' && value > 0) {
            counts.set(bookNumber, value);
         }
      }
      return counts;
   }

   return null;
}

function chapterRow(rows: unknown, chapterNumber: number): BookCountMap | null {
   if (Array.isArray(rows)) {
      return rows.length >= chapterNumber ? rowToCounts(rows[chapterNumber - 1]) : null;
   }

   if (rows && typeof rows === 'object') {
      const record = rows as Record<string, unknown>;

      if ('chapters' in record) {
         return chapterRow(record.chapters, chapterNumber);
      }

      const row = record[String(chapterNumber)];

      return row === undefined ? null : rowToCounts(row);
   }

   return null;
}

/**
 * Outgoing target-book counts for one chapter from the chapter matrix file, for the given
 * edge kind. `null` when the file does not carry that kind or its shape is unrecognized.
 */
export function chapterMatrixCounts(raw: ChapterMatrixFile, chapterNumber: number, kind: EdgeKindFilter): BookCountMap | null {
   if (!raw || typeof raw !== 'object') {
      return null;
   }

   const record = raw as Record<string, unknown>;
   const kindKeys: Record<EdgeKindFilter, string[]> = {
      combined: [ 'combined', 'all' ],
      crossrefs: [ 'crossrefs', 'crossReferences', 'cross_reference' ],
      'study-notes': [ 'study-notes', 'studyNotes', 'study_note_reference' ],
   };
   const isKindSplit = Object.values(kindKeys).flat().some((key) => key in record);

   if (isKindSplit) {
      const key = kindKeys[kind].find((candidate) => candidate in record);

      return key ? chapterRow(record[key], chapterNumber) : null;
   }

   // Unsplit file: assume combined counts only.
   return kind === 'combined' ? chapterRow(raw, chapterNumber) : null;
}

function noteTexts(value: unknown): string[] {
   if (typeof value === 'string') {
      return value.trim() ? [ value.trim() ] : [];
   }

   if (Array.isArray(value)) {
      return value.flatMap(noteTexts);
   }

   if (value && typeof value === 'object') {
      const text = (value as Record<string, unknown>).text ?? (value as Record<string, unknown>).content;

      return typeof text === 'string' && text.trim() ? [ text.trim() ] : [];
   }

   return [];
}

/** jwpubVerseId → study-note paragraphs. `null` when the shape is unrecognized. */
export function normalizeStudyNotes(raw: StudyNotesFile): Map<number, string[]> | null {
   const notes = new Map<number, string[]>();

   if (Array.isArray(raw)) {
      for (const item of raw) {
         if (!item || typeof item !== 'object') continue;
         const record = item as Record<string, unknown>;
         const id = record.verseId ?? record.jwpubVerseId ?? record.source;
         const texts = noteTexts(record);

         if (typeof id === 'number' && texts.length > 0) {
            notes.set(id, [ ...(notes.get(id) ?? []), ...texts ]);
         }
      }
      return notes;
   }

   if (!raw || typeof raw !== 'object') {
      return null;
   }

   const record = raw as Record<string, unknown>;
   const map = (record.notes ?? record.verses ?? record) as Record<string, unknown>;

   if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return Array.isArray(map) ? normalizeStudyNotes(map) : null;
   }

   for (const [ key, value ] of Object.entries(map)) {
      const id = Number(key);
      const texts = noteTexts(value);

      if (Number.isInteger(id) && texts.length > 0) {
         notes.set(id, texts);
      }
   }

   return notes;
}

const optionalCache = new Map<string, Promise<unknown>>();

/** Fetches an optional generated file; resolves `null` on 404 / non-JSON (never rejects). */
export function loadOptionalJson(datasetId: string, relativePath: string): Promise<unknown> {
   if (!isValidDatasetId(datasetId)) {
      return Promise.resolve(null);
   }

   const key = `${datasetId}/${relativePath}`;
   const cached = optionalCache.get(key);

   if (cached) {
      return cached;
   }

   const pending = fetch(`/generated/${key}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

   optionalCache.set(key, pending);

   return pending;
}

export function clearOptionalDataCache(): void {
   optionalCache.clear();
}

// =====================================================================================
// Pure helpers
// =====================================================================================

export type ConnectionDirection = 'outgoing' | 'incoming';

export interface ChapterVerse {
   ref: VerseRef;
   text: string | null;
   outgoing: AdjacentEdge[];
   incoming: AdjacentEdge[];
}

export interface Connection {
   /** The related verse: target start (outgoing) or source (incoming). */
   verseId: number;
   /** For outgoing range targets (`targetEnd > targetStart`), the last verse of the range. */
   endVerseId: number;
   ref: VerseRef | null;
   endRef: VerseRef | null;
   direction: ConnectionDirection;
   kinds: EdgeKindCode[];
}

export function matchesKind(edge: Pick<AdjacentEdge, 'kind'>, kind: EdgeKindFilter): boolean {
   const code = edgeKindCode(kind);

   return code === null || edge.kind === code;
}

export interface UniqueEdge {
   edge: AdjacentEdge;
   direction: ConnectionDirection;
   /** Related verse: target start (outgoing) or source (incoming). */
   verseId: number;
   endVerseId: number;
   key: string;
}

/**
 * A verse's edges after filtering, deduped by (direction, related verse range): the same
 * reference listed both as a cross reference and in a study note counts once. Every count in
 * Read mode (badges, heat, panel, chapter summary) goes through this, so they always agree.
 */
export function uniqueEdges(verse: Pick<ChapterVerse, 'outgoing' | 'incoming'>, kind: EdgeKindFilter, direction: DirectionMode): UniqueEdge[] {
   const seen = new Set<string>();
   const result: UniqueEdge[] = [];

   const add = (edge: AdjacentEdge, edgeDirection: ConnectionDirection): void => {
      if (!matchesKind(edge, kind)) return;
      const verseId = edgeDirection === 'outgoing' ? edge.targetStart : edge.source;
      const endVerseId = edgeDirection === 'outgoing' ? Math.max(edge.targetEnd, edge.targetStart) : edge.source;
      const key = `${edgeDirection}:${verseId}:${endVerseId}`;

      if (seen.has(key)) return;
      seen.add(key);
      result.push({ edge, direction: edgeDirection, verseId, endVerseId, key });
   };

   if (direction !== 'incoming') verse.outgoing.forEach((edge) => add(edge, 'outgoing'));
   if (direction !== 'outgoing') verse.incoming.forEach((edge) => add(edge, 'incoming'));

   return result;
}

/** Number of distinct connections of a verse under the filters. */
export function verseCount(verse: Pick<ChapterVerse, 'outgoing' | 'incoming'>, kind: EdgeKindFilter, direction: DirectionMode): number {
   return uniqueEdges(verse, kind, direction).length;
}

/**
 * Heat intensity in [0, 1]. Square-root scaled so a single very hot verse does not wash
 * out the rest of the chapter. 0 only for verses without connections.
 */
export function heatLevel(count: number, max: number): number {
   if (count <= 0 || max <= 0) {
      return 0;
   }

   return Math.min(1, Math.sqrt(count / max));
}

/** Discrete heat step 0..5 for styling (0 = none). */
export function heatStep(count: number, max: number): number {
   const level = heatLevel(count, max);

   return level === 0 ? 0 : Math.max(1, Math.ceil(level * 5));
}

/**
 * Connections of one verse, deduped by (direction, related verse range); kinds merged.
 * Order is the publication order of the adjacency (cross refs as printed), outgoing first.
 */
export function verseConnections(
   verse: Pick<ChapterVerse, 'outgoing' | 'incoming'>,
   verseIndex: VerseIndex,
   kind: EdgeKindFilter,
   direction: DirectionMode,
): Connection[] {
   const byKey = new Map<string, Connection>();

   const add = (edge: AdjacentEdge, edgeDirection: ConnectionDirection): void => {
      if (!matchesKind(edge, kind)) return;
      const verseId = edgeDirection === 'outgoing' ? edge.targetStart : edge.source;
      const endVerseId = edgeDirection === 'outgoing' ? Math.max(edge.targetEnd, edge.targetStart) : edge.source;
      const key = `${edgeDirection}:${verseId}:${endVerseId}`;
      const existing = byKey.get(key);

      if (existing) {
         if (!existing.kinds.includes(edge.kind)) existing.kinds.push(edge.kind);
         return;
      }

      byKey.set(key, {
         verseId,
         endVerseId,
         ref: verseIndex[String(verseId)] ?? null,
         endRef: endVerseId === verseId ? null : verseIndex[String(endVerseId)] ?? null,
         direction: edgeDirection,
         kinds: [ edge.kind ],
      });
   };

   if (direction !== 'incoming') verse.outgoing.forEach((edge) => add(edge, 'outgoing'));
   if (direction !== 'outgoing') verse.incoming.forEach((edge) => add(edge, 'incoming'));

   return Array.from(byKey.values());
}

/** "John 3:16", "John 3:16-18", "John 3:36–4:2" for a connection. */
export function connectionLabel(connection: Pick<Connection, 'ref' | 'endRef' | 'verseId'>): string {
   const start = connection.ref;

   if (!start) {
      return `#${connection.verseId}`;
   }

   const end = connection.endRef;

   if (!end || end.jwpubVerseId === start.jwpubVerseId) {
      return start.label;
   }

   if (end.bookNumber === start.bookNumber && end.chapterNumber === start.chapterNumber) {
      return `${start.label}-${end.verseNumber}`;
   }

   if (end.bookNumber === start.bookNumber) {
      return `${start.label}–${end.chapterNumber}:${end.verseNumber}`;
   }

   return `${start.label}–${end.label}`;
}

export interface BookGroup<T> {
   bookNumber: number;
   items: T[];
}

/** Groups connections by the related verse's book, books in canonical order. */
export function groupByBook(connections: Connection[]): BookGroup<Connection>[] {
   const groups = new Map<number, Connection[]>();

   for (const connection of connections) {
      const bookNumber = connection.ref?.bookNumber ?? 0;
      groups.set(bookNumber, [ ...(groups.get(bookNumber) ?? []), connection ]);
   }

   return Array.from(groups, ([ bookNumber, items ]) => ({ bookNumber, items }))
      .sort((left, right) => left.bookNumber - right.bookNumber);
}

/**
 * The `limit` most notable connections. With the precomputed degree file, ranks by the related
 * verse's total degree (well-connected verses first); otherwise keeps publication order.
 */
export function topConnections(connections: Connection[], limit: number, degree?: VerseDegreeFile | null): Connection[] {
   if (!degree) {
      return connections.slice(0, limit);
   }

   return connections
      .map((connection, index) => ({ connection, index, score: verseDegreeTotal(degree, connection.verseId) ?? 0 }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, limit)
      .map((item) => item.connection);
}

export interface BookTally {
   bookNumber: number;
   count: number;
   outgoing: number;
   incoming: number;
}

export interface ChapterTally {
   bookNumber: number;
   chapterNumber: number;
   count: number;
}

export interface ChapterSummary {
   total: number;
   books: BookTally[];
   /** Top chapters overall, descending. */
   chapters: ChapterTally[];
   /** Where the numbers come from: the precomputed E-G matrix or the adjacency. */
   source: 'adjacency' | 'matrix';
}

function sortTallies<T extends { count: number; bookNumber: number }>(items: T[]): T[] {
   return items.sort((left, right) => right.count - left.count || left.bookNumber - right.bookNumber);
}

/**
 * "This chapter connects to": aggregates every verse's connections (both directions, filtered)
 * into target books and target chapters (deduped per verse, like the badges). Ranges count
 * once, at their first verse.
 */
export function summarizeChapter(
   verses: Array<Pick<ChapterVerse, 'outgoing' | 'incoming'>>,
   verseIndex: VerseIndex,
   kind: EdgeKindFilter,
   direction: DirectionMode,
   chapterLimit = 12,
): ChapterSummary {
   const books = new Map<number, BookTally>();
   const chapters = new Map<string, ChapterTally>();
   let total = 0;

   const count = (relatedId: number, edgeDirection: ConnectionDirection): void => {
      const ref = verseIndex[String(relatedId)];

      if (!ref) return;
      total += 1;
      const tally = books.get(ref.bookNumber) ?? { bookNumber: ref.bookNumber, count: 0, outgoing: 0, incoming: 0 };
      tally.count += 1;
      tally[edgeDirection] += 1;
      books.set(ref.bookNumber, tally);
      const chapterKey = `${ref.bookNumber}.${ref.chapterNumber}`;
      const chapterTally = chapters.get(chapterKey) ?? { bookNumber: ref.bookNumber, chapterNumber: ref.chapterNumber, count: 0 };
      chapterTally.count += 1;
      chapters.set(chapterKey, chapterTally);
   };

   for (const verse of verses) {
      uniqueEdges(verse, kind, direction).forEach((item) => count(item.verseId, item.direction));
   }

   return {
      total,
      books: sortTallies(Array.from(books.values())),
      chapters: Array.from(chapters.values())
         .sort((left, right) => right.count - left.count || left.bookNumber - right.bookNumber || left.chapterNumber - right.chapterNumber)
         .slice(0, chapterLimit),
      source: 'adjacency',
   };
}

/** Summary from the precomputed chapter matrix (outgoing only; no per-chapter breakdown). */
export function summaryFromMatrix(counts: BookCountMap): ChapterSummary {
   const books = sortTallies(Array.from(counts, ([ bookNumber, count ]) => ({ bookNumber, count, outgoing: count, incoming: 0 })));

   return { total: books.reduce((sum, item) => sum + item.count, 0), books, chapters: [], source: 'matrix' };
}

/** Top chapters of one target book, from the chapter tallies of a full (unsliced) summary. */
export function chaptersInBook(
   verses: Array<Pick<ChapterVerse, 'outgoing' | 'incoming'>>,
   verseIndex: VerseIndex,
   kind: EdgeKindFilter,
   direction: DirectionMode,
   bookNumber: number,
): ChapterTally[] {
   return summarizeChapter(verses, verseIndex, kind, direction, Number.POSITIVE_INFINITY)
      .chapters.filter((item) => item.bookNumber === bookNumber);
}

export interface ChapterPointer {
   bookNumber: number;
   chapterNumber: number;
}

/** Previous/next chapter across book boundaries; `null` before Genesis 1 / after Revelation 22. */
export function adjacentChapter(bookNumber: number, chapterNumber: number, delta: -1 | 1): ChapterPointer | null {
   const book = BOOKS[bookNumber - 1];

   if (!book) return null;

   const next = chapterNumber + delta;

   if (next >= 1 && next <= book.chapters) {
      return { bookNumber, chapterNumber: next };
   }

   const neighbour = BOOKS[bookNumber - 1 + delta];

   if (!neighbour) return null;

   return { bookNumber: neighbour.bookNumber, chapterNumber: delta === 1 ? 1 : neighbour.chapters };
}

const chapterIndexCache = new WeakMap<VerseIndex, Map<string, VerseRef[]>>();

/** Verses of one chapter from the verse index, in verse order (index built once per index object). */
export function chapterVerseRefs(verseIndex: VerseIndex, bookNumber: number, chapterNumber: number): VerseRef[] {
   let byChapter = chapterIndexCache.get(verseIndex);

   if (!byChapter) {
      byChapter = new Map();

      for (const ref of Object.values(verseIndex)) {
         const key = `${ref.bookNumber}.${ref.chapterNumber}`;
         const list = byChapter.get(key);

         if (list) list.push(ref);
         else byChapter.set(key, [ ref ]);
      }

      byChapter.forEach((list) => list.sort((left, right) => left.verseNumber - right.verseNumber));
      chapterIndexCache.set(verseIndex, byChapter);
   }

   return byChapter.get(`${bookNumber}.${chapterNumber}`) ?? [];
}

// =====================================================================================
// Loading
// =====================================================================================

export interface ChapterData {
   datasetId: string;
   book: Book;
   books: Book[];
   chapterNumber: number;
   verses: ChapterVerse[];
   verseIndex: VerseIndex;
   features: OptionalFeatures;
   /** BCP 47 code for the dataset's language (`lang` on scripture), when known. */
   lang?: string;
   /** True when the dataset has study-note references (the kind filter can offer them). */
   hasStudyNoteRefs: boolean;
   /** Precomputed degree (E-G), `null` when absent. */
   verseDegree: VerseDegreeFile | null;
   /** Raw chapter matrix file for the book (E-G), `null` when absent. */
   chapterMatrix: ChapterMatrixFile | null;
   /** Study-note text per verse (E-G), `null` when absent. */
   studyNotes: Map<number, string[]> | null;
}

const LANGUAGE_CODES: Record<string, string> = { english: 'en', italian: 'it', italiano: 'it', spanish: 'es', portuguese: 'pt', french: 'fr', german: 'de' };

/** Manifest language name ("English") → BCP 47 code ("en"); passes codes through. */
export function languageCode(language: string | undefined): string | undefined {
   if (!language) return undefined;
   const normalized = language.trim().toLowerCase();

   return /^[a-z]{2}(-[a-z0-9]+)?$/.test(normalized) ? normalized : LANGUAGE_CODES[normalized];
}

export function bookForNumber(books: Book[], bookNumber: number): Book | null {
   return books.find((book) => book.bookNumber === bookNumber) ?? books[bookNumber - 1] ?? null;
}

/**
 * Display cleanup for verse text: poetic lines in the source are joined without a space
 * ("foot,And a light"); restore the space after punctuation followed by a capital or a quote.
 */
export function displayVerseText(text: string): string {
   return text.replace(/([,;:.!?])(?=[\p{Lu}“‘«])/gu, '$1 ');
}

export function buildChapterVerses(
   refs: VerseRef[],
   text: VerseTextBook | null,
   source: SourceAdjacency,
   target: TargetAdjacency,
): ChapterVerse[] {
   return refs.map((ref) => {
      const id = String(ref.jwpubVerseId);

      return {
         ref,
         text: text?.[id]?.text ? displayVerseText(text[id].text) : null,
         outgoing: source[id]?.outgoing ?? [],
         incoming: target[id]?.incoming ?? [],
      };
   });
}

/** Loads everything Read mode needs for one chapter. Optional E-G files never cause a rejection. */
export async function loadChapterData(datasetId: string, bookNumber: number, chapterNumber: number): Promise<ChapterData> {
   const [ manifest, books, verseIndex ] = await Promise.all([
      loadManifest(datasetId),
      loadBooks(datasetId),
      loadVerseIndex(datasetId),
   ]);
   const book = bookForNumber(books, bookNumber);

   if (!book) {
      throw new Error(`Book ${bookNumber} is not in dataset ${datasetId}`);
   }

   const features = detectFeatures(manifest as DatasetManifest & { features?: unknown });
   const fileName = bookFileName(book);
   const [ text, source, target, degreeRaw, matrixRaw, notesRaw ] = await Promise.all([
      manifest.hasVerseText ? loadVerseTextBook(datasetId, book).catch(() => null) : Promise.resolve(null),
      loadSourceAdjacency(datasetId, book),
      loadTargetAdjacency(datasetId, book),
      features.verseDegree ? loadOptionalJson(datasetId, 'stats.verse-degree.json') : Promise.resolve(null),
      features.chapterMatrix ? loadOptionalJson(datasetId, `matrices/chapter/${fileName}`) : Promise.resolve(null),
      features.studyNotes ? loadOptionalJson(datasetId, `study-notes/${fileName}`) : Promise.resolve(null),
   ]);

   return {
      datasetId,
      book,
      books,
      chapterNumber,
      lang: languageCode(manifest.language),
      hasStudyNoteRefs: manifest.availableEdgeKinds.includes('study_note_reference'),
      verses: buildChapterVerses(chapterVerseRefs(verseIndex, bookNumber, chapterNumber), text, source, target),
      verseIndex,
      features,
      verseDegree: normalizeVerseDegree(degreeRaw),
      chapterMatrix: matrixRaw ?? null,
      studyNotes: notesRaw ? normalizeStudyNotes(notesRaw) : null,
   };
}

/**
 * Chapter summary for the current filters: the E-G matrix when it answers the question exactly
 * (outgoing only, kind present), otherwise aggregated from the adjacency.
 */
export function chapterSummary(data: ChapterData, kind: EdgeKindFilter, direction: DirectionMode): ChapterSummary {
   if (direction === 'outgoing' && data.chapterMatrix) {
      const counts = chapterMatrixCounts(data.chapterMatrix, data.chapterNumber, kind);

      if (counts) {
         return summaryFromMatrix(counts);
      }
   }

   return summarizeChapter(data.verses, data.verseIndex, kind, direction);
}

/** Loads verse text for arbitrary verses (grouped by book; per-book files are cached). */
export async function loadVerseTexts(datasetId: string, books: Book[], refs: Array<VerseRef | null>): Promise<Map<number, string>> {
   const byBook = new Map<number, VerseRef[]>();

   for (const ref of refs) {
      if (!ref) continue;
      byBook.set(ref.bookNumber, [ ...(byBook.get(ref.bookNumber) ?? []), ref ]);
   }

   const texts = new Map<number, string>();

   await Promise.all(
      Array.from(byBook, async ([ bookNumber, list ]) => {
         const book = bookForNumber(books, bookNumber);

         if (!book) return;

         const file = await loadVerseTextBook(datasetId, book).catch(() => null);

         for (const ref of list) {
            const text = file?.[String(ref.jwpubVerseId)]?.text;

            if (text) texts.set(ref.jwpubVerseId, displayVerseText(text));
         }
      }),
   );

   return texts;
}
