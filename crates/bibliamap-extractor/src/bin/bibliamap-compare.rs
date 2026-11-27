//! Builds cross-edition reference diffs (`compare/<a>__<b>/<NN>.<slug>.json`) from datasets that
//! the extractor has already generated. Verses are keyed by `canonicalVerseId` so editions with
//! different jwpub verse numbering line up.
//!
//! Usage:
//! `cargo run -p bibliamap-extractor --bin bibliamap-compare -- --generated frontend/public/generated --pair nwt:rbi8`

use std::{
   collections::{BTreeMap, BTreeSet, HashMap},
   fs::{self, File},
   io::{BufReader, BufWriter, Write},
   path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use bibliamap_core::{BOOKS, CompactEdges, EdgeKind, VerseRef, book_file_name};
use clap::Parser;
use serde::{Deserialize, Serialize, de::DeserializeOwned};

#[derive(Debug, Parser)]
#[command(about = "Diff cross-reference sets between generated datasets")]
struct Args {
   /// The `frontend/public/generated` directory holding one folder per dataset.
   #[arg(long)]
   generated: PathBuf,

   /// Dataset pair `a:b`; repeatable.
   #[arg(long = "pair", required = true)]
   pairs: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompareIndex {
   schema_version: u8,
   pairs: Vec<ComparePair>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ComparePair {
   id: String,
   a: String,
   b: String,
   kind: String,
   shared_references: usize,
   only_a: usize,
   only_b: usize,
}

/// Source canonical verse → set of cited target canonical verses (range starts).
type ReferenceSets = BTreeMap<i32, BTreeSet<i32>>;
/// Per book → source canonical verse → `(shared, onlyA, onlyB)`.
type BookDiffs = BTreeMap<u8, BTreeMap<i32, (usize, Vec<i32>, Vec<i32>)>>;

fn main() -> Result<()> {
   let args = Args::parse();
   let compare_root = args.generated.join("compare");
   fs::create_dir_all(&compare_root)?;
   let index_path = compare_root.join("index.json");
   let mut index = if index_path.exists() {
      read_json::<CompareIndex>(&index_path)?
   } else {
      CompareIndex::default()
   };
   index.schema_version = 1;

   for pair in &args.pairs {
      let Some((a, b)) = pair.split_once(':') else {
         bail!("--pair must look like a:b, got {pair}");
      };
      let sets_a = load_reference_sets(&args.generated.join(a))?;
      let sets_b = load_reference_sets(&args.generated.join(b))?;
      let (diffs, totals) = diff_reference_sets(&sets_a, &sets_b);
      let id = format!("{a}__{b}");
      let directory = compare_root.join(&id);
      if directory.exists() {
         fs::remove_dir_all(&directory)?;
      }
      fs::create_dir_all(&directory)?;
      let empty = BTreeMap::new();

      for book in &BOOKS {
         write_json(
            &directory.join(book_file_name(book.book_number)),
            diffs.get(&book.book_number).unwrap_or(&empty),
         )?;
      }

      index.pairs.retain(|existing| existing.id != id);
      index.pairs.push(ComparePair {
         id: id.clone(),
         a: a.to_string(),
         b: b.to_string(),
         kind: EdgeKind::CrossReference.label().to_string(),
         shared_references: totals.0,
         only_a: totals.1,
         only_b: totals.2,
      });
      eprintln!(
         "{id}: {} shared, {} only in {a}, {} only in {b}",
         totals.0, totals.1, totals.2
      );
   }

   index.pairs.sort_by(|left, right| left.id.cmp(&right.id));
   write_json(&index_path, &index)
}

fn load_reference_sets(dataset: &Path) -> Result<ReferenceSets> {
   let verse_index: HashMap<String, VerseRef> = read_json(&dataset.join("verse-index.json"))?;
   let canonical = verse_index
      .values()
      .map(|verse| (verse.jwpub_verse_id, verse.canonical_verse_id))
      .collect::<HashMap<_, _>>();
   let edges: CompactEdges = read_json(&dataset.join("edges/crossrefs.compact.json"))?;
   let mut sets = ReferenceSets::new();

   for (index, source) in edges.source.iter().enumerate() {
      if edges.kind[index] != EdgeKind::CrossReference.code() {
         continue;
      }
      let (Some(source), Some(target)) = (
         canonical.get(source),
         canonical.get(&edges.target_start[index]),
      ) else {
         continue;
      };
      sets.entry(*source).or_default().insert(*target);
   }

   Ok(sets)
}

fn diff_reference_sets(a: &ReferenceSets, b: &ReferenceSets) -> (BookDiffs, (usize, usize, usize)) {
   let empty = BTreeSet::new();
   let mut diffs = BookDiffs::new();
   let mut totals = (0, 0, 0);
   let sources = a.keys().chain(b.keys()).copied().collect::<BTreeSet<_>>();

   for source in sources {
      let set_a = a.get(&source).unwrap_or(&empty);
      let set_b = b.get(&source).unwrap_or(&empty);
      let shared = set_a.intersection(set_b).count();
      let only_a = set_a.difference(set_b).copied().collect::<Vec<_>>();
      let only_b = set_b.difference(set_a).copied().collect::<Vec<_>>();
      totals.0 += shared;
      totals.1 += only_a.len();
      totals.2 += only_b.len();

      if only_a.is_empty() && only_b.is_empty() {
         continue;
      }
      let Ok(book_number) = u8::try_from(source / 1_000_000) else {
         continue;
      };
      diffs
         .entry(book_number)
         .or_default()
         .insert(source, (shared, only_a, only_b));
   }

   (diffs, totals)
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T> {
   let file = File::open(path).with_context(|| format!("failed to open {}", path.display()))?;
   serde_json::from_reader(BufReader::new(file))
      .with_context(|| format!("failed to parse {}", path.display()))
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
   let file = File::create(path).with_context(|| format!("failed to create {}", path.display()))?;
   let mut writer = BufWriter::new(file);
   serde_json::to_writer(&mut writer, value)?;
   writer
      .flush()
      .with_context(|| format!("failed to write {}", path.display()))
}

#[cfg(test)]
mod tests {
   use super::*;

   #[test]
   fn diffs_reference_sets_by_canonical_verse() {
      let a = ReferenceSets::from([
         (45_012_001, BTreeSet::from([1_001_001, 1_001_002])),
         (45_012_002, BTreeSet::from([2_001_001])),
      ]);
      let b = ReferenceSets::from([
         (45_012_001, BTreeSet::from([1_001_002, 1_001_003])),
         (45_012_002, BTreeSet::from([2_001_001])),
         (1_001_001, BTreeSet::from([43_001_001])),
      ]);

      let (diffs, totals) = diff_reference_sets(&a, &b);

      assert_eq!(totals, (2, 1, 2));
      assert_eq!(
         diffs[&45][&45_012_001],
         (1, vec![1_001_001], vec![1_001_003])
      );
      assert!(!diffs[&45].contains_key(&45_012_002));
      assert_eq!(diffs[&1][&1_001_001], (0, vec![], vec![43_001_001]));

      let json = serde_json::to_string(&diffs[&1]).expect("diff should serialize");
      assert_eq!(json, r#"{"1001001":[0,[],[43001001]]}"#);
   }
}
