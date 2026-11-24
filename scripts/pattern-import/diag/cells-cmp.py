import json,sys,glob
a=json.load(open(glob.glob(sys.argv[1]+'/cells.json')[0])); b=json.load(open(glob.glob(sys.argv[2]+'/cells.json')[0]))
def key(f): return (f['label'] or '').strip()
A={}; B={}
for src,dst in ((a,A),(b,B)):
    for f in src:
        for c in f['cells']: dst[(key(f),c['size'])]=c
def bb(c):
    o=c.get('outer') or []
    if not o: return None
    xs=[p[0] for p in o]; ys=[p[1] for p in o]; return (min(xs),min(ys),max(xs),max(ys),len(o))
opened=[];closed=[];moved=[];same=0
for k in A:
    if k not in B: continue
    x,y=A[k],B[k]
    if x['outcome']=='closed' and y['outcome']!='closed': opened.append(k)
    elif x['outcome']!='closed' and y['outcome']=='closed': closed.append((k,y.get('from')))
    elif x['outcome']=='closed':
        p,q=bb(x),bb(y)
        if p and q and (max(abs(p[i]-q[i]) for i in range(4))>0.3): moved.append((k,round(max(abs(p[i]-q[i]) for i in range(4)),1)))
        else: same+=1
ta=sum(c['outcome']=='closed' for c in A.values()); tb=sum(c['outcome']=='closed' for c in B.values())
print(f'cells {len(A)} -> {len(B)} | closed {ta} -> {tb} | pieces {len(a)} -> {len(b)}')
print('opened',len(opened),opened[:20]); print('closed',len(closed),closed[:30]); print('closed outline bbox moved >0.3mm',len(moved),moved[:20]); print('unchanged closed',same)
print('gone pieces',sorted({k[0] for k in A}-{k[0] for k in B}),'new pieces',sorted({k[0] for k in B}-{k[0] for k in A}))
