// Why did a cell's outline change between two runs: the chains under the changed stretch, what they
// are made of, what size they got, and what the same printed marks were in the run before.
import { readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [dirA, dirB, label, size] = process.argv.slice(2);
const shape = (p, st) => { let per = 0, area = 0; const n = p.pts.length; for (let i = 0; i < n; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; if (p.closed || i < n - 1) per += Math.hypot(b.x - a.x, b.y - a.y); if (p.closed) area += a.x * b.y - b.x * a.y; } return `${st.fill ? 'fill' : 'stroke'} per ${per.toFixed(1)} area ${(Math.abs(area) / 2).toFixed(2)}`; };
const load = (dir) => {
  const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
  const f = s.fields;
  const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
  const lab = new Map(s.ranks.map((r) => [r.rank, r.label]));
  const name = new Map(), clsOf = new Map();
  for (const c of f.chains.classes) for (const ch of c.chains) { name.set(ch, c.role === 'size' ? 'size ' + lab.get(rankOfClass.get(c.id)) : c.role); clsOf.set(ch, c); }
  const g = new Grid();
  for (const ch of f.chains.chains) for (let k = 1; k < ch.pts.length; k++) g.add(ch.pts[k - 1], ch.pts[k], ch.id);
  const pathChain = new Map();
  for (const ch of f.chains.chains) for (const r of ch.ranges) if (!pathChain.has(r.path)) pathChain.set(r.path, ch.id);
  const paths = new Map(f.sheet.paths.map((p) => [p.id, p]));
  const legend = new Map();
  for (const c of f.chains.classes) { if (c.role !== 'size') continue; const l = c.evidence.find((e) => e.kind === 'legend-sample'); const lc = l && f.chains.chains[l.chain]; if (!lc) continue; const t = {}; for (const id of new Set(lc.ranges.map((r) => r.path))) { const p = paths.get(id); if (p) { const k = shape(p, f.sheet.styles[p.style]); t[k] = (t[k] ?? 0) + 1; } } legend.set('size ' + lab.get(rankOfClass.get(c.id)), `${Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ×${v}`).join(' + ')} | motif ${JSON.stringify(lc.motif)} ${lc.markPeriod ?? ''}`); }
  return { f, g, name, clsOf, pathChain, paths, legend, cells: JSON.parse(readFileSync(dir + '/cells.json', 'utf8')) };
};
const A = load(dirA), B = load(dirB);
console.log('paths in sheet', A.f.sheet.paths.length, B.f.sheet.paths.length);
const cellOf = (X) => X.cells.find((x) => (x.label ?? '').includes(label)).cells.find((c) => c.size === size);
const a = cellOf(A), b = cellOf(B);
const og = new Grid(); const oa = a.outer.map(([x, y]) => ({ x, y })); for (let k = 0; k < oa.length; k++) og.add(oa[k], oa[(k + 1) % oa.length], 0);
const hit = new Map(); const ob = [...b.outer, b.outer[0]];
for (let k = 1; k < ob.length; k++) { const [ax, ay] = ob[k - 1], [bx, by] = ob[k]; const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay))); for (let q = 0; q < n; q++) { const x = ax + ((bx - ax) * (q + 0.5)) / n, y = ay + ((by - ay) * (q + 0.5)) / n; const d = og.near(x, y, 80); if ((d.size ? d.get(0) : 80) <= 0.25) continue; for (const [id] of B.g.near(x, y, 0.5)) hit.set(id, (hit.get(id) ?? 0) + 1); } }
console.log(`cell ${label} ${size}: ${a.from} → ${b.from}; legend of own ${'size ' + size}: ${B.legend.get('size ' + size)}`);
for (const [id, mm] of [...hit].sort((p, q) => q[1] - p[1]).slice(0, 7)) {
  const ch = B.f.chains.chains[id]; const nm = B.name.get(id) ?? 'unassigned';
  const t = {}, was = {};
  for (const pid of new Set(ch.ranges.map((r) => r.path))) { const p = B.paths.get(pid); if (!p) continue; const k = shape(p, B.f.sheet.styles[p.style]); t[k] = (t[k] ?? 0) + 1; const oc = A.pathChain.get(pid); const w = oc === undefined ? 'NO CHAIN (decoration)' : A.name.get(oc) ?? 'unassigned'; was[w] = (was[w] ?? 0) + 1; }
  const st = B.f.sheet.styles[ch.style];
  console.log(`  ${mm} mm under chain ${id}: now ${nm} | len ${Math.round(ch.lengthMm)} marks ${ch.ranges.length} motif ${JSON.stringify(ch.motif)} ${ch.markPeriod ?? ''} dash ${st.dash ? st.dash.slice(0, 2).map((d) => d.toFixed(1)) : '-'}\n      marks: ${Object.entries(t).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k, v]) => `${k} ×${v}`).join(' + ')}\n      before the change these marks were: ${JSON.stringify(was)}${nm.startsWith('size') ? `\n      legend of ${nm}: ${B.legend.get(nm)}` : ''}`);
}
