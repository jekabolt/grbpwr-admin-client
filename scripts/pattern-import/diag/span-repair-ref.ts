// Mending ONE stretch of an outline: a jog is found (`jogsOf`), two points of the outline that lie
// firmly on the size's lines are taken either side of it, and the stretch between them is replaced
// by the path over the printed lines (`spanPath`). No closed walk is needed. Measured on the
// owner's reference outlines, which are the fill's own.
//   npx vite-node scripts/pattern-import/diag/span-repair-ref.ts <reference.json> <clone with .runs> [dump dir]
// Per jog: mended (a path was found and the jog is gone) · no anchor (the outline is on no line
// of the size within reach) · no path · still a jog. Where the whole walk also closes, the mended
// stretch is held against it: the two were built differently and should agree.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { bboxOf, segNearest } from 'lib/pattern-import/pieces/geom';
import {
  jogsOf,
  sharedStretches,
  spanPath,
  WALK,
  walkLines,
  walkOutline,
} from 'lib/pattern-import/pieces/walk';
import type { ChainSet, PtMm, SizeRun } from 'lib/pattern-import/types';

type RefPiece = {
  id: string;
  root: string;
  file: string;
  set: string;
  sizes: { size: string; verdict: string; outer: number[]; note?: string }[];
};
const [refPath, base, dumpDir] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces: RefPiece[] = Array.isArray(raw) ? raw : raw.pieces;
const jobs = new Map<string, RefPiece[]>();
for (const p of pieces) {
  const root = `${base}/${p.root}`;
  const dir = existsSync(root) ? readdirSync(root).find((d) => d.includes(p.file)) : undefined;
  if (!dir || !readdirSync(`${root}/${dir}`).some((x) => x.endsWith('.snap.gz'))) continue;
  jobs.set(`${root}/${dir}`, [...(jobs.get(`${root}/${dir}`) ?? []), p]);
}
const RUN = 10; // mm of outline on the size's lines that make an anchor
const KEEP_OFF = 3; // mm between a jog and the nearest anchor sample
const REACH = 300; // mm searched for an anchor each way
const toPoly = (q: PtMm, poly: PtMm[]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++)
    d = Math.min(d, segNearest(q, poly[i], poly[(i + 1) % poly.length]).d);
  return d;
};
/** Jogs counted with half the usual turn: 15°. */
const fine = (pts: PtMm[]) => {
  const was = WALK.jogTurnRad;
  WALK.jogTurnRad = Math.PI / 12;
  const n = jogsOf(pts).length;
  WALK.jogTurnRad = was;
  return n;
};
const t: Record<string, Record<string, number>> = {};
const bump = (k: string, f: string) => {
  t[k] ??= {};
  t[k][f] = (t[k][f] ?? 0) + 1;
};
if (dumpDir) mkdirSync(dumpDir, { recursive: true });
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
  if (!L.lines.length) continue;
  const dump: unknown[] = [];
  for (const p of list) {
    const sizes = p.sizes
      .filter((z) => (z.verdict === 'ok' || z.verdict === 'bad') && rankOf.has(z.size))
      .map((z) => {
        const pts: PtMm[] = [];
        for (let i = 0; i + 1 < z.outer.length; i += 2)
          pts.push({ x: z.outer[i], y: z.outer[i + 1] });
        return { z, rank: rankOf.get(z.size)!, pts };
      })
      .filter((x) => x.pts.length > 3);
    if (!sizes.length) continue;
    const all = bboxOf(sizes.flatMap((x) => x.pts));
    const box = {
      minX: all.minX - WALK.padMm,
      minY: all.minY - WALK.padMm,
      maxX: all.maxX + WALK.padMm,
      maxY: all.maxY + WALK.padMm,
    };
    let shared: PtMm[][] | null = null;
    for (const { z, rank, pts } of sizes) {
      const jogs = jogsOf(pts);
      if (!jogs.length) continue;
      const key = `${p.set} ${z.verdict}`;
      const own = L.bySize.get(rank) ?? [];
      shared ??= sharedStretches(L, box);
      // the outline sampled each millimetre, and whether each sample is on a line of this size
      // (its own, or a stretch four sizes share)
      const S: PtMm[] = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
        for (let q = 0; q < n; q++)
          S.push({ x: a.x + ((b.x - a.x) * q) / n, y: a.y + ((b.y - a.y) * q) / n });
      }
      const N = S.length;
      const on = S.map((m) => {
        const ranks = new Set<number>();
        L.grid.near(m, WALK.onOwnMm, (o, i) => {
          if (segNearest(m, L.lines[o][i], L.lines[o][i + 1]).d <= WALK.onOwnMm)
            ranks.add(L.rankOf[o]);
        });
        return ranks.has(rank) || ranks.size >= WALK.sharedSizes;
      });
      const b0 = bboxOf(pts);
      const w = own.length
        ? walkOutline(own, shared, box, { x: (b0.minX + b0.maxX) / 2, y: (b0.minY + b0.maxY) / 2 })
        : null;
      let mended = [...S];
      let any = false;
      for (const j of jogs) {
        bump(key, 'jogs');
        let i0 = 0;
        for (let k = 1; k < N; k++)
          if (
            Math.hypot(S[k].x - j.at.x, S[k].y - j.at.y) <
            Math.hypot(S[i0].x - j.at.x, S[i0].y - j.at.y)
          )
            i0 = k;
        // an anchor: the sample nearest the jog of the first RUN consecutive on-line samples
        const anchor = (dirn: 1 | -1, start: number) => {
          let run = 0;
          for (let s = 0; s < REACH; s++) {
            const k = (((start + dirn * s) % N) + N) % N;
            run = on[k] ? run + 1 : 0;
            if (run >= RUN) return (((k - dirn * (RUN - 1)) % N) + N) % N;
          }
          return -1;
        };
        const ia = anchor(-1, i0 - KEEP_OFF);
        const ib = anchor(1, i0 + Math.ceil(j.stepMm) + KEEP_OFF);
        if (ia < 0 || ib < 0) {
          bump(key, 'noAnchor');
          continue;
        }
        const arc = (((ib - ia) % N) + N) % N;
        const unit = (k: number): PtMm => {
          const p0 = S[(((k - 2) % N) + N) % N];
          const p1 = S[(k + 2) % N];
          const d = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
          return { x: (p1.x - p0.x) / d, y: (p1.y - p0.y) / d };
        };
        const path = spanPath(own, shared, box, S[ia], S[ib], 2 * arc + 40, {
          a: unit(ia),
          b: unit(ib),
        });
        if (!path) {
          bump(key, 'noPath');
          continue;
        }
        // the outline with the stretch ia → ib replaced
        const rest: PtMm[] = [];
        for (let k = ib; k !== ia; k = (k + 1) % N) rest.push(S[k]);
        const next = [...path.pts, ...rest];
        // judged by a finer measure than the one that found the jog: a step of half the turn
        // left in the mended outline is still a step
        if (fine(next) >= fine(mended)) {
          bump(key, 'stillJog');
          continue;
        }
        bump(key, 'mended');
        const moved = Math.max(...path.pts.map((q) => toPoly(q, pts)));
        bump(key, moved <= 1 ? 'moved≤1mm' : moved <= 3 ? 'moved1–3mm' : 'moved>3mm');
        if (w)
          bump(
            key,
            Math.max(...path.pts.map((q) => toPoly(q, w.outer))) <= 0.5
              ? 'agreesWithWalk'
              : 'differsFromWalk',
          );
        else bump(key, 'noWalkToCompare');
        mended = next;
        any = true;
      }
      if (any) {
        bump(key, 'sizesMended');
        dump.push({
          id: p.id,
          size: z.size,
          verdict: z.verdict,
          ref: pts.map((q) => [q.x, q.y]),
          walk: mended.map((q) => [+q.x.toFixed(3), +q.y.toFixed(3)]),
          jogs: jogs.map((j) => [j.at.x, j.at.y]),
        });
      }
    }
  }
  if (dumpDir && dump.length)
    writeFileSync(`${dumpDir}/${dir.split('/').pop()}.json`, JSON.stringify(dump));
}
for (const [k, v] of Object.entries(t).sort()) console.log(k.padEnd(12), JSON.stringify(v));
