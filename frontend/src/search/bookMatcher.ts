/**
 * Resolves a parsed book key to ranked book candidates using the EN + IT alias table, the
 * dataset's own names and (when present) the keys from `search-index.json`.
 *
 * Ranking (higher wins, ties by canonical order):
 *   100  exact name / abbreviation ("gv", "1cor", "giovanni")
 *    80  prefix of a name or abbreviation ("gio" → Giobbe, Gioele, Giona, Giosuè, Giovanni)
 *    60  numbered book by its stem when no number was typed ("cor" → 1 Cor, 2 Cor)
 *    50  prefix of a numbered book's stem ("giov" → 1/2/3 Giovanni, after Giovanni)
 *   ≤40  typo-tolerant match on full names ("genisis", "giovani", "rivelazone")
 * Names in the dataset language get a small bonus.
 */
import { BOOK_ALIASES, normalizeBookKey, type AliasLanguage } from '../data/bookAliases';
import type { ParsedQuery } from './parseQuery';
import type { SearchBook, SearchData } from './searchData';

interface KeyEntry {
   key: string;
   /** Key without the leading book number ("1cor" → "cor"). */
   stem: string;
   numbered: boolean;
   /** Full book name (eligible for fuzzy matching). */
   fullName: boolean;
   language?: AliasLanguage;
}

export interface BookCandidate {
   book: SearchBook;
   score: number;
   /** Exact key hit. */
   exact: boolean;
}

export interface BookMatcher {
   match(parsed: Pick<ParsedQuery, 'bookKey' | 'stemKey' | 'prefix'>, limit?: number): BookCandidate[];
}

const EXACT = 100;
const PREFIX = 80;
const STEM = 60;
const STEM_PREFIX = 50;
const FUZZY = 40;
const LANGUAGE_BONUS = 3;

function stemOf(key: string): { stem: string; numbered: boolean } {
   const match = /^([123])([a-z].*)$/.exec(key);

   return match ? { stem: match[2], numbered: true } : { stem: key, numbered: false };
}

export function createBookMatcher(data: SearchData): BookMatcher {
   const entries = new Map<number, KeyEntry[]>();

   const add = (bookNumber: number, value: string, fullName: boolean, language?: AliasLanguage): void => {
      const key = normalizeBookKey(value);

      if (!key) {
         return;
      }

      const list = entries.get(bookNumber) ?? [];
      const existing = list.find((entry) => entry.key === key);

      if (existing) {
         existing.fullName ||= fullName;
         existing.language ??= language;
         entries.set(bookNumber, list);
         return;
      }

      list.push({ key, ...stemOf(key), fullName, language });
      entries.set(bookNumber, list);
   };

   for (const book of data.books) {
      add(book.bookNumber, book.name, true, data.language);
      if (book.shortName) add(book.bookNumber, book.shortName, false, data.language);
      add(book.bookNumber, book.slug, true, 'en');
      book.aliases?.forEach((alias) => add(book.bookNumber, alias, false, data.language));
      book.keys?.forEach((key) => add(book.bookNumber, key, false));
   }

   for (const alias of BOOK_ALIASES) {
      if (!data.books.some((book) => book.bookNumber === alias.bookNumber)) {
         continue;
      }

      alias.en.forEach((value, index) => add(alias.bookNumber, value, index === 0 || value.length > 6, 'en'));
      alias.it.forEach((value, index) => add(alias.bookNumber, value, index === 0 || value.length > 6, 'it'));
   }

   const books = [ ...data.books ].sort((a, b) => a.bookNumber - b.bookNumber);

   return {
      match(parsed, limit = 8) {
         const { bookKey, stemKey, prefix } = parsed;
         const candidates: BookCandidate[] = [];

         for (const book of books) {
            let best = 0;
            let exact = false;

            for (const entry of entries.get(book.bookNumber) ?? []) {
               const bonus = entry.language && entry.language === data.language ? LANGUAGE_BONUS : 0;
               let score = 0;

               if (entry.key === bookKey) {
                  score = EXACT + bonus;
                  exact = true;
               } else if (entry.key.startsWith(bookKey)) {
                  // Shorter completions first: "gio" ranks Giona above Giovanni.
                  score = PREFIX + bonus - Math.min(10, (entry.key.length - bookKey.length) * 0.5);
               } else if (!prefix && entry.numbered && entry.stem === stemKey) {
                  score = STEM + bonus;
               } else if (!prefix && entry.numbered && entry.stem.startsWith(stemKey) && stemKey.length >= 2) {
                  score = STEM_PREFIX + bonus - Math.min(10, (entry.stem.length - stemKey.length) * 0.5);
               } else if (entry.fullName && bookKey.length >= 4) {
                  score = fuzzyScore(bookKey, entry.key);

                  if (score > 0) {
                     score += bonus;
                  }
               }

               best = Math.max(best, score);
            }

            if (best > 0) {
               candidates.push({ book, score: best, exact });
            }
         }

         return candidates
            .sort((a, b) => b.score - a.score || a.book.bookNumber - b.book.bookNumber)
            .slice(0, limit);
      },
   };
}

/**
 * Typo tolerance on full names: compares the query with the whole key and with the key's
 * prefix of the same length (so "genisi" matches "genesis" while still typing).
 */
function fuzzyScore(query: string, key: string): number {
   const allowed = query.length >= 7 ? 2 : 1;
   const whole = damerauLevenshtein(query, key, allowed);
   const partial = key.length > query.length ? damerauLevenshtein(query, key.slice(0, query.length), allowed) : Infinity;
   const distance = Math.min(whole, partial);

   if (distance > allowed) {
      return 0;
   }

   return FUZZY - distance * 8 - (whole <= allowed ? 0 : 4);
}

/** Optimal-string-alignment distance; returns `max + 1` early when it exceeds `max`. */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
   if (Math.abs(a.length - b.length) > max) {
      return max + 1;
   }

   const rows = a.length + 1;
   const cols = b.length + 1;
   const d: number[][] = Array.from({ length: rows }, (_, i) => {
      const row = new Array<number>(cols).fill(0);
      row[0] = i;
      return row;
   });

   for (let j = 0; j < cols; j += 1) {
      d[0][j] = j;
   }

   for (let i = 1; i < rows; i += 1) {
      let rowMin = Infinity;

      for (let j = 1; j < cols; j += 1) {
         const cost = a[i - 1] === b[j - 1] ? 0 : 1;
         let value = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);

         if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            value = Math.min(value, d[i - 2][j - 2] + 1);
         }

         d[i][j] = value;
         rowMin = Math.min(rowMin, value);
      }

      if (rowMin > max) {
         return max + 1;
      }
   }

   return d[a.length][b.length];
}
