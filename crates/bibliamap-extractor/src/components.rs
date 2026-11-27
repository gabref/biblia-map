//! `stats.components.json`: precomputed relationship blocks (connected components), matching
//! `frontend/src/graph/relationshipComponents.ts` `buildRelationshipComponents` for each edge kind.

use std::collections::{BTreeMap, HashMap};

use bibliamap_core::{BibleEdge, BookExport, VerseRef};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipBookCount {
   pub book_number: u8,
   pub name: String,
   pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipComponent {
   pub id: usize,
   pub size: usize,
   pub percent: f64,
   pub edge_count: usize,
   pub sample_verses: Vec<String>,
   pub top_books: Vec<RelationshipBookCount>,
}

/// Same shape as the frontend `RelationshipComponentsSummary`, except that `components` omits
/// single-verse components (there are thousands; `isolatedVerses` counts them and `blockCount`
/// still includes them).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipComponentsSummary {
   pub total_verses: usize,
   pub total_edges: usize,
   pub block_count: usize,
   pub isolated_verses: usize,
   pub largest_block: Option<RelationshipComponent>,
   pub components: Vec<RelationshipComponent>,
}

/// Keyed by edge filter: `combined`, `crossrefs`, `study-notes`.
pub type ComponentsExport = BTreeMap<&'static str, RelationshipComponentsSummary>;

pub fn build_components_export(
   cross_reference_edges: &[BibleEdge],
   study_note_edges: &[BibleEdge],
   verse_map: &HashMap<i32, VerseRef>,
   books: &[BookExport],
) -> ComponentsExport {
   let combined = cross_reference_edges
      .iter()
      .chain(study_note_edges)
      .collect::<Vec<_>>();

   BTreeMap::from([
      (
         "combined",
         build_relationship_components(&combined, verse_map, books),
      ),
      (
         "crossrefs",
         build_relationship_components(
            &cross_reference_edges.iter().collect::<Vec<_>>(),
            verse_map,
            books,
         ),
      ),
      (
         "study-notes",
         build_relationship_components(
            &study_note_edges.iter().collect::<Vec<_>>(),
            verse_map,
            books,
         ),
      ),
   ])
}

struct Draft {
   size: usize,
   edge_count: usize,
   sample_verses: Vec<String>,
   book_counts: BTreeMap<u8, u32>,
}

pub fn build_relationship_components(
   edges: &[&BibleEdge],
   verse_map: &HashMap<i32, VerseRef>,
   books: &[BookExport],
) -> RelationshipComponentsSummary {
   let mut verse_ids = verse_map.keys().copied().collect::<Vec<_>>();
   verse_ids.sort_unstable();
   let position = verse_ids
      .iter()
      .enumerate()
      .map(|(index, verse_id)| (*verse_id, index))
      .collect::<HashMap<_, _>>();
   let mut disjoint_set = DisjointSet::new(verse_ids.len());

   for edge in edges {
      let Some(&source) = position.get(&edge.source_verse_id) else {
         continue;
      };
      // Like the frontend, a reversed range links nothing.
      for target in edge.target_start_verse_id..=edge.target_end_verse_id {
         if let Some(&target) = position.get(&target) {
            disjoint_set.union(source, target);
         }
      }
   }

   // Drafts in order of each component's lowest verse id (the frontend's Map insertion order).
   let mut draft_index_by_root = HashMap::new();
   let mut drafts: Vec<Draft> = Vec::new();

   for (index, verse_id) in verse_ids.iter().enumerate() {
      let root = disjoint_set.find(index);
      let verse = &verse_map[verse_id];
      let draft_index = *draft_index_by_root.entry(root).or_insert_with(|| {
         drafts.push(Draft {
            size: 0,
            edge_count: 0,
            sample_verses: Vec::new(),
            book_counts: BTreeMap::new(),
         });
         drafts.len() - 1
      });
      let draft = &mut drafts[draft_index];
      draft.size += 1;
      *draft.book_counts.entry(verse.book_number).or_default() += 1;
      if draft.sample_verses.len() < 4 {
         draft.sample_verses.push(verse.label.clone());
      }
   }

   for edge in edges {
      if let Some(&source) = position.get(&edge.source_verse_id) {
         let root = disjoint_set.find(source);
         drafts[draft_index_by_root[&root]].edge_count += 1;
      }
   }

   let total_verses = verse_ids.len();
   let book_names = books
      .iter()
      .map(|book| (book.book_number, book.name.as_str()))
      .collect::<HashMap<_, _>>();
   let mut components = drafts
      .into_iter()
      .map(|draft| {
         let mut top_books = draft
            .book_counts
            .into_iter()
            .map(|(book_number, count)| RelationshipBookCount {
               book_number,
               name: book_names
                  .get(&book_number)
                  .map_or_else(|| format!("Book {book_number}"), |name| (*name).to_string()),
               count,
            })
            .collect::<Vec<_>>();
         top_books.sort_by(|left, right| {
            right
               .count
               .cmp(&left.count)
               .then(left.book_number.cmp(&right.book_number))
         });
         top_books.truncate(5);

         RelationshipComponent {
            id: 0,
            size: draft.size,
            percent: if total_verses > 0 {
               draft.size as f64 / total_verses as f64
            } else {
               0.0
            },
            edge_count: draft.edge_count,
            sample_verses: draft.sample_verses,
            top_books,
         }
      })
      .collect::<Vec<_>>();
   // Stable sort, same keys as the frontend.
   components.sort_by(|left, right| {
      right
         .size
         .cmp(&left.size)
         .then(right.edge_count.cmp(&left.edge_count))
   });
   for (index, component) in components.iter_mut().enumerate() {
      component.id = index + 1;
   }

   let block_count = components.len();
   let isolated_verses = components
      .iter()
      .filter(|component| component.size == 1)
      .count();
   let largest_block = components.first().cloned();
   components.retain(|component| component.size > 1);

   RelationshipComponentsSummary {
      total_verses,
      total_edges: edges.len(),
      block_count,
      isolated_verses,
      largest_block,
      components,
   }
}

struct DisjointSet {
   parent: Vec<usize>,
   rank: Vec<u8>,
}

impl DisjointSet {
   fn new(size: usize) -> Self {
      Self {
         parent: (0..size).collect(),
         rank: vec![0; size],
      }
   }

   fn find(&mut self, index: usize) -> usize {
      let mut root = index;
      while self.parent[root] != root {
         root = self.parent[root];
      }
      let mut current = index;
      while self.parent[current] != root {
         let next = self.parent[current];
         self.parent[current] = root;
         current = next;
      }
      root
   }

   fn union(&mut self, left: usize, right: usize) {
      let left = self.find(left);
      let right = self.find(right);
      if left == right {
         return;
      }
      match self.rank[left].cmp(&self.rank[right]) {
         std::cmp::Ordering::Less => self.parent[left] = right,
         std::cmp::Ordering::Greater => self.parent[right] = left,
         std::cmp::Ordering::Equal => {
            self.parent[right] = left;
            self.rank[left] += 1;
         }
      }
   }
}

#[cfg(test)]
mod tests {
   use super::*;
   use bibliamap_core::{EdgeKind, canonical_verse_id, exported_books};

   fn verse(id: i32, book: u8, number: u16) -> (i32, VerseRef) {
      (
         id,
         VerseRef {
            jwpub_verse_id: id,
            canonical_verse_id: canonical_verse_id(book, 1, number),
            book_number: book,
            chapter_number: 1,
            verse_number: number,
            label: format!("V{id}"),
         },
      )
   }

   fn edge(source: i32, start: i32, end: i32, kind: EdgeKind) -> BibleEdge {
      BibleEdge {
         source_verse_id: source,
         target_start_verse_id: start,
         target_end_verse_id: end,
         kind,
         source_book_number: 1,
         target_book_number: 1,
         source_chapter_number: 1,
         target_chapter_number: 1,
         paragraph_ordinal: None,
         sort_position: None,
         commentary_id: None,
         document_id: None,
      }
   }

   #[test]
   fn groups_verses_into_blocks_like_the_frontend() {
      let verse_map = HashMap::from([
         verse(1, 1, 1),
         verse(2, 1, 2),
         verse(3, 1, 3),
         verse(4, 2, 1),
         verse(5, 2, 2),
         verse(6, 2, 3),
      ]);
      let cross = vec![
         edge(1, 2, 3, EdgeKind::CrossReference),
         edge(4, 5, 5, EdgeKind::CrossReference),
         // Reversed range: links nothing, but still counts as an edge of its source block.
         edge(6, 5, 4, EdgeKind::CrossReference),
      ];
      let study = vec![edge(3, 4, 4, EdgeKind::StudyNoteReference)];
      let books = exported_books();

      let export = build_components_export(&cross, &study, &verse_map, &books);

      let crossrefs = &export["crossrefs"];
      assert_eq!(crossrefs.total_verses, 6);
      assert_eq!(crossrefs.total_edges, 3);
      assert_eq!(crossrefs.block_count, 3);
      assert_eq!(crossrefs.isolated_verses, 1);
      assert_eq!(crossrefs.components.len(), 2);
      assert_eq!(
         crossrefs.components[0].sample_verses,
         vec!["V1", "V2", "V3"]
      );
      assert_eq!(crossrefs.components[0].id, 1);
      assert_eq!(crossrefs.components[1].sample_verses, vec!["V4", "V5"]);
      assert_eq!(crossrefs.components[0].top_books[0].name, "Genesis");

      let combined = &export["combined"];
      assert_eq!(combined.block_count, 2);
      assert_eq!(
         combined.largest_block.as_ref().map(|block| block.size),
         Some(5)
      );
      assert_eq!(
         combined
            .largest_block
            .as_ref()
            .map(|block| block.edge_count),
         Some(3)
      );
      assert_eq!(combined.components[0].top_books[0].book_number, 1);

      assert_eq!(export["study-notes"].block_count, 5);
   }
}
