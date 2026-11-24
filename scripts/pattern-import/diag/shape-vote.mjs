// On the sheet: give every mark of a shape-row chain a size by its SHAPE alone (rotation-free
// features: point count, area, perimeter) against the legend samples, vote per chain, and compare
// with the rank the pipeline gave the chain.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const feat = (p, st) => {
  let area = 0, per = 0;
  const n = p.pts.length;
  for (let i = 0; i < n; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; if (p.closed || i < n - 1) { per += Math.hypot(b.x - a.x, b.y - a.y); } if (p.closed) area += a.x * b.y - b.x * a.y; }
  return { kind: (p.closed ? 'c' : 'o') + (st.fill ? 'f' : 's'), n, area: Math.abs(area) / 2, per };
};
const close = (a, b) => a.kind === b.kind && Math.abs(a.per - b.per) <= 0.12 * Math.max(a.per, b.per) && Math.abs(a.area - b.area) <= 0.2 * Math.max(a.area, b.area, 0.02);
const tot = { stuck: { chains: 0, agree: 0, disagree: 0, undecided: 0, mm: 0, agreeMm: 0, disagreeMm: 0, alikeChains: 0, alikeAgree: 0, alikeDisagree: 0, alikeSwap: 0 }, other: { chains: 0, agree: 0, disagree: 0, undecided: 0, mm: 0, agreeMm: 0, disagreeMm: 0, alikeChains: 0, alikeAgree: 0, alikeDisagree: 0, alikeSwap: 0 } };
const perFile = [];
for (const root of process.argv.slice(2, -1))
  for (const id of readdirSync(root)) {
    const dir = `${root}/${id}`;
    if (id.endsWith('.json') || !existsSync(`${dir}/run.json`)) continue;
    const snaps = readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort();
    if (!snaps.length) continue;
    const f = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`))).fields;
    const paths = new Map(f.sheet.paths.map((p) => [p.id, p]));
    const run = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8'));
    const T = tot[run.stop?.step === 'pieces' ? 'stuck' : 'other'];
    // legend kinds per size: the mark kinds that hold ≥ 15% of the sample
    const legend = new Map(), alike = new Map(), legendChains = new Set();
    const marksOf = (ch) => { const out = [], seen = new Set(); for (const r of ch.ranges) { if (seen.has(r.path)) continue; seen.add(r.path); const p = paths.get(r.path); if (p) out.push(feat(p, f.sheet.styles[p.style])); } return out; };
    const motifSizes = new Set();
    for (const c of f.chains.classes) {
      if (c.role !== 'size') continue;
      const l = c.evidence.find((e) => e.kind === 'legend-sample');
      if (!l || !f.chains.chains[l.chain]) continue;
      legendChains.add(l.chain);
      const ms = marksOf(f.chains.chains[l.chain]);
      const kinds = [];
      for (const m of ms) { const k = kinds.find((x) => close(x, m)); if (k) k.count++; else kinds.push({ ...m, count: 1 }); }
      legend.set(c.sizeLabel, kinds.filter((k) => k.count / ms.length >= 0.15));
      alike.set(c.sizeLabel, new Set(l.alike ?? []));
      if (c.evidence.find((e) => e.kind === 'recovered-motif')) motifSizes.add(c.sizeLabel);
    }
    // a kind is DISTINCTIVE when exactly one size's legend has it
    const owner = (m) => { const o = [...legend].filter(([, ks]) => ks.some((k) => close(k, m))).map(([s]) => s); return o.length === 1 ? o[0] : null; };
    const fr = { file: id, chains: 0, agree: 0, disagree: 0 };
    for (const c of f.chains.classes) {
      if (c.role !== 'size' || !motifSizes.has(c.sizeLabel)) continue;
      for (const cid of c.chains) {
        const ch = f.chains.chains[cid];
        if (!ch || legendChains.has(cid) || ch.lengthMm < 30 || ch.ranges.length < 6) continue;
        const votes = new Map();
        let nv = 0;
        for (const m of marksOf(ch)) { const o = owner(m); if (o) { votes.set(o, (votes.get(o) ?? 0) + 1); nv++; } }
        T.chains++; T.mm += ch.lengthMm; fr.chains++;
        const isAlike = alike.get(c.sizeLabel)?.size > 0;
        if (isAlike) T.alikeChains++;
        const top = [...votes].sort((a, b) => b[1] - a[1])[0];
        if (!top || nv < 4 || top[1] / nv < 0.7) { T.undecided++; continue; }
        if (top[0] === c.sizeLabel) { T.agree++; T.agreeMm += ch.lengthMm; fr.agree++; if (isAlike) T.alikeAgree++; }
        else { T.disagree++; T.disagreeMm += ch.lengthMm; fr.disagree++; if (isAlike) { T.alikeDisagree++; if (alike.get(c.sizeLabel).has(top[0])) T.alikeSwap++; } }
      }
    }
    perFile.push(fr);
  }
writeFileSync(process.argv.at(-1), JSON.stringify({ tot, perFile }, null, 1));
for (const [k, t] of Object.entries(tot)) console.log(k, `shape-row chains ${t.chains} (${Math.round(t.mm / 1000)} m): shape vote agrees with the rank ${t.agree} (${(100 * t.agree / t.chains).toFixed(1)}%), disagrees ${t.disagree} (${(100 * t.disagree / t.chains).toFixed(1)}%, ${Math.round(t.disagreeMm / 1000)} m), undecided ${t.undecided} | look-alike sizes: chains ${t.alikeChains}, agree ${t.alikeAgree}, disagree ${t.alikeDisagree}, of them voted for the look-alike partner ${t.alikeSwap}`);
console.log('files with any disagreement', perFile.filter((r) => r.disagree).length, 'of', perFile.filter((r) => r.chains).length, '| worst', perFile.sort((a, b) => b.disagree - a.disagree).slice(0, 6).map((r) => `${r.file.replace(/^(MoodFabrics\.com-|A4-|2-)/, '').slice(0, 18)} ${r.disagree}/${r.chains}`).join(' ; '));
