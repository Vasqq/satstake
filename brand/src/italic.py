"""Outlines of Newsreader italic (OFL) at the weight and optical size the Signed design uses for its wordmark."""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.misc.transform import Transform
HERE=os.path.dirname(__file__)
def font(wght=640,opsz=28):
    t=TTFont(os.path.join(HERE,"fonts/newsreader-latin-opsz-italic.woff2"))
    t=instantiateVariableFont(t,{"wght":wght,"opsz":opsz}); return t.getGlyphSet(), t.getBestCmap()
def outline(f,ch):
    gs,cm=f; rec=DecomposingRecordingPen(gs); gs[cm[ord(ch)]].draw(rec)
    bp=BoundsPen(gs); rec.replay(bp); return rec,bp.bounds,gs[cm[ord(ch)]].width
def place(rec,bounds,height,cx,base):
    """Scale so the glyph is `height` tall, centre its ink on cx, put its ink bottom at y=base (y down)."""
    x0,y0,x1,y1=bounds; k=height/(y1-y0)
    t=Transform().translate(cx-(x0+x1)/2*k, base+y0*k).scale(k,-k)
    sp=SVGPathPen(None,ntos=lambda v:("%.2f"%v).rstrip("0").rstrip("."))
    rec.replay(TransformPen(sp,t)); return sp.getCommands(), k
