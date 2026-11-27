/**
 * Study-note text behind `study_note_reference` edges (optional E-G file, feature
 * `study-note-text`). A note is matched to an edge by `commentaryId`; the panel then shows the
 * sentences around the citation, which is the reason the verse is connected.
 */
import { loadStudyNotes } from '../../data/generated';
import type { AdjacentEdge, NoteParagraph, NoteRefSpan, StudyNote, StudyNotesBook } from '../../types/generated';

export type NoteEdge = Pick<AdjacentEdge, 'kind' | 'source' | 'targetStart' | 'targetEnd' | 'commentaryId' | 'paragraphOrdinal'>;

export interface NoteSegment {
   text: string;
   /** Set when the segment is a Bible reference inside the note. */
   ref?: { from: number; to: number; /** The reference this edge stands for. */ cited: boolean };
}

export interface NoteExcerpt {
   commentaryId: number;
   /** Bold lead-in phrase of the note ("loved"), when it has one. */
   lemma: string | null;
   segments: NoteSegment[];
   /** The excerpt starts / ends inside the paragraph. */
   clippedStart: boolean;
   clippedEnd: boolean;
}

function spanMatches(span: NoteRefSpan, edge: NoteEdge): boolean {
   return span[2] === edge.targetStart && span[3] === edge.targetEnd;
}

function spanCovers(span: NoteRefSpan, edge: NoteEdge): boolean {
   return span[2] <= edge.targetStart && span[3] >= edge.targetEnd;
}

function citedSpan(paragraph: NoteParagraph, edge: NoteEdge): NoteRefSpan | undefined {
   const refs = paragraph.refs ?? [];

   return refs.find((span) => spanMatches(span, edge)) ?? refs.find((span) => spanCovers(span, edge));
}

/** The note and paragraph an edge comes from, or `null`. Cross references never have one. */
export function findStudyNote(
   book: StudyNotesBook | null | undefined,
   edge: NoteEdge,
): { note: StudyNote; paragraph: NoteParagraph } | null {
   if (!book || edge.kind !== 1) {
      return null;
   }

   const notes = book[String(edge.source)];

   if (!Array.isArray(notes) || notes.length === 0) {
      return null;
   }

   // `!= null`, not truthiness: commentary id 0 is a valid id.
   const note =
      edge.commentaryId != null ? notes.find((candidate) => candidate.commentaryId === edge.commentaryId) : notes.length === 1 ? notes[0] : undefined;

   if (!note || !Array.isArray(note.paragraphs) || note.paragraphs.length === 0) {
      return null;
   }

   const paragraph =
      note.paragraphs.find((candidate) => citedSpan(candidate, edge) !== undefined) ??
      (edge.paragraphOrdinal != null ? note.paragraphs.find((candidate) => candidate.pid === edge.paragraphOrdinal) : undefined) ??
      note.paragraphs[0];

   return { note, paragraph };
}

const SENTENCE_BREAK = /[.!?…]["”’»)\]]*\s+/g;

/** Offsets right after each sentence break of `text` inside `[from, to)`. */
function sentenceStarts(text: string, from: number, to: number): number[] {
   const starts: number[] = [];

   SENTENCE_BREAK.lastIndex = from;

   for (let match = SENTENCE_BREAK.exec(text); match !== null && match.index + match[0].length <= to; match = SENTENCE_BREAK.exec(text)) {
      starts.push(match.index + match[0].length);
   }

   return starts;
}

function snapToWord(text: string, index: number, direction: 1 | -1): number {
   let position = Math.max(0, Math.min(text.length, index));

   while (position > 0 && position < text.length && !/\s/.test(text[position])) {
      position += direction;
   }

   return position;
}

/**
 * The part of a study note that explains an edge: the sentence leading up to the citation and
 * the one after it (citations usually sit in parentheses after the point they support). Falls
 * back to the opening of the paragraph when the citation cannot be located.
 */
export function studyNoteExcerpt(book: StudyNotesBook | null | undefined, edge: NoteEdge, radius = 280): NoteExcerpt | null {
   const found = findStudyNote(book, edge);

   if (!found || typeof found.paragraph.text !== 'string' || found.paragraph.text.trim() === '') {
      return null;
   }

   const { note, paragraph } = found;
   const text = paragraph.text;
   const span = citedSpan(paragraph, edge);
   let start = 0;
   let end = text.length;

   if (span) {
      const low = Math.max(0, span[0] - radius);
      const before = sentenceStarts(text, low, span[0]);

      // Two sentence starts back: the one right before a "(Joh 1:29)" only opens the parenthesis.
      start = before.length >= 2 ? before[before.length - 2] : low === 0 ? 0 : (before[0] ?? snapToWord(text, low, 1));

      const high = Math.min(text.length, span[1] + radius);
      const after = sentenceStarts(text, span[1], high);

      end = after.length >= 2 ? after[1] : high === text.length ? text.length : (after[0] ?? snapToWord(text, high, -1));
   } else if (text.length > radius * 1.5) {
      const high = Math.round(radius * 1.5);
      const after = sentenceStarts(text, Math.round(radius * 0.75), high);

      end = after[after.length - 1] ?? snapToWord(text, high, -1);
   }

   const segments: NoteSegment[] = [];
   const refs = (paragraph.refs ?? [])
      .filter((ref) => ref[0] >= start && ref[1] <= end && ref[1] > ref[0])
      .sort((left, right) => left[0] - right[0]);
   let cursor = start;

   for (const ref of refs) {
      if (ref[0] < cursor) {
         continue;
      }

      if (ref[0] > cursor) {
         segments.push({ text: text.slice(cursor, ref[0]) });
      }

      segments.push({ text: text.slice(ref[0], ref[1]), ref: { from: ref[2], to: ref[3], cited: ref === span } });
      cursor = ref[1];
   }

   if (cursor < end) {
      segments.push({ text: text.slice(cursor, end) });
   }

   if (segments.length > 0) {
      segments[0] = { ...segments[0], text: segments[0].text.trimStart() };

      const last = segments.length - 1;

      segments[last] = { ...segments[last], text: segments[last].text.trimEnd() };
   }

   return {
      commentaryId: note.commentaryId,
      lemma: paragraph.lemma?.trim() || null,
      segments: segments.filter((segment) => segment.text !== ''),
      clippedStart: start > 0,
      clippedEnd: end < text.length,
   };
}

/** One book's notes; `null` when the dataset has no note text or the file cannot be read (the feature is optional). */
export function loadStudyNoteBook(datasetId: string, bookNumber: number): Promise<StudyNotesBook | null> {
   return loadStudyNotes(datasetId, bookNumber).catch(() => null);
}
