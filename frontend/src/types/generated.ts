export type Testament = 'OT' | 'NT';
export type EdgeKindCode = 0 | 1 | 2;
export type EdgeKindFilter = 'combined' | 'crossrefs' | 'study-notes';
export type DirectionMode = 'outgoing' | 'incoming';

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
