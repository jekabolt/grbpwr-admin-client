// The GIS vocabulary of digitising defects (research-25nov.md, Round 2 §3) on the owner's
// reference outlines: does a sign separate the outlines judged bad from the verified ones?
//   npx vite-node scripts/pattern-import/diag/ref-defects.ts <reference.json>
// Geometry of the outlines only, no snapshot. Thresholds are the review's trial settings:
//   kickback  a vertex where the outline turns back on itself: directed turn > 150°
//   spike     a kickback whose way out runs back along its way in (within 0.5 mm) for ≥ 1 mm
//   jog       the product's own (`jogsOf`): a short step sideways
// Reported per sign and for their union, by part of the reference set.
import { readFileSync } from 'node:fs';

import { segNearest, simplify } from 'lib/pattern-import/pieces/geom';
import { jogsOf } from 'lib/pattern-import/pieces/walk';
import type { PtMm } from 'lib/pattern-import/types';

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const pieces: {
  id: string;
  set: string;
  sizes: { size: string; verdict: string; outer: number[] }[];
}[] = Array.isArray(raw) ? raw : raw.pieces;
function signs(outer: PtMm[]) {
  const s = simplify([...outer, outer[0]], 0.2).slice(0, -1);
  const n = s.length;
  let kickback = 0;
  let spike = 0;
  for (let i = 0; i < n; i++) {
    const a = s[(i - 1 + n) % n];
    const b = s[i];
    const c = s[(i + 1) % n];
    const la = Math.hypot(b.x - a.x, b.y - a.y);
    const lc = Math.hypot(c.x - b.x, c.y - b.y);
    if (la < 0.5 || lc < 0.5) continue;
    let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) <= (150 * Math.PI) / 180) continue;
    kickback++;
    // the way out along the way in: 1 mm past the tip, still within 0.5 mm of the incoming leg
    const out = {
      x: b.x + ((c.x - b.x) * Math.min(1, lc)) / lc,
      y: b.y + ((c.y - b.y) * Math.min(1, lc)) / lc,
    };
    if (lc >= 1 && la >= 1 && segNearest(out, a, b).d <= 0.5) spike++;
  }
  return { kickback, spike, jog: jogsOf(outer).length };
}
const t: Record<string, { n: number; kickback: number; spike: number; jog: number; any: number }> =
  {};
const list: string[] = [];
for (const p of pieces)
  for (const z of p.sizes) {
    if (z.verdict !== 'ok' && z.verdict !== 'bad') continue;
    const pts: PtMm[] = [];
    for (let k = 0; k + 1 < z.outer.length; k += 2) pts.push({ x: z.outer[k], y: z.outer[k + 1] });
    if (pts.length < 4) continue;
    const key = `${p.set} ${z.verdict}`;
    t[key] ??= { n: 0, kickback: 0, spike: 0, jog: 0, any: 0 };
    const g = signs(pts);
    t[key].n++;
    if (g.kickback) t[key].kickback++;
    if (g.spike) t[key].spike++;
    if (g.jog) t[key].jog++;
    if (g.kickback || g.jog) t[key].any++;
    if ((g.kickback || g.spike) && process.env.LIST)
      list.push(`${p.id}:${z.size} ${z.verdict} kickback ${g.kickback} spike ${g.spike}`);
  }
for (const [k, v] of Object.entries(t).sort())
  console.log(
    `${k.padEnd(12)} sizes ${String(v.n).padStart(3)} · kickback ${v.kickback} · spike ${v.spike} · jog ${v.jog} · kickback or jog ${v.any}`,
  );
if (list.length) console.log(list.join('\n'));
