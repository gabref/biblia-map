#![allow(clippy::upper_case_acronyms)]
//! Reader utilities for JWPub archives used by the BibliaMap build pipeline.

use std::{
   fs::File,
   io::{Cursor, Read, Write},
   path::{Path, PathBuf},
};

use aes::{
   Aes128,
   cipher::{BlockCipherDecrypt, KeyInit},
};
use flate2::read::ZlibDecoder;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tempfile::TempDir;
use thiserror::Error;
use zip::ZipArchive;

/// A parsed JWPub manifest.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JWPUBManifest {
   pub name: Option<String>,
   pub publication: JWPUBPublication,
}

/// Publication metadata from a JWPub manifest.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JWPUBPublication {
   pub file_name: String,
   pub title: String,
   pub symbol: String,
   pub year: Option<i32>,
   pub language: Option<i32>,
   pub publication_type: Option<String>,
}

/// An opened publication database and the temporary file that backs it.
pub struct OpenedJWPUB {
   manifest: JWPUBManifest,
   database_path: PathBuf,
   connection: Connection,
   _temp_dir: TempDir,
}

impl OpenedJWPUB {
   /// Returns the parsed publication manifest.
   pub fn manifest(&self) -> &JWPUBManifest {
      &self.manifest
   }

   /// Returns the temporary SQLite database path.
   pub fn database_path(&self) -> &Path {
      &self.database_path
   }

   /// Returns the SQLite connection.
   pub fn connection(&self) -> &Connection {
      &self.connection
   }
}

/// JWPub reader failures.
#[derive(Debug, Error)]
pub enum JWPUBError {
   #[error("failed to read archive: {0}")]
   IO(#[from] std::io::Error),

   #[error("failed to read zip archive: {0}")]
   Zip(#[from] zip::result::ZipError),

   #[error("manifest.json is invalid: {0}")]
   ManifestJSON(#[from] serde_json::Error),

   #[error("failed to open SQLite database: {0}")]
   SQLite(#[from] rusqlite::Error),

   #[error("manifest is missing publication.fileName")]
   MissingDatabaseName,

   #[error("manifest publication.fileName is not a plain file name: {0}")]
   UnsafeDatabaseName(String),

   #[error("encrypted content is malformed: {0}")]
   InvalidContent(&'static str),

   #[error("publication metadata row is missing")]
   MissingPublication,
}

/// Opens a JWPub archive and returns a SQLite connection backed by a temp file.
pub fn open_jwpub(path: &Path) -> Result<OpenedJWPUB, JWPUBError> {
   let file = File::open(path)?;
   let mut outer_zip = ZipArchive::new(file)?;
   let manifest = read_manifest(&mut outer_zip)?;
   let database_bytes = read_database_bytes(&manifest, &mut outer_zip)?;
   let temp_dir = TempDir::with_prefix("bibliamap-jwpub-")?;
   // `file_name` comes from an untrusted archive; `validate_database_name` guarantees it is a
   // single normal path component so the join cannot escape the temp dir.
   let database_path = temp_dir.path().join(&manifest.publication.file_name);
   let mut database_file = File::create(&database_path)?;
   database_file.write_all(&database_bytes)?;
   drop(database_file);

   let connection = Connection::open(&database_path)?;

   Ok(OpenedJWPUB {
      manifest,
      database_path,
      connection,
      _temp_dir: temp_dir,
   })
}

/// XOR mask applied to the SHA-256 of the publication card to derive the content key.
const CONTENT_KEY_MASK: [u8; 32] = [
   0x11, 0xcb, 0xb5, 0x58, 0x7e, 0x32, 0x84, 0x6d, 0x4c, 0x26, 0x79, 0x0c, 0x63, 0x3d, 0xa2, 0x89,
   0xf6, 0x6f, 0xe5, 0x84, 0x2a, 0x3a, 0x58, 0x5c, 0xe1, 0xbc, 0x3a, 0x29, 0x4a, 0xf5, 0xad, 0xa7,
];

/// Key material for the `Content` blobs of a JWPub database (documents, verse commentaries,
/// footnotes). Blobs are AES-128-CBC encrypted (PKCS#7 padding) zlib streams; the key and IV are
/// derived from the publication "card" `<MepsLanguageIndex>_<Symbol>_<Year>[_<IssueTagNumber>]`.
#[derive(Clone)]
pub struct ContentKey {
   cipher: Aes128,
   iv: [u8; 16],
}

impl std::fmt::Debug for ContentKey {
   fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
      formatter.write_str("ContentKey(..)")
   }
}

impl ContentKey {
   /// Derives the key from a publication card such as `0_nwtsty_2026`.
   pub fn from_publication_card(card: &str) -> Self {
      let digest = Sha256::digest(card.as_bytes());
      let mut material = [0_u8; 32];

      for (index, byte) in material.iter_mut().enumerate() {
         *byte = digest[index] ^ CONTENT_KEY_MASK[index];
      }

      let mut iv = [0_u8; 16];
      iv.copy_from_slice(&material[16..]);

      Self {
         cipher: Aes128::new_from_slice(&material[..16]).expect("AES-128 key is 16 bytes"),
         iv,
      }
   }

   /// Reads the publication card from the database's `Publication` table.
   pub fn from_connection(connection: &Connection) -> Result<Self, JWPUBError> {
      let (language, symbol, year, issue_tag) = connection
         .query_row(
            "SELECT MepsLanguageIndex, Symbol, Year, IssueTagNumber FROM Publication LIMIT 1",
            [],
            |row| {
               Ok((
                  row.get::<_, i64>(0)?,
                  row.get::<_, String>(1)?,
                  row.get::<_, i64>(2)?,
                  row.get::<_, Option<String>>(3)?,
               ))
            },
         )
         .optional()?
         .ok_or(JWPUBError::MissingPublication)?;

      Ok(Self::from_publication_card(&publication_card(
         language,
         &symbol,
         year,
         issue_tag.as_deref(),
      )))
   }

   /// Decrypts and inflates one `Content` blob into its HTML text.
   pub fn decrypt(&self, blob: &[u8]) -> Result<String, JWPUBError> {
      if blob.is_empty() || !blob.len().is_multiple_of(16) {
         return Err(JWPUBError::InvalidContent("length is not a multiple of 16"));
      }

      let mut plain = Vec::with_capacity(blob.len());
      let mut previous = self.iv;

      for chunk in blob.as_chunks::<16>().0 {
         let mut block = aes::Block::from(*chunk);
         self.cipher.decrypt_block(&mut block);
         plain.extend(block.iter().zip(previous).map(|(byte, mask)| byte ^ mask));
         previous.copy_from_slice(chunk);
      }

      let padding = usize::from(*plain.last().expect("plain text is not empty"));
      if padding == 0 || padding > 16 || padding > plain.len() {
         return Err(JWPUBError::InvalidContent("bad padding"));
      }
      plain.truncate(plain.len() - padding);

      let mut html = String::new();
      ZlibDecoder::new(plain.as_slice())
         .read_to_string(&mut html)
         .map_err(|_| JWPUBError::InvalidContent("zlib stream is invalid"))?;

      Ok(html)
   }
}

/// Builds the publication card used for content key derivation.
pub fn publication_card(
   meps_language_index: i64,
   symbol: &str,
   year: i64,
   issue_tag_number: Option<&str>,
) -> String {
   match issue_tag_number.map(str::trim) {
      Some(tag) if !tag.is_empty() && tag != "0" => {
         format!("{meps_language_index}_{symbol}_{year}_{tag}")
      }
      _ => format!("{meps_language_index}_{symbol}_{year}"),
   }
}

fn read_manifest<R: Read + std::io::Seek>(
   zip_archive: &mut ZipArchive<R>,
) -> Result<JWPUBManifest, JWPUBError> {
   let mut manifest_file = zip_archive.by_name("manifest.json")?;
   let mut manifest_json = String::new();
   manifest_file.read_to_string(&mut manifest_json)?;

   Ok(serde_json::from_str(&manifest_json)?)
}

fn read_database_bytes<R: Read + std::io::Seek>(
   manifest: &JWPUBManifest,
   zip_archive: &mut ZipArchive<R>,
) -> Result<Vec<u8>, JWPUBError> {
   validate_database_name(&manifest.publication.file_name)?;

   let mut contents_file = zip_archive.by_name("contents")?;
   let mut contents_bytes = Vec::new();
   contents_file.read_to_end(&mut contents_bytes)?;
   drop(contents_file);

   let cursor = Cursor::new(contents_bytes);
   let mut inner_zip = ZipArchive::new(cursor)?;
   let mut database_file = inner_zip.by_name(&manifest.publication.file_name)?;
   let mut database_bytes = Vec::new();
   database_file.read_to_end(&mut database_bytes)?;

   Ok(database_bytes)
}

/// Rejects database names that are empty or would resolve outside the extraction directory
/// (absolute paths, `..`, or nested directories).
fn validate_database_name(file_name: &str) -> Result<(), JWPUBError> {
   if file_name.is_empty() {
      return Err(JWPUBError::MissingDatabaseName);
   }

   let mut components = Path::new(file_name).components();
   let is_plain_name = matches!(
      (components.next(), components.next()),
      (Some(std::path::Component::Normal(_)), None)
   ) && !file_name.contains(['/', '\\']);

   if is_plain_name {
      Ok(())
   } else {
      Err(JWPUBError::UnsafeDatabaseName(file_name.to_string()))
   }
}

#[cfg(test)]
mod tests {
   use super::*;
   use aes::cipher::BlockCipherEncrypt;
   use flate2::{Compression, write::ZlibEncoder};

   fn encrypt_for_test(card: &str, html: &str) -> Vec<u8> {
      let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
      encoder
         .write_all(html.as_bytes())
         .expect("zlib should write");
      let mut plain = encoder.finish().expect("zlib should finish");
      let padding = 16 - plain.len() % 16;
      plain.extend(std::iter::repeat_n(padding as u8, padding));

      let digest = Sha256::digest(card.as_bytes());
      let material = (0..32)
         .map(|index| digest[index] ^ CONTENT_KEY_MASK[index])
         .collect::<Vec<_>>();
      let cipher = Aes128::new_from_slice(&material[..16]).expect("key should init");
      let mut previous = material[16..].to_vec();
      let mut encrypted = Vec::new();

      for chunk in plain.as_chunks::<16>().0 {
         let xored = chunk
            .iter()
            .zip(&previous)
            .map(|(left, right)| left ^ right)
            .collect::<Vec<_>>();
         let mut block = aes::Block::try_from(xored.as_slice()).expect("16 bytes");
         cipher.encrypt_block(&mut block);
         previous = block.to_vec();
         encrypted.extend_from_slice(&block);
      }

      encrypted
   }

   #[test]
   fn decrypts_content_blobs() {
      let html = r#"<p data-pid="7"><strong>Christ:</strong> “Anointed One.”</p>"#;
      let blob = encrypt_for_test("0_nwtsty_2026", html);

      let key = ContentKey::from_publication_card("0_nwtsty_2026");
      assert_eq!(key.decrypt(&blob).expect("blob should decrypt"), html);

      let wrong_key = ContentKey::from_publication_card("4_nwtsty_2026");
      assert!(wrong_key.decrypt(&blob).is_err());
      assert!(key.decrypt(&blob[..15]).is_err());
   }

   #[test]
   fn builds_publication_cards() {
      assert_eq!(
         publication_card(0, "nwtsty", 2026, Some("0")),
         "0_nwtsty_2026"
      );
      assert_eq!(publication_card(4, "nwtsty", 2026, None), "4_nwtsty_2026");
      assert_eq!(
         publication_card(0, "w", 2024, Some("20240100")),
         "0_w_2024_20240100"
      );
   }
   use std::io::Write;
   use tempfile::NamedTempFile;
   use zip::{ZipWriter, write::SimpleFileOptions};

   #[test]
   fn opens_nested_database_from_manifest() {
      let database_bytes = build_sample_database_bytes();
      let archive = build_jwpub_archive(
         r#"{
            "publication": {
               "fileName": "sample.db",
               "title": "Sample",
               "symbol": "smp",
               "year": 2026,
               "language": 0,
               "publicationType": "Bible"
            }
         }"#,
         Some(("sample.db", database_bytes.as_slice())),
      );

      let opened = open_jwpub(archive.path()).expect("archive should open");

      assert_eq!(opened.manifest().publication.file_name, "sample.db");
      assert!(opened.database_path().exists());
   }

   #[test]
   fn reports_missing_manifest() {
      let archive = build_zip_without_manifest();
      let error = match open_jwpub(archive.path()) {
         Ok(_) => panic!("archive should fail"),
         Err(error) => error,
      };

      assert!(matches!(error, JWPUBError::Zip(_)));
   }

   #[test]
   fn reports_missing_database() {
      let archive = build_jwpub_archive(
         r#"{
            "publication": {
               "fileName": "missing.db",
               "title": "Sample",
               "symbol": "smp",
               "year": 2026,
               "language": 0,
               "publicationType": "Bible"
            }
         }"#,
         None,
      );
      let error = match open_jwpub(archive.path()) {
         Ok(_) => panic!("archive should fail"),
         Err(error) => error,
      };

      assert!(matches!(error, JWPUBError::Zip(_)));
   }

   #[test]
   fn rejects_database_names_that_escape_the_temp_dir() {
      for file_name in [
         "../evil.db",
         "/tmp/evil.db",
         "nested/evil.db",
         "..",
         "a\\b.db",
      ] {
         assert!(
            matches!(
               validate_database_name(file_name),
               Err(JWPUBError::UnsafeDatabaseName(_))
            ),
            "{file_name} should be rejected"
         );
      }
      assert!(matches!(
         validate_database_name(""),
         Err(JWPUBError::MissingDatabaseName)
      ));
      assert!(validate_database_name("nwtsty_E.db").is_ok());
   }

   #[test]
   fn open_rejects_traversal_file_name() {
      let archive = build_jwpub_archive(
         r#"{
            "publication": {
               "fileName": "../escaped.db",
               "title": "Sample",
               "symbol": "smp",
               "year": 2026,
               "language": 0,
               "publicationType": "Bible"
            }
         }"#,
         Some(("../escaped.db", b"not a database".as_slice())),
      );
      let error = match open_jwpub(archive.path()) {
         Ok(_) => panic!("archive should fail"),
         Err(error) => error,
      };

      assert!(matches!(error, JWPUBError::UnsafeDatabaseName(_)));
   }

   fn build_sample_database_bytes() -> Vec<u8> {
      let database_file = NamedTempFile::new().expect("sqlite temp file should create");
      {
         let connection =
            Connection::open(database_file.path()).expect("sqlite temp database should open");
         connection
            .execute("CREATE TABLE sample (id INTEGER PRIMARY KEY)", [])
            .expect("sample schema should create");
      }

      std::fs::read(database_file.path()).expect("sqlite database bytes should read")
   }

   fn build_jwpub_archive(manifest: &str, database: Option<(&str, &[u8])>) -> NamedTempFile {
      let mut contents_cursor = Cursor::new(Vec::new());
      {
         let mut contents_zip = ZipWriter::new(&mut contents_cursor);
         if let Some((database_name, database_bytes)) = database {
            contents_zip
               .start_file(database_name, SimpleFileOptions::default())
               .expect("database entry should start");
            contents_zip
               .write_all(database_bytes)
               .expect("database bytes should write");
         }
         contents_zip.finish().expect("contents zip should finish");
      }

      let archive = NamedTempFile::new().expect("temp file should create");
      {
         let mut outer_zip = ZipWriter::new(
            archive
               .reopen()
               .expect("temp archive should reopen for writing"),
         );
         outer_zip
            .start_file("manifest.json", SimpleFileOptions::default())
            .expect("manifest entry should start");
         outer_zip
            .write_all(manifest.as_bytes())
            .expect("manifest should write");
         outer_zip
            .start_file("contents", SimpleFileOptions::default())
            .expect("contents entry should start");
         outer_zip
            .write_all(contents_cursor.get_ref())
            .expect("contents should write");
         outer_zip.finish().expect("outer zip should finish");
      }

      archive
   }

   fn build_zip_without_manifest() -> NamedTempFile {
      let archive = NamedTempFile::new().expect("temp file should create");
      {
         let mut zip = ZipWriter::new(
            archive
               .reopen()
               .expect("temp archive should reopen for writing"),
         );
         zip.start_file("contents", SimpleFileOptions::default())
            .expect("contents entry should start");
         zip.write_all(b"not a nested zip")
            .expect("contents should write");
         zip.finish().expect("zip should finish");
      }

      archive
   }
}
