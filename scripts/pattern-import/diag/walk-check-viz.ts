// What the walk check would show the operator, on a saved snapshot: every closed size whose walk
// outline differs from the fill's, the whole piece, fill in red and walk in blue.
//   npx vite-node scripts/pattern-import/diag/walk-check-viz.ts <snapshot dir> <bench.json> <out.png> [label part] [max panels]
// The fill outlines are the snapshot's own cells.json; the label positions come from the bench.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { walkChecks } from 'lib/pattern-import/pieces/walk';
import type { ChainSet, PieceCandidate, PtMm, Seed, SizeRun } from 'lib/pattern-import/types';

const require = createRequire(`${process.cwd()}/`);
const { createCanvas } = require('@napi-rs/canvas');
const [dir, benchPath, outPng, part, maxArg] = process.argv.slice(2);
const snap = deserialize(
  gunzipSync(
    readFileSync(
      `${dir}/${readdirSync(dir)
        .filter((x) => x.endsWith('.snap.gz'))
        .sort()
        .pop()}`,
    ),
  ),
) as { fields: { chains: ChainSet; run: SizeRun }; ranks: { rank: number; label: string }[] };
const f = snap.fields;
const rankOf = new Map(snap.ranks.map((r) => [r.label, r.rank]));
const labOf = new Map(snap.ranks.map((r) => [r.rank, r.label]));
const id = dir.split('/').filter(Boolean).pop();
const bench = JSON.parse(readFileSync(benchPath, 'utf8')).files.find(
  (x: { id: string }) => x.id === id,
);
const cells: {
  seed: number;
  label: string | null;
  cells: { size: string; outcome: string; outer?: [number, number][] }[];
}[] = JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8'));
const seeds: Seed[] = [];
const families: { seed: number; label: string; candidates: PieceCandidate[] }[] = [];
for (const fam of cells) {
  if (part && !(fam.label ?? '').includes(part)) continue;
  const at = bench?.pieces.find((q: { seed: number }) => q.seed === fam.seed)?.at;
  if (!at) continue;
  seeds.push({ id: fam.seed, at } as Seed);
  families.push({
    seed: fam.seed,
    label: (fam.label ?? '').trim(),
    candidates: fam.cells
      .filter((c) => rankOf.has(c.size))
      .map(
        (c) =>
          ({
            seed: fam.seed,
            rank: rankOf.get(c.size)!,
            outer: (c.outer ?? []).map(([x, y]) => ({ x, y })),
            outcome: c.outcome,
          }) as PieceCandidate,
      ),
  });
}
const t0 = Date.now();
walkChecks(f.chains, f.run, seeds, families);
const ms = Date.now() - t0;
const shown = families.flatMap((fam) =>
  fam.candidates.filter((c) => c.walk).map((c) => ({ fam, c })),
);
const closed = families.reduce(
  (a, x) => a + x.candidates.filter((c) => c.outcome === 'closed').length,
  0,
);
const openAll = families.reduce(
  (a, x) => a + x.candidates.filter((c) => c.outcome === 'leak' || c.outcome === 'refused').length,
  0,
);
const proposed = shown.filter((x) => x.c.walk!.open).length;
const two = shown.filter((x) => !x.c.walk!.open);
console.log(
  `two outlines: ${two.length} · the program takes the walk ${two.filter((x) => x.c.walk!.verdict === 'walk').length}, the fill ${two.filter((x) => x.c.walk!.verdict === 'fill').length}, cannot tell ${two.filter((x) => !x.c.walk!.verdict).length}`,
);
console.log(
  `${shown.length - proposed} of ${closed} closed sizes would be shown · ${proposed} of ${openAll} open sizes get a proposal · the walk took ${ms} ms`,
);
for (const fam of families) {
  const w = fam.candidates.filter((c) => c.walk);
  if (w.length)
    console.log(
      `  ${fam.label.padEnd(30)} ${w.map((c) => (c.walk!.open ? `${labOf.get(c.rank)}: OPEN → closed, own ${Math.round(100 * c.walk!.ownShare)}%` : `${labOf.get(c.rank)}: ${c.walk!.maxMm.toFixed(1)} mm over ${Math.round(c.walk!.overMm)} → ${c.walk!.verdict ? `takes the ${c.walk!.verdict}` : 'cannot tell'}`)).join(' · ')}`,
    );
}
// OPEN_ONLY=1: only the proposals for open sizes · AUTO_ONLY=1: only the repairs the program
// makes itself (leak, jog) · ZOOM=<mm>: a panel of that half-width round the place they part,
// over every printed stroke · CAPTION_RU=1: Russian captions (a picture for the owner)
const ru = !!process.env.CAPTION_RU;
const zoom = +(process.env.ZOOM ?? 0);
const items = shown
  .filter((x) => !process.env.OPEN_ONLY || x.c.walk!.open)
  .filter((x) => !process.env.AUTO_ONLY || x.c.walk!.leak || x.c.walk!.jog)
  .slice(0, +(maxArg ?? 12));
if (!items.length) process.exit(0);
const P = 600;
const cols = Math.min(4, items.length);
const rows = Math.ceil(items.length / cols);
const cv = createCanvas(cols * P, rows * (P + 26) + 30);
const g = cv.getContext('2d');
g.fillStyle = '#fff';
g.fillRect(0, 0, cv.width, cv.height);
g.fillStyle = '#000';
g.font = '15px sans-serif';
g.fillText(
  ru
    ? 'КРАСНЫЙ = контур заливки (был) · СИНИЙ = контур обхода (стал) · чёрный = линии этого размера · зелёный = все напечатанные штрихи · кружок = место наибольшего расхождения'
    : 'RED = the fill · BLUE = the walk · black = lines of this size · grey = other size lines · circle = where they are farthest apart',
  8,
  18,
);
const rankOfClass = new Map<number, number>();
for (const z of f.run.sizes) if (z.classId != null) rankOfClass.set(z.classId, z.rank);
const sizeOfChain = new Map<number, number>();
for (const c of f.chains.classes)
  if (c.role === 'size' && rankOfClass.has(c.id))
    for (const i of c.chains) sizeOfChain.set(i, rankOfClass.get(c.id)!);
items.forEach(({ fam, c }, n) => {
  const ox = (n % cols) * P;
  const oy = 30 + Math.floor(n / cols) * (P + 26);
  const all = [...c.outer, ...c.walk!.outer];
  const at = c.walk!.at;
  const x0 = zoom ? at.x - zoom : Math.min(...all.map((p) => p.x)) - 8;
  const x1 = zoom ? at.x + zoom : Math.max(...all.map((p) => p.x)) + 8;
  const y0 = zoom ? at.y - zoom : Math.min(...all.map((p) => p.y)) - 8;
  const y1 = zoom ? at.y + zoom : Math.max(...all.map((p) => p.y)) + 8;
  const k = Math.min((P - 8) / (x1 - x0), (P - 8) / (y1 - y0));
  const X = (x: number) => ox + 4 + (x - x0) * k;
  const Y = (y: number) => oy + 24 + (y - y0) * k;
  g.save();
  g.beginPath();
  g.rect(ox + 2, oy + 22, P - 4, P - 2);
  g.clip();
  const line = (pts: PtMm[], col: string, wd: number, dash: number[] = [], close = false) => {
    g.strokeStyle = col;
    g.lineWidth = wd;
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y))));
    if (close) g.closePath();
    g.stroke();
  };
  if (zoom)
    for (const pa of (f as unknown as { sheet: { paths: { pts: PtMm[] }[] } }).sheet.paths)
      if (
        pa.pts.length &&
        pa.pts.some((q) => q.x > x0 - 4 && q.x < x1 + 4 && q.y > y0 - 4 && q.y < y1 + 4)
      )
        line(pa.pts.length > 1 ? pa.pts : [pa.pts[0], pa.pts[0]], '#7c7', 1.1);
  for (const ch of f.chains.chains) {
    const r = sizeOfChain.get(ch.id);
    if (r === undefined || !ch.pts.some((q) => q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1))
      continue;
    if (zoom && r !== c.rank) continue;
    line(ch.pts, r === c.rank ? '#000' : '#ccc', r === c.rank ? 1.6 : 0.8);
  }
  if (c.outer.length > 2) line(c.outer, '#e11', 2.5, [9, 6], true);
  line(c.walk!.outer, '#12f', 2.5, [3, 4], true);
  g.setLineDash([]);
  g.strokeStyle = '#f80';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(X(c.walk!.at.x), Y(c.walk!.at.y), 14, 0, 2 * Math.PI);
  g.stroke();
  g.restore();
  g.strokeStyle = '#888';
  g.lineWidth = 1;
  g.strokeRect(ox + 2, oy + 22, P - 4, P - 2);
  g.fillStyle = '#000';
  const why = c.walk!.leak
    ? ru
      ? 'протечка на далёкую линию'
      : 'leak'
    : c.walk!.jog
      ? ru
        ? 'ступенька'
        : 'jog'
      : '';
  g.fillText(
    ru
      ? `${fam.label.slice(0, 24)} · размер ${labOf.get(c.rank)} · ${why} · расхождение ${c.walk!.maxMm.toFixed(1)} мм на ${Math.round(c.walk!.overMm)} мм`
      : c.walk!.open
        ? `${fam.label.slice(0, 26)} · size ${labOf.get(c.rank)} · left open by the fill · walk on own line ${Math.round(100 * c.walk!.ownShare)}%`
        : `${fam.label.slice(0, 26)} · size ${labOf.get(c.rank)} · ${why ? `${why} · ` : ''}${c.walk!.maxMm.toFixed(1)} mm apart over ${Math.round(c.walk!.overMm)} mm · walk on own line ${Math.round(100 * c.walk!.ownShare)}%`,
    ox + 8,
    oy + 16,
  );
});
writeFileSync(outPng, cv.toBuffer('image/png'));
console.log(outPng, items.length, 'panels');
