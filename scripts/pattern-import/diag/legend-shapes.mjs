// Legend samples of look-alike sizes: can the printed marks be told apart by SHAPE, not only by pitch?
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const TOL = 0.12; // mm, two marks are the same kind within this on both sides
const sig = (f, chainId) => {
  const ch = f.chains.chains[chainId];
  if (!ch) return null;
  const marks = [];
  const seen = new Set();
  for (const r of ch.ranges) {
    if (seen.has(r.path)) continue;
    seen.add(r.path);
    const p = f._paths.get(r.path);
    if (!p) continue;
    const st = f.sheet.styles[p.style];
    const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    let area = 0;
    if (p.closed) for (let i = 0; i < p.pts.length; i++) { const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length]; area += a.x * b.y - b.x * a.y; }
    marks.push({ kind: (p.closed ? 'c' : 'o') + (st.fill ? 'f' : 's'), n: p.pts.length, long: Math.max(w, h), short: Math.min(w, h), area: Math.abs(area) / 2, w: st.widthMm });
  }
  // kinds of mark
  const kinds = [];
  for (const m of marks) {
    const k = kinds.find((k2) => k2.kind === m.kind && Math.abs(k2.long - m.long) <= TOL && Math.abs(k2.short - m.short) <= TOL && (k2.n === m.n || Math.abs(k2.area - m.area) <= 0.15 * Math.max(k2.area, 0.05)));
    if (k) k.count++; else kinds.push({ ...m, count: 1 });
  }
  return { n: marks.length, pitch: marks.length ? ch.lengthMm / marks.length : 0, kinds: kinds.sort((a, b) => b.count - a.count), period: ch.markPeriod ?? null, motif: ch.motif };
};
const sameKind = (a, b) => a.kind === b.kind && Math.abs(a.long - b.long) <= TOL && Math.abs(a.short - b.short) <= TOL;
const rows = [];
for (const root of process.argv.slice(2, -1))
  for (const id of readdirSync(root)) {
    const dir = `${root}/${id}`;
    if (id.endsWith('.json') || !existsSync(`${dir}/run.json`)) continue;
    const snaps = readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort();
    if (!snaps.length) continue;
    const f = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`))).fields;
    f._paths = new Map(f.sheet.paths.map((p) => [p.id, p]));
    const run = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8'));
    const S = new Map();
    for (const c of f.chains.classes) {
      if (c.role !== 'size') continue;
      const l = c.evidence.find((e) => e.kind === 'legend-sample');
      if (l) S.set(c.sizeLabel, { alike: l.alike ?? [], sig: sig(f, l.chain), motif: !!c.evidence.find((e) => e.kind === 'recovered-motif') });
    }
    const done = new Set();
    for (const [a, A] of S) for (const b of A.alike) {
      const B = S.get(b);
      const key = [a, b].sort().join('|');
      if (!B || done.has(key) || !A.sig || !B.sig) continue;
      done.add(key);
      const ka = A.sig.kinds.filter((k) => k.count / A.sig.n >= 0.15), kb = B.sig.kinds.filter((k) => k.count / B.sig.n >= 0.15);
      const onlyA = ka.filter((k) => !B.sig.kinds.some((x) => sameKind(k, x))), onlyB = kb.filter((k) => !A.sig.kinds.some((x) => sameKind(k, x)));
      // share profile distance over common kinds
      let prof = 0;
      for (const k of A.sig.kinds) { const x = B.sig.kinds.find((y) => sameKind(k, y)); prof += Math.abs(k.count / A.sig.n - (x ? x.count / B.sig.n : 0)); }
      const pitchDiff = Math.abs(A.sig.pitch - B.sig.pitch) / Math.max(A.sig.pitch, B.sig.pitch, 1e-6);
      const verdict = onlyA.length || onlyB.length ? 'own shape' : prof >= 0.3 ? 'mix of shapes' : A.sig.period && B.sig.period && A.sig.period !== B.sig.period ? 'order of shapes' : pitchDiff >= 0.15 ? 'pitch only (>=15%)' : pitchDiff >= 0.05 ? 'pitch only (5-15%)' : 'nothing';
      const d = (s) => s.kinds.slice(0, 3).map((k) => `${k.kind}${k.n}pt ${k.long.toFixed(2)}x${k.short.toFixed(2)} ${Math.round((100 * k.count) / s.n)}%`).join(' + ');
      rows.push({ file: id, stuck: run.stop?.step === 'pieces', a, b, verdict, pitchDiff: +pitchDiff.toFixed(3), A: `${d(A.sig)} | pitch ${A.sig.pitch.toFixed(2)} | ${A.sig.period}`, B: `${d(B.sig)} | pitch ${B.sig.pitch.toFixed(2)} | ${B.sig.period}` });
    }
  }
writeFileSync(process.argv.at(-1), JSON.stringify(rows, null, 1));
const c = {};
for (const r of rows) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
console.log('alike pairs', rows.length, 'files', new Set(rows.map((r) => r.file)).size, c);
for (const v of Object.keys(c)) { const r = rows.find((x) => x.verdict === v); console.log(`-- ${v}: ${r.file.slice(0, 26)} ${r.a} vs ${r.b}\n   ${r.A}\n   ${r.B}`); }
