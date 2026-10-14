import os,sys
sys.path.insert(0,'.')
import refine as R
B=os.path.abspath('..')
def img(name,h=None,w=None,style=""):
    dim=f'height="{h}"' if h else f'width="{w}"'
    return f'<img src="{name}" {dim} alt="" style="{style}">'
def hexrgb(h): return f'{h.upper()} · rgb({int(h[1:3],16)}, {int(h[3:5],16)}, {int(h[5:7],16)})'
cols=[("Ink","#14213d","S and Sat, on light"),("Orange","#e86a12","rule and Stake, on light"),("Paper","#f7f8fa","light ground"),
      ("Ink, reversed","#e3e9f5","S and Sat, on dark"),("Orange, reversed","#ff9549","rule and Stake, on dark"),("Ground","#0c0f15","dark ground"),
      ("Rule on light tile","#c4560b","only on the reversed tile")]
sw="".join(f'<div class="sw"><i style="background:{c}"></i><b>{n}</b><span>{hexrgb(c)}</span><small>{u}</small></div>' for n,c,u in cols)
def card(label,inner,bg,fg="#14213d"): return f'<figure><div class="c" style="background:{bg}">{inner}</div><figcaption>{label}</figcaption></figure>'
assets=''.join([
 card("mark.svg",img('mark.svg',120),"#f7f8fa"),
 card("mark-reversed.svg",img('mark-reversed.svg',120),"#0c0f15"),
 card("mark-mono-black.svg",img('mark-mono-black.svg',120),"#fff"),
 card("mark-mono-white.svg",img('mark-mono-white.svg',120),"#14213d"),
 card("wordmark.svg",img('wordmark.svg',w=220),"#f7f8fa"),
 card("wordmark-reversed.svg",img('wordmark-reversed.svg',w=220),"#0c0f15"),
 card("lockup-horizontal.svg",img('lockup-horizontal.svg',w=300),"#f7f8fa"),
 card("lockup-horizontal-reversed.svg",img('lockup-horizontal-reversed.svg',w=300),"#0c0f15"),
 card("lockup-stacked.svg",img('lockup-stacked.svg',w=170),"#f7f8fa"),
 card("lockup-stacked-reversed.svg",img('lockup-stacked-reversed.svg',w=170),"#0c0f15"),
 card("favicon.svg (follows the browser theme)",img('favicon.svg',72),"#f7f8fa"),
 card("apple-touch-icon.png 180",img('apple-touch-icon.png',110,style="border-radius:22%"),"#f7f8fa"),
 card("icon-512.png",img('icon-512.png',110),"#f7f8fa"),
 card("icon-maskable-512.png (safe zone)",img('icon-maskable-512.png',110,style="border-radius:50%"),"#f7f8fa"),
 card("avatar-400.png",img('avatar-400.png',110,style="border-radius:50%"),"#f7f8fa"),
 card("logo-1024.png (transparent)",img('logo-1024.png',110),"repeating-conic-gradient(#e5e7eb 0 25%,#fff 0 50%) 0 0/16px 16px"),
])
# clear space: 3 rule thicknesses on every side of the lockup's ink
x=3*R.RULE_T
clear=f'''<div class="cs"><div class="csi" style="padding:{x*1.6}px">{img('lockup-horizontal.svg',w=320)}</div></div>'''
mins=''.join(f'<div class="min">{img(n,w=w,style="display:block")}<small>{lab}</small></div>' for n,w,lab in
    (("mark.svg",16,"mark 16px, 5 mm"),("mark.svg",32,"32px"),("lockup-horizontal.svg",96,"lockup 96px, 25 mm"),("lockup-horizontal.svg",160,"160px"),("lockup-stacked.svg",72,"stacked 72px, 20 mm")))
def dd(ok,label,inner,bg="#f7f8fa"):
    return f'<figure class="{"ok" if ok else "no"}"><div class="c" style="background:{bg}">{inner}</div><figcaption><b>{"Do" if ok else "Don\'t"}</b> {label}</figcaption></figure>'
busy='repeating-linear-gradient(35deg,#2b2d42 0 9px,#8d99ae 9px 18px,#edf2f4 18px 24px)'
dont=''.join([
 dd(True,"use the colour mark on paper, or reversed on dark",img('mark.svg',90)),
 dd(True,"put the tile on photographs and busy ground",img('icon-512.png',90),busy),
 dd(True,"keep the S, rule and wordmark as drawn",img('lockup-horizontal.svg',w=200)),
 dd(False,"stretch or squash it",img('mark.svg',90,style="transform:scaleX(1.5)"),"#f7f8fa"),
 dd(False,"swap the colours: orange S on an ink rule",img('mark.svg',90,style="filter:hue-rotate(180deg)"),"#f7f8fa"),
 dd(False,"set the white mono mark on a busy photograph",img('mark-mono-white.svg',90),busy),
 dd(False,"redraw the lockup in another typeface",'<span style="font:700 30px Arial,sans-serif;color:#14213d">SatStake</span>'),
 dd(False,"add shadows, outlines or a gradient",img('mark.svg',90,style="filter:drop-shadow(4px 6px 3px rgba(0,0,0,.45))"),"#f7f8fa"),
])
html=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SatStake brand sheet</title><style>
:root{{--ink:#14213d;--sat:#e86a12;--paper:#f7f8fa;--sub:#616b80;--rule:#dde1e8}}
@media (prefers-color-scheme:dark){{:root{{--ink:#e3e9f5;--sat:#ff9549;--paper:#0c0f15;--sub:#8590a6;--rule:#252c3a}}}}
body{{margin:0;padding:40px 24px 80px;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,sans-serif}}
main{{max-width:1080px;margin:0 auto}} h1{{font-weight:600;letter-spacing:-.02em;margin:0 0 4px}} h2{{margin:48px 0 14px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--sub)}}
p{{max-width:68ch;color:var(--sub)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}}
figure{{margin:0}} .c{{display:flex;align-items:center;justify-content:center;min-height:170px;border-radius:10px;border:1px solid var(--rule);padding:20px;box-sizing:border-box}}
figcaption{{font-size:12px;color:var(--sub);margin-top:6px}}
.sw{{display:grid;gap:2px;font-size:13px}} .sw i{{height:56px;border-radius:8px;border:1px solid var(--rule)}} .sw span{{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--sub)}} .sw small{{color:var(--sub)}}
.cs{{display:inline-block;background:repeating-linear-gradient(45deg,transparent 0 6px,rgba(232,106,18,.12) 6px 7px);border:1px dashed var(--sat);border-radius:6px}} .csi{{background:#f7f8fa;margin:0}} .csi img{{display:block;outline:1px solid #dde1e8}}
.mins{{display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap;background:#f7f8fa;padding:24px;border-radius:10px;border:1px solid var(--rule)}} .min small{{display:block;margin-top:6px;color:#616b80;font-size:11px}}
.ok .c{{outline:2px solid #17784c33}} .no .c{{outline:2px solid #c23a2633}} .ok b{{color:#17784c}} .no b{{color:#c23a26}}
</style></head><body><main>
<h1>SatStake brand sheet</h1>
<p>An italic S standing on the signature rule, set beside the wordmark the site already uses. One colour pair, light and dark.</p>
<h2>Colour</h2><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">{sw}</div>
<p>Contrast: S on paper 15.0:1, on dark 15.8:1. The orange rule on paper is 3.0:1, enough for a graphic but not for small text, so Stake in the wordmark is never set below 24px on paper. On dark, orange is 8.8:1.</p>
<h2>Assets</h2><div class="grid">{assets}</div>
<h2>Clear space</h2><p>Keep three rule thicknesses (the height of the orange rule, times three) clear on every side. The dashed box shows it on the horizontal lockup.</p>{clear}
<h2>Minimum sizes</h2><div class="mins">{mins}</div>
<p>Below 16px use the tile icon, not the bare mark. Below 96px wide, use the mark alone.</p>
<h2>Do and don't</h2><div class="grid">{dont}</div>
</main></body></html>'''
open(os.path.join(B,'brand-sheet.html'),'w').write(html)
