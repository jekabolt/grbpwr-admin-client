// Marks that are in NO size class: can their shape give them a size, and do they fill open cells' gaps?
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const feat = (p, st) => {
  let area = 0, per = 0, cx = 0, cy = 0;
  const n = p.pts.length;
  for (let i = 0; i < n; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; cx += a.x; cy += a.y; if (p.closed || i < n - 1) per += Math.hypot(b.x - a.x, b.y - a.y); if (p.closed) area += a.x * b.y - b.x * a.y; }
  return { kind: (p.closed ? 'c' : 'o') + (st.fill ? 'f' : 's'), n, area: Math.abs(area) / 2, per, x: cx / n, y: cy / n };
};
const close = (a, b) => a.kind === b.kind && Math.abs(a.per - b.per) <= 0.12 * Math.max(a.per, b.per) && Math.abs(a.area - b.area) <= 0.2 * Math.max(a.area, b.area, 0.02);
const files = [], cellsOut = [];
for (const root of process.argv.slice(2, -1))
  for (const id of readdirSync(root)) {
    const dir = `${root}/${id}`;
    if (id.endsWith('.json') || !existsSync(`${dir}/run.json`) || !existsSync(`${dir}/cells.json`)) continue;
    const snaps = readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort();
    if (!snaps.length) continue;
    const s = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`)));
    const f = s.fields;
    const run = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8'));
    const paths = new Map(f.sheet.paths.map((p) => [p.id, p]));
    const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
    const legend = new Map(), inSize = new Set(), roleOfPath = new Map();
    const grid = new Grid(); // own chains per rank
    for (const c of f.chains.classes) {
      for (const cid of c.chains) { const ch = f.chains.chains[cid]; if (!ch) continue; for (const r of ch.ranges) { if (c.role === 'size') inSize.add(r.path); else if (!roleOfPath.has(r.path)) roleOfPath.set(r.path, c.role); } if (c.role === 'size') for (let k = 1; k < ch.pts.length; k++) grid.add(ch.pts[k - 1], ch.pts[k], rankOfClass.get(c.id)); }
      if (c.role !== 'size') continue;
      const l = c.evidence.find((e) => e.kind === 'legend-sample');
      const lc = l && f.chains.chains[l.chain];
      if (!lc) continue;
      const ms = [], seen = new Set();
      for (const r of lc.ranges) { if (seen.has(r.path)) continue; seen.add(r.path); const p = paths.get(r.path); if (p) ms.push(feat(p, f.sheet.styles[p.style])); }
      const kinds = [];
      for (const m of ms) { const k = kinds.find((x) => close(x, m)); if (k) k.count++; else kinds.push({ ...m, count: 1 }); }
      legend.set(rankOfClass.get(c.id), { kinds: kinds.filter((k) => k.count / ms.length >= 0.15), pitch: ms.length ? lc.lengthMm / ms.length : 2, motif: !!c.evidence.find((e) => e.kind === 'recovered-motif') });
    }
    const owner = (m) => { const o = [...legend].filter(([, L]) => L.motif && L.kinds.some((k) => close(k, m))).map(([r]) => r); return o.length === 1 ? o[0] : null; };
    const mg = new Grid(); // shape-sized loose marks, tag = rank
    const fr = { file: id, stuck: run.stop?.step === 'pieces', loose: 0, sized: 0, sizedM: 0, byRole: {} };
    for (const p of f.sheet.paths) {
      if (inSize.has(p.id) || p.pts.length > 40) continue;
      const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y);
      if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) > 6) continue;
      fr.loose++;
      const m = feat(p, f.sheet.styles[p.style]);
      const o = owner(m);
      if (o === null) continue;
      fr.sized++; fr.sizedM += legend.get(o).pitch / 1000;
      const role = roleOfPath.get(p.id) ?? 'no chain';
      fr.byRole[role] = (fr.byRole[role] ?? 0) + 1;
      mg.add({ x: m.x, y: m.y }, { x: m.x, y: m.y }, o);
    }
    files.push(fr);
    const rankOfLabel = new Map((s.ranks ?? []).map((r) => [r.label, r.rank]));
    for (const fam of JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8')))
      for (const c of fam.cells) {
        if (c.outcome === 'closed' || !c.pred || c.pred.length < 2) continue;
        const rank = rankOfLabel.get(c.size);
        if (rank === undefined) continue;
        const pred = [...c.pred, c.pred[0]];
        let total = 0, miss = 0, cov = 0, covOther = 0;
        for (let k = 1; k < pred.length; k++) {
          const [ax, ay] = pred[k - 1], [bx, by] = pred[k];
          const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
          for (let q = 0; q < steps; q++) {
            const x = ax + ((bx - ax) * (q + 0.5)) / steps, y = ay + ((by - ay) * (q + 0.5)) / steps;
            total++;
            if (grid.near(x, y, 1.5).has(rank)) continue;
            miss++;
            const near = mg.near(x, y, 3);
            if (near.has(rank)) cov++; else if (near.size) covOther++;
          }
        }
        cellsOut.push({ file: id, seed: fam.seed, size: c.size, total, miss, cov, covOther, motifSize: !!legend.get(rank)?.motif });
      }
  }
writeFileSync(process.argv.at(-1), JSON.stringify({ files, cells: cellsOut }));
for (const st of [true, false]) {
  const g = files.filter((r) => r.stuck === st);
  const role = {};
  for (const r of g) for (const [k, v] of Object.entries(r.byRole)) role[k] = (role[k] ?? 0) + v;
  console.log(st ? 'stuck' : 'other', g.length, 'files | loose small marks', g.reduce((a, r) => a + r.loose, 0), '| given a size by shape', g.reduce((a, r) => a + r.sized, 0), `(~${Math.round(g.reduce((a, r) => a + r.sizedM, 0))} m of line) | where they sit now:`, role);
}
