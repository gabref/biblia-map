"""Build the mark + wordmark lockups with the wordmark outlined (no font needed to view them).

The wordmark is "BibliaMap" in Literata 600, tracking -0.018em — the same setting as the shell's
.brand-title. Outlines come from the variable font shipped in frontend/node_modules.

usage: python3 scripts/brand/wordmark.py            (from the repo root; needs fonttools + brotli)
writes: docs/design/brand/bibliamap-lockup-{dark,light}.svg
"""
import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "frontend/node_modules/@fontsource-variable/literata/files/literata-latin-wght-normal.woff2"
ICON = ROOT / "frontend/public/bibliamap-icon.svg"
OUT = ROOT / "docs/design/brand"

TEXT = "BibliaMap"
TILE = 128  # mark size in lockup units
GAP = 30  # mark to wordmark
SIZE = 92  # wordmark font size
TRACKING = -0.018  # em
INK = {"dark": "#e9ebef", "light": "#151922"}  # --ink on the dark / light theme

font = instantiateVariableFont(TTFont(FONT), {"wght": 600})
upm = font["head"].unitsPerEm
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
cap_height = font["OS/2"].sCapHeight
scale = SIZE / upm

# Cap height is centred on the tile; y grows downward in SVG, so flip the glyphs.
baseline = TILE / 2 + cap_height * scale / 2
x = TILE + GAP
pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
for ch in TEXT:
    name = cmap[ord(ch)]
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
    x += (glyphs[name].width + TRACKING * upm) * scale
width = round(x - TRACKING * SIZE + 2)

icon = ICON.read_text()
mark = "".join(re.search(rf'<g id="{part}">(.*?)</g>', icon, re.S).group(1) for part in ("tile", "glyph"))
mark = re.sub(r"\n\s*", "", mark)

OUT.mkdir(parents=True, exist_ok=True)
for theme, ink in INK.items():
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{TILE}" viewBox="0 0 {width} {TILE}" fill="none">\n'
        f"  <title>BibliaMap</title>\n"
        f'  <g transform="scale({TILE / 512})">{mark}</g>\n'
        f'  <path fill="{ink}" d="{pen.getCommands()}"/>\n'
        f"</svg>\n"
    )
    (OUT / f"bibliamap-lockup-{theme}.svg").write_text(svg)
    print(f"bibliamap-lockup-{theme}.svg {width}x{TILE}")
