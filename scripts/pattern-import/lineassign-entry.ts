// PATTERN-IMPORT · LINEFIX — "these lines are size N" (chains/assign.ts). Two parts:
//   1 crafted: the line key (direction / start / quantisation step / pen), exact · near · dup ·
//     gone · ambiguous · bad-key · no-target, the move (leaves its rows, orphans, bundles, the
//     operator's own common row), D3 flags (two sizes, another size's pen), G22 penLines and the
//     R3 rank guard taking an answered line as its rank's own, the replay record round trip.
//   2 kombinezon (real worker session): the strip outlines — nests of closed narrow outlines, one
//     per size, the smallest = size 6 — read in the wrong row for sizes 6 and 8 are put in their
//     sizes by key; the keys are stable over a second read; the strips' fill in 6 and 8 runs on the
//     operator's line; a key 30 mm off is reported stale and applied nowhere.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import { assignChains, lineKeys, parseLineKey } from 'lib/pattern-import/chains/assign';
import { lineNests, lineSuspects, sizeOutlines } from 'lib/pattern-import/chains/nests';
import { penLines, rankGuard } from 'lib/pattern-import/pieces/identity';
import {
  continuityWalls,
  itemsOf,
  lonePortions,
  rescuedIgnored,
  sharedFolds,
  type WallModel,
} from 'lib/pattern-import/pieces/walls';
import type {
  CardSize,
  Chain,
  ChainAssign,
  ChainSet,
  LineClass,
  PtMm,
  Sheet,
  SizeRun,
  StageIO,
  StageName,
  Style,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { guardPdfjs } from 'lib/pattern-import/worker/pdf-guard';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { lineAssignAnswers } from 'components/managers/tech-card/components/pattern-import/autopilot/replay-record';
import { lineAssignOf } from 'components/managers/tech-card/components/pattern-import/autopilot/replay';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const loadGuarded = () => (import(LEGACY) as Promise<PdfjsModule>).then((m) => guardPdfjs(m));
setPdfjsLoader(loadGuarded);
setRasterPdfjsLoader(loadGuarded);

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) fails++;
};

// ── 1 · crafted ─────────────────────────────────────────────────────────────────────────────────

const ST: Style[] = [
  {
    id: 0,
    strokeRgb: [0, 0, 0],
    widthMm: 0.3,
    dash: [1, 1, 1, 3],
    layer: '6',
    fill: false,
    clip: 'a',
  },
  {
    id: 1,
    strokeRgb: [0, 0, 0],
    widthMm: 0.3,
    dash: [3.6, 3.6],
    layer: '8',
    fill: false,
    clip: 'a',
  },
  // size 6's pen again, another tile clip: one pen, the same key
  {
    id: 2,
    strokeRgb: [0, 0, 0],
    widthMm: 0.3,
    dash: [1, 1, 1, 3],
    layer: '6',
    fill: false,
    clip: 'b',
  },
  { id: 3, strokeRgb: [0, 0, 0], widthMm: 0.35, dash: null, layer: null, fill: false, clip: null },
];
const plen = (p: PtMm[], closed: boolean) => {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  if (closed && p.length > 2)
    l += Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y);
  return l;
};
const ch = (id: number, pts: PtMm[], style: number, closed = false): Chain => ({
  id,
  pts,
  closed,
  ranges: [],
  motif: null,
  style,
  lengthMm: plen(pts, closed),
});
const rect = (x: number, y: number, w: number, h: number): PtMm[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const row = (
  id: number,
  label: string | null,
  rank: number | null,
  chains: number[],
  dash?: number[],
): LineClass => ({
  id,
  role: label ? 'size' : 'common',
  sizeLabel: label,
  chains,
  totalLengthMm: 0,
  evidence: [
    ...(rank != null ? [{ kind: 'nesting-order' as const, rank }] : []),
    ...(dash ? [{ kind: 'declared-dash' as const, dash }] : []),
  ],
  confidence: 0.95,
  sig: `${label ?? 'common'}#0`,
});
function craftSet(): ChainSet {
  const chains = [
    ch(0, rect(0, 0, 60, 400), 0, true), // strip, size 6 (pen 6)
    ch(1, rect(0, 0, 60, 420), 2, true), // strip, size 8's outline drawn in pen 6 (kombinezon)
    ch(
      2,
      [
        { x: 100, y: 0 },
        { x: 100, y: 300 },
      ],
      1,
    ), // a size-8 line
    ch(
      3,
      [
        { x: 200, y: 0 },
        { x: 200, y: 300 },
      ],
      3,
    ), // common
    ch(
      4,
      [
        { x: 300, y: 0 },
        { x: 300, y: 50 },
      ],
      1,
    ), // an orphan of pen 8
    // two lines of one pen 0.4 mm apart (a near key between them is ambiguous)
    ch(
      5,
      [
        { x: 400, y: 0 },
        { x: 400, y: 100 },
      ],
      3,
    ),
    ch(
      6,
      [
        { x: 400.4, y: 0 },
        { x: 400.4, y: 100 },
      ],
      3,
    ),
    // the same line drawn twice in one pen (one key, two chains)
    ch(
      7,
      [
        { x: 500, y: 0 },
        { x: 500, y: 80 },
      ],
      1,
    ),
    ch(
      8,
      [
        { x: 500, y: 0 },
        { x: 500, y: 80 },
      ],
      1,
    ),
  ];
  return {
    chains,
    classes: [
      row(0, '6', 0, [0, 1], [1, 1, 1, 3]),
      row(1, '8', 1, [2, 7, 8], [3.6, 3.6]),
      row(2, null, null, [3, 5, 6]),
    ],
    bundles: [
      { id: 0, chains: [1, 2], spacingMm: 5, endsOn: [null, null] },
      { id: 1, chains: [0, 3], spacingMm: 5, endsOn: [null, null] },
    ],
    orphans: [4],
    ambiguities: [
      { kind: 'unassigned', message: 'x', classes: [], chains: [4], at: null },
      { kind: 'size-count', message: 'y', classes: [0], chains: [], at: null },
    ],
    warnings: [],
  };
}

function crafted() {
  console.log('── crafted ──');
  const set = craftSet();
  const keys = lineKeys(set, ST, undefined, 0);
  // the key: no direction, no start, no tile clip; another pen = another key
  const rev = {
    ...set,
    chains: set.chains.map((c) => (c.id === 2 ? { ...c, pts: [...c.pts].reverse() } : c)),
  };
  const rot = {
    ...set,
    chains: set.chains.map((c) =>
      c.id === 0 ? { ...c, pts: [...c.pts.slice(2), ...c.pts.slice(0, 2)] } : c,
    ),
  };
  check(
    'key does not depend on the direction of an open line',
    lineKeys(rev, ST, undefined, 0)[2].key === keys[2].key,
  );
  check(
    'key does not depend on where a closed line starts',
    lineKeys(rot, ST, undefined, 0)[0].key === keys[0].key,
  );
  const clip = { ...set, chains: set.chains.map((c) => (c.id === 0 ? { ...c, style: 2 } : c)) };
  check(
    'key does not depend on the tile clip of the pen',
    lineKeys(clip, ST, undefined, 0)[0].key === keys[0].key,
  );
  const pen = { ...set, chains: set.chains.map((c) => (c.id === 0 ? { ...c, style: 1 } : c)) };
  check(
    'another pen = another key (mutation)',
    lineKeys(pen, ST, undefined, 0)[0].key !== keys[0].key,
  );
  check(
    'keys parse back',
    keys.every((k) => !!parseLineKey(k.key)),
    keys[2].key,
  );
  // D6: the tile sheet's own frame — the same line on a shifted sheet keeps its key
  const parts = [
    {
      sheet: 3,
      pages: [],
      dx: 1300,
      dy: 0,
      box: { minX: 1300, minY: 0, maxX: 2300, maxY: 1000 },
      maxResidualMm: 0,
      missing: 0,
    },
  ];
  const moved = {
    ...set,
    chains: set.chains.map((c) => ({ ...c, pts: c.pts.map((p) => ({ x: p.x + 1300, y: p.y })) })),
  };
  const km = lineKeys(moved, ST, parts, 0);
  check(
    'D6: a shifted tile sheet keeps the keys (its own frame), names its sheet',
    km[2].key === keys[2].key && km[2].sheet === 3,
  );

  // the move
  const A = (keysOf: number[], to: ChainAssign['to']): ChainAssign => ({
    sheet: 0,
    keys: keysOf.map((i) => keys[i].key),
    to,
  });
  const r1 = assignChains(set, ST, undefined, 0, [A([1], { rank: 1 }), A([4], { row: '8#0' })]);
  const cls = (s: ChainSet, id: number) =>
    s.classes.filter((c) => c.chains.includes(id)).map((c) => c.sizeLabel ?? c.role);
  check(
    'rank target: the strip leaves size 6, joins size 8',
    cls(r1.set, 1).join() === '8',
    cls(r1.set, 1).join(),
  );
  check(
    'row target (sig): the orphan joins size 8 and is no orphan',
    cls(r1.set, 4).join() === '8' && !r1.set.orphans.includes(4),
  );
  check(
    'the bundle holding an answered line is dropped, the other kept',
    r1.set.bundles.map((x) => x.id).join() === '1',
  );
  check(
    'a question about only answered lines is dropped, others stay',
    r1.set.ambiguities?.length === 1 && r1.set.ambiguities[0].kind === 'size-count',
  );
  check(
    'ChainSet.assigned names the lines and rows',
    JSON.stringify(r1.set.assigned) ===
      JSON.stringify([
        { chain: 1, classes: [1] },
        { chain: 4, classes: [1] },
      ]),
  );
  check(
    'input set untouched',
    set.classes[0].chains.join() === '0,1' && set.orphans.join() === '4',
  );
  // a line drawn with size 6's pen put in size 8: taken, flagged (the operator is the authority)
  check(
    'D3: pen 6 line in size 8 flagged "pen"',
    r1.report.flags.some((f) => f.chain === 1 && f.kind === 'pen'),
    r1.report.flags.map((f) => f.detail).join('; '),
  );
  check("a line on its target's pen is not flagged", !r1.report.flags.some((f) => f.chain === 4));
  // two size answers = two sizes, flagged; a later common answer replaces them
  const r2 = assignChains(set, ST, undefined, 0, [A([3], { rank: 0 }), A([3], { rank: 1 })]);
  check(
    'two size answers keep the line in both, flagged "two-sizes"',
    cls(r2.set, 3).sort().join() === '6,8' && r2.report.flags.some((f) => f.kind === 'two-sizes'),
  );
  const r3 = assignChains(set, ST, undefined, 0, [A([3], { rank: 0 }), A([3], { cls: 'ignore' })]);
  const op = r3.set.classes.find((c) => c.sig === 'operator/ignore');
  check(
    'a later ignore answer replaces the size answer — an operator row of its own, confidence 1',
    cls(r3.set, 3).join() === 'ignore' && !!op && op.confidence === 1,
  );
  const r4 = assignChains(set, ST, undefined, 0, [A([2], { cls: 'common' })]);
  check(
    'common: an operator common row',
    r4.set.classes.some(
      (c) => c.sig === 'operator/common' && c.role === 'common' && c.chains.join() === '2',
    ),
  );
  // dup, near, gone, ambiguous, bad-key, no-target
  const r5 = assignChains(set, ST, undefined, 0, [A([7], { rank: 0 })]);
  check(
    'dup: the same line drawn twice in one pen takes the answer on both',
    r5.report.applied[0]?.via === 'dup' &&
      cls(r5.set, 7).join() === '6' &&
      cls(r5.set, 8).join() === '6',
  );
  const shifted = {
    ...set,
    chains: set.chains.map((c) =>
      c.id === 2 ? { ...c, pts: c.pts.map((p) => ({ x: p.x + 0.3, y: p.y + 0.3 })) } : c,
    ),
  };
  const r6 = assignChains(shifted, ST, undefined, 0, [A([2], { rank: 0 })]);
  check(
    'near: a re-run moved the line 0.3 mm across a step — found, via near',
    r6.report.applied[0]?.via === 'near' && cls(r6.set, 2).join() === '6',
    JSON.stringify(r6.report.stale),
  );
  const far = {
    ...set,
    chains: set.chains.map((c) =>
      c.id === 2 ? { ...c, pts: c.pts.map((p) => ({ x: p.x + 30, y: p.y })) } : c,
    ),
  };
  const r7 = assignChains(far, ST, undefined, 0, [A([2], { rank: 0 })]);
  check(
    'gone: the line is elsewhere now — stale, applied nowhere',
    r7.report.stale[0]?.why === 'gone' && !r7.report.applied.length && r7.set === far,
  );
  const k56 = keys[5].key.replace(/\|400\.0,/g, '|400.2,');
  const amb = {
    ...set,
    chains: set.chains.map((c) =>
      c.id === 5 ? { ...c, pts: c.pts.map((p) => ({ x: 400.1, y: p.y })) } : c,
    ),
  };
  const r8 = assignChains(amb, ST, undefined, 0, [{ sheet: 0, keys: [k56], to: { rank: 0 } }]);
  check(
    "ambiguous: two lines of the key's pen near, none exact — stale",
    r8.report.stale[0]?.why === 'ambiguous',
    `${k56} ${JSON.stringify(r8.report)}`,
  );
  const r9 = assignChains(set, ST, undefined, 0, [
    { sheet: 0, keys: ['chain 4'], to: { rank: 0 } },
    A([2], { rank: 7 }),
    A([2], { row: 'nope' }),
  ]);
  check(
    'bad-key / no-target (rank, row) — stale, nothing moved',
    r9.report.stale.map((s) => s.why).join() === 'bad-key,no-target,no-target' && r9.set === set,
  );
  const r10 = assignChains(set, ST, undefined, 1, [{ ...A([2], { rank: 0 }), sheet: 1 }]);
  check("another tile sheet's key never lands here", r10.report.stale[0]?.why === 'gone');

  // G22 / R3: the answered line is its rank's own — only it
  const run: SizeRun = {
    encoding: 'declared-dash',
    sizes: [
      { label: '6', rank: 0, classId: 0, file: null },
      { label: '8', rank: 1, classId: 1, file: null },
    ],
    evidence: [],
  };
  const sm = new Map(ST.map((s) => [s.id, s]));
  const box = { minX: -10, minY: -10, maxX: 600, maxY: 500 };
  const s8 = r1.set;
  const cls8 = new Set(s8.classes[1].chains);
  const others = new Set(s8.classes[0].chains);
  const pl = penLines(s8, [{ kind: 'dash', d: [3.6, 3.6] }], sm, box, cls8, others);
  check(
    "G22: the answered pen-6 line counts as size 8's own",
    pl.own.includes(1) && !pl.foreign.includes(1),
  );
  const plain = { ...s8, assigned: undefined };
  const pl0 = penLines(plain, [{ kind: 'dash', d: [3.6, 3.6] }], sm, box, cls8, others);
  check(
    'G22 mutation: without the answer the same line is foreign',
    !pl0.own.includes(1) && pl0.foreign.includes(1),
  );
  const pl6 = penLines(
    s8,
    [{ kind: 'dash', d: [1, 1, 1, 3] }],
    sm,
    box,
    new Set(s8.classes[0].chains),
    cls8,
  );
  check(
    "G22: only for its own row — size 6 does not take size 8's answered line",
    !pl6.own.includes(4) && pl6.own.includes(0),
  );
  const g = rankGuard(s8, run, sm)!;
  check('R3 guard: the answered line moves into its rank only', !!g && g.ok(1, 1) && !g.ok(1, 0));
  const gp = rankGuard(s8, { ...run, encoding: 'ocg' }, sm);
  check(
    'R3 guard on a run without pen identity: a pin guard alone',
    !!gp && gp.ok(1, 1) && !gp.ok(1, 0) && gp.ok(2, 0) && !gp.lookless,
  );
  check(
    'no answers, no identity: no guard (as before)',
    rankGuard(set, { ...run, encoding: 'ocg' }, sm) === null,
  );

  const g2 = rankGuard(r2.set, { ...run, encoding: 'ocg' }, sm)!;
  check(
    'R3 guard: a line in two sizes moves nowhere (one rank per line downstream)',
    !!g2 && !g2.ok(3, 0) && !g2.ok(3, 1),
  );
  // the record: operator only, value round trip
  const out: StageIO['chains']['out'] = {
    classes: r1.set.classes,
    bundles: [],
    orphans: [],
    chainPreview: [],
    warnings: [],
    lineAssign: r1.report,
  };
  const list = [A([1], { rank: 1 }), A([4], { row: '8#0' })];
  const rec = lineAssignAnswers(list, out);
  check(
    'record: one answer per entry, subject says it',
    rec.length === 2 && /operator put 1 line in size 8 · 1 against its pen/.test(rec[0].subject),
    rec[0].subject,
  );
  const back = rec.map((a) => lineAssignOf(JSON.parse(JSON.stringify(a.value))));
  check('record → replay input round trip', JSON.stringify(back) === JSON.stringify(list));
}

// ── 1b · the walls: an answer is authoritative ──────────────────────────────────────────────────
// Every heuristic of pieces/walls.ts that re-reads lines by geometry, each with its mutation (the
// same drawing without the answer): an operator/ignore line is never a wall (rescue, continuity),
// a size-pinned line is never every size's wall (lone stretch, shared fold).

const sizeRow = (id: number, label: string, rank: number, chains: number[]): LineClass => ({
  ...row(id, label, rank, chains),
});
const ign = (id: number, chains: number[], sig = 'stray'): LineClass => ({
  id,
  role: 'ignore',
  sizeLabel: null,
  chains,
  totalLengthMm: 0,
  evidence: [],
  confidence: 0.8,
  sig,
});
const model = (byRank: number[][], common: number[] = []): WallModel => ({
  mode: 'graded',
  n: byRank.length,
  common,
  byRank,
  emptyRanks: [],
  graded: byRank.flat(),
  fileOfRank: byRank.map(() => null),
});
const L = (id: number, a: PtMm, b: PtMm, style = 3): Chain => ch(id, [a, b], style);

function walls() {
  console.log('── walls: the answer stands ──');
  // rescue: an ignored rung whose both ends sit on size 6's two sides
  const rs: ChainSet = {
    chains: [
      L(0, { x: 0, y: 0 }, { x: 0, y: 200 }, 0),
      L(1, { x: 100, y: 0 }, { x: 100, y: 200 }, 0),
      L(2, { x: 0, y: 80 }, { x: 100, y: 80 }),
    ],
    classes: [sizeRow(0, '6', 0, [0, 1]), sizeRow(1, '8', 1, []), ign(2, [2])],
    bundles: [],
    orphans: [],
    warnings: [],
  };
  const rk = lineKeys(rs, ST, undefined, 0);
  check(
    'mutation: an ignored line touching size walls at both ends is rescued (a wall)',
    rescuedIgnored(rs, model([[0, 1], []])).includes(2),
  );
  const ra = assignChains(rs, ST, undefined, 0, [
    { sheet: 0, keys: [rk[2].key], to: { cls: 'ignore' } },
  ]).set;
  check(
    'operator/ignore: never rescued',
    !rescuedIgnored(ra, model([[0, 1], []])).includes(2) &&
      !rescuedIgnored(ra, model([[0, 1], []]), 1.5, 15, [], new Set(), true).includes(2),
  );

  // continuity: rank 0's line broken by an ignored 10 mm stretch on the same line
  const cs: ChainSet = {
    chains: [
      L(0, { x: 0, y: 0 }, { x: 0, y: 100 }, 0),
      L(1, { x: 0, y: 110 }, { x: 0, y: 200 }, 0),
      L(2, { x: 0, y: 100 }, { x: 0, y: 110 }),
      L(3, { x: 300, y: 0 }, { x: 300, y: 200 }, 1),
    ],
    classes: [sizeRow(0, '6', 0, [0, 1]), sizeRow(1, '8', 1, [3]), ign(2, [2])],
    bundles: [],
    orphans: [],
    warnings: [],
  };
  const cm = model([[0, 1], [3]]);
  const via2 = (s: ChainSet) =>
    continuityWalls(s, cm, 0, itemsOf(s, [0, 1])).some((w) => w.chains.includes(2));
  check('mutation: rank 6 closes its gap through the ignored stretch (continuity R0)', via2(cs));
  const ck = lineKeys(cs, ST, undefined, 0);
  const ca = assignChains(cs, ST, undefined, 0, [
    { sheet: 0, keys: [ck[2].key], to: { cls: 'ignore' } },
  ]).set;
  check('operator/ignore: never a continuity wall', !via2(ca));

  // lone: size 6's line with no other size beside it — a wall of every size, unless pinned
  const ls: ChainSet = {
    chains: [
      L(0, { x: 0, y: 0 }, { x: 0, y: 200 }, 0),
      L(1, { x: 500, y: 0 }, { x: 500, y: 200 }, 1),
    ],
    classes: [sizeRow(0, '6', 0, [0]), sizeRow(1, '8', 1, [1])],
    bundles: [],
    orphans: [],
    warnings: [],
  };
  const lm = model([[0], [1]]);
  check(
    "mutation: an unanswered size line drawn alone is a lone stretch (every size's wall)",
    lonePortions(ls, lm).some((w) => w.chain === 0),
  );
  const lk = lineKeys(ls, ST, undefined, 0);
  const la = assignChains(ls, ST, undefined, 0, [
    { sheet: 0, keys: [lk[0].key], to: { rank: 0 } },
  ]).set;
  check(
    'size-pinned: never a lone stretch of every size',
    !lonePortions(la, lm).some((w) => w.chain === 0),
  );

  // fold: a straight line three other sizes' lines end on (T) — every size's fold, unless pinned
  const fs: ChainSet = {
    chains: [
      L(0, { x: 0, y: 0 }, { x: 200, y: 0 }, 1),
      L(1, { x: 50, y: 0 }, { x: 50, y: 100 }, 0),
      L(2, { x: 100, y: 0 }, { x: 100, y: 100 }, 3),
      L(3, { x: 150, y: 0 }, { x: 150, y: 100 }, 3),
    ],
    classes: [
      sizeRow(0, '6', 0, [1]),
      sizeRow(1, '8', 1, [0]),
      sizeRow(2, '10', 2, [2]),
      sizeRow(3, '12', 3, [3]),
    ],
    bundles: [],
    orphans: [],
    warnings: [],
  };
  const fr = [[1], [0], [2], [3]];
  check(
    'mutation: an unanswered straight edge three sizes end on is a shared fold',
    sharedFolds(fs, fr, new Set()).includes(0),
  );
  const fk = lineKeys(fs, ST, undefined, 0);
  const fa = assignChains(fs, ST, undefined, 0, [
    { sheet: 0, keys: [fk[0].key], to: { rank: 1 } },
  ]).set;
  check(
    'size-pinned: never a shared fold of every size',
    !sharedFolds(fa, fr, new Set()).includes(0),
  );
}

// ── 1b · LINEASSIGN-2: graded nests → suspects, pen slip, outlines per size, no line twice ──────

/** Pens of four sizes: 6, 8, 10 by declared dash, 12 its own dash. */
const ST2: Style[] = [
  [1, 1, 1, 3],
  [3.6, 3.6],
  [0.3, 1.8],
  [4.2, 2.1, 0.35, 2.1],
].map((dash, id) => ({
  id,
  strokeRgb: [0, 0, 0] as [number, number, number],
  widthMm: 0.3,
  dash,
  layer: '6',
  fill: false,
  clip: 'a',
}));
const DASH = ST2.map((s) => s.dash!);

/**
 * A strip nest of four sizes (60 mm wide, 400 + 20·k long: areas step evenly by 1200 mm²) plus
 * one size-12 line of its own pen (the row's pen). `pens[k]` = the style of size k's outline,
 * `rows[k]` = the size row (0…3) it is read in.
 */
function nestSet(pens: number[], rows: number[], heights = [400, 420, 440, 460]): ChainSet {
  const chains = heights.map((h, k) => ch(k, rect(0, 0, 60, h), pens[k], true));
  chains.push(
    ch(
      4,
      [
        { x: 200, y: 0 },
        { x: 200, y: 300 },
      ],
      3,
    ),
  );
  const ids = (r: number) => [
    ...rows.flatMap((x, k) => (x === r ? [k] : [])),
    ...(r === 3 ? [4] : []),
  ];
  return {
    chains,
    classes: ['6', '8', '10', '12'].map((l, r) => row(r, l, r, ids(r), DASH[r])),
    bundles: [],
    orphans: [],
    warnings: [],
  };
}

function nestsCrafted() {
  console.log('── nests (LINEASSIGN-2) ──');
  // a misread: size 8's outline (its own pen) read in row 6
  const mis = nestSet([0, 1, 2, 3], [0, 0, 2, 3]);
  const n = lineNests(mis);
  check(
    'nest: four outlines sharing a corner, even area steps → one nest, levels by area',
    n.nests.length === 1 && n.nests[0].levels.map((l) => l.join()).join('|') === '0|1|2|3',
  );
  const sm = lineSuspects(mis, ST2);
  check(
    'suspect: the outline outside the row its place names → suggest that row, pen agrees',
    sm.length === 1 && sm[0].chain === 1 && sm[0].suggest === 1 && sm[0].pen === 'agrees',
    JSON.stringify(sm),
  );
  check(
    'suspect why: names the place and the row it is in',
    /2nd by area/.test(sm[0]?.why ?? '') && /now in size 6/.test(sm[0]?.why ?? ''),
  );
  check(
    'no suspect on a read that agrees with every place',
    !lineSuspects(nestSet([0, 1, 2, 3], [0, 1, 2, 3]), ST2).length,
  );
  check(
    'mutation: uneven area steps (×7) → no nest, no suspect',
    !lineSuspects(nestSet([0, 1, 2, 3], [0, 0, 2, 3], [400, 405, 440, 445]), ST2).length,
  );
  const ans = assignChains(mis, ST2, undefined, 0, [
    { sheet: 0, keys: [lineKeys(mis, ST2, undefined, 0)[1].key], to: { rank: 0 } },
  ]).set;
  check(
    'an answered line is never a suspect (the operator is the authority)',
    !lineSuspects(ans, ST2).length,
  );

  // Codex r1: a group must hold together WHOLE, ranks must order, piles are no nest
  const chainLink = nestSet([0, 1, 2, 3], [0, 0, 2, 3], [400, 600, 900, 1350]);
  check(
    'mutation: areas linked only pairwise (ratio 0.6 each, whole 0.3) → no nest',
    !lineNests(chainLink).nests.length,
  );
  const drift: ChainSet = {
    ...mis,
    chains: mis.chains.map((c, k) =>
      k < 4 ? { ...c, pts: c.pts.map((p) => ({ x: p.x + k * 1.2, y: p.y + k * 1.2 })) } : c,
    ),
  };
  check(
    'mutation: corners drifting 1.2 mm per size (3.6 mm overall) → no nest',
    !lineNests(drift).nests.length,
  );
  const sameRank: ChainSet = {
    ...mis,
    classes: mis.classes.map((c) =>
      c.id === 2
        ? {
            ...c,
            evidence: c.evidence.map((e) => (e.kind === 'nesting-order' ? { ...e, rank: 1 } : e)),
          }
        : c,
    ),
  };
  check(
    'mutation: two size rows of one rank → no order, no nest, no suspect',
    !lineNests(sameRank).nests.length && !lineSuspects(sameRank, ST2).length,
  );
  check(
    'mutation: whole spread 0.5 (areas 100/130/200 per 60 mm: steps 30/70) → no nest',
    !lineNests(nestSet([0, 1, 2, 3], [0, 0, 2, 3], [400, 520, 650, 800])).nests.length,
  );
  const r8x = assignChains(sameRank, ST2, undefined, 0, [
    { sheet: 0, keys: [lineKeys(sameRank, ST2, undefined, 0)[1].key], to: { row: '6#0' } },
  ]).report;
  check(
    "mutation: no rank order → a line in size 8's pen put in 6 is still flagged",
    r8x.flags.some((f) => f.kind === 'pen' && f.chain === 1),
    JSON.stringify(r8x.flags),
  );
  const pile: ChainSet = {
    ...mis,
    chains: [
      ...mis.chains,
      ...Array.from({ length: 40 }, (_, k) => ch(5 + k, rect(0, 0, 60, 400), 0, true)),
    ],
  };
  check(
    'mutation: 40 copies piled on the nest corner → no nest read off the pile',
    !lineNests(pile).nests.length,
  );
  // the slip: size 12's outline drawn with size 8's pen (kombinezon #448), the reader put it in 8
  const slip = nestSet([0, 1, 2, 1], [0, 1, 2, 1]);
  const ss = lineSuspects(slip, ST2);
  check(
    "suspect: size 12's place drawn in pen 8, whose own place holds pen 8 too → suggest 12, pen slip",
    ss.length === 1 && ss[0].chain === 3 && ss[0].suggest === 3 && ss[0].pen === 'slip',
    JSON.stringify(ss),
  );
  const k3 = lineKeys(slip, ST2, undefined, 0)[3].key;
  const r12 = assignChains(slip, ST2, undefined, 0, [
    { sheet: 0, keys: [k3], to: { rank: 3 } },
  ]).report;
  check(
    'answer on the slip: no pen flag, one pen-slip note',
    !r12.flags.length && r12.notes?.length === 1 && r12.notes[0].kind === 'pen-slip',
    JSON.stringify(r12.flags) + JSON.stringify(r12.notes),
  );
  const rec12 = lineAssignAnswers([{ sheet: 0, keys: [k3], to: { rank: 3 } }], {
    classes: slip.classes,
    lineAssign: r12,
  } as unknown as Parameters<typeof lineAssignAnswers>[1]);
  check(
    'provenance: the note in the replay record (D5), not counted as against its pen',
    rec12.length === 1 &&
      (rec12[0].value.notes as unknown[] | undefined)?.length === 1 &&
      /slipped/.test(rec12[0].subject) &&
      !/against its pen/.test(rec12[0].subject),
    rec12[0]?.subject,
  );
  // mutation: pen 8's own place NOT drawn in pen 8 → nothing explains the pen: a flag
  const own = nestSet([0, 2, 2, 1], [0, 2, 2, 1]);
  const ro = assignChains(own, ST2, undefined, 0, [
    { sheet: 0, keys: [lineKeys(own, ST2, undefined, 0)[3].key], to: { rank: 3 } },
  ]).report;
  check(
    "mutation: the pen's own place drawn in another pen → pen flag, no note",
    ro.flags.some((f) => f.kind === 'pen' && f.chain === 3) && !ro.notes?.length,
    JSON.stringify(ro.flags),
  );
  // mutation: the answer's size pen draws an outline of the nest → two claims for 12: a flag
  const drawn = nestSet([3, 1, 2, 1], [3, 1, 2, 1]);
  const rd = assignChains(drawn, ST2, undefined, 0, [
    { sheet: 0, keys: [lineKeys(drawn, ST2, undefined, 0)[3].key], to: { rank: 3 } },
  ]).report;
  check(
    "mutation: size 12's own pen draws another outline of the nest → pen flag, no note",
    rd.flags.some((f) => f.kind === 'pen' && f.chain === 3) && !rd.notes?.length,
  );
  // mutation: the answer against the nest's place (size 8's outline put in 12) → flag
  const r8 = assignChains(slip, ST2, undefined, 0, [
    { sheet: 0, keys: [lineKeys(slip, ST2, undefined, 0)[1].key], to: { rank: 3 } },
  ]).report;
  check(
    "mutation: size 8's outline (place 8, pen 8) put in 12 → pen flag",
    r8.flags.some((f) => f.kind === 'pen' && f.chain === 1) && !r8.notes?.length,
  );
  // two sizes only: no nest (no grading evidence in one step)
  const two: ChainSet = {
    chains: [ch(0, rect(0, 0, 60, 400), 0, true), ch(1, rect(0, 0, 60, 420), 1, true)],
    classes: [row(0, '6', 0, [0, 0 + 1], DASH[0]), row(1, '8', 1, [], DASH[1])],
    bundles: [],
    orphans: [],
    warnings: [],
  };
  check(
    'two sizes: no nest, no suspect',
    !lineNests(two).nests.length && !lineSuspects(two, ST2).length,
  );

  // outlines per size: closed ≥ 200 mm, ends within 2 mm; a short ring and an open line are none
  const ol: ChainSet = {
    ...mis,
    chains: [
      ...mis.chains,
      ch(5, rect(300, 0, 20, 20), 1, true), // 80 mm round: too short
      ch(6, [...rect(400, 0, 100, 100), { x: 401, y: 1 }], 1), // open, ends 1.4 mm apart
      ch(7, [...rect(600, 0, 100, 100), { x: 610, y: 0 }], 1), // open, ends 10 mm apart
    ],
    classes: mis.classes.map((c) => (c.id === 1 ? { ...c, chains: [5, 6, 7] } : c)),
  };
  const so = sizeOutlines(ol);
  check(
    'outlines per size: 6 → 2 (its own + the misread 8), 8 → 1 (the near-closed one), 10 → 1, 12 → 1',
    so.map((o) => o.n).join() === '2,1,1,1' && so[1].chains.join() === '6',
    JSON.stringify(so.map((o) => [o.cls, o.n, o.chains])),
  );
  check('outlines: the biggest outline area per size', so[0].maxAreaMm2 === 60 * 420);

  // no line twice in a row: a row handed over with a line twice keeps it once after an answer
  const dup: ChainSet = {
    ...mis,
    classes: [...mis.classes, { ...row(4, null, null, [4, 4]), role: 'ignore', sig: 'x' }],
  };
  const da = assignChains(dup, ST2, undefined, 0, [
    { sheet: 0, keys: [lineKeys(dup, ST2, undefined, 0)[0].key], to: { cls: 'ignore' } },
  ]).set;
  const twice = da.classes.filter((c) => new Set(c.chains).size !== c.chains.length);
  check(
    'dedupe: no row lists a line twice after an answer',
    !twice.length,
    JSON.stringify(twice.map((c) => c.chains)),
  );
}

// ── 2 · kombinezon ──────────────────────────────────────────────────────────────────────────────

const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });
const CARD: CardSize[] = ['6', '8', '10', '12', '14', '16', '18', '20'].map((t, i) => ({
  sizeId: 100 + i,
  name: t,
  token: t,
  rank: i,
  spellings: [t],
}));
const OPTS = {
  joinGapMm: PATIMPORT.joinGapMm,
  joinAngleDeg: PATIMPORT.joinAngleDeg,
  joinLateralMm: PATIMPORT.joinLateralMm,
};
const FILL = { cellMm: PATIMPORT.fillCellMm, snapMm: PATIMPORT.snapMm };

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (p: PtMm[]): Box => ({
  minX: Math.min(...p.map((q) => q.x)),
  minY: Math.min(...p.map((q) => q.y)),
  maxX: Math.max(...p.map((q) => q.x)),
  maxY: Math.max(...p.map((q) => q.y)),
});
const iou = (a: Box, b: Box) => {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (w <= 0 || h <= 0) return 0;
  const ar = (x: Box) => (x.maxX - x.minX) * (x.maxY - x.minY);
  return (w * h) / (ar(a) + ar(b) - w * h);
};

/** Strip nests: closed narrow outlines (≥ 4:1, ≥ 300 mm) sharing a corner, one per size, by size. */
function stripNests(set: ChainSet, n: number) {
  const strips = set.chains
    .filter((c) => c.closed && c.lengthMm >= 300)
    .map((c) => ({ c, b: boxOf(c.pts) }))
    .filter(({ b }) => {
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      return Math.max(w, h) / Math.max(1, Math.min(w, h)) >= 4;
    });
  const seen = new Set<number>();
  const nests: Chain[][] = [];
  for (const s of strips) {
    if (seen.has(s.c.id)) continue;
    // one piece, every size: same corner (graded along its length), each one longer
    const g = strips.filter(
      (o) => Math.abs(o.b.minX - s.b.minX) < 2 && Math.abs(o.b.minY - s.b.minY) < 2,
    );
    g.forEach((o) => seen.add(o.c.id));
    const lens = new Set(g.map((o) => Math.round(o.c.lengthMm)));
    if (g.length === n && lens.size === n)
      nests.push(g.map((o) => o.c).sort((a, b) => a.lengthMm - b.lengthMm));
  }
  return nests;
}

async function kombinezon() {
  console.log('── kombinezon ──');
  const b = readFileSync(resolve(CORPUS, 'pdf/kombinezon.pdf'));
  const s = new Session(1, [
    {
      name: 'kombinezon.pdf',
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
  ]);
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) => s.runStage(st, input, ctx());
  await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const cl = await run('clean', { edits: [] });
  const best = cl.scale[0];
  await run('scale', {
    decision: { factor: best.factor, method: best.method, operatorConfirmed: true },
  });
  await run('assemble', { sheet: 0 });
  const setOf = () => (s as unknown as { chains: ChainSet }).chains;
  const ch0 = await run('chains', { opts: OPTS });
  const set0 = setOf();
  const sheet = (s as unknown as { sheet: Sheet }).sheet;
  const lines0 = ch0.chainLines ?? [];
  check(
    'chainLines: one per chain, every drawn chain keyed',
    lines0.length === set0.chains.length &&
      set0.chains.every((c, i) => c.pts.length < 2 || !!lines0[i].key),
  );
  const kb = Buffer.byteLength(JSON.stringify(lines0));
  console.log(
    `   chainLines ${lines0.length} chains, ${(kb / 1024).toFixed(0)} KB; chainPreview ${ch0.chainPreview.reduce((t, a) => t + a.length / 2, 0)} points`,
  );
  const sizeRow = (k: number) =>
    set0.classes.find(
      (c) =>
        c.role === 'size' && c.evidence.some((e) => e.kind === 'nesting-order' && e.rank === k),
    );
  const rowOf = (set: ChainSet, id: number) =>
    set.classes
      .filter((c) => c.chains.includes(id))
      .map((c) => (c.role === 'size' ? c.sizeLabel : c.role))
      .join('+') || 'none';
  const styles = new Map(sheet.styles.map((x) => [x.id, x]));
  const pen = (c: Chain) => {
    const st = styles.get(c.style);
    return `layer ${st?.layer} dash ${st?.dash ? st.dash.map((v) => v.toFixed(2)).join('/') : 'solid'}`;
  };
  const nests = stripNests(set0, 8);
  check(
    'kombinezon: the strip nests found by geometry (8 outlines each)',
    nests.length >= 2,
    `${nests.length} nests`,
  );
  const assign: ChainAssign[] = [];
  const wrong: { id: number; k: number }[] = [];
  nests.forEach((nest, ni) => {
    console.log(
      `   nest ${ni} at ${boxOf(nest[0].pts).minX.toFixed(0)},${boxOf(nest[0].pts).minY.toFixed(0)}:`,
    );
    nest.forEach((c, k) =>
      console.log(
        `     rank ${k} (size ${CARD[k].token}) #${c.id} len ${c.lengthMm.toFixed(0)} ${pen(c)} → row ${rowOf(set0, c.id)}`,
      ),
    );
    for (const k of [0, 1]) {
      const c = nest[k];
      if (rowOf(set0, c.id) !== sizeRow(k)?.sizeLabel) wrong.push({ id: c.id, k });
    }
  });
  // SIZESOCG (sizes/ocg-ladder.ts + the end-to-end OCG duplicate test): the read now puts every
  // strip outline in its own size — the owner's report is fixed without an answer. The answers
  // below still run, on the 6 / 8 outlines as their own rows (an answer that agrees with the read),
  // after the old misread is put back by an answer and taken out again.
  check(
    'SIZESOCG: every strip outline of 6 / 8 in its own row without an answer',
    wrong.length === 0,
    wrong.map((w) => `#${w.id}:${rowOf(set0, w.id)}→${CARD[w.k].token}`).join(' '),
  );
  if (!wrong.length) {
    const c8 = nests[nests.length - 1][1];
    const misread = await run('chains', {
      opts: OPTS,
      chainAssign: [{ sheet: lines0[c8.id].sheet, keys: [lines0[c8.id].key], to: { rank: 0 } }],
    });
    check(
      "the old misread put back by an answer: 8's strip outline in row 6",
      misread.lineAssign?.applied.length === 1 && rowOf(setOf(), c8.id) === sizeRow(0)?.sizeLabel,
      `#${c8.id}:${rowOf(setOf(), c8.id)}`,
    );
    for (const nest of nests) for (const k of [0, 1]) wrong.push({ id: nest[k].id, k });
  }
  for (const k of [0, 1]) {
    const ids = wrong.filter((w) => w.k === k).map((w) => w.id);
    if (ids.length)
      assign.push({
        sheet: lines0[ids[0]].sheet,
        keys: ids.map((i) => lines0[i].key),
        to: { rank: k },
      });
  }
  // a stale key: the 8's outline 30 mm off
  const bogus = (() => {
    const p = parseLineKey(lines0[nests[0][1].id].key)!;
    return lines0[nests[0][1].id].key.replace(
      `|${p.a[0].toFixed(1)},`,
      `|${(p.a[0] + 30).toFixed(1)},`,
    );
  })();
  const withStale: ChainAssign[] = [
    ...assign,
    { sheet: assign[0]?.sheet ?? 0, keys: [bogus], to: { rank: 1 } },
  ];

  // baseline sizes + pieces
  const pieces = async () => {
    let sz = await run('sizes', { card: CARD });
    if (!sz.expected) sz = await run('sizes', { card: CARD, drawnSizes: 8 });
    let pc = await run('pieces', { edits: [], opts: { ...FILL, variant: null } });
    const v = (pc.variants ?? []).find((x) => /A/.test(x)) ?? null;
    if (v) pc = await run('pieces', { edits: [], opts: { ...FILL, variant: v } });
    return { sz, pc };
  };
  const strip = (pc: StageIO['pieces']['out'], nest: Chain[]) => {
    const nb = boxOf(nest[0].pts);
    return pc.families.find((f) => f.candidates.some((c) => c.rank === 0 && iou(c.bbox, nb) > 0.5));
  };
  const before = await pieces();
  const ch1 = await run('chains', { opts: OPTS, chainAssign: withStale });
  const set1 = setOf();
  const rep = ch1.lineAssign!;
  console.log(
    `   applied ${rep.applied.length} keys (${rep.applied.map((a) => a.via).join(',')}), stale ${rep.stale.map((x) => `${x.why}: ${x.detail}`).join('; ')}`,
  );
  for (const f of rep.flags) console.log(`   flag ${f.kind} #${f.chain}: ${f.detail}`);
  check(
    'every wrong 6 / 8 strip outline applied, exactly',
    rep.applied.length === wrong.length && rep.applied.every((a) => a.chains.length === 1),
  );
  check(
    "each now in its size's row only",
    wrong.every((w) => rowOf(set1, w.id) === sizeRow(w.k)?.sizeLabel),
    wrong.map((w) => `#${w.id}:${rowOf(set1, w.id)}`).join(' '),
  );
  check(
    'the key 30 mm off: stale "gone", applied to no line',
    rep.stale.length === 1 && rep.stale[0].why === 'gone' && rep.stale[0].key === bogus,
  );
  check(
    'no other line moved',
    set1.chains.every(
      (c) => wrong.some((w) => w.id === c.id) || rowOf(set1, c.id) === rowOf(set0, c.id),
    ),
  );
  check(
    'provenance in the warnings',
    set1.warnings.some((w) => /put in a row by the operator/.test(w)),
  );
  // stable keys: a second read of the same file keys every line alike
  const ch2 = await run('chains', { opts: OPTS, chainAssign: assign });
  check(
    'keys stable over a re-read (same lines, same keys)',
    JSON.stringify(ch2.chainLines) === JSON.stringify(lines0),
  );
  check(
    're-read: the same answers land the same way',
    ch2.lineAssign!.applied.length === wrong.length && !ch2.lineAssign!.stale.length,
  );
  const after = await pieces();
  const set2 = setOf();
  for (const [ni, nest] of nests.entries()) {
    const fb = strip(before.pc, nest);
    const fa = strip(after.pc, nest);
    const sd = after.pc.seeds.find((x) => x.id === fa?.seed);
    const desc = (f: typeof fa) =>
      [0, 1].map((r) => {
        const c = f?.candidates.find((x) => x.rank === r);
        return c
          ? `${CARD[r].token}:${c.outcome} ${(c.areaMm2 / 100).toFixed(0)}cm² walls ${c.walls
              .filter((w) => nest.some((n) => n.id === w))
              .map((w) => '#' + w)
              .join(',')}`
          : `${CARD[r].token}: —`;
      });
    console.log(
      `   strip nest ${ni} (${sd?.text?.text ?? sd?.origin ?? '?'})  before: ${desc(fb).join(' | ')}`,
    );
    console.log(`   strip nest ${ni}                after: ${desc(fa).join(' | ')}`);
    for (const r of [0, 1]) {
      const c = fa?.candidates.find((x) => x.rank === r);
      const own = nest[r].id;
      check(
        `nest ${ni} size ${CARD[r].token}: closed on its own outline #${own}`,
        !!c &&
          c.outcome === 'closed' &&
          c.walls.includes(own) &&
          iou(c.bbox, boxOf(nest[r].pts)) > 0.9,
        c ? `${c.outcome}, walls ${c.walls.length}` : 'no candidate',
      );
    }
  }
  check(
    'every piece still closes in every size after the answers',
    after.pc.families.every((f) => f.candidates.every((c) => c.outcome === 'closed')),
    after.pc.families
      .flatMap((f) =>
        f.candidates
          .filter((c) => c.outcome !== 'closed')
          .map((c) => `${f.seed}:${c.rank}:${c.outcome}`),
      )
      .join(' '),
  );
  check(
    'ChainSet.assigned kept through the sizes and pieces stages',
    (set2.assigned?.length ?? 0) === wrong.length,
  );

  // ── LINEASSIGN-2 on kombinezon ──
  const twice = (cs: { classes: LineClass[] }) =>
    cs.classes
      .filter((c) => new Set(c.chains).size !== c.chains.length)
      .map((c) => `#${c.id} ${c.role}: ${c.chains.filter((x, i) => c.chains.indexOf(x) !== i)}`);
  check(
    'no row lists a line twice (OCG copies of two kept lines)',
    !twice(ch0).length,
    twice(ch0).join('; '),
  );
  check(
    'suspects: none on a read where every nest outline sits in its place',
    ch0.suspects?.length === 0,
    JSON.stringify(ch0.suspects?.slice(0, 3)),
  );
  const per = (o: StageIO['chains']['out']) => (o.outlines ?? []).map((x) => x.n);
  check(
    'outlines: every size row closes as many outlines as the next (kombinezon 7)',
    per(ch0).length === 8 && per(ch0).every((x) => x === per(ch0)[0] && x >= nests.length),
    per(ch0).join(','),
  );
  // the layer-6 strip nest: size 18's outline drawn with size 8's dash (printed "18" on the page)
  const penOf = (id: number) => parseLineKey(lines0[id].key)?.pen;
  const l6 = nests.find((ns) => penOf(ns[6].id) === penOf(ns[1].id));
  check("kombinezon: the strip nest whose size-18 outline is drawn in size 8's pen", !!l6);
  if (l6) {
    const c18 = l6[6].id;
    const own = await run('chains', {
      opts: OPTS,
      chainAssign: [{ sheet: lines0[c18].sheet, keys: [lines0[c18].key], to: { rank: 6 } }],
    });
    const ra = own.lineAssign!;
    console.log(
      `   #${c18} → 18: flags ${JSON.stringify(ra.flags)} notes ${ra.notes?.map((x) => x.detail)}`,
    );
    check(
      `#${c18} answered into 18: no pen flag, one pen-slip note (nest place + the pen's own size-8 outline #${l6[1].id})`,
      ra.applied.length === 1 &&
        !ra.flags.length &&
        ra.notes?.length === 1 &&
        ra.notes[0].kind === 'pen-slip',
    );
    const ra8 = (
      await run('chains', {
        opts: OPTS,
        chainAssign: [
          { sheet: lines0[l6[1].id].sheet, keys: [lines0[l6[1].id].key], to: { rank: 6 } },
        ],
      })
    ).lineAssign!;
    check(
      `mutation: size 8's outline #${l6[1].id} answered into 18 → pen flag, no note`,
      ra8.flags.some((f) => f.kind === 'pen') && !ra8.notes?.length,
      JSON.stringify(ra8.flags),
    );
  }
  // the read before SIZESOCG (what the PATTERNS UI saw on int/batch1): strips in the wrong rows
  process.env.SIZESOCG_OFF = '1';
  let old: StageIO['chains']['out'];
  try {
    old = await run('chains', { opts: OPTS });
  } finally {
    delete process.env.SIZESOCG_OFF;
  }
  const oldSet = setOf();
  check(
    'pre-SIZESOCG read: no row lists a line twice (was #110 twice in ignore)',
    !twice(old).length,
    twice(old).join('; '),
  );
  const sus = old.suspects ?? [];
  const placeOf = new Map(nests.flatMap((ns) => ns.map((c, k) => [c.id, k] as const)));
  const rankRow = (k: number) =>
    old.classes.find(
      (c) =>
        c.role === 'size' && c.evidence.some((e) => e.kind === 'nesting-order' && e.rank === k),
    )?.id;
  console.log(
    `   pre-SIZESOCG suspects ${sus.length}: ${sus.map((x) => `#${x.chain}→${x.suggest}:${x.pen}`).join(' ')}`,
  );
  check(
    "pre-SIZESOCG: 14 suspects, each a strip outline, suggested its nest place's size",
    sus.length === 14 &&
      sus.every((x) => placeOf.has(x.chain) && x.suggest === rankRow(placeOf.get(x.chain)!)),
  );
  check(
    "pre-SIZESOCG: the size-18 outline in size 8's pen is a 'slip', no suspect's pen is 'against'",
    !!l6 &&
      sus.find((x) => x.chain === l6[6].id)?.pen === 'slip' &&
      !sus.some((x) => x.pen === 'against'),
  );
  check(
    'pre-SIZESOCG: outlines per size uneven before the answers',
    new Set(per(old)).size > 1,
    per(old).join(','),
  );
  // the one click: every suspect into its suggestion
  const byRow = new Map<number, number[]>();
  for (const x of sus) byRow.set(x.suggest, [...(byRow.get(x.suggest) ?? []), x.chain]);
  const keyOfRow = (id: number) => {
    const c = old.classes.find((r) => r.id === id)!;
    return c.sig ?? `#${c.id}`;
  };
  const click: ChainAssign[] = [...byRow].map(([r, ids]) => ({
    sheet: old.chainLines![ids[0]].sheet,
    keys: ids.map((i) => old.chainLines![i].key),
    to: { row: keyOfRow(r) },
  }));
  process.env.SIZESOCG_OFF = '1';
  let fixed: StageIO['chains']['out'];
  try {
    fixed = await run('chains', { opts: OPTS, chainAssign: click });
  } finally {
    delete process.env.SIZESOCG_OFF;
  }
  const fr = fixed.lineAssign!;
  console.log(
    `   one click: applied ${fr.applied.length}, flags ${fr.flags.map((f) => f.detail)}, notes ${fr.notes?.map((x) => x.detail)}; outlines ${per(fixed)}`,
  );
  check(
    'one click: 14 applied, no pen flag, one pen-slip note (the size-18 outline)',
    fr.applied.length === 14 &&
      !fr.flags.length &&
      fr.notes?.length === 1 &&
      fr.notes[0].chain === l6?.[6].id,
  );
  check('one click: no suspect left', fixed.suspects?.length === 0);
  check(
    'one click: every size closes as many outlines (7)',
    per(fixed).every((x) => x === per(ch0)[0]),
    per(fixed).join(','),
  );
  void oldSet;
}

export async function main(): Promise<boolean> {
  crafted();
  walls();
  nestsCrafted();
  if (!process.env.LA_CRAFTED_ONLY) await kombinezon();
  console.log(fails ? `\n${fails} FAIL` : '\nall PASS');
  return fails > 0;
}
