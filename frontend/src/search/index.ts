/**
 * Verse search (owner: E-A). Public entry point:
 *
 *    import { searchCitations, resultHref, useSearchData } from '../search';
 */
export { createBookMatcher, damerauLevenshtein } from './bookMatcher';
export type { BookCandidate, BookMatcher } from './bookMatcher';
export { normalizeQuery, parseQuery } from './parseQuery';
export type { ParsedQuery } from './parseQuery';
export { resultHref, searchCitations, SEARCH_LIMIT } from './search';
export type { BookResult, ChapterResult, SearchResult, VerseResult } from './search';
export {
   STATIC_SEARCH_DATA,
   findSearchBook,
   loadSearchData,
   loadVersePreview,
   verseCountOf,
   verseIdOf,
} from './searchData';
export type { SearchBook, SearchData, VersePreview } from './searchData';
export { bookDisplayName, useSearchData, useVersePreview } from './useSearchData';
