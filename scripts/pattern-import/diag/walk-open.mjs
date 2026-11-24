// Does the walk close cells the fill leaves OPEN? Per open cell of a snapshot: walk the size's own
// chains + common chains + stretches shared by ≥ M size classes around the piece, and check the
// result against the piece's closed neighbours (area must sit between the nearest closed sizes).
//   node walk-open.mjs <snapshot dir> [JOIN mm] [M] [dump.json]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [dir, joinArg, mArg, dumpPath] = process.argv.slice(2);
const JOIN = +(joinArg ?? 20), M = +(mArg ?? 6), K = 3;
const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
const f = s.fields;
const cells = JSON.parse(readFileSync(dir + '/cells.json', 'utf8'));
const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
const labOf = new Map(s.ranks.map((r) => [r.rank, r.label])); const rankOf = new Map(s.ranks.map((r) => [r.label, r.rank]));
const chainsOf = new Map();
for (const c of f.chains.classes) if (c.role === 'size') chainsOf.set(labOf.get(rankOfClass.get(c.id)), c.chains.map((i) => f.chains.chains[i]).filter(Boolean));
const commonChains = f.chains.classes.filter((c) => c.role === 'common').flatMap((c) => c.chains.map((i) => f.chains.chains[i]).filter(Boolean));
const rankGrid = new Grid(); const rankOfChain = new Map();
for (const [lab, list] of chainsOf) for (const ch of list) { rankOfChain.set(ch.id, lab); for (let k = 1; k < ch.pts.length; k++) rankGrid.add(ch.pts[k - 1], ch.pts[k], ch.id); }
const dir2 = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
const lenOf = (pts) => pts.reduce((a, q, i) => (i ? a + Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0);
const areaOf = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; };
const sharedCache = new Map();
const sharedEdges = (bb, key) => { if (sharedCache.has(key)) return sharedCache.get(key); const out = []; const taken = new Grid();
  for (const ch of commonChains) { let cur = []; const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 5) { out.push(cur); for (let k = 1; k < cur.length; k++) taken.add(cur[k - 1], cur[k], 0); } cur = []; }; for (const q of ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts) { if (q.x >= bb[0] && q.x <= bb[2] && q.y >= bb[1] && q.y <= bb[3]) cur.push(q); else flush(); } flush(); }
  for (const [, list] of chainsOf) for (const ch of list) { let cur = []; const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 10) { out.push(cur); for (let k = 1; k < cur.length; k++) taken.add(cur[k - 1], cur[k], 0); } cur = []; };
    for (let k = 1; k < ch.pts.length; k++) { const a = ch.pts[k - 1], b = ch.pts[k], n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y))); for (let q = 0; q <= n; q++) { const pt = { x: a.x + ((b.x - a.x) * q) / n, y: a.y + ((b.y - a.y) * q) / n }; if (pt.x < bb[0] || pt.x > bb[2] || pt.y < bb[1] || pt.y > bb[3]) { flush(); continue; } const ranks = new Set([...rankGrid.near(pt.x, pt.y, 0.3).keys()].map((i) => rankOfChain.get(i))); if (ranks.size >= M && !taken.near(pt.x, pt.y, 0.3).size) cur.push(pt); else flush(); } } flush(); }
  sharedCache.set(key, out); return out; };
const walk = (size, bb, seed, key) => {
  const edges = [];
  for (const ch of chainsOf.get(size) ?? []) { const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts; let cur = []; const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 3) edges.push({ pts: cur, i: edges.length, len: lenOf(cur) }); cur = []; }; for (const q of pts) { if (q.x >= bb[0] && q.x <= bb[2] && q.y >= bb[1] && q.y <= bb[3]) cur.push(q); else flush(); } flush(); }
  const nOwn = edges.length; if (!nOwn) return { nOwn: 0 };
  for (const pts of sharedEdges(bb, key)) edges.push({ pts, i: edges.length, len: lenOf(pts), shared: true });
  const ends = []; for (const e of edges) for (const w of [0, 1]) { const pt = w ? e.pts[e.pts.length - 1] : e.pts[0]; const out = w ? dir2(e.pts[Math.max(0, e.pts.length - 4)], pt) : dir2(e.pts[Math.min(e.pts.length - 1, 3)], pt); ends.push({ e, w, pt, out }); }
  const joinsOf = (o) => ends.filter((q) => q.e !== o.e || q.w !== o.w).map((q) => { const d = Math.hypot(q.pt.x - o.pt.x, q.pt.y - o.pt.y); if (d > JOIN) return null; const turn = Math.acos(Math.max(-1, Math.min(1, -(o.out.x * q.out.x + o.out.y * q.out.y)))); return { q, cost: d + 1.5 * turn, d }; }).filter(Boolean).sort((a, b) => a.cost - b.cost).slice(0, K);
  const found = []; const start = edges.filter((e) => !e.shared).sort((a, b) => b.len - a.len)[0];
  const sEnd = ends.find((o) => o.e === start && o.w === 1), goal = ends.find((o) => o.e === start && o.w === 0);
  const stack = [{ at: sEnd, path: [{ e: start, rev: false }], cost: 0, bridge: 0, seen: new Set([start.i]) }]; let steps = 0;
  while (stack.length && found.length < 12 && steps++ < 80000) { stack.sort((a, b) => b.cost - a.cost); const cur = stack.pop();
    for (const j of joinsOf(cur.at)) { if (j.q === goal) { found.push({ path: cur.path, cost: cur.cost + j.cost, bridge: cur.bridge + j.d }); continue; } if (cur.seen.has(j.q.e.i)) continue; stack.push({ at: ends.find((o) => o.e === j.q.e && o.w !== j.q.w), path: [...cur.path, { e: j.q.e, rev: j.q.w === 1 }], cost: cur.cost + j.cost, bridge: cur.bridge + j.d, seen: new Set([...cur.seen, j.q.e.i]) }); } }
  const inside = (pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if (pts[i].y > seed.y !== pts[j].y > seed.y && seed.x < ((pts[j].x - pts[i].x) * (seed.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c; return c; };
  const cands = found.map((c) => { const pts = c.path.flatMap((x) => (x.rev ? [...x.e.pts].reverse() : x.e.pts)); return { pts, own: c.path.filter((x) => !x.e.shared).reduce((a, x) => a + x.e.len, 0), sharedLen: c.path.filter((x) => x.e.shared).reduce((a, x) => a + x.e.len, 0), bridge: c.bridge, cost: c.cost, round: inside(pts) }; }).filter((c) => c.round).sort((a, b) => b.own - a.own || a.cost - b.cost);
  return { nOwn, best: cands[0], n: cands.length };
};
const out = []; const tally = { open: 0, noOwn: 0, noWalk: 0, closed: 0, between: 0, notBetween: 0, noNeighbours: 0 };
for (const fam of cells) {
  const closed = fam.cells.filter((c) => c.outcome === 'closed' && c.outer?.length > 3).map((c) => ({ rank: rankOf.get(c.size), pts: c.outer.map(([x, y]) => ({ x, y })) })).filter((c) => c.rank !== undefined);
  if (!closed.length) continue;
  const all = closed.flatMap((c) => c.pts); const bb = [Math.min(...all.map((q) => q.x)) - 15, Math.min(...all.map((q) => q.y)) - 15, Math.max(...all.map((q) => q.x)) + 15, Math.max(...all.map((q) => q.y)) + 15];
  for (const c of fam.cells) {
    if (c.outcome === 'closed') continue; const rank = rankOf.get(c.size); if (rank === undefined) continue; tally.open++;
    const lo = closed.filter((x) => x.rank < rank).sort((a, b) => b.rank - a.rank)[0], hi = closed.filter((x) => x.rank > rank).sort((a, b) => a.rank - b.rank)[0];
    const near = lo ?? hi; const seed = { x: near.pts.reduce((a, q) => a + q.x, 0) / near.pts.length, y: near.pts.reduce((a, q) => a + q.y, 0) / near.pts.length };
    const r = walk(c.size, bb, seed, fam.seed);
    const row = { label: (fam.label ?? '').trim(), size: c.size, was: c.outcome + (c.refusal ? ' ' + String(c.refusal).split('|')[0] : '') };
    if (!r.nOwn) { tally.noOwn++; out.push({ ...row, result: 'no own line in the piece area' }); continue; }
    if (!r.best) { tally.noWalk++; out.push({ ...row, result: 'no closed walk' }); continue; }
    tally.closed++; const A = areaOf(r.best.pts); const aLo = lo ? areaOf(lo.pts) : null, aHi = hi ? areaOf(hi.pts) : null;
    let nest = 'no closed neighbour on one side'; if (aLo !== null && aHi !== null) { const a0 = Math.min(aLo, aHi), a1 = Math.max(aLo, aHi); nest = A >= a0 * 0.999 && A <= a1 * 1.001 ? 'between' : 'NOT between'; }
    if (nest === 'between') tally.between++; else if (nest === 'NOT between') tally.notBetween++; else tally.noNeighbours++;
    const per = lenOf([...r.best.pts, r.best.pts[0]]);
    out.push({ ...row, result: 'closed', nest, ownShare: +(r.best.own / per).toFixed(2), sharedShare: +(r.best.sharedLen / per).toFixed(2), bridgedMm: Math.round(r.best.bridge), candidates: r.n, walk: dumpPath ? r.best.pts.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)]) : undefined });
  }
}
console.log(JSON.stringify(tally));
const ok = out.filter((r) => r.result === 'closed' && r.nest === 'between');
const q = (v, p) => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) * p)];
if (ok.length) console.log(`closed and between its neighbours: ${ok.length} | bridged length median ${q(ok.map((r) => r.bridgedMm), 0.5)} mm, p90 ${q(ok.map((r) => r.bridgedMm), 0.9)} mm | own share median ${q(ok.map((r) => r.ownShare), 0.5)} | cells with ≤ 10 mm bridged: ${ok.filter((r) => r.bridgedMm <= 10).length}, ≤ 30 mm: ${ok.filter((r) => r.bridgedMm <= 30).length}`);
for (const r of out) console.log(`${r.label.slice(0, 26).padEnd(26)} ${r.size.padEnd(3)} ${r.was.slice(0, 22).padEnd(22)} → ${r.result}${r.result === 'closed' ? ` · ${r.nest} · own ${Math.round(100 * r.ownShare)}% shared ${Math.round(100 * r.sharedShare)}% bridged ${r.bridgedMm} mm` : ''}`);
if (dumpPath) writeFileSync(dumpPath, JSON.stringify(out));
