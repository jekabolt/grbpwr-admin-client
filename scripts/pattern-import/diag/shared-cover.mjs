// Open cells: on the missing stretches (no own chain within 1.5 mm of pred), what evidence of a
// shared line exists at the nearest chain point?  Snapshots only.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const CELL = 3;
class G2 extends Grid {
  /** nearest segment within r: { tag, d, x, y } */
  foot(px, py, r, skip) {
    let best = null;
    for (let gx = Math.floor((px - r) / CELL); gx <= Math.floor((px + r) / CELL); gx++)
      for (let gy = Math.floor((py - r) / CELL); gy <= Math.floor((py + r) / CELL); gy++)
        for (const i of this.g.get(`${gx},${gy}`) ?? []) {
          if (skip && skip(this.tag[i])) continue;
          const ax = this.seg[i * 4], ay = this.seg[i * 4 + 1], bx = this.seg[i * 4 + 2], by = this.seg[i * 4 + 3];
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
          const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x - px, y - py);
          if (d <= r && (!best || d < best.d)) best = { tag: this.tag[i], d, x, y };
        }
    return best;
  }
}
const argv = process.argv.slice(2);
const out = argv[argv.indexOf('--out') + 1];
const roots = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
const rows = [];
for (const root of roots)
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
      let nClosed = 0;
      for (const c of fam.cells) {
        if (c.outcome !== 'closed' || !c.outer || c.outer.length < 3) continue;
        nClosed++;
        const o = c.outer.map(([x, y]) => ({ x, y }));
        for (let k = 1; k < o.length; k++) cg.add(o[k - 1], o[k], c.size);
        cg.add(o[o.length - 1], o[0], c.size);
      }
      for (const c of fam.cells) {
        if (c.outcome === 'closed' || !c.pred || c.pred.length < 2) continue;
        const rank = rankOfLabel.get(c.size);
        if (rank === undefined) continue;
        const pred = [...c.pred, c.pred[0]];
        // counters over missing samples
        const r = { file: id, seed: fam.seed, size: c.size, nClosed, miss: 0, offChain: 0, role: {}, closedOn: [0, 0, 0, 0], ranksOn: [0, 0, 0, 0], loneLike: 0, loneN: 0, A: 0, Bextra: 0, landed: 0 };
        let q5 = 0;
        for (let k = 1; k < pred.length; k++) {
          const [ax, ay] = pred[k - 1], [bx, by] = pred[k];
          const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
          for (let q = 0; q < steps; q++) {
            const x = ax + ((bx - ax) * (q + 0.5)) / steps, y = ay + ((by - ay) * (q + 0.5)) / steps;
            const near = grid.near(x, y, 1.5);
            let own = false;
            for (const ch of near.keys()) { const i = info.get(ch); if (i?.role === 'size' && i.rank === rank) own = true; }
            if (own) continue;
            r.miss++;
            const ft = grid.foot(x, y, 1.5);
            if (!ft) { r.offChain++; continue; }
            const fi = info.get(ft.tag) ?? { role: 'unassigned', rank: null };
            r.role[fi.role] = (r.role[fi.role] ?? 0) + 1;
            // closed outlines of this piece lying on the chain at that point
            const kc = cg.near(ft.x, ft.y, 0.5).size;
            r.closedOn[Math.min(kc, 3)]++;
            // distinct size ranks whose chains coincide there (landed-borrow's "≥ 3 sizes run along")
            const rk = new Set();
            for (const ch of grid.near(ft.x, ft.y, 0.5).keys()) { const i = info.get(ch); if (i?.role === 'size' && i.rank !== null && i.rank !== fi.rank) rk.add(i.rank); }
            r.ranksOn[Math.min(rk.size, 3)]++;
            if (fi.role === 'size' && rk.size >= 3) r.landed++;
            if (kc >= 3) { if (fi.role === 'size') r.A++; else r.Bextra++; }
            // lone-like (every 5th missing sample): a size chain with no other-rank size chain within 20 mm
            if (fi.role === 'size' && q5++ % 5 === 0) {
              r.loneN++;
              let beside = false;
              for (const ch of grid.near(ft.x, ft.y, 20).keys()) { const i = info.get(ch); if (i?.role === 'size' && i.rank !== fi.rank) { beside = true; break; } }
              if (!beside) r.loneLike++;
            }
          }
        }
        rows.push(r);
      }
    }
  }
writeFileSync(out, JSON.stringify(rows));
console.log('open cells with pred', rows.length);
