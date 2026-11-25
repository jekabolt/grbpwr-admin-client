// What the sizes step shows: the outlines every size closes by the walk alone, before any fill
// (`walkedSizes`), on recorded sheets. Per file: the time, the pieces and outlines found, and how
// they sit against the fill's closed outlines of the same recording (within 1 mm / farther / the
// fill has none there).
// BUDGET=<ms> gives the walk the product's time budget (default: none).
//   npx vite-node scripts/pattern-import/diag/sizes-walk.ts <clone with .runs> <text in the file name>…
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { proposeSeeds } from 'lib/pattern-import/pieces';
import { pointInPoly, segNearest } from 'lib/pattern-import/pieces/geom';
import { walkedSizes } from 'lib/pattern-import/pieces/walk';
import type { ChainSet, PtMm, Sheet, SizeRun } from 'lib/pattern-import/types';

const [base, ...only] = process.argv.slice(2);
const toPoly = (p: PtMm, poly: PtMm[]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++)
    d = Math.min(d, segNearest(p, poly[i], poly[(i + 1) % poly.length]).d);
  return d;
};
for (const root of ['.runs/snap-set40', '.runs/snap-holdout40']) {
  const dirRoot = `${base}/${root}`;
  if (!existsSync(dirRoot)) continue;
  for (const d of readdirSync(dirRoot)) {
    if (only.length && !only.some((o) => d.includes(o))) continue;
    const dir = `${dirRoot}/${d}`;
    const snapFile = readdirSync(dir)
      .filter((x) => x.endsWith('.snap.gz'))
      .sort()
      .pop();
    if (!snapFile || !existsSync(`${dir}/cells.json`)) continue;
    const snap = deserialize(gunzipSync(readFileSync(`${dir}/${snapFile}`))) as {
      fields: { chains: ChainSet; run: SizeRun; sheet: Sheet };
      ranks: { rank: number; label: string }[];
    };
    const { chains, run, sheet } = snap.fields;
    const seeds = proposeSeeds(sheet, chains);
    const t0 = Date.now();
    const { byRank, partial } = walkedSizes(chains, run, seeds, +(process.env.BUDGET ?? Infinity));
    const ms = Date.now() - t0;
    const rankOf = new Map(snap.ranks.map((r) => [r.label, r.rank]));
    const cells: { cells: { size: string; outcome: string; outer?: [number, number][] }[] }[] =
      JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8'));
    const fill: { rank: number; outer: PtMm[] }[] = [];
    let fillOpen = 0;
    for (const f of cells)
      for (const c of f.cells) {
        const rank = rankOf.get(c.size);
        if (rank === undefined) continue;
        if (c.outcome === 'closed' && c.outer)
          fill.push({ rank, outer: c.outer.map(([x, y]) => ({ x, y })) });
        else fillOpen++;
      }
    let n = 0;
    let same = 0;
    let off = 0;
    let alone = 0;
    for (const [rank, outs] of byRank)
      for (const o of outs) {
        n++;
        // the fill's outline of this size round the same place
        const inside = o[0];
        const twin = fill.find(
          (f) => f.rank === rank && (pointInPoly(inside, f.outer) || toPoly(inside, f.outer) < 5),
        );
        if (!twin) {
          alone++;
          continue;
        }
        let worst = 0;
        for (let i = 0; i < o.length; i += Math.max(1, o.length >> 7))
          worst = Math.max(worst, toPoly(o[i], twin.outer));
        if (worst <= 1) same++;
        else off++;
      }
    console.log(
      `${d.slice(0, 44).padEnd(44)} ${String(ms).padStart(6)} ms${partial ? ' PARTIAL' : ''} · labels ${seeds.length} · sizes ${run.sizes.length} · walked ${n} (fill closed ${fill.length}, open ${fillOpen}) · as the fill ≤1 mm ${same} · differs ${off} · fill has none ${alone}`,
    );
  }
}
