#![allow(clippy::upper_case_acronyms)]
//! Core BibliaMap data structures shared by the extractor and frontend schema.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

pub const BOOK_COUNT: usize = 66;

/// Testament classification for a Bible book.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Testament {
   OT,
   NT,
}

/// Static metadata for one Bible book.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BookMetadata {
   pub book_number: u8,
   pub name: &'static str,
   pub short_name: &'static str,
   pub slug: &'static str,
   pub testament: Testament,
   pub chapters: u16,
}

/// JSON export shape for book metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookExport {
   pub book_number: u8,
   pub name: String,
   pub short_name: String,
   pub slug: String,
   pub testament: Testament,
   pub chapters: u16,
}

/// Canonical verse metadata used by generated files.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerseRef {
   pub jwpub_verse_id: i32,
   pub canonical_verse_id: i32,
   pub book_number: u8,
   pub chapter_number: u16,
   pub verse_number: u16,
   pub label: String,
}

/// Edge categories currently understood by BibliaMap.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
   CrossReference,
   StudyNoteReference,
   FootnoteReference,
}

impl EdgeKind {
   pub fn code(self) -> u8 {
      match self {
         EdgeKind::CrossReference => 0,
         EdgeKind::StudyNoteReference => 1,
         EdgeKind::FootnoteReference => 2,
      }
   }

   pub fn label(self) -> &'static str {
      match self {
         EdgeKind::CrossReference => "cross_reference",
         EdgeKind::StudyNoteReference => "study_note_reference",
         EdgeKind::FootnoteReference => "footnote_reference",
      }
   }
}

/// A normalized Bible graph edge.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BibleEdge {
   pub source_verse_id: i32,
   pub target_start_verse_id: i32,
   pub target_end_verse_id: i32,
   pub kind: EdgeKind,
   pub source_book_number: u8,
   pub target_book_number: u8,
   pub source_chapter_number: u16,
   pub target_chapter_number: u16,
   pub paragraph_ordinal: Option<i32>,
   pub sort_position: Option<i32>,
   pub commentary_id: Option<i32>,
   pub document_id: Option<i32>,
}

/// Column-oriented compact edge export.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactEdges {
   pub source: Vec<i32>,
   pub target_start: Vec<i32>,
   pub target_end: Vec<i32>,
   pub kind: Vec<u8>,
   pub paragraph_ordinal: Vec<Option<i32>>,
   pub sort_position: Vec<Option<i32>>,
   pub commentary_id: Vec<Option<i32>>,
   pub document_id: Vec<Option<i32>>,
}

impl CompactEdges {
   pub fn from_edges(edges: &[BibleEdge]) -> Self {
      let mut compact_edges = Self::default();

      for edge in edges {
         compact_edges.source.push(edge.source_verse_id);
         compact_edges.target_start.push(edge.target_start_verse_id);
         compact_edges.target_end.push(edge.target_end_verse_id);
         compact_edges.kind.push(edge.kind.code());
         compact_edges.paragraph_ordinal.push(edge.paragraph_ordinal);
         compact_edges.sort_position.push(edge.sort_position);
         compact_edges.commentary_id.push(edge.commentary_id);
         compact_edges.document_id.push(edge.document_id);
      }

      compact_edges
   }
}

/// Lightweight adjacency edge stored in per-book files.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjacentEdge {
   pub source: i32,
   pub target_start: i32,
   pub target_end: i32,
   pub kind: u8,
   pub paragraph_ordinal: Option<i32>,
   pub sort_position: Option<i32>,
   pub commentary_id: Option<i32>,
   pub document_id: Option<i32>,
}

impl From<&BibleEdge> for AdjacentEdge {
   fn from(edge: &BibleEdge) -> Self {
      Self {
         source: edge.source_verse_id,
         target_start: edge.target_start_verse_id,
         target_end: edge.target_end_verse_id,
         kind: edge.kind.code(),
         paragraph_ordinal: edge.paragraph_ordinal,
         sort_position: edge.sort_position,
         commentary_id: edge.commentary_id,
         document_id: edge.document_id,
      }
   }
}

/// Source adjacency bucket for one selected verse.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceAdjacency {
   pub outgoing: Vec<AdjacentEdge>,
}

/// Target adjacency bucket for one referenced verse.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TargetAdjacency {
   pub incoming: Vec<AdjacentEdge>,
}

/// One strong book-to-book connection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookLinkStat {
   pub source_book_number: u8,
   pub source_book: String,
   pub target_book_number: u8,
   pub target_book: String,
   pub weight: u32,
}

/// One top verse statistic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerseStat {
   pub verse_id: i32,
   pub label: String,
   pub book_number: u8,
   pub chapter_number: u16,
   pub count: u32,
}

pub type BookMatrix = Vec<Vec<u32>>;

pub static BOOKS: [BookMetadata; BOOK_COUNT] = [
   BookMetadata {
      book_number: 1,
      name: "Genesis",
      short_name: "Gen.",
      slug: "genesis",
      testament: Testament::OT,
      chapters: 50,
   },
   BookMetadata {
      book_number: 2,
      name: "Exodus",
      short_name: "Ex.",
      slug: "exodus",
      testament: Testament::OT,
      chapters: 40,
   },
   BookMetadata {
      book_number: 3,
      name: "Leviticus",
      short_name: "Lev.",
      slug: "leviticus",
      testament: Testament::OT,
      chapters: 27,
   },
   BookMetadata {
      book_number: 4,
      name: "Numbers",
      short_name: "Num.",
      slug: "numbers",
      testament: Testament::OT,
      chapters: 36,
   },
   BookMetadata {
      book_number: 5,
      name: "Deuteronomy",
      short_name: "Deut.",
      slug: "deuteronomy",
      testament: Testament::OT,
      chapters: 34,
   },
   BookMetadata {
      book_number: 6,
      name: "Joshua",
      short_name: "Josh.",
      slug: "joshua",
      testament: Testament::OT,
      chapters: 24,
   },
   BookMetadata {
      book_number: 7,
      name: "Judges",
      short_name: "Judg.",
      slug: "judges",
      testament: Testament::OT,
      chapters: 21,
   },
   BookMetadata {
      book_number: 8,
      name: "Ruth",
      short_name: "Ruth",
      slug: "ruth",
      testament: Testament::OT,
      chapters: 4,
   },
   BookMetadata {
      book_number: 9,
      name: "1 Samuel",
      short_name: "1 Sam.",
      slug: "1-samuel",
      testament: Testament::OT,
      chapters: 31,
   },
   BookMetadata {
      book_number: 10,
      name: "2 Samuel",
      short_name: "2 Sam.",
      slug: "2-samuel",
      testament: Testament::OT,
      chapters: 24,
   },
   BookMetadata {
      book_number: 11,
      name: "1 Kings",
      short_name: "1 Ki.",
      slug: "1-kings",
      testament: Testament::OT,
      chapters: 22,
   },
   BookMetadata {
      book_number: 12,
      name: "2 Kings",
      short_name: "2 Ki.",
      slug: "2-kings",
      testament: Testament::OT,
      chapters: 25,
   },
   BookMetadata {
      book_number: 13,
      name: "1 Chronicles",
      short_name: "1 Chron.",
      slug: "1-chronicles",
      testament: Testament::OT,
      chapters: 29,
   },
   BookMetadata {
      book_number: 14,
      name: "2 Chronicles",
      short_name: "2 Chron.",
      slug: "2-chronicles",
      testament: Testament::OT,
      chapters: 36,
   },
   BookMetadata {
      book_number: 15,
      name: "Ezra",
      short_name: "Ezra",
      slug: "ezra",
      testament: Testament::OT,
      chapters: 10,
   },
   BookMetadata {
      book_number: 16,
      name: "Nehemiah",
      short_name: "Neh.",
      slug: "nehemiah",
      testament: Testament::OT,
      chapters: 13,
   },
   BookMetadata {
      book_number: 17,
      name: "Esther",
      short_name: "Esther",
      slug: "esther",
      testament: Testament::OT,
      chapters: 10,
   },
   BookMetadata {
      book_number: 18,
      name: "Job",
      short_name: "Job",
      slug: "job",
      testament: Testament::OT,
      chapters: 42,
   },
   BookMetadata {
      book_number: 19,
      name: "Psalms",
      short_name: "Ps.",
      slug: "psalms",
      testament: Testament::OT,
      chapters: 150,
   },
   BookMetadata {
      book_number: 20,
      name: "Proverbs",
      short_name: "Prov.",
      slug: "proverbs",
      testament: Testament::OT,
      chapters: 31,
   },
   BookMetadata {
      book_number: 21,
      name: "Ecclesiastes",
      short_name: "Eccl.",
      slug: "ecclesiastes",
      testament: Testament::OT,
      chapters: 12,
   },
   BookMetadata {
      book_number: 22,
      name: "Song of Solomon",
      short_name: "Song",
      slug: "song-of-solomon",
      testament: Testament::OT,
      chapters: 8,
   },
   BookMetadata {
      book_number: 23,
      name: "Isaiah",
      short_name: "Isa.",
      slug: "isaiah",
      testament: Testament::OT,
      chapters: 66,
   },
   BookMetadata {
      book_number: 24,
      name: "Jeremiah",
      short_name: "Jer.",
      slug: "jeremiah",
      testament: Testament::OT,
      chapters: 52,
   },
   BookMetadata {
      book_number: 25,
      name: "Lamentations",
      short_name: "Lam.",
      slug: "lamentations",
      testament: Testament::OT,
      chapters: 5,
   },
   BookMetadata {
      book_number: 26,
      name: "Ezekiel",
      short_name: "Ezek.",
      slug: "ezekiel",
      testament: Testament::OT,
      chapters: 48,
   },
   BookMetadata {
      book_number: 27,
      name: "Daniel",
      short_name: "Dan.",
      slug: "daniel",
      testament: Testament::OT,
      chapters: 12,
   },
   BookMetadata {
      book_number: 28,
      name: "Hosea",
      short_name: "Hos.",
      slug: "hosea",
      testament: Testament::OT,
      chapters: 14,
   },
   BookMetadata {
      book_number: 29,
      name: "Joel",
      short_name: "Joel",
      slug: "joel",
      testament: Testament::OT,
      chapters: 3,
   },
   BookMetadata {
      book_number: 30,
      name: "Amos",
      short_name: "Amos",
      slug: "amos",
      testament: Testament::OT,
      chapters: 9,
   },
   BookMetadata {
      book_number: 31,
      name: "Obadiah",
      short_name: "Obad.",
      slug: "obadiah",
      testament: Testament::OT,
      chapters: 1,
   },
   BookMetadata {
      book_number: 32,
      name: "Jonah",
      short_name: "Jonah",
      slug: "jonah",
      testament: Testament::OT,
      chapters: 4,
   },
   BookMetadata {
      book_number: 33,
      name: "Micah",
      short_name: "Mic.",
      slug: "micah",
      testament: Testament::OT,
      chapters: 7,
   },
   BookMetadata {
      book_number: 34,
      name: "Nahum",
      short_name: "Nah.",
      slug: "nahum",
      testament: Testament::OT,
      chapters: 3,
   },
   BookMetadata {
      book_number: 35,
      name: "Habakkuk",
      short_name: "Hab.",
      slug: "habakkuk",
      testament: Testament::OT,
      chapters: 3,
   },
   BookMetadata {
      book_number: 36,
      name: "Zephaniah",
      short_name: "Zeph.",
      slug: "zephaniah",
      testament: Testament::OT,
      chapters: 3,
   },
   BookMetadata {
      book_number: 37,
      name: "Haggai",
      short_name: "Hag.",
      slug: "haggai",
      testament: Testament::OT,
      chapters: 2,
   },
   BookMetadata {
      book_number: 38,
      name: "Zechariah",
      short_name: "Zech.",
      slug: "zechariah",
      testament: Testament::OT,
      chapters: 14,
   },
   BookMetadata {
      book_number: 39,
      name: "Malachi",
      short_name: "Mal.",
      slug: "malachi",
      testament: Testament::OT,
      chapters: 4,
   },
   BookMetadata {
      book_number: 40,
      name: "Matthew",
      short_name: "Matt.",
      slug: "matthew",
      testament: Testament::NT,
      chapters: 28,
   },
   BookMetadata {
      book_number: 41,
      name: "Mark",
      short_name: "Mark",
      slug: "mark",
      testament: Testament::NT,
      chapters: 16,
   },
   BookMetadata {
      book_number: 42,
      name: "Luke",
      short_name: "Luke",
      slug: "luke",
      testament: Testament::NT,
      chapters: 24,
   },
   BookMetadata {
      book_number: 43,
      name: "John",
      short_name: "John",
      slug: "john",
      testament: Testament::NT,
      chapters: 21,
   },
   BookMetadata {
      book_number: 44,
      name: "Acts",
      short_name: "Acts",
      slug: "acts",
      testament: Testament::NT,
      chapters: 28,
   },
   BookMetadata {
      book_number: 45,
      name: "Romans",
      short_name: "Rom.",
      slug: "romans",
      testament: Testament::NT,
      chapters: 16,
   },
   BookMetadata {
      book_number: 46,
      name: "1 Corinthians",
      short_name: "1 Cor.",
      slug: "1-corinthians",
      testament: Testament::NT,
      chapters: 16,
   },
   BookMetadata {
      book_number: 47,
      name: "2 Corinthians",
      short_name: "2 Cor.",
      slug: "2-corinthians",
      testament: Testament::NT,
      chapters: 13,
   },
   BookMetadata {
      book_number: 48,
      name: "Galatians",
      short_name: "Gal.",
      slug: "galatians",
      testament: Testament::NT,
      chapters: 6,
   },
   BookMetadata {
      book_number: 49,
      name: "Ephesians",
      short_name: "Eph.",
      slug: "ephesians",
      testament: Testament::NT,
      chapters: 6,
   },
   BookMetadata {
      book_number: 50,
      name: "Philippians",
      short_name: "Phil.",
      slug: "philippians",
      testament: Testament::NT,
      chapters: 4,
   },
   BookMetadata {
      book_number: 51,
      name: "Colossians",
      short_name: "Col.",
      slug: "colossians",
      testament: Testament::NT,
      chapters: 4,
   },
   BookMetadata {
      book_number: 52,
      name: "1 Thessalonians",
      short_name: "1 Thess.",
      slug: "1-thessalonians",
      testament: Testament::NT,
      chapters: 5,
   },
   BookMetadata {
      book_number: 53,
      name: "2 Thessalonians",
      short_name: "2 Thess.",
      slug: "2-thessalonians",
      testament: Testament::NT,
      chapters: 3,
   },
   BookMetadata {
      book_number: 54,
      name: "1 Timothy",
      short_name: "1 Tim.",
      slug: "1-timothy",
      testament: Testament::NT,
      chapters: 6,
   },
   BookMetadata {
      book_number: 55,
      name: "2 Timothy",
      short_name: "2 Tim.",
      slug: "2-timothy",
      testament: Testament::NT,
      chapters: 4,
   },
   BookMetadata {
      book_number: 56,
      name: "Titus",
      short_name: "Titus",
      slug: "titus",
      testament: Testament::NT,
      chapters: 3,
   },
   BookMetadata {
      book_number: 57,
      name: "Philemon",
      short_name: "Philem.",
      slug: "philemon",
      testament: Testament::NT,
      chapters: 1,
   },
   BookMetadata {
      book_number: 58,
      name: "Hebrews",
      short_name: "Heb.",
      slug: "hebrews",
      testament: Testament::NT,
      chapters: 13,
   },
   BookMetadata {
      book_number: 59,
      name: "James",
      short_name: "Jas.",
      slug: "james",
      testament: Testament::NT,
      chapters: 5,
   },
   BookMetadata {
      book_number: 60,
      name: "1 Peter",
      short_name: "1 Pet.",
      slug: "1-peter",
      testament: Testament::NT,
      chapters: 5,
   },
   BookMetadata {
      book_number: 61,
      name: "2 Peter",
      short_name: "2 Pet.",
      slug: "2-peter",
      testament: Testament::NT,
      chapters: 3,
   },
   BookMetadata {
      book_number: 62,
      name: "1 John",
      short_name: "1 John",
      slug: "1-john",
      testament: Testament::NT,
      chapters: 5,
   },
   BookMetadata {
      book_number: 63,
      name: "2 John",
      short_name: "2 John",
      slug: "2-john",
      testament: Testament::NT,
      chapters: 1,
   },
   BookMetadata {
      book_number: 64,
      name: "3 John",
      short_name: "3 John",
      slug: "3-john",
      testament: Testament::NT,
      chapters: 1,
   },
   BookMetadata {
      book_number: 65,
      name: "Jude",
      short_name: "Jude",
      slug: "jude",
      testament: Testament::NT,
      chapters: 1,
   },
   BookMetadata {
      book_number: 66,
      name: "Revelation",
      short_name: "Rev.",
      slug: "revelation",
      testament: Testament::NT,
      chapters: 22,
   },
];

pub fn exported_books() -> Vec<BookExport> {
   BOOKS
      .iter()
      .map(|book| BookExport {
         book_number: book.book_number,
         name: book.name.to_string(),
         short_name: book.short_name.to_string(),
         slug: book.slug.to_string(),
         testament: book.testament,
         chapters: book.chapters,
      })
      .collect()
}

pub fn book_by_number(book_number: u8) -> Option<&'static BookMetadata> {
   if (1..=BOOK_COUNT as u8).contains(&book_number) {
      Some(&BOOKS[(book_number - 1) as usize])
   } else {
      None
   }
}

pub fn book_file_name(book_number: u8) -> String {
   let book = book_by_number(book_number).expect("book number should be valid");

   format!("{:02}.{}.json", book.book_number, book.slug)
}

pub fn canonical_verse_id(book_number: u8, chapter_number: u16, verse_number: u16) -> i32 {
   (i32::from(book_number) * 1_000_000)
      + (i32::from(chapter_number) * 1_000)
      + i32::from(verse_number)
}

pub fn verse_label(book_number: u8, chapter_number: u16, verse_number: u16) -> String {
   let book = book_by_number(book_number).expect("book number should be valid");

   format!("{} {}:{}", book.name, chapter_number, verse_number)
}

pub fn empty_book_matrix() -> BookMatrix {
   vec![vec![0; BOOK_COUNT]; BOOK_COUNT]
}

pub fn build_book_matrix(edges: &[BibleEdge]) -> BookMatrix {
   let mut matrix = empty_book_matrix();

   for edge in edges {
      let source_index = usize::from(edge.source_book_number - 1);
      let target_index = usize::from(edge.target_book_number - 1);
      matrix[source_index][target_index] += 1;
   }

   matrix
}

pub fn matrix_total(matrix: &BookMatrix) -> u32 {
   matrix.iter().flatten().sum()
}

pub fn distinct_book_links(matrix: &BookMatrix) -> usize {
   matrix
      .iter()
      .flatten()
      .filter(|weight| **weight > 0)
      .count()
}

pub fn strongest_book_links(matrix: &BookMatrix, limit: usize) -> Vec<BookLinkStat> {
   let mut links = Vec::new();

   for (source_index, row) in matrix.iter().enumerate() {
      for (target_index, weight) in row.iter().enumerate() {
         if *weight == 0 {
            continue;
         }

         let source_book = &BOOKS[source_index];
         let target_book = &BOOKS[target_index];
         links.push(BookLinkStat {
            source_book_number: source_book.book_number,
            source_book: source_book.name.to_string(),
            target_book_number: target_book.book_number,
            target_book: target_book.name.to_string(),
            weight: *weight,
         });
      }
   }

   links.sort_by(|left, right| {
      right
         .weight
         .cmp(&left.weight)
         .then_with(|| left.source_book_number.cmp(&right.source_book_number))
         .then_with(|| left.target_book_number.cmp(&right.target_book_number))
   });
   links.truncate(limit);

   links
}

pub fn testament_breakdown(edges: &[BibleEdge]) -> BTreeMap<String, u32> {
   let mut breakdown = BTreeMap::from([
      ("OT->OT".to_string(), 0),
      ("OT->NT".to_string(), 0),
      ("NT->OT".to_string(), 0),
      ("NT->NT".to_string(), 0),
   ]);

   for edge in edges {
      let source_testament = book_by_number(edge.source_book_number)
         .expect("source book should exist")
         .testament;
      let target_testament = book_by_number(edge.target_book_number)
         .expect("target book should exist")
         .testament;
      let key = format!("{source_testament:?}->{target_testament:?}");
      *breakdown.entry(key).or_default() += 1;
   }

   breakdown
}

pub fn top_verses(
   counts: &HashMap<i32, u32>,
   verse_map: &HashMap<i32, VerseRef>,
   limit: usize,
) -> Vec<VerseStat> {
   let mut stats = counts
      .iter()
      .filter_map(|(verse_id, count)| {
         verse_map.get(verse_id).map(|verse| VerseStat {
            verse_id: *verse_id,
            label: verse.label.clone(),
            book_number: verse.book_number,
            chapter_number: verse.chapter_number,
            count: *count,
         })
      })
      .collect::<Vec<_>>();

   stats.sort_by(|left, right| {
      right
         .count
         .cmp(&left.count)
         .then_with(|| left.verse_id.cmp(&right.verse_id))
   });
   stats.truncate(limit);

   stats
}

#[cfg(test)]
mod tests {
   use super::*;

   #[test]
   fn contains_all_books() {
      assert_eq!(BOOKS.len(), 66);
      assert_eq!(BOOKS[0].name, "Genesis");
      assert_eq!(BOOKS[44].name, "Romans");
      assert_eq!(BOOKS[65].name, "Revelation");
   }

   #[test]
   fn builds_canonical_verse_id() {
      assert_eq!(canonical_verse_id(45, 12, 12), 45_012_012);
      assert_eq!(verse_label(45, 12, 12), "Romans 12:12");
   }

   #[test]
   fn aggregates_book_matrix() {
      let edges = vec![
         BibleEdge {
            source_verse_id: 1,
            target_start_verse_id: 2,
            target_end_verse_id: 2,
            kind: EdgeKind::CrossReference,
            source_book_number: 45,
            target_book_number: 52,
            source_chapter_number: 12,
            target_chapter_number: 5,
            paragraph_ordinal: None,
            sort_position: None,
            commentary_id: None,
            document_id: None,
         },
         BibleEdge {
            source_verse_id: 3,
            target_start_verse_id: 4,
            target_end_verse_id: 4,
            kind: EdgeKind::StudyNoteReference,
            source_book_number: 45,
            target_book_number: 52,
            source_chapter_number: 12,
            target_chapter_number: 5,
            paragraph_ordinal: None,
            sort_position: None,
            commentary_id: None,
            document_id: None,
         },
      ];
      let matrix = build_book_matrix(&edges);

      assert_eq!(matrix[44][51], 2);
      assert_eq!(matrix_total(&matrix), 2);
      assert_eq!(distinct_book_links(&matrix), 1);
   }
}
