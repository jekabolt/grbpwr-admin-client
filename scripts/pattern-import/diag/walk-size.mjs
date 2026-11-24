// Questions 2 and 3 of the graph-walk experiment: walk ONLY the chains of one size's own class and
// look for closed outlines; compare the best three with the verified outline. No fill, no walls.
//   node walk-size.mjs <reference.json> <snapshot dir> <piece id> [JOIN mm]
import { readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [refPath, dir, id, joinArg, sharedArg] = process.argv.slice(2);
// sharedArg = M: a stretch where the chains of at least M size classes coincide (≤ 0.3 mm) is a
// shared edge and every size may walk it (the publisher draws a shared edge once per size).
const M = +(sharedArg ?? 0);
const JOIN = +(joinArg ?? 6), K = 3, TOL = 0.6;
const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
const f = s.fields;
const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
const labOf = new Map(s.ranks.map((r) => [r.rank, r.label]));
const chainsOf = new Map();
for (const c of f.chains.classes) if (c.role === 'size') chainsOf.set(labOf.get(rankOfClass.get(c.id)), c.chains.map((i) => f.chains.chains[i]).filter(Boolean));
const rankGrid = new Grid(); const rankOfChain = new Map();
for (const [lab, list] of chainsOf) for (const ch of list) { rankOfChain.set(ch.id, lab); for (let k = 1; k < ch.pts.length; k++) rankGrid.add(ch.pts[k - 1], ch.pts[k], ch.id); }
const commonChains = f.chains.classes.filter((c) => c.role === 'common').flatMap((c) => c.chains.map((i) => f.chains.chains[i]).filter(Boolean));
const sharedEdges = (bb) => { if (!M) return []; const out = []; const taken = new Grid();
  // chains of role `common` are every size's by the pipeline's own reading (folds, ungraded edges)
  for (const ch of commonChains) { let cur = []; const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 5) { out.push(cur); for (let k = 1; k < cur.length; k++) taken.add(cur[k - 1], cur[k], 0); } cur = []; };
    for (const q of ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts) { if (q.x >= bb[0] && q.x <= bb[2] && q.y >= bb[1] && q.y <= bb[3]) cur.push(q); else flush(); } flush(); }
  for (const [, list] of chainsOf) for (const ch of list) { let cur = [];
    const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 10) { out.push(cur); for (let k = 1; k < cur.length; k++) taken.add(cur[k - 1], cur[k], 0); } cur = []; };
    for (let k = 1; k < ch.pts.length; k++) { const a = ch.pts[k - 1], b = ch.pts[k], n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let q = 0; q <= n; q++) { const pt = { x: a.x + ((b.x - a.x) * q) / n, y: a.y + ((b.y - a.y) * q) / n };
        if (pt.x < bb[0] || pt.x > bb[2] || pt.y < bb[1] || pt.y > bb[3]) { flush(); continue; }
        const ranks = new Set([...rankGrid.near(pt.x, pt.y, 0.3).keys()].map((i) => rankOfChain.get(i)));
        if (ranks.size >= M && !taken.near(pt.x, pt.y, 0.3).size) cur.push(pt); else flush(); } }
    flush(); }
  return out; };
const raw = JSON.parse(readFileSync(refPath, 'utf8')); const p = (Array.isArray(raw) ? raw : raw.pieces).find((x) => x.id === id);
const dir2 = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
const lenOf = (pts) => pts.reduce((a, q, i) => (i ? a + Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0);
const cover = (ptsA, gridB) => { let n = 0, hit = 0; for (let k = 1; k < ptsA.length; k++) { const a = ptsA[k - 1], b = ptsA[k], m = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y))); for (let q = 0; q < m; q++) { n++; if (gridB.near(a.x + ((b.x - a.x) * (q + 0.5)) / m, a.y + ((b.y - a.y) * (q + 0.5)) / m, TOL).size) hit++; } } return n ? hit / n : 0; };
console.log(`== ${id} (${p.label}) · own chains${M ? ` + stretches shared by ≥ ${M} size classes` : ' only'} · join ≤ ${JOIN} mm`);
console.log('size verdict  own chains  closed walks  best: on verified / verified covered   alternatives   verdict of the walk');
const dump = [];
const tally = { ok: { same: 0, other: 0, none: 0 }, bad: { same: 0, other: 0, none: 0 } };
for (const z of p.sizes) {
  if (!['ok', 'bad'].includes(z.verdict)) continue;
  const refPts = []; for (let i = 0; i + 1 < z.outer.length; i += 2) refPts.push({ x: z.outer[i], y: z.outer[i + 1] }); refPts.push(refPts[0]);
  const xs = refPts.map((q) => q.x), ys = refPts.map((q) => q.y); const bb = [Math.min(...xs) - 10, Math.min(...ys) - 10, Math.max(...xs) + 10, Math.max(...ys) + 10];
  const refGrid = new Grid(); for (let k = 1; k < refPts.length; k++) refGrid.add(refPts[k - 1], refPts[k], 0);
  // edges: own chains, cut to the part inside the piece's box
  const edges = [];
  for (const ch of chainsOf.get(z.size) ?? []) {
    const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts; let cur = [];
    const flush = () => { if (cur.length >= 2 && lenOf(cur) >= 3) edges.push({ pts: cur, i: edges.length, len: lenOf(cur) }); cur = []; };
    for (const q of pts) { if (q.x >= bb[0] && q.x <= bb[2] && q.y >= bb[1] && q.y <= bb[3]) cur.push(q); else flush(); }
    flush();
  }
  const nOwn = edges.length;
  for (const pts of sharedEdges(bb)) edges.push({ pts, i: edges.length, len: lenOf(pts), shared: true });
  const ends = [];
  for (const e of edges) for (const w of [0, 1]) { const pt = w ? e.pts[e.pts.length - 1] : e.pts[0]; const out = w ? dir2(e.pts[Math.max(0, e.pts.length - 4)], pt) : dir2(e.pts[Math.min(e.pts.length - 1, 3)], pt); ends.push({ e, w, pt, out }); }
  const joinsOf = (o) => ends.filter((q) => q.e !== o.e || q.w !== o.w).map((q) => { const d = Math.hypot(q.pt.x - o.pt.x, q.pt.y - o.pt.y); if (d > JOIN) return null; const turn = Math.acos(Math.max(-1, Math.min(1, -(o.out.x * q.out.x + o.out.y * q.out.y)))); return { q, cost: d + 1.5 * turn }; }).filter(Boolean).sort((a, b) => a.cost - b.cost).slice(0, K);
  const found = [];
  const start = [...edges].filter((e) => !e.shared).sort((a, b) => b.len - a.len)[0];
  if (start) {
    const sEnd = ends.find((o) => o.e === start && o.w === 1), goal = ends.find((o) => o.e === start && o.w === 0);
    const stack = [{ at: sEnd, path: [{ e: start, rev: false }], cost: 0, seen: new Set([start.i]) }]; let steps = 0;
    while (stack.length && found.length < 12 && steps++ < 80000) {
      stack.sort((a, b) => b.cost - a.cost); const cur = stack.pop();
      for (const j of joinsOf(cur.at)) {
        if (j.q === goal) { found.push({ path: cur.path, cost: cur.cost + j.cost }); continue; }
        if (cur.seen.has(j.q.e.i)) continue;
        stack.push({ at: ends.find((o) => o.e === j.q.e && o.w !== j.q.w), path: [...cur.path, { e: j.q.e, rev: j.q.w === 1 }], cost: cur.cost + j.cost, seen: new Set([...cur.seen, j.q.e.i]) });
      }
    }
  }
  // choose: the walk must go round the piece's seed (here: the middle of the verified outline's box),
  // and among those the one with the most of the size's OWN line wins; cost only breaks ties
  const seed = { x: (bb[0] + bb[2]) / 2, y: (bb[1] + bb[3]) / 2 };
  const inside = (pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if (pts[i].y > seed.y !== pts[j].y > seed.y && seed.x < ((pts[j].x - pts[i].x) * (seed.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c; return c; };
  for (const c of found) { c.own = c.path.filter((x) => !x.e.shared).reduce((s2, x) => s2 + x.e.len, 0); c.round = inside(c.path.flatMap((x) => (x.rev ? [...x.e.pts].reverse() : x.e.pts))); }
  const kept = found.filter((c) => c.round); found.length = 0; found.push(...kept);
  found.sort((a, b) => b.own - a.own || a.cost - b.cost); found.length = Math.min(found.length, K);
  const judged = found.map((c) => { const pts = c.path.flatMap((x) => (x.rev ? [...x.e.pts].reverse() : x.e.pts)); pts.push(pts[0]); const g = new Grid(); for (let k = 1; k < pts.length; k++) g.add(pts[k - 1], pts[k], 0); return { prec: cover(pts, refGrid), rec: cover(refPts, g), len: Math.round(lenOf(pts)), n: c.path.length }; });
  if (process.env.WALK_DUMP && found[0]) dump.push({ id, size: z.size, verdict: z.verdict, ref: refPts.map((q) => [q.x, q.y]), walk: found[0].path.flatMap((x) => (x.rev ? [...x.e.pts].reverse() : x.e.pts)).map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)]), shared: found[0].path.filter((x) => x.e.shared).map((x) => x.e.pts.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)])) });
  const good = (j) => j.prec >= 0.97 && j.rec >= 0.97;
  // why no walk: the ends of the own chains and how far the nearest other end is
  const gaps = ends.map((o) => Math.min(...ends.filter((q) => q !== o && !(q.e === o.e && edges.length > 1 && q.e.len < 3)).map((q) => (q === o ? 1e9 : Math.hypot(q.pt.x - o.pt.x, q.pt.y - o.pt.y))))).filter((d) => d > JOIN).map((d) => Math.round(d));
  const ownCover = (() => { const g = new Grid(); for (const e of edges) for (let k = 1; k < e.pts.length; k++) g.add(e.pts[k - 1], e.pts[k], 0); return cover(refPts, g); })();
  const best = judged[0];
  const where = !best ? 'none' : good(best) ? 'same' : judged.some(good) ? 'same (not first)' : 'other';
  tally[z.verdict][where.startsWith('same') ? 'same' : where]++;
  console.log(`${z.size.padEnd(4)} ${z.verdict.padEnd(7)} ${String(nOwn).padStart(3)}+${String(edges.length - nOwn).padEnd(2)} ${String(found.length).padStart(12)}        ${best ? `${(100 * best.prec).toFixed(0).padStart(3)}% / ${(100 * best.rec).toFixed(0).padStart(3)}%` : '      —     '}             ${judged.slice(1).map((j) => `${(100 * j.prec).toFixed(0)}/${(100 * j.rec).toFixed(0)}`).join('  ').padEnd(16)} ${where === 'none' ? `no closed walk · own chains cover ${(100 * ownCover).toFixed(0)}% of the verified outline · ends farther than the join: ${gaps.length ? gaps.sort((x, y) => x - y).join(', ') + ' mm' : 'none'}` : where.startsWith('same') ? 'the verified outline' + (where.includes('not') ? ' (among the three, not first)' : '') : 'a different outline'}`);
}
console.log('summary:', JSON.stringify(tally));
if (process.env.WALK_DUMP) (await import('node:fs')).writeFileSync(process.env.WALK_DUMP, JSON.stringify(dump));
