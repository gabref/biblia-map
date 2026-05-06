#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path


BOOKS = [
    "Genesis",
    "Exodus",
    "Leviticus",
    "Numbers",
    "Deuteronomy",
    "Joshua",
    "Judges",
    "Ruth",
    "1 Samuel",
    "2 Samuel",
    "1 Kings",
    "2 Kings",
    "1 Chronicles",
    "2 Chronicles",
    "Ezra",
    "Nehemiah",
    "Esther",
    "Job",
    "Psalms",
    "Proverbs",
    "Ecclesiastes",
    "Song of Solomon",
    "Isaiah",
    "Jeremiah",
    "Lamentations",
    "Ezekiel",
    "Daniel",
    "Hosea",
    "Joel",
    "Amos",
    "Obadiah",
    "Jonah",
    "Micah",
    "Nahum",
    "Habakkuk",
    "Zephaniah",
    "Haggai",
    "Zechariah",
    "Malachi",
    "Matthew",
    "Mark",
    "Luke",
    "John",
    "Acts",
    "Romans",
    "1 Corinthians",
    "2 Corinthians",
    "Galatians",
    "Ephesians",
    "Philippians",
    "Colossians",
    "1 Thessalonians",
    "2 Thessalonians",
    "1 Timothy",
    "2 Timothy",
    "Titus",
    "Philemon",
    "Hebrews",
    "James",
    "1 Peter",
    "2 Peter",
    "1 John",
    "2 John",
    "3 John",
    "Jude",
    "Revelation",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a standalone HTML/SVG visualization from book_connections.csv."
    )
    parser.add_argument("input_dir", type=Path, help="Directory containing book_connections.csv and stats.json")
    parser.add_argument(
        "--output",
        type=Path,
        help="Output HTML file path. Defaults to <input_dir>/book_connections.html",
    )
    return parser.parse_args()


def polar(cx: float, cy: float, radius: float, angle: float) -> tuple[float, float]:
    return cx + radius * math.cos(angle), cy + radius * math.sin(angle)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def load_connections(csv_path: Path) -> list[dict]:
    with csv_path.open(encoding="utf-8", newline="") as fh:
        return [
            {
                "source_book_number": int(row["source_book_number"]),
                "source_book": row["source_book"],
                "target_book_number": int(row["target_book_number"]),
                "target_book": row["target_book"],
                "weight": int(row["weight"]),
            }
            for row in csv.DictReader(fh)
        ]


def build_svg(connections: list[dict], stats: dict) -> str:
    publication_symbol = stats.get("publication_symbol") or stats.get("publication_title", "Bible")
    width = 1800
    height = 1800
    cx = width / 2
    cy = height / 2
    edge_radius = 610
    label_radius = 715
    node_radius = 12
    max_weight = max(connection["weight"] for connection in connections)
    max_total_book_weight = max(
        sum(
            connection["weight"]
            for connection in connections
            if connection["source_book_number"] == index + 1 or connection["target_book_number"] == index + 1
        )
        for index, _ in enumerate(BOOKS)
    )

    book_positions: dict[int, dict] = {}
    for index, book in enumerate(BOOKS):
        angle = (-math.pi / 2) + (index / len(BOOKS)) * (2 * math.pi)
        x, y = polar(cx, cy, edge_radius, angle)
        lx, ly = polar(cx, cy, label_radius, angle)
        book_weight = sum(
            connection["weight"]
            for connection in connections
            if connection["source_book_number"] == index + 1 or connection["target_book_number"] == index + 1
        )
        book_positions[index + 1] = {
            "book": book,
            "angle": angle,
            "x": x,
            "y": y,
            "lx": lx,
            "ly": ly,
            "r": 7 + 17 * (book_weight / max_total_book_weight),
            "fill": "#d9a441" if index < 39 else "#7f9c96",
            "text_anchor": "start" if math.cos(angle) >= 0 else "end",
            "rotation": math.degrees(angle),
        }

    edge_parts = []
    for connection in sorted(connections, key=lambda item: item["weight"]):
        source = book_positions[connection["source_book_number"]]
        target = book_positions[connection["target_book_number"]]
        mid_angle = (source["angle"] + target["angle"]) / 2
        angle_gap = abs(source["angle"] - target["angle"])
        if angle_gap > math.pi:
            mid_angle += math.pi
        control_radius = clamp(200 - 70 * (connection["weight"] / max_weight), 70, 220)
        cx1, cy1 = polar(cx, cy, control_radius, mid_angle)
        stroke_width = 0.4 + 7.6 * (connection["weight"] / max_weight)
        opacity = 0.07 + 0.45 * (connection["weight"] / max_weight)
        stroke = "#c07a2c" if connection["source_book_number"] <= 39 else "#476b68"
        edge_parts.append(
            f'<path d="M {source["x"]:.1f} {source["y"]:.1f} Q {cx1:.1f} {cy1:.1f} {target["x"]:.1f} {target["y"]:.1f}" '
            f'stroke="{stroke}" stroke-width="{stroke_width:.2f}" stroke-opacity="{opacity:.3f}" '
            f'fill="none"><title>{connection["source_book"]} → {connection["target_book"]}: {connection["weight"]}</title></path>'
        )

    node_parts = []
    label_parts = []
    for book_number, position in book_positions.items():
        node_parts.append(
            f'<circle cx="{position["x"]:.1f}" cy="{position["y"]:.1f}" r="{position["r"]:.1f}" '
            f'fill="{position["fill"]}" stroke="#1c1c1c" stroke-width="1.2"><title>{position["book"]}</title></circle>'
        )
        label_parts.append(
            f'<text x="{position["lx"]:.1f}" y="{position["ly"]:.1f}" '
            f'text-anchor="{position["text_anchor"]}" dominant-baseline="middle" '
            f'class="book-label">{position["book"]}</text>'
        )

    stat_lines = [
        ("Publication", stats["publication_title"]),
        ("Cross references", f'{stats["total_cross_references"]:,}'),
        ("Distinct book links", f'{stats["distinct_book_to_book_connections"]:,}'),
        ("Distinct source verses", f'{stats["distinct_source_verses"]:,}'),
        ("Distinct target verses", f'{stats["distinct_target_verses"]:,}'),
    ]

    stat_html = "".join(
        f'<div class="stat"><span class="k">{key}</span><span class="v">{value}</span></div>'
        for key, value in stat_lines
    )

    top_books = "".join(
        f"<li>{book}: {count:,}</li>"
        for book, count in stats["top_outgoing_books"][:8]
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{publication_symbol} Book Connections</title>
  <style>
    :root {{
      --bg: #f4efe2;
      --paper: rgba(255, 251, 240, 0.82);
      --ink: #1e1b18;
      --muted: #6d655d;
      --ot: #d9a441;
      --nt: #7f9c96;
      --line: rgba(30, 27, 24, 0.12);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 20% 20%, rgba(217,164,65,0.18), transparent 22%),
        radial-gradient(circle at 80% 12%, rgba(127,156,150,0.18), transparent 24%),
        linear-gradient(180deg, #f8f3e9 0%, var(--bg) 100%);
      font-family: Georgia, "Times New Roman", serif;
    }}
    .page {{
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      min-height: 100vh;
    }}
    .sidebar {{
      padding: 28px 24px 24px;
      background: var(--paper);
      backdrop-filter: blur(8px);
      border-right: 1px solid var(--line);
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: 2rem;
      line-height: 1;
      letter-spacing: 0.02em;
    }}
    .subtitle {{
      color: var(--muted);
      margin-bottom: 22px;
      font-size: 0.98rem;
    }}
    .stat {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0;
      border-top: 1px solid var(--line);
      font-size: 0.95rem;
    }}
    .stat:last-of-type {{
      border-bottom: 1px solid var(--line);
    }}
    .k {{
      color: var(--muted);
    }}
    .v {{
      font-weight: 700;
    }}
    .legend {{
      display: flex;
      gap: 14px;
      margin: 20px 0 22px;
      font-size: 0.92rem;
      color: var(--muted);
    }}
    .swatch {{
      display: inline-block;
      width: 12px;
      height: 12px;
      margin-right: 6px;
      border-radius: 999px;
      vertical-align: middle;
    }}
    .notes {{
      margin-top: 22px;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.5;
    }}
    .top-books {{
      margin: 20px 0 0;
      padding-left: 18px;
      line-height: 1.55;
    }}
    .viz {{
      overflow: auto;
      padding: 24px;
    }}
    svg {{
      width: 100%;
      height: auto;
      min-width: 980px;
      display: block;
    }}
    .book-label {{
      font-size: 19px;
      fill: #2d2925;
    }}
    @media (max-width: 1100px) {{
      .page {{
        grid-template-columns: 1fr;
      }}
      .sidebar {{
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }}
      svg {{
        min-width: 820px;
      }}
    }}
  </style>
</head>
<body>
  <div class="page">
    <aside class="sidebar">
      <h1>{publication_symbol}</h1>
      <div class="subtitle">{stats["publication_title"]}</div>
      {stat_html}
      <div class="legend">
        <span><span class="swatch" style="background: var(--ot)"></span>Old Testament</span>
        <span><span class="swatch" style="background: var(--nt)"></span>New Testament</span>
      </div>
      <div><strong>Top outgoing books</strong></div>
      <ol class="top-books">{top_books}</ol>
      <div class="notes">
        Link width and opacity scale with the number of cross references between books.
        Self-links are included, so dense books like Psalms produce strong internal loops.
      </div>
    </aside>
    <main class="viz">
      <svg viewBox="0 0 {width} {height}" role="img" aria-label="Bible book cross reference graph">
        <rect x="0" y="0" width="{width}" height="{height}" fill="transparent" />
        <circle cx="{cx}" cy="{cy}" r="{edge_radius + 28}" fill="none" stroke="rgba(30,27,24,0.08)" stroke-width="1.2" />
        <g class="edges">
          {''.join(edge_parts)}
        </g>
        <g class="nodes">
          {''.join(node_parts)}
        </g>
        <g class="labels">
          {''.join(label_parts)}
        </g>
      </svg>
    </main>
  </div>
</body>
</html>
"""


def main() -> int:
    args = parse_args()
    input_dir = args.input_dir.resolve()
    output_path = (args.output or (input_dir / "book_connections.html")).resolve()
    connections = load_connections(input_dir / "book_connections.csv")
    stats = json.loads((input_dir / "stats.json").read_text(encoding="utf-8"))
    html = build_svg(connections, stats)
    output_path.write_text(html, encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
