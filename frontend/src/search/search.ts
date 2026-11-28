/**
 * Global verse search: query text → up to 8 ranked results (verse, chapter or book).
 *
 *   "Gv 3:16"   → verse  John 3:16         (verseHref → Study)
 *   "Sal 23"    → chapter Psalms 23        (chapterHref → Read)
 *   "Jude 5"    → verse  Jude 1:5          (one-chapter books take the number as a verse)
 *   "rom"       → book   Romans            (bookHref → book profile)
 *   "gi"        → every book starting with "gi" (Giobbe, Gioele, Giona, Giosuè, Giovanni, …)
 */
import { targetFromText } from '../routing/inboundLinks';
import { bookHref, chapterHref, verseHref, type RouteParams } from '../routing/routes';
import { createBookMatcher, type BookMatcher } from './bookMatcher';
import { parseQuery, type ParsedQuery } from './parseQuery';
import { findSearchBook, MAX_VERSE_FALLBACK, verseCountOf, type SearchBook, type SearchData } from './searchData';

interface ResultBase {
   /** Stable key for lists. */
   id: string;
   bookNumber: number;
   /** Book name in the dataset language. */
   bookName: string;
   /** "John 3:16", "Psalms 23", "Romans". */
   label: string;
   score: number;
}

export interface VerseResult extends ResultBase {
   kind: 'verse';
   chapter: number;
   verse: number;
   /** End of a typed range ("13:4-7"), informational. */
   verseEnd?: number;
}

export interface ChapterResult extends ResultBase {
   kind: 'chapter';
   chapter: number;
   /** Verse count when known. */
   verses?: number;
}

export interface BookResult extends ResultBase {
   kind: 'book';
   chapters: number;
}

export type SearchResult = VerseResult | ChapterResult | BookResult;

export interface SearchOptions {
   /** Max results (default 8). */
   limit?: number;
}

export const SEARCH_LIMIT = 8;
/** Scores at or below this are typo-tolerant matches (see bookMatcher). */
const FUZZY_CEILING = 45;

const matcherCache = new WeakMap<SearchData, BookMatcher>();

function matcherFor(data: SearchData): BookMatcher {
   let matcher = matcherCache.get(data);

   if (!matcher) {
      matcher = createBookMatcher(data);
      matcherCache.set(data, matcher);
   }

   return matcher;
}

export function verseResult(book: SearchBook, chapter: number, verse: number, score: number, verseEnd?: number): VerseResult {
   return {
      kind: 'verse',
      id: `v:${book.bookNumber}.${chapter}.${verse}`,
      bookNumber: book.bookNumber,
      bookName: book.name,
      label: `${book.name} ${chapter}:${verse}${verseEnd ? `-${verseEnd}` : ''}`,
      chapter,
      verse,
      ...(verseEnd ? { verseEnd } : {}),
      score,
   };
}

export function chapterResult(book: SearchBook, chapter: number, score: number): ChapterResult {
   const verses = verseCountOf(book, chapter);

   return {
      kind: 'chapter',
      id: `c:${book.bookNumber}.${chapter}`,
      bookNumber: book.bookNumber,
      bookName: book.name,
      label: `${book.name} ${chapter}`,
      chapter,
      ...(verses ? { verses } : {}),
      score,
   };
}

export function bookResult(book: SearchBook, score: number): BookResult {
   return {
      kind: 'book',
      id: `b:${book.bookNumber}`,
      bookNumber: book.bookNumber,
      bookName: book.name,
      label: book.name,
      chapters: book.chapters,
      score,
   };
}

function verseExists(book: SearchBook, chapter: number, verse: number): boolean {
   if (chapter < 1 || chapter > book.chapters) {
      return false;
   }

   return verse >= 1 && verse <= (verseCountOf(book, chapter) ?? MAX_VERSE_FALLBACK);
}

/** Primary results for one candidate book. */
function resultsForBook(book: SearchBook, parsed: ParsedQuery, score: number): SearchResult[] {
   const { chapter, verse, verseEnd } = parsed;

   if (chapter === undefined) {
      return [ bookResult(book, score) ];
   }

   if (verse !== undefined) {
      if (verseExists(book, chapter, verse)) {
         return [ verseResult(book, chapter, verse, score, verseEnd) ];
      }

      // "Jude 1 5" style typed for a one-chapter book is handled above; anything else is out of range.
      return [];
   }

   if (book.chapters === 1) {
      // One-chapter books: "Jude 5" means verse 5; "Jude 1" also offers the chapter.
      const results: SearchResult[] = [];

      if (verseExists(book, 1, chapter)) {
         results.push(verseResult(book, 1, chapter, score));
      }

      if (chapter === 1) {
         results.push(chapterResult(book, 1, score - 1));
      }

      return results;
   }

   return chapter <= book.chapters ? [ chapterResult(book, chapter, score) ] : [];
}

/** Secondary suggestions for the best candidate, so the next step is one arrow key away. */
function followUps(book: SearchBook, parsed: ParsedQuery, score: number): SearchResult[] {
   const { chapter, verse } = parsed;

   if (chapter === undefined) {
      return [ chapterResult(book, 1, score - 2) ];
   }

   if (verse !== undefined && book.chapters > 1 && chapter <= book.chapters) {
      return [ chapterResult(book, chapter, score - 2) ];
   }

   if (verse === undefined && book.chapters > 1 && chapter <= book.chapters) {
      return [ verseResult(book, chapter, 1, score - 2) ];
   }

   return [];
}

/** Runs the search. Pure and synchronous; cheap enough to call on every keystroke. */
export function searchCitations(query: string, data: SearchData, options: SearchOptions = {}): SearchResult[] {
   const limit = options.limit ?? SEARCH_LIMIT;
   // A pasted JW Library / jw.org link resolves straight to its verse or chapter.
   const linked = targetFromText(query);

   if (linked) {
      const book = findSearchBook(data, linked.book);

      if (!book) return [];

      return [ linked.kind === 'verse' ? verseResult(book, linked.chapter, linked.verse, 1, linked.endVerse) : chapterResult(book, linked.chapter, 1) ];
   }

   const parsed = parseQuery(query);

   if (!parsed) {
      return [];
   }

   const matched = matcherFor(data).match(parsed, 12);
   // When a name matched exactly, typo-tolerant guesses are noise ("Jude 2:1" must not become Judges 2:1).
   const candidates = matched[0]?.exact ? matched.filter((candidate) => candidate.score > FUZZY_CEILING) : matched;
   const results: SearchResult[] = [];
   const seen = new Set<string>();
   const push = (result: SearchResult): void => {
      if (!seen.has(result.id)) {
         seen.add(result.id);
         results.push(result);
      }
   };

   candidates.forEach((candidate) => resultsForBook(candidate.book, parsed, candidate.score).forEach(push));

   // An out-of-range chapter/verse ("Ps 151") still offers the book itself.
   if (results.length === 0 && candidates[0] && parsed.chapter !== undefined) {
      push(bookResult(candidates[0].book, candidates[0].score));
   }

   const best = candidates[0];

   if (best) {
      const followUp = followUps(best.book, parsed, best.score);
      // Insert follow-ups right after the best book's own results.
      const insertAt = results.filter((result) => result.bookNumber === best.book.bookNumber).length;
      const extra = followUp.filter((result) => !seen.has(result.id));

      extra.forEach((result) => seen.add(result.id));
      results.splice(insertAt, 0, ...extra);
   }

   return results.slice(0, limit);
}

/** Destination of a result: verse → Study, chapter → Read, book → book profile. */
export function resultHref(result: SearchResult, params?: RouteParams): string {
   switch (result.kind) {
      case 'verse':
         return verseHref({ bookNumber: result.bookNumber, chapterNumber: result.chapter, verseNumber: result.verse }, params);
      case 'chapter':
         return chapterHref({ bookNumber: result.bookNumber, chapterNumber: result.chapter }, params);
      case 'book':
         return bookHref(result.bookNumber, params);
   }
}
