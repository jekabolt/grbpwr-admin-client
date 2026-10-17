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
  check(
    "the owner's report reproduced: strip outlines of 6 / 8 read in another row",
    wrong.length > 0,
    wrong.map((w) => `#${w.id}→${CARD[w.k].token}`).join(' '),
  );
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
}

export async function main(): Promise<boolean> {
  crafted();
  walls();
  if (!process.env.LA_CRAFTED_ONLY) await kombinezon();
  console.log(fails ? `\n${fails} FAIL` : '\nall PASS');
  return fails > 0;
}
