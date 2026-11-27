//! Optional, additive outputs derived from the extracted graph (Sprint 2, epic E-G).
//!
//! Every file written here is listed in `manifest.json` `features`, so the frontend can
//! feature-detect it and keep working against datasets generated before these files existed.

use std::{
   collections::{BTreeMap, HashMap, HashSet},
   fs,
   path::Path,
};

use anyhow::Result;
use bibliamap_core::{
   BOOK_COUNT, BOOKS, BibleEdge, BookExport, EdgeKind, Testament, VerseRef,
   aliases::{AliasLanguage, normalize_search_key},
   book_by_number, book_file_name,
};
use serde::Serialize;

use crate::write_json;

/// `manifest.json` feature flags, one per optional file family.
pub const FEATURE_SEARCH_INDEX: &str = "search-index";
pub const FEATURE_VERSE_DEGREE: &str = "verse-degree";
pub const FEATURE_CHAPTER_MATRICES: &str = "chapter-matrices";
pub const FEATURE_STUDY_NOTE_TEXT: &str = "study-note-text";
pub const FEATURE_FOOTNOTE_TEXT: &str = "footnote-text";
pub const FEATURE_COMPONENTS: &str = "components";

/// `search-index.json`: everything a book/chapter/verse picker or a reference parser needs,
/// without loading `verse-index.json` or `chapters.json`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndex {
   pub schema_version: u8,
   pub language: String,
   pub books: Vec<SearchBook>,
   /// Verses not covered by any chapter run, as `[jwpubVerseId, bookNumber, chapter, verse]`.
   /// Empty for every current dataset; present so the format stays lossless.
   pub irregular_verses: Vec<[i32; 4]>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchBook {
   pub book_number: u8,
   pub slug: String,
   pub name: String,
   pub short_name: String,
   pub testament: Testament,
   /// Display aliases / abbreviations in the dataset language (plus English for other languages).
   pub aliases: Vec<String>,
   /// Normalized lookup keys (see `normalize_search_key`), unique across books in this file.
   pub keys: Vec<String>,
   /// One entry per chapter (index = chapter - 1): `[firstJwpubVerseId, firstVerseNumber,
   /// verseCount]`. Verse `v` of the chapter has id `firstJwpubVerseId + (v - firstVerseNumber)`.
   pub chapters: Vec<[i32; 3]>,
}

pub fn build_search_index(
   books: &[BookExport],
   verse_map: &HashMap<i32, VerseRef>,
   language: &str,
) -> SearchIndex {
   let mut by_chapter: BTreeMap<(u8, u16), Vec<&VerseRef>> = BTreeMap::new();
   for verse in verse_map.values() {
      by_chapter
         .entry((verse.book_number, verse.chapter_number))
         .or_default()
         .push(verse);
   }

   let mut chapters_by_book: BTreeMap<u8, Vec<[i32; 3]>> = BTreeMap::new();
   let mut irregular_verses = Vec::new();

   for ((book_number, chapter_number), mut verses) in by_chapter {
      verses.sort_by_key(|verse| (verse.verse_number, verse.jwpub_verse_id));
      let first = verses[0];
      let mut run_length = 0_i32;
      let mut broken = false;

      for verse in &verses {
         let in_run = !broken
            && verse.jwpub_verse_id == first.jwpub_verse_id + run_length
            && i32::from(verse.verse_number) == i32::from(first.verse_number) + run_length;
         if in_run {
            run_length += 1;
         } else {
            broken = true;
            irregular_verses.push([
               verse.jwpub_verse_id,
               i32::from(book_number),
               i32::from(chapter_number),
               i32::from(verse.verse_number),
            ]);
         }
      }

      let chapters = chapters_by_book.entry(book_number).or_default();
      // Chapters are contiguous from 1 in every dataset; pad defensively so index = chapter - 1.
      while chapters.len() + 1 < usize::from(chapter_number) {
         chapters.push([0, 1, 0]);
      }
      chapters.push([
         first.jwpub_verse_id,
         i32::from(first.verse_number),
         run_length,
      ]);
   }

   let localized = AliasLanguage::from_language_name(language);
   let mut claimed: HashMap<String, u8> = HashMap::new();
   let mut aliases: Vec<Vec<String>> = vec![Vec::new(); BOOK_COUNT];
   let mut keys: Vec<Vec<String>> = vec![Vec::new(); BOOK_COUNT];
   let mut claim = |book_number: u8, display: &str, as_alias: bool| {
      let key = normalize_search_key(display);
      if key.is_empty() {
         return;
      }
      let index = usize::from(book_number - 1);
      match claimed.get(&key) {
         Some(owner) if *owner != book_number => return,
         Some(_) => {}
         None => {
            claimed.insert(key.clone(), book_number);
            keys[index].push(key);
         }
      }
      if as_alias && !aliases[index].iter().any(|existing| existing == display) {
         aliases[index].push(display.to_string());
      }
   };

   // Pass 1: dataset-language names (from the jwpub) and curated aliases win every collision.
   for book in books {
      claim(book.book_number, &book.name, false);
      claim(book.book_number, &book.short_name, false);
      if let Some(language) = localized {
         for alias in language.aliases(book.book_number) {
            claim(book.book_number, alias, true);
         }
      }
   }
   // Pass 2: English names, slugs and aliases, so English input works on every dataset (URLs
   // already use English slugs).
   for book in books {
      let english = book_by_number(book.book_number).expect("book should exist");
      claim(book.book_number, english.slug, false);
      if localized != Some(AliasLanguage::English) {
         claim(book.book_number, english.name, true);
         for alias in AliasLanguage::English.aliases(book.book_number) {
            claim(book.book_number, alias, true);
         }
      }
   }

   let books = books
      .iter()
      .map(|book| {
         let index = usize::from(book.book_number - 1);
         SearchBook {
            book_number: book.book_number,
            slug: book.slug.clone(),
            name: book.name.clone(),
            short_name: book.short_name.clone(),
            testament: book.testament,
            aliases: aliases[index].clone(),
            keys: keys[index].clone(),
            chapters: chapters_by_book
               .get(&book.book_number)
               .cloned()
               .unwrap_or_default(),
         }
      })
      .collect();

   SearchIndex {
      schema_version: 1,
      language: language.to_string(),
      books,
      irregular_verses,
   }
}

/// `stats.verse-degree.json`: per-verse degree arrays indexed directly by `jwpubVerseId`
/// (`array[jwpubVerseId]`, length `maxJwpubVerseId + 1`; ids that are not verses hold 0).
///
/// `out*` counts edges whose source is the verse. `in*` counts edges whose cited range
/// (`targetStart..=targetEnd`) contains the verse, i.e. exactly the entries of
/// `adjacency/target/*.json` for that verse. `in`/`out` are cross references (kind 0),
/// `inStudy`/`outStudy` are study-note references (kind 1); combined = sum of both.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerseDegree {
   pub schema_version: u8,
   pub index: &'static str,
   pub length: usize,
   #[serde(rename = "in")]
   pub incoming: Vec<u32>,
   #[serde(rename = "out")]
   pub outgoing: Vec<u32>,
   pub in_study: Vec<u32>,
   pub out_study: Vec<u32>,
}

pub fn build_verse_degree(
   cross_reference_edges: &[BibleEdge],
   study_note_edges: &[BibleEdge],
   verse_map: &HashMap<i32, VerseRef>,
) -> VerseDegree {
   let length = verse_map
      .keys()
      .copied()
      .max()
      .map_or(0, |max_id| usize::try_from(max_id).unwrap_or(0) + 1);
   let mut degree = VerseDegree {
      schema_version: 1,
      index: "jwpubVerseId",
      length,
      incoming: vec![0; length],
      outgoing: vec![0; length],
      in_study: vec![0; length],
      out_study: vec![0; length],
   };

   for edge in cross_reference_edges.iter().chain(study_note_edges) {
      let study = edge.kind == EdgeKind::StudyNoteReference;
      if let Ok(source) = usize::try_from(edge.source_verse_id)
         && source < length
      {
         if study {
            degree.out_study[source] += 1;
         } else {
            degree.outgoing[source] += 1;
         }
      }

      let range_end = edge.target_end_verse_id.max(edge.target_start_verse_id);
      for target in edge.target_start_verse_id..=range_end {
         if !verse_map.contains_key(&target) {
            continue;
         }
         let Ok(target) = usize::try_from(target) else {
            continue;
         };
         if target >= length {
            continue;
         }
         if study {
            degree.in_study[target] += 1;
         } else {
            degree.incoming[target] += 1;
         }
      }
   }

   degree
}

/// `matrices/chapter/<NN>.<slug>.json`: chapter → other-book aggregates for one book.
///
/// `outgoing[chapter - 1]` lists `[targetBookNumber, crossrefs, studyNotes, combined]` for edges
/// whose source verse is in that chapter (target book = book of the range start).
/// `incoming[chapter - 1]` lists `[sourceBookNumber, crossrefs, studyNotes, combined]` for edges
/// whose range starts in that chapter. Each edge counts once, like `matrices/book.*.json`.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterMatrix {
   pub book_number: u8,
   pub chapters: u16,
   pub outgoing: Vec<Vec<[u32; 4]>>,
   pub incoming: Vec<Vec<[u32; 4]>>,
}

pub fn build_chapter_matrices(
   cross_reference_edges: &[BibleEdge],
   study_note_edges: &[BibleEdge],
) -> Vec<ChapterMatrix> {
   type Counts = BTreeMap<(u8, u16, u8), [u32; 2]>;
   let mut outgoing: Counts = BTreeMap::new();
   let mut incoming: Counts = BTreeMap::new();

   for edge in cross_reference_edges.iter().chain(study_note_edges) {
      let slot = usize::from(edge.kind == EdgeKind::StudyNoteReference);
      outgoing
         .entry((
            edge.source_book_number,
            edge.source_chapter_number,
            edge.target_book_number,
         ))
         .or_default()[slot] += 1;
      incoming
         .entry((
            edge.target_book_number,
            edge.target_chapter_number,
            edge.source_book_number,
         ))
         .or_default()[slot] += 1;
   }

   let mut matrices = BOOKS
      .iter()
      .map(|book| ChapterMatrix {
         book_number: book.book_number,
         chapters: book.chapters,
         outgoing: vec![Vec::new(); usize::from(book.chapters)],
         incoming: vec![Vec::new(); usize::from(book.chapters)],
      })
      .collect::<Vec<_>>();

   let mut fill = |counts: Counts, outgoing_side: bool| {
      for ((book_number, chapter_number, other_book), [cross, study]) in counts {
         let matrix = &mut matrices[usize::from(book_number - 1)];
         let rows = if outgoing_side {
            &mut matrix.outgoing
         } else {
            &mut matrix.incoming
         };
         let index = usize::from(chapter_number.max(1) - 1);
         if rows.len() <= index {
            rows.resize(index + 1, Vec::new());
            matrix.chapters = matrix.chapters.max(chapter_number);
         }
         rows[index].push([u32::from(other_book), cross, study, cross + study]);
      }
   };
   fill(outgoing, true);
   fill(incoming, false);

   matrices
}

/// Writes one per-book JSON file for each of the 66 books, removing the directory first so no
/// stale files survive. Books without entries get an empty object.
pub fn write_per_book_files<T: Serialize>(
   directory: &Path,
   by_book: &BTreeMap<u8, BTreeMap<i32, T>>,
   pretty: bool,
) -> Result<()> {
   if directory.exists() {
      fs::remove_dir_all(directory)?;
   }
   fs::create_dir_all(directory)?;
   let empty = BTreeMap::<i32, T>::new();

   for book in &BOOKS {
      write_json(
         directory.join(book_file_name(book.book_number)),
         by_book.get(&book.book_number).unwrap_or(&empty),
         pretty,
      )?;
   }

   Ok(())
}

pub fn write_chapter_matrices(
   output: &Path,
   matrices: &[ChapterMatrix],
   pretty: bool,
) -> Result<()> {
   let directory = output.join("matrices/chapter");
   fs::create_dir_all(&directory)?;

   for matrix in matrices {
      write_json(
         directory.join(book_file_name(matrix.book_number)),
         matrix,
         pretty,
      )?;
   }

   Ok(())
}

/// Removes an optional output that this run did not produce (e.g. study notes for `nwt`).
pub fn remove_if_exists(path: &Path) -> Result<()> {
   if path.is_dir() {
      fs::remove_dir_all(path)?;
   } else if path.exists() {
      fs::remove_file(path)?;
   }

   Ok(())
}

/// Returns true when every key in the search index maps to exactly one book.
pub fn search_keys_are_unique(index: &SearchIndex) -> bool {
   let mut seen = HashSet::new();
   index
      .books
      .iter()
      .flat_map(|book| book.keys.iter())
      .all(|key| seen.insert(key.clone()))
}

#[cfg(test)]
mod tests {
   use super::*;
   use bibliamap_core::{canonical_verse_id, exported_books};

   fn verse(id: i32, book: u8, chapter: u16, number: u16) -> (i32, VerseRef) {
      (
         id,
         VerseRef {
            jwpub_verse_id: id,
            canonical_verse_id: canonical_verse_id(book, chapter, number),
            book_number: book,
            chapter_number: chapter,
            verse_number: number,
            label: format!("{book} {chapter}:{number}"),
         },
      )
   }

   fn edge(source: (u8, u16, i32), target: (u8, u16, i32, i32), kind: EdgeKind) -> BibleEdge {
      BibleEdge {
         source_verse_id: source.2,
         target_start_verse_id: target.2,
         target_end_verse_id: target.3,
         kind,
         source_book_number: source.0,
         target_book_number: target.0,
         source_chapter_number: source.1,
         target_chapter_number: target.1,
         paragraph_ordinal: None,
         sort_position: None,
         commentary_id: None,
         document_id: None,
      }
   }

   #[test]
   fn search_index_has_chapter_runs_and_aliases() {
      // John 8 starts at verse 12 in NWT; Genesis 1 has three verses here.
      let verse_map = HashMap::from([
         verse(0, 1, 1, 1),
         verse(1, 1, 1, 2),
         verse(2, 1, 1, 3),
         verse(10, 43, 8, 12),
         verse(11, 43, 8, 13),
      ]);
      let index = build_search_index(&exported_books(), &verse_map, "English");

      assert_eq!(index.books.len(), 66);
      assert_eq!(index.books[0].chapters, vec![[0, 1, 3]]);
      let john = &index.books[42];
      assert_eq!(john.chapters.len(), 8);
      assert_eq!(john.chapters[7], [10, 12, 2]);
      assert_eq!(john.chapters[0], [0, 1, 0]);
      assert!(john.keys.contains(&"jn".to_string()));
      assert!(index.books[45].keys.contains(&"1cor".to_string()));
      assert!(index.irregular_verses.is_empty());
      assert!(search_keys_are_unique(&index));
   }

   #[test]
   fn search_index_reports_irregular_verses() {
      let verse_map = HashMap::from([verse(0, 1, 1, 1), verse(5, 1, 1, 2)]);
      let index = build_search_index(&exported_books(), &verse_map, "English");

      assert_eq!(index.books[0].chapters, vec![[0, 1, 1]]);
      assert_eq!(index.irregular_verses, vec![[5, 1, 1, 2]]);
   }

   #[test]
   fn italian_index_keeps_localized_and_english_keys() {
      let mut books = exported_books();
      books[42].name = "Giovanni".to_string();
      books[42].short_name = "Giovanni".to_string();
      let index = build_search_index(&books, &HashMap::new(), "Italian");
      let john = &index.books[42];

      assert!(john.keys.contains(&"giovanni".to_string()));
      assert!(john.keys.contains(&"gv".to_string()));
      assert!(john.keys.contains(&"john".to_string()));
      assert!(john.keys.contains(&"jn".to_string()));
      assert!(index.books[0].keys.contains(&"gn".to_string()));
      assert!(search_keys_are_unique(&index));
   }

   #[test]
   fn verse_degree_counts_ranges_like_target_adjacency() {
      let verse_map = HashMap::from([
         verse(0, 1, 1, 1),
         verse(1, 1, 1, 2),
         verse(3, 1, 1, 3),
         verse(4, 1, 1, 4),
      ]);
      let edges = vec![
         edge((1, 1, 0), (1, 1, 1, 4), EdgeKind::CrossReference),
         edge((1, 1, 4), (1, 1, 0, 0), EdgeKind::CrossReference),
      ];
      let study = vec![edge((1, 1, 0), (1, 1, 3, 3), EdgeKind::StudyNoteReference)];

      let degree = build_verse_degree(&edges, &study, &verse_map);

      assert_eq!(degree.length, 5);
      assert_eq!(degree.outgoing, vec![1, 0, 0, 0, 1]);
      // id 2 is not a mapped verse, so the range 1..=4 counts ids 1, 3 and 4.
      assert_eq!(degree.incoming, vec![1, 1, 0, 1, 1]);
      assert_eq!(degree.out_study, vec![1, 0, 0, 0, 0]);
      assert_eq!(degree.in_study, vec![0, 0, 0, 1, 0]);

      let json = serde_json::to_value(&degree).expect("degree should serialize");
      assert!(json.get("in").is_some() && json.get("outStudy").is_some());
   }

   #[test]
   fn chapter_matrices_aggregate_by_chapter_and_book() {
      let cross = vec![
         edge((45, 12, 1), (52, 5, 2, 2), EdgeKind::CrossReference),
         edge((45, 12, 3), (52, 5, 4, 4), EdgeKind::CrossReference),
         edge((45, 1, 5), (1, 1, 6, 6), EdgeKind::CrossReference),
      ];
      let study = vec![edge(
         (45, 12, 1),
         (52, 5, 2, 2),
         EdgeKind::StudyNoteReference,
      )];

      let matrices = build_chapter_matrices(&cross, &study);
      let romans = &matrices[44];

      assert_eq!(romans.chapters, 16);
      assert_eq!(romans.outgoing.len(), 16);
      assert_eq!(romans.outgoing[11], vec![[52, 2, 1, 3]]);
      assert_eq!(romans.outgoing[0], vec![[1, 1, 0, 1]]);
      assert_eq!(matrices[51].incoming[4], vec![[45, 2, 1, 3]]);
      assert_eq!(matrices[0].incoming[0], vec![[45, 1, 0, 1]]);
   }
}
