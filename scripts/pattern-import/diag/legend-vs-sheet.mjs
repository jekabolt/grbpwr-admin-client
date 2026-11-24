// Legend samples of shape-row sizes: do the marks on a size's own sheet lines match its legend sample?
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const feat = (p, st) => {
  let area = 0, per = 0;
  const n = p.pts.length;
  for (let i = 0; i < n; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; if (p.closed || i < n - 1) per += Math.hypot(b.x - a.x, b.y - a.y); if (p.closed) area += a.x * b.y - b.x * a.y; }
  return { kind: (p.closed ? 'c' : 'o') + (st.fill ? 'f' : 's'), n, area: Math.abs(area) / 2, per };
};
const close = (a, b) => a.kind === b.kind && Math.abs(a.per - b.per) <= 0.12 * Math.max(a.per, b.per) && Math.abs(a.area - b.area) <= 0.2 * Math.max(a.area, b.area, 0.02);
const kindsOf = (ms) => { const k = []; for (const m of ms) { const x = k.find((y) => close(y, m)); if (x) x.count++; else k.push({ ...m, count: 1 }); } return k.sort((a, b) => b.count - a.count); };
const d = (k, n) => `${k.kind}${k.n}pt per ${k.per.toFixed(2)} area ${k.area.toFixed(2)} ${Math.round((100 * k.count) / n)}%`;
const rows = [];
for (const root of process.argv.slice(2, -1))
  for (const id of readdirSync(root)) {
    const dir = `${root}/${id}`;
    if (id.endsWith('.json') || !existsSync(`${dir}/run.json`)) continue;
    const snaps = readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort();
    if (!snaps.length) continue;
    const f = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`))).fields;
    const run = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8'));
    const paths = new Map(f.sheet.paths.map((p) => [p.id, p]));
    const marks = (ids) => { const out = [], seen = new Set(); for (const cid of ids) { const ch = f.chains.chains[cid]; if (!ch) continue; for (const r of ch.ranges) { if (seen.has(r.path)) continue; seen.add(r.path); const p = paths.get(r.path); if (p && p.pts.length <= 40) out.push(feat(p, f.sheet.styles[p.style])); } } return out; };
    const L = new Map();
    for (const c of f.chains.classes) {
      if (c.role !== 'size') continue;
      const l = c.evidence.find((e) => e.kind === 'legend-sample');
      if (!l || !f.chains.chains[l.chain]) continue;
      const lm = marks([l.chain]);
      const sm = marks(c.chains.filter((x) => x !== l.chain));
      L.set(c.sizeLabel, { motif: !!c.evidence.find((e) => e.kind === 'recovered-motif'), ln: lm.length, lk: kindsOf(lm).filter((k) => k.count / lm.length >= 0.15), sn: sm.length, sk: kindsOf(sm).filter((k) => k.count / sm.length >= 0.15) });
    }
    for (const [size, A] of L) {
      if (!A.motif || A.sn < 30) continue;
      const foreign = [], unknown = [], own = [];
      for (const k of A.sk) {
        if (A.lk.some((x) => close(x, k))) { own.push(k); continue; }
        const others = [...L].filter(([s2, B]) => s2 !== size && B.lk.some((x) => close(x, k))).map(([s2]) => s2);
        (others.length ? foreign : unknown).push({ k, others });
      }
      const ownShare = own.reduce((a, k) => a + k.count, 0) / A.sn;
      const verdict = foreign.length && ownShare < 0.5 ? 'sample belongs to another size' : foreign.length ? 'partly another size' : unknown.length && ownShare < 0.5 ? 'sample does not match the line' : unknown.length ? 'partly unmatched' : 'ok';
      rows.push({ file: id, stuck: run.stop?.step === 'pieces', size, verdict, ownShare: +ownShare.toFixed(2), legend: A.lk.map((k) => d(k, A.ln)).join(' + '), sheet: A.sk.map((k) => d(k, A.sn)).join(' + '), foreign: foreign.map((x) => `${d(x.k, A.sn)} → legend of ${x.others.join(',')}`), marksOnSheet: A.sn });
    }
  }
writeFileSync(process.argv.at(-1), JSON.stringify(rows, null, 1));
const c = { stuck: {}, other: {} };
for (const r of rows) { const o = c[r.stuck ? 'stuck' : 'other']; o[r.verdict] = (o[r.verdict] ?? 0) + 1; }
console.log('shape-row sizes checked', rows.length, c);
const bad = rows.filter((r) => r.verdict === 'sample belongs to another size');
console.log('files with a foreign sample', new Set(bad.map((r) => r.file)).size);
for (const key of ['MDF340', 'Leah', 'Madison']) for (const r of rows.filter((x) => x.file.includes(key) && x.verdict !== 'ok')) console.log(`${key} size ${r.size}: ${r.verdict} (own ${r.ownShare})\n   legend: ${r.legend}\n   sheet:  ${r.sheet}\n   ${r.foreign.join(' ; ')}`);
const pairs = {};
for (const r of bad) for (const x of r.foreign) { const k = `${r.size}→${x.split('legend of ')[1]}`; pairs[k] = (pairs[k] ?? 0) + 1; }
console.log('most common swaps', Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 12));
