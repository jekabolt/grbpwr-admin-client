// R1: is grading regular enough that known sizes predict the others?
import { readFileSync } from 'node:fs';
import { ORDER, idx, unflat, ringDistance, predictC, cloudToRingFast, corners, q, type P } from './lib';
const ref = JSON.parse(readFileSync(process.argv[2], 'utf8'));
type Row = { id: string; size: string; kind: string; err: number; half: number; p95?: number };
const rows: Row[] = [];
for (const p of ref) {
  const ok = p.sizes.filter((z: any) => z.verdict === 'ok').map((z: any) => ({ s: z.size, i: idx(z.size), r: unflat(z.outer) as P[] }));
  if (ok.length < 3) continue;
  // half-gap to the nearest neighbour drawn (any verdict): how precise a prediction must be
  const all = p.sizes.map((z: any) => ({ i: idx(z.size), r: unflat(z.outer) as P[] }));
  const half = (k: number) => { const t = ok[k]; const nb = all.filter((a: any) => a.i !== t.i).sort((a: any, b: any) => Math.abs(a.i - t.i) - Math.abs(b.i - t.i))[0]; return 0.5 * ringDistance(t.r, nb.r).max; };
  const line: string[] = [];
  for (let k = 0; k < ok.length; k++) {
    const t = ok[k], h = half(k);
    const add = (kind: string, A: any, B: any) => {
      const tt = (t.i - A.i) / (B.i - A.i);
      const pr = predictC(A.r, B.r, tt); if (!pr) { rows.push({ id: p.id, size: t.s, kind: kind + "-nocorner", err: NaN, half: h }); return NaN; } const dd = cloudToRingFast(pr, t.r); const e = dd.max; rows.push({ id: p.id, size: t.s, kind, err: e, half: h, p95: dd.p95 }); return e;
    };
    const parts: string[] = [];
    if (k > 0 && k < ok.length - 1) parts.push('i' + add('interp', ok[k - 1], ok[k + 1]).toFixed(1));
    if (k >= 2) parts.push('x' + add('extrap', ok[k - 2], ok[k - 1]).toFixed(1));
    // far: two anchors at the ends of the range, all sizes between
    if (k > 0 && k < ok.length - 1) parts.push('f' + add('far', ok[0], ok[ok.length - 1]).toFixed(1));
    line.push(`${t.s}:${parts.join(',')}/h${h.toFixed(1)}`);
  }
  console.log(p.id.padEnd(11), line.join(' '));
}
console.log('corners per size:', ref.map((p:any)=>p.id+'='+p.sizes.map((z:any)=>corners(unflat(z.outer)).c.length).join(',')).join(' '));
for (const kind of ['interp', 'extrap', 'far']) {
  console.log(kind, 'no corner match', rows.filter((x) => x.kind === kind + '-nocorner').length);
  const r = rows.filter((x) => x.kind === kind);
  const fail = r.filter((x) => x.err > x.half);
  console.log(`${kind.padEnd(7)} n=${r.length} err median ${q(r.map((x) => x.err), .5).toFixed(2)} p90 ${q(r.map((x) => x.err), .9).toFixed(2)} max ${q(r.map((x) => x.err), 1).toFixed(2)} mm · closer to a neighbour than to itself: ${fail.length} (${fail.slice(0, 12).map((x) => x.id + ':' + x.size).join(' ')})`);
}

console.log('per piece, interp: within half-gap by max / by p95');
for (const id of [...new Set(rows.map((r) => r.id))]) {
  const r = rows.filter((x) => x.id === id && x.kind === 'interp');
  console.log(' ', id.padEnd(11), `${r.filter((x) => x.err <= x.half).length}/${r.length}`, `${r.filter((x) => (x.p95 ?? 99) <= x.half).length}/${r.length}`, 'p95 median', q(r.map((x) => x.p95 ?? NaN), .5).toFixed(2));
}
