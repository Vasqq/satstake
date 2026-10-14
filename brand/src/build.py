"""Builds the whole export kit into brand/. Run from brand/src: python3 build.py"""
import os, struct, subprocess, sys, json
sys.path.insert(0,'.')
import brandgeo as G, italic
from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
R=G.R; n=G.n
OUT=os.path.abspath('..')
INK,SAT,PAPER,INK_D,SAT_D,GROUND_D=G.INK,G.SAT,G.PAPER,G.INK_D,G.SAT_D,G.GROUND_D
SUB="#616b80"
INKW=R.sx1-R.sx0

# ---- lockup geometry, all from the mark's own numbers ----
H_CAP=35.0                 # wordmark S height: 0.75 of the mark's S, so the name is read first and the mark is the signature
H_GAP=15.0                 # mark to wordmark: 2.5 rule thicknesses
S_CAP=26.0                 # stacked: wordmark S height
S_SCALE=1.0                # stacked: the mark at its own size, its S ink about 0.3 of the wordmark width
S_GAP=2*R.RULE_T*S_SCALE   # stacked: rule to wordmark, two rule thicknesses

def svg(vb,body,title="SatStake"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img"><title>{title}</title>{body}</svg>\n')
def vbox(x0,y0,x1,y1): return f'{n(x0)} {n(y0)} {n(x1-x0)} {n(y1-y0)}'
def write(name,txt): open(os.path.join(OUT,name),'w').write(txt)

def mark_body(ink,sat,t=None):
    S,rule=G.mark_paths(t or Transform())
    return f'<path fill="{sat}" d="{rule}"/><path fill="{ink}" d="{S}"/>'
def mark_mono(c):
    # two paths, not one: S and rule overlap by 0.3 and may wind in opposite directions, which would punch a hole
    S,rule=G.mark_paths(Transform()); return f'<path fill="{c}" d="{rule}"/><path fill="{c}" d="{S}"/>'

def word_body(ink,sat,cap,ox,base):
    w,b=G.word(cap,0,base); w,b=G.word(cap,ox-b[0],base); d=dict(w)
    return f'<path fill="{ink}" d="{d["Sat"]}"/><path fill="{sat}" d="{d["Stake"]}"/>',b

def horizontal(ink,sat):
    t=Transform().translate(-R.sx0,0)
    mb=mark_body(ink,sat,t)
    wb,b=word_body(ink,sat,H_CAP,INKW+H_GAP,R.s_base)
    top=min(R.TOP,b[1]); bot=R.ry1
    return svg(vbox(0,top,b[2],bot),mb+wb),(b[2],bot-top)

def stacked(ink,sat):
    s=S_SCALE
    # word first, to learn its width, then centre the mark over it
    base0=0
    w,b=G.word(S_CAP,0,base0); ww=b[2]-b[0]
    mark_w=INKW*s; mark_h_top=R.TOP*s; mark_bot=R.ry1*s
    word_top=mark_bot+S_GAP; base=word_top+(base0-b[1])
    wb,b=word_body(ink,sat,S_CAP,0,base)
    cx=ww/2
    t=Transform().translate(cx-((R.sx0+R.sx1)/2)*s,0).scale(s,s)
    mb=mark_body(ink,sat,t)
    return svg(vbox(0,mark_h_top,ww+0,b[3]),mb+wb),(ww,b[3]-mark_h_top)

def tile(size,bg_rx,s,ink_s=PAPER,sat=SAT,bg=INK):
    """Tile with the mark centred on its ink box. Full-bleed when bg_rx is 0."""
    cy=(R.TOP+R.ry1)/2
    t=Transform().translate(32,32).scale(s,s).translate(-32,-cy)
    rx=f' rx="{bg_rx}"' if bg_rx else ''
    return f'<rect width="64" height="64"{rx} fill="{bg}"/>'+mark_body(ink_s,sat,t)

def png(svg_text,name,w,h=None,bg=None):
    h=h or w
    p=os.path.join(OUT,name); tmp=p+'.svg'
    open(tmp,'w').write(svg_text)
    cmd=['rsvg-convert','-w',str(w),'-h',str(h)]+(['-b',bg] if bg else [])+[tmp,'-o',p]
    subprocess.run(cmd,check=True); os.remove(tmp)

def ico(frames,name):
    datas=[open(f,'rb').read() for _,f in frames]
    head=struct.pack('<HHH',0,1,len(frames)); off=6+16*len(frames); ent=b''
    for (s,_),d in zip(frames,datas):
        ent+=struct.pack('<BBBBHHII',s if s<256 else 0,s if s<256 else 0,0,0,1,32,len(d),off); off+=len(d)
    open(os.path.join(OUT,name),'wb').write(head+ent+b''.join(datas))

def text_path(font,text,px,x,base,track=0.0):
    """Outlined text in the italic face. px is the em size; returns (d, right edge)."""
    gs,cm=font; k=px/2000; sp=SVGPathPen(None,ntos=n); cx=x
    for ch in text:
        if ch==' ':
            _,_,adv=italic.outline(font,'n'); cx+=0.26*px; continue
        rec,b,adv=italic.outline(font,ch)
        rec.replay(TransformPen(sp,Transform().translate(cx,base).scale(k,-k)))
        cx+=adv*k+track*px
    return sp.getCommands(),cx

def main():
    # --- vectors ---
    write('mark.svg',svg('0 0 64 64',mark_body(INK,SAT)))
    write('mark-reversed.svg',svg('0 0 64 64',mark_body(INK_D,SAT_D)))
    write('mark-mono-black.svg',svg('0 0 64 64',mark_mono('#000')))
    write('mark-mono-white.svg',svg('0 0 64 64',mark_mono('#fff')))
    cap=H_CAP; wb,b=word_body(INK,SAT,cap,0,0)
    write('wordmark.svg',svg(vbox(b[0],b[1],b[2],b[3]),wb))
    wb2,_=word_body(INK_D,SAT_D,cap,0,0)
    write('wordmark-reversed.svg',svg(vbox(b[0],b[1],b[2],b[3]),wb2))
    h,hs=horizontal(INK,SAT); write('lockup-horizontal.svg',h)
    write('lockup-horizontal-reversed.svg',horizontal(INK_D,SAT_D)[0])
    s_,ss=stacked(INK,SAT); write('lockup-stacked.svg',s_)
    write('lockup-stacked-reversed.svg',stacked(INK_D,SAT_D)[0])
    # favicon: tight crop so the S is as large as it can be at 16px; switches with the browser theme
    S,rule=G.mark_paths(Transform())
    side=(R.ry1-R.TOP)+2.0; fvb=f'{n(32-side/2)} {n(R.TOP-1.0)} {n(side)} {n(side)}'
    fav=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{fvb}"><title>SatStake</title>'
         f'<style>.s{{fill:{INK}}}.r{{fill:{SAT}}}@media (prefers-color-scheme:dark){{.s{{fill:{INK_D}}}.r{{fill:{SAT_D}}}}}</style>'
         f'<path class="r" d="{rule}"/><path class="s" d="{S}"/></svg>\n')
    write('favicon.svg',fav)
    # --- rasters ---
    def tile_svg(rx,s,**kw): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{tile(64,rx,s,**kw)}</svg>'
    png(tile_svg(0,0.80),'apple-touch-icon.png',180)
    png(tile_svg(14,0.78),'icon-192.png',192)
    png(tile_svg(14,0.78),'icon-512.png',512)
    png(tile_svg(0,0.70),'icon-maskable-512.png',512)
    png(tile_svg(0,0.78),'avatar-400.png',400)
    png(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{mark_body(INK,SAT)}</svg>','logo-1024.png',1024)
    fr=[]
    for s_px in (16,32,48):
        # small sizes get a larger mark on the tile: the S needs the room
        f=os.path.join(OUT,f'.ico{s_px}.png'); png(tile_svg(14,0.86),os.path.basename(f),s_px); fr.append((s_px,f))
    ico(fr,'favicon.ico')
    for _,f in fr: os.remove(f)
    # --- open graph ---
    sc=3.4; ox,oy=100,150
    hb=horizontal(INK,SAT)[0]
    inner=hb.split('</title>')[1].rsplit('</svg>',1)[0]
    tag=italic.font(400,40)
    d1,_=text_path(tag,'Put money behind your promise.',46,100,470,-0.01)
    og=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="{PAPER}"/>'
        f'<g transform="translate({ox} {oy-R.TOP*sc}) scale({sc})">{inner}</g>'
        f'<path fill="{SUB}" d="{d1}"/><rect x="100" y="520" width="1000" height="1.5" fill="#dde1e8"/>'
        f'</svg>')
    png(og,'og-image-1200x630.png',1200,630)
    write('site.webmanifest',json.dumps({"name":"SatStake","short_name":"SatStake",
        "icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},
                 {"src":"icon-512.png","sizes":"512x512","type":"image/png"},
                 {"src":"icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}],
        "theme_color":PAPER,"background_color":PAPER,"display":"standalone"},indent=2)+'\n')
    print('lockup horizontal',hs,'stacked',ss)

if __name__=='__main__': main()
