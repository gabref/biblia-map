//! Curated book-name aliases and abbreviations used by the generated search index.
//!
//! The `.jwpub` archives only carry one display title per book (`BibleBook.BookDisplayTitle` /
//! `Document.Title`); abbreviations live in encrypted content. These tables therefore hold the
//! common abbreviations for each supported language. They are indexed by `book_number - 1`.
//!
//! Every alias, once passed through [`normalize_search_key`], must be unique across books within a
//! language (enforced by unit tests), so a typed abbreviation never resolves to two books.

use crate::BOOK_COUNT;

/// Languages with a curated alias table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AliasLanguage {
   English,
   Italian,
}

impl AliasLanguage {
   /// Maps a dataset language name (as written in `manifest.json`) to an alias table.
   pub fn from_language_name(language: &str) -> Option<Self> {
      match language {
         "English" => Some(Self::English),
         "Italian" => Some(Self::Italian),
         _ => None,
      }
   }

   /// Returns the curated aliases for one book (1-based book number).
   pub fn aliases(self, book_number: u8) -> &'static [&'static str] {
      let table = match self {
         Self::English => &ENGLISH_ALIASES,
         Self::Italian => &ITALIAN_ALIASES,
      };

      table
         .get(usize::from(book_number).wrapping_sub(1))
         .copied()
         .unwrap_or(&[])
   }
}

/// Normalizes a book name or alias into a search key.
///
/// Lowercases, strips Latin diacritics (common Italian / Western European accents), and removes
/// whitespace, dots and other punctuation, so "1 Cor.", "1cor" and "1 COR" share the key `1cor`,
/// and "Giosuè" becomes `giosue`. The frontend should apply the equivalent transform to user input:
/// `s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')`.
pub fn normalize_search_key(value: &str) -> String {
   value
      .chars()
      .flat_map(char::to_lowercase)
      .map(strip_diacritic)
      .filter(|character| character.is_alphanumeric())
      .collect()
}

fn strip_diacritic(character: char) -> char {
   match character {
      'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' => 'a',
      'è' | 'é' | 'ê' | 'ë' => 'e',
      'ì' | 'í' | 'î' | 'ï' => 'i',
      'ò' | 'ó' | 'ô' | 'ö' | 'õ' => 'o',
      'ù' | 'ú' | 'û' | 'ü' => 'u',
      'ç' => 'c',
      'ñ' => 'n',
      other => other,
   }
}

pub static ENGLISH_ALIASES: [&[&str]; BOOK_COUNT] = [
   &["Gen.", "Ge", "Gn"],
   &["Ex.", "Exod", "Exo"],
   &["Lev.", "Le", "Lv"],
   &["Num.", "Nu", "Nm", "Nb"],
   &["Deut.", "Dt", "De"],
   &["Josh.", "Jos", "Jsh"],
   &["Judg.", "Jdg", "Jdgs", "Jg"],
   &["Ruth", "Ru", "Rth"],
   &["1 Sam.", "1 Sa", "1 Sm", "1Sam", "I Samuel"],
   &["2 Sam.", "2 Sa", "2 Sm", "2Sam", "II Samuel"],
   &["1 Ki.", "1 Kgs", "1 Kin", "1Kings", "I Kings"],
   &["2 Ki.", "2 Kgs", "2 Kin", "2Kings", "II Kings"],
   &["1 Chron.", "1 Chr", "1 Ch", "I Chronicles"],
   &["2 Chron.", "2 Chr", "2 Ch", "II Chronicles"],
   &["Ezra", "Ezr"],
   &["Neh.", "Ne"],
   &["Esther", "Esth", "Est"],
   &["Job", "Jb"],
   &["Ps.", "Psa", "Psalm", "Pss", "Psm", "Pslm"],
   &["Prov.", "Pr", "Prv", "Pro"],
   &["Eccl.", "Ecc", "Eccles", "Qoh", "Qoheleth"],
   &["Song", "Song of Songs", "SoS", "Sg", "Canticles", "Cant"],
   &["Isa.", "Is"],
   &["Jer.", "Je", "Jr"],
   &["Lam.", "La"],
   &["Ezek.", "Eze", "Ezk"],
   &["Dan.", "Da", "Dn"],
   &["Hos.", "Ho"],
   &["Joel", "Jl"],
   &["Amos", "Am"],
   &["Obad.", "Ob", "Oba"],
   &["Jonah", "Jon", "Jnh"],
   &["Mic.", "Mi"],
   &["Nah.", "Na"],
   &["Hab.", "Hb"],
   &["Zeph.", "Zep", "Zp"],
   &["Hag.", "Hg"],
   &["Zech.", "Zec", "Zc"],
   &["Mal.", "Ml"],
   &["Matt.", "Mt", "Mat"],
   &["Mark", "Mk", "Mr", "Mrk"],
   &["Luke", "Lk", "Lu", "Luk"],
   &["John", "Jn", "Joh", "Jhn"],
   &["Acts", "Ac", "Act"],
   &["Rom.", "Ro", "Rm"],
   &["1 Cor.", "1 Co", "1Cor", "I Corinthians"],
   &["2 Cor.", "2 Co", "2Cor", "II Corinthians"],
   &["Gal.", "Ga"],
   &["Eph.", "Ephes"],
   &["Phil.", "Php", "Pp"],
   &["Col.", "Co"],
   &["1 Thess.", "1 Th", "1 Thes", "I Thessalonians"],
   &["2 Thess.", "2 Th", "2 Thes", "II Thessalonians"],
   &["1 Tim.", "1 Ti", "1 Tm", "I Timothy"],
   &["2 Tim.", "2 Ti", "2 Tm", "II Timothy"],
   &["Titus", "Tit", "Ti"],
   &["Philem.", "Phm", "Phlm", "Pm"],
   &["Heb.", "He"],
   &["Jas.", "Jm", "Jam"],
   &["1 Pet.", "1 Pe", "1 Pt", "I Peter"],
   &["2 Pet.", "2 Pe", "2 Pt", "II Peter"],
   &["1 John", "1 Jn", "1 Jo", "1 Joh", "I John"],
   &["2 John", "2 Jn", "2 Jo", "2 Joh", "II John"],
   &["3 John", "3 Jn", "3 Jo", "3 Joh", "III John"],
   &["Jude", "Jud", "Jd"],
   &["Rev.", "Re", "Rv", "Apocalypse", "Revelations"],
];

/// Italian aliases: the NWT Italian abbreviations ("Gen.", "Eso.", "Gv", ...) plus the forms used
/// by common Italian editions (CEI / Bibbia di Gerusalemme: "Gn", "Es", "Lv", "Qo", "Ap", ...).
/// Where those conventions disagree, the Bibbia di Gerusalemme reading wins ("Gn" = Genesi,
/// "Gio" = Giona).
pub static ITALIAN_ALIASES: [&[&str]; BOOK_COUNT] = [
   &["Gen.", "Gn", "Ge"],
   &["Eso.", "Es", "Esod"],
   &["Le.", "Lev", "Lv"],
   &["Nu.", "Num", "Nm"],
   &["De.", "Deut", "Dt"],
   &["Gios.", "Gs"],
   &["Giud.", "Gdc"],
   &["Ru.", "Rut", "Rt"],
   &["1 Sam.", "1 Sa", "1 Sm", "1Sam"],
   &["2 Sam.", "2 Sa", "2 Sm", "2Sam"],
   &["1 Re", "1 Ri", "1Re", "1 Libro dei Re"],
   &["2 Re", "2 Ri", "2Re", "2 Libro dei Re"],
   &["1 Cron.", "1 Cr", "1 Cro", "1Cr"],
   &["2 Cron.", "2 Cr", "2 Cro", "2Cr"],
   &["Esd.", "Esdr"],
   &["Nee.", "Ne", "Neem"],
   &["Est.", "Ester", "Estr"],
   &["Giob.", "Gb"],
   &["Sal.", "Sl", "Salmo"],
   &["Prov.", "Pr", "Prv"],
   &["Ec.", "Eccl", "Qo", "Qoelet", "Qohelet"],
   &["Cant.", "Ct", "Cantico dei Cantici", "Cantico"],
   &["Isa.", "Is"],
   &["Ger."],
   &["Lam.", "La"],
   &["Ez.", "Eze", "Ezec"],
   &["Dan.", "Dn", "Da"],
   &["Os.", "Osea"],
   &["Gioe.", "Gl"],
   &["Am.", "Amos"],
   &["Abd."],
   &["Gion.", "Gio"],
   &["Mic.", "Mi"],
   &["Na.", "Nau"],
   &["Aba.", "Ab"],
   &["Sof.", "So"],
   &["Ag.", "Agg"],
   &["Zac.", "Zc"],
   &["Mal.", "Ml"],
   &["Mt", "Mat", "Matt"],
   &["Mr", "Mc", "Mar"],
   &["Lu", "Lc", "Luc"],
   &["Gv", "Giov"],
   &["At", "Atti degli Apostoli"],
   &["Ro", "Rm", "Rom"],
   &["1 Cor.", "1 Co", "1Cor"],
   &["2 Cor.", "2 Co", "2Cor"],
   &["Gal.", "Ga"],
   &["Ef.", "Efe"],
   &["Flp.", "Fil", "Fl"],
   &["Col.", "Co"],
   &["1 Tes.", "1 Ts", "1Tes", "1 Tess"],
   &["2 Tes.", "2 Ts", "2Tes", "2 Tess"],
   &["1 Tim.", "1 Tm", "1Tim"],
   &["2 Tim.", "2 Tm", "2Tim"],
   &["Tito", "Tt", "Tit"],
   &["File.", "Fm", "Flm", "Filem"],
   &["Ebr.", "Eb"],
   &["Gc", "Giac"],
   &["1 Piet.", "1 Pt", "1 Pi", "1Pt"],
   &["2 Piet.", "2 Pt", "2 Pi", "2Pt"],
   &["1 Gv", "1 Giov", "1Gv"],
   &["2 Gv", "2 Giov", "2Gv"],
   &["3 Gv", "3 Giov", "3Gv"],
   &["Giuda", "Gd"],
   &["Riv.", "Ri", "Ap", "Apoc", "Apocalisse"],
];

#[cfg(test)]
mod tests {
   use std::collections::HashMap;

   use super::*;
   use crate::BOOKS;

   fn assert_unique_keys(language: AliasLanguage) {
      let mut seen: HashMap<String, u8> = HashMap::new();

      for book in &BOOKS {
         for alias in language.aliases(book.book_number) {
            let key = normalize_search_key(alias);
            assert!(!key.is_empty(), "{alias} normalizes to an empty key");
            if let Some(other) = seen.insert(key.clone(), book.book_number) {
               assert_eq!(
                  other, book.book_number,
                  "{language:?} alias key {key} is claimed by books {other} and {}",
                  book.book_number
               );
            }
         }
      }
   }

   #[test]
   fn alias_keys_are_unique_per_language() {
      assert_unique_keys(AliasLanguage::English);
      assert_unique_keys(AliasLanguage::Italian);
   }

   #[test]
   fn normalizes_keys() {
      assert_eq!(normalize_search_key("1 Cor."), "1cor");
      assert_eq!(normalize_search_key("Giosuè"), "giosue");
      assert_eq!(normalize_search_key("Song of Solomon"), "songofsolomon");
      assert_eq!(normalize_search_key("  JN "), "jn");
   }

   #[test]
   fn maps_requested_abbreviations() {
      let lookup = |language: AliasLanguage, alias: &str| {
         BOOKS
            .iter()
            .find(|book| {
               language
                  .aliases(book.book_number)
                  .iter()
                  .any(|candidate| normalize_search_key(candidate) == normalize_search_key(alias))
            })
            .map(|book| book.book_number)
      };

      assert_eq!(lookup(AliasLanguage::English, "Gen"), Some(1));
      assert_eq!(lookup(AliasLanguage::English, "Jn"), Some(43));
      assert_eq!(lookup(AliasLanguage::English, "1 Cor"), Some(46));
      assert_eq!(lookup(AliasLanguage::Italian, "Gn"), Some(1));
      assert_eq!(lookup(AliasLanguage::Italian, "Gv"), Some(43));
      assert_eq!(lookup(AliasLanguage::Italian, "1 Cor"), Some(46));
      assert_eq!(lookup(AliasLanguage::Italian, "Mt"), Some(40));
      assert_eq!(AliasLanguage::from_language_name("Klingon"), None);
   }
}
