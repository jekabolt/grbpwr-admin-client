// Open-cell diagnosis: along the grade prediction of every open cell, what is the ink in OUR data?
// Reads only saved snapshots (pieces-1.snap.gz + cells.json). No replay, no PDF.
//   node diag.mjs <snapRoot> [<snapRoot> …] --out <dir>
// Per 1 mm sample of `pred`, within R mm:
//   own        a chain of this cell's own size class
//   neighbour  a chain of a size class one rank away        other  any further size class
//   common     role common                                   unassigned  chain in no class (orphan)
//   marks      seam / grain / notch / internal               ignore      role ignore
//   path-only  a sheet path that no chain covers             none        nothing
// `own` wins when present; otherwise the nearest chain's class. `short` counts samples whose
// nearest non-own chain is shorter than 8 mm (reported apart, never dropped).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

const argv = process.argv.slice(2);
const out = argv[argv.indexOf('--out') + 1];
const roots = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
const R = 1.5;
const CELL = 3;

class Grid {
  g = new Map();
  seg = []; // ax ay bx by
  tag = [];
  add(a, b, tag) {
    const i = this.tag.length;
    this.seg.push(a.x, a.y, b.x, b.y);
    this.tag.push(tag);
    const x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
    const y0 = Math.floor(Math.min(a.y, b.y) / CELL), y1 = Math.floor(Math.max(a.y, b.y) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) {
      // a very long segment: walk it instead of filling its bounding box
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / CELL) + 1;
      const seen = new Set();
      for (let k = 0; k <= n; k++) {
        const gx = Math.floor((a.x + ((b.x - a.x) * k) / n) / CELL), gy = Math.floor((a.y + ((b.y - a.y) * k) / n) / CELL);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const key = `${gx + dx},${gy + dy}`;
          if (seen.has(key)) continue;
          seen.add(key);
          (this.g.get(key) ?? this.g.set(key, []).get(key)).push(i);
        }
      }
      return;
    }
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const key = `${gx},${gy}`;
      (this.g.get(key) ?? this.g.set(key, []).get(key)).push(i);
    }
  }
  /** every tag within r of p, with its distance */
  near(px, py, r) {
    const best = new Map();
    for (let gx = Math.floor((px - r) / CELL); gx <= Math.floor((px + r) / CELL); gx++)
      for (let gy = Math.floor((py - r) / CELL); gy <= Math.floor((py + r) / CELL); gy++)
        for (const i of this.g.get(`${gx},${gy}`) ?? []) {
          const ax = this.seg[i * 4], ay = this.seg[i * 4 + 1], bx = this.seg[i * 4 + 2], by = this.seg[i * 4 + 3];
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
          const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
          if (d <= r && d < (best.get(this.tag[i]) ?? Infinity)) best.set(this.tag[i], d);
        }
    return best;
  }
}

const CATS = ['own', 'neighbour', 'other', 'common', 'unassigned', 'marks', 'ignore', 'path-only', 'none'];
const rows = [];
const files = [];

for (const root of roots)
  for (const id of readdirSync(root)) {
    const dir = `${root}/${id}`;
    const snaps = existsSync(dir) && !id.endsWith('.json') ? readdirSync(dir).filter((f) => f.endsWith('.snap.gz')).sort() : [];
    if (!snaps.length || !existsSync(`${dir}/cells.json`)) continue;
    const s = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`)));
    const f = s.fields;
    const cells = JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8'));
    const rankOfLabel = new Map((s.ranks ?? []).map((r) => [r.label, r.rank]));
    const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
    // chain -> { cat base, rank }
    const info = new Map();
    for (const c of f.chains.classes)
      for (const ch of c.chains) info.set(ch, { role: c.role, rank: c.role === 'size' ? rankOfClass.get(c.id) ?? null : null });
    const lenOf = new Map();
    const grid = new Grid();
    const covered = new Set(); // sheet path ids that some chain uses
    for (const ch of f.chains.chains) {
      lenOf.set(ch.id, ch.lengthMm);
      for (const r of ch.ranges) covered.add(r.path);
      for (let k = 1; k < ch.pts.length; k++) grid.add(ch.pts[k - 1], ch.pts[k], ch.id);
      if (ch.closed && ch.pts.length > 2) grid.add(ch.pts[ch.pts.length - 1], ch.pts[0], ch.id);
    }
    const pgrid = new Grid();
    for (const p of f.sheet.paths) {
      if (covered.has(p.id)) continue;
      for (let k = 1; k < p.pts.length; k++) pgrid.add(p.pts[k - 1], p.pts[k], p.id);
    }
    const catOf = (chain, rank) => {
      const i = info.get(chain);
      if (!i) return 'unassigned';
      if (i.role === 'size') return i.rank === rank ? 'own' : i.rank !== null && Math.abs(i.rank - rank) === 1 ? 'neighbour' : 'other';
      if (i.role === 'common') return 'common';
      if (i.role === 'ignore') return 'ignore';
      return 'marks';
    };
    let nOpen = 0, nAll = 0;
    for (const fam of cells) {
      const openHere = fam.cells.filter((c) => c.outcome !== 'closed').length;
      for (const c of fam.cells) {
        nAll++;
        if ((c.outcome === "closed") !== !!process.env.VALID) continue;
        if (process.env.VALID) c.pred = c.outer;
        nOpen++;
        const row = { file: id, seed: fam.seed, label: (fam.label ?? '').replace(/[\u0000-\u001f]/g, '?'), size: c.size, outcome: c.outcome, refusal: c.refusal ?? null, famOpen: openHere, famCells: fam.cells.length };
        const rank = rankOfLabel.get(c.size);
        if (!c.pred || c.pred.length < 2 || rank === undefined) {
          rows.push({ ...row, cause: 'no-prediction' });
          continue;
        }
        const pred = c.pred;
        const n = Object.fromEntries(CATS.map((k) => [k, 0]));
        const nbB = [0,0,0], rkB = [0,0,0,0,0,0], ownB = [0,0,0,0,0], anyB = [0,0,0,0,0];
        let total = 0, short = 0, ownD = 0, ownN = 0;
        // runs of consecutive non-own samples: how the missing length is distributed
        let run = 0, maxRun = 0, runs = 0;
        const closeIt = Math.hypot(pred[0][0] - pred[pred.length - 1][0], pred[0][1] - pred[pred.length - 1][1]) > 0.01 ? [...pred, pred[0]] : pred;
        for (let k = 1; k < closeIt.length; k++) {
          const [ax, ay] = closeIt[k - 1], [bx, by] = closeIt[k];
          const L = Math.hypot(bx - ax, by - ay);
          const steps = Math.max(1, Math.round(L));
          for (let q = 0; q < steps; q++) {
            const x = ax + ((bx - ax) * (q + 0.5)) / steps, y = ay + ((by - ay) * (q + 0.5)) / steps;
            total++;
            const near = grid.near(x, y, R);
            let cat = null, bestD = Infinity, bestChain = null, own = false;
            for (const [chain, d] of near) {
              const k2 = catOf(chain, rank);
              if (k2 === 'own') { own = true; if (d < ownD + 99) { ownN++; ownD += d; } continue; }
              if (d < bestD) { bestD = d; cat = k2; bestChain = chain; }
            }
            if (own) cat = 'own';
            else if (!cat) cat = pgrid.near(x, y, R).size ? 'path-only' : 'none';
            else if ((lenOf.get(bestChain) ?? 99) < 8) short++;
            n[cat]++;
            if (cat !== "own") { let o = 99, a = 99; for (const [chain, d] of grid.near(x, y, 8)) { if (catOf(chain, rank) === "own") o = Math.min(o, d); a = Math.min(a, d); } const b = (v) => (v <= 1.5 ? 0 : v <= 3 ? 1 : v <= 5 ? 2 : v <= 8 ? 3 : 4); ownB[b(o)]++; anyB[b(a)]++; if (a <= 1.5) { const rk = new Set(); for (const [chain, d] of grid.near(x, y, 5)) { const i2 = info.get(chain); if (i2 && i2.role === "size" && i2.rank !== null) rk.add(i2.rank); } const nb = (rk.has(rank - 1) ? 1 : 0) + (rk.has(rank + 1) ? 1 : 0); nbB[nb]++; rkB[Math.min(rk.size, 5)]++; } }
            if (cat === 'own') { if (run) { runs++; maxRun = Math.max(maxRun, run); } run = 0; } else run++;
          }
        }
        if (run) { runs++; maxRun = Math.max(maxRun, run); }
        const miss = total - n.own;
        let cause = 'own-complete';
        if (miss / total >= 0.03 && miss >= 5) {
          cause = CATS.slice(1).reduce((a, k) => (n[k] > n[a] ? k : a), 'neighbour');
        }
        rows.push({ ...row, cause, totalMm: total, missMm: miss, missShare: +(miss / total).toFixed(3), runs, maxRunMm: maxRun, shortMm: short, ownB, anyB, nbB, rkB, ...n });
      }
    }
    files.push({ file: id, cells: nAll, open: nOpen });
  }

mkdirSync(out, { recursive: true });
writeFileSync(`${out}/open-cells.json`, JSON.stringify({ r: R, files, rows }));
const keys = ['file', 'seed', 'label', 'size', 'outcome', 'refusal', 'famOpen', 'famCells', 'cause', 'totalMm', 'missMm', 'missShare', 'runs', 'maxRunMm', 'shortMm', ...CATS];
writeFileSync(`${out}/open-cells.csv`, [keys.join(','), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n'));
const by = {};
for (const r of rows) (by[r.cause] ??= []).push(r);
console.log(`files ${files.length} · cells ${files.reduce((a, f) => a + f.cells, 0)} · open ${rows.length}`);
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length))
  console.log(k.padEnd(14), String(v.length).padStart(5), `${((100 * v.length) / rows.length).toFixed(1)}%`.padStart(7), 'files', new Set(v.map((r) => r.file)).size);
