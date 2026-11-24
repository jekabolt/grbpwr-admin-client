// Corpus (no layers): per size class, how much of its line coincides (≤ 0.2 mm) with chains of N other size ranks.
// Ground truth from the layered files: ~73% alone, ~21% with all other sizes.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const rows = [];
for (const root of process.argv.slice(2, -1))
  for (const id of readdirSync(root)) {
    const dir = `${root}/${id}`;
    if (id.endsWith('.json') || !existsSync(`${dir}/run.json`)) continue;
    const snaps = readdirSync(dir).filter((f) => f.endsWith('.snap.gz')).sort();
    if (!snaps.length) continue;
    const f = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`))).fields;
    const run = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8'));
    const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
    const rk = new Map();
    for (const c of f.chains.classes) if (c.role === 'size' && rankOfClass.has(c.id)) for (const ch of c.chains) rk.set(ch, rankOfClass.get(c.id));
    const g = new Grid();
    for (const ch of f.chains.chains) if (rk.has(ch.id)) for (let k = 1; k < ch.pts.length; k++) g.add(ch.pts[k - 1], ch.pts[k], ch.id);
    const N = new Set(rk.values()).size;
    const per = new Map();
    for (const ch of f.chains.chains) {
      const r = rk.get(ch.id);
      if (r === undefined) continue;
      const o = per.get(r) ?? per.set(r, { len: 0, alone: 0, few: 0, many: 0, all: 0 }).get(r);
      for (let k = 1; k < ch.pts.length; k++) {
        const a = ch.pts[k - 1], b = ch.pts[k], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.round(L / 2));
        for (let q = 0; q < n; q++) {
          const x = a.x + ((b.x - a.x) * (q + 0.5)) / n, y = a.y + ((b.y - a.y) * (q + 0.5)) / n;
          const others = new Set();
          for (const t of g.near(x, y, 0.2).keys()) if (rk.get(t) !== r) others.add(rk.get(t));
          const w = L / n;
          o.len += w;
          if (!others.size) o.alone += w; else if (others.size <= 2) o.few += w; else o.many += w;
          if (others.size >= N - 2) o.all += w;
        }
      }
    }
    const v = [...per.values()];
    const T = v.reduce((a, o) => a + o.len, 0) || 1;
    const lens = v.map((o) => o.len).sort((a, b) => a - b);
    rows.push({ file: id, stop: run.stop?.step ?? run.verdict, sizes: N, alone: v.reduce((a, o) => a + o.alone, 0) / T, few: v.reduce((a, o) => a + o.few, 0) / T, many: v.reduce((a, o) => a + o.many, 0) / T, all: v.reduce((a, o) => a + o.all, 0) / T, minOverMedianLen: lens[0] / lens[lens.length >> 1] });
  }
writeFileSync(process.argv.at(-1), JSON.stringify(rows));
