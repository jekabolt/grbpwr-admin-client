// The diagnosis metric along the owner's reference outlines (ok / bad), read-only.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [refPath, outPath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces = Array.isArray(raw) ? raw : raw.pieces;
const R = 1.5;
const cache = new Map();
const load = (root, file) => {
  const key = root + '|' + file;
  if (cache.has(key)) return cache.get(key);
  let v = null;
  const dir = existsSync(root) ? readdirSync(root).find((d) => d.toLowerCase().includes(file.toLowerCase()) && existsSync(`${root}/${d}`) && readdirSync(`${root}/${d}`).some((f) => f.endsWith('.snap.gz'))) : null;
  if (dir) {
    const snaps = readdirSync(`${root}/${dir}`).filter((f) => f.endsWith('.snap.gz')).sort();
    const s = deserialize(gunzipSync(readFileSync(`${root}/${dir}/${snaps[snaps.length - 1]}`)));
    const f = s.fields;
    const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
    const info = new Map();
    for (const c of f.chains.classes) for (const ch of c.chains) info.set(ch, { role: c.role, rank: c.role === 'size' ? rankOfClass.get(c.id) ?? null : null });
    const grid = new Grid();
    for (const ch of f.chains.chains) {
      for (let k = 1; k < ch.pts.length; k++) grid.add(ch.pts[k - 1], ch.pts[k], ch.id);
      if (ch.closed && ch.pts.length > 2) grid.add(ch.pts[ch.pts.length - 1], ch.pts[0], ch.id);
    }
    v = { grid, info, rankOf: new Map((s.ranks ?? f.run.sizes.map((z) => ({ label: z.label, rank: z.rank }))).map((r) => [r.label, r.rank])) };
  }
  cache.set(key, v);
  return v;
};
const rows = [];
for (const p of pieces) {
  const L = load(p.root, p.file);
  for (const z of p.sizes) {
    if (!['ok', 'bad'].includes(z.verdict) || !z.outer || z.outer.length < 6) continue;
    const row = { id: p.id, set: p.set, size: z.size, verdict: z.verdict };
    const rank = L?.rankOf.get(z.size);
    if (!L || rank === undefined) { rows.push({ ...row, skip: L ? 'no-rank' : 'no-snapshot' }); continue; }
    const pts = []; for (let i = 0; i + 1 < z.outer.length; i += 2) pts.push([z.outer[i], z.outer[i + 1]]);
    if (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > 0.01) pts.push(pts[0]);
    const n = { own: 0, osize: 0, nonsize: 0, none: 0 };
    // rival = on another size's chain while a DIFFERENT chain that is not that size runs within 0.4–3 mm
    let total = 0, run = 0, maxRun = 0, rival = 0, rivalRun = 0, maxRival = 0, lone = 0, loneRun = 0, maxLone = 0, foreign = 0, fRun = 0, maxForeign = 0;
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
      for (let q = 0; q < steps; q++) {
        const x = ax + ((bx - ax) * (q + 0.5)) / steps, y = ay + ((by - ay) * (q + 0.5)) / steps;
        total++;
        const near = L.grid.near(x, y, 3);
        let own = false, on = null, onD = 9;
        for (const [ch, d] of near) {
          if (d > 0.5) continue; // the outline sits ON this chain
          const i = L.info.get(ch);
          if (i?.role === 'size' && i.rank === rank) own = true;
          else if (d < onD) { onD = d; on = i ?? { role: 'unassigned', rank: null }; }
        }
        const cat = own ? 'own' : !on ? 'none' : on.role === "size" ? "osize" : "nonsize";
        n[cat]++;
        if (cat === 'own') { maxRun = Math.max(maxRun, run); run = 0; } else run++;
        // foreign = sits on another size's line and NOT on its own
        const isForeign = cat === "osize";
        if (isForeign) { foreign++; fRun++; } else { maxForeign = Math.max(maxForeign, fRun); fRun = 0; }
        // around it: other parallel lines within 0.5–3 mm
        let ownNear = false, freeNear = false, ranks = new Set();
        if (isForeign) for (const [ch, d] of near) {
          if (d <= 0.5) continue;
          const i = L.info.get(ch);
          if (i?.role === 'size' && i.rank === rank) ownNear = true;
          else if (!i || i.role !== 'size') freeNear = true;
          else ranks.add(i.rank);
        }
        const isRival = isForeign && (ownNear || freeNear);
        if (isRival) { rival++; rivalRun++; } else { maxRival = Math.max(maxRival, rivalRun); rivalRun = 0; }
        const isLone = isForeign && !ownNear && !freeNear && ranks.size === 0;
        if (isLone) { lone++; loneRun++; } else { maxLone = Math.max(maxLone, loneRun); loneRun = 0; }
      }
    }
    maxRun = Math.max(maxRun, run); maxForeign = Math.max(maxForeign, fRun); maxRival = Math.max(maxRival, rivalRun); maxLone = Math.max(maxLone, loneRun);
    rows.push({ ...row, total, ...n, maxRun, foreign, maxForeign, rival, maxRival, lone, maxLone });
  }
}
writeFileSync(outPath, JSON.stringify(rows));
console.log(rows.length, 'skipped', rows.filter((r) => r.skip).length);
