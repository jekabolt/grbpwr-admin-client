// Where two runs' closed outlines of the same cell differ, and what line each one lies on there.
import { readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [dirA, dirB, label, sizesArg] = process.argv.slice(2);
const load = (dir) => {
  const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
  const f = s.fields;
  const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
  const lab = new Map(s.ranks.map((r) => [r.rank, r.label]));
  const info = new Map();
  for (const c of f.chains.classes) for (const ch of c.chains) info.set(ch, c.role === 'size' ? 'size ' + lab.get(rankOfClass.get(c.id)) : c.role);
  const g = new Grid();
  for (const ch of f.chains.chains) for (let k = 1; k < ch.pts.length; k++) g.add(ch.pts[k - 1], ch.pts[k], ch.id);
  const motif = new Map(f.chains.chains.map((c) => [c.id, c.motif ? 'row/dash' : 'solid']));
  return { cells: JSON.parse(readFileSync(dir + '/cells.json', 'utf8')), g, info, f, motif };
};
const A = load(dirA), B = load(dirB);
const fam = (X) => X.cells.find((x) => (x.label ?? '').includes(label));
const on = (X, x, y, own) => { const n = [...X.g.near(x, y, 0.5)].sort((a, b) => a[1] - b[1]); const names = [...new Set(n.map(([id]) => X.info.get(id) ?? 'unassigned'))]; return names.includes(own) ? own : names[0] ?? 'nothing'; };
for (const size of sizesArg.split(',')) {
  const a = fam(A).cells.find((c) => c.size === size), b = fam(B).cells.find((c) => c.size === size);
  if (!a?.outer || !b?.outer) { console.log(size, 'no outline'); continue; }
  const og = new Grid(); const oa = a.outer.map(([x, y]) => ({ x, y })); for (let k = 0; k < oa.length; k++) og.add(oa[k], oa[(k + 1) % oa.length], 0);
  const ob = [...b.outer, b.outer[0]];
  let total = 0, off = 0, maxD = 0; const where = {}; const box = [1e9, 1e9, -1e9, -1e9]; const dist = [];
  for (let k = 1; k < ob.length; k++) {
    const [ax, ay] = ob[k - 1], [bx, by] = ob[k]; const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
    for (let q = 0; q < n; q++) {
      const x = ax + ((bx - ax) * (q + 0.5)) / n, y = ay + ((by - ay) * (q + 0.5)) / n; total++;
      const near = og.near(x, y, 60); const d = near.size ? near.get(0) : 60;
      if (d <= 0.25) continue;
      off++; maxD = Math.max(maxD, d); dist.push(d);
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      const k2 = `now on: ${on(B, x, y, 'size ' + size)}`; where[k2] = (where[k2] ?? 0) + 1;
    }
  }
  // and what the OLD outline lay on along its own differing part
  const ng = new Grid(); const nb = b.outer.map(([x, y]) => ({ x, y })); for (let k = 0; k < nb.length; k++) ng.add(nb[k], nb[(k + 1) % nb.length], 0);
  const was = {}; const oa2 = [...a.outer, a.outer[0]];
  for (let k = 1; k < oa2.length; k++) { const [ax, ay] = oa2[k - 1], [bx, by] = oa2[k]; const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay))); for (let q = 0; q < n; q++) { const x = ax + ((bx - ax) * (q + 0.5)) / n, y = ay + ((by - ay) * (q + 0.5)) / n; const near = ng.near(x, y, 60); if ((near.size ? near.get(0) : 60) <= 0.25) continue; const k2 = `was on: ${on(A, x, y, 'size ' + size)}`; was[k2] = (was[k2] ?? 0) + 1; } }
  dist.sort((p, q) => p - q);
  console.log(`size ${size}: perimeter ${total} mm, differs on ${off} mm, median ${dist.length ? dist[dist.length >> 1].toFixed(2) : 0} max ${maxD.toFixed(2)} mm, at x ${Math.round(box[0])}..${Math.round(box[2])} y ${Math.round(box[1])}..${Math.round(box[3])} | ${JSON.stringify(where)} | ${JSON.stringify(was)} | from ${a.from} → ${b.from}`);
}
