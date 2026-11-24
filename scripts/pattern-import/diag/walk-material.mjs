// Question 1 of the graph-walk experiment: is there material to assemble a size's outline from the
// RAW sheet paths (before chains)? Per reference size: the share of the verified outline that has
//   pipeline  — a chain of the size's own class within 0.6 mm (what the fill gets today)
//   raw own   — a raw path in the size's own pen (declared dash) or a raw mark of a shape that only
//               this size's legend sample has, within reach
//   raw any   — the same, counting shapes the size shares with other sizes too
//   node walk-material.mjs <reference.json> <snapshot dir> <piece id> [<piece id> …]
import { readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [refPath, dir, ...ids] = process.argv.slice(2);
const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
const f = s.fields, st = f.sheet.styles;
const paths = new Map(f.sheet.paths.map((p) => [p.id, p]));
const feat = (p) => { const S = st[p.style]; let per = 0, area = 0, cx = 0, cy = 0; const n = p.pts.length; for (let i = 0; i < n; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; cx += a.x; cy += a.y; if (p.closed || i < n - 1) per += Math.hypot(b.x - a.x, b.y - a.y); if (p.closed) area += a.x * b.y - b.x * a.y; } return { fill: !!S.fill, closed: !!p.closed, per, area: Math.abs(area) / 2, x: cx / n, y: cy / n, dash: S.dash, w: S.widthMm, rgb: String(S.strokeRgb) }; };
const close = (a, b) => a.fill === b.fill && a.closed === b.closed && Math.abs(a.per - b.per) <= 0.12 * Math.max(a.per, b.per) && Math.abs(a.area - b.area) <= 0.2 * Math.max(a.area, b.area, 0.02);
const sameDash = (a, b) => a && b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= Math.max(0.12 * b[i], 0.06));
const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
const labOf = new Map(s.ranks.map((r) => [r.rank, r.label]));
// legend per size
const L = new Map();
const ownGrid = new Map();
for (const c of f.chains.classes) {
  if (c.role !== 'size') continue;
  const lab = labOf.get(rankOfClass.get(c.id));
  const g = new Grid(); for (const id of c.chains) { const ch = f.chains.chains[id]; if (ch) for (let k = 1; k < ch.pts.length; k++) g.add(ch.pts[k - 1], ch.pts[k], 0); } ownGrid.set(lab, g);
  const l = c.evidence.find((e) => e.kind === 'legend-sample'); const lc = l && f.chains.chains[l.chain]; if (!lc) continue;
  const ms = [...new Set(lc.ranges.map((r) => r.path))].map((id) => paths.get(id)).filter(Boolean).map(feat);
  const long = ms.find((m) => m.dash && m.per > 15);
  const kinds = []; for (const m of ms) { if (m.per > 15) continue; const k = kinds.find((x) => close(x, m)); if (k) k.n++; else kinds.push({ ...m, n: 1 }); }
  L.set(lab, { dash: long ? { dash: long.dash, w: long.w, rgb: long.rgb } : null, kinds: kinds.filter((k) => k.n / Math.max(1, ms.length) >= 0.15), pitch: ms.length ? lc.lengthMm / ms.length : 2 });
}
for (const [lab, o] of L) o.unique = o.kinds.filter((k) => ![...L].some(([l2, o2]) => l2 !== lab && o2.kinds.some((x) => close(x, k))));
// raw indexes
const dashGrid = new Map(), markGridU = new Map(), markGridA = new Map();
for (const lab of L.keys()) { dashGrid.set(lab, new Grid()); markGridU.set(lab, new Grid()); markGridA.set(lab, new Grid()); }
for (const p of f.sheet.paths) {
  if (p.background || p.pts.length < 2) continue;
  const m = feat(p);
  if (m.dash && m.per > 15) { for (const [lab, o] of L) if (o.dash && o.dash.rgb === m.rgb && Math.abs(o.dash.w - m.w) < 0.03 && sameDash(m.dash, o.dash.dash)) for (let k = 1; k < p.pts.length; k++) dashGrid.get(lab).add(p.pts[k - 1], p.pts[k], 0); continue; }
  if (p.pts.length > 40 || m.per > 15) continue;
  for (const [lab, o] of L) { const c = { x: m.x, y: m.y }; if (o.unique.some((k) => close(k, m))) markGridU.get(lab).add(c, c, 0); if (o.kinds.some((k) => close(k, m))) markGridA.get(lab).add(c, c, 0); }
}
const raw = JSON.parse(readFileSync(refPath, 'utf8')); const ref = Array.isArray(raw) ? raw : raw.pieces;
for (const id of ids) {
  const p = ref.find((x) => x.id === id); if (!p) { console.log(id, 'not in reference'); continue; }
  console.log(`== ${id} (${p.label})  share of the verified outline with the size's own line`);
  console.log('size verdict  pen                        pipeline   raw own   raw any   longest gap in raw own');
  for (const z of p.sizes) {
    if (!['ok', 'bad'].includes(z.verdict)) continue;
    const o = L.get(z.size); if (!o) { console.log(z.size.padEnd(4), 'no legend'); continue; }
    const pts = []; for (let i = 0; i + 1 < z.outer.length; i += 2) pts.push([z.outer[i], z.outer[i + 1]]); pts.push(pts[0]);
    const reach = Math.max(0.8, 0.75 * o.pitch);
    let n = 0, a = 0, b = 0, c = 0, run = 0, maxRun = 0;
    for (let k = 1; k < pts.length; k++) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k]; const m = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay))); for (let q = 0; q < m; q++) { const x = ax + ((bx - ax) * (q + 0.5)) / m, y = ay + ((by - ay) * (q + 0.5)) / m; n++;
      if (ownGrid.get(z.size)?.near(x, y, 0.6).size) a++;
      const own = dashGrid.get(z.size).near(x, y, 0.6).size > 0 || markGridU.get(z.size).near(x, y, reach).size > 0;
      const any = own || markGridA.get(z.size).near(x, y, reach).size > 0;
      if (own) { b++; maxRun = Math.max(maxRun, run); run = 0; } else run++;
      if (any) c++; } }
    maxRun = Math.max(maxRun, run);
    const pen = o.dash ? 'dash ' + o.dash.dash.slice(0, 4).map((v) => v.toFixed(1)).join('/') : `marks ${o.kinds.length} kinds, ${o.unique.length} unique`;
    console.log(`${z.size.padEnd(4)} ${z.verdict.padEnd(7)} ${pen.padEnd(28)} ${(100 * a / n).toFixed(0).padStart(5)}%  ${(100 * b / n).toFixed(0).padStart(6)}%  ${(100 * c / n).toFixed(0).padStart(6)}%   ${maxRun} mm`);
  }
}
