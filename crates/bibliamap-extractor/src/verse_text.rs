//! Verse text: reuse of previously generated `verse-text/` files and polite fetching from jw.org.
//!
//! Verse text is not part of the JWPub publication, so it is scraped from jw.org. A full fetch is
//! ~1,189 requests per dataset and jw.org rate-limits (403/429) aggressive clients, so:
//! - `--verse-text-from <dir>` reuses `<dir>/verse-text/*.json` for every chapter whose stored
//!   entries still match the publication (same jwpubVerseId and label); only the remaining chapters
//!   are fetched (none with `--verse-text-no-fetch`);
//! - fetches run with a small worker pool, a polite delay between requests, per-request timeouts and
//!   retries with exponential backoff plus jitter (honouring `Retry-After`).

use std::{
   collections::{
      BTreeMap, HashMap,
      hash_map::{Entry, RandomState},
   },
   fs,
   hash::{BuildHasher, Hasher},
   path::Path,
   thread,
   time::Duration,
};

use anyhow::{Context, Result};
use bibliamap_core::{VerseRef, book_file_name};
use reqwest::{
   StatusCode,
   blocking::{Client, Response},
   header::RETRY_AFTER,
};
use scraper::{Html, Selector};

use crate::{ChapterExport, VerseTextExport};

/// Verse text grouped by book number, then jwpubVerseId (the `verse-text/<NN>.<slug>.json` shape).
pub type VerseTextByBook = BTreeMap<u8, BTreeMap<i32, VerseTextExport>>;

/// How hard (or rather, how gently) to hit jw.org.
#[derive(Debug, Clone)]
pub struct FetchPolicy {
   /// Total attempts per request, including the first one.
   pub attempts: u32,
   /// Backoff before retry `n` (1-based) is `base_backoff * 2^(n-1)`, capped at `max_backoff`,
   /// with full jitter (a uniformly random duration between half and all of it).
   pub base_backoff: Duration,
   pub max_backoff: Duration,
   /// Pause between two consecutive requests of the same worker, plus up to 100% jitter.
   pub request_delay: Duration,
   /// Concurrent requests.
   pub workers: usize,
   pub connect_timeout: Duration,
   pub request_timeout: Duration,
}

impl Default for FetchPolicy {
   fn default() -> Self {
      Self {
         attempts: 5,
         base_backoff: Duration::from_secs(5),
         max_backoff: Duration::from_secs(120),
         request_delay: Duration::from_millis(750),
         workers: 2,
         connect_timeout: Duration::from_secs(15),
         request_timeout: Duration::from_secs(60),
      }
   }
}

/// Outcome of [`reuse_verse_text`].
#[derive(Debug, Default)]
pub struct ReuseReport {
   pub reused_chapters: usize,
   pub reused_verses: usize,
   /// Chapters with stored text whose ids or labels no longer match the publication (refetched).
   pub mismatched_chapters: usize,
   /// Stored entries whose jwpubVerseId belongs to no chapter of the publication (dropped).
   pub stray_entries: usize,
   /// Indexes into the `chapters` slice that still need text.
   pub missing: Vec<usize>,
}

/// Reuses `<dir>/verse-text/<NN>.<slug>.json` for every chapter whose stored entries all match
/// the publication's verse ids and labels. A chapter is reused as a whole or not at all; chapters
/// without any stored entry, or with a mismatching one, are reported in `missing`.
pub fn reuse_verse_text(
   dir: &Path,
   chapters: &[ChapterExport],
) -> Result<(VerseTextByBook, ReuseReport)> {
   let mut stored_by_book = HashMap::<u8, BTreeMap<i32, VerseTextExport>>::new();
   let mut report = ReuseReport::default();
   let mut text = VerseTextByBook::new();

   for (index, chapter) in chapters.iter().enumerate() {
      let stored = match stored_by_book.entry(chapter.book_number) {
         Entry::Occupied(entry) => entry.into_mut(),
         Entry::Vacant(entry) => entry.insert(read_book_file(dir, chapter.book_number)?),
      };
      let mut entries = Vec::new();
      let mut mismatched = false;

      for verse in &chapter.verses {
         if let Some(entry) = stored.get(&verse.jwpub_verse_id) {
            if entry.label == verse.label && !entry.text.is_empty() {
               entries.push((verse.jwpub_verse_id, entry.clone()));
            } else {
               mismatched = true;
            }
         }
      }

      if mismatched {
         report.mismatched_chapters += 1;
         report.missing.push(index);
      } else if entries.is_empty() {
         report.missing.push(index);
      } else {
         report.reused_chapters += 1;
         report.reused_verses += entries.len();
         text.entry(chapter.book_number).or_default().extend(entries);
      }
   }

   // Anything stored but neither reused nor part of a mismatched chapter is not a verse of this
   // publication any more.
   for (book_number, stored) in &stored_by_book {
      let known = chapters
         .iter()
         .filter(|chapter| chapter.book_number == *book_number)
         .flat_map(|chapter| chapter.verses.iter())
         .filter(|verse| stored.contains_key(&verse.jwpub_verse_id))
         .count();
      report.stray_entries += stored.len() - known;
   }

   Ok((text, report))
}

fn read_book_file(dir: &Path, book_number: u8) -> Result<BTreeMap<i32, VerseTextExport>> {
   let path = dir.join("verse-text").join(book_file_name(book_number));
   match fs::read(&path) {
      Ok(bytes) => serde_json::from_slice(&bytes)
         .with_context(|| format!("failed to parse stored verse text {}", path.display())),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
      Err(error) => {
         Err(anyhow::Error::new(error).context(format!("failed to read {}", path.display())))
      }
   }
}

/// Fetches verse text for `chapters` from jw.org following `policy`.
pub fn fetch_verse_text(
   publication_symbol: &str,
   locale: &str,
   chapters: &[&ChapterExport],
   verse_map: &HashMap<i32, VerseRef>,
   policy: &FetchPolicy,
) -> Result<VerseTextByBook> {
   let client = Client::builder()
      .user_agent("BibliaMap extractor")
      .connect_timeout(policy.connect_timeout)
      .timeout(policy.request_timeout)
      .build()
      .context("failed to build verse text HTTP client")?;
   let mut text_by_book = VerseTextByBook::new();
   let canonical_to_jwpub = verse_map
      .values()
      .map(|verse| (verse.canonical_verse_id, verse.jwpub_verse_id))
      .collect::<HashMap<_, _>>();
   let workers = policy.workers.max(1);
   let mut done = 0;

   for chunk in chapters.chunks(workers) {
      if done > 0 {
         thread::sleep(jittered(policy.request_delay));
      }
      let fetched_chapters = thread::scope(|scope| {
         let handles = chunk
            .iter()
            .map(|chapter| {
               let client = &client;
               let canonical_to_jwpub = &canonical_to_jwpub;
               scope.spawn(move || {
                  fetch_chapter_text(
                     client,
                     publication_symbol,
                     locale,
                     chapter,
                     canonical_to_jwpub,
                     verse_map,
                     policy,
                  )
               })
            })
            .collect::<Vec<_>>();

         handles
            .into_iter()
            .map(|handle| handle.join().expect("text worker should not panic"))
            .collect::<Result<Vec<_>>>()
      })?;

      for (book_number, verse_id, verse_text) in fetched_chapters.into_iter().flatten() {
         text_by_book
            .entry(book_number)
            .or_default()
            .insert(verse_id, verse_text);
      }
      done += chunk.len();
      eprintln!("Fetched verse text for {done}/{} chapters", chapters.len());
   }

   Ok(text_by_book)
}

/// Whether a response status is worth retrying. 403 is included because jw.org answers rate
/// limiting with 403 Forbidden as well as 429.
fn is_retryable(status: StatusCode) -> bool {
   status.is_server_error()
      || status == StatusCode::TOO_MANY_REQUESTS
      || status == StatusCode::FORBIDDEN
      || status == StatusCode::REQUEST_TIMEOUT
}

/// Backoff before retry `retry` (1-based), before jitter.
fn backoff(policy: &FetchPolicy, retry: u32) -> Duration {
   let factor = 2_u32.saturating_pow(retry.saturating_sub(1));
   policy
      .base_backoff
      .saturating_mul(factor)
      .min(policy.max_backoff)
}

/// A random duration in `[duration / 2, duration]`.
fn jittered(duration: Duration) -> Duration {
   jitter_with(duration, random_unit())
}

fn jitter_with(duration: Duration, unit: f64) -> Duration {
   duration.mul_f64(0.5 + 0.5 * unit.clamp(0.0, 1.0))
}

/// A uniformly distributed value in `[0, 1)` without pulling in a RNG crate.
fn random_unit() -> f64 {
   let bits = RandomState::new().build_hasher().finish() >> 11;
   bits as f64 / (1_u64 << 53) as f64
}

/// `Retry-After` in seconds (the HTTP-date form is ignored), capped at `max`.
fn retry_after(response: &Response, max: Duration) -> Option<Duration> {
   response
      .headers()
      .get(RETRY_AFTER)?
      .to_str()
      .ok()?
      .trim()
      .parse::<u64>()
      .ok()
      .map(|seconds| Duration::from_secs(seconds).min(max))
}

/// Fetches a page body, retrying transient failures (timeouts, connection errors, 5xx, 429, 403,
/// 408) with exponential backoff and jitter. Other client errors fail immediately.
fn fetch_with_retry(client: &Client, url: &str, policy: &FetchPolicy) -> Result<String> {
   let attempts = policy.attempts.max(1);
   let mut last_error = None;
   let mut wait = None;

   for attempt in 0..attempts {
      if attempt > 0 {
         let delay = wait
            .take()
            .unwrap_or_else(|| jittered(backoff(policy, attempt)));
         eprintln!(
            "Retrying {url} in {:.1}s (attempt {}/{attempts})",
            delay.as_secs_f64(),
            attempt + 1
         );
         thread::sleep(delay);
      }

      let response = match client.get(url).send() {
         Ok(response) => response,
         Err(error) => {
            last_error = Some(anyhow::Error::new(error).context(format!("failed to fetch {url}")));
            continue;
         }
      };
      let status = response.status();
      if is_retryable(status) {
         wait = retry_after(&response, policy.max_backoff);
         last_error = Some(anyhow::anyhow!("{url} answered {status}"));
         continue;
      }
      let response = response
         .error_for_status()
         .with_context(|| format!("failed response for {url}"))?;

      match response.text() {
         Ok(body) => return Ok(body),
         Err(error) => {
            last_error = Some(
               anyhow::Error::new(error).context(format!("failed to read response body for {url}")),
            );
         }
      }
   }

   Err(
      last_error
         .unwrap_or_else(|| anyhow::anyhow!("no attempt made"))
         .context(format!("giving up on {url} after {attempts} attempts")),
   )
}

fn fetch_chapter_text(
   client: &Client,
   publication_symbol: &str,
   locale: &str,
   chapter: &ChapterExport,
   canonical_to_jwpub: &HashMap<i32, i32>,
   verse_map: &HashMap<i32, VerseRef>,
   policy: &FetchPolicy,
) -> Result<Vec<(u8, i32, VerseTextExport)>> {
   let Some(first_verse) = chapter.verses.first() else {
      return Ok(Vec::new());
   };
   let finder_url = format!(
      "https://www.jw.org/finder?wtlocale={locale}&prefer=lang&bible={}&pub={publication_symbol}",
      first_verse.canonical_verse_id
   );
   let html = fetch_with_retry(client, &finder_url, policy)?;

   Ok(parse_chapter_html(
      &html,
      chapter,
      canonical_to_jwpub,
      verse_map,
   ))
}

fn parse_chapter_html(
   html: &str,
   chapter: &ChapterExport,
   canonical_to_jwpub: &HashMap<i32, i32>,
   verse_map: &HashMap<i32, VerseRef>,
) -> Vec<(u8, i32, VerseTextExport)> {
   let document = Html::parse_document(html);
   let verse_selector = Selector::parse("span.verse").expect("verse selector should parse");
   let mut verses = Vec::new();

   for element in document.select(&verse_selector) {
      let Some(canonical_verse_id) = element
         .value()
         .attr("id")
         .and_then(|id| id.strip_prefix('v'))
         .and_then(|id| id.parse::<i32>().ok())
      else {
         continue;
      };
      let Some(verse) = canonical_to_jwpub
         .get(&canonical_verse_id)
         .and_then(|jwpub_verse_id| verse_map.get(jwpub_verse_id))
      else {
         continue;
      };

      if verse.book_number != chapter.book_number || verse.chapter_number != chapter.chapter_number
      {
         continue;
      }

      let text = clean_verse_text(&element.text().collect::<String>());
      if text.is_empty() {
         continue;
      }

      verses.push((
         verse.book_number,
         verse.jwpub_verse_id,
         VerseTextExport {
            label: verse.label.clone(),
            text,
         },
      ));
   }

   verses
}

fn clean_verse_text(raw_text: &str) -> String {
   let without_markers = raw_text.replace(['+', '*'], " ");
   let normalized = without_markers
      .split_whitespace()
      .collect::<Vec<_>>()
      .join(" ");
   let without_verse_number = normalized
      .trim_start_matches(|character: char| character.is_ascii_digit())
      .trim_start_matches(['\u{202f}', '\u{a0}', ' '])
      .to_string();

   without_verse_number.trim().to_string()
}

#[cfg(test)]
mod tests {
   use super::*;
   use crate::ChapterVerseExport;

   fn chapter(book_number: u8, chapter_number: u16, ids: &[i32]) -> ChapterExport {
      ChapterExport {
         book_number,
         chapter_number,
         label: format!("{book_number} {chapter_number}"),
         first_verse_id: ids[0],
         last_verse_id: ids[ids.len() - 1],
         verses: ids
            .iter()
            .enumerate()
            .map(|(index, id)| ChapterVerseExport {
               jwpub_verse_id: *id,
               canonical_verse_id: 1_000_000 + id,
               verse_number: index as u16 + 1,
               label: format!("V{id}"),
            })
            .collect(),
      }
   }

   fn write_book(dir: &Path, book_number: u8, entries: &[(i32, &str, &str)]) {
      fs::create_dir_all(dir.join("verse-text")).unwrap();
      let map = entries
         .iter()
         .map(|(id, label, text)| {
            (
               *id,
               VerseTextExport {
                  label: label.to_string(),
                  text: text.to_string(),
               },
            )
         })
         .collect::<BTreeMap<_, _>>();
      fs::write(
         dir.join("verse-text").join(book_file_name(book_number)),
         serde_json::to_vec(&map).unwrap(),
      )
      .unwrap();
   }

   #[test]
   fn reuses_matching_chapters_and_reports_the_rest() {
      let dir = tempfile::tempdir().unwrap();
      let chapters = vec![
         chapter(1, 1, &[0, 1]),
         chapter(1, 2, &[2, 3]),
         chapter(1, 3, &[4]),
         chapter(2, 1, &[5]),
      ];
      write_book(
         dir.path(),
         1,
         &[
            (0, "V0", "first"),
            (1, "V1", "second"),
            (2, "V2", "ok"),
            (3, "stale label", "changed"),
            (99, "V99", "stray"),
         ],
      );
      // Book 2 has no file at all.

      let (text, report) = reuse_verse_text(dir.path(), &chapters).unwrap();

      assert_eq!(report.reused_chapters, 1);
      assert_eq!(report.reused_verses, 2);
      assert_eq!(report.mismatched_chapters, 1);
      assert_eq!(report.stray_entries, 1);
      assert_eq!(report.missing, vec![1, 2, 3]);
      assert_eq!(text[&1].keys().copied().collect::<Vec<_>>(), vec![0, 1]);
      assert_eq!(text[&1][&1].text, "second");
      assert!(!text.contains_key(&2));
   }

   #[test]
   fn partially_stored_chapters_are_reused_as_stored() {
      // jw.org omits some verses (e.g. ones only in footnotes); the original fetch skipped them
      // too, so a chapter with a subset of its verses stored is complete.
      let dir = tempfile::tempdir().unwrap();
      let chapters = vec![chapter(40, 17, &[10, 11, 12])];
      write_book(dir.path(), 40, &[(10, "V10", "a"), (12, "V12", "c")]);

      let (text, report) = reuse_verse_text(dir.path(), &chapters).unwrap();

      assert!(report.missing.is_empty());
      assert_eq!(report.reused_verses, 2);
      assert_eq!(text[&40].len(), 2);
   }

   #[test]
   fn corrupt_stored_file_fails_loudly() {
      let dir = tempfile::tempdir().unwrap();
      fs::create_dir_all(dir.path().join("verse-text")).unwrap();
      fs::write(dir.path().join("verse-text").join(book_file_name(1)), b"{").unwrap();

      assert!(reuse_verse_text(dir.path(), &[chapter(1, 1, &[0])]).is_err());
   }

   #[test]
   fn backoff_grows_exponentially_and_is_capped() {
      let policy = FetchPolicy {
         base_backoff: Duration::from_secs(5),
         max_backoff: Duration::from_secs(30),
         ..FetchPolicy::default()
      };

      assert_eq!(backoff(&policy, 1), Duration::from_secs(5));
      assert_eq!(backoff(&policy, 2), Duration::from_secs(10));
      assert_eq!(backoff(&policy, 3), Duration::from_secs(20));
      assert_eq!(backoff(&policy, 4), Duration::from_secs(30));
      assert_eq!(backoff(&policy, 40), Duration::from_secs(30));
   }

   #[test]
   fn jitter_stays_between_half_and_full_delay() {
      let delay = Duration::from_secs(10);

      assert_eq!(jitter_with(delay, 0.0), Duration::from_secs(5));
      assert_eq!(jitter_with(delay, 1.0), delay);
      for _ in 0..100 {
         let jittered = jittered(delay);
         assert!(jittered >= Duration::from_secs(5) && jittered <= delay);
      }
   }

   #[test]
   fn retries_rate_limits_and_server_errors_only() {
      assert!(is_retryable(StatusCode::FORBIDDEN));
      assert!(is_retryable(StatusCode::TOO_MANY_REQUESTS));
      assert!(is_retryable(StatusCode::BAD_GATEWAY));
      assert!(is_retryable(StatusCode::REQUEST_TIMEOUT));
      assert!(!is_retryable(StatusCode::NOT_FOUND));
      assert!(!is_retryable(StatusCode::OK));
   }

   #[test]
   fn parses_chapter_html_for_its_own_chapter_only() {
      let chapter = chapter(1, 1, &[0, 1]);
      let verse_map = [(0, 1, 1), (1, 1, 2), (7, 2, 1)]
         .into_iter()
         .map(|(id, chapter_number, verse_number)| {
            (
               id,
               VerseRef {
                  jwpub_verse_id: id,
                  canonical_verse_id: 1_000_000 + id,
                  book_number: 1,
                  chapter_number,
                  verse_number,
                  label: format!("V{id}"),
               },
            )
         })
         .collect::<HashMap<_, _>>();
      let canonical_to_jwpub = verse_map
         .values()
         .map(|verse| (verse.canonical_verse_id, verse.jwpub_verse_id))
         .collect::<HashMap<_, _>>();
      let html = r#"<span class="verse" id="v1000000">1 In the +beginning*</span>
         <span class="verse" id="v1000001">2&nbsp;Second</span>
         <span class="verse" id="v1000007">Other chapter</span>"#;

      let verses = parse_chapter_html(html, &chapter, &canonical_to_jwpub, &verse_map);

      assert_eq!(verses.len(), 2);
      assert_eq!(verses[0].2.text, "In the beginning");
      assert_eq!(verses[1].2.text, "Second");
   }
}
