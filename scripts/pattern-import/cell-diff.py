#!/usr/bin/env python3
# Cell outcome diff between two dxf-shot runs: which (file, piece, size) cells changed outcome
# (closed -> leak, leak -> closed, ...), with up to 4 examples per transition, plus closed totals
# over the files both runs share.
#   python3 scripts/pattern-import/cell-diff.py <base-run-dir> <variant-run-dir>
import json,os,sys,collections
A,B=sys.argv[1:3]
def load(d):
  out={}
  for f in os.listdir(d):
    p=os.path.join(d,f,'run.json')
    if not os.path.exists(p): continue
    r=json.load(open(p))
    for fam in r.get('families') or []:
      for c in fam['cells']:
        out[(f,fam['label'],c['size'])]=c
  return out
a,b=load(A),load(B)
fa={k[0] for k in a}; fb={k[0] for k in b}
print('files only base:',sorted(fa-fb)[:5],' only var:',sorted(fb-fa)[:5])
ch=collections.Counter(); ex=collections.defaultdict(list)
for k in set(a)|set(b):
  if k[0] not in fa&fb: continue
  oa=a.get(k,{}).get('outcome','-'); ob=b.get(k,{}).get('outcome','-')
  if oa!=ob: ch[(oa,ob)]+=1; ex[(oa,ob)].append(k)
for t,n in ch.most_common(): print(t,n, ex[t][:4])
print('closed base',sum(1 for k,c in a.items() if c['outcome']=='closed' and k[0] in fb),'var',sum(1 for k,c in b.items() if c['outcome']=='closed' and k[0] in fa))
