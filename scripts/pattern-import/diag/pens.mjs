import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const agg = { pieces: { files: 0, sizes: 0, declared: 0, recovered: 0, none: 0, alike: 0, filesWithRecovered: 0, filesWithAlike: 0, dupDash: 0 }, other: { files: 0, sizes: 0, declared: 0, recovered: 0, none: 0, alike: 0, filesWithRecovered: 0, filesWithAlike: 0, dupDash: 0 } };
const ex = [];
for (const root of process.argv.slice(2))
  for (const id of readdirSync(root)) {
    const dir = `${root}/${id}`;
    if (id.endsWith('.json') || !existsSync(`${dir}/run.json`)) continue;
    const snaps = readdirSync(dir).filter((f) => f.endsWith('.snap.gz')).sort();
    if (!snaps.length) continue;
    const f = deserialize(gunzipSync(readFileSync(`${dir}/${snaps[snaps.length - 1]}`))).fields;
    const run = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8'));
    const a = agg[run.stop?.step === 'pieces' ? 'pieces' : 'other'];
    a.files++;
    let rec = 0, al = 0; const dashes = new Map();
    for (const c of f.chains.classes) {
      if (c.role !== 'size') continue;
      a.sizes++;
      const d = c.evidence.find((e) => e.kind === 'declared-dash'), m = c.evidence.find((e) => e.kind === 'recovered-motif'), l = c.evidence.find((e) => e.kind === 'legend-sample');
      if (d) { a.declared++; const k = d.dash.map((x) => x.toFixed(1)).join(','); dashes.set(k, (dashes.get(k) ?? 0) + 1); } else if (m) { a.recovered++; rec++; } else a.none++;
      if (l?.alike?.length) { a.alike++; al++; }
    }
    if (rec) a.filesWithRecovered++;
    if (al) a.filesWithAlike++;
    a.dupDash += [...dashes.values()].filter((v) => v > 1).length;
    if (ex.length < 3 && rec) ex.push(id.slice(0, 30) + ' ' + f.chains.classes.filter((c) => c.role === 'size').map((c) => `${c.sizeLabel}:${c.evidence.find((e) => e.kind === 'declared-dash') ? 'dash' : 'motif'}${JSON.stringify(c.evidence.find((e) => e.kind === 'recovered-motif')?.motif ?? '').slice(0, 30)}`).join(' '));
  }
console.log(agg); console.log(ex.join('\n'));
