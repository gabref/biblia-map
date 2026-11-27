"""OG cards (1200x630 + 600x600) in the 'Reference Column' dark design.
Chord diagram from real book-to-book counts, arcs coloured by canon section with section gaps.
usage: gen.py <book.combined.json> <icon.svg> <frontend/node_modules> <out_dir>   (run.sh passes repo-relative defaults)"""
import json, math, os, sys

matrix_path, icon_path, nm, out_dir = (os.path.abspath(p) for p in sys.argv[1:5])
M = json.load(open(matrix_path))
icon_svg = open(icon_path).read()
N = len(M)

# Dark values of tokens.css (light-dark(a, b) -> b)
T = dict(
    bg="#0d1015", sunken="#080a0e", surface="#151920", ink="#e9ebef", ink2="#b4bac6", ink3="#8a92a1",
    line="rgba(233,235,239,.10)", line_strong="rgba(233,235,239,.22)",
    accent="#8faef5", gilt="#e2b44c", rubric="#f0705a",
)
SECTIONS = [  # (key, label, colour, first book idx, last idx inclusive) 0-based
    ("law", "Law", "#d9a05b", 0, 4),
    ("history", "History", "#e9c46a", 5, 16),
    ("poetry", "Poetry", "#bdbb5c", 17, 21),
    ("prophets", "Prophets", "#e98a6b", 22, 38),
    ("gospels", "Gospels & Acts", "#7fa6f8", 39, 43),
    ("letters", "Letters", "#56c2b4", 44, 64),
    ("revelation", "Revelation", "#b095f0", 65, 65),
]
sec_of = [0] * N
for k, (_, _, _, a, b) in enumerate(SECTIONS):
    for i in range(a, b + 1):
        sec_of[i] = k
col_of = lambda i: SECTIONS[sec_of[i]][2]

W = [[(M[i][j] + M[j][i]) if i != j else 0 for j in range(N)] for i in range(N)]
tot = [sum(r) for r in W]
grand = sum(tot)


def chord_svg(cx, cy, R, n_links, ring=13, book_gap=0.55, sec_gap=3.2):
    nsec = len(SECTIONS)
    avail = 2 * math.pi - math.radians(book_gap) * (N - nsec) - math.radians(sec_gap) * nsec
    raw = [max(t / grand, 0.0045) for t in tot]
    s = sum(raw)
    widths = [r / s * avail for r in raw]
    starts, a = [], -math.pi / 2 + math.radians(sec_gap / 2)
    for i in range(N):
        if i > 0:
            a += math.radians(sec_gap if sec_of[i] != sec_of[i - 1] else book_gap)
        starts.append(a)
        a += widths[i]
    mids = [starts[i] + widths[i] / 2 for i in range(N)]
    pt = lambda ang, r: (cx + r * math.cos(ang), cy + r * math.sin(ang))

    parts = [f'<circle cx="{cx}" cy="{cy}" r="{R + 14}" fill="{T["sunken"]}"/>',
             f'<circle cx="{cx}" cy="{cy}" r="{R + 14}" fill="none" stroke="{T["line"]}" stroke-width="1"/>']
    pairs = sorted(((W[i][j], i, j) for i in range(N) for j in range(i + 1, N) if W[i][j] > 0), reverse=True)[:n_links]
    maxw = pairs[0][0]
    rin = R - ring - 3
    for w, i, j in reversed(pairs):
        src = i if tot[i] >= tot[j] else j  # colour by the busier book's section
        t = w / maxw
        op = 0.12 + 0.72 * t ** 0.55
        sw = 0.8 + 5.6 * t ** 0.8
        x1, y1 = pt(mids[i], rin)
        x2, y2 = pt(mids[j], rin)
        # control point pulled toward centre; adjacent books bow less
        d = abs(mids[i] - mids[j]) % (2 * math.pi)
        d = min(d, 2 * math.pi - d)
        k = 0.15 + 0.85 * (1 - d / math.pi) ** 2
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        qx, qy = cx + (mx - cx) * k * 0.6, cy + (my - cy) * k * 0.6
        parts.append(f'<path d="M{x1:.1f},{y1:.1f} Q{qx:.1f},{qy:.1f} {x2:.1f},{y2:.1f}" stroke="{col_of(src)}" '
                     f'stroke-opacity="{op:.2f}" stroke-width="{sw:.2f}" fill="none" stroke-linecap="round"/>')
    for i in range(N):
        a0, a1 = starts[i], starts[i] + widths[i]
        x0o, y0o = pt(a0, R); x1o, y1o = pt(a1, R)
        x0i, y0i = pt(a0, R - ring); x1i, y1i = pt(a1, R - ring)
        parts.append(f'<path d="M{x0o:.1f},{y0o:.1f} A{R},{R} 0 0 1 {x1o:.1f},{y1o:.1f} L{x1i:.1f},{y1i:.1f} '
                     f'A{R-ring},{R-ring} 0 0 0 {x0i:.1f},{y0i:.1f}Z" fill="{col_of(i)}"/>')
    return "\n".join(parts)


F = f"{nm}/@fontsource-variable"
FONTS = f"""
@font-face{{font-family:'Literata Variable';font-weight:200 900;src:url('file://{F}/literata/files/literata-latin-wght-normal.woff2') format('woff2')}}
@font-face{{font-family:'Instrument Sans Variable';font-weight:400 700;src:url('file://{F}/instrument-sans/files/instrument-sans-latin-wght-normal.woff2') format('woff2')}}
@font-face{{font-family:'JetBrains Mono Variable';font-weight:100 800;src:url('file://{F}/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2') format('woff2')}}
"""
BASE_CSS = FONTS + f"""
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{background:{T['bg']}}}
body{{font-family:'Instrument Sans Variable',sans-serif;color:{T['ink']};-webkit-font-smoothing:antialiased}}
.card{{position:relative;overflow:hidden;background:{T['bg']}}}
.serif{{font-family:'Literata Variable',serif}}
.name{{font-family:'Literata Variable',serif;font-weight:600;letter-spacing:-.018em;line-height:1;color:{T['ink']}}}
.tag{{font-family:'Literata Variable',serif;font-weight:500;line-height:1.15;color:{T['ink']};letter-spacing:-.01em}}
.sub{{color:{T['ink2']};font-weight:500}}
.eyebrow{{font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:{T['ink3']}}}
.eyebrow::before{{content:'';display:inline-block;width:.55em;height:.55em;background:{T['rubric']};transform:rotate(45deg);margin-right:.6em;vertical-align:.12em}}
.legend{{display:grid;color:{T['ink2']};font-weight:500}}
.legend span{{white-space:nowrap}}
.legend i{{display:inline-block;border-radius:3px;margin-right:9px;vertical-align:-1px}}
.url{{font-family:'JetBrains Mono Variable',monospace;color:{T['accent']};font-weight:500}}
.ic svg{{display:block;width:100%;height:100%}}
"""


def legend_html(short=False):
    return "".join(f'<span><i style="background:{c}"></i>{lab.split(" &")[0] if short else lab}</span>' for _, lab, c, _, _ in SECTIONS)


def wide():
    chord = chord_svg(918, 315, 250, 400)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{BASE_CSS}
.card{{width:1200px;height:630px}}
svg.chord{{position:absolute;left:0;top:0}}
.rule{{position:absolute;left:60px;top:64px;bottom:64px;width:2px;background:{T['line_strong']}}}
.notch{{position:absolute;left:58px;top:92px;width:6px;height:96px;background:{T['rubric']};border-radius:0 3px 3px 0}}
.left{{position:absolute;left:92px;top:64px;bottom:64px;width:540px;display:flex;flex-direction:column}}
.brand{{display:flex;align-items:center;gap:22px;margin-top:20px;margin-bottom:34px}}
.brand .ic{{width:100px;height:100px;flex:none}}
.name{{font-size:80px}}
.tag{{font-size:46px;margin-bottom:16px}}
.sub{{font-size:25px}}
.legend{{display:flex;flex-wrap:wrap;font-size:19px;gap:12px 24px;width:500px;margin-top:auto;margin-bottom:24px}}
.legend i{{width:15px;height:15px}}
.url{{font-size:22px}}
</style></head><body><div class="card">
<svg class="chord" width="1200" height="630" viewBox="0 0 1200 630">{chord}</svg>
<div class="rule"></div><div class="notch"></div>
<div class="left">
 <div class="brand"><div class="ic">{icon_svg}</div><div class="name">BibliaMap</div></div>
 <div class="tag">Explore the Bible’s<br>cross-references</div>
 <div class="sub">Esplora i riferimenti incrociati della Bibbia</div>
 <div class="legend">{legend_html()}</div>
 <div class="url">bibliamap.gabudev.cloud</div>
</div></div></body></html>"""


def square():
    chord = chord_svg(300, 196, 160, 280, ring=11)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{BASE_CSS}
.card{{width:600px;height:600px}}
svg.chord{{position:absolute;left:0;top:0}}
.ic{{position:absolute;left:260px;top:156px;width:80px;height:80px;border-radius:18px;box-shadow:0 0 0 6px {T['sunken']}}}
.notch{{position:absolute;left:280px;top:386px;width:40px;height:4px;background:{T['rubric']};border-radius:2px}}
.bottom{{position:absolute;left:0;right:0;top:402px;text-align:center}}
.name{{font-size:58px;margin-bottom:8px}}
.tag{{font-size:25px}}
.legend{{display:flex;justify-content:center;flex-wrap:wrap;font-size:14px;gap:6px 14px;position:absolute;left:24px;right:24px;top:514px}}
.legend i{{width:11px;height:11px;margin-right:6px;vertical-align:0}}
.url{{position:absolute;left:0;right:0;bottom:22px;text-align:center;font-size:17px}}
</style></head><body><div class="card">
<svg class="chord" width="600" height="600" viewBox="0 0 600 600">{chord}</svg>
<div class="ic">{icon_svg}</div>
<div class="notch"></div>
<div class="bottom"><div class="name">BibliaMap</div><div class="tag">Explore the Bible’s cross-references</div></div>
<div class="legend">{legend_html(True)}</div>
<div class="url">bibliamap.gabudev.cloud</div>
</div></body></html>"""


open(f"{out_dir}/wide.html", "w").write(wide())
open(f"{out_dir}/square.html", "w").write(square())
print("pairs", sum(1 for i in range(N) for j in range(i + 1, N) if W[i][j] > 0), "refs", grand // 2)
