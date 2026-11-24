// Graph walk v0 (offline, read-only): closed outlines of ONE pen from the raw sheet paths, layers
// hidden; judged against the publisher's own size layers (truth).
//   node walk.mjs <truth.json> <snapshot dir> [JOIN mm]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const [truthPath, dir, joinArg, outPath] = process.argv.slice(2);
const JOIN = +(joinArg ?? 3.2), K = 3;
const f = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop()))).fields;
// ── truth: segments of the size layers on the sheet ──
const CELL = 2;
class G { g = new Map(); s = []; t = [];
  add(ax, ay, bx, by, tag) { const i = this.t.length; this.s.push(ax, ay, bx, by); this.t.push(tag); const n = Math.ceil(Math.hypot(bx - ax, by - ay) / CELL) + 1, seen = new Set();
    for (let k = 0; k <= n; k++) { const key = Math.floor((ax + ((bx - ax) * k) / n) / CELL) + ',' + Math.floor((ay + ((by - ay) * k) / n) / CELL); if (!seen.has(key)) { seen.add(key); (this.g.get(key) ?? this.g.set(key, []).get(key)).push(i); } } }
  tags(px, py, r) { const o = new Set();
    for (let gx = Math.floor((px - r) / CELL); gx <= Math.floor((px + r) / CELL); gx++) for (let gy = Math.floor((py - r) / CELL); gy <= Math.floor((py + r) / CELL); gy++)
      for (const i of this.g.get(gx + ',' + gy) ?? []) { const ax = this.s[i * 4], ay = this.s[i * 4 + 1], dx = this.s[i * 4 + 2] - ax, dy = this.s[i * 4 + 3] - ay, L = dx * dx + dy * dy; const u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; if (Math.hypot(ax + u * dx - px, ay + u * dy - py) <= r) o.add(this.t[i]); }
    return o; } }
const TG = new G();
const poses = new Map(f.sheet.poses.map((p) => [String(p.page), p.toSheet]));
for (const pg of JSON.parse(readFileSync(truthPath, 'utf8'))) { const m = poses.get(String(pg.page)); if (!m) continue; const A = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  for (let i = 0; i < pg.segs.length; i += 5) { const sz = /^Size\s+([0-9]+)/i.exec(pg.layers[pg.segs[i + 4]])?.[1]; if (!sz) continue; const [ax, ay] = A(pg.segs[i], pg.segs[i + 1]), [bx, by] = A(pg.segs[i + 2], pg.segs[i + 3]); TG.add(ax, ay, bx, by, sz); } }
// ── pens ──
const st = f.sheet.styles;
const penOf = (s) => `${s.strokeRgb}|${s.widthMm.toFixed(2)}`;
const dashOf = (s) => (s.dash ? s.dash.map((d) => d.toFixed(1)).join(',') : '');
const lenOf = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
const cand = f.sheet.paths.filter((p) => !p.background && !st[p.style].fill && p.pts.length >= 2);
const pens = new Map();
for (const p of cand) { const s = st[p.style]; if (!s.dash || s.widthMm < 0.4) continue; const k = penOf(s) + '|' + dashOf(s); (pens.get(k) ?? pens.set(k, []).get(k)).push(p); }
const dir2 = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
const report = [];
for (const [pen, paths] of pens) {
  const base = pen.split('|').slice(0, 2).join('|');
  // connectors: solid short strokes of the same colour and width (printed corners)
  const corners = cand.filter((p) => { const s = st[p.style]; return !s.dash && penOf(s) === base && lenOf(p.pts) <= 15; });
  const edges = [...paths.map((p) => ({ p, kind: 'pen' })), ...corners.map((p) => ({ p, kind: 'corner' }))].map((e, i) => ({ ...e, i, len: lenOf(e.p.pts) }));
  // ends: [edge, which end 0/1]
  const ends = []; const eg = new Map();
  for (const e of edges) { if (e.p.closed) continue; for (const w of [0, 1]) { const pt = w ? e.p.pts[e.p.pts.length - 1] : e.p.pts[0]; const out = w ? dir2(e.p.pts[e.p.pts.length - 2], pt) : dir2(e.p.pts[1], pt); const o = { e, w, pt, out }; ends.push(o); const key = Math.floor(pt.x / JOIN) + ',' + Math.floor(pt.y / JOIN); (eg.get(key) ?? eg.set(key, []).get(key)).push(o); } }
  const joinsOf = (o) => { const r = []; const gx = Math.floor(o.pt.x / JOIN), gy = Math.floor(o.pt.y / JOIN);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const q of eg.get(gx + dx + ',' + (gy + dy)) ?? []) { if (q.e === o.e) continue; const d = Math.hypot(q.pt.x - o.pt.x, q.pt.y - o.pt.y); if (d > JOIN) continue;
      // continuing straight: our outgoing direction against the next edge's inward direction (−q.out)
      const turn = Math.acos(Math.max(-1, Math.min(1, -(o.out.x * q.out.x + o.out.y * q.out.y))));
      // the hop itself should run along our direction, not sideways (a neighbouring size sits sideways)
      const hop = d > 0.05 ? Math.abs(Math.acos(Math.max(-1, Math.min(1, ((q.pt.x - o.pt.x) * o.out.x + (q.pt.y - o.pt.y) * o.out.y) / d)))) : 0;
      r.push({ q, cost: d + 2 * turn + 1.5 * hop * Math.min(d, 2) + (o.e.kind === 'corner' && q.e.kind === 'corner' ? 5 : 0) }); }
    return r.sort((a, b) => a.cost - b.cost).slice(0, K); };
  // cycles: from every long pen edge not yet used, best-first search back to its own start
  const used = new Set(); const cycles = [];
  for (const e of edges) if (e.p.closed && e.kind === 'pen' && e.len > 40) cycles.push({ edges: [e], cost: 0, alt: 0, closed1: true });
  for (const start of edges.filter((e) => e.kind === 'pen' && !e.p.closed && e.len > 40).sort((a, b) => b.len - a.len)) {
    if (used.has(start.i)) continue;
    const found = []; let steps = 0;
    const startEnd = ends.find((o) => o.e === start && o.w === 1), goal = ends.find((o) => o.e === start && o.w === 0);
    const stack = [{ at: startEnd, path: [start], cost: 0, seen: new Set([start.i]) }];
    while (stack.length && found.length < K && steps++ < 20000) {
      stack.sort((a, b) => b.cost - a.cost); const cur = stack.pop();
      for (const j of joinsOf(cur.at)) {
        if (j.q === goal) { found.push({ edges: cur.path, cost: cur.cost + j.cost }); continue; }
        if (cur.seen.has(j.q.e.i) || cur.path.length > 400) continue;
        const other = ends.find((o) => o.e === j.q.e && o.w !== j.q.w);
        stack.push({ at: other, path: [...cur.path, j.q.e], cost: cur.cost + j.cost, seen: new Set([...cur.seen, j.q.e.i]) });
      }
    }
    if (!found.length) { cycles.push({ edges: [start], open: true }); continue; }
    found.sort((a, b) => a.cost - b.cost);
    for (const e2 of found[0].edges) used.add(e2.i);
    cycles.push({ ...found[0], alt: found.length - 1, alts: found.slice(1) });
  }
  // judge by truth
  const judge = (c) => { const tally = new Map(); let n = 0, none = 0;
    for (const e of c.edges) { const pts = e.p.closed ? [...e.p.pts, e.p.pts[0]] : e.p.pts; for (let k = 1; k < pts.length; k++) { const L = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y), m = Math.max(1, Math.round(L)); for (let q = 0; q < m; q++) { n++; const tg = TG.tags(pts[k - 1].x + ((pts[k].x - pts[k - 1].x) * (q + 0.5)) / m, pts[k - 1].y + ((pts[k].y - pts[k - 1].y) * (q + 0.5)) / m, 0.3); if (!tg.size) none++; for (const t of tg) tally.set(t, (tally.get(t) ?? 0) + 1); } } }
    const top = [...tally].sort((a, b) => b[1] - a[1]); return { n, size: top[0]?.[0] ?? null, purity: top[0] ? top[0][1] / n : 0, second: top[1] ? `${top[1][0]}:${(100 * top[1][1] / n).toFixed(0)}%` : '', none: none / n }; };
  const closed = cycles.filter((c) => !c.open).map((c) => ({ c, j: judge(c) }));
  const bySize = {}; for (const x of closed) (bySize[x.j.size] ??= []).push(x);
  report.push({ pen: pen.split('|')[2], paths: paths.length, long: edges.filter((e) => e.kind === 'pen' && e.len > 40).length, cycles: closed.length, open: cycles.filter((c) => c.open).length, pure: closed.filter((x) => x.j.purity >= 0.98).length, sizes: Object.fromEntries(Object.entries(bySize).map(([s, v]) => [s, v.length])), impure: closed.filter((x) => x.j.purity < 0.98).map((x) => `${x.j.size}:${(100 * x.j.purity).toFixed(0)}% (${x.j.second}) len ${x.j.n} edges ${x.c.edges.length}`), withAlternatives: closed.filter((x) => x.c.alt > 0).length, lenM: +(closed.reduce((a, x) => a + x.j.n, 0) / 1000).toFixed(1) });
}
for (const r of report.sort((a, b) => b.cycles - a.cycles)) console.log(`${r.pen.padEnd(26)} long paths ${String(r.long).padStart(3)} | closed outlines ${String(r.cycles).padStart(2)} (${r.lenM} m), not closed ${r.open} | pure ≥98%: ${r.pure} | by true size ${JSON.stringify(r.sizes)} | had alternatives ${r.withAlternatives}${r.impure.length ? '\n      impure: ' + r.impure.join(' ; ') : ''}`);
if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 1));
