// For every cell of two runs: share of the closed outline that lies on the cell's OWN size line (≤ 0.5 mm).
import { readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [dirA, dirB] = process.argv.slice(2);
const load = (dir) => {
  const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
  const f = s.fields;
  const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
  const lab = new Map(s.ranks.map((r) => [r.rank, r.label]));
  const grids = new Map(); let sizeLen = 0;
  for (const c of f.chains.classes) { if (c.role !== 'size') continue; const l = lab.get(rankOfClass.get(c.id)); const g = grids.get(l) ?? grids.set(l, new Grid()).get(l); for (const id of c.chains) { const ch = f.chains.chains[id]; if (!ch) continue; sizeLen += ch.lengthMm; for (let k = 1; k < ch.pts.length; k++) g.add(ch.pts[k - 1], ch.pts[k], 0); } }
  const out = new Map();
  for (const fam of JSON.parse(readFileSync(dir + '/cells.json', 'utf8'))) for (const c of fam.cells) {
    const key = (fam.label ?? '').trim() + '|' + c.size;
    if (c.outcome !== 'closed' || !c.outer) { out.set(key, null); continue; }
    const g = grids.get(c.size); const o = [...c.outer, c.outer[0]]; let t = 0, own = 0;
    for (let k = 1; k < o.length; k++) { const [ax, ay] = o[k - 1], [bx, by] = o[k]; const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay))); for (let q = 0; q < n; q++) { t++; if (g?.near(ax + ((bx - ax) * (q + 0.5)) / n, ay + ((by - ay) * (q + 0.5)) / n, 0.5).size) own++; } }
    out.set(key, own / t);
  }
  return { out, sizeLen };
};
const A = load(dirA), B = load(dirB);
let n = 0, sa = 0, sb = 0, up = 0, down = 0, big = [];
for (const [k, a] of A.out) { const b = B.out.get(k); if (a == null || b == null) continue; n++; sa += a; sb += b; if (b - a >= 0.05) up++; if (a - b >= 0.05) down++; if (Math.abs(b - a) >= 0.15) big.push(`${k} ${(100 * a).toFixed(0)}→${(100 * b).toFixed(0)}%`); }
const newly = [...B.out].filter(([k, b]) => b != null && A.out.get(k) == null).map(([k, b]) => `${k} ${(100 * b).toFixed(0)}%`);
const lost = [...A.out].filter(([k, a]) => a != null && B.out.get(k) == null).map(([k, a]) => `${k} was ${(100 * a).toFixed(0)}%`);
console.log(`size-line length in data: ${(A.sizeLen / 1000).toFixed(0)} m → ${(B.sizeLen / 1000).toFixed(0)} m`);
console.log(`cells closed in both: ${n} | mean share on own line ${(100 * sa / n).toFixed(1)}% → ${(100 * sb / n).toFixed(1)}% | improved ≥5 pp: ${up} | worsened ≥5 pp: ${down}`);
console.log('changed ≥15 pp:', big.join(' ; '));
console.log('newly closed (own share):', newly.join(' ; '));
console.log('opened:', lost.join(' ; '));
