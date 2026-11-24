// Off-chain stretches of open cells' predictions: shifted prediction, ink not chained, or nothing?
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const CELL = 3;
class G2 extends Grid {
  foot(px, py, r) {
    let best = null;
    for (let gx = Math.floor((px - r) / CELL); gx <= Math.floor((px + r) / CELL); gx++)
      for (let gy = Math.floor((py - r) / CELL); gy <= Math.floor((py + r) / CELL); gy++)
        for (const i of this.g.get(`${gx},${gy}`) ?? []) {
          const ax = this.seg[i * 4], ay = this.seg[i * 4 + 1], bx = this.seg[i * 4 + 2], by = this.seg[i * 4 + 3];
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
          const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
          if (d <= r && (!best || d < best.d)) best = { tag: this.tag[i], d };
        }
    return best;
  }
}
const argv = process.argv.slice(2);
const out = argv[argv.indexOf('--out') + 1];
const roots = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
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
    const grid = new G2(), pgrid = new G2();
    for (const ch of f.chains.chains) {
      for (let k = 1; k < ch.pts.length; k++) grid.add(ch.pts[k - 1], ch.pts[k], ch.id);
      if (ch.closed && ch.pts.length > 2) grid.add(ch.pts[ch.pts.length - 1], ch.pts[0], ch.id);
    }
    for (const p of f.sheet.paths) for (let k = 1; k < p.pts.length; k++) pgrid.add(p.pts[k - 1], p.pts[k], p.id);
    const pages = f.sheet.poses.map((p) => {
      const m = p.toSheet, det = m.a * m.d - m.b * m.c;
      return { w: p.widthMm, h: p.heightMm, a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
    });
    const onPaper = (x, y) => pages.some((p) => { const u = p.a * x + p.c * y + p.e, v = p.b * x + p.d * y + p.f; return u >= -1 && v >= -1 && u <= p.w + 1 && v <= p.h + 1; });
    for (const fam of cells)
      for (const c of fam.cells) {
        if (c.outcome === 'closed' || !c.pred || c.pred.length < 2) continue;
        const rank = rankOfLabel.get(c.size);
        if (rank === undefined) continue;
        const pred = [...c.pred, c.pred[0]];
        const r = { file: id, seed: fam.seed, size: c.size, extrap: !!c.predExtrapolated, total: 0, off: 0, offPaper: 0, inkNotChained: 0, shifted: 0, chainNearby: 0, nothing: 0, shiftMm: [], shiftRole: {} };
        let run = [];
        const flush = () => {
          if (!run.length) return;
          const withC = run.filter((q) => q.c);
          let shifted = false;
          if (run.length >= 15 && withC.length / run.length >= 0.7) {
            const m = med(withC.map((q) => q.c.d));
            const mad = med(withC.map((q) => Math.abs(q.c.d - m)));
            if (mad <= 0.5) { shifted = true; r.shiftMm.push([run.length, +m.toFixed(1)]); const i = info.get(withC[0].c.tag); const cnt = {}; for (const q of withC) { const i2 = info.get(q.c.tag); const k2 = !i2 ? 'unassigned' : i2.role === 'size' ? (i2.rank === rank ? 'own' : Math.abs(i2.rank - rank) === 1 ? 'neighbour-size' : 'other-size') : i2.role; cnt[k2] = (cnt[k2] ?? 0) + 1; } const k = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]; r.shiftRole[k] = (r.shiftRole[k] ?? 0) + run.length; }
          }
          for (const q of run) {
            if (!q.paper) r.offPaper++;
            else if (q.ink) r.inkNotChained++;
            else if (shifted && q.c) r.shifted++;
            else if (q.c) r.chainNearby++;
            else r.nothing++;
          }
          run = [];
        };
        for (let k = 1; k < pred.length; k++) {
          const [ax, ay] = pred[k - 1], [bx, by] = pred[k];
          const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
          for (let q = 0; q < steps; q++) {
            const x = ax + ((bx - ax) * (q + 0.5)) / steps, y = ay + ((by - ay) * (q + 0.5)) / steps;
            r.total++;
            if (grid.foot(x, y, 1.5)) { flush(); continue; }
            r.off++;
            const c0 = grid.foot(x, y, 10);
            let c = c0;
            if (c0) { let best = 0; for (const [ch, d] of grid.near(x, y, c0.d + 0.6)) { const i = info.get(ch); const sc = i?.role === 'size' ? (i.rank === rank ? 3 : 2) : i && i.role !== 'ignore' ? 1 : 0; if (sc > best) { best = sc; c = { tag: ch, d }; } } }
            run.push({ paper: onPaper(x, y), ink: !!pgrid.foot(x, y, 1.5), c });
          }
        }
        flush();
        rows.push(r);
      }
  }
writeFileSync(out, JSON.stringify(rows));
console.log('cells', rows.length);
