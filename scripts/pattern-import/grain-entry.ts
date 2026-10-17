// GRAIN PROBE ENTRY — bundled by grain.mjs. A proposed grainline lies on its piece.
//
// 1 · unit: semantics/grain-inside.ts — the kombinezon strap (an unfolded strip whose geometric
//     proposal spans the unfolded piece, half of it beyond the drawn half) is fitted onto the drawn
//     half of every size; a line beside the piece, a drawn line leaving it, a too-short line are
//     not offered; a fold line on the drawn edge (≤ 1 mm) is kept; nested sizes → the line lies on
//     the smallest; an L-shaped piece keeps the stretch the line was proposed on.
// 2 · corpus: the latest E2E report ($PATIMPORT_REPORTS/E2E-*.json, or GRAIN_E2E=<file>) — every
//     proposal the run offered (`grainProposals`, e2e-entry.ts) measured against its piece's
//     exported sizes; any one off its piece (> 1 mm) fails.
// Exit 1 on any failed check.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import type { PtMm } from 'lib/pattern-import/types';
import {
  GRAIN_PROPOSAL_MIN_MM,
  fitGrainInside,
  grainOutsideMm,
  vetProposal,
} from 'lib/pattern-import/semantics/grain-inside';
import { proposeGrain } from 'lib/pattern-import/semantics/grain-propose';

const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';

let bad = 0;
const check = (ok: boolean, what: string, got?: unknown) => {
  if (!ok) bad++;
  console.log(
    `${ok ? '✓' : '✗'} ${what}${ok || got === undefined ? '' : ` — got ${JSON.stringify(got)}`}`,
  );
};

const rect = (x0: number, y0: number, x1: number, y1: number): PtMm[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const len = (s: [PtMm, PtMm] | { a: PtMm; b: PtMm }) => {
  const [a, b] = Array.isArray(s) ? s : [s.a, s.b];
  return Math.hypot(b.x - a.x, b.y - a.y);
};

function unit() {
  console.log('\n· unit');
  // kombinezon strap: drawn half 60 × 474 above its fold edge (y = 2140), unfolded downwards
  const drawn = rect(862, 2140, 922, 2615);
  const unfolded = rect(862, 1666, 922, 2615);
  // (on the real strap the fold-line chord misses, so its mirror axis is what is proposed)
  const raw = proposeGrain(unfolded);
  check(!!raw, 'the unfolded strap gets a geometric proposal', raw);
  if (raw) {
    check(
      grainOutsideMm(raw.a, raw.b, [drawn]) > 100,
      'as measured, the proposal runs far past the drawn half (the defect)',
      grainOutsideMm(raw.a, raw.b, [drawn]),
    );
    const v = vetProposal(raw, [drawn], true);
    check('ok' in v, 'fitted onto the drawn half it is offered', v);
    if ('ok' in v) {
      check(
        grainOutsideMm(v.ok.a, v.ok.b, [drawn]) === 0 &&
          grainOutsideMm(v.ok.a, v.ok.b, [unfolded]) === 0,
        'the fitted line lies on the drawn half and on the unfolded cut',
        v.ok,
      );
      const dirOk =
        Math.abs(
          (v.ok.b.x - v.ok.a.x) * (raw.b.y - raw.a.y) - (v.ok.b.y - v.ok.a.y) * (raw.b.x - raw.a.x),
        ) <
        1e-6 * len(v.ok) * len(raw);
      check(dirOk && len(v.ok) > 0.6 * 475, 'same direction, ~70 % of the drawn strap', {
        len: len(v.ok),
      });
    }
  }
  // two sizes of the strap (graded in length, fold edges apart): on both
  const s2 = rect(862, 2120, 922, 2650);
  const f2 = fitGrainInside({ x: 892, y: 1800 }, { x: 892, y: 2480 }, [drawn, s2]);
  check(
    !!f2 && grainOutsideMm(f2[0], f2[1], [drawn]) === 0 && grainOutsideMm(f2[0], f2[1], [s2]) === 0,
    'nested sizes: fitted onto every size',
    f2,
  );
  // a line beside the piece: the direction is the piece's own — laid onto it, parallel
  const beside = vetProposal(
    { a: { x: 1000, y: 2200 }, b: { x: 1000, y: 2500 }, why: 'symmetry axis' },
    [drawn],
    true,
  );
  check(
    'ok' in beside &&
      grainOutsideMm(beside.ok.a, beside.ok.b, [drawn]) === 0 &&
      Math.abs(beside.ok.a.x - beside.ok.b.x) < 1e-6,
    'a geometric line beside the piece is laid onto it, same direction',
    beside,
  );
  // a file per size, side by side (redcafe): one line cannot lie on both — not offered
  const apart = vetProposal(
    { a: { x: 892, y: 2200 }, b: { x: 892, y: 2500 }, why: 'long axis' },
    [drawn, rect(2262, 2140, 2322, 2615)],
    true,
  );
  check('dropped' in apart, 'sizes laid apart (a file per size): not offered', apart);
  // a nest graded by shifting (r4454 seed 9: 160 × 94, each size 12 mm lower): the long axis
  // through the largest misses the smallest — the parallel line through their common band
  const nest = [0, 1, 2, 3, 4, 5].map((k) => rect(2149 - k, 705 + 11.3 * k, 2310, 799 + 12 * k));
  const nf = fitGrainInside({ x: 2160, y: 810 }, { x: 2300, y: 810 }, nest);
  check(
    !!nf &&
      nest.every((r) => grainOutsideMm(nf[0], nf[1], [r]) === 0) &&
      Math.abs(nf[0].y - nf[1].y) < 1e-6 &&
      len(nf) > 100,
    'a shifted nest: the parallel line on every size',
    nf,
  );
  // a drawn line that leaves the piece: kept or dropped, never moved
  const leaving = vetProposal(
    { a: { x: 892, y: 2000 }, b: { x: 892, y: 2400 }, why: 'line in every size' },
    [drawn],
    false,
  );
  check('dropped' in leaving, 'a drawn line running 140 mm off the piece is not offered', leaving);
  const onIt = vetProposal(
    { a: { x: 892, y: 2200 }, b: { x: 892, y: 2500 }, why: 'line in every size' },
    [drawn],
    false,
  );
  check(
    'ok' in onIt && onIt.ok.a.y === 2200 && onIt.ok.b.y === 2500,
    'a drawn line on the piece is offered as drawn',
    onIt,
  );
  // a fold line on the drawn half's edge (interior once unfolded): on the outline ≤ 1 mm = on it
  const edge = vetProposal(
    { a: { x: 870, y: 2140.6 }, b: { x: 914, y: 2140.6 }, why: 'fold line' },
    [drawn],
    true,
  );
  check('ok' in edge, 'a fold line on the drawn edge (0.6 mm off) is offered', edge);
  // the gate's midpoint test: a zero-length segment is one point
  check(
    grainOutsideMm({ x: 892, y: 2300 }, { x: 892, y: 2300 }, [drawn]) === 0 &&
      grainOutsideMm({ x: 1000, y: 2300 }, { x: 1000, y: 2300 }, [drawn]) === Infinity,
    'one point: 0 on the piece, Infinity off it',
  );
  // a line along an edge and through vertices: parity holds, the edge is on the piece
  check(
    grainOutsideMm({ x: 862, y: 2150 }, { x: 862, y: 2600 }, [drawn]) === 0 &&
      grainOutsideMm({ x: 850, y: 2140 }, { x: 930, y: 2140 }, [drawn]) > 15,
    'along an edge: on it; along the fold edge past both corners: the overhang counts',
  );
  // a diamond: a line parallel to an edge, 0.5 mm outside it → on; 2 mm outside → off
  const dia: PtMm[] = [
    { x: 0, y: -1000 },
    { x: 1000, y: 0 },
    { x: 0, y: 1000 },
    { x: -1000, y: 0 },
  ];
  const o = (d: number) => d / Math.SQRT2;
  check(
    grainOutsideMm({ x: 200 + o(0.5), y: -800 - o(0.5) }, { x: 800 + o(0.5), y: -200 - o(0.5) }, [
      dia,
    ]) === 0 &&
      grainOutsideMm({ x: 200 + o(2), y: -800 - o(2) }, { x: 800 + o(2), y: -200 - o(2) }, [dia]) >
        800,
    'a diagonal edge: 0.5 mm off it is on the piece, 2 mm off is not',
  );
  // bounded: five 2 m diagonal graded rings, a line across them all
  const t0 = Date.now();
  const big = [0, 1, 2, 3, 4].map((k) => dia.map((p) => ({ x: p.x * (1 + k / 50), y: p.y })));
  fitGrainInside({ x: -3000, y: -3000 }, { x: 3000, y: 3000 }, big);
  check(Date.now() - t0 < 2000, `five 2 m diagonal rings fitted in ${Date.now() - t0} ms`);
  // too short
  const tiny = rect(0, 0, 12, 18);
  const t = vetProposal({ a: { x: 6, y: 2 }, b: { x: 6, y: 16 }, why: 'long axis' }, [tiny], true);
  check('dropped' in t, `a piece too small for a ${GRAIN_PROPOSAL_MIN_MM} mm line: not offered`, t);
  // an L: a vertical line through the foot's centre crosses the empty corner — the stretch it
  // was proposed on (overlapping it most) is kept
  const L: PtMm[] = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 80 },
    { x: 80, y: 80 },
    { x: 80, y: 400 },
    { x: 0, y: 400 },
  ];
  const fl = fitGrainInside({ x: 40, y: 50 }, { x: 40, y: 600 }, [L]);
  check(
    !!fl && grainOutsideMm(fl[0], fl[1], [L]) === 0 && len(fl) > 0.6 * 400,
    'an L: the leg the line runs along, inside',
    fl,
  );
  const across = fitGrainInside({ x: 200, y: 10 }, { x: 200, y: 300 }, [L]);
  check(
    !!across && grainOutsideMm(across[0], across[1], [L]) === 0 && len(across) < 80,
    'an L: a line across the foot is cut back to the foot',
    across,
  );
}

type Prop = { piece: string; why: string; lenMm: number; outsideMm: number; sizes: number };
type Rec = { id: string; verdict?: string; grainProposals?: Prop[] };

function corpus() {
  console.log('\n· corpus (latest E2E report)');
  let file = process.env.GRAIN_E2E ?? null;
  if (!file && existsSync(REPORTS)) {
    const all = readdirSync(REPORTS)
      .filter((f) => /^E2E-\d+\.json$/.test(f))
      .map((f) => resolve(REPORTS, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    file = all[0] ?? null;
  }
  if (!file || !existsSync(file)) {
    console.log(
      `  no E2E report in ${REPORTS} — run yarn patimport:e2e first (corpus part skipped)`,
    );
    return;
  }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Rec[] | { cases?: Rec[]; results?: Rec[] };
  const recs: Rec[] = Array.isArray(raw) ? raw : raw.cases ?? raw.results ?? [];
  console.log(`  ${file}: ${recs.length} cases`);
  if (!recs.some((r) => 'grainProposals' in r)) {
    console.log(
      '  the report predates the grainProposals field (e2e-entry.ts) — corpus part skipped',
    );
    return;
  }
  let n = 0;
  let off = 0;
  let minLen = Infinity;
  for (const r of recs) {
    const ps = r.grainProposals ?? [];
    if (!ps.length) continue;
    n += ps.length;
    const outs = ps.filter((p) => p.outsideMm > 0);
    off += outs.length;
    for (const p of ps) minLen = Math.min(minLen, p.lenMm);
    console.log(
      `  ${r.id.padEnd(40)} ${String(ps.length).padStart(3)} proposed, ${outs.length} off the piece${outs.length ? `: ${outs.map((p) => `${p.piece} (${p.why}) ${p.outsideMm} mm out of ${p.lenMm}`).join('; ')}` : ''}`,
    );
  }
  check(n > 0, `the report carries proposals (${n})`);
  check(off === 0, `no proposal off its piece (${off} of ${n}); shortest ${minLen} mm`);
}

export async function main(): Promise<number> {
  unit();
  corpus();
  console.log(`\n${bad ? `✗ ${bad} failed` : '✓ all passed'}`);
  return bad ? 1 : 0;
}
