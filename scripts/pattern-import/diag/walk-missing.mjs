// Where a verified outline has no chain of its own size: what are the printed marks there, and
// where did the pipeline put them?  (the step before the graph walk)
//   node walk-missing.mjs <reference.json> <snapshot dir> <piece id> <size,size,…>
import { readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [refPath, dir, id, sizesArg] = process.argv.slice(2);
const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
const f = s.fields, st = f.sheet.styles;
const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
const labOf = new Map(s.ranks.map((r) => [r.rank, r.label]));
const nameOf = new Map(), ownGrid = new Map(), chainOfPath = new Map();
for (const c of f.chains.classes) { const nm = c.role === 'size' ? 'size ' + labOf.get(rankOfClass.get(c.id)) : c.role; const g = c.role === 'size' ? new Grid() : null; if (g) ownGrid.set(labOf.get(rankOfClass.get(c.id)), g); for (const i of c.chains) { nameOf.set(i, nm); const ch = f.chains.chains[i]; if (g && ch) for (let k = 1; k < ch.pts.length; k++) g.add(ch.pts[k - 1], ch.pts[k], 0); } }
for (const ch of f.chains.chains) for (const r of ch.ranges) if (!chainOfPath.has(r.path)) chainOfPath.set(r.path, ch.id);
const feat = (p) => { const S = st[p.style]; let per = 0, area = 0, cx = 0, cy = 0; const n = p.pts.length; for (let i = 0; i < n; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; cx += a.x; cy += a.y; if (p.closed || i < n - 1) per += Math.hypot(b.x - a.x, b.y - a.y); if (p.closed) area += a.x * b.y - b.x * a.y; } return { fill: !!S.fill, closed: !!p.closed, per, area: Math.abs(area) / 2, x: cx / n, y: cy / n }; };
const close = (a, b) => a.fill === b.fill && a.closed === b.closed && Math.abs(a.per - b.per) <= 0.12 * Math.max(a.per, b.per) && Math.abs(a.area - b.area) <= 0.2 * Math.max(a.area, b.area, 0.02);
const paths = new Map(f.sheet.paths.map((p) => [p.id, p]));
const legend = new Map();
for (const c of f.chains.classes) { if (c.role !== 'size') continue; const l = c.evidence.find((e) => e.kind === 'legend-sample'); const lc = l && f.chains.chains[l.chain]; if (!lc) continue; const ms = [...new Set(lc.ranges.map((r) => r.path))].map((i) => paths.get(i)).filter((p) => p && p.pts.length <= 40).map(feat).filter((m) => m.per <= 15); const kinds = []; for (const m of ms) { const k = kinds.find((x) => close(x, m)); if (k) k.n++; else kinds.push({ ...m, n: 1 }); } legend.set(labOf.get(rankOfClass.get(c.id)), { kinds, pitch: ms.length ? lc.lengthMm / ms.length : 2, period: lc.markPeriod, motif: lc.motif }); }
const marks = []; const mg = new Grid();
for (const p of f.sheet.paths) { if (p.background || p.pts.length > 40) continue; const m = feat(p); if (m.per > 15) continue; m.id = p.id; m.op = p.src.op; m.page = p.src.page; marks.push(m); mg.add({ x: m.x, y: m.y }, { x: m.x, y: m.y }, marks.length - 1); }
const raw = JSON.parse(readFileSync(refPath, 'utf8')); const p = (Array.isArray(raw) ? raw : raw.pieces).find((x) => x.id === id);
for (const size of sizesArg.split(',')) {
  const z = p.sizes.find((x) => x.size === size); const L = legend.get(size);
  const pts = []; for (let i = 0; i + 1 < z.outer.length; i += 2) pts.push([z.outer[i], z.outer[i + 1]]); pts.push(pts[0]);
  const hit = new Set(); let n = 0, miss = 0;
  for (let k = 1; k < pts.length; k++) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k]; const m = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay))); for (let q = 0; q < m; q++) { const x = ax + ((bx - ax) * (q + 0.5)) / m, y = ay + ((by - ay) * (q + 0.5)) / m; n++; if (ownGrid.get(size)?.near(x, y, 0.6).size) continue; miss++; for (const [i] of mg.near(x, y, 0.8)) hit.add(i); } }
  const t = {}, ops = [];
  for (const i of hit) { const m = marks[i]; const mine = L.kinds.findIndex((k) => close(k, m)); const ch = chainOfPath.get(m.id); const where = ch === undefined ? 'NO CHAIN' : nameOf.get(ch) ?? 'unassigned'; const key = `${mine >= 0 ? `own shape #${mine + 1}` : 'other shape'} → ${where}`; t[key] = (t[key] ?? 0) + 1; if (mine >= 0) ops.push(`${m.page}:${m.op}`); }
  console.log(`== ${id} size ${size}: legend ${L.kinds.map((k, i) => `#${i + 1} ${k.fill ? 'fill' : 'stroke'} per ${k.per.toFixed(1)} area ${k.area.toFixed(2)} ×${k.n}`).join(', ')} · step ${L.pitch.toFixed(2)} · order ${L.period ?? '-'}\n   verified outline ${n} mm, no own chain on ${miss} mm; marks on that stretch (within 0.8 mm):`);
  for (const [k, v] of Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log('     ', String(v).padStart(5), k);
  const byPage = {}; for (const o of ops) { const [pg, op] = o.split(':').map(Number); (byPage[pg] ??= []).push(op); }
  for (const [pg, list] of Object.entries(byPage).slice(0, 2)) { list.sort((a, b) => a - b); const d = list.slice(1).map((v, i) => v - list[i]); const c = {}; for (const x of d) c[x] = (c[x] ?? 0) + 1; console.log(`      own-shape marks on page ${pg}: ${list.length}, paint-operation steps between them: ${Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}×${v}`).join(' ')}`); }
}
