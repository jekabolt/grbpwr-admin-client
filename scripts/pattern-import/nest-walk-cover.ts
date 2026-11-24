// NEST WALK COVER — what the walk's outline of each open cell actually lies on.
//   npx vite-node scripts/pattern-import/nest-walk-cover.ts <shot>/<file> --dump <dir> [--only <letter>]
// <shot>/<file>: a dxf-shot output (cells.json). <dir>: NEST_WALK_DUMP=<dir> of the same run
// (seed<seed>.json = the walk's exact input). For every cell the walk built that the run left
// open, the outline is resampled every 1 mm and each sample classified, first match wins:
//   own    ≤ 1 mm from a line of this size
//   common ≤ 1 mm from a common line
//   other  ≤ 1 mm from a line of another size (which sizes, samples ≈ mm)
//   none   nothing within 1 mm (truly derived)
// next to the walk's own derived share (b.derivedMm / perimeter) and the walk's own refusal
// ('accepted' = nestWalk built it; the pipeline may still refuse it in repair-hook — drawMaxShare,
// crosses-own-line — and that verdict is in cells.json).
// Why (18 Nov 2026): the walk refused A18 / C18 / B24 at 38–76 % derived while 89–98 % of their
// outline lay on own + common lines — the derived count must follow `none`, not how a point was made.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { nestWalk, type NestSizeIn } from 'lib/pattern-import/pieces/gfit/nest-walk';
import { SegGrid, segNearest } from 'lib/pattern-import/pieces/geom';
import { parseSizeToken } from 'lib/pattern-import/sizes/tokens';
import type { PtMm } from 'lib/pattern-import/types';

type Family = { seed: number; label: string | null; cells: { size: string; outcome: string }[] };
type Dump = { sizes: NestSizeIn[]; own: unknown[][]; common: unknown[] };

const TOL = 1.0;
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const dir = args.find((a, i) => !a.startsWith('--') && !['--dump', '--only'].includes(args[i - 1]));
const dumpDir = opt('--dump');
if (!dir || !dumpDir) {
  console.error('usage: nest-walk-cover.ts <shot>/<file> --dump <dir> [--only <letter>]');
  process.exit(2);
}
const only = opt('--only');

const ptsOf = (l: unknown): PtMm[] =>
  ((Array.isArray(l) ? l : (l as { pts: unknown[] }).pts) as unknown[]).map((p) =>
    Array.isArray(p) ? { x: p[0] as number, y: p[1] as number } : (p as PtMm),
  );
/** distance from p to the nearest of `lines` (Infinity beyond 2 mm) */
const distTo = (lines: PtMm[][]) => {
  const g = new SegGrid(3);
  lines.forEach((l, i) => g.addPolyline(i, l, false));
  return (p: PtMm) => {
    let best = Infinity;
    g.near(p, 2, (o, i) => {
      const l = lines[o];
      if (i + 1 < l.length) best = Math.min(best, segNearest(p, l[i], l[i + 1]).d);
    });
    return best;
  };
};
const resample = (ring: readonly PtMm[]) => {
  const out: PtMm[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let j = 0; j < m; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / m, y: a.y + ((b.y - a.y) * j) / m });
  }
  return out;
};

const fams: Family[] = JSON.parse(readFileSync(resolve(dir, 'cells.json'), 'utf8'));
for (const fam of fams) {
  if (only && !fam.label?.startsWith(only)) continue;
  const card = fam.cells.map((c) => c.size);
  const open = fam.cells.map((c, i) => (c.outcome === 'closed' ? -1 : i)).filter((i) => i >= 0);
  if (!open.length) continue;
  let d: Dump;
  try {
    d = JSON.parse(readFileSync(resolve(dumpDir, `seed${fam.seed}.json`), 'utf8'));
  } catch {
    console.log(`${fam.label}: no dump seed${fam.seed}.json`);
    continue;
  }
  const ownByRank = new Map(d.sizes.map((s, i) => [s.rank, (d.own[i] ?? []).map(ptsOf)]));
  const sizes = d.sizes.map((s, i) => ({
    ...s,
    step: s.step ?? parseSizeToken(card[i] ?? '')?.value ?? s.rank,
  }));
  const w = nestWalk({ sizes, own: (r) => ownByRank.get(r) ?? [], common: d.common.map(ptsOf) });
  console.log(`\n== ${fam.label}  etalon ${w.etalon == null ? `NONE (${w.why})` : card[w.etalon]}`);
  const common = distTo(d.common.map(ptsOf));
  const dist = new Map([...ownByRank].map(([r, ls]) => [r, distTo(ls)]));
  for (const r of open) {
    const b = w.sizes.get(r);
    if (!b?.outer) {
      console.log(`  ${card[r]}: not built ${b?.refused ?? ''}`);
      continue;
    }
    const ring = resample(b.outer);
    let own = 0;
    let com = 0;
    let other = 0;
    let none = 0;
    const who: Record<string, number> = {};
    for (const p of ring) {
      if ((dist.get(r)?.(p) ?? Infinity) <= TOL) own++;
      else if (common(p) <= TOL) com++;
      else {
        const hit = [...dist].find(([q, f]) => q !== r && f(p) <= TOL)?.[0];
        if (hit == null) none++;
        else {
          other++;
          who[card[hit]] = (who[card[hit]] ?? 0) + 1;
        }
      }
    }
    const n = ring.length;
    let per = 0;
    for (let i = 0; i < b.outer.length; i++) {
      const p = b.outer[i];
      const q = b.outer[(i + 1) % b.outer.length];
      per += Math.hypot(q.x - p.x, q.y - p.y);
    }
    const pc = (x: number) => `${((100 * x) / n).toFixed(0)}%`;
    const walk = per > 0 ? (100 * (b.derivedMm ?? 0)) / per : 0;
    const off = (100 * (other + none)) / n;
    console.log(
      `  ${card[r]}: walk derived ${walk.toFixed(0)}%` +
        ` | own ${pc(own)} common ${pc(com)} other ${pc(other)} ${JSON.stringify(who)} none ${pc(none)}` +
        ` | Δ ${(walk - off).toFixed(1)} pp` +
        ` | ${b.refused ?? 'accepted'}`,
    );
  }
}
