// Jogs along the owner's reference outlines: a short step sideways — two sharp turns of opposite
// sense a few millimetres apart, with a long straight run before and after. The outline leaves
// one line for the next and goes on parallel: the fill's jump onto another stroke at small scale.
//   npx vite-node scripts/pattern-import/diag/ref-jogs.ts <reference.json> [maxStepMm=8] [minTurnDeg=30]
// Needs no snapshot: geometry of the outlines only.
import { readFileSync } from 'node:fs';

import { jogsOf, WALK } from 'lib/pattern-import/pieces/walk';
import type { PtMm } from 'lib/pattern-import/types';

const [refPath, stepArg, turnArg] = process.argv.slice(2);
if (stepArg) WALK.jogStepMm = +stepArg;
if (turnArg) WALK.jogTurnRad = (+turnArg * Math.PI) / 180;
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces: {
  id: string;
  set: string;
  sizes: { size: string; verdict: string; outer: number[] }[];
}[] = Array.isArray(raw) ? raw : raw.pieces;
const t: Record<string, { sizes: number; withJog: number; jogs: number }> = {};
const lines: string[] = [];
for (const p of pieces)
  for (const z of p.sizes) {
    if (z.verdict !== 'ok' && z.verdict !== 'bad') continue;
    const pts: PtMm[] = [];
    for (let k = 0; k + 1 < z.outer.length; k += 2) pts.push({ x: z.outer[k], y: z.outer[k + 1] });
    if (pts.length < 4) continue;
    const key = `${p.set} ${z.verdict}`;
    t[key] ??= { sizes: 0, withJog: 0, jogs: 0 };
    const j = jogsOf(pts);
    t[key].sizes++;
    t[key].jogs += j.length;
    if (j.length) {
      t[key].withJog++;
      lines.push(
        `${p.id}:${z.size} ${z.verdict} [${p.set}] ${j.map((x) => `${x.stepMm.toFixed(1)} mm at ${x.at.x.toFixed(0)},${x.at.y.toFixed(0)}`).join(' · ')}`,
      );
    }
  }
for (const [k, v] of Object.entries(t).sort())
  console.log(`${k.padEnd(12)} sizes ${v.sizes} · with a jog ${v.withJog} · jogs ${v.jogs}`);
if (process.env.LIST) console.log(lines.join('\n'));
