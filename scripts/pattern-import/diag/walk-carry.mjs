// Walk + completion. The walk keeps whole printed edges (own chains, common chains, stretches where
// ≥ 6 size classes coincide). Where two consecutive edges do not meet, the missing stretch is the
// same stretch of a closed NEIGHBOUR size carried over between the two printed ends, not a straight
// bridge. A carried stretch is `smooth` when the neighbour turns < 45° on it, else `corner`.
//   node walk-carry.mjs ref  <reference.json> <snapshot dir> <piece id> […]   accuracy on verified outlines
//   node walk-carry.mjs open <snapshot dir> [dump.json]                       the cells the fill leaves open
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [mode, ...rest] = process.argv.slice(2);
const dir = mode === 'ref' ? rest[1] : rest[0];
const M = 6, JOIN = 120, K = 4, TIGHT = 3;
const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
const f = s.fields;
const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
const labOf = new Map(s.ranks.map((r) => [r.rank, r.label])); const rankOf = new Map(s.ranks.map((r) => [r.label, r.rank]));
const chainsOf = new Map();
for (const c of f.chains.classes) if (c.role === 'size') chainsOf.set(labOf.get(rankOfClass.get(c.id)), c.chains.map((i) => f.chains.chains[i]).filter(Boolean));
const commonChains = f.chains.classes.filter((c) => c.role === 'common').flatMap((c) => c.chains.map((i) => f.chains.chains[i]).filter(Boolean));
const rankGrid = new Grid(); const rankOfChain = new Map();
for (const [lab, list] of chainsOf) for (const ch of list) { rankOfChain.set(ch.id, lab); for (let k = 1; k < ch.pts.length; k++) rankGrid.add(ch.pts[k - 1], ch.pts[k], ch.id); }
const lenOf = (pts) => pts.reduce((a, q, i) => (i ? a + Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0);
const areaOf = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; };
const dir2 = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
const prep = (pts) => { const p = [...pts, pts[0]]; const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)); return { p, cum, L: cum[cum.length - 1] }; };
const at = (c, t) => { t = ((t % c.L) + c.L) % c.L; let lo = 0, hi = c.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.cum[m] <= t) lo = m; else hi = m; } const u = (t - c.cum[lo]) / (c.cum[hi] - c.cum[lo] || 1); return { x: c.p[lo].x + (c.p[hi].x - c.p[lo].x) * u, y: c.p[lo].y + (c.p[hi].y - c.p[lo].y) * u, a: Math.atan2(c.p[hi].y - c.p[lo].y, c.p[hi].x - c.p[lo].x) }; };
const project = (c, q) => { let best = { d: Infinity, s: 0 }; for (let i = 1; i < c.p.length; i++) { const a = c.p[i - 1], b = c.p[i], dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy; const t = LL ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / LL)) : 0; const d = Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y); if (d < best.d) best = { d, s: c.cum[i - 1] + t * Math.sqrt(LL) }; } return best; };
// the neighbour's stretch between the projections of two printed ends, carried onto those ends
const carry = (G, e0, e1) => { const a = project(G, e0), b = project(G, e1); const chord = Math.hypot(e1.x - e0.x, e1.y - e0.y); const fw = ((b.s - a.s) % G.L + G.L) % G.L, bw = fw - G.L; const len = Math.abs(fw - chord) <= Math.abs(-bw - chord) ? fw : bw; const L = Math.abs(len);
  if (L > 1.8 * chord + 15 || a.d > 25 || b.d > 25) return null; const n = Math.max(2, Math.round(L)); const g0 = at(G, a.s), g1 = at(G, a.s + len); const d0 = { x: e0.x - g0.x, y: e0.y - g0.y }, d1 = { x: e1.x - g1.x, y: e1.y - g1.y };
  const pts = []; let turn = 0, prev = null; for (let q = 1; q < n; q++) { const g = at(G, a.s + (len * q) / n), t = q / n; pts.push({ x: g.x + d0.x + (d1.x - d0.x) * t, y: g.y + d0.y + (d1.y - d0.y) * t }); if (prev !== null) { let dd = Math.abs(g.a - prev); if (dd > Math.PI) dd = 2 * Math.PI - dd; if (dd > turn) turn = dd; } prev = g.a; }
  let net = Math.abs(g1.a - g0.a); if (net > Math.PI) net = 2 * Math.PI - net; return { pts, mm: Math.round(L), kind: (Math.max(net, turn) * 180) / Math.PI >= 45 ? 'corner' : 'smooth' }; };
const sharedCache = new Map();
const sharedEdges = (bb, key) => { if (sharedCache.has(key)) return sharedCache.get(key); const out = []; const taken = new Grid();
  for (const ch of commonChains) { let cur = []; const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 5) { out.push(cur); for (let k = 1; k < cur.length; k++) taken.add(cur[k - 1], cur[k], 0); } cur = []; }; for (const q of ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts) { if (q.x >= bb[0] && q.x <= bb[2] && q.y >= bb[1] && q.y <= bb[3]) cur.push(q); else flush(); } flush(); }
  for (const [, list] of chainsOf) for (const ch of list) { let cur = []; const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 10) { out.push(cur); for (let k = 1; k < cur.length; k++) taken.add(cur[k - 1], cur[k], 0); } cur = []; };
    for (let k = 1; k < ch.pts.length; k++) { const a = ch.pts[k - 1], b = ch.pts[k], n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y))); for (let q = 0; q <= n; q++) { const pt = { x: a.x + ((b.x - a.x) * q) / n, y: a.y + ((b.y - a.y) * q) / n }; if (pt.x < bb[0] || pt.x > bb[2] || pt.y < bb[1] || pt.y > bb[3]) { flush(); continue; } const ranks = new Set([...rankGrid.near(pt.x, pt.y, 0.3).keys()].map((i) => rankOfChain.get(i))); if (ranks.size >= M && !taken.near(pt.x, pt.y, 0.3).size) cur.push(pt); else flush(); } } flush(); }
  sharedCache.set(key, out); return out; };
function walk(size, guidePts, key) {
  const G = prep(guidePts); const xs = guidePts.map((q) => q.x), ys = guidePts.map((q) => q.y); const bb = [Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) + 20, Math.max(...ys) + 20];
  const seed = { x: (bb[0] + bb[2]) / 2, y: (bb[1] + bb[3]) / 2 };
  const edges = [];
  for (const ch of chainsOf.get(size) ?? []) { const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts; let cur = []; const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 3) edges.push({ pts: cur, i: edges.length, len: lenOf(cur) }); cur = []; }; for (const q of pts) { if (q.x >= bb[0] && q.x <= bb[2] && q.y >= bb[1] && q.y <= bb[3]) cur.push(q); else flush(); } flush(); }
  const nOwn = edges.length; if (!nOwn) return null;
  for (const pts of sharedEdges(bb, key)) edges.push({ pts, i: edges.length, len: lenOf(pts), shared: true });
  const ends = []; for (const e of edges) for (const w of [0, 1]) { const pt = w ? e.pts[e.pts.length - 1] : e.pts[0]; const out = w ? dir2(e.pts[Math.max(0, e.pts.length - 4)], pt) : dir2(e.pts[Math.min(e.pts.length - 1, 3)], pt); ends.push({ e, w, pt, out }); }
  // a join longer than TIGHT must be drawable from the neighbour; its cost grows with its length
  const joinCache = new Map();
  const joinsOf = (o) => { const key2 = o.e.i + ':' + o.w; if (joinCache.has(key2)) return joinCache.get(key2); const r = ends.filter((q) => q.e !== o.e || q.w !== o.w).map((q) => { const d = Math.hypot(q.pt.x - o.pt.x, q.pt.y - o.pt.y); if (d > JOIN) return null; const turn = Math.acos(Math.max(-1, Math.min(1, -(o.out.x * q.out.x + o.out.y * q.out.y)))); if (d <= TIGHT) return { q, cost: d + 1.5 * turn, d }; const c = carry(G, o.pt, q.pt); if (!c) return null; return { q, cost: 2 * c.mm + 5 + (c.kind === 'corner' ? 30 : 0), d, c }; }).filter(Boolean).sort((a, b) => a.cost - b.cost).slice(0, K); joinCache.set(key2, r); return r; };
  const found = []; const start = edges.filter((e) => !e.shared).sort((a, b) => b.len - a.len)[0];
  const sEnd = ends.find((o) => o.e === start && o.w === 1), goal = ends.find((o) => o.e === start && o.w === 0);
  const stack = [{ at: sEnd, path: [{ e: start, rev: false }], joins: [], cost: 0, seen: new Set([start.i]) }]; let steps = 0;
  while (stack.length && found.length < 12 && steps++ < 60000) { stack.sort((a, b) => b.cost - a.cost); const cur = stack.pop();
    for (const j of joinsOf(cur.at)) { if (j.q === goal) { found.push({ path: cur.path, joins: [...cur.joins, j], cost: cur.cost + j.cost }); continue; } if (cur.seen.has(j.q.e.i)) continue; stack.push({ at: ends.find((o) => o.e === j.q.e && o.w !== j.q.w), path: [...cur.path, { e: j.q.e, rev: j.q.w === 1 }], joins: [...cur.joins, j], cost: cur.cost + j.cost, seen: new Set([...cur.seen, j.q.e.i]) }); } }
  const inside = (pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if (pts[i].y > seed.y !== pts[j].y > seed.y && seed.x < ((pts[j].x - pts[i].x) * (seed.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c; return c; };
  const cands = found.map((c) => { const pts = []; const drawn = []; c.path.forEach((x, k) => { pts.push(...(x.rev ? [...x.e.pts].reverse() : x.e.pts)); const j = c.joins[k]; if (j?.c) { pts.push(...j.c.pts); drawn.push(j.c); } }); const own = c.path.filter((x) => !x.e.shared).reduce((a, x) => a + x.e.len, 0), sh = c.path.filter((x) => x.e.shared).reduce((a, x) => a + x.e.len, 0); const dm = drawn.reduce((a, d) => a + d.mm, 0); return { pts, drawn, own, sh, dm, cost: c.cost, round: inside(pts) }; }).filter((c) => c.round).sort((a, b) => b.own - a.own || a.dm - b.dm || a.cost - b.cost);
  return { nOwn, best: cands[0] ?? null };
}
const dev = (A, B) => { const g = new Grid(); const b = [...B, B[0]]; for (let k = 1; k < b.length; k++) g.add(b[k - 1], b[k], 0); let mx = 0, in05 = 0, n = 0; const a = [...A, A[0]]; for (let k = 1; k < a.length; k++) { const p = a[k - 1], q = a[k], m = Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y))); for (let t = 0; t < m; t++) { const r = g.near(p.x + ((q.x - p.x) * (t + 0.5)) / m, p.y + ((q.y - p.y) * (t + 0.5)) / m, 30); const d = r.size ? r.get(0) : 30; n++; mx = Math.max(mx, d); if (d <= 0.5) in05++; } } return { max: mx, in05: in05 / n }; };
const pct = (v) => `${Math.round(100 * v)}%`;
const gapsStr = (b) => b.drawn.map((d) => `${d.mm}${d.kind === 'corner' ? 'c' : ''}`).join(' ') || '—';
if (mode === 'ref') {
  const raw = JSON.parse(readFileSync(rest[0], 'utf8')); const pieces = Array.isArray(raw) ? raw : raw.pieces; const all = [];
  for (const id of rest.slice(2)) { const p = pieces.find((x) => x.id === id); const mk = (z) => { const a = []; for (let i = 0; i + 1 < z.outer.length; i += 2) a.push({ x: z.outer[i], y: z.outer[i + 1] }); return a; };
    const ok = p.sizes.filter((z) => z.verdict === 'ok' && rankOf.has(z.size)).map((z) => ({ size: z.size, rank: rankOf.get(z.size), pts: mk(z) }));
    console.log(`== ${id} (${p.label})`); console.log('size   own  shared  drawn     stretches drawn (mm, c = corner)   max deviation from verified   within 0.5 mm');
    for (const T of ok) { const guide = ok.filter((z) => z !== T).sort((a, b) => Math.abs(a.rank - T.rank) - Math.abs(b.rank - T.rank))[0]; if (!guide) continue; const r = walk(T.size, guide.pts, id);
      if (!r?.best) { console.log(T.size.padEnd(5), r ? 'no closed walk' : 'no own line'); all.push({ id, size: T.size, none: true }); continue; }
      const b = r.best, per = lenOf([...b.pts, b.pts[0]]); const a1 = dev(b.pts, T.pts), a2 = dev(T.pts, b.pts); const mx = Math.max(a1.max, a2.max);
      all.push({ id, size: T.size, max: mx, dm: b.dm, corner: b.drawn.some((d) => d.kind === 'corner'), smooth: b.drawn.some((d) => d.kind === 'smooth') });
      console.log(`${T.size.padEnd(5)} ${pct(b.own / per).padStart(4)} ${pct(b.sh / per).padStart(6)} ${String(b.dm).padStart(5)} mm   ${gapsStr(b).padEnd(34)} ${mx.toFixed(2).padStart(8)} mm               ${pct(Math.min(a1.in05, a2.in05)).padStart(5)}`); } }
  const v = all.filter((r) => !r.none); const cnt = (g) => `${g.length} sizes: ≤ 1 mm ${g.filter((r) => r.max <= 1).length}, 1–3 mm ${g.filter((r) => r.max > 1 && r.max <= 3).length}, > 3 mm ${g.filter((r) => r.max > 3).length}`;
  console.log(`\nALL verified sizes ${all.length} · no closed walk ${all.length - v.length}`);
  console.log('nothing drawn        ', cnt(v.filter((r) => r.dm === 0)));
  console.log('smooth stretches only', cnt(v.filter((r) => r.dm > 0 && !r.corner)));
  console.log('a corner was drawn   ', cnt(v.filter((r) => r.corner)));
} else {
  const cells = JSON.parse(readFileSync(dir + '/cells.json', 'utf8')); const out = []; const t = { open: 0, noNeighbour: 0, noOwn: 0, noWalk: 0, nothingDrawn: 0, smoothOnly: 0, withCorner: 0, between: 0, notBetween: 0, oneSided: 0 };
  for (const fam of cells) { const closed = fam.cells.filter((c) => c.outcome === 'closed' && c.outer?.length > 3 && rankOf.has(c.size)).map((c) => ({ rank: rankOf.get(c.size), size: c.size, pts: c.outer.map(([x, y]) => ({ x, y })) }));
    for (const c of fam.cells) { if (c.outcome === 'closed' || !rankOf.has(c.size)) continue; t.open++; const rank = rankOf.get(c.size); const row = { label: (fam.label ?? '').trim(), size: c.size, seed: fam.seed };
      const guide = [...closed].sort((a, b) => Math.abs(a.rank - rank) - Math.abs(b.rank - rank))[0]; if (!guide) { t.noNeighbour++; out.push({ ...row, result: 'no closed size in the piece' }); continue; }
      const r = walk(c.size, guide.pts, fam.seed); if (!r) { t.noOwn++; out.push({ ...row, result: 'no own line near the piece' }); continue; } if (!r.best) { t.noWalk++; out.push({ ...row, result: 'no closed walk' }); continue; }
      const b = r.best; const lo = closed.filter((x) => x.rank < rank).sort((x, y) => y.rank - x.rank)[0], hi = closed.filter((x) => x.rank > rank).sort((x, y) => x.rank - y.rank)[0]; const A = areaOf(b.pts);
      const nest = lo && hi ? (A >= Math.min(areaOf(lo.pts), areaOf(hi.pts)) * 0.999 && A <= Math.max(areaOf(lo.pts), areaOf(hi.pts)) * 1.001 ? 'between' : 'NOT between') : 'one-sided';
      const kind = !b.drawn.length ? 'nothingDrawn' : b.drawn.some((d) => d.kind === 'corner') ? 'withCorner' : 'smoothOnly'; t[kind]++; t[nest === 'between' ? 'between' : nest === 'NOT between' ? 'notBetween' : 'oneSided']++;
      const per = lenOf([...b.pts, b.pts[0]]);
      out.push({ ...row, result: kind, nest, guide: guide.size, own: b.own / per, shared: b.sh / per, drawnMm: b.dm, gaps: gapsStr(b), pts: rest[1] ? b.pts.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)]) : undefined, drawn: rest[1] ? b.drawn.map((d) => ({ kind: d.kind, pts: d.pts.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)]) })) : undefined }); } }
  console.log(JSON.stringify(t));
  for (const r of out) console.log(`${r.label.slice(0, 26).padEnd(26)} ${r.size.padEnd(3)} → ${r.result.padEnd(13)}${r.nest ? ` · ${r.nest.padEnd(11)} · by ${r.guide.padEnd(3)} · own ${pct(r.own).padStart(4)} shared ${pct(r.shared).padStart(4)} · drawn ${String(r.drawnMm).padStart(4)} mm: ${r.gaps}` : ''}`);
  if (rest[1]) writeFileSync(rest[1], JSON.stringify(out));
}
