export type Testament = 'OT' | 'NT';
export type EdgeKindCode = 0 | 1 | 2;
export type EdgeKindFilter = 'combined' | 'crossrefs' | 'study-notes';
export type DirectionMode = 'outgoing' | 'incoming' | 'all';

export interface DatasetRegistryEntry {
   datasetId: string;
   publicationSymbol: string;
   publicationTitle: string;
   publicationYear?: number;
   language: string;
   hasVerseText: boolean;
}

export interface DatasetManifest {
   datasetId: string;
   publicationSymbol: string;
   publicationTitle: string;
   publicationYear?: number;
   language: string;
   generatedAt: string;
   schemaVersion: number;
   availableEdgeKinds: string[];
   hasVerseText: boolean;
   /** Optional file families present in this dataset. Absent on datasets generated before Sprint 2. */
   features?: DatasetFeature[];
}

export interface Book {
   bookNumber: number;
   name: string;
   shortName: string;
   slug: string;
   testament: Testament;
   chapters: number;
}

export interface ChapterVerse {
   jwpubVerseId: number;
   canonicalVerseId: number;
   verseNumber: number;
   label: string;
}

export interface Chapter {
   bookNumber: number;
   chapterNumber: number;
   label: string;
   firstVerseId: number;
   lastVerseId: number;
   verses: ChapterVerse[];
}

export interface BookCount {
   bookNumber: number;
   book: string;
   testament: Testament;
   count: number;
}

export interface VerseStat {
   verseId: number;
   label: string;
   bookNumber: number;
   chapterNumber: number;
   count: number;
}

export interface ChapterCount {
   bookNumber: number;
   chapterNumber: number;
   label: string;
   count: number;
}

export interface BookLinkStat {
   sourceBookNumber: number;
   sourceBook: string;
   targetBookNumber: number;
   targetBook: string;
   weight: number;
}

export interface StatsSummary {
   datasetId: string;
   publicationSymbol: string;
   publicationTitle: string;
   publicationYear?: number;
   generatedAt: string;
   totalCrossReferences: number;
   totalStudyNoteReferences: number;
   totalCombinedReferences: number;
   distinctSourceVerses: number;
   distinctTargetVerses: number;
   distinctBookToBookLinks: number;
   crossTestamentBreakdown: Record<string, number>;
   topOutgoingBooks: BookCount[];
   topIncomingBooks: BookCount[];
   topSourceVerses: VerseStat[];
   topReferencedVerses: VerseStat[];
   topDenseChapters: ChapterCount[];
   strongestBookLinks: BookLinkStat[];
   strongestOtToNtConnections: BookLinkStat[];
   strongestNtToOtConnections: BookLinkStat[];
   selfLinkStats: {
      crossReferences: number;
      studyNoteReferences: number;
      combined: number;
   };
   graphComparison: {
      crossReferenceOnlyBookLinks: number;
      studyNoteOnlyBookLinks: number;
      sharedBookLinks: number;
   };
   extraction: {
      mappedVerses: number;
      directCrossReferenceEdges: number;
      studyNoteReferenceEdges: number;
      notesWithBibleReferences: number;
      skippedRows: {
         directUnmapped: number;
         studyNoteUnmapped: number;
      };
   };
}

export interface VerseRef {
   jwpubVerseId: number;
   canonicalVerseId: number;
   bookNumber: number;
   chapterNumber: number;
   verseNumber: number;
   label: string;
}

export type VerseIndex = Record<string, VerseRef>;
export type BookMatrix = number[][];

export interface CompactEdges {
   source: number[];
   targetStart: number[];
   targetEnd: number[];
   kind: EdgeKindCode[];
   paragraphOrdinal: Array<number | null>;
   sortPosition: Array<number | null>;
   commentaryId: Array<number | null>;
   documentId: Array<number | null>;
}

export interface AdjacentEdge {
   source: number;
   targetStart: number;
   targetEnd: number;
   kind: EdgeKindCode;
   paragraphOrdinal?: number | null;
   sortPosition?: number | null;
   commentaryId?: number | null;
   documentId?: number | null;
}

export interface SourceAdjacencyBucket {
   outgoing: AdjacentEdge[];
}

export interface TargetAdjacencyBucket {
   incoming: AdjacentEdge[];
}

export type SourceAdjacency = Record<string, SourceAdjacencyBucket>;
export type TargetAdjacency = Record<string, TargetAdjacencyBucket>;

export interface VerseText {
   label: string;
   text: string;
}

export type VerseTextBook = Record<string, VerseText>;

// ---------------------------------------------------------------------------
// Sprint 2 (E-G) optional generated files. Feature-detect with `manifest.features`
// (or `hasDatasetFeature`) before loading; older datasets do not have them.
// ---------------------------------------------------------------------------

export type DatasetFeature =
   | 'search-index'
   | 'verse-degree'
   | 'chapter-matrices'
   | 'study-note-text'
   | 'footnote-text'
   | 'components';

/**
 * One chapter of a book in `search-index.json`: `[firstJwpubVerseId, firstVerseNumber, verseCount]`.
 * Verse `v` of the chapter has `jwpubVerseId = firstJwpubVerseId + (v - firstVerseNumber)` for
 * `firstVerseNumber <= v < firstVerseNumber + verseCount`. Index in `chapters` is `chapter - 1`.
 */
export type SearchChapter = [firstJwpubVerseId: number, firstVerseNumber: number, verseCount: number];

export interface SearchBook {
   bookNumber: number;
   slug: string;
   /** Localized name (dataset language). */
   name: string;
   shortName: string;
   testament: Testament;
   /** Display abbreviations/aliases (dataset language first, then English for non-English datasets). */
   aliases: string[];
   /**
    * Normalized lookup keys, unique across books. Normalize input the same way (`normalizeSearchKey`):
    * `s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')`
    */
   keys: string[];
   chapters: SearchChapter[];
}

export interface SearchIndex {
   schemaVersion: number;
   language: string;
   books: SearchBook[];
   /** Verses not covered by a chapter run: `[jwpubVerseId, bookNumber, chapter, verse]`. Normally empty. */
   irregularVerses: Array<[number, number, number, number]>;
}

/**
 * `stats.verse-degree.json`. Arrays are indexed directly by `jwpubVerseId` (`length` = max id + 1;
 * non-verse ids hold 0). `out*`: edges whose source is the verse. `in*`: edges whose cited range
 * contains the verse (same as the verse's entries in `adjacency/target`). `in`/`out` = cross
 * references (kind 0), `inStudy`/`outStudy` = study-note references (kind 1). Combined = sum.
 */
export interface VerseDegree {
   schemaVersion: number;
   index: 'jwpubVerseId';
   length: number;
   in: number[];
   out: number[];
   inStudy: number[];
   outStudy: number[];
}

/** `[otherBookNumber, crossrefs, studyNotes, combined]` */
export type ChapterBookCount = [bookNumber: number, crossrefs: number, studyNotes: number, combined: number];

/**
 * `matrices/chapter/<NN>.<slug>.json`. `outgoing[chapter - 1]`: counts by target book for edges whose
 * source verse is in the chapter. `incoming[chapter - 1]`: counts by source book for edges whose cited
 * range starts in the chapter. Each edge counts once (like `matrices/book.*.json`).
 */
export interface ChapterMatrix {
   bookNumber: number;
   chapters: number;
   outgoing: ChapterBookCount[][];
   incoming: ChapterBookCount[][];
}

/** Bible reference span: `[start, end, fromJwpubVerseId, toJwpubVerseId]`; UTF-16 offsets into `text`, end exclusive. */
export type NoteRefSpan = [start: number, end: number, fromJwpubVerseId: number, toJwpubVerseId: number];

export interface NoteParagraph {
   /** Paragraph ordinal; matches `paragraphOrdinal` on study-note edges. */
   pid?: number;
   /** Bold lead-in phrase of a study note, without the trailing colon. */
   lemma?: string;
   /** Plain text; `\n` marks line breaks. */
   text: string;
   refs?: NoteRefSpan[];
}

export interface StudyNote {
   /** Matches `commentaryId` on study_note_reference edges. */
   commentaryId: number;
   heading: string;
   paragraphs: NoteParagraph[];
}

/** `study-notes/<NN>.<slug>.json`: jwpubVerseId → study notes on that verse. */
export type StudyNotesBook = Record<string, StudyNote[]>;

export interface Footnote {
   footnoteId: number;
   paragraphs: NoteParagraph[];
}

/** `footnotes/<NN>.<slug>.json`: jwpubVerseId → translation footnotes on that verse. */
export type FootnotesBook = Record<string, Footnote[]>;

/**
 * `stats.components.json`: precomputed `buildRelationshipComponents` results per edge filter
 * (`RelationshipComponentsSummary` in `graph/relationshipComponents.ts`). Difference: `components`
 * omits single-verse blocks; `blockCount` and `isolatedVerses` still count them.
 */
export interface PrecomputedRelationshipComponents {
   totalVerses: number;
   totalEdges: number;
   blockCount: number;
   isolatedVerses: number;
   largestBlock: PrecomputedRelationshipComponent | null;
   components: PrecomputedRelationshipComponent[];
}

export interface PrecomputedRelationshipComponent {
   id: number;
   size: number;
   percent: number;
   edgeCount: number;
   sampleVerses: string[];
   topBooks: Array<{ bookNumber: number; name: string; count: number }>;
}

export type ComponentsStats = Record<EdgeKindFilter, PrecomputedRelationshipComponents>;

/** `/generated/compare/index.json`: edition pairs with reference-set diffs. */
export interface CompareIndex {
   schemaVersion: number;
   pairs: ComparePair[];
}

export interface ComparePair {
   /** Directory name: `<a>__<b>`. */
   id: string;
   a: string;
   b: string;
   /** Edge kind compared (cross references only). */
   kind: 'cross_reference';
   sharedReferences: number;
   onlyA: number;
   onlyB: number;
}

/**
 * `/generated/compare/<a>__<b>/<NN>.<slug>.json`: canonicalVerseId (source verse, `BBCCCVVV`) →
 * `[shared, onlyA, onlyB]`, where `shared` is a count and `onlyA`/`onlyB` list target canonical verse
 * ids (range starts) cited by only one edition. Verses with identical reference sets are omitted.
 */
export type CompareBook = Record<string, [shared: number, onlyA: number[], onlyB: number[]]>;
