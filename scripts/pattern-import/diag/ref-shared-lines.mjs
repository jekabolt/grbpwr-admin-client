// Who shares a line: for every chain a reference outline lies on (≤ 0.5 mm), the set of sizes on it.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const [refPath, outPath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces = Array.isArray(raw) ? raw : raw.pieces;
const cache = new Map();
const load = (root, file) => {
  const key = root + '|' + file;
  if (cache.has(key)) return cache.get(key);
  const dir = readdirSync(root).find((d) => d.toLowerCase().includes(file.toLowerCase()) && !d.endsWith('.json') && readdirSync(`${root}/${d}`).some((f) => f.endsWith('.snap.gz')));
  const snaps = readdirSync(`${root}/${dir}`).filter((f) => f.endsWith('.snap.gz')).sort();
  const f = deserialize(gunzipSync(readFileSync(`${root}/${dir}/${snaps[snaps.length - 1]}`)));
  const s = f.fields;
  const rankOfClass = new Map(s.run.sizes.map((z) => [z.classId, z.rank]));
  const info = new Map();
  for (const c of s.chains.classes) for (const ch of c.chains) info.set(ch, { role: c.role, rank: c.role === 'size' ? rankOfClass.get(c.id) ?? null : null });
  const grid = new Grid();
  const len = new Map();
  for (const ch of s.chains.chains) {
    len.set(ch.id, ch.lengthMm);
    for (let k = 1; k < ch.pts.length; k++) grid.add(ch.pts[k - 1], ch.pts[k], ch.id);
    if (ch.closed && ch.pts.length > 2) grid.add(ch.pts[ch.pts.length - 1], ch.pts[0], ch.id);
  }
  const v = { grid, info, len, rankOf: new Map((f.ranks ?? s.run.sizes).map((r) => [r.label, r.rank])) };
  cache.set(key, v);
  return v;
};
const out = [];
for (const p of pieces) {
  const L = load(p.root, p.file);
  const use = new Map(); // chain -> Map(rank -> { mm, verdict })
  const sizes = [];
  for (const z of p.sizes) {
    if (!['ok', 'bad'].includes(z.verdict) || !z.outer || z.outer.length < 6) continue;
    const rank = L.rankOf.get(z.size);
    if (rank === undefined) continue;
    sizes.push({ size: z.size, rank, verdict: z.verdict });
    const pts = []; for (let i = 0; i + 1 < z.outer.length; i += 2) pts.push([z.outer[i], z.outer[i + 1]]);
    pts.push(pts[0]);
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
      for (let q = 0; q < steps; q++) {
        const x = ax + ((bx - ax) * (q + 0.5)) / steps, y = ay + ((by - ay) * (q + 0.5)) / steps;
        const near = L.grid.near(x, y, 0.5);
        // own chain wins the sample; else the nearest chain
        let pick = null, pd = 9, own = null;
        for (const [ch, d] of near) {
          const i = L.info.get(ch);
          if (i?.role === 'size' && i.rank === rank) own = ch;
          if (d < pd) { pd = d; pick = ch; }
        }
        const chs = [...near.keys()]; const hasOwn = own !== null;
        if (!chs.length) continue;
        for (const ch of chs) { const m = use.get(ch) ?? use.set(ch, new Map()).get(ch);
        const e = m.get(rank) ?? m.set(rank, { mm: 0, verdict: z.verdict }).get(rank);
        e.mm++; if (!hasOwn) e.need = (e.need ?? 0) + 1; }
      }
    }
  }
  const chains = [];
  for (const [ch, m] of use) {
    const i = L.info.get(ch) ?? { role: 'unassigned', rank: null };
    chains.push({ chain: ch, role: i.role, owner: i.rank, lenMm: Math.round(L.len.get(ch) ?? 0), users: [...m].map(([rank, e]) => ({ rank, mm: e.mm, need: e.need ?? 0, verdict: e.verdict })) });
  }
  out.push({ id: p.id, set: p.set, sizes, chains });
}
writeFileSync(outPath, JSON.stringify(out));
console.log('pieces', out.length);
