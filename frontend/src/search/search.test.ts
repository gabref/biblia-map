import { describe, expect, it } from 'vitest';

import { BOOK_ALIASES, normalizeBookKey } from '../data/bookAliases';
import type { Book } from '../types/generated';
import { damerauLevenshtein } from './bookMatcher';
import { parseQuery } from './parseQuery';
import { resultHref, searchCitations, type SearchResult } from './search';
import { STATIC_SEARCH_DATA, type SearchData } from './searchData';

const datasetBooks = import.meta.glob<Book[]>('../../public/generated/*/books.json', { eager: true, import: 'default' });

function dataFor(datasetId: string, language: 'en' | 'it'): SearchData {
   const books = datasetBooks[`../../public/generated/${datasetId}/books.json`];

   return {
      datasetId,
      language,
      source: 'books',
      books: books.map((book) => ({ bookNumber: book.bookNumber, slug: book.slug, name: book.name, shortName: book.shortName, chapters: book.chapters })),
   };
}

const EN = dataFor('nwtsty', 'en');
const IT = dataFor('nwtsty-i', 'it');

function top(query: string, data: SearchData = EN): SearchResult | undefined {
   return searchCitations(query, data)[0];
}

function topRef(query: string, data: SearchData = EN): string | null {
   const result = top(query, data);

   if (!result) return null;

   switch (result.kind) {
      case 'verse':
         return `${result.kind} ${result.bookNumber} ${result.chapter}:${result.verse}`;
      case 'chapter':
         return `${result.kind} ${result.bookNumber} ${result.chapter}`;
      case 'book':
         return `${result.kind} ${result.bookNumber}`;
   }
}

describe('parseQuery', () => {
   it.each([
      [ 'Gv 3:16', { bookKey: 'gv', chapter: 3, verse: 16 } ],
      [ 'giovanni 3 16', { bookKey: 'giovanni', chapter: 3, verse: 16 } ],
      [ '1 Cor 13', { bookKey: '1cor', stemKey: 'cor', prefix: 1, chapter: 13 } ],
      [ '1cor13:4-7', { bookKey: '1cor', chapter: 13, verse: 4, verseEnd: 7 } ],
      [ 'rom 1 12', { bookKey: 'rom', chapter: 1, verse: 12 } ],
      [ 'Sal 23', { bookKey: 'sal', chapter: 23 } ],
      [ 'ps23', { bookKey: 'ps', chapter: 23 } ],
      [ 'Rivelazione 21:4', { bookKey: 'rivelazione', chapter: 21, verse: 4 } ],
      [ 'Gen. 1.1', { bookKey: 'gen', chapter: 1, verse: 1 } ],
      [ 'Gv 3,16', { bookKey: 'gv', chapter: 3, verse: 16 } ],
      [ 'II Re 2:11', { bookKey: '2re', prefix: 2, chapter: 2, verse: 11 } ],
      [ 'primo Samuele 17', { bookKey: '1samuele', chapter: 17 } ],
      [ 'Song of Solomon 2:1', { bookKey: 'songofsolomon', chapter: 2, verse: 1 } ],
      [ 'Giosuè 1:9', { bookKey: 'giosue', chapter: 1, verse: 9 } ],
      [ '  JOHN   3 : 16 ', { bookKey: 'john', chapter: 3, verse: 16 } ],
      [ 'gv 3:', { bookKey: 'gv', chapter: 3 } ],
      [ 'Isa 53:5–7', { bookKey: 'isa', chapter: 53, verse: 5, verseEnd: 7 } ],
      [ 'is 53', { bookKey: 'is', chapter: 53 } ],
   ])('parses %j', (query, expected) => {
      expect(parseQuery(query)).toMatchObject(expected);
   });

   it.each([ '', '   ', '3:16', '123', '!!', ':' ])('rejects %j', (query) => {
      expect(parseQuery(query)).toBeNull();
   });
});

describe('searchCitations — English and Italian citations', () => {
   it.each([
      // Italian
      [ 'Gv 3:16', 'verse 43 3:16' ],
      [ 'giovanni 3 16', 'verse 43 3:16' ],
      [ 'Giovanni 3:16', 'verse 43 3:16' ],
      [ 'Sal 23', 'chapter 19 23' ],
      [ 'Salmo 23:1', 'verse 19 23:1' ],
      [ 'Rivelazione 21:4', 'verse 66 21:4' ],
      [ 'Riv 21:4', 'verse 66 21:4' ],
      [ 'Ap 21:4', 'verse 66 21:4' ],
      [ 'Apocalisse 1', 'chapter 66 1' ],
      [ 'Gn 1:1', 'verse 1 1:1' ],
      [ 'Genesi 1', 'chapter 1 1' ],
      [ 'Eso 20:3', 'verse 2 20:3' ],
      [ 'Es 3:14', 'verse 2 3:14' ],
      [ 'Mt 24:14', 'verse 40 24:14' ],
      [ 'Matteo 6:9', 'verse 40 6:9' ],
      [ 'Mr 1:1', 'verse 41 1:1' ],
      [ 'Mc 1:1', 'verse 41 1:1' ],
      [ 'Lc 2:1', 'verse 42 2:1' ],
      [ 'At 2:4', 'verse 44 2:4' ],
      [ 'Atti 1:8', 'verse 44 1:8' ],
      [ 'Romani 8:28', 'verse 45 8:28' ],
      [ '1 Corinti 13:4', 'verse 46 13:4' ],
      [ '2 Cor 5:17', 'verse 47 5:17' ],
      [ 'Ef 6:11', 'verse 49 6:11' ],
      [ 'Flp 4:13', 'verse 50 4:13' ],
      [ 'Fil 4:6', 'verse 50 4:6' ],
      [ 'Col 3:14', 'verse 51 3:14' ],
      [ '1 Tes 5:17', 'verse 52 5:17' ],
      [ '2 Tim 3:16', 'verse 55 3:16' ],
      [ 'Ebr 11:1', 'verse 58 11:1' ],
      [ 'Gc 1:5', 'verse 59 1:5' ],
      [ '1 Piet 5:7', 'verse 60 5:7' ],
      [ '1 Gv 4:8', 'verse 62 4:8' ],
      [ 'Gd 3', 'verse 65 1:3' ],
      [ 'Giuda 3', 'verse 65 1:3' ],
      [ 'Gb 1:1', 'verse 18 1:1' ],
      [ 'Giobbe 38', 'chapter 18 38' ],
      [ 'Prov 3:5', 'verse 20 3:5' ],
      [ 'Ec 12:13', 'verse 21 12:13' ],
      [ 'Qo 1:2', 'verse 21 1:2' ],
      [ 'Ct 2:1', 'verse 22 2:1' ],
      [ 'Isaia 53', 'chapter 23 53' ],
      [ 'Ger 29:11', 'verse 24 29:11' ],
      [ 'Ez 37:1', 'verse 26 37:1' ],
      [ 'Daniele 2:44', 'verse 27 2:44' ],
      [ 'Os 6:6', 'verse 28 6:6' ],
      [ 'Gioele 2:28', 'verse 29 2:28' ],
      [ 'Abd 1', 'verse 31 1:1' ],
      [ 'Giona 1:3', 'verse 32 1:3' ],
      [ 'Gio 1:3', 'verse 32 1:3' ],
      [ 'Sof 3:9', 'verse 36 3:9' ],
      [ 'Zac 4:6', 'verse 38 4:6' ],
      [ 'Mal 3:10', 'verse 39 3:10' ],
      [ '1 Re 18:21', 'verse 11 18:21' ],
      [ 'II Re 2:11', 'verse 12 2:11' ],
      [ '1 Cron 29:11', 'verse 13 29:11' ],
      [ 'Neemia 8:10', 'verse 16 8:10' ],
      [ 'Gs 1:9', 'verse 6 1:9' ],
      [ 'Giosuè 24:15', 'verse 6 24:15' ],
      [ 'giosue 24:15', 'verse 6 24:15' ],
      [ 'Gdc 6:12', 'verse 7 6:12' ],
      [ 'Fm 1', 'verse 57 1:1' ],
      // English
      [ 'John 3:16', 'verse 43 3:16' ],
      [ 'jn 3 16', 'verse 43 3:16' ],
      [ 'Joh 3:16', 'verse 43 3:16' ],
      [ '1 Cor 13', 'chapter 46 13' ],
      [ '1cor 13:4', 'verse 46 13:4' ],
      [ '1Co 13', 'chapter 46 13' ],
      [ 'I Corinthians 13', 'chapter 46 13' ],
      [ 'rom 1 12', 'verse 45 1:12' ],
      [ 'Ps 23', 'chapter 19 23' ],
      [ 'ps23', 'chapter 19 23' ],
      [ 'Psalm 119:105', 'verse 19 119:105' ],
      [ 'Gen 1:1', 'verse 1 1:1' ],
      [ 'Ge 3:15', 'verse 1 3:15' ],
      [ 'Ex 3:14', 'verse 2 3:14' ],
      [ 'Exo 20', 'chapter 2 20' ],
      [ 'Lev 19:18', 'verse 3 19:18' ],
      [ 'Deut 6:4', 'verse 5 6:4' ],
      [ 'Isa 53', 'chapter 23 53' ],
      [ 'Matt 24:14', 'verse 40 24:14' ],
      [ 'Mk 1:1', 'verse 41 1:1' ],
      [ 'Lk 2:1', 'verse 42 2:1' ],
      [ 'Rev 21:4', 'verse 66 21:4' ],
      [ 'Re 21:4', 'verse 66 21:4' ],
      [ 'Revelation 21:4', 'verse 66 21:4' ],
      [ 'Jude 5', 'verse 65 1:5' ],
      [ 'Phil 4:13', 'verse 50 4:13' ],
      [ 'Phm 1', 'verse 57 1:1' ],
      [ '1 Jn 4:8', 'verse 62 4:8' ],
      [ '3 John 4', 'verse 64 1:4' ],
      [ 'Song of Solomon 2:1', 'verse 22 2:1' ],
      [ 'Eccl 12:13', 'verse 21 12:13' ],
      [ 'Heb 11:1', 'verse 58 11:1' ],
      [ 'Jas 1:5', 'verse 59 1:5' ],
      [ 'Zeph 3:9', 'verse 36 3:9' ],
      [ 'Hab 2:4', 'verse 35 2:4' ],
      [ 'Obad 1', 'verse 31 1:1' ],
      // Book only
      [ 'Romans', 'book 45' ],
      [ 'rom', 'book 45' ],
      [ 'Salmi', 'book 19' ],
      [ 'genesis', 'book 1' ],
   ])('%s → %s (on EN and IT datasets)', (query, expected) => {
      expect(topRef(query, EN)).toBe(expected);
      expect(topRef(query, IT)).toBe(expected);
   });

   it('Italian queries also work on English datasets and vice versa', () => {
      expect(topRef('Gv 3:16', EN)).toBe('verse 43 3:16');
      expect(topRef('Rivelazione 21:4', EN)).toBe('verse 66 21:4');
      expect(topRef('John 3:16', IT)).toBe('verse 43 3:16');
      expect(topRef('Rev 21:4', IT)).toBe('verse 66 21:4');
   });

   it('uses the dataset language for labels', () => {
      expect(top('Gv 3:16', IT)?.label).toBe('Giovanni 3:16');
      expect(top('Gv 3:16', EN)?.label).toBe('John 3:16');
      expect(top('Sal 23', IT)?.label).toBe('Salmi 23');
   });

   it('lists every book for an ambiguous prefix ("Gi" → Giovanni, Giona, Giosuè, …)', () => {
      const books = searchCitations('Gi', IT, { limit: 20 }).filter((result) => result.kind === 'book').map((result) => result.bookNumber);

      for (const bookNumber of [ 6, 7, 18, 29, 32, 43, 59, 65 ]) {
         expect(books).toContain(bookNumber);
      }
   });

   it('suggests the numbered books for a stem ("cor 13" → 1 and 2 Corinthians)', () => {
      const results = searchCitations('cor 13', EN).map((result) => result.bookNumber);

      expect(results).toContain(46);
      expect(results).toContain(47);
   });

   it('ranks the plain book above numbered ones ("giovanni 3:16" → John first, 1 John later)', () => {
      const results = searchCitations('giovanni 3:16', IT);

      expect(results[0]).toMatchObject({ kind: 'verse', bookNumber: 43 });
      expect(results.some((result) => result.bookNumber === 62)).toBe(true);
   });

   it('offers the chapter right after the verse, and the first verse after a chapter', () => {
      expect(searchCitations('John 3:16', EN).slice(0, 2).map((result) => result.id)).toEqual([ 'v:43.3.16', 'c:43.3' ]);
      expect(searchCitations('Ps 23', EN).slice(0, 2).map((result) => result.id)).toEqual([ 'c:19.23', 'v:19.23.1' ]);
      expect(searchCitations('Romans', EN).slice(0, 2).map((result) => result.id)).toEqual([ 'b:45', 'c:45.1' ]);
   });

   it('tolerates typos in full names', () => {
      expect(topRef('genisis 1:1')).toBe('verse 1 1:1');
      expect(topRef('giovani 3:16', IT)).toBe('verse 43 3:16');
      expect(topRef('rivelazone 21:4', IT)).toBe('verse 66 21:4');
      expect(topRef('revelaton 21:4')).toBe('verse 66 21:4');
      expect(topRef('Psalsm 23')).toBe('chapter 19 23');
   });

   it('falls back to the book when the chapter is out of range', () => {
      expect(topRef('Ps 151')).toBe('book 19');
      expect(topRef('Jude 2:1')).toBe('book 65');
   });

   it('validates verse numbers with search-index verse counts', () => {
      const indexed: SearchData = {
         ...EN,
         source: 'search-index',
         books: EN.books.map((book) => (book.bookNumber === 43 ? { ...book, chapterRuns: Array.from({ length: 21 }, (_, i) => [ 26000 + i * 40, 1, i === 2 ? 36 : 30 ] as const) } : book)),
      };

      expect(topRef('John 3:36', indexed)).toBe('verse 43 3:36');
      expect(topRef('John 3:37', indexed)).toBe('chapter 43 3');
      expect(searchCitations('John 3', indexed)[0]).toMatchObject({ kind: 'chapter', verses: 36 });
   });

   it('caps results at 8 and returns nothing for non-citations', () => {
      expect(searchCitations('j', EN).length).toBeLessThanOrEqual(8);
      expect(searchCitations('3:16', EN)).toEqual([]);
      expect(searchCitations('zzzzzz 1', EN)).toEqual([]);
   });

   it('works on the static English table before any data loads', () => {
      expect(topRef('Gv 3:16', STATIC_SEARCH_DATA)).toBe('verse 43 3:16');
   });

   it('builds hrefs per result kind, keeping params', () => {
      const [ verse, chapter ] = searchCitations('John 3:16', EN);
      const book = top('John', EN);

      expect(resultHref(verse, { ds: 'nwtsty-i' })).toBe('/verse/john/3/16?ds=nwtsty-i');
      expect(resultHref(chapter)).toBe('/read/john/3');
      expect(book && resultHref(book)).toBe('/book/john');
   });
});

describe('alias table', () => {
   it('covers 66 books with an EN and IT display name', () => {
      expect(BOOK_ALIASES).toHaveLength(66);
      BOOK_ALIASES.forEach((entry, index) => {
         expect(entry.bookNumber).toBe(index + 1);
         expect(entry.en.length).toBeGreaterThan(0);
         expect(entry.it.length).toBeGreaterThan(0);
      });
   });

   it('matches the dataset display names', () => {
      for (const book of datasetBooks['../../public/generated/nwtsty-i/books.json']) {
         expect(normalizeBookKey(BOOK_ALIASES[book.bookNumber - 1].it[0])).toBe(normalizeBookKey(book.name));
      }
   });

   it.each([ 'en', 'it' ] as const)('has unique keys within %s', (language) => {
      const owner = new Map<string, number>();

      for (const entry of BOOK_ALIASES) {
         for (const alias of entry[language]) {
            const key = normalizeBookKey(alias);
            const previous = owner.get(key);

            expect(previous === undefined || previous === entry.bookNumber, `${language} ${alias}`).toBe(true);
            owner.set(key, entry.bookNumber);
         }
      }
   });

   it('never maps one key to two books across languages', () => {
      const owner = new Map<string, number>();

      for (const entry of BOOK_ALIASES) {
         for (const alias of [ ...entry.en, ...entry.it ]) {
            const key = normalizeBookKey(alias);
            const previous = owner.get(key);

            expect(previous === undefined || previous === entry.bookNumber, alias).toBe(true);
            owner.set(key, entry.bookNumber);
         }
      }
   });
});

describe('damerauLevenshtein', () => {
   it('counts transpositions as one edit', () => {
      expect(damerauLevenshtein('psalsm', 'psalms')).toBe(1);
      expect(damerauLevenshtein('genisis', 'genesis')).toBe(1);
      expect(damerauLevenshtein('abc', 'abc')).toBe(0);
      expect(damerauLevenshtein('abc', 'xyz', 1)).toBe(2);
   });
});
