// Jogs along the owner's reference outlines: a short step sideways — two sharp turns of opposite
// sense a few millimetres apart, with a long straight run before and after. The outline leaves
// one line for the next and goes on parallel: the fill's jump onto another stroke at small scale.
//   npx vite-node scripts/pattern-import/diag/ref-jogs.ts <reference.json> [maxStepMm=8] [minTurnDeg=30]
// Needs no snapshot: geometry of the outlines only.
import { readFileSync } from 'node:fs';

import { simplify } from 'lib/pattern-import/pieces/geom';
import type { PtMm } from 'lib/pattern-import/types';

const [refPath, stepArg, turnArg] = process.argv.slice(2);
const MAX_STEP = +(stepArg ?? 8);
const MIN_TURN = (+(turnArg ?? 30) * Math.PI) / 180;
const LEG = 10;
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces: {
  id: string;
  set: string;
  sizes: { size: string; verdict: string; outer: number[] }[];
}[] = Array.isArray(raw) ? raw : raw.pieces;
export function jogsOf(outer: PtMm[]): { at: PtMm; stepMm: number }[] {
  const s = simplify([...outer, outer[0]], 0.3).slice(0, -1);
  const n = s.length;
  if (n < 5) return [];
  const turn: number[] = [];
  const leg: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = s[(i - 1 + n) % n];
    const b = s[i];
    const c = s[(i + 1) % n];
    let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    turn.push(d);
    leg.push(Math.hypot(c.x - b.x, c.y - b.y));
  }
  const out: { at: PtMm; stepMm: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(turn[i]) < MIN_TURN || leg[(i - 1 + n) % n] < LEG) continue;
    // the next sharp turn, within the step
    let acc = 0;
    for (let k = 1; k < n; k++) {
      const j = (i + k) % n;
      acc += leg[(j - 1 + n) % n];
      if (acc > MAX_STEP) break;
      if (Math.abs(turn[j]) < MIN_TURN) continue;
      // opposite sense, back to about the direction it came in, and a long run after
      if (
        Math.sign(turn[j]) !== Math.sign(turn[i]) &&
        Math.abs(turn[i] + turn[j]) < Math.PI / 6 &&
        leg[j] >= LEG
      )
        out.push({ at: s[i], stepMm: +acc.toFixed(1) });
      break;
    }
  }
  return out;
}
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
        `${p.id}:${z.size} ${z.verdict} [${p.set}] ${j.map((x) => `${x.stepMm} mm at ${x.at.x.toFixed(0)},${x.at.y.toFixed(0)}`).join(' · ')}`,
      );
    }
  }
for (const [k, v] of Object.entries(t).sort())
  console.log(`${k.padEnd(12)} sizes ${v.sizes} · with a jog ${v.withJog} · jogs ${v.jogs}`);
if (process.env.LIST) console.log(lines.join('\n'));
