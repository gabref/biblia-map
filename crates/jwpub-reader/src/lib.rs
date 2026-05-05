#![allow(clippy::upper_case_acronyms)]
//! Reader utilities for JWPub archives used by the BibliaMap build pipeline.

use std::{
   fs::File,
   io::{Cursor, Read, Write},
   path::{Path, PathBuf},
};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
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
}

/// Opens a JWPub archive and returns a SQLite connection backed by a temp file.
pub fn open_jwpub(path: &Path) -> Result<OpenedJWPUB, JWPUBError> {
   let file = File::open(path)?;
   let mut outer_zip = ZipArchive::new(file)?;
   let manifest = read_manifest(&mut outer_zip)?;
   let database_bytes = read_database_bytes(&manifest, &mut outer_zip)?;
   let temp_dir = TempDir::with_prefix("bibliamap-jwpub-")?;
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
   if manifest.publication.file_name.is_empty() {
      return Err(JWPUBError::MissingDatabaseName);
   }

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

#[cfg(test)]
mod tests {
   use super::*;
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
