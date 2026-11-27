/**
 * Citation parser: turns what a person types ("Gv 3:16", "giovanni 3 16", "1 Cor 13",
 * "rom 1 12", "Sal 23", "ps23", "II Re 2.11", "1cor13:4-7") into a book key plus optional
 * chapter / verse numbers. It does not know any book names: `bookMatcher` resolves the key.
 */
import { normalizeBookKey } from '../data/bookAliases';

export interface ParsedQuery {
   /** Normalized book key including the numeric prefix, e.g. `1cor`, `gv`, `songofsolomon`. */
   bookKey: string;
   /** Book key without the numeric prefix (`cor` for "1 Cor"). Equals `bookKey` when unnumbered. */
   stemKey: string;
   /** 1, 2 or 3 when the query starts with a book number ("1 Cor", "II Re", "primo Samuele"). */
   prefix?: 1 | 2 | 3;
   chapter?: number;
   verse?: number;
   /** End of a verse range ("13:4-7" → 7). Informational; navigation targets `verse`. */
   verseEnd?: number;
}

const ORDINALS: Record<string, 1 | 2 | 3> = {
   1: 1,
   2: 2,
   3: 3,
   i: 1,
   ii: 2,
   iii: 3,
   first: 1,
   second: 2,
   third: 3,
   primo: 1,
   prima: 1,
   secondo: 2,
   seconda: 2,
   terzo: 3,
   terza: 3,
};

/** Lowercase, strip diacritics, unify dashes and separators. */
export function normalizeQuery(raw: string): string {
   return raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/['`\u00b4\u00b7\u02b9\u2019]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
}

// prefix: a digit (optionally followed by "." or attached: "1cor"), or a word/roman numeral followed by a space.
const PREFIX = String.raw`(?:([123])(?:st|nd|rd)?\.?\s*|(iii|ii|i|first|second|third|primo|prima|secondo|seconda|terzo|terza)\s+)?`;
// book: starts with a letter; may contain letters, spaces and dots ("song of solomon", "atti degli apostoli", "gen.").
const BOOK = String.raw`([a-z][a-z. ]*?)`;
// numbers: chapter, then verse after ":" "." "," or space, then an optional range end.
const NUMBERS = String.raw`(?:\s*\.?\s*(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})|\s+(\d{1,3}))?(?:\s*-\s*(\d{1,3}))?)?`;
const QUERY_PATTERN = new RegExp(`^${PREFIX}${BOOK}${NUMBERS}\\s*[.:,]?$`);

/** Parses a query; `null` when it cannot be a citation (empty, only numbers, stray symbols). */
export function parseQuery(raw: string): ParsedQuery | null {
   const text = normalizeQuery(raw);

   if (!text) {
      return null;
   }

   const match = QUERY_PATTERN.exec(text);

   if (!match) {
      return null;
   }

   const [ , digitPrefix, wordPrefix, bookText, chapterText, verseText, spacedVerseText, endText ] = match;
   const stemKey = normalizeBookKey(bookText);

   if (!stemKey) {
      return null;
   }

   const prefixToken = digitPrefix ?? wordPrefix;
   const prefix = prefixToken ? ORDINALS[prefixToken] : undefined;
   const parsed: ParsedQuery = {
      bookKey: prefix ? `${prefix}${stemKey}` : stemKey,
      stemKey,
   };

   if (prefix) {
      parsed.prefix = prefix;
   }

   const chapter = toPositive(chapterText);
   const verse = toPositive(verseText ?? spacedVerseText);
   const verseEnd = toPositive(endText);

   if (chapter !== undefined) {
      parsed.chapter = chapter;
   }

   if (chapter !== undefined && verse !== undefined) {
      parsed.verse = verse;

      if (verseEnd !== undefined && verseEnd > verse) {
         parsed.verseEnd = verseEnd;
      }
   }

   return parsed;
}

function toPositive(text: string | undefined): number | undefined {
   if (text === undefined) {
      return undefined;
   }

   const value = Number(text);

   return Number.isInteger(value) && value >= 1 ? value : undefined;
}
