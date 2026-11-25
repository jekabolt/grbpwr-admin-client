// The product walk (`pieces/walk.ts`) against the owner's reference set.
//   npx vite-node scripts/pattern-import/diag/walk-ref.ts <reference.json> <snapshot dir> <piece id> […]
//   npx vite-node scripts/pattern-import/diag/walk-ref.ts <reference.json> --all <clone with .runs> [--set tune|confirm]
// Per verified (ok) size: how far the walk's outline is from the verified one, and — where the two
// would be shown as two outlines — which one `outlineVerdict` takes, the verified outline standing
// for the fill's and the verified outlines of the sizes next to it for its neighbours. A verdict
// for the WALK on an ok size is a false replacement: the number that must be 0.
// Per size judged bad: the reference outline IS the fill's bad one; a verdict for the walk is a
// repair the rule would make, a verdict for the fill a bad outline it would keep.
// The walk draws nothing, so a size with a gap in its line has no walk here.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { bboxOf } from 'lib/pattern-import/pieces/geom';
import {
  differs,
  farLineMm,
  outlineVerdict,
  sharedStretches,
  WALK,
  walkLines,
  walkOutline,
  whoseLine,
} from 'lib/pattern-import/pieces/walk';
import type { ChainSet, PtMm, SizeRun } from 'lib/pattern-import/types';

type RefPiece = {
  id: string;
  root: string;
  file: string;
  label: string;
  set: string;
  sizes: { size: string; verdict: string; outer: number[] }[];
};
// NEST_WIN / NEST_LOSE: try other shares for the verdict without touching the product's
if (process.env.NEST_WIN) WALK.nestToWin = +process.env.NEST_WIN;
if (process.env.NEST_LOSE) WALK.nestToLose = +process.env.NEST_LOSE;
const argv = process.argv.slice(2);
const refPath = argv[0];
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces: RefPiece[] = Array.isArray(raw) ? raw : raw.pieces;
const jobs = new Map<string, RefPiece[]>();
if (argv[1] === '--all') {
  const base = argv[2];
  const only = argv[3] === '--set' ? argv[4] : null;
  for (const p of pieces) {
    if (only && p.set !== only) continue;
    const root = `${base}/${p.root}`;
    const dir = existsSync(root) ? readdirSync(root).find((d) => d.includes(p.file)) : undefined;
    if (
      !dir ||
      !existsSync(`${root}/${dir}`) ||
      !readdirSync(`${root}/${dir}`).some((x) => x.endsWith('.snap.gz'))
    ) {
      console.log(`-- ${p.id}: no snapshot under ${p.root} for ${p.file}`);
      continue;
    }
    jobs.set(`${root}/${dir}`, [...(jobs.get(`${root}/${dir}`) ?? []), p]);
  }
} else {
  jobs.set(
    argv[1],
    argv.slice(2).map((id) => {
      const p = pieces.find((x) => x.id === id);
      if (!p) throw new Error(`no piece ${id}`);
      return p;
    }),
  );
}
const far = (a: PtMm[], b: PtMm[]) => {
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
const tally = () => ({
  ok: 0,
  okNoWalk: 0,
  okLe1: 0,
  okLe3: 0,
  okGt3: 0,
  okTwo: 0,
  okTakesWalk: 0,
  okTakesFill: 0,
  okCannot: 0,
  bad: 0,
  badNoWalk: 0,
  badSame: 0,
  badTakesWalk: 0,
  badTakesFill: 0,
  badCannot: 0,
  // by the line of a distant size (`farLineMm`): the outline rides one, the walk does not
  okFar: 0,
  okFarTakesWalk: 0,
  badFar: 0,
  badFarTakesWalk: 0,
  badFarNoWalk: 0,
  badFarSameWalk: 0,
});
const bySet = new Map<string, ReturnType<typeof tally>>();
const t0 = Date.now();
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
    const oks = sizes.filter((z) => z.ok);
    if (!oks.length) continue;
    const all = bboxOf(sizes.flatMap((z) => z.pts));
    const box = {
      minX: all.minX - WALK.padMm,
      minY: all.minY - WALK.padMm,
      maxX: all.maxX + WALK.padMm,
      maxY: all.maxY + WALK.padMm,
    };
    const shared = L.lines.length ? sharedStretches(L, box) : [];
    console.log(`== ${p.id} [${p.set}] (${p.label})`);
    for (const z of sizes) {
      t[z.ok ? 'ok' : 'bad']++;
      const far0 = L.lines.length ? farLineMm(L, z.rank, z.pts) >= WALK.farLineMm : false;
      if (far0) t[z.ok ? 'okFar' : 'badFar']++;
      const own = L.bySize.get(z.rank);
      const b = bboxOf(z.pts);
      const w = own?.length
        ? walkOutline(own, shared, box, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 })
        : null;
      if (!w) {
        t[z.ok ? 'okNoWalk' : 'badNoWalk']++;
        if (far0 && !z.ok) t.badFarNoWalk++;
        continue;
      }
      const mx = Math.max(far(w.outer, z.pts), far(z.pts, w.outer));
      const two = differs(w.outer, z.pts) ?? differs(z.pts, w.outer);
      // the neighbours: the nearest VERIFIED sizes below and above
      const below = oks.filter((o) => o.rank < z.rank).sort((x, y) => y.rank - x.rank)[0];
      const above = oks.filter((o) => o.rank > z.rank).sort((x, y) => x.rank - y.rank)[0];
      const v = two ? outlineVerdict(below?.pts, above?.pts, w.outer, z.pts) : undefined;
      const who = two ? whoseLine(L, z.rank, w.outer, z.pts) : null;
      const printed = who ? who.ownAloneMm / (who.ownMm + who.foreignMm + who.nobodyMm || 1) : 0;
      const farTakes =
        far0 &&
        !!two &&
        farLineMm(L, z.rank, w.outer) < WALK.farLineMm &&
        printed >= WALK.leakPrinted;
      if (farTakes) t[z.ok ? 'okFarTakesWalk' : 'badFarTakesWalk']++;
      if (far0 && !two && !z.ok) t.badFarSameWalk++;
      if (farTakes)
        console.log(
          `${z.size.padEnd(5)} ${z.ok ? 'ok ' : 'bad'} · rides a distant size's line, the walk does not · ${two!.maxMm.toFixed(1)} mm over ${Math.round(two!.overMm)} mm${z.ok ? '   <<< FALSE REPLACEMENT (far)' : '   repair (far)'}`,
        );
      if (z.ok) {
        t[mx <= 1 ? 'okLe1' : mx <= 3 ? 'okLe3' : 'okGt3']++;
        if (two) {
          t.okTwo++;
          t[v?.take === 'walk' ? 'okTakesWalk' : v?.take === 'fill' ? 'okTakesFill' : 'okCannot']++;
        }
      } else if (!two) t.badSame++;
      else
        t[
          v?.take === 'walk' ? 'badTakesWalk' : v?.take === 'fill' ? 'badTakesFill' : 'badCannot'
        ]++;
      if (two)
        console.log(
          `${z.size.padEnd(5)} ${z.ok ? 'ok ' : 'bad'} · ${two.maxMm.toFixed(1)} mm over ${Math.round(two.overMm)} mm → ${v ? `takes the ${v.take}` : 'cannot tell'}${z.ok && v?.take === 'walk' ? '   <<< FALSE REPLACEMENT' : ''}`,
        );
    }
  }
}
for (const [set, t] of bySet) console.log(set, JSON.stringify(t));
console.log(`${Date.now() - t0} ms`);
