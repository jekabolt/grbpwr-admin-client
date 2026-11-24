// R2: on the sizes the owner marked bad, does a prediction from the ok sizes of the same piece land on
// printed lines that the current (bad) outline does not use?
import { readFileSync } from 'node:fs';
import { idx, unflat, predictC, nearestOn, sample, q, ringDistance, type P } from './lib';
const ref = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const exp = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const segGrid = (lines: number[][]) => {
  const G = new Map<string, [P, P][]>();
  for (const l of lines) { const pts = unflat(l); for (let k = 0; k + 1 < pts.length; k++) { const a = pts[k], b = pts[k + 1];
    const x0 = Math.floor(Math.min(a.x, b.x) / 5), x1 = Math.floor(Math.max(a.x, b.x) / 5), y0 = Math.floor(Math.min(a.y, b.y) / 5), y1 = Math.floor(Math.max(a.y, b.y) / 5);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const key = i + ',' + j; (G.get(key) ?? G.set(key, []).get(key)!).push([a, b]); } } }
  return (p: P) => { let best = Infinity; const gx = Math.floor(p.x / 5), gy = Math.floor(p.y / 5);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [a, b] of G.get((gx + i) + ',' + (gy + j)) ?? []) { const c = nearestOn(p, [a, b]); best = Math.min(best, Math.hypot(p.x - c.x, p.y - c.y)); }
    return best; };
};
for (const p of ref) {
  const bad = p.sizes.filter((z: any) => z.verdict === 'bad');
  if (!bad.length) continue;
  const e = exp.find((x: any) => x.id === p.id); if (!e) { console.log(p.id, 'no export'); continue; }
  const dist = segGrid(e.lines);
  const ok = p.sizes.filter((z: any) => z.verdict === 'ok').map((z: any) => ({ s: z.size, i: idx(z.size), r: unflat(z.outer) as P[] }));
  const cover = (pts: P[], tol: number) => pts.filter((x) => dist(x) <= tol).length / pts.length;
  console.log(`${p.id}: ok sizes ${ok.map((o: any) => o.s).join(' ') || '—'}`);
  console.log(`  calibration, ok outlines on printed lines (≤0.3 mm): ${ok.map((o: any) => o.s + ' ' + (100 * cover(sample(o.r), 0.3)).toFixed(0) + '%').join(', ')}`);
  if (ok.length < 2) { console.log('  fewer than two ok sizes: nothing to predict from'); continue; }
  for (const z of bad) {
    const i = idx(z.size), cur = unflat(z.outer) as P[];
    const lo = ok.filter((o: any) => o.i < i), hi = ok.filter((o: any) => o.i > i);
    const [A, B] = lo.length && hi.length ? [lo[lo.length - 1], hi[0]] : lo.length >= 2 ? lo.slice(-2) : hi.slice(0, 2);
    const t = (i - A.i) / (B.i - A.i), pr = predictC(A.r, B.r, t);
    if (!pr) { console.log(`  ${z.size}: corners do not match`); continue; }
    const dCur = pr.map((x) => { const c = nearestOn(x, cur); return Math.hypot(x.x - c.x, x.y - c.y); });
    const dSheet = pr.map(dist);
    const off = dCur.map((d, k) => k).filter((k) => dCur[k] > 2); // where prediction and current outline part
    { const bx = cur.map((c) => c.x), by = cur.map((c) => c.y), X0 = Math.min(...bx), X1 = Math.max(...bx), Y0 = Math.min(...by), Y1 = Math.max(...by);
      const where = off.map((k) => pr[k]).map((x) => `${x.y < Y0 + (Y1 - Y0) / 3 ? 'top' : x.y > Y1 - (Y1 - Y0) / 3 ? 'bottom' : 'mid'}-${x.x < X0 + (X1 - X0) / 3 ? 'left' : x.x > X1 - (X1 - X0) / 3 ? 'right' : 'centre'}`);
      const cnt: Record<string, number> = {}; for (const w of where) cnt[w] = (cnt[w] ?? 0) + 1; console.log(`     where they part (mm): ${JSON.stringify(cnt)}`); }
    const offOnSheet = off.filter((k) => dSheet[k] <= 1).length;
    const sh = (d: number) => (100 * cover(pr.map((x) => ({ x: x.x + d, y: x.y + d })), 0.5)).toFixed(0);
    console.log(`     control ≤0.5 mm: prediction ${sh(0)}% · shifted 1 mm ${sh(0.7)}% · shifted 2 mm ${sh(1.4)}% · shifted 4 mm ${sh(2.8)}% · current outline ${(100 * cover(sample(cur), 0.5)).toFixed(0)}%`);
    console.log(`  ${z.size}: from ${A.s}+${B.s} (t=${t.toFixed(2)}) · prediction on printed lines ≤1 mm ${(100 * cover(pr, 1)).toFixed(0)}% · ≤2 mm ${(100 * cover(pr, 2)).toFixed(0)}% · current outline parts from prediction >2 mm on ${off.length} mm, of those ${offOnSheet} mm the prediction sits on a printed line · current vs prediction max ${q(dCur, 1).toFixed(1)} p50 ${q(dCur, .5).toFixed(1)}`);
  }
}
