#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sqlite3
import tempfile
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


BOOK_NAMES = {
    1: "Genesis",
    2: "Exodus",
    3: "Leviticus",
    4: "Numbers",
    5: "Deuteronomy",
    6: "Joshua",
    7: "Judges",
    8: "Ruth",
    9: "1 Samuel",
    10: "2 Samuel",
    11: "1 Kings",
    12: "2 Kings",
    13: "1 Chronicles",
    14: "2 Chronicles",
    15: "Ezra",
    16: "Nehemiah",
    17: "Esther",
    18: "Job",
    19: "Psalms",
    20: "Proverbs",
    21: "Ecclesiastes",
    22: "Song of Solomon",
    23: "Isaiah",
    24: "Jeremiah",
    25: "Lamentations",
    26: "Ezekiel",
    27: "Daniel",
    28: "Hosea",
    29: "Joel",
    30: "Amos",
    31: "Obadiah",
    32: "Jonah",
    33: "Micah",
    34: "Nahum",
    35: "Habakkuk",
    36: "Zephaniah",
    37: "Haggai",
    38: "Zechariah",
    39: "Malachi",
    40: "Matthew",
    41: "Mark",
    42: "Luke",
    43: "John",
    44: "Acts",
    45: "Romans",
    46: "1 Corinthians",
    47: "2 Corinthians",
    48: "Galatians",
    49: "Ephesians",
    50: "Philippians",
    51: "Colossians",
    52: "1 Thessalonians",
    53: "2 Thessalonians",
    54: "1 Timothy",
    55: "2 Timothy",
    56: "Titus",
    57: "Philemon",
    58: "Hebrews",
    59: "James",
    60: "1 Peter",
    61: "2 Peter",
    62: "1 John",
    63: "2 John",
    64: "3 John",
    65: "Jude",
    66: "Revelation",
}


VERSE_NUMBER_RE = re.compile(r"(\d+)")


@dataclass(frozen=True)
class VerseRef:
    verse_id: int
    book_number: int
    chapter_number: int
    verse_number: int

    @property
    def book_name(self) -> str:
        return BOOK_NAMES[self.book_number]

    @property
    def testament(self) -> str:
        return "OT" if self.book_number <= 39 else "NT"

    @property
    def ref(self) -> str:
        return f"{self.book_name} {self.chapter_number}:{self.verse_number}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract verse cross references from a JWPub Bible and emit stats plus graph files."
    )
    parser.add_argument("jwpub_path", type=Path, help="Path to the .jwpub file")
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory for generated CSV/JSON/DOT files. Defaults to output/<jwpub stem>",
    )
    return parser.parse_args()


def extract_manifest_and_db_bytes(jwpub_path: Path) -> tuple[dict, bytes]:
    with zipfile.ZipFile(jwpub_path) as outer_zip:
        manifest = json.loads(outer_zip.read("manifest.json"))
        contents_bytes = outer_zip.read("contents")

    with zipfile.ZipFile(io.BytesIO(contents_bytes)) as inner_zip:
        db_name = manifest["publication"]["fileName"]
        return manifest, inner_zip.read(db_name)


def load_verse_map(connection: sqlite3.Connection) -> dict[int, VerseRef]:
    query = """
        SELECT
            v.BibleVerseId,
            ch.BookNumber,
            ch.ChapterNumber,
            v.Label
        FROM BibleVerse v
        JOIN BibleChapter ch
            ON v.BibleVerseId BETWEEN ch.FirstVerseId AND ch.LastVerseId
        ORDER BY v.BibleVerseId
    """
    verse_map: dict[int, VerseRef] = {}
    for verse_id, book_number, chapter_number, label in connection.execute(query):
        match = VERSE_NUMBER_RE.search(label or "")
        if not match:
            continue
        verse_map[verse_id] = VerseRef(
            verse_id=verse_id,
            book_number=book_number,
            chapter_number=chapter_number,
            verse_number=int(match.group(1)),
        )
    return verse_map


def fetch_cross_reference_rows(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    connection.row_factory = sqlite3.Row
    query = """
        SELECT
            bc.BibleCitationId,
            bc.BibleVerseId AS SourceVerseId,
            bc.FirstBibleVerseId AS TargetStartVerseId,
            bc.LastBibleVerseId AS TargetEndVerseId,
            bc.ParagraphOrdinal,
            bc.SortPosition
        FROM BibleCitation bc
        WHERE bc.BibleVerseId IS NOT NULL
        ORDER BY bc.BibleCitationId
    """
    return list(connection.execute(query))


def build_outputs(
    publication_symbol: str,
    publication_year: int | None,
    publication_title: str,
    rows: list[sqlite3.Row],
    verse_map: dict[int, VerseRef],
    output_dir: Path,
) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)

    edge_counter: Counter[tuple[int, int]] = Counter()
    outgoing_by_book: Counter[str] = Counter()
    incoming_by_book: Counter[str] = Counter()
    testament_counter: Counter[str] = Counter()
    distinct_source_verses: set[int] = set()
    distinct_target_verses: set[int] = set()

    edge_rows: list[dict[str, object]] = []

    for row in rows:
        source = verse_map.get(row["SourceVerseId"])
        target_start = verse_map.get(row["TargetStartVerseId"])
        target_end = verse_map.get(row["TargetEndVerseId"])

        if source is None or target_start is None or target_end is None:
            continue

        distinct_source_verses.add(source.verse_id)
        distinct_target_verses.update({target_start.verse_id, target_end.verse_id})
        edge_counter[(source.book_number, target_start.book_number)] += 1
        outgoing_by_book[source.book_name] += 1
        incoming_by_book[target_start.book_name] += 1
        testament_counter[f"{source.testament}->{target_start.testament}"] += 1

        edge_rows.append(
            {
                "source_verse_id": source.verse_id,
                "source_ref": source.ref,
                "target_start_verse_id": target_start.verse_id,
                "target_start_ref": target_start.ref,
                "target_end_verse_id": target_end.verse_id,
                "target_end_ref": target_end.ref,
                "target_is_range": int(target_start.verse_id != target_end.verse_id),
                "source_book": source.book_name,
                "target_book": target_start.book_name,
                "source_testament": source.testament,
                "target_testament": target_start.testament,
                "paragraph_ordinal": row["ParagraphOrdinal"],
                "sort_position": row["SortPosition"],
            }
        )

    edge_rows.sort(key=lambda row: (row["source_verse_id"], row["sort_position"]))

    with (output_dir / "cross_references.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(edge_rows[0].keys()) if edge_rows else [])
        if edge_rows:
            writer.writeheader()
            writer.writerows(edge_rows)

    book_rows = []
    for (source_book_number, target_book_number), weight in sorted(edge_counter.items()):
        book_rows.append(
            {
                "source_book_number": source_book_number,
                "source_book": BOOK_NAMES[source_book_number],
                "target_book_number": target_book_number,
                "target_book": BOOK_NAMES[target_book_number],
                "weight": weight,
            }
        )

    with (output_dir / "book_connections.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(book_rows[0].keys()) if book_rows else [])
        if book_rows:
            writer.writeheader()
            writer.writerows(book_rows)

    dot_lines = [
        "digraph BibleCrossReferences {",
        '  graph [rankdir="LR", overlap="false", splines="true"];',
        '  node [shape="box", style="rounded,filled", fillcolor="#f6f0d7", color="#444444"];',
        '  edge [color="#666666"];',
    ]
    for book_number in sorted({n for pair in edge_counter for n in pair}):
        dot_lines.append(f'  "{BOOK_NAMES[book_number]}";')
    for (source_book_number, target_book_number), weight in sorted(edge_counter.items()):
        penwidth = 1 + min(weight / 25.0, 8)
        dot_lines.append(
            f'  "{BOOK_NAMES[source_book_number]}" -> "{BOOK_NAMES[target_book_number]}" '
            f'[label="{weight}", penwidth="{penwidth:.2f}"];'
        )
    dot_lines.append("}")
    (output_dir / "book_connections.dot").write_text("\n".join(dot_lines) + "\n", encoding="utf-8")

    stats = {
        "publication_title": publication_title,
        "publication_symbol": publication_symbol,
        "publication_year": publication_year,
        "total_cross_references": len(edge_rows),
        "distinct_source_verses": len(distinct_source_verses),
        "distinct_target_verses": len(distinct_target_verses),
        "distinct_book_to_book_connections": len(edge_counter),
        "cross_testament_breakdown": dict(sorted(testament_counter.items())),
        "top_outgoing_books": outgoing_by_book.most_common(10),
        "top_incoming_books": incoming_by_book.most_common(10),
        "generated_files": [
            "cross_references.csv",
            "book_connections.csv",
            "book_connections.dot",
        ],
        "notes": [
            "This export uses verse-linked BibleCitation rows, which are present in all three JWPub assets in this workspace.",
            "Targets may be verse ranges; the CSV includes both start and end references.",
            "Study Edition commentary links are not included yet; those likely need VerseCommentary and VerseCommentaryMap as a second extraction path.",
        ],
    }
    (output_dir / "stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
    return stats


def main() -> int:
    args = parse_args()
    jwpub_path = args.jwpub_path.resolve()
    output_dir = (args.output_dir or Path("output") / jwpub_path.stem).resolve()

    manifest, db_bytes = extract_manifest_and_db_bytes(jwpub_path)
    with tempfile.TemporaryDirectory(prefix="jwpub-db-") as tmp_dir:
        db_path = Path(tmp_dir) / manifest["publication"]["fileName"]
        db_path.write_bytes(db_bytes)

        connection = sqlite3.connect(db_path)
        try:
            verse_map = load_verse_map(connection)
            rows = fetch_cross_reference_rows(connection)
        finally:
            connection.close()

    stats = build_outputs(
        publication_symbol=manifest["publication"]["symbol"],
        publication_year=manifest["publication"].get("year"),
        publication_title=manifest["publication"]["title"],
        rows=rows,
        verse_map=verse_map,
        output_dir=output_dir,
    )

    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
