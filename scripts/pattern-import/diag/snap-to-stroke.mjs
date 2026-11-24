// Owner's idea, upper bound: keep the cell's own pen; where it is absent, sit the outline on the
// nearest PRINTED stroke of any pen within X mm of the grade prediction. Snapshots only.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const CELL = 3;
class G2 extends Grid {
  feet(px, py, r) {
    const best = new Map();
    for (let gx = Math.floor((px - r) / CELL); gx <= Math.floor((px + r) / CELL); gx++)
      for (let gy = Math.floor((py - r) / CELL); gy <= Math.floor((py + r) / CELL); gy++)
        for (const i of this.g.get(`${gx},${gy}`) ?? []) {
          const ax = this.seg[i * 4], ay = this.seg[i * 4 + 1], bx = this.seg[i * 4 + 2], by = this.seg[i * 4 + 3];
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
          const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x - px, y - py);
          const b = best.get(this.tag[i]);
          if (d <= r && (!b || d < b.d)) best.set(this.tag[i], { tag: this.tag[i], d, x, y });
        }
    return [...best.values()];
  }
}
const argv = process.argv.slice(2);
const out = argv.at(-1);
const XS = [1, 2, 3];
const rows = [];
for (const root of argv.slice(0, -1))
  for (const id of readdirSync(root)) {
    const dir = `${root}/${id}`;
    if (id.endsWith('.json') || !existsSync(`${dir}/cells.json`)) continue;
    const snaps = readdirSync(dir).filter((f) => f.endsWith('.snap.gz')).sort();
    if (!snaps.length) continue;
    const s = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`)));
    const f = s.fields;
    const cells = JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8'));
    const rankOfLabel = new Map((s.ranks ?? []).map((r) => [r.label, r.rank]));
    const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
    const info = new Map();
    for (const c of f.chains.classes) for (const ch of c.chains) info.set(ch, { role: c.role, rank: c.role === 'size' ? rankOfClass.get(c.id) ?? null : null });
    const grid = new G2();
    for (const ch of f.chains.chains) {
      for (let k = 1; k < ch.pts.length; k++) grid.add(ch.pts[k - 1], ch.pts[k], ch.id);
      if (ch.closed && ch.pts.length > 2) grid.add(ch.pts[ch.pts.length - 1], ch.pts[0], ch.id);
    }
    for (const fam of cells) {
      const cg = new G2();
      for (const c of fam.cells) {
        if (c.outcome !== 'closed' || !c.outer || c.outer.length < 3) continue;
        const o = c.outer.map(([x, y]) => ({ x, y }));
        for (let k = 1; k < o.length; k++) cg.add(o[k - 1], o[k], c.size);
        cg.add(o[o.length - 1], o[0], c.size);
      }
      for (const c of fam.cells) {
        if (c.outcome === 'closed' || !c.pred || c.pred.length < 2) continue;
        const rank = rankOfLabel.get(c.size);
        if (rank === undefined) continue;
        const pred = [...c.pred, c.pred[0]];
        const r = { file: id, seed: fam.seed, size: c.size, extrap: !!c.predExtrapolated, total: 0, x: XS.map(() => ({ own: 0, free: 0, shared: 0, taken: 0, none: 0, ambiguous: 0, maxNone: 0, _run: 0 })) };
        for (let k = 1; k < pred.length; k++) {
          const [ax, ay] = pred[k - 1], [bx, by] = pred[k];
          const Ls = Math.hypot(bx - ax, by - ay) || 1, tx = (bx - ax) / Ls, ty = (by - ay) / Ls;
          const steps = Math.max(1, Math.round(Ls));
          for (let q = 0; q < steps; q++) {
            const x = ax + ((bx - ax) * (q + 0.5)) / steps, y = ay + ((by - ay) * (q + 0.5)) / steps;
            r.total++;
            const all = grid.feet(x, y, 3).map((h) => ({ ...h, s: tx * (h.y - y) - ty * (h.x - x) })).sort((a, b) => a.s - b.s);
            XS.forEach((X, xi) => {
              const o = r.x[xi];
              const cand = all.filter((h) => h.d <= X);
              if (!cand.length) { o.none++; o._run++; o.maxNone = Math.max(o.maxNone, o._run); return; }
              o._run = 0;
              // clusters of signed offset: lines closer than 0.4 mm are one printed line (duplicates)
              const cl = [[cand[0]]];
              for (let i = 1; i < cand.length; i++) (cand[i].s - cand[i - 1].s > 0.4 ? cl.push([cand[i]]) : cl[cl.length - 1].push(cand[i]));
              if (cl.length > 1) o.ambiguous++;
              const near = cl.reduce((a, b) => (Math.min(...b.map((h) => h.d)) < Math.min(...a.map((h) => h.d)) ? b : a));
              if (near.some((h) => { const i = info.get(h.tag); return i?.role === 'size' && i.rank === rank; })) { o.own++; return; }
              const h0 = near.reduce((a, b) => (b.d < a.d ? b : a));
              const kc = cg.near(h0.x, h0.y, 0.5).size;
              if (kc >= 3) o.shared++; else if (kc >= 1) o.taken++; else o.free++;
            });
          }
        }
        for (const o of r.x) delete o._run;
        rows.push(r);
      }
    }
  }
writeFileSync(out, JSON.stringify(rows));
console.log('cells', rows.length);
