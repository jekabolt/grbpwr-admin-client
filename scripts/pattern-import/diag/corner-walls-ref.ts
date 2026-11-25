// Would closing each size's corners BEFORE the fill help? Measured on the owner's reference set,
// without running the fill.
//   npx vite-node scripts/pattern-import/diag/corner-walls-ref.ts <reference.json> <clone with .runs> [--set tune|confirm]
// `cornerWalls` (pieces/walk.ts) lists the corners the lines of one size build on their own: two
// sides that stop short of the point they meet in. Given to the fill as walls of that size they
// would stop it leaking through the corner. Counted per reference outline: the walls whose two
// printed ends are on the outline (it runs along both sides of that corner), and of them those
// whose corner point is more than 1 mm off the outline — a wall that would have moved it:
// - on a size judged bad: the wall stands where the outline cut or left the corner (help);
// - on a verified (ok) size: either the wall is wrong, or the verified outline is itself more
//   than 1 mm off its corner there (to be looked at, one by one).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { bboxOf } from 'lib/pattern-import/pieces/geom';
import { cornerWalls, sharedStretches, WALK, walkLines } from 'lib/pattern-import/pieces/walk';
import type { ChainSet, PtMm, SizeRun } from 'lib/pattern-import/types';

type RefPiece = {
  id: string;
  root: string;
  file: string;
  label: string;
  set: string;
  sizes: { size: string; verdict: string; outer: number[] }[];
};
const [refPath, base, flag, only] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces: RefPiece[] = Array.isArray(raw) ? raw : raw.pieces;
const jobs = new Map<string, RefPiece[]>();
for (const p of pieces) {
  if (flag === '--set' && p.set !== only) continue;
  const root = `${base}/${p.root}`;
  const dir = existsSync(root) ? readdirSync(root).find((d) => d.includes(p.file)) : undefined;
  if (!dir || !readdirSync(`${root}/${dir}`).some((x) => x.endsWith('.snap.gz'))) continue;
  jobs.set(`${root}/${dir}`, [...(jobs.get(`${root}/${dir}`) ?? []), p]);
}
const toOutline = (q: PtMm, outer: PtMm[]) => {
  let d = Infinity;
  for (let i = 0; i < outer.length; i++) {
    const u = outer[i];
    const v = outer[(i + 1) % outer.length];
    const dx = v.x - u.x;
    const dy = v.y - u.y;
    const LL = dx * dx + dy * dy;
    const w = LL ? Math.max(0, Math.min(1, ((q.x - u.x) * dx + (q.y - u.y) * dy) / LL)) : 0;
    d = Math.min(d, Math.hypot(q.x - u.x - w * dx, q.y - u.y - w * dy));
  }
  return d;
};
/**
 * The walls this outline has to do with: both printed ends of the wall are ON the outline (1 mm),
 * so the outline runs along both sides of that corner. `off` = how far the outline passes from
 * the corner point itself: within 1 mm the wall and the outline agree, farther the wall would
 * have moved the outline there.
 */
const wallsOn = (outer: PtMm[], walls: ReturnType<typeof cornerWalls>) =>
  walls
    .filter((w) => toOutline(w.a, outer) <= 1 && toOutline(w.b, outer) <= 1)
    .map((w) => ({ ...w, off: toOutline(w.at, outer) }));
const tally = () => ({
  ok: 0,
  okWallsOn: 0,
  okWallsAgree: 0,
  okSizesMoved: 0,
  bad: 0,
  badWallsOn: 0,
  badWallsAgree: 0,
  badSizesMoved: 0,
  okHalfWalls: 0,
  okSizesHalf: 0,
  badHalfWalls: 0,
  badSizesHalf: 0,
});
const bySet = new Map<string, ReturnType<typeof tally>>();
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
  for (const p of list) {
    const t = bySet.get(p.set) ?? tally();
    bySet.set(p.set, t);
    const sizes = p.sizes
      .filter((z) => (z.verdict === 'ok' || z.verdict === 'bad') && rankOf.has(z.size))
      .map((z) => {
        const pts: PtMm[] = [];
        for (let i = 0; i + 1 < z.outer.length; i += 2)
          pts.push({ x: z.outer[i], y: z.outer[i + 1] });
        return { size: z.size, rank: rankOf.get(z.size)!, pts, ok: z.verdict === 'ok' };
      })
      .filter((z) => z.pts.length > 3);
    if (!sizes.length) continue;
    const all = bboxOf(sizes.flatMap((z) => z.pts));
    const box = {
      minX: all.minX - WALK.padMm,
      minY: all.minY - WALK.padMm,
      maxX: all.maxX + WALK.padMm,
      maxY: all.maxY + WALK.padMm,
    };
    const shared = sharedStretches(L, box);
    const rows: string[] = [];
    for (const z of sizes) {
      const walls = cornerWalls(L.bySize.get(z.rank) ?? [], shared, box);
      const on = wallsOn(z.pts, walls);
      const moved = on.filter((w) => w.off > 1);
      // a wall with ONE printed end on the outline and the other off it: the outline runs along
      // one side of that corner and leaves before the other — where a jump onto another line is
      const half = walls.filter((w) => {
        const [da, db] = [toOutline(w.a, z.pts), toOutline(w.b, z.pts)];
        return Math.min(da, db) <= 1 && Math.max(da, db) > 1 && Math.max(da, db) <= 15;
      });
      t[z.ok ? 'okHalfWalls' : 'badHalfWalls'] += half.length;
      if (half.length) t[z.ok ? 'okSizesHalf' : 'badSizesHalf']++;
      t[z.ok ? 'ok' : 'bad']++;
      t[z.ok ? 'okWallsOn' : 'badWallsOn'] += on.length;
      t[z.ok ? 'okWallsAgree' : 'badWallsAgree'] += on.length - moved.length;
      if (moved.length) {
        t[z.ok ? 'okSizesMoved' : 'badSizesMoved']++;
        rows.push(
          `${z.size.padEnd(5)} ${z.ok ? 'ok ' : 'bad'} ${moved.length} of ${on.length} corner walls on it would move it · by ${moved.map((w) => w.off.toFixed(1)).join(' ')} mm · gaps ${moved.map((w) => w.gapMm.toFixed(1)).join(' ')} mm · at ${moved.map((w) => `${w.at.x.toFixed(0)},${w.at.y.toFixed(0)}`).join(' ')}`,
        );
      }
    }
    if (rows.length) console.log(`== ${p.id} [${p.set}] (${p.label})\n${rows.join('\n')}`);
  }
}
for (const [set, t] of bySet) console.log(set, JSON.stringify(t));
