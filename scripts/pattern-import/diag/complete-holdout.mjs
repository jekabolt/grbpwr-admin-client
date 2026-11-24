// Completion hold-out on the owner's verified outlines: hide a stretch of an ok outline, redraw it
// from the two neighbouring sizes, measure the error against the hidden truth.
//   node complete-holdout.mjs <reference.json> <repo root> <out.json>
// Methods, all pinned to the two visible ends of the gap:
//   straight   a straight bridge (what the walk does today)
//   one        the same stretch of ONE neighbour, carried over (ends matched, offset blended)
//   two        between the TWO bracketing neighbours: P = lo + a·(hi − lo) + r, a and r read at the
//              two gap ends and blended along the stretch
// Correspondence is local: the gap ends are projected on each neighbour, and points correspond by
// share of arc length between those projections.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const [refPath, root, outPath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(refPath, 'utf8')); const pieces = Array.isArray(raw) ? raw : raw.pieces;
const rankCache = new Map();
const ranksOf = (p) => { const key = p.root + '|' + p.file; if (rankCache.has(key)) return rankCache.get(key); const base = root + '/' + p.root; const d = readdirSync(base).find((x) => x.toLowerCase().includes(p.file.toLowerCase()) && !x.endsWith('.json')); const s = deserialize(gunzipSync(readFileSync(`${base}/${d}/` + readdirSync(`${base}/${d}`).filter((x) => x.endsWith('.snap.gz')).sort().pop()))); const m = new Map((s.ranks ?? []).map((r) => [r.label, r.rank])); rankCache.set(key, m); return m; };
const poly = (o) => { const pts = []; for (let i = 0; i + 1 < o.length; i += 2) pts.push({ x: o[i], y: o[i + 1] }); return pts; };
// closed polyline with cumulative arc length
const prep = (pts) => { const p = [...pts, pts[0]]; const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)); return { p, cum, L: cum[cum.length - 1] }; };
const at = (c, s) => { s = ((s % c.L) + c.L) % c.L; let lo = 0, hi = c.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.cum[m] <= s) lo = m; else hi = m; } const t = (s - c.cum[lo]) / (c.cum[hi] - c.cum[lo] || 1); return { x: c.p[lo].x + (c.p[hi].x - c.p[lo].x) * t, y: c.p[lo].y + (c.p[hi].y - c.p[lo].y) * t }; };
const project = (c, q) => { let best = { d: Infinity, s: 0 }; for (let i = 1; i < c.p.length; i++) { const a = c.p[i - 1], b = c.p[i], dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy; const t = LL ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / LL)) : 0; const d = Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y); if (d < best.d) best = { d, s: c.cum[i - 1] + t * Math.sqrt(LL) }; } return best; };
const stretch = (c, s0, len, n) => Array.from({ length: n + 1 }, (_, i) => at(c, s0 + (len * i) / n));
// the neighbour's stretch between the projections of the two gap ends, going the same way round
const nbStretch = (c, e0, e1, n, approxLen) => { const a = project(c, e0).s, b = project(c, e1).s; let fw = ((b - a) % c.L + c.L) % c.L; const bw = fw - c.L; const len = Math.abs(fw - approxLen) <= Math.abs(-bw - approxLen) ? fw : bw; return { pts: stretch(c, a, len, n), len: Math.abs(len) }; };
const dev = (A, B) => { // max and mean distance from the points of A to polyline B
  let mx = 0, sum = 0; for (const q of A) { let d = Infinity; for (let i = 1; i < B.length; i++) { const a = B[i - 1], b = B[i], dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy; const t = LL ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / LL)) : 0; d = Math.min(d, Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y)); } mx = Math.max(mx, d); sum += d; } return { max: mx, mean: sum / A.length }; };
const err = (pred, truth) => { const a = dev(pred, truth), b = dev(truth, pred); return { max: Math.max(a.max, b.max), mean: (a.mean + b.mean) / 2 }; };
const turnOf = (pts) => { let t = 0; for (let i = 2; i < pts.length; i++) { const a = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x), b = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x); let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; t = Math.max(t, d); } return (t * 180) / Math.PI; };
const N = 60, GAPS = [30, 60, 90], POS = 8;
const trials = [], examples = [];
for (const p of pieces) {
  const rk = ranksOf(p); const ok = p.sizes.filter((z) => z.verdict === 'ok' && z.outer?.length >= 12 && rk.has(z.size)).map((z) => ({ size: z.size, rank: rk.get(z.size), c: prep(poly(z.outer)) })).sort((a, b) => a.rank - b.rank);
  for (const T of ok) {
    const lo = ok.find((z) => z.rank === T.rank - 1), hi = ok.find((z) => z.rank === T.rank + 1);
    const lo2 = ok.find((z) => z.rank === T.rank - 2), hi2 = ok.find((z) => z.rank === T.rank + 2);
    for (const G of GAPS) {
      if (T.c.L < 3 * G) continue;
      for (let k = 0; k < POS; k++) {
        const s0 = (T.c.L * k) / POS; const truth = stretch(T.c, s0, G, N); const e0 = truth[0], e1 = truth[N];
        const row = { id: p.id, set: p.set, size: T.size, gap: G, pos: k, turn: Math.round(turnOf(stretch(T.c, s0, G, 20))) };
        row.straight = err(Array.from({ length: N + 1 }, (_, i) => ({ x: e0.x + ((e1.x - e0.x) * i) / N, y: e0.y + ((e1.y - e0.y) * i) / N })), truth);
        const carry = (nb) => { const s = nbStretch(nb.c, e0, e1, N, G); if (Math.abs(s.len - G) > 0.5 * G) return null; const d0 = { x: e0.x - s.pts[0].x, y: e0.y - s.pts[0].y }, d1 = { x: e1.x - s.pts[N].x, y: e1.y - s.pts[N].y }; return s.pts.map((q, i) => ({ x: q.x + d0.x + ((d1.x - d0.x) * i) / N, y: q.y + d0.y + ((d1.y - d0.y) * i) / N })); };
        const between = (A, B) => { const a = nbStretch(A.c, e0, e1, N, G), b = nbStretch(B.c, e0, e1, N, G); if (Math.abs(a.len - G) > 0.5 * G || Math.abs(b.len - G) > 0.5 * G) return null;
          const coef = (e, pa, pb) => { const vx = pb.x - pa.x, vy = pb.y - pa.y, LL = vx * vx + vy * vy; const al = LL > 1e-6 ? ((e.x - pa.x) * vx + (e.y - pa.y) * vy) / LL : 0.5; return { al, r: { x: e.x - (pa.x + al * vx), y: e.y - (pa.y + al * vy) } }; };
          const c0 = coef(e0, a.pts[0], b.pts[0]), c1 = coef(e1, a.pts[N], b.pts[N]);
          return { pts: a.pts.map((q, i) => { const t = i / N, al = c0.al + (c1.al - c0.al) * t; return { x: q.x + al * (b.pts[i].x - q.x) + c0.r.x + (c1.r.x - c0.r.x) * t, y: q.y + al * (b.pts[i].y - q.y) + c0.r.y + (c1.r.y - c0.r.y) * t }; }), a: a.pts, b: b.pts, al: [c0.al, c1.al] }; };
        const nb1 = lo ?? hi; const one = nb1 && carry(nb1); if (one) row.one = err(one, truth);
        let two = null; if (lo && hi) { two = between(lo, hi); if (two) { row.two = err(two.pts, truth); // distance to the nearer neighbour along the hidden stretch: the room for error
            const dl = dev(truth, two.a).mean, dh = dev(truth, two.b).mean; row.room = Math.min(dl, dh); } }
        if (!(lo && hi)) { const A = lo && lo2 ? [lo2, lo] : hi && hi2 ? [hi, hi2] : null; if (A) { const ex = between(A[0], A[1]); if (ex) row.extra = err(ex.pts, truth); } }
        trials.push(row);
        if (two && examples.length < 400) examples.push({ ...row, truth, pred: two.pts, lo: two.a, hi: two.b, before: stretch(T.c, s0 - 25, 25, 12), after: stretch(T.c, s0 + G, 25, 12) });
      }
    }
  }
}
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const stat = (rows, m) => { const v = rows.filter((r) => r[m]).map((r) => r[m].max); return { n: v.length, med: q(v, 0.5), p90: q(v, 0.9), p95: q(v, 0.95), le05: v.filter((x) => x <= 0.5).length, le1: v.filter((x) => x <= 1).length }; };
const summary = {};
for (const G of GAPS) for (const m of ['straight', 'one', 'two', 'extra']) summary[`${m}|${G}`] = stat(trials.filter((r) => r.gap === G), m);
for (const set of ['tune', 'confirm']) for (const m of ['one', 'two']) summary[`${m}|${set}`] = stat(trials.filter((r) => r.set === set), m);
for (const [nm, f] of [['smooth (turn < 20°)', (r) => r.turn < 20], ['with a corner (turn ≥ 45°)', (r) => r.turn >= 45]]) for (const m of ['straight', 'one', 'two']) summary[`${m}|${nm}`] = stat(trials.filter(f), m);
const withRoom = trials.filter((r) => r.two && r.room > 0.05);
summary.safe = { n: withRoom.length, pass: withRoom.filter((r) => r.two.max < r.room / 2).length, roomMed: q(withRoom.map((r) => r.room), 0.5) };
for (const [k, v] of Object.entries(summary)) console.log(k.padEnd(34), JSON.stringify(v, (kk, x) => (typeof x === 'number' && !Number.isInteger(x) ? +x.toFixed(2) : x)));
// examples for pictures: the median, a p90 and the worst of the two-neighbour method at 60 mm, one with a corner
const g60 = examples.filter((e) => e.gap === 60).sort((a, b) => a.two.max - b.two.max);
const pick = [g60[Math.floor(g60.length * 0.5)], g60[Math.floor(g60.length * 0.9)], g60[g60.length - 1], g60.filter((e) => e.turn >= 60)[Math.floor(g60.filter((e) => e.turn >= 60).length * 0.5)]].filter(Boolean);
const r2 = (pts) => pts.map((p2) => [+p2.x.toFixed(2), +p2.y.toFixed(2)]);
writeFileSync(outPath, JSON.stringify({ trials: trials.length, pieces: new Set(trials.map((t) => t.id)).size, sizes: new Set(trials.map((t) => t.id + '|' + t.size)).size, summary, hist: Object.fromEntries(['straight', 'one', 'two'].map((m) => [m, trials.filter((r) => r[m] && r.gap === 60).map((r) => +r[m].max.toFixed(2))])), examples: pick.map((e) => ({ id: e.id, size: e.size, gap: e.gap, turn: e.turn, errTwo: +e.two.max.toFixed(2), errStraight: +e.straight.max.toFixed(2), errOne: e.one ? +e.one.max.toFixed(2) : null, truth: r2(e.truth), pred: r2(e.pred), lo: r2(e.lo), hi: r2(e.hi), before: r2(e.before), after: r2(e.after) })) }));
console.log('trials', trials.length);
