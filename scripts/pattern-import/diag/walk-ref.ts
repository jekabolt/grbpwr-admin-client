// The product walk (`pieces/walk.ts`) against the owner's verified outlines: per size, how far the
// walk's outline is from the verified one. The walk draws nothing, so a size with a gap in its
// line has no walk here (the diag walker `walk-carry.mjs` carries such a gap from a neighbour).
//   npx vite-node scripts/pattern-import/diag/walk-ref.ts <reference.json> <snapshot dir> <piece id> […]
import { readdirSync, readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { bboxOf } from 'lib/pattern-import/pieces/geom';
import {
  differs,
  outlineVerdict,
  sharedStretches,
  WALK,
  walkLines,
  walkOutline,
} from 'lib/pattern-import/pieces/walk';
import type { ChainSet, PtMm, SizeRun } from 'lib/pattern-import/types';

const [refPath, dir, ...ids] = process.argv.slice(2);
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
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces: {
  id: string;
  label: string;
  sizes: { size: string; verdict: string; outer: number[] }[];
}[] = Array.isArray(raw) ? raw : raw.pieces;
const L = walkLines(snap.fields.chains, snap.fields.run);
const far = (a: PtMm[], b: PtMm[]) => {
  // the largest distance from a to b, by the same sampling as the check
  let mx = 0;
  for (let k = 0; k < a.length; k++) {
    const p = a[k];
    const q = a[(k + 1) % a.length];
    const n = Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y)));
    for (let t = 0; t < n; t++) {
      const m = { x: p.x + ((q.x - p.x) * (t + 0.5)) / n, y: p.y + ((q.y - p.y) * (t + 0.5)) / n };
      let d = Infinity;
      for (let i = 0; i < b.length; i++) {
        const u = b[i];
        const v = b[(i + 1) % b.length];
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const LL = dx * dx + dy * dy;
        const w = LL ? Math.max(0, Math.min(1, ((m.x - u.x) * dx + (m.y - u.y) * dy) / LL)) : 0;
        d = Math.min(d, Math.hypot(m.x - u.x - w * dx, m.y - u.y - w * dy));
      }
      mx = Math.max(mx, d);
    }
  }
  return mx;
};
const t = {
  sizes: 0,
  noLine: 0,
  noWalk: 0,
  le1: 0,
  le3: 0,
  gt3: 0,
  flagged: 0,
  takesWalk: 0,
  takesFill: 0,
  cannotTell: 0,
};
const t0 = Date.now();
for (const id of ids) {
  const p = pieces.find((x) => x.id === id);
  if (!p) throw new Error(`no piece ${id}`);
  const ok = p.sizes
    .filter((z) => z.verdict === 'ok' && rankOf.has(z.size))
    .map((z) => {
      const pts: PtMm[] = [];
      for (let i = 0; i + 1 < z.outer.length; i += 2)
        pts.push({ x: z.outer[i], y: z.outer[i + 1] });
      return { size: z.size, rank: rankOf.get(z.size)!, pts };
    });
  if (!ok.length) continue;
  const all = bboxOf(ok.flatMap((z) => z.pts));
  const box = {
    minX: all.minX - WALK.padMm,
    minY: all.minY - WALK.padMm,
    maxX: all.maxX + WALK.padMm,
    maxY: all.maxY + WALK.padMm,
  };
  const shared = sharedStretches(L, box);
  console.log(`== ${id} (${p.label}) · shared stretches ${shared.length}`);
  for (const z of ok) {
    t.sizes++;
    const own = L.bySize.get(z.rank);
    if (!own?.length) {
      t.noLine++;
      console.log(`${z.size.padEnd(5)} no own line`);
      continue;
    }
    const b = bboxOf(z.pts);
    const w = walkOutline(own, shared, box, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
    if (!w) {
      t.noWalk++;
      console.log(`${z.size.padEnd(5)} no closed walk`);
      continue;
    }
    const mx = Math.max(far(w.outer, z.pts), far(z.pts, w.outer));
    t[mx <= 1 ? 'le1' : mx <= 3 ? 'le3' : 'gt3']++;
    const flag = differs(w.outer, z.pts) ?? differs(z.pts, w.outer);
    // the verified outline stands for the fill's: a verdict for the walk here is a FALSE replacement
    const v = flag ? outlineVerdict(L, z.rank, w.outer, z.pts) : undefined;
    if (flag) {
      t.flagged++;
      t[v?.take === 'walk' ? 'takesWalk' : v?.take === 'fill' ? 'takesFill' : 'cannotTell']++;
    }
    const per = w.ownMm + w.sharedMm || 1;
    console.log(
      `${z.size.padEnd(5)} own ${String(Math.round((100 * w.ownMm) / per)).padStart(3)}% · corners ${w.corners} · max ${mx.toFixed(2).padStart(6)} mm${flag ? ` · WOULD BE SHOWN (${flag.maxMm.toFixed(1)} mm over ${Math.round(flag.overMm)} mm) → ${v ? `TAKES THE ${v.take.toUpperCase()}${v.viaBlock ? ' (block)' : ''}` : 'cannot tell'}` : ''}`,
    );
  }
}
console.log(JSON.stringify(t), `${Date.now() - t0} ms`);
