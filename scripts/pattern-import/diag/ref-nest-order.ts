// Does the ORDER of the printed lines across the nest say which size a line is — without the
// reader's label? Measured along the owner's reference outlines.
//   npx vite-node scripts/pattern-import/diag/ref-nest-order.ts <reference.json> <clone with .runs> [out.json]
// Sizes of one piece nest: across a side, from the inside out, the lines come in the order of the
// sizes. At a point of an outline a short cut is made along its normal and the printed size
// strokes on it are counted — `a` inside the outline's own stroke, `b` outside it — as far as
// they follow one another closely (a nest, not the next piece). With N sizes in the file the
// outline's size index i must satisfy  a ≤ i ≤ N − 1 − b : lines may coincide, they may not swap.
// Where a + b + 1 = N the nest is fully drawn there and the order names the size outright.
// The 18 Nov ray alignment labelled whole pieces by this order and was dropped for its coverage
// (0 wrong, 36–75 % of a piece). Here it is asked only for a verdict on a stretch.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { pointInPoly, segNearest, signedArea } from 'lib/pattern-import/pieces/geom';
import { walkLines } from 'lib/pattern-import/pieces/walk';
import type { ChainSet, PtMm, SizeRun } from 'lib/pattern-import/types';

type RefPiece = {
  id: string;
  root: string;
  file: string;
  set: string;
  sizes: { size: string; verdict: string; outer: number[] }[];
};
const [refPath, base, outPath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces: RefPiece[] = Array.isArray(raw) ? raw : raw.pieces;
const jobs = new Map<string, RefPiece[]>();
for (const p of pieces) {
  const root = `${base}/${p.root}`;
  const dir = existsSync(root) ? readdirSync(root).find((d) => d.includes(p.file)) : undefined;
  if (!dir || !readdirSync(`${root}/${dir}`).some((x) => x.endsWith('.snap.gz'))) continue;
  jobs.set(`${root}/${dir}`, [...(jobs.get(`${root}/${dir}`) ?? []), p]);
}
const REACH = 30; // mm along the normal, each way
const STEP = 0.25; // mm between probes on the cut
const ON = 0.25; // a stroke is under a probe within this, mm
const NEST_GAP = 15; // strokes of one nest follow one another within this, mm
const EVERY = 8; // mm between cuts along the outline
type Row = {
  piece: string;
  set: string;
  size: string;
  ok: boolean;
  cuts: number; // cuts where the outline sits on a size stroke
  full: number; // …and the nest is fully drawn there
  fullAgree: number; // …and the order names this size
  against: number; // cuts where the order contradicts this size (a > i or i > N − 1 − b)
  againstRunMm: number; // the longest stretch of consecutive contradicting cuts, mm
  byHowMuch: number; // the largest contradiction, in sizes
};
const rows: Row[] = [];
for (const [dir, list] of jobs) {
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
  const rankOf = new Map(snap.ranks.map((r) => [r.label, r.rank]));
  const L = walkLines(snap.fields.chains, snap.fields.run);
  const ranks = [...L.bySize.keys()].sort((a, b) => a - b);
  const N = ranks.length;
  if (N < 3) continue;
  const hit = (m: PtMm) => {
    let any = false;
    L.grid.near(m, ON, (o, i) => {
      if (!any && segNearest(m, L.lines[o][i], L.lines[o][i + 1]).d <= ON) any = true;
    });
    return any;
  };
  for (const p of list)
    for (const z of p.sizes) {
      const rank = rankOf.get(z.size);
      if (rank === undefined || (z.verdict !== 'ok' && z.verdict !== 'bad')) continue;
      const idx = ranks.indexOf(rank);
      const pts: PtMm[] = [];
      for (let k = 0; k + 1 < z.outer.length; k += 2)
        pts.push({ x: z.outer[k], y: z.outer[k + 1] });
      if (pts.length < 4 || idx < 0) continue;
      const row: Row = {
        piece: p.id,
        set: p.set,
        size: z.size,
        ok: z.verdict === 'ok',
        cuts: 0,
        full: 0,
        fullAgree: 0,
        against: 0,
        againstRunMm: 0,
        byHowMuch: 0,
      };
      const flip = signedArea(pts) < 0 ? -1 : 1;
      let run = 0;
      let carry = 0;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const t0 = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
        for (let s = carry; s < len; s += EVERY) {
          const q = { x: a.x + t0.x * s, y: a.y + t0.y * s };
          // the normal that points OUT of the outline
          let n = { x: t0.y * flip, y: -t0.x * flip };
          if (pointInPoly({ x: q.x + n.x * 0.7, y: q.y + n.y * 0.7 }, pts))
            n = { x: -n.x, y: -n.y };
          // strokes along the cut: runs of probes with a size line under them
          const strokes: number[] = [];
          let from: number | null = null;
          for (let t = -REACH; t <= REACH + 1e-9; t += STEP) {
            const on = hit({ x: q.x + n.x * t, y: q.y + n.y * t });
            if (on && from === null) from = t;
            if (!on && from !== null) {
              strokes.push((from + t - STEP) / 2);
              from = null;
            }
          }
          if (from !== null) strokes.push((from + REACH) / 2);
          const self = strokes.findIndex((t) => Math.abs(t) <= 0.6);
          if (self < 0) {
            run = 0;
            continue;
          }
          row.cuts++;
          let inside = 0;
          for (let j = self - 1; j >= 0 && strokes[j + 1] - strokes[j] <= NEST_GAP; j--) inside++;
          let outside = 0;
          for (let j = self + 1; j < strokes.length && strokes[j] - strokes[j - 1] <= NEST_GAP; j++)
            outside++;
          const lo = inside;
          const hi = N - 1 - outside;
          if (inside + outside + 1 === N) {
            row.full++;
            if (inside === idx) row.fullAgree++;
          }
          if (idx < lo || idx > hi) {
            row.against++;
            run += EVERY;
            row.againstRunMm = Math.max(row.againstRunMm, run);
            row.byHowMuch = Math.max(row.byHowMuch, idx < lo ? lo - idx : idx - hi);
          } else run = 0;
        }
        carry = (carry - len) % EVERY;
        if (carry < 0) carry += EVERY;
      }
      rows.push(row);
    }
}
if (outPath) writeFileSync(outPath, JSON.stringify(rows));
for (const set of ['tune', 'confirm'])
  for (const ok of [true, false]) {
    const g = rows.filter((r) => r.set === set && r.ok === ok);
    const sum = (f: (r: Row) => number) => g.reduce((a, r) => a + f(r), 0);
    console.log(
      `${set.padEnd(7)} ${ok ? 'ok ' : 'bad'} · ${g.length} sizes · cuts on a size stroke ${sum((r) => r.cuts)} · nest fully drawn ${sum((r) => r.full)} (order names this size in ${sum((r) => r.fullAgree)}) · order AGAINST the size ${sum((r) => r.against)} cuts`,
    );
    for (const mm of [16, 24, 40])
      console.log(
        `          sizes with a stretch ≥ ${mm} mm against the order: ${g.filter((r) => r.againstRunMm >= mm).length} of ${g.length}`,
      );
  }
