import sys; sys.path.insert(0,'.')
import refine as r

def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[v/12.92 if v<=.03928 else ((v+.055)/1.055)**2.4 for v in c]
    return .2126*c[0]+.7152*c[1]+.0722*c[2]
def cr(a,b):
    la,lb=sorted((lum(a),lum(b)),reverse=True); return (la+.05)/(lb+.05)

# name, description, light S, light rule, light ground, dark S, dark rule, dark ground
PAL=[("A. Signed","S in ink, rule in orange, as the wordmark","#14213d","#e86a12","#f7f8fa","#e3e9f5","#ff9549","#0c0f15"),
     ("B. Orange-led","S in orange, rule in ink","#e86a12","#14213d","#f7f8fa","#ff9549","#e3e9f5","#0c0f15"),
     ("C. Tile","Paper S and orange rule on an ink tile","#f7f8fa","#e86a12","#14213d","#14213d","#c4560b","#e3e9f5")]

def tile(c1,c2,bg,size):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="{bg}"/>'
            f'<g transform="translate(32 32) scale(.78) translate(-32 -32)">{r.mark(c1,c2)}</g></svg>')
def plain(c1,c2,size): return f'<svg width="{size}" height="{size}" viewBox="0 0 64 64">{r.mark(c1,c2)}</svg>'

rows=""
for name,desc,a,b,paper,da,db,dpaper in PAL:
    is_tile=name.startswith("C")
    if is_tile:
        v1=tile(a,b,paper,96); v2=tile(da,db,dpaper,96)
        pairs=[("paper S on ink tile",a,paper),("orange rule on ink tile",b,paper),("ink S on light tile",da,dpaper),("orange rule on light tile",db,dpaper)]
        bgl,bgd="#f7f8fa","#0c0f15"
    else:
        v1=plain(a,b,96); v2=plain(da,db,96)
        pairs=[("S on paper",a,paper),("rule on paper",b,paper),("S on dark",da,dpaper),("rule on dark",db,dpaper)]
        bgl,bgd=paper,dpaper
    cells="".join(f'<tr><td>{n}</td><td>{cr(x,y):.2f}:1</td><td>{"pass" if cr(x,y)>=3 else "fails 3:1"}</td></tr>' for n,x,y in pairs)
    rows+=(f'<article><h3>{name} <span>{desc}</span></h3><div class="pv"><div style="background:{bgl}">{v1}</div><div style="background:{bgd}">{v2}</div></div>'
           f'<table><tr><th>Pair</th><th>Contrast</th><th>3:1 (graphics)</th></tr>{cells}</table></article>')

mats={"protanopia":"0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0",
"deuteranopia":"0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0",
"tritanopia":"1.255528 -0.076749 -0.178779 0 0 -0.078411 0.930809 0.147602 0 0 0.004733 0.691367 0.303900 0 0 0 0 0 1 0",
"grayscale":"0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"}
filt="".join(f'<filter id="f-{k}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="{v}"/></filter>' for k,v in mats.items())
sim="".join(f'<figure><div style="filter:url(#f-{k})">{plain(*r.LIGHT[:2],96)}</div><figcaption>{k}</figcaption></figure>' for k in mats)
sim+="".join(f'<figure><div style="background:{r.DARK[2]};filter:url(#f-{k})">{plain(*r.DARK[:2],96)}</div><figcaption>{k}, dark</figcaption></figure>' for k in ("deuteranopia","grayscale"))

html=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SatStake mark refined</title><style>
:root{{--bg:#171717;--fg:#f0eee8;--dim:#8f8c86;--line:#2b2b2b}}
body{{margin:0;padding:32px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:1180px}}
h1{{margin:0 0 4px;letter-spacing:-.03em}} h2{{margin:44px 0 12px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}} .lead{{color:var(--dim);max-width:68ch}}
h3{{margin:0 0 10px;font-size:16px}} h3 span{{color:var(--dim);font-weight:400}}
.fin{{display:grid;grid-template-columns:480px 1fr;gap:24px;align-items:start}}
.cap{{color:var(--dim);font-size:13px}}
.sizes{{display:flex;gap:18px;align-items:flex-end;padding:20px;border-radius:10px;margin-bottom:12px}}
.pal{{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}}
article{{border:1px solid var(--line);border-radius:14px;padding:16px}}
.pv{{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}} .pv>div{{display:flex;justify-content:center;padding:20px;border-radius:8px}}
table{{width:100%;border-collapse:collapse;font-size:13px}} td,th{{text-align:left;padding:4px 6px;border-top:1px solid var(--line)}}
.sim{{display:flex;flex-wrap:wrap;gap:14px}} figure{{margin:0;text-align:center;font-size:12px;color:var(--dim)}} figure>div{{padding:12px;background:#f7f8fa;border-radius:8px;margin-bottom:4px}}
td:nth-child(3){{color:var(--dim)}}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>{filt}</defs></svg>
<h1>The mark, refined</h1>
<p class="lead">Mark 1, rebuilt on a 64 grid. Left: construction. Right: the final at real sizes.</p>
<h2>Construction and final</h2>
<div class="fin"><div><svg width="480" height="480" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fff"/>{r.mark(*r.LIGHT[:2])}{r.grid()}</svg>
<p class="cap">Blue: 4-unit grid, stronger every 8. Magenta: margin box at 8. Red: S ink edges, S top and baseline, rule top and bottom, centre axis.</p></div>
<div><div class="sizes" style="background:#f7f8fa">{"".join(plain(*r.LIGHT[:2],s) for s in (192,64,32,16))}</div><div class="sizes" style="background:#0c0f15">{"".join(plain(*r.DARK[:2],s) for s in (192,64,32,16))}</div>
<table><tr><th>Decision</th><th>Value and reason</th></tr>
<tr><td>Letter</td><td>Newsreader italic S, weight 700, optical size 24. The wordmark runs at 500; the mark is heavier so the thin strokes survive 16px.</td></tr>
<tr><td>S height</td><td>46.5 of 64, serif tips and overshoots included.</td></tr>
<tr><td>Rule</td><td>6 thick, the S standing on it (0.3 overlap, no gap), spanning the S's ink width exactly. Ends lean 17 degrees, the italic angle, so the rule belongs to the letter. In one colour the pair is a single solid shape, like a stake planted in its line.</td></tr>
<tr><td>Optical lift</td><td>Top margin 6.4, bottom 5.9. The S carries the weight, so the pair sits half a unit low of true centre.</td></tr>
<tr><td>Corners</td><td>All sharp, like the wordmark's serifs and the agreement's rule.</td></tr></table></div></div>
<h2>Three palettes</h2>
<div class="pal">{rows}</div>
<h2>Grayscale and colour-blindness</h2>
<div class="sim">{sim}</div>
<p class="cap">The S carries the mark in every simulation; orange only adds the rule, so nothing depends on telling orange from navy.</p>
</body></html>'''
open('../refine.html','w').write(html)
for n,_,a,b,paper,da,db,dpaper in PAL:
    print(n,"S/paper %.2f rule/paper %.2f S/dark %.2f rule/dark %.2f"%(cr(a,paper),cr(b,paper),cr(da,dpaper),cr(db,dpaper)))
