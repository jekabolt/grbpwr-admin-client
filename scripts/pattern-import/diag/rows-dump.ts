// The rows of marks a second read keeps (stage 1A, `shownOnlyRows`), per size label, as JSON — for
// the walk to try them as the size's own lines (walk-carry.mjs, env ROWS=<this file>).
//   npx vite-node scripts/pattern-import/diag/rows-dump.ts <snapshot dir> <out.json> [--chains]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { buildChainsDetailed, DEFAULT_CHAIN_OPTS, shownOnlyRows } from 'lib/pattern-import/chains';
import type { Sheet } from 'lib/pattern-import/types';

const [dir, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const f = deserialize(
  gunzipSync(
    readFileSync(
      `${dir}/${readdirSync(dir)
        .filter((x) => x.endsWith('.snap.gz'))
        .sort()
        .pop()}`,
    ),
  ),
).fields as {
  sheet: Sheet;
  docTexts: string[];
  fileNames: Map<string, string>;
  aamaLayers: boolean;
};
const extras = { extraTexts: f.docTexts, fileNames: f.fileNames, aamaLayers: f.aamaLayers };
const built = buildChainsDetailed(f.sheet, { ...DEFAULT_CHAIN_OPTS }, extras);
const rows = shownOnlyRows(f.sheet, built.used, extras, built.set);
const by: Record<string, [number, number][][]> = {};
for (const r of rows) {
  const lab = built.set.classes.find((c) => c.id === r.classId)?.sizeLabel ?? '?';
  (by[lab] ??= []).push(r.pts.map((p) => [p.x, p.y]));
}
// --chains: every line of every size as the second read (rows kept) builds it — the lines
// themselves, through the printed marks, not polylines through mark centres
if (process.argv.includes('--chains')) {
  const again = buildChainsDetailed(f.sheet, { ...built.used, keepRows: true }, extras).set;
  for (const k of Object.keys(by)) delete by[k];
  for (const c of again.classes) {
    if (c.role !== 'size' || !c.sizeLabel) continue;
    by[c.sizeLabel] = c.chains
      .map((i) => again.chains[i])
      .filter(Boolean)
      .map((ch) => (ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts).map((p) => [p.x, p.y]));
  }
}
writeFileSync(out, JSON.stringify(by));
console.log(
  out,
  Object.entries(by)
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(' · '),
);
