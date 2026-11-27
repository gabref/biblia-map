/**
 * Book names and common abbreviations in English and Italian (owner: E-A).
 *
 * Used by the citation parser in `search/` so "Gv 3:16", "jn 3 16", "Giovanni 3:16" and
 * "1 Cor 13" all resolve without loading any generated data. The first entry of each list is
 * the display name in that language. Numbered books list aliases WITH their number
 * ("1 Cor"); the parser also accepts roman numerals and ordinal words for the prefix.
 *
 * Every alias is normalized with `normalizeBookKey` (lowercase, no diacritics, no spaces or
 * punctuation). Exact keys must be unique across books within one language; a key may be
 * shared across EN/IT only when it points to the same book (enforced by tests).
 *
 * The NWT abbreviations (EN "Gen.", "Ex.", "Mr"; IT "Gen.", "Eso.", "Gv", "Riv.") come first,
 * then forms used by other common editions (CEI / Bibbia di Gerusalemme: "Gn", "Es", "Ap").
 * Where conventions collide inside a language the NWT reading wins.
 */
export interface BookAliasEntry {
   bookNumber: number;
   /** English names and abbreviations; `[0]` is the display name. */
   en: readonly string[];
   /** Italian names and abbreviations; `[0]` is the display name. */
   it: readonly string[];
}

export type AliasLanguage = 'en' | 'it';

export const BOOK_ALIASES: readonly BookAliasEntry[] = [
   { bookNumber: 1, en: [ 'Genesis', 'Gen', 'Ge', 'Gn' ], it: [ 'Genesi', 'Gen', 'Gn', 'Ge' ] },
   { bookNumber: 2, en: [ 'Exodus', 'Ex', 'Exod', 'Exo' ], it: [ 'Esodo', 'Eso', 'Es', 'Esod' ] },
   { bookNumber: 3, en: [ 'Leviticus', 'Lev', 'Le', 'Lv' ], it: [ 'Levitico', 'Le', 'Lev', 'Lv' ] },
   { bookNumber: 4, en: [ 'Numbers', 'Num', 'Nu', 'Nm', 'Nb' ], it: [ 'Numeri', 'Nu', 'Num', 'Nm' ] },
   { bookNumber: 5, en: [ 'Deuteronomy', 'Deut', 'Dt', 'De' ], it: [ 'Deuteronomio', 'De', 'Deut', 'Dt' ] },
   { bookNumber: 6, en: [ 'Joshua', 'Josh', 'Jos', 'Jsh' ], it: [ 'Giosuè', 'Gios', 'Gs' ] },
   { bookNumber: 7, en: [ 'Judges', 'Judg', 'Jdg', 'Jdgs', 'Jg' ], it: [ 'Giudici', 'Giud', 'Gdc' ] },
   { bookNumber: 8, en: [ 'Ruth', 'Ru', 'Rth' ], it: [ 'Rut', 'Ru', 'Rt' ] },
   { bookNumber: 9, en: [ '1 Samuel', '1 Sam', '1 Sa', '1 Sm' ], it: [ '1 Samuele', '1 Sam', '1 Sa', '1 Sm' ] },
   { bookNumber: 10, en: [ '2 Samuel', '2 Sam', '2 Sa', '2 Sm' ], it: [ '2 Samuele', '2 Sam', '2 Sa', '2 Sm' ] },
   { bookNumber: 11, en: [ '1 Kings', '1 Ki', '1 Kgs', '1 Kin' ], it: [ '1 Re', '1 Ri' ] },
   { bookNumber: 12, en: [ '2 Kings', '2 Ki', '2 Kgs', '2 Kin' ], it: [ '2 Re', '2 Ri' ] },
   { bookNumber: 13, en: [ '1 Chronicles', '1 Chron', '1 Chr', '1 Ch' ], it: [ '1 Cronache', '1 Cron', '1 Cr', '1 Cro' ] },
   { bookNumber: 14, en: [ '2 Chronicles', '2 Chron', '2 Chr', '2 Ch' ], it: [ '2 Cronache', '2 Cron', '2 Cr', '2 Cro' ] },
   { bookNumber: 15, en: [ 'Ezra', 'Ezr' ], it: [ 'Esdra', 'Esd', 'Esdr' ] },
   { bookNumber: 16, en: [ 'Nehemiah', 'Neh', 'Ne' ], it: [ 'Neemia', 'Nee', 'Ne', 'Neem' ] },
   { bookNumber: 17, en: [ 'Esther', 'Esth', 'Est' ], it: [ 'Ester', 'Est', 'Estr' ] },
   { bookNumber: 18, en: [ 'Job', 'Jb' ], it: [ 'Giobbe', 'Giob', 'Gb' ] },
   { bookNumber: 19, en: [ 'Psalms', 'Psalm', 'Ps', 'Psa', 'Pss', 'Psm', 'Pslm' ], it: [ 'Salmi', 'Salmo', 'Sal', 'Sl' ] },
   { bookNumber: 20, en: [ 'Proverbs', 'Prov', 'Pr', 'Prv', 'Pro' ], it: [ 'Proverbi', 'Prov', 'Pr', 'Prv' ] },
   { bookNumber: 21, en: [ 'Ecclesiastes', 'Eccl', 'Ecc', 'Eccles', 'Qoh', 'Qoheleth' ], it: [ 'Ecclesiaste', 'Ec', 'Eccl', 'Qo', 'Qoelet', 'Qohelet' ] },
   { bookNumber: 22, en: [ 'Song of Solomon', 'Song of Songs', 'Song', 'Sol', 'SoS', 'Sg', 'Canticles', 'Cant' ], it: [ 'Cantico dei Cantici', 'Cantico', 'Cant', 'Ct' ] },
   { bookNumber: 23, en: [ 'Isaiah', 'Isa', 'Is' ], it: [ 'Isaia', 'Isa', 'Is' ] },
   { bookNumber: 24, en: [ 'Jeremiah', 'Jer', 'Je', 'Jr' ], it: [ 'Geremia', 'Ger' ] },
   { bookNumber: 25, en: [ 'Lamentations', 'Lam', 'La' ], it: [ 'Lamentazioni', 'Lam', 'La' ] },
   { bookNumber: 26, en: [ 'Ezekiel', 'Ezek', 'Eze', 'Ezk' ], it: [ 'Ezechiele', 'Ez', 'Eze', 'Ezec' ] },
   { bookNumber: 27, en: [ 'Daniel', 'Dan', 'Da', 'Dn' ], it: [ 'Daniele', 'Dan', 'Da', 'Dn' ] },
   { bookNumber: 28, en: [ 'Hosea', 'Hos', 'Ho' ], it: [ 'Osea', 'Os' ] },
   { bookNumber: 29, en: [ 'Joel', 'Jl' ], it: [ 'Gioele', 'Gioe', 'Gl' ] },
   { bookNumber: 30, en: [ 'Amos', 'Am' ], it: [ 'Amos', 'Am' ] },
   { bookNumber: 31, en: [ 'Obadiah', 'Obad', 'Ob', 'Oba' ], it: [ 'Abdia', 'Abd' ] },
   { bookNumber: 32, en: [ 'Jonah', 'Jon', 'Jnh' ], it: [ 'Giona', 'Gion', 'Gio' ] },
   { bookNumber: 33, en: [ 'Micah', 'Mic', 'Mi' ], it: [ 'Michea', 'Mic', 'Mi' ] },
   { bookNumber: 34, en: [ 'Nahum', 'Nah', 'Na' ], it: [ 'Naum', 'Na', 'Nau' ] },
   { bookNumber: 35, en: [ 'Habakkuk', 'Hab', 'Hb' ], it: [ 'Abacuc', 'Aba', 'Ab' ] },
   { bookNumber: 36, en: [ 'Zephaniah', 'Zeph', 'Zep', 'Zp' ], it: [ 'Sofonia', 'Sof', 'So' ] },
   { bookNumber: 37, en: [ 'Haggai', 'Hag', 'Hg' ], it: [ 'Aggeo', 'Ag', 'Agg' ] },
   { bookNumber: 38, en: [ 'Zechariah', 'Zech', 'Zec', 'Zc' ], it: [ 'Zaccaria', 'Zac', 'Zc' ] },
   { bookNumber: 39, en: [ 'Malachi', 'Mal', 'Ml' ], it: [ 'Malachia', 'Mal', 'Ml' ] },
   { bookNumber: 40, en: [ 'Matthew', 'Matt', 'Mt', 'Mat' ], it: [ 'Matteo', 'Mt', 'Mat', 'Matt' ] },
   { bookNumber: 41, en: [ 'Mark', 'Mr', 'Mk', 'Mrk' ], it: [ 'Marco', 'Mr', 'Mc', 'Mar' ] },
   { bookNumber: 42, en: [ 'Luke', 'Lu', 'Lk', 'Luk' ], it: [ 'Luca', 'Lu', 'Lc', 'Luc' ] },
   { bookNumber: 43, en: [ 'John', 'Joh', 'Jn', 'Jhn' ], it: [ 'Giovanni', 'Gv', 'Giov' ] },
   { bookNumber: 44, en: [ 'Acts', 'Ac', 'Act', 'Acts of Apostles' ], it: [ 'Atti', 'At', 'Atti degli Apostoli' ] },
   { bookNumber: 45, en: [ 'Romans', 'Rom', 'Ro', 'Rm' ], it: [ 'Romani', 'Ro', 'Rm', 'Rom' ] },
   { bookNumber: 46, en: [ '1 Corinthians', '1 Cor', '1 Co' ], it: [ '1 Corinti', '1 Cor', '1 Co' ] },
   { bookNumber: 47, en: [ '2 Corinthians', '2 Cor', '2 Co' ], it: [ '2 Corinti', '2 Cor', '2 Co' ] },
   { bookNumber: 48, en: [ 'Galatians', 'Gal', 'Ga' ], it: [ 'Galati', 'Gal', 'Ga' ] },
   { bookNumber: 49, en: [ 'Ephesians', 'Eph', 'Ephes' ], it: [ 'Efesini', 'Ef', 'Efe' ] },
   { bookNumber: 50, en: [ 'Philippians', 'Phil', 'Php', 'Pp' ], it: [ 'Filippesi', 'Flp', 'Fil', 'Fl' ] },
   { bookNumber: 51, en: [ 'Colossians', 'Col', 'Co' ], it: [ 'Colossesi', 'Col', 'Co' ] },
   { bookNumber: 52, en: [ '1 Thessalonians', '1 Thess', '1 Th', '1 Thes' ], it: [ '1 Tessalonicesi', '1 Tes', '1 Ts', '1 Tess' ] },
   { bookNumber: 53, en: [ '2 Thessalonians', '2 Thess', '2 Th', '2 Thes' ], it: [ '2 Tessalonicesi', '2 Tes', '2 Ts', '2 Tess' ] },
   { bookNumber: 54, en: [ '1 Timothy', '1 Tim', '1 Ti', '1 Tm' ], it: [ '1 Timoteo', '1 Tim', '1 Tm' ] },
   { bookNumber: 55, en: [ '2 Timothy', '2 Tim', '2 Ti', '2 Tm' ], it: [ '2 Timoteo', '2 Tim', '2 Tm' ] },
   { bookNumber: 56, en: [ 'Titus', 'Tit' ], it: [ 'Tito', 'Tt', 'Tit' ] },
   { bookNumber: 57, en: [ 'Philemon', 'Philem', 'Phm', 'Phlm', 'Pm' ], it: [ 'Filemone', 'File', 'Fm', 'Flm', 'Filem' ] },
   { bookNumber: 58, en: [ 'Hebrews', 'Heb', 'He' ], it: [ 'Ebrei', 'Ebr', 'Eb' ] },
   { bookNumber: 59, en: [ 'James', 'Jas', 'Jm', 'Jam' ], it: [ 'Giacomo', 'Gc', 'Giac' ] },
   { bookNumber: 60, en: [ '1 Peter', '1 Pet', '1 Pe', '1 Pt' ], it: [ '1 Pietro', '1 Piet', '1 Pt', '1 Pi' ] },
   { bookNumber: 61, en: [ '2 Peter', '2 Pet', '2 Pe', '2 Pt' ], it: [ '2 Pietro', '2 Piet', '2 Pt', '2 Pi' ] },
   { bookNumber: 62, en: [ '1 John', '1 Joh', '1 Jn', '1 Jo' ], it: [ '1 Giovanni', '1 Gv', '1 Giov' ] },
   { bookNumber: 63, en: [ '2 John', '2 Joh', '2 Jn', '2 Jo' ], it: [ '2 Giovanni', '2 Gv', '2 Giov' ] },
   { bookNumber: 64, en: [ '3 John', '3 Joh', '3 Jn', '3 Jo' ], it: [ '3 Giovanni', '3 Gv', '3 Giov' ] },
   { bookNumber: 65, en: [ 'Jude', 'Jud', 'Jd' ], it: [ 'Giuda', 'Gd' ] },
   { bookNumber: 66, en: [ 'Revelation', 'Rev', 'Re', 'Rv', 'Apocalypse', 'Revelations' ], it: [ 'Rivelazione', 'Riv', 'Ri', 'Apocalisse', 'Ap', 'Apoc' ] },
];

/**
 * Normalizes a book name or alias to a lookup key: lowercase, diacritics stripped, only
 * letters and digits kept. Matches `normalize_search_key` in the Rust extractor, so keys from
 * `search-index.json` and keys built here are interchangeable.
 */
export function normalizeBookKey(value: string): string {
   return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
}

/** Display name of a book in `language` (falls back to English). */
export function aliasDisplayName(bookNumber: number, language: AliasLanguage): string | undefined {
   const entry = BOOK_ALIASES[bookNumber - 1];

   return entry?.[language][0] ?? entry?.en[0];
}
