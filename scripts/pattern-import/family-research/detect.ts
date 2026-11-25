// Jump detector, blind to verdicts: a size whose outline breaks the grading of its drawn neighbours.
// flag = p95 distance from the neighbours' interpolation > half the gap to the nearer neighbour.
import { readFileSync } from 'node:fs';
import { idx, unflat, predictC, cloudToRingFast, ringDistance, type P } from './lib';
const ref = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const tally = { okFlag: 0, okPass: 0, badFlag: 0, badPass: 0, noCall: 0 };
for (const p of ref) {
  const all = p.sizes.map((z: any) => ({ s: z.size, i: idx(z.size), v: z.verdict, r: unflat(z.outer) as P[] }));
  const line: string[] = [];
  for (let k = 0; k < all.length; k++) {
    const t = all[k];
    // two drawn neighbours: one each side, else two on one side (extrapolation)
    const [A, B] = k > 0 && k < all.length - 1 ? [all[k - 1], all[k + 1]] : k === 0 ? [all[1], all[2]] : [all[k - 2], all[k - 1]];
    if (!A || !B) { tally.noCall++; continue; }
    const pr = predictC(A.r, B.r, (t.i - A.i) / (B.i - A.i));
    if (!pr) { tally.noCall++; line.push(t.s + '?'); continue; }
    const d = cloudToRingFast(pr, t.r).p95;
    const half = 0.5 * Math.min(ringDistance(t.r, A.r).max, ringDistance(t.r, B.r).max);
    const flag = d > half;
    tally[(t.v === 'ok' ? 'ok' : 'bad') + (flag ? 'Flag' : 'Pass') as keyof typeof tally]++;
    line.push(`${t.s}${t.v === 'bad' ? '✗' : ''}${flag ? '⚑' : ''}`);
  }
  console.log(p.id.padEnd(11), line.join(' '));
}
console.log(tally);
