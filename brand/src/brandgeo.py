"""Geometry of the SatStake identity. Everything is derived from the mark's own numbers in refine.py."""
import sys
sys.path.insert(0,'.')
import italic, refine as R
from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

INK,SAT,PAPER="#14213d","#e86a12","#f7f8fa"
INK_D,SAT_D,GROUND_D="#e3e9f5","#ff9549","#0c0f15"
WF=italic.font(500,26)            # the wordmark's weight and optical size on the site (26px)
TRACK=-0.02                       # em, as the site's letter-spacing
def n(v): return ("%.2f"%v).rstrip("0").rstrip(".")

def word(cap, ox, base, parts=("Sat","Stake"), kern=None):
    """Outlined wordmark. cap = height of the S in mark units. Returns [(part, d)], ink bounds (x0,y0,x1,y1)."""
    kern=kern or {}
    rec,b,_=italic.outline(WF,"S"); k=cap/(b[3]-b[1]); x=0.0
    out=[]; bx0=by0=1e9; bx1=by1=-1e9
    for part in parts:
        sp=SVGPathPen(None,ntos=n)
        for i,ch in enumerate(part):
            rec,b,adv=italic.outline(WF,ch)
            t=Transform().translate(ox+x,base).scale(k,-k)
            rec.replay(TransformPen(sp,t))
            bp=BoundsPen(None); rec.replay(TransformPen(bp,t))
            a,c,d_,e=bp.bounds; bx0=min(bx0,a);by0=min(by0,c);bx1=max(bx1,d_);by1=max(by1,e)
            x+=adv*k+TRACK*2000*k+kern.get(part[i:i+2],0)*k
        out.append((part,sp.getCommands()))
    return out,(bx0,by0,bx1,by1)

def mark_at(dx,dy,s=1.0):
    """The mark's two paths, moved by (dx,dy) after scaling by s about the origin."""
    t=Transform().translate(dx,dy).scale(s,s)
    return t
def mark_paths(t):
    from fontTools.svgLib.path import parse_path
    out=[]
    for d in (R.d,R.rule):
        sp=SVGPathPen(None,ntos=n); parse_path(d,TransformPen(sp,t)); out.append(sp.getCommands())
    return out   # [S, rule]
