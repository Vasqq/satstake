"""Mark 1, refined on a 64 grid. Every number here is a design decision, named."""
import math, sys
sys.path.insert(0,'.')
import italic
WGHT, OPSZ = 700, 24        # heavier than the wordmark so the thin strokes survive 16px
ANGLE = 17                  # Newsreader italic angle, reused for the rule's ends
S_H   = 46.5                # height of the S ink (overshoots included)
RULE_T = 6                  # rule thickness, about the S's heaviest stroke at this size
GAP   = -0.3               # the S stands on its rule: a 0.3 overlap, so no hairline shows between them and the mono mark is one solid shape
TOP   = 6.4                # top margin 6.4, bottom 5.9: the half-unit lift is optical, the S is the heavy part
F=italic.font(WGHT,OPSZ); REC,B,_=italic.outline(F,"S")
x0,y0,x1,y1=B; k=S_H/(y1-y0)
S_ink_w=(x1-x0)*k
CX=32
s_base=TOP+S_H
d,_=italic.place(REC,B,S_H,CX,s_base)
sx0,sx1=CX-S_ink_w/2,CX+S_ink_w/2
ry0=s_base+GAP; ry1=ry0+RULE_T
sk=RULE_T*math.tan(math.radians(ANGLE))
def n(v): return ("%.2f"%v).rstrip("0").rstrip(".")
# rule spans the S's ink width; ends lean with the italic (top edge shifted right)
rule=f"M{n(sx0)} {n(ry1)}L{n(sx0+sk)} {n(ry0)}H{n(sx1)}L{n(sx1-sk)} {n(ry1)}Z"
def mark(ink,sat,extra=""): return f'<path fill="{sat}" d="{rule}"/><path fill="{ink}" d="{d}"/>{extra}'
LIGHT=("#14213d","#e86a12","#f7f8fa"); DARK=("#e3e9f5","#ff9549","#0c0f15")
def grid():
    g=['<g fill="none" stroke-width="0.12">']
    for i in range(0,65,4): g.append(f'<path stroke="#3b82f6" opacity="{0.45 if i%8==0 else 0.18}" d="M{i} 0V64M0 {i}H64"/>')
    g.append(f'<rect x="8" y="8" width="48" height="48" stroke="#d946ef" stroke-width="0.2"/>')  # 8-unit safe margin
    g.append(f'<path stroke="#ef4444" stroke-width="0.2" d="M{n(sx0)} 0V64M{n(sx1)} 0V64M0 {n(s_base)}H64M0 {n(TOP)}H64M0 {n(ry0)}H64M0 {n(ry1)}H64M32 0V64"/>')
    g.append('</g>')
    return "".join(g)
if __name__=="__main__":
    print("S ink",n(sx0),n(sx1),"w",n(S_ink_w),"S y",n(TOP),n(s_base),"rule y",n(ry0),n(ry1),"bottom margin",n(64-ry1))
