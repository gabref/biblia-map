//! Study-note and footnote text export (`study-notes/*.json`, `footnotes/*.json`).
//!
//! The `Content` blobs are decrypted with [`ContentKey`] and their HTML is reduced to plain text
//! paragraphs. Inline Bible references (`<a href="jwpub://b/NWTR/B:C:V-B:C:V">`) are kept as
//! structured spans so the UI can make them clickable.

use std::collections::{BTreeMap, HashMap};

use anyhow::{Context, Result};
use bibliamap_core::{VerseRef, canonical_verse_id};
use ego_tree::NodeRef;
use jwpub_reader::ContentKey;
use rusqlite::Connection;
use scraper::{ElementRef, Html, Node, Selector};
use serde::Serialize;

/// One plain-text paragraph.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteParagraph {
   /// `data-pid` of the paragraph: matches `paragraphOrdinal` of the study-note edges.
   #[serde(skip_serializing_if = "Option::is_none")]
   pub pid: Option<i32>,
   /// Bold lead-in phrase of a study note ("book of the history"), without the trailing colon.
   #[serde(skip_serializing_if = "Option::is_none")]
   pub lemma: Option<String>,
   /// Plain text; `\n` marks line breaks inside the paragraph.
   pub text: String,
   /// Bible reference spans as `[start, end, fromJwpubVerseId, toJwpubVerseId]`. `start`/`end`
   /// are UTF-16 offsets into `text` (JavaScript string indices, end exclusive).
   #[serde(skip_serializing_if = "Vec::is_empty")]
   pub refs: Vec<[i32; 4]>,
}

/// A study note (one `VerseCommentary`) attached to a verse.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyNote {
   /// Matches `commentaryId` on `study_note_reference` edges.
   pub commentary_id: i32,
   pub heading: String,
   pub paragraphs: Vec<NoteParagraph>,
}

/// A translation footnote attached to a verse.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Footnote {
   pub footnote_id: i32,
   pub paragraphs: Vec<NoteParagraph>,
}

/// Per book → per jwpubVerseId → notes.
pub type NotesByBook<T> = BTreeMap<u8, BTreeMap<i32, Vec<T>>>;

/// Maps canonical verse ids (`BBCCCVVV`) to jwpub verse ids, for resolving reference links.
pub fn canonical_index(verse_map: &HashMap<i32, VerseRef>) -> HashMap<i32, i32> {
   verse_map
      .values()
      .map(|verse| (verse.canonical_verse_id, verse.jwpub_verse_id))
      .collect()
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool> {
   Ok(connection.query_row(
      "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
      [table],
      |row| row.get::<_, i64>(0),
   )? > 0)
}

pub fn extract_study_notes(
   connection: &Connection,
   key: &ContentKey,
   verse_map: &HashMap<i32, VerseRef>,
) -> Result<NotesByBook<StudyNote>> {
   let mut notes = NotesByBook::new();
   if !table_exists(connection, "VerseCommentary")?
      || !table_exists(connection, "VerseCommentaryMap")?
   {
      return Ok(notes);
   }

   let canonical = canonical_index(verse_map);
   let mut statement = connection.prepare(
      r#"
      SELECT vcm.BibleVerseId, vc.VerseCommentaryId, vc.Label, vc.Content
      FROM VerseCommentary vc
      JOIN VerseCommentaryMap vcm
         ON vcm.VerseCommentaryId = vc.VerseCommentaryId
      WHERE vc.Content IS NOT NULL
      ORDER BY vcm.BibleVerseId, vc.VerseCommentaryId
      "#,
   )?;
   let mut rows = statement.query([])?;

   while let Some(row) = rows.next()? {
      let verse_id: i32 = row.get(0)?;
      let commentary_id: i32 = row.get(1)?;
      let label: Option<String> = row.get(2)?;
      let content: Vec<u8> = row.get(3)?;
      let Some(verse) = verse_map.get(&verse_id) else {
         continue;
      };
      let html = key
         .decrypt(&content)
         .with_context(|| format!("failed to decrypt VerseCommentary {commentary_id}"))?;
      let heading = label
         .map(|label| {
            html_paragraphs(&label, &canonical, false)
               .into_iter()
               .map(|paragraph| paragraph.text)
               .collect::<Vec<_>>()
               .join(" ")
         })
         .unwrap_or_default();
      let paragraphs = html_paragraphs(&html, &canonical, true);
      if paragraphs.is_empty() {
         continue;
      }

      notes
         .entry(verse.book_number)
         .or_default()
         .entry(verse_id)
         .or_default()
         .push(StudyNote {
            commentary_id,
            heading,
            paragraphs,
         });
   }

   Ok(notes)
}

pub fn extract_footnotes(
   connection: &Connection,
   key: &ContentKey,
   verse_map: &HashMap<i32, VerseRef>,
) -> Result<NotesByBook<Footnote>> {
   let mut footnotes = NotesByBook::new();
   if !table_exists(connection, "Footnote")? {
      return Ok(footnotes);
   }

   let canonical = canonical_index(verse_map);
   let mut statement = connection.prepare(
      r#"
      SELECT BibleVerseId, FootnoteId, Content
      FROM Footnote
      WHERE BibleVerseId IS NOT NULL AND Content IS NOT NULL
      ORDER BY BibleVerseId, FootnoteIndex, FootnoteId
      "#,
   )?;
   let mut rows = statement.query([])?;

   while let Some(row) = rows.next()? {
      let verse_id: i32 = row.get(0)?;
      let footnote_id: i32 = row.get(1)?;
      let content: Vec<u8> = row.get(2)?;
      let Some(verse) = verse_map.get(&verse_id) else {
         continue;
      };
      let html = key
         .decrypt(&content)
         .with_context(|| format!("failed to decrypt Footnote {footnote_id}"))?;
      let paragraphs = html_paragraphs(&html, &canonical, false);
      if paragraphs.is_empty() {
         continue;
      }

      footnotes
         .entry(verse.book_number)
         .or_default()
         .entry(verse_id)
         .or_default()
         .push(Footnote {
            footnote_id,
            paragraphs,
         });
   }

   Ok(footnotes)
}

/// Converts an HTML fragment into plain-text paragraphs (one per `<p>`, or one for the whole
/// fragment when it has no `<p>`). With `extract_lemma`, a leading `<strong>…:</strong>` becomes
/// the paragraph's `lemma`.
pub fn html_paragraphs(
   html: &str,
   canonical: &HashMap<i32, i32>,
   extract_lemma: bool,
) -> Vec<NoteParagraph> {
   let fragment = Html::parse_fragment(html);
   let paragraph_selector = Selector::parse("p").expect("p selector should parse");
   let paragraphs = fragment
      .select(&paragraph_selector)
      // Skip paragraphs nested in another paragraph (not valid HTML, but be safe).
      .filter(|paragraph| {
         !paragraph
            .ancestors()
            .filter_map(ElementRef::wrap)
            .any(|ancestor| ancestor.value().name() == "p")
      })
      .collect::<Vec<_>>();

   let mut result = Vec::new();
   if paragraphs.is_empty() {
      let mut builder = TextBuilder::new(canonical);
      builder.walk_children(fragment.root_element());
      if let Some(paragraph) = builder.finish(None, None) {
         result.push(paragraph);
      }
      return result;
   }

   for paragraph in paragraphs {
      let pid = paragraph
         .value()
         .attr("data-pid")
         .and_then(|pid| pid.parse().ok());
      let mut builder = TextBuilder::new(canonical);
      let mut lemma = None;
      let mut children = paragraph.children().peekable();

      if extract_lemma {
         while children.peek().is_some_and(
            |child| matches!(child.value(), Node::Text(text) if text.trim().is_empty()),
         ) {
            children.next();
         }
         if let Some(first) = children.peek().and_then(|child| ElementRef::wrap(*child))
            && first.value().name() == "strong"
         {
            let text = collapse_whitespace(&first.text().collect::<String>());
            if let Some(stripped) = text.strip_suffix(':') {
               lemma = Some(stripped.trim().to_string());
               children.next();
            }
         }
      }

      for child in children {
         builder.walk(child);
      }
      if let Some(paragraph) = builder.finish(pid, lemma) {
         result.push(paragraph);
      }
   }

   result
}

struct TextBuilder<'a> {
   canonical: &'a HashMap<i32, i32>,
   text: String,
   utf16_len: i32,
   pending_space: bool,
   refs: Vec<[i32; 4]>,
}

impl<'a> TextBuilder<'a> {
   fn new(canonical: &'a HashMap<i32, i32>) -> Self {
      Self {
         canonical,
         text: String::new(),
         utf16_len: 0,
         pending_space: false,
         refs: Vec::new(),
      }
   }

   fn push_char(&mut self, character: char) {
      self.text.push(character);
      self.utf16_len += i32::try_from(character.len_utf16()).expect("utf16 length fits");
   }

   fn push_text(&mut self, raw: &str) {
      for character in raw.chars() {
         match character {
            '\u{200b}' | '\u{feff}' | '\u{00ad}' => {}
            character if character.is_whitespace() && character != '\u{a0}' => {
               self.pending_space = true;
            }
            character => {
               if self.pending_space && !self.text.is_empty() && !self.text.ends_with('\n') {
                  self.push_char(' ');
               }
               self.pending_space = false;
               self.push_char(character);
            }
         }
      }
   }

   fn walk_children(&mut self, element: ElementRef<'_>) {
      for child in element.children() {
         self.walk(child);
      }
   }

   fn walk(&mut self, node: NodeRef<'_, Node>) {
      match node.value() {
         Node::Text(text) => self.push_text(text),
         Node::Element(element) => {
            let Some(element_ref) = ElementRef::wrap(node) else {
               return;
            };
            match element.name() {
               "br" => {
                  self.pending_space = false;
                  if !self.text.is_empty() {
                     self.push_char('\n');
                  }
               }
               "script" | "style" | "img" | "figure" | "figcaption" | "video" | "audio" => {}
               "a" => {
                  let target = element.attr("href").and_then(|href| self.resolve(href));
                  // Leading whitespace inside the link belongs before the span.
                  let start_bytes = self.text.len();
                  let start_utf16 = self.utf16_len;
                  self.walk_children(element_ref);
                  if let Some((from, to)) = target {
                     self.record_ref(start_bytes, start_utf16, from, to);
                  }
               }
               _ => self.walk_children(element_ref),
            }
         }
         _ => {}
      }
   }

   fn resolve(&self, href: &str) -> Option<(i32, i32)> {
      let range = href.strip_prefix("jwpub://b/")?.rsplit('/').next()?;
      let mut parts = range.split('-');
      let start = parse_bcv(parts.next()?)?;
      let end = parts.next().and_then(parse_bcv).unwrap_or(start);
      let from = *self.canonical.get(&start)?;
      let to = self.canonical.get(&end).copied().unwrap_or(from);

      Some((from, to.max(from)))
   }

   fn record_ref(&mut self, start_bytes: usize, start_utf16: i32, from: i32, to: i32) {
      let span = &self.text[start_bytes..];
      let leading = span
         .chars()
         .take_while(|character| character.is_whitespace())
         .collect::<String>();
      let trailing = span
         .chars()
         .rev()
         .take_while(|character| character.is_whitespace() || matches!(character, ';' | ','))
         .collect::<String>();
      let utf16 = |value: &str| i32::try_from(value.encode_utf16().count()).expect("fits");
      let start = start_utf16 + utf16(&leading);
      let end = self.utf16_len - utf16(&trailing);

      if end > start {
         self.refs.push([start, end, from, to]);
      }
   }

   fn finish(self, pid: Option<i32>, lemma: Option<String>) -> Option<NoteParagraph> {
      let trimmed_end = self.text.trim_end();
      let removed = &self.text[trimmed_end.len()..];
      let max_end = self.utf16_len - i32::try_from(removed.encode_utf16().count()).expect("fits");
      let text = trimmed_end.to_string();
      if text.is_empty() && lemma.is_none() {
         return None;
      }
      let refs = self
         .refs
         .into_iter()
         .filter_map(|[start, end, from, to]| {
            let end = end.min(max_end);
            (end > start).then_some([start, end, from, to])
         })
         .collect();

      Some(NoteParagraph {
         pid,
         lemma,
         text,
         refs,
      })
   }
}

fn parse_bcv(value: &str) -> Option<i32> {
   let mut parts = value.split(':');
   let book = parts.next()?.trim().parse::<u8>().ok()?;
   let chapter = parts.next()?.trim().parse::<u16>().ok()?;
   let verse = parts.next()?.trim().parse::<u16>().ok()?;

   Some(canonical_verse_id(book, chapter, verse))
}

fn collapse_whitespace(value: &str) -> String {
   value
      .replace('\u{200b}', "")
      .split_whitespace()
      .collect::<Vec<_>>()
      .join(" ")
}

#[cfg(test)]
mod tests {
   use super::*;

   fn canonical() -> HashMap<i32, i32> {
      HashMap::from([
         (canonical_verse_id(1, 2, 4), 100),
         (canonical_verse_id(1, 5, 1), 200),
         (canonical_verse_id(40, 1, 6), 300),
         (canonical_verse_id(40, 1, 7), 301),
      ])
   }

   fn utf16_slice(text: &str, start: i32, end: i32) -> String {
      let units = text.encode_utf16().collect::<Vec<_>>();
      String::from_utf16(&units[start as usize..end as usize]).expect("valid utf16")
   }

   #[test]
   fn converts_study_note_html_to_text_with_refs() {
      let html = concat!(
         r#"<p id="p7" data-pid="7" class="s5"><strong>book of the history:</strong> "#,
         r#"Greek <em>Biʹblos</em> “record.”​—<a href="jwpub://b/NWTR/1:2:4-1:2:4" class="b">Ge 2:4;</a>"#,
         r#"<a href="jwpub://b/NWTR/1:5:1-1:5:1" class="b"> 5:1</a>.</p>"#,
         "\n",
         r#"<p data-pid="8"><strong>Christ:</strong> See <a href="jwpub://b/NWTR/40:1:6-40:1:7">Mt 1:6, 7</a><br/>and <a class="xt" href="jwpub://p/E:1/">Glossary</a>.</p>"#,
      );

      let paragraphs = html_paragraphs(html, &canonical(), true);

      assert_eq!(paragraphs.len(), 2);
      let first = &paragraphs[0];
      assert_eq!(first.pid, Some(7));
      assert_eq!(first.lemma.as_deref(), Some("book of the history"));
      assert_eq!(first.text, "Greek Biʹblos “record.”—Ge 2:4; 5:1.");
      assert_eq!(first.refs.len(), 2);
      assert_eq!(first.refs[0][2..], [100, 100]);
      assert_eq!(
         utf16_slice(&first.text, first.refs[0][0], first.refs[0][1]),
         "Ge 2:4"
      );
      assert_eq!(
         utf16_slice(&first.text, first.refs[1][0], first.refs[1][1]),
         "5:1"
      );

      let second = &paragraphs[1];
      assert_eq!(second.lemma.as_deref(), Some("Christ"));
      assert_eq!(second.text, "See Mt 1:6, 7\nand Glossary.");
      assert_eq!(second.refs, vec![[4, 13, 300, 301]]);
   }

   #[test]
   fn keeps_bold_text_that_is_not_a_lemma() {
      let html = r#"<p data-pid="14"><strong>father:</strong> In the expression <strong>became father to</strong> (lit.)</p>"#;
      let paragraphs = html_paragraphs(html, &canonical(), true);

      assert_eq!(paragraphs[0].lemma.as_deref(), Some("father"));
      assert_eq!(
         paragraphs[0].text,
         "In the expression became father to (lit.)"
      );

      let footnote = html_paragraphs(
         r#"<div class="fcc fn-ref"><p data-pid="468">Or “empty.”</p></div>"#,
         &canonical(),
         false,
      );
      assert_eq!(footnote[0].text, "Or “empty.”");
      assert_eq!(footnote[0].lemma, None);
   }

   #[test]
   fn drops_unresolvable_refs_but_keeps_text() {
      let html = r#"<p><a href="jwpub://b/NWTR/66:30:1-66:30:1">Re 30:1</a></p>"#;
      let paragraphs = html_paragraphs(html, &canonical(), false);

      assert_eq!(paragraphs[0].text, "Re 30:1");
      assert!(paragraphs[0].refs.is_empty());
      assert!(html_paragraphs("<p> </p>", &canonical(), false).is_empty());
   }
}
