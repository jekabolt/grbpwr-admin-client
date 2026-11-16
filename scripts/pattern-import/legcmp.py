#!/usr/bin/env python3
# legend-id score diff between two runs' stdout dumps: for every legend group, the best and the
# second-best candidate in each run; "<<" marks a group whose confident pick (>= .86, margin >= .04)
# appears, disappears or changes. Input lines: "legend-id <group> <L>m: <cand>:c<n>=<score> ...",
# optionally prefixed "<file>\t" (e.g. grep -H over SHOT_STDOUT=1 stdout.txt files, tab-joined).
#   python3 scripts/pattern-import/legcmp.py <base-lines.txt> <variant-lines.txt>
import sys,re
def load(p):
  out={}
  for l in open(p):
    l=l.rstrip('\n')
    if '\t' in l: f,l=l.split('\t',1)
    else: f=''
    if not l.startswith('legend-id '): continue
    m=re.match(r'legend-id (.*?) ([\d.]+)m: (.*)',l)
    g,L,rest=m.groups()
    sc=sorted(((float(v),k) for k,v in re.findall(r'(\S+?):c\d+=([\d.]+)',rest)),reverse=True)
    out[(f,g)]=(float(L),sc[0],sc[1])
  return out
a,b=load(sys.argv[1]),load(sys.argv[2])
for k in sorted(set(a)|set(b)):
  x=a.get(k);y=b.get(k)
  fmt=lambda t:'%s %.2f (2nd %s %.2f)'%(t[1][1],t[1][0],t[2][1],t[2][0]) if t else '-'
  L=(x or y)[0]
  mark=''
  if x and y:
    ox=x[1][0]>=.86 and x[1][0]-x[2][0]>=.04; oy=y[1][0]>=.86 and y[1][0]-y[2][0]>=.04
    if ox!=oy or (ox and x[1][1]!=y[1][1]): mark='  <<'
  print('%-30s %-48s %5.1fm  %-30s -> %-30s%s'%(k[0][:30],k[1][:48],L,fmt(x),fmt(y),mark))
