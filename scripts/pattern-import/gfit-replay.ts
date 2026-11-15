// GFIT REPLAY — the dev loop for pieces/gfit (owner, 12 Nov 2026: "do the work, not the runs").
// A dxf-shot run with GFIT_PROBES=1 writes every repair try of a file as a replayable case
// (<shot>/<file>/probes.json: exactly `repairSize`'s input + what that run decided). This replays
// `repairSize` on those real cells with the CURRENT code in seconds and reports what changed.
//   npx vite-node scripts/pattern-import/gfit-replay.ts <shotDir> [--only <text>] [--drawn]
//     [--changed] [--out <replay.json>]
// --x-off: extrapolation off (the before side of an A/B on the same code). --drawn: only the tries the recorded run drew; --changed: print only the tries whose outcome
// moved; --out: the replayed rings (pred / outer / holes) per try, for the pictures.
// Judge a patch by replay-before vs replay-after on the same probes, not against the recorded
// verdicts: probes written before 12 Nov 17:30 are rounded to 0.01 mm and a try on a threshold
// can already differ (Leah F · 30). The hook's G15 / D-holes bounds are not replayed.
// Limits: it replays the repair ALONE. A change upstream (chains, corners, fill) needs new probes
// (a new dxf-shot); and an accepted repair changes the fill after it, which only a run shows.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GRADE_DRAW, type RepairProbe } from 'lib/pattern-import/pieces/gfit/repair-hook';
import { repairSize } from 'lib/pattern-import/pieces/gfit/repair';
import type { PtMm } from 'lib/pattern-import/types';

type Box = { minX: number; minY: number; maxX: number; maxY: number };
type Cell = { size: string; outcome: string; outer?: [number, number][] };
type Family = { label: string; cells: Cell[] };

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const shot = args.find((a, i) => !a.startsWith('--') && !['--only', '--out'].includes(args[i - 1]));
if (!shot) {
  console.error('usage: gfit-replay.ts <shotDir> [--only <text>] [--drawn] [--changed] [--out f]');
  process.exit(2);
}

const boxOf = (pts: readonly { x: number; y: number }[]): Box => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pts) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
};
const area = (b: Box) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
const iou = (a: Box, b: Box) => {
  const i = area({
    minX: Math.max(a.minX, b.minX),
    minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX),
    maxY: Math.min(a.maxY, b.maxY),
  });
  return i / (area(a) + area(b) - i || 1);
};

/** The piece a try belongs to: the family whose closed outlines overlap its anchors the most. */
const labelOf = (fams: Family[], p: RepairProbe): string => {
  const pb = boxOf(p.ins.flatMap((s) => s.outer));
  let best = '?';
  let bestV = 0.3;
  for (const f of fams) {
    const pts = f.cells.flatMap((c) => (c.outer ?? []).map(([x, y]) => ({ x, y })));
    if (!pts.length) continue;
    const v = iou(pb, boxOf(pts));
    if (v > bestV) [best, bestV] = [f.label, v];
  }
  return best;
};

const verdict = (strict: string[], draw: string[] | null) =>
  !strict.length ? 'repaired' : draw && !draw.length ? 'drawn' : 'refused';

const out: unknown[] = [];
const moved: Record<string, number> = {};
let total = 0;
const t0 = Date.now();
for (const name of readdirSync(shot).sort()) {
  const f = resolve(shot, name, 'probes.json');
  if (!existsSync(f)) continue;
  if (opt('--only') && !name.includes(opt('--only')!)) continue;
  const { card, probes } = JSON.parse(readFileSync(f, 'utf8')) as {
    card: string[];
    probes: RepairProbe[];
  };
  const cf = resolve(shot, name, 'cells.json');
  const fams: Family[] = existsSync(cf) ? JSON.parse(readFileSync(cf, 'utf8')) : [];
  for (const p of probes) {
    if (flag('--drawn') && !p.drawn) continue;
    total++;
    const base = { tol: p.tol, frame: 'stacked' as const, fast: true };
    const s = repairSize(p.ins, p.rank, p.walls, base);
    const strict = s.refusals.slice();
    // the hook tries the draw only when the strict fill refused and a model exists
    const d =
      strict.length && !strict.includes('no-model')
        ? repairSize(p.ins, p.rank, p.walls, {
            ...base,
            draw: { maxShare: GRADE_DRAW.maxShare, extrapolate: !flag('--x-off') },
          })
        : null;
    // the hook's own bounds on top (G15 / D-holes) are not replayed: a moved verdict says so
    const was = verdict(p.strict, p.draw);
    const now = verdict(strict, d ? d.refusals : null);
    const label = labelOf(fams, p);
    const size = card[p.rank] ?? `r${p.rank}`;
    if (was !== now) moved[`${was} → ${now}`] = (moved[`${was} → ${now}`] ?? 0) + 1;
    if (!flag('--changed') || was !== now)
      console.log(
        `${was === now ? ' ' : '*'} ${name.slice(0, 34).padEnd(34)} ${label.slice(0, 28).padEnd(28)} ${size.padStart(6)}  ${was.padEnd(8)} → ${now.padEnd(8)} ${d ? d.refusals.join(',') : strict.join(',')}`,
      );
    const rep = d ?? s;
    out.push({
      file: name,
      label,
      size,
      seed: p.seed,
      rank: p.rank,
      was,
      now,
      strict,
      draw: d ? d.refusals : null,
      pred: rep.pred,
      outer: rep.outer,
      holes: rep.holes.map((h) => h.pts),
      anchors: p.ins.map((x) => ({ rank: x.rank, outer: x.outer as PtMm[] })),
    });
  }
}
console.log(
  `\n${total} tries in ${((Date.now() - t0) / 1000).toFixed(1)} s · moved ${JSON.stringify(moved)}`,
);
const o = opt('--out');
if (o) writeFileSync(o, JSON.stringify(out));
