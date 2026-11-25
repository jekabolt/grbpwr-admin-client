// Stage 1A check, on a saved pieces snapshot (no PDF read):
//   1. the plain read of the snapshot's sheet gives the snapshot's own chain set (same hash) — the
//      option changes nothing in what the pieces step is given;
//   2. the rows that would only be SHOWN on the sizes step, per size.
//   npx vite-node scripts/pattern-import/diag/shown-rows.ts <snapshot dir>
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { buildChainsDetailed, DEFAULT_CHAIN_OPTS, shownOnlyRows } from 'lib/pattern-import/chains';
import type { ChainSet, Sheet } from 'lib/pattern-import/types';

const lenOf = (pts: { x: number; y: number }[]) =>
  pts.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
const dir = process.argv[2];
const snap = deserialize(
  gunzipSync(
    readFileSync(
      `${dir}/${readdirSync(dir)
        .filter((f) => f.endsWith('.snap.gz'))
        .sort()
        .pop()}`,
    ),
  ),
);
const f = snap.fields as {
  sheet: Sheet;
  chains: ChainSet;
  docTexts: string[];
  fileNames: Map<string, string>;
  aamaLayers: boolean;
};
const hash = (s: ChainSet) =>
  createHash('md5')
    .update(
      JSON.stringify([
        s.chains.map((c) => [c.pts.length, Math.round(c.lengthMm * 100), c.ranges.length, c.motif]),
        s.classes.map((c) => [c.role, c.sizeLabel, c.chains]),
      ]),
    )
    .digest('hex')
    .slice(0, 12);
const extras = { extraTexts: f.docTexts, fileNames: f.fileNames, aamaLayers: f.aamaLayers };
const t0 = Date.now();
const built = buildChainsDetailed(f.sheet, { ...DEFAULT_CHAIN_OPTS }, extras);
const t1 = Date.now();
console.log(
  `snapshot chains ${f.chains.chains.length} hash ${hash(f.chains)} · plain read now ${built.set.chains.length} hash ${hash(built.set)} · ${t1 - t0} ms`,
);
const rows = shownOnlyRows(f.sheet, built.used, extras, built.set);
console.log(
  `shown-only rows: ${rows.length}, ${Math.round(rows.reduce((a, r) => a + lenOf(r.pts), 0))} mm · second read ${Date.now() - t1} ms`,
);
const by = new Map<string, { n: number; mm: number }>();
for (const r of rows) {
  const lab = built.set.classes.find((c) => c.id === r.classId)!.sizeLabel ?? '?';
  const o = by.get(lab) ?? { n: 0, mm: 0 };
  o.n++;
  o.mm += lenOf(r.pts);
  by.set(lab, o);
}
for (const c of built.set.classes.filter((x) => x.role === 'size')) {
  const o = by.get(c.sizeLabel ?? '');
  console.log(
    `  size ${String(c.sizeLabel).padEnd(4)} own line ${String(Math.round(c.totalLengthMm)).padStart(6)} mm · shown-only ${o ? `${o.n} rows, ${Math.round(o.mm)} mm` : '—'}`,
  );
}
if (process.argv[3]) {
  const [x0, x1, y0, y1] = process.argv[3].split(',').map(Number);
  const through = (pts: { x: number; y: number }[]) =>
    pts.some((p, i) => {
      if (!i) return false;
      const u = pts[i - 1];
      const n = Math.max(1, Math.round(Math.hypot(p.x - u.x, p.y - u.y)));
      for (let q = 0; q <= n; q++) {
        const x = u.x + ((p.x - u.x) * q) / n,
          y = u.y + ((p.y - u.y) * q) / n;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
      }
      return false;
    });
  const hit = rows.filter((r) => through(r.pts));
  console.log(
    `rows through the box ${process.argv[3]}:`,
    hit
      .map(
        (r) =>
          `size ${built.set.classes.find((c) => c.id === r.classId)!.sizeLabel} ${Math.round(lenOf(r.pts))} mm, ${r.pts.length} marks`,
      )
      .join(' ; '),
  );
}
