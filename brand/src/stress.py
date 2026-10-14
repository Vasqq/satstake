"""Stress test page. Reads the exported files, so it tests what ships."""
import os,re
B=os.path.abspath('..')
def inl(name,h=None,w=None,extra=""):
    s=open(os.path.join(B,name)).read().replace('role="img"',f'role="img" {extra}')
    sty=(f'height:{h}px;width:auto' if h else f'width:{w}px;height:auto')
    return s.replace('<svg ',f'<svg style="{sty};display:block" ',1)
def cell(label,body,bg="#f7f8fa",cls=""): return f'<figure class="{cls}"><div class="c" style="background:{bg}">{body}</div><figcaption>{label}</figcaption></figure>'
def tab(fav,dark,label):
    bg="#202124" if dark else "#dee1e6"; act="#35363a" if dark else "#fff"; fg="#e8eaed" if dark else "#202124"
    return (f'<div class="tab" style="background:{bg}"><div class="t" style="background:{act};color:{fg}">{fav}<span>SatStake</span></div></div><p class="cap">{label}</p>')
fav_light=lambda px: f'<img src="favicon.svg" width="{px}" height="{px}" alt="">'
ico=lambda px: f'<img src="icon-512.png" width="{px}" height="{px}" alt="" style="image-rendering:auto">'
# dark favicon: the svg's media query follows the OS, so inline the reversed palette for the mock
fav_dark=lambda px: inl('mark-reversed.svg',px).replace('viewBox="0 0 64 64"','viewBox="%s"'%re.search(r'viewBox="([^"]+)"',open(os.path.join(B,'favicon.svg')).read()).group(1))
tabs=''.join([
 tab(fav_light(16),False,"favicon.svg, light tab, 16px"),
 tab(fav_dark(16),True,"favicon.svg, dark tab, 16px"),
 tab(ico(16),False,"favicon.ico tile, light tab, 16px"),
 tab(ico(16),True,"favicon.ico tile, dark tab, 16px")])
sizes=''.join(f'<div class="sz">{fav_light(s)}<small>{s}</small></div>' for s in (16,32,48))+''.join(f'<div class="sz">{ico(s)}<small>ico {s}</small></div>' for s in (16,32,48))
ctx=''
ctx+=cell("Circular avatar crop",'<img src="avatar-400.png" width="140" height="140" style="border-radius:50%">')
ctx+=cell("iOS rounded-square icon",'<img src="apple-touch-icon.png" width="140" height="140" style="border-radius:22.37%">')
ctx+=cell("Reversed on black",inl('lockup-horizontal-reversed.svg',44)+'<div style="height:16px"></div>'+inl('mark-reversed.svg',64),"#000")
busy='background:radial-gradient(circle at 20% 30%,#e5533c 0 14%,transparent 15%),radial-gradient(circle at 70% 20%,#f2c14e 0 18%,transparent 19%),radial-gradient(circle at 60% 80%,#1f6f8b 0 22%,transparent 23%),repeating-linear-gradient(35deg,#2b2d42 0 9px,#8d99ae 9px 18px,#edf2f4 18px 24px)'
ctx+=cell("Tile on a busy photo stand-in",'<img src="icon-512.png" width="110" height="110">',"#888",'busy').replace('style="background:#888"',f'style="{busy}"')
ctx+=cell("Mono white on the same",inl('mark-mono-white.svg',110),"#888",'busy').replace('style="background:#888"',f'style="{busy}"')
ctx+=cell("Lockup on paper, 40px high",inl('lockup-horizontal.svg',40))
# equal-size neighbours: simplified redraws, for scale only
mc='<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="24" cy="32" r="18" fill="#eb001b"/><circle cx="40" cy="32" r="18" fill="#f79e1b"/><path d="M32 17.2a18 18 0 0 1 0 29.6a18 18 0 0 1 0-29.6z" fill="#ff5f00"/></svg>'
tg='<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#cc0000"/><circle cx="32" cy="32" r="20" fill="#fff"/><circle cx="32" cy="32" r="11" fill="#cc0000"/></svg>'
sp='<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1db954"/><g fill="none" stroke="#000" stroke-linecap="round"><path d="M14 24q18-6 36 3" stroke-width="5"/><path d="M16 34q15-4 30 3" stroke-width="4"/><path d="M18 43q12-3 24 2" stroke-width="3"/></g></svg>'
neigh=''.join(cell(l,s,"#fff") for l,s in (("Two overlapping discs (approx.)",mc),("Concentric rings (approx.)",tg),("Disc and three arcs (approx.)",sp)))
neigh+=cell("SatStake mark, same 64px",inl('mark.svg',64),"#fff")+cell("SatStake tile",f'<img src="icon-512.png" width="64" height="64">',"#fff")
phone=lambda dark: ('<div class="phone" style="background:%s;border-color:%s"><div class="ph" style="border-color:%s">%s<svg width="26" height="18" viewBox="0 0 26 18"><path d="M0 2h26M0 9h26M0 16h26" stroke="%s" stroke-width="2"/></svg></div><div class="body" style="color:%s">Put money behind your promise.</div></div>'
  % (("#0c0f15","#252c3a","#252c3a",inl('lockup-horizontal-reversed.svg',28),"#e3e9f5","#8590a6") if dark else ("#f7f8fa","#dde1e6","#dde1e6",inl('lockup-horizontal.svg',28),"#14213d","#616b80")))
html=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SatStake stress test</title><style>
body{{margin:0;padding:32px;background:#171717;color:#f0eee8;font:15px/1.5 system-ui,sans-serif;max-width:1200px}}
h1{{margin:0 0 6px;letter-spacing:-.03em}} h2{{margin:40px 0 12px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#8f8c86}}
.row{{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}}
figure{{margin:0}} .c{{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;border-radius:10px;min-width:150px;min-height:110px}}
figcaption,.cap{{font-size:12px;color:#8f8c86;margin:6px 0 0;max-width:230px}}
.tab{{width:260px;padding:8px 8px 0;border-radius:10px 10px 0 0}} .t{{display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:8px 8px 0 0;font:12px system-ui}}
.sizes{{display:flex;gap:28px;background:#fff;padding:24px;border-radius:10px;align-items:flex-end}} .sz{{text-align:center}} .sz small{{display:block;color:#666;font-size:11px;margin-top:4px}}
.phone{{width:360px;border:1px solid;border-radius:6px;overflow:hidden}} .ph{{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid}} .body{{padding:28px 16px;font:italic 26px Georgia,serif}}
</style></head><body><h1>Stress test</h1><p style="color:#8f8c86;max-width:70ch">Every context renders the exported files, not the sources. Neighbouring logos are simplified geometric redraws for scale only, not the real marks.</p>
<h2>Favicon sizes and browser tabs</h2><div class="sizes">{sizes}</div><div class="row" style="margin-top:12px">{tabs}</div>
<h2>Contexts</h2><div class="row">{ctx}</div>
<h2>Next to well-known marks at equal size</h2><div class="row">{neigh}</div>
<h2>360px phone header</h2><div class="row">{phone(False)}{phone(True)}</div></body></html>'''
open(os.path.join(B,'stress.html'),'w').write(html)
