#![allow(clippy::upper_case_acronyms)]
//! Build-time extractor for BibliaMap static frontend data.

use std::{
   collections::{BTreeMap, BTreeSet, HashMap, HashSet},
   fs::{self, File},
   path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use bibliamap_core::{
   AdjacentEdge, BOOKS, BibleEdge, BookLinkStat, BookMatrix, CompactEdges, EdgeKind,
   SourceAdjacency, TargetAdjacency, Testament, VerseRef, VerseStat, book_by_number,
   book_file_name, build_book_matrix, canonical_verse_id, distinct_book_links, exported_books,
   matrix_total, strongest_book_links, testament_breakdown, top_verses, verse_label,
};
use chrono::{SecondsFormat, Utc};
use clap::Parser;
use jwpub_reader::open_jwpub;
use rusqlite::{Connection, Row};
use serde::Serialize;

#[derive(Debug, Parser)]
#[command(author, version, about)]
struct Args {
   #[arg(long)]
   input: PathBuf,

   #[arg(long, default_value = "nwtsty")]
   dataset: String,

   #[arg(long)]
   output: PathBuf,

   #[arg(long, default_value_t = false)]
   pretty: bool,

   #[arg(long, default_value_t = false)]
   compact: bool,

   #[arg(long, default_value_t = false)]
   include_text: bool,

   #[arg(long, default_value_t = false)]
   no_text: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestExport {
   dataset_id: String,
   publication_symbol: String,
   publication_title: String,
   publication_year: Option<i32>,
   language: String,
   generated_at: String,
   schema_version: u8,
   available_edge_kinds: Vec<String>,
   has_verse_text: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChapterExport {
   book_number: u8,
   chapter_number: u16,
   label: String,
   first_verse_id: i32,
   last_verse_id: i32,
   verses: Vec<ChapterVerseExport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChapterVerseExport {
   jwpub_verse_id: i32,
   canonical_verse_id: i32,
   verse_number: u16,
   label: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractionSkippedRows {
   direct_unmapped: u32,
   study_note_unmapped: u32,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractionReport {
   mapped_verses: usize,
   direct_cross_reference_edges: usize,
   study_note_reference_edges: usize,
   notes_with_bible_references: usize,
   skipped_rows: ExtractionSkippedRows,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CountByBook {
   book_number: u8,
   book: String,
   testament: Testament,
   count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CountByChapter {
   book_number: u8,
   chapter_number: u16,
   label: String,
   count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SelfLinkStats {
   cross_references: u32,
   study_note_references: u32,
   combined: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphComparison {
   cross_reference_only_book_links: usize,
   study_note_only_book_links: usize,
   shared_book_links: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatsSummary {
   dataset_id: String,
   publication_symbol: String,
   publication_title: String,
   publication_year: Option<i32>,
   generated_at: String,
   total_cross_references: usize,
   total_study_note_references: usize,
   total_combined_references: usize,
   distinct_source_verses: usize,
   distinct_target_verses: usize,
   distinct_book_to_book_links: usize,
   cross_testament_breakdown: BTreeMap<String, u32>,
   top_outgoing_books: Vec<CountByBook>,
   top_incoming_books: Vec<CountByBook>,
   top_source_verses: Vec<VerseStat>,
   top_referenced_verses: Vec<VerseStat>,
   top_dense_chapters: Vec<CountByChapter>,
   strongest_book_links: Vec<BookLinkStat>,
   strongest_ot_to_nt_connections: Vec<BookLinkStat>,
   strongest_nt_to_ot_connections: Vec<BookLinkStat>,
   self_link_stats: SelfLinkStats,
   graph_comparison: GraphComparison,
   extraction: ExtractionReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BookStats {
   book_number: u8,
   book: String,
   testament: Testament,
   outgoing_cross_references: u32,
   incoming_cross_references: u32,
   outgoing_study_note_references: u32,
   incoming_study_note_references: u32,
   outgoing_combined_references: u32,
   incoming_combined_references: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChapterStats {
   book_number: u8,
   chapter_number: u16,
   label: String,
   outgoing: u32,
   incoming: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VerseStatsExport {
   top_sources: Vec<VerseStat>,
   top_targets: Vec<VerseStat>,
}

#[derive(Debug, Clone)]
struct RawDirectCitation {
   source_verse_id: i32,
   target_start_verse_id: i32,
   target_end_verse_id: i32,
   paragraph_ordinal: Option<i32>,
   sort_position: Option<i32>,
}

#[derive(Debug, Clone)]
struct RawStudyCitation {
   source_verse_id: i32,
   target_start_verse_id: i32,
   target_end_verse_id: i32,
   commentary_id: i32,
   document_id: i32,
   paragraph_ordinal: Option<i32>,
   sort_position: Option<i32>,
}

fn main() -> Result<()> {
   let args = Args::parse();
   let opened_jwpub = open_jwpub(&args.input)
      .with_context(|| format!("failed to open {}", args.input.display()))?;
   let manifest = opened_jwpub.manifest().clone();
   let connection = opened_jwpub.connection();
   let verse_map = load_verse_map(connection)?;
   let chapter_exports = build_chapter_exports(&verse_map);
   let (cross_reference_edges, skipped_direct) = extract_direct_edges(connection, &verse_map)?;
   let (study_note_edges, skipped_study, notes_with_references) =
      extract_study_note_edges(connection, &verse_map)?;
   let combined_edges = combined_edges(&cross_reference_edges, &study_note_edges);
   let generated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
   let manifest_export = ManifestExport {
      dataset_id: args.dataset.clone(),
      publication_symbol: manifest.publication.symbol.clone(),
      publication_title: manifest.publication.title.clone(),
      publication_year: manifest.publication.year,
      language: language_name(manifest.publication.language),
      generated_at: generated_at.clone(),
      schema_version: 1,
      available_edge_kinds: vec![
         EdgeKind::CrossReference.label().to_string(),
         EdgeKind::StudyNoteReference.label().to_string(),
      ],
      has_verse_text: args.include_text && !args.no_text,
   };
   let extraction = ExtractionReport {
      mapped_verses: verse_map.len(),
      direct_cross_reference_edges: cross_reference_edges.len(),
      study_note_reference_edges: study_note_edges.len(),
      notes_with_bible_references: notes_with_references,
      skipped_rows: ExtractionSkippedRows {
         direct_unmapped: skipped_direct,
         study_note_unmapped: skipped_study,
      },
   };
   let cross_reference_matrix = build_book_matrix(&cross_reference_edges);
   let study_note_matrix = build_book_matrix(&study_note_edges);
   let combined_matrix = build_book_matrix(&combined_edges);
   let summary = build_summary(
      &args.dataset,
      &manifest_export,
      &cross_reference_edges,
      &study_note_edges,
      &combined_edges,
      &cross_reference_matrix,
      &study_note_matrix,
      &combined_matrix,
      &verse_map,
      extraction.clone(),
   );
   let book_stats = build_book_stats(&cross_reference_edges, &study_note_edges);
   let chapter_stats = build_chapter_stats(&combined_edges, &verse_map);
   let verse_stats = build_verse_stats(&combined_edges, &verse_map);
   let pretty = args.pretty && !args.compact;

   write_generated_data(
      &args.output,
      pretty,
      &manifest_export,
      &verse_map,
      &chapter_exports,
      &cross_reference_edges,
      &study_note_edges,
      &combined_edges,
      &cross_reference_matrix,
      &study_note_matrix,
      &combined_matrix,
      &summary,
      &book_stats,
      &chapter_stats,
      &verse_stats,
   )?;

   println!("{}", serde_json::to_string_pretty(&summary)?);

   Ok(())
}

fn load_verse_map(connection: &Connection) -> Result<HashMap<i32, VerseRef>> {
   let mut statement = connection.prepare(
      r#"
      SELECT
         v.BibleVerseId,
         ch.BookNumber,
         ch.ChapterNumber,
         v.Label
      FROM BibleVerse v
      JOIN BibleChapter ch
         ON v.BibleVerseId BETWEEN ch.FirstVerseId AND ch.LastVerseId
      ORDER BY v.BibleVerseId
      "#,
   )?;
   let mut rows = statement.query([])?;
   let mut verse_map = HashMap::new();

   while let Some(row) = rows.next()? {
      let jwpub_verse_id: i32 = row.get(0)?;
      let book_number: u8 = row.get::<_, i32>(1)?.try_into()?;
      let chapter_number: u16 = row.get::<_, i32>(2)?.try_into()?;
      let label: String = row.get(3)?;

      if book_by_number(book_number).is_none() {
         continue;
      }

      if let Some(verse_number) = parse_verse_number(&label) {
         let canonical_verse_id = canonical_verse_id(book_number, chapter_number, verse_number);
         verse_map.insert(
            jwpub_verse_id,
            VerseRef {
               jwpub_verse_id,
               canonical_verse_id,
               book_number,
               chapter_number,
               verse_number,
               label: verse_label(book_number, chapter_number, verse_number),
            },
         );
      }
   }

   Ok(verse_map)
}

fn parse_verse_number(label: &str) -> Option<u16> {
   if label.contains(r#"class="cl""#) || label.contains("class='cl'") {
      return Some(1);
   }

   let mut digits = String::new();

   for character in label.chars() {
      if character.is_ascii_digit() {
         digits.push(character);
      } else if !digits.is_empty() {
         break;
      }
   }

   digits.parse().ok()
}

fn build_chapter_exports(verse_map: &HashMap<i32, VerseRef>) -> Vec<ChapterExport> {
   let mut chapters: BTreeMap<(u8, u16), Vec<&VerseRef>> = BTreeMap::new();

   for verse in verse_map.values() {
      chapters
         .entry((verse.book_number, verse.chapter_number))
         .or_default()
         .push(verse);
   }

   chapters
      .into_iter()
      .map(|((book_number, chapter_number), mut verses)| {
         verses.sort_by_key(|verse| verse.verse_number);
         let first_verse_id = verses
            .first()
            .expect("chapter should contain a verse")
            .jwpub_verse_id;
         let last_verse_id = verses
            .last()
            .expect("chapter should contain a verse")
            .jwpub_verse_id;
         let chapter_verses = verses
            .into_iter()
            .map(|verse| ChapterVerseExport {
               jwpub_verse_id: verse.jwpub_verse_id,
               canonical_verse_id: verse.canonical_verse_id,
               verse_number: verse.verse_number,
               label: verse.label.clone(),
            })
            .collect();
         let book = book_by_number(book_number).expect("book should exist");

         ChapterExport {
            book_number,
            chapter_number,
            label: format!("{} {}", book.name, chapter_number),
            first_verse_id,
            last_verse_id,
            verses: chapter_verses,
         }
      })
      .collect()
}

fn extract_direct_edges(
   connection: &Connection,
   verse_map: &HashMap<i32, VerseRef>,
) -> Result<(Vec<BibleEdge>, u32)> {
   let mut statement = connection.prepare(
      r#"
      SELECT
         bc.BibleVerseId AS SourceVerseId,
         bc.FirstBibleVerseId AS TargetStartVerseId,
         bc.LastBibleVerseId AS TargetEndVerseId,
         bc.ParagraphOrdinal,
         bc.SortPosition
      FROM BibleCitation bc
      WHERE bc.BibleVerseId IS NOT NULL
      ORDER BY bc.BibleCitationId
      "#,
   )?;
   let rows = statement.query_map([], raw_direct_citation_from_row)?;
   let mut edges = Vec::new();
   let mut skipped = 0;

   for row in rows {
      let citation = row?;
      if let Some(edge) = build_edge(
         citation.source_verse_id,
         citation.target_start_verse_id,
         citation.target_end_verse_id,
         EdgeKind::CrossReference,
         citation.paragraph_ordinal,
         citation.sort_position,
         None,
         None,
         verse_map,
      ) {
         edges.push(edge);
      } else {
         skipped += 1;
      }
   }

   Ok((edges, skipped))
}

fn raw_direct_citation_from_row(row: &Row<'_>) -> rusqlite::Result<RawDirectCitation> {
   Ok(RawDirectCitation {
      source_verse_id: row.get(0)?,
      target_start_verse_id: row.get(1)?,
      target_end_verse_id: row.get(2)?,
      paragraph_ordinal: row.get(3)?,
      sort_position: row.get(4)?,
   })
}

fn extract_study_note_edges(
   connection: &Connection,
   verse_map: &HashMap<i32, VerseRef>,
) -> Result<(Vec<BibleEdge>, u32, usize)> {
   let mut statement = connection.prepare(
      r#"
      SELECT
         vcm.BibleVerseId AS SourceVerseId,
         bc.FirstBibleVerseId AS TargetStartVerseId,
         bc.LastBibleVerseId AS TargetEndVerseId,
         vc.VerseCommentaryId AS CommentaryId,
         d.DocumentId AS CommentaryDocumentId,
         bc.ParagraphOrdinal,
         bc.SortPosition
      FROM VerseCommentary vc
      JOIN VerseCommentaryMap vcm
         ON vcm.VerseCommentaryId = vc.VerseCommentaryId
      JOIN Document d
         ON d.MepsDocumentId = vc.CommentaryMepsDocumentId
      JOIN BibleCitation bc
         ON bc.DocumentId = d.DocumentId
         AND bc.BibleVerseId IS NULL
         AND bc.ParagraphOrdinal BETWEEN vc.BeginParagraphOrdinal AND vc.EndParagraphOrdinal
      ORDER BY vc.VerseCommentaryId, bc.SortPosition
      "#,
   )?;
   let rows = statement.query_map([], raw_study_citation_from_row)?;
   let mut edges = Vec::new();
   let mut skipped = 0;
   let mut notes_with_references = HashSet::new();

   for row in rows {
      let citation = row?;
      notes_with_references.insert(citation.commentary_id);

      if let Some(edge) = build_edge(
         citation.source_verse_id,
         citation.target_start_verse_id,
         citation.target_end_verse_id,
         EdgeKind::StudyNoteReference,
         citation.paragraph_ordinal,
         citation.sort_position,
         Some(citation.commentary_id),
         Some(citation.document_id),
         verse_map,
      ) {
         edges.push(edge);
      } else {
         skipped += 1;
      }
   }

   Ok((edges, skipped, notes_with_references.len()))
}

fn raw_study_citation_from_row(row: &Row<'_>) -> rusqlite::Result<RawStudyCitation> {
   Ok(RawStudyCitation {
      source_verse_id: row.get(0)?,
      target_start_verse_id: row.get(1)?,
      target_end_verse_id: row.get(2)?,
      commentary_id: row.get(3)?,
      document_id: row.get(4)?,
      paragraph_ordinal: row.get(5)?,
      sort_position: row.get(6)?,
   })
}

#[allow(clippy::too_many_arguments)]
fn build_edge(
   source_verse_id: i32,
   target_start_verse_id: i32,
   target_end_verse_id: i32,
   kind: EdgeKind,
   paragraph_ordinal: Option<i32>,
   sort_position: Option<i32>,
   commentary_id: Option<i32>,
   document_id: Option<i32>,
   verse_map: &HashMap<i32, VerseRef>,
) -> Option<BibleEdge> {
   let source = verse_map.get(&source_verse_id)?;
   let target_start = verse_map.get(&target_start_verse_id)?;
   let _target_end = verse_map.get(&target_end_verse_id)?;

   Some(BibleEdge {
      source_verse_id,
      target_start_verse_id,
      target_end_verse_id,
      kind,
      source_book_number: source.book_number,
      target_book_number: target_start.book_number,
      source_chapter_number: source.chapter_number,
      target_chapter_number: target_start.chapter_number,
      paragraph_ordinal,
      sort_position,
      commentary_id,
      document_id,
   })
}

fn combined_edges(
   cross_reference_edges: &[BibleEdge],
   study_note_edges: &[BibleEdge],
) -> Vec<BibleEdge> {
   cross_reference_edges
      .iter()
      .chain(study_note_edges.iter())
      .cloned()
      .collect()
}

#[allow(clippy::too_many_arguments)]
fn build_summary(
   dataset_id: &str,
   manifest: &ManifestExport,
   cross_reference_edges: &[BibleEdge],
   study_note_edges: &[BibleEdge],
   combined_edges: &[BibleEdge],
   cross_reference_matrix: &BookMatrix,
   study_note_matrix: &BookMatrix,
   combined_matrix: &BookMatrix,
   verse_map: &HashMap<i32, VerseRef>,
   extraction: ExtractionReport,
) -> StatsSummary {
   let distinct_source_verses = combined_edges
      .iter()
      .map(|edge| edge.source_verse_id)
      .collect::<HashSet<_>>()
      .len();
   let distinct_target_verses = combined_edges
      .iter()
      .map(|edge| edge.target_start_verse_id)
      .collect::<HashSet<_>>()
      .len();
   let outgoing_books = count_books(combined_edges, EdgeDirection::Outgoing, 10);
   let incoming_books = count_books(combined_edges, EdgeDirection::Incoming, 10);
   let (source_verse_counts, target_verse_counts, chapter_counts) =
      count_verse_and_chapter_stats(combined_edges);

   StatsSummary {
      dataset_id: dataset_id.to_string(),
      publication_symbol: manifest.publication_symbol.clone(),
      publication_title: manifest.publication_title.clone(),
      publication_year: manifest.publication_year,
      generated_at: manifest.generated_at.clone(),
      total_cross_references: matrix_total(cross_reference_matrix) as usize,
      total_study_note_references: matrix_total(study_note_matrix) as usize,
      total_combined_references: matrix_total(combined_matrix) as usize,
      distinct_source_verses,
      distinct_target_verses,
      distinct_book_to_book_links: distinct_book_links(combined_matrix),
      cross_testament_breakdown: testament_breakdown(combined_edges),
      top_outgoing_books: outgoing_books,
      top_incoming_books: incoming_books,
      top_source_verses: top_verses(&source_verse_counts, verse_map, 12),
      top_referenced_verses: top_verses(&target_verse_counts, verse_map, 12),
      top_dense_chapters: top_chapters(&chapter_counts, 12),
      strongest_book_links: strongest_book_links(combined_matrix, 16),
      strongest_ot_to_nt_connections: filtered_book_links(
         combined_matrix,
         Testament::OT,
         Testament::NT,
         8,
      ),
      strongest_nt_to_ot_connections: filtered_book_links(
         combined_matrix,
         Testament::NT,
         Testament::OT,
         8,
      ),
      self_link_stats: SelfLinkStats {
         cross_references: self_links(cross_reference_edges),
         study_note_references: self_links(study_note_edges),
         combined: self_links(combined_edges),
      },
      graph_comparison: graph_comparison(cross_reference_matrix, study_note_matrix),
      extraction,
   }
}

#[derive(Debug, Clone, Copy)]
enum EdgeDirection {
   Outgoing,
   Incoming,
}

fn count_books(edges: &[BibleEdge], direction: EdgeDirection, limit: usize) -> Vec<CountByBook> {
   let mut counts: HashMap<u8, u32> = HashMap::new();

   for edge in edges {
      let book_number = match direction {
         EdgeDirection::Outgoing => edge.source_book_number,
         EdgeDirection::Incoming => edge.target_book_number,
      };
      *counts.entry(book_number).or_default() += 1;
   }

   let mut book_counts = counts
      .into_iter()
      .map(|(book_number, count)| {
         let book = book_by_number(book_number).expect("book should exist");

         CountByBook {
            book_number,
            book: book.name.to_string(),
            testament: book.testament,
            count,
         }
      })
      .collect::<Vec<_>>();
   book_counts.sort_by(|left, right| {
      right
         .count
         .cmp(&left.count)
         .then_with(|| left.book_number.cmp(&right.book_number))
   });
   book_counts.truncate(limit);

   book_counts
}

type CountedStats = (
   HashMap<i32, u32>,
   HashMap<i32, u32>,
   HashMap<(u8, u16), u32>,
);

fn count_verse_and_chapter_stats(edges: &[BibleEdge]) -> CountedStats {
   let mut source_verse_counts = HashMap::new();
   let mut target_verse_counts = HashMap::new();
   let mut chapter_counts = HashMap::new();

   for edge in edges {
      *source_verse_counts.entry(edge.source_verse_id).or_default() += 1;
      *target_verse_counts
         .entry(edge.target_start_verse_id)
         .or_default() += 1;
      *chapter_counts
         .entry((edge.source_book_number, edge.source_chapter_number))
         .or_default() += 1;
      *chapter_counts
         .entry((edge.target_book_number, edge.target_chapter_number))
         .or_default() += 1;
   }

   (source_verse_counts, target_verse_counts, chapter_counts)
}

fn top_chapters(chapter_counts: &HashMap<(u8, u16), u32>, limit: usize) -> Vec<CountByChapter> {
   let mut chapters = chapter_counts
      .iter()
      .map(|((book_number, chapter_number), count)| {
         let book = book_by_number(*book_number).expect("book should exist");

         CountByChapter {
            book_number: *book_number,
            chapter_number: *chapter_number,
            label: format!("{} {}", book.name, chapter_number),
            count: *count,
         }
      })
      .collect::<Vec<_>>();
   chapters.sort_by(|left, right| {
      right
         .count
         .cmp(&left.count)
         .then_with(|| left.book_number.cmp(&right.book_number))
         .then_with(|| left.chapter_number.cmp(&right.chapter_number))
   });
   chapters.truncate(limit);

   chapters
}

fn filtered_book_links(
   matrix: &BookMatrix,
   source_testament: Testament,
   target_testament: Testament,
   limit: usize,
) -> Vec<BookLinkStat> {
   let mut filtered = strongest_book_links(matrix, usize::MAX)
      .into_iter()
      .filter(|link| {
         let source_book = book_by_number(link.source_book_number).expect("book should exist");
         let target_book = book_by_number(link.target_book_number).expect("book should exist");

         source_book.testament == source_testament && target_book.testament == target_testament
      })
      .collect::<Vec<_>>();
   filtered.truncate(limit);

   filtered
}

fn self_links(edges: &[BibleEdge]) -> u32 {
   edges
      .iter()
      .filter(|edge| edge.source_book_number == edge.target_book_number)
      .count()
      .try_into()
      .expect("self-link count should fit in u32")
}

fn graph_comparison(
   cross_reference_matrix: &BookMatrix,
   study_note_matrix: &BookMatrix,
) -> GraphComparison {
   let cross_links = matrix_link_set(cross_reference_matrix);
   let study_links = matrix_link_set(study_note_matrix);
   let shared_book_links = cross_links.intersection(&study_links).count();

   GraphComparison {
      cross_reference_only_book_links: cross_links.difference(&study_links).count(),
      study_note_only_book_links: study_links.difference(&cross_links).count(),
      shared_book_links,
   }
}

fn matrix_link_set(matrix: &BookMatrix) -> BTreeSet<(usize, usize)> {
   let mut links = BTreeSet::new();

   for (source_index, row) in matrix.iter().enumerate() {
      for (target_index, weight) in row.iter().enumerate() {
         if *weight > 0 {
            links.insert((source_index, target_index));
         }
      }
   }

   links
}

fn build_book_stats(
   cross_reference_edges: &[BibleEdge],
   study_note_edges: &[BibleEdge],
) -> Vec<BookStats> {
   let cross_outgoing = count_book_direction(cross_reference_edges, EdgeDirection::Outgoing);
   let cross_incoming = count_book_direction(cross_reference_edges, EdgeDirection::Incoming);
   let study_outgoing = count_book_direction(study_note_edges, EdgeDirection::Outgoing);
   let study_incoming = count_book_direction(study_note_edges, EdgeDirection::Incoming);

   BOOKS
      .iter()
      .map(|book| {
         let outgoing_cross_references = *cross_outgoing.get(&book.book_number).unwrap_or(&0);
         let incoming_cross_references = *cross_incoming.get(&book.book_number).unwrap_or(&0);
         let outgoing_study_note_references = *study_outgoing.get(&book.book_number).unwrap_or(&0);
         let incoming_study_note_references = *study_incoming.get(&book.book_number).unwrap_or(&0);

         BookStats {
            book_number: book.book_number,
            book: book.name.to_string(),
            testament: book.testament,
            outgoing_cross_references,
            incoming_cross_references,
            outgoing_study_note_references,
            incoming_study_note_references,
            outgoing_combined_references: outgoing_cross_references
               + outgoing_study_note_references,
            incoming_combined_references: incoming_cross_references
               + incoming_study_note_references,
         }
      })
      .collect()
}

fn count_book_direction(edges: &[BibleEdge], direction: EdgeDirection) -> HashMap<u8, u32> {
   let mut counts = HashMap::new();

   for edge in edges {
      let book_number = match direction {
         EdgeDirection::Outgoing => edge.source_book_number,
         EdgeDirection::Incoming => edge.target_book_number,
      };
      *counts.entry(book_number).or_default() += 1;
   }

   counts
}

fn build_chapter_stats(
   edges: &[BibleEdge],
   verse_map: &HashMap<i32, VerseRef>,
) -> Vec<ChapterStats> {
   let mut chapter_keys = verse_map
      .values()
      .map(|verse| (verse.book_number, verse.chapter_number))
      .collect::<BTreeSet<_>>();
   let mut outgoing = HashMap::new();
   let mut incoming = HashMap::new();

   for edge in edges {
      chapter_keys.insert((edge.source_book_number, edge.source_chapter_number));
      chapter_keys.insert((edge.target_book_number, edge.target_chapter_number));
      *outgoing
         .entry((edge.source_book_number, edge.source_chapter_number))
         .or_default() += 1;
      *incoming
         .entry((edge.target_book_number, edge.target_chapter_number))
         .or_default() += 1;
   }

   chapter_keys
      .into_iter()
      .map(|(book_number, chapter_number)| {
         let book = book_by_number(book_number).expect("book should exist");

         ChapterStats {
            book_number,
            chapter_number,
            label: format!("{} {}", book.name, chapter_number),
            outgoing: *outgoing.get(&(book_number, chapter_number)).unwrap_or(&0),
            incoming: *incoming.get(&(book_number, chapter_number)).unwrap_or(&0),
         }
      })
      .collect()
}

fn build_verse_stats(edges: &[BibleEdge], verse_map: &HashMap<i32, VerseRef>) -> VerseStatsExport {
   let (source_verse_counts, target_verse_counts, _) = count_verse_and_chapter_stats(edges);

   VerseStatsExport {
      top_sources: top_verses(&source_verse_counts, verse_map, 50),
      top_targets: top_verses(&target_verse_counts, verse_map, 50),
   }
}

#[allow(clippy::too_many_arguments)]
fn write_generated_data(
   output: &Path,
   pretty: bool,
   manifest: &ManifestExport,
   verse_map: &HashMap<i32, VerseRef>,
   chapters: &[ChapterExport],
   cross_reference_edges: &[BibleEdge],
   study_note_edges: &[BibleEdge],
   combined_edges: &[BibleEdge],
   cross_reference_matrix: &BookMatrix,
   study_note_matrix: &BookMatrix,
   combined_matrix: &BookMatrix,
   summary: &StatsSummary,
   book_stats: &[BookStats],
   chapter_stats: &[ChapterStats],
   verse_stats: &VerseStatsExport,
) -> Result<()> {
   fs::create_dir_all(output)?;
   fs::create_dir_all(output.join("matrices"))?;
   fs::create_dir_all(output.join("edges"))?;
   fs::create_dir_all(output.join("adjacency/source"))?;
   fs::create_dir_all(output.join("adjacency/target"))?;
   fs::create_dir_all(output.join("verse-text"))?;

   write_json(output.join("manifest.json"), manifest, pretty)?;
   write_json(output.join("books.json"), &exported_books(), pretty)?;
   write_json(output.join("chapters.json"), chapters, pretty)?;
   write_json(
      output.join("verse-index.json"),
      &ordered_verse_map(verse_map),
      pretty,
   )?;
   write_json(
      output.join("matrices/book.crossrefs.json"),
      cross_reference_matrix,
      pretty,
   )?;
   write_json(
      output.join("matrices/book.study-notes.json"),
      study_note_matrix,
      pretty,
   )?;
   write_json(
      output.join("matrices/book.combined.json"),
      combined_matrix,
      pretty,
   )?;
   write_json(
      output.join("edges/crossrefs.compact.json"),
      &CompactEdges::from_edges(cross_reference_edges),
      pretty,
   )?;
   write_json(
      output.join("edges/study-notes.compact.json"),
      &CompactEdges::from_edges(study_note_edges),
      pretty,
   )?;
   write_json(
      output.join("edges/combined.compact.json"),
      &CompactEdges::from_edges(combined_edges),
      pretty,
   )?;
   write_json(output.join("stats.summary.json"), summary, pretty)?;
   write_json(output.join("stats.books.json"), book_stats, pretty)?;
   write_json(output.join("stats.chapters.json"), chapter_stats, pretty)?;
   write_json(output.join("stats.verses.json"), verse_stats, pretty)?;
   write_json(
      output.join("stats.testaments.json"),
      &testament_breakdown(combined_edges),
      pretty,
   )?;
   write_adjacency_files(output, cross_reference_edges, study_note_edges, pretty)?;

   Ok(())
}

fn ordered_verse_map(verse_map: &HashMap<i32, VerseRef>) -> BTreeMap<i32, VerseRef> {
   verse_map
      .iter()
      .map(|(verse_id, verse)| (*verse_id, verse.clone()))
      .collect()
}

fn write_adjacency_files(
   output: &Path,
   cross_reference_edges: &[BibleEdge],
   study_note_edges: &[BibleEdge],
   pretty: bool,
) -> Result<()> {
   let all_edges = combined_edges(cross_reference_edges, study_note_edges);
   let mut source_adjacency: BTreeMap<u8, BTreeMap<i32, SourceAdjacency>> = BTreeMap::new();
   let mut target_adjacency: BTreeMap<u8, BTreeMap<i32, TargetAdjacency>> = BTreeMap::new();

   for edge in &all_edges {
      source_adjacency
         .entry(edge.source_book_number)
         .or_default()
         .entry(edge.source_verse_id)
         .or_default()
         .outgoing
         .push(AdjacentEdge::from(edge));
      target_adjacency
         .entry(edge.target_book_number)
         .or_default()
         .entry(edge.target_start_verse_id)
         .or_default()
         .incoming
         .push(AdjacentEdge::from(edge));
   }

   for book in BOOKS {
      let file_name = book_file_name(book.book_number);
      let empty_source = BTreeMap::<i32, SourceAdjacency>::new();
      let empty_target = BTreeMap::<i32, TargetAdjacency>::new();
      let source_file = output.join("adjacency/source").join(&file_name);
      let target_file = output.join("adjacency/target").join(&file_name);

      write_json(
         source_file,
         source_adjacency
            .get(&book.book_number)
            .unwrap_or(&empty_source),
         pretty,
      )?;
      write_json(
         target_file,
         target_adjacency
            .get(&book.book_number)
            .unwrap_or(&empty_target),
         pretty,
      )?;
   }

   Ok(())
}

fn write_json(path: PathBuf, value: &(impl Serialize + ?Sized), pretty: bool) -> Result<()> {
   let file =
      File::create(&path).with_context(|| format!("failed to create {}", path.display()))?;

   if pretty {
      serde_json::to_writer_pretty(file, value)?;
   } else {
      serde_json::to_writer(file, value)?;
   }

   Ok(())
}

fn language_name(language: Option<i32>) -> String {
   match language {
      Some(0) => "English".to_string(),
      Some(index) => format!("Language {index}"),
      None => "Unknown".to_string(),
   }
}

#[cfg(test)]
mod tests {
   use super::*;

   #[test]
   fn parses_html_wrapped_verse_numbers() {
      assert_eq!(parse_verse_number(r#"<span class="cl">1</span>"#), Some(1));
      assert_eq!(
         parse_verse_number(r#"<span class="cl">110</span>"#),
         Some(1)
      );
      assert_eq!(
         parse_verse_number(r#"<span class="vl">12</span>"#),
         Some(12)
      );
      assert_eq!(parse_verse_number(""), None);
   }

   #[test]
   fn builds_chapter_exports_in_reference_order() {
      let verse_map = HashMap::from([
         (
            2,
            VerseRef {
               jwpub_verse_id: 2,
               canonical_verse_id: canonical_verse_id(45, 12, 2),
               book_number: 45,
               chapter_number: 12,
               verse_number: 2,
               label: "Romans 12:2".to_string(),
            },
         ),
         (
            1,
            VerseRef {
               jwpub_verse_id: 1,
               canonical_verse_id: canonical_verse_id(45, 12, 1),
               book_number: 45,
               chapter_number: 12,
               verse_number: 1,
               label: "Romans 12:1".to_string(),
            },
         ),
      ]);

      let chapters = build_chapter_exports(&verse_map);

      assert_eq!(chapters.len(), 1);
      assert_eq!(chapters[0].verses[0].verse_number, 1);
      assert_eq!(chapters[0].verses[1].verse_number, 2);
   }
}
