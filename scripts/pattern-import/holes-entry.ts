// PATTERN-IMPORT · UXHOOKS probe — the two engine hooks the wizard asked for (auto/UX-HOOKS.md):
//   1 · missing pages accepted as BLANK (`sheet-accept-missing`, Sheet.holes): crafted units —
//       the cell geometry, the accept (pages key, refused untouched), the autopilot's two-evidence
//       rule, the hole guard (a cut line / a region through the hole never closes; the operator's
//       own bridge stays) — then the corpus: a tile dropped from Alghero (a Mood letter grid), r4454
//       and polupalto (D6, index labels), BEFORE (no answer: the blocker; the fill as it is) and
//       AFTER (accepted: no blocker, no piece closed across the hole, the other sheet untouched);
//       the real wizard hook with the autopilot: it stops on the missing pages, the operator's
//       click accepts them, the run goes on and the manifest carries the holes;
//   2 · `asideReviewed`: the pieces offer drops on the reviewed set, a changed set asks again, the
//       autopilot never sets it, the replay record carries it as the operator's.
//   node scripts/pattern-import/holes.mjs [--units] [--explore]   (yarn patimport:holes)
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleAllSheets, classifyPages } from 'lib/pattern-import/assemble';
import {
  acceptMissing,
  cellGeometry,
  holeAutoEvidence,
  holePagesKey,
  missingEvidence,
} from 'lib/pattern-import/assemble/holes';
import { holeCuts, holeGuard, holeHit } from 'lib/pattern-import/pieces/holes';
import { readManifest } from 'lib/pattern-import/manifest';
import type {
  Chain,
  ChainSet,
  PageClassification,
  PagePose,
  PieceCandidate,
  PieceFamily,
  SetAside,
  Sheet,
  SheetHole,
  SheetPart,
} from 'lib/pattern-import/types';
import {
  ANSWERS,
  answerProblem,
  asideDigests,
  openAsides,
  stepOffer,
} from 'components/managers/tech-card/components/pattern-import/auto-advance';
import { decide } from 'components/managers/tech-card/components/pattern-import/autopilot/policy';
import { answerRecordOf } from 'components/managers/tech-card/components/pattern-import/autopilot/replay-record';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  resolve(
    process.env.PATIMPORT_PLANS ??
      '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf',
    'corpus',
  );
export const ALGHERO = [
  process.env.PATIMPORT_ALGHERO,
  '/private/tmp/alghero-dx/src/alghero.pdf',
  '/Users/jekabolt/Downloads/archive 600 pcs/dresses/MDF445-Alghero-One-Shoulder-Dress-Free-Sewing-Pattern-Sizes-XS-5XL-A4-Letter-Patterns-Mood-Fabrics.pdf',
].find((x): x is string => !!x && existsSync(x));

let fails = 0;
export const check = (name: string, ok: boolean, got: unknown = '') => {
  if (!ok) fails++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${got === '' ? '' : ` · ${typeof got === 'string' ? got : JSON.stringify(got)}`}`,
  );
};

const bytesOf = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// ── explore: which dropped tile leaves a missing cell the drawing runs into ─────────────────────
async function explore(path: string) {
  const doc = await extractPdf({ id: '0', name: path, bytes: bytesOf(path) }, DEFAULT_EXTRACT_OPTS);
  const classes = classifyPages([doc]);
  const base = assembleAllSheets([doc], classes).sheet;
  const tiles = classes.filter((c) => c.cls === 'tile');
  console.log(
    `${path}: ${tiles.length} tiles, sheets ${[...new Set(tiles.map((t) => t.sheet ?? 0))].join(',')}, missing ${base.missing.length}`,
  );
  for (const t of tiles) {
    const pose = base.poses.find((p) => p.file === t.file && p.page === t.page);
    const cls = classes.map(
      (c): PageClassification =>
        c === t ? { ...c, cls: 'instructions', why: 'probe: dropped' } : c,
    );
    const sh = assembleAllSheets([doc], cls).sheet;
    const ev = missingEvidence(sh, sh.missing);
    console.log(
      `  drop p${t.page + 1} (sheet ${t.sheet ?? 0}, r${pose?.row} c${pose?.col}): missing ${
        ev
          .map(
            (m) =>
              `s${m.sheet} r${m.row} c${m.col} ends ${m.lineEnds} out ${m.outside} lab ${m.labels ?? '-'}`,
          )
          .join(' | ') || 'none'
      }${sh.refused?.length ? ` REFUSED ${sh.refused[0].slice(0, 80)}` : ''}`,
    );
  }
}

// ── 1 · crafted units ──────────────────────────────────────────────────────────────────────────
const W = 210;
const H = 297;
const PX = 190; // pitch: 20 mm overlap
const PY = 277;
const pose = (row: number, col: number, page: number): PagePose => ({
  file: '0',
  page,
  toSheet: { a: 1, b: 0, c: 0, d: 1, e: col * PX, f: -row * PY },
  widthMm: W,
  heightMm: H,
  row,
  col,
  residualMm: 0,
});
const chain = (id: number, pts: { x: number; y: number }[], closed = false): Chain =>
  ({ id, pts, closed, style: 0, lengthMm: 100, ranges: [] }) as unknown as Chain;
const cand = (over: Partial<PieceCandidate>): PieceCandidate => ({
  seed: 1,
  rank: 0,
  outer: [],
  walls: [],
  inside: [],
  textsInside: [],
  outcome: 'closed',
  areaMm2: 1000,
  bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  sourceCoverage: 1,
  p95Mm: 0,
  ...over,
});
const fam = (seed: number, cs: PieceCandidate[]): PieceFamily =>
  ({ seed, candidates: cs, monotone: true }) as unknown as PieceFamily;

/** A whole wizard Inputs (the empty one) with these fields over it. */
const inputsOf = (over: Record<string, unknown> = {}) => ({
  cleanEdits: [],
  scaleIndex: 0,
  manualMeasuredMm: null,
  scaleConfirmed: false,
  gridOverride: undefined,
  sheetIndex: 0,
  residualsAccepted: false,
  sheetAcceptMissing: [],
  sheetAnswers: {},
  legend: [],
  asideReviewed: {},
  legendConfirmed: [],
  sizeMap: null,
  drawnSizes: null,
  drawnSizesAt: null,
  variant: null,
  clickSeeds: [],
  edits: [],
  fileAllowance: null,
  overrides: {},
  operatorGrain: {},
  operatorFold: {},
  foldListChecked: [],
  confirmedNames: [],
  editedNames: [],
  confirmedQuantities: {},
  assignment: null,
  answerCtx: null,
  autopilot: [],
  ...over,
});

function units() {
  // a 2 × 2 grid, cell (1,1) missing
  const poses = [pose(0, 0, 0), pose(0, 1, 1), pose(1, 0, 2)];
  const g = cellGeometry(poses, '0', 1, 1);
  check(
    'u1 cell geometry: the missing page sits at its lattice place; the uncovered part is its box less the neighbours',
    !!g &&
      Math.abs(g.box.minX - PX) < 1e-6 &&
      Math.abs(g.box.maxY - (-PY + H)) < 1e-6 &&
      !!g.open &&
      Math.abs(g.open.minX - W) < 1e-6 &&
      Math.abs(g.open.maxY - 0) < 1e-6,
    g,
  );
  const box = g!.box;
  const open = g!.open;
  const mid = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  // the sheet: a line runs from tile (0,1) down into the missing cell, cut at the page edge
  const cut = { x: PX + 60, y: box.maxY - 5 };
  const sheet: Sheet = {
    id: 0,
    poses,
    pairs: [],
    bbox: { minX: 0, minY: -PY, maxX: PX + W, maxY: H },
    missing: [{ row: 1, col: 1, sheet: 0, file: '0', box, open }],
    paths: [
      { id: 0, pts: [{ x: PX + 60, y: 200 }, cut], closed: false, style: 0 },
      {
        id: 1,
        pts: [
          { x: 10, y: 10 },
          { x: 100, y: 10 },
        ],
        closed: false,
        style: 0,
      },
    ] as unknown as Sheet['paths'],
    texts: [],
    rasters: [],
    styles: [],
    warnings: [],
    parts: [
      {
        sheet: 0,
        pages: poses.map((p) => ({ file: p.file, page: p.page })),
        dx: 0,
        dy: 0,
        box: { minX: 0, minY: -PY, maxX: PX + W, maxY: H },
        maxResidualMm: 0,
        missing: 1,
      },
    ],
  };
  const ev = missingEvidence(sheet, sheet.missing);
  check('u2 evidence: the line the hole cuts is counted (1 end)', ev[0].lineEnds === 1, ev[0]);
  check(
    'u3 two evidences: a line ends in the cell → never automatic',
    holeAutoEvidence(ev[0]) === null,
  );
  check(
    'u4 two evidences: no line end + outside the line work → automatic',
    (holeAutoEvidence({ ...ev[0], lineEnds: 0, outside: true })?.length ?? 0) >= 2,
  );
  check(
    'u5 one evidence only (no line end, inside the line work, no labels) → the operator',
    holeAutoEvidence({ ...ev[0], lineEnds: 0, outside: false }) === null,
  );
  check(
    'u6 labels with a gap → never automatic, whatever else',
    holeAutoEvidence({ ...ev[0], lineEnds: 0, outside: true, labels: 'gap' }) === null,
  );
  check(
    'u7 labels complete + no line end → automatic',
    (holeAutoEvidence({ ...ev[0], lineEnds: 0, outside: false, labels: 'complete' })?.length ??
      0) >= 2,
  );
  const withEv = { ...sheet, missing: ev };
  const key = holePagesKey(withEv, 0);
  const acc = acceptMissing(withEv, [{ sheet: 0, cells: [{ row: 1, col: 1 }], pages: key }]);
  check(
    'u8 accept: the cell leaves `missing`, joins `holes` (operator), the part counts 0 missing',
    !acc.missing.length &&
      acc.holes?.length === 1 &&
      acc.holes[0].origin === 'operator' &&
      acc.parts?.[0].missing === 0,
    { missing: acc.missing.length, holes: acc.holes?.map((h) => [h.row, h.col, h.origin]) },
  );
  const stale = acceptMissing(withEv, [{ sheet: 0, cells: [{ row: 1, col: 1 }], pages: 'x' }]);
  check(
    'u9 mutation: an answer given on other pages is dropped (still missing)',
    stale.missing.length === 1,
  );
  const other = acceptMissing(withEv, [{ sheet: 0, cells: [{ row: 0, col: 2 }], pages: key }]);
  check(
    'u10 mutation: an answer for another cell accepts nothing',
    other.missing.length === 1 && !other.holes,
  );
  const ref = acceptMissing({ ...withEv, refused: ['the hand grid contradicts'] }, [
    { sheet: 0, cells: [{ row: 1, col: 1 }], pages: key },
  ]);
  check('u11 a refused placement stays refused after the accept', ref.refused?.length === 1);

  // the guard
  const holes = acc.holes as SheetHole[];
  const set = {
    chains: [
      chain(0, [{ x: PX + 60, y: 200 }, cut]), // cut by the hole
      chain(1, [
        { x: PX + 60, y: 200 },
        { x: PX + 150, y: 200 },
        { x: PX + 150, y: 100 },
      ]),
      chain(2, [
        { x: 10, y: 10 },
        { x: 100, y: 10 },
        { x: 100, y: 100 },
        { x: 10, y: 10 },
      ]),
    ],
  } as Pick<ChainSet, 'chains'>;
  const ring = [
    { x: PX + 60, y: 200 },
    { x: PX + 150, y: 200 },
    { x: PX + 150, y: 100 },
    { x: PX + 60, y: 100 },
  ];
  const fams = [
    fam(1, [cand({ seed: 1, outer: ring, walls: [0, 1] })]),
    fam(2, [
      cand({
        seed: 2,
        outer: [
          { x: 10, y: 10 },
          { x: 100, y: 10 },
          { x: 100, y: 100 },
        ],
        walls: [2],
      }),
    ]),
    // a region running through the uncovered part (walls not cut)
    fam(3, [
      cand({
        seed: 3,
        outer: [{ x: 50, y: -50 }, mid, { x: 50, y: -100 }],
        walls: [2],
      }),
    ]),
    // the operator closed it himself next to the hole
    fam(4, [
      cand({
        seed: 4,
        outer: ring,
        walls: [0, 1],
        derived: [{ kind: 'operator-bridge', pts: [cut, { x: PX + 60, y: 100 }] }],
      }),
    ]),
  ];
  const out = holeGuard(fams, set, holes);
  const c = (seed: number) => out.find((f) => f.seed === seed)!.candidates[0];
  check(
    'u12 guard: a piece whose wall line the hole cuts is a leak (on the cut), never closed',
    c(1).outcome === 'leak' &&
      c(1).hole?.why === 'cut-line' &&
      c(1).hole?.was === 'closed' &&
      c(1).leakAt?.y === cut.y,
    c(1).hole,
  );
  check('u13 guard: a piece away from the hole stays as it was (same object)', out[1] === fams[1]);
  check(
    'u14 guard: a region through the uncovered part is a leak',
    c(3).outcome === 'leak' && c(3).hole?.why === 'through-hole',
  );
  check("u15 guard: the operator's own bridge at the hole stays closed", c(4).outcome === 'closed');
  check('u16 guard: no holes → the families as they were', holeGuard(fams, set, []) === fams);
  check(
    'u17 mutation: the hole guard off (no holes) leaves the cut piece closed — the check sees it',
    !!holeHit(fams[0].candidates[0], holeCuts(set, holes)),
  );

  // Codex r1: an outline edge crossing the uncovered part with both ends outside it
  const crossing = fam(5, [
    cand({
      seed: 5,
      outer: [
        { x: open!.minX - 30, y: mid.y },
        { x: open!.maxX + 30, y: mid.y },
        { x: open!.maxX + 30, y: mid.y - 400 },
        { x: open!.minX - 30, y: mid.y - 400 },
      ],
      walls: [2],
    }),
  ]);
  check(
    'u22 guard: a straight edge across the uncovered part (ends outside) is a leak too',
    holeGuard([crossing], set, holes)[0].candidates[0].hole?.why === 'through-hole',
  );
  // Codex r1: the answer is bound to the grid (pages AND their cells), not to the pages only
  const moved = {
    ...withEv,
    poses: withEv.poses.map((p) => (p.page === 2 ? { ...p, col: 2 } : p)),
  };
  check(
    'u23 the same pages on another grid are another key (the answer is asked again)',
    holePagesKey(moved, 0) !== key &&
      acceptMissing(moved, [{ sheet: 0, cells: [{ row: 1, col: 1 }], pages: key }]).missing
        .length === 1,
  );
  check(
    "u24 a cell named with another file is not this file's answer",
    acceptMissing(withEv, [{ sheet: 0, cells: [{ row: 1, col: 1, file: '7' }], pages: key }])
      .missing.length === 1,
  );

  // the policy on the sheet step
  const sessionOf = (sh: Partial<Sheet>) =>
    ({
      step: 'sheet',
      busy: null,
      error: null,
      files: [],
      sheet: { sheet: { poses: [], ...sh } },
    }) as never;
  const inp = inputsOf() as never;
  const d1 = decide({
    session: sessionOf({ missing: ev, parts: sheet.parts }),
    inputs: inp,
    card: { sizes: [] } as never,
    question: 'q',
  });
  check(
    "u18 autopilot: a missing page lines run into → it stops (the operator's answer)",
    !!d1.stop && /pages are missing/.test(d1.stop.reason) && !d1.actions.length,
    d1.stop?.reason,
  );
  const d2 = decide({
    session: sessionOf({ missing: [{ ...ev[0], lineEnds: 0, outside: true }], parts: sheet.parts }),
    inputs: inp,
    card: { sizes: [] } as never,
    question: 'q',
  });
  const a2 = d2.actions[0];
  check(
    'u19 autopilot: two evidences → "blank page", recorded (missing-accepted)',
    !d2.stop &&
      a2?.kind === 'accept-missing' &&
      a2.cells.length === 1 &&
      d2.assumptions.some((a) => a.kind === 'missing-accepted' && a.evidence.length >= 2),
    { actions: d2.actions, as: d2.assumptions.map((a) => a.kind) },
  );
  // Codex r1: a stale stored answer (dropped by the worker) is never re-sent under a new stamp
  const d2b = decide({
    session: sessionOf({
      missing: [{ ...ev[0], lineEnds: 0, outside: true }],
      parts: sheet.parts,
      holes: [],
    }),
    inputs: inputsOf({
      sheetAcceptMissing: [
        { sheet: 0, cells: [{ row: 7, col: 7 }], pages: 'stale', origin: 'operator' },
      ],
    }) as never,
    card: { sizes: [] } as never,
    question: 'q',
  });
  const a2b = d2b.actions[0];
  check(
    'u25 the autopilot sends only the cells accepted now + its own (never a stale stored cell)',
    a2b?.kind === 'accept-missing' &&
      a2b.cells.length === 1 &&
      a2b.cells[0].row === 1 &&
      a2b.cells[0].origin === 'autopilot',
    a2b,
  );
  const d3 = decide({
    session: sessionOf({
      missing: [{ ...ev[0], lineEnds: 0, outside: true }],
      refused: ['two pages print "B8"'],
    }),
    inputs: inp,
    card: { sizes: [] } as never,
    question: 'q',
  });
  check(
    'u20 autopilot: a refused placement stops before any accept',
    !!d3.stop && /refused/.test(d3.stop.reason) && !d3.actions.length,
  );
  check(
    "u21 the answer is the sheet step's own (event allowed), asideReviewed only on pieces",
    answerProblem('sheet', { events: [{ type: 'sheet-accept-missing', sheet: 0, cells: [] }] }) ===
      null &&
      answerProblem('pieces', { patch: { asideReviewed: {} } as never }) === null &&
      answerProblem('sheet', { patch: { asideReviewed: {} } as never }) !== null &&
      ANSWERS.sheet.events.includes('sheet-accept-missing'),
  );

  // 2 · asideReviewed
  const parts: SheetPart[] = [
    {
      sheet: 0,
      pages: [],
      dx: 0,
      dy: 0,
      box: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
      maxResidualMm: 0,
      missing: 0,
    },
    {
      sheet: 1,
      pages: [],
      dx: 1300,
      dy: 0,
      box: { minX: 1300, minY: 0, maxX: 2300, maxY: 1000 },
      maxResidualMm: 0,
      missing: 0,
    },
  ];
  const aside = (id: number, x: number, area = 5000): SetAside => ({
    id,
    at: { x, y: 100 },
    box: { minX: x - 10, minY: 90, maxX: x + 10, maxY: 110 },
    areaMm2: area,
    reason: 'unlabelled',
  });
  const weak = [aside(1, 100), aside(2, 1500)];
  const piecesSession = (setAside: SetAside[]) => ({
    step: 'pieces' as const,
    clean: null,
    pages: [],
    sheet: { sheet: { parts } } as never,
    chains: null,
    sizes: null,
    pieces: { setAside, families: [], seeds: [] } as never,
    fabrics: null,
    semantics: null,
    presegmented: false,
    cleanEdits: [],
    scopes: 1,
    fabricsEdited: false,
  });
  const offer0 = stepOffer(piecesSession(weak));
  const dig = asideDigests(weak, parts);
  const offer1 = stepOffer({ ...piecesSession(weak), asideReviewed: dig });
  check(
    'a1 the pieces step offers the set-asides; reviewed (both sheets) → no offer',
    !!offer0 && offer1 === null,
    { offer0, offer1 },
  );
  const offer2 = stepOffer({ ...piecesSession(weak), asideReviewed: { 0: dig[0] } });
  check(
    "a2 reviewed on sheet 1 only → sheet 2's outline is still offered",
    /^1 piece-sized/.test(offer2 ?? ''),
    offer2,
  );
  const changed = [aside(1, 100), aside(2, 1500, 9000)];
  const offer3 = stepOffer({ ...piecesSession(changed), asideReviewed: dig });
  check(
    'a3 a changed set (an outline grew) asks again',
    /^1 piece-sized/.test(offer3 ?? ''),
    offer3,
  );
  const more = [...weak, aside(3, 400)];
  check(
    'a4 another outline on a reviewed sheet asks again',
    openAsides(more, parts, dig).length === 2,
  );
  const onePiece = fam(9, [
    cand({
      seed: 9,
      outer: [
        { x: 500, y: 500 },
        { x: 900, y: 500 },
        { x: 900, y: 900 },
        { x: 500, y: 900 },
      ],
      bbox: { minX: 500, minY: 500, maxX: 900, maxY: 900 },
      areaMm2: 160000,
    }),
  ]);
  // the autopilot on the pieces offer: it never sets asideReviewed (it answers its own way)
  const dp = decide({
    session: {
      step: 'pieces',
      busy: null,
      error: null,
      files: [],
      variant: null,
      sheet: { sheet: { parts } },
      pieces: {
        setAside: weak,
        families: [onePiece],
        seeds: [{ id: 9, at: { x: 600, y: 600 }, origin: 'text' }],
        sheets: undefined,
      },
    } as never,
    inputs: inputsOf() as never,
    card: { sizes: [] } as never,
    question: 'q',
  });
  check(
    'a5 the autopilot never sets asideReviewed (unreviewed: it stops on the guess)',
    !JSON.stringify(dp.actions).includes('asideReviewed') &&
      /set aside on a guess/.test(dp.stop?.reason ?? ''),
    { actions: dp.actions.map((a) => a.kind), stop: dp.stop?.reason },
  );
  const dr = decide({
    session: {
      step: 'pieces',
      busy: null,
      error: null,
      files: [],
      variant: null,
      sheet: { sheet: { parts } },
      pieces: {
        setAside: weak,
        families: [onePiece],
        seeds: [{ id: 9, at: { x: 600, y: 600 }, origin: 'text' }],
        sheets: undefined,
      },
    } as never,
    inputs: inputsOf({ asideReviewed: dig }) as never,
    card: { sizes: [] } as never,
    question: 'q',
  });
  check(
    'a6 reviewed: the autopilot has nothing to answer about the set-asides',
    !dr.stop && !dr.actions.length,
    dr.stop?.reason,
  );
  // the replay record: the review is the operator's, the passed list only the open part
  const rec = answerRecordOf(
    {
      step: 'pieces',
      files: [],
      pages: [],
      clean: null,
      scale: { candidates: [], decision: null },
      sheet: { sheet: { parts, poses: [], missing: [] } },
      pieces: { setAside: weak, families: [], seeds: [] },
      names: [],
      semantics: null,
      variant: null,
    } as never,
    inputsOf({ asideReviewed: { 0: dig[0] } }) as never,
    null,
    { scopes: [] } as never,
    false,
  );
  const rv = rec?.answers.find((a) => a.kind === 'asides-reviewed');
  const ps = rec?.answers.find((a) => a.kind === 'asides-passed');
  check(
    "a7 replay record: asides-reviewed (operator, sheet 1 digest), asides-passed only sheet 2's outline",
    !!rv &&
      !rv.auto &&
      (rv.value as { digests: Record<string, string> }).digests['0'] === dig[0] &&
      ((ps?.value as { asides?: unknown[] } | undefined)?.asides?.length ?? 0) === 1,
    { rv, ps },
  );
}

// ── corpus ───────────────────────────────────────────────────────────────────────────────────────
type CorpusCase = { id: string; path: string; drop: number[]; card: string[] };

async function corpus(only: string[]) {
  const { CASES, runCase } = await import('./e2e-entry');
  void CASES;
  const cases: CorpusCase[] = [
    ...(ALGHERO
      ? [
          {
            id: 'alghero-L4',
            path: ALGHERO,
            drop: [45],
            card: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
          },
        ]
      : []),
    {
      id: 'r4454',
      path: resolve(CORPUS, 'pdf/r4454.pdf'),
      drop: (process.env.HOLES_R4454 ?? '').split(',').filter(Boolean).map(Number),
      card: ['44', '46', '48', '50', '52', '54'],
    },
    {
      id: 'polupalto',
      path: resolve(CORPUS, 'pdf/polupalto.pdf'),
      drop: (process.env.HOLES_POLUPALTO ?? '').split(',').filter(Boolean).map(Number),
      card: ['44', '46', '48', '50', '52', '54'],
    },
  ].filter((c) => (!only.length || only.includes(c.id)) && c.drop.length && existsSync(c.path));
  for (const cc of cases) {
    const c = {
      id: `holes:${cc.id}`,
      group: 'pdf',
      files: [cc.path],
      card: cc.card,
    } as unknown as Parameters<typeof runCase>[0];
    const cleanEdits = cc.drop.map((p) => ({ file: '0', page: p, role: 'instructions' as const }));
    const grab = () => {
      const r: {
        sheet?: Sheet;
        fams: PieceFamily[];
        chains?: ChainSet;
        missing?: number;
        manifest?: ReturnType<typeof readManifest>;
      } = { fams: [] };
      return r;
    };
    const runOnce = async (accept: boolean) => {
      const g = grab();
      const rec = await runCase(c, {
        cleanEdits,
        acceptMissing: accept,
        onAssemble: (out) => {
          g.missing = out.sheet.missing.length;
        },
        onPieces: (s) => {
          const x = s as unknown as { families: PieceFamily[]; sheet: Sheet; chains: ChainSet };
          g.fams = x.families ?? [];
          g.sheet = x.sheet;
          g.chains = x.chains;
        },
        onWrite: (_s, out) => {
          const m = out.scopes[0]?.manifest;
          if (m) g.manifest = m as ReturnType<typeof readManifest>;
        },
      });
      return { g, rec };
    };
    const t0 = Date.now();
    const before = await runOnce(false);
    const after = await runOnce(true);
    const holes = after.g.sheet?.holes ?? [];
    const cutsB = before.g.chains && holes.length ? holeCuts(before.g.chains, holes) : [];
    const across = (fams: PieceFamily[], cuts: ReturnType<typeof holeCuts>) =>
      fams.flatMap((f) =>
        f.candidates.filter((x) => holeHit(x, cuts)).map((x) => `${f.seed}:${x.rank}`),
      );
    const acrossBefore = across(before.g.fams, cutsB);
    const cutsA = after.g.chains && holes.length ? holeCuts(after.g.chains, holes) : [];
    const acrossAfter = across(after.g.fams, cutsA);
    const demoted = after.g.fams.flatMap((f) => f.candidates.filter((x) => x.hole)).length;
    const closed = (fams: PieceFamily[]) =>
      fams.reduce((n, f) => n + f.candidates.filter((x) => x.outcome === 'closed').length, 0);
    console.log(
      `      ${cc.id}: drop p${cc.drop.map((p) => p + 1).join(',')} · before: missing ${before.g.missing}, blocker ${before.rec.ops.some((o) => /pages missing/.test(o.label))}, closed ${closed(before.g.fams)}, closed across the hole ${acrossBefore.length} · after: missing ${after.g.missing}, holes ${holes.map((h) => `s${h.sheet} r${h.row} c${h.col} ends ${h.lineEnds}`).join(' ')}, closed ${closed(after.g.fams)}, held as leaks ${demoted} · clicks ${before.rec.clicks?.total ?? '?'} → ${after.rec.clicks?.total ?? '?'} · ${Math.round((Date.now() - t0) / 1000)} s`,
    );
    check(
      `${cc.id} before: the dropped page is missing and blocks the sheet step`,
      (before.g.missing ?? 0) > 0,
    );
    check(
      `${cc.id} after: accepted — nothing missing, the cells are holes`,
      after.g.missing === 0 && holes.length === before.g.missing,
      { holes: holes.length },
    );
    check(`${cc.id} after: no piece closes across a hole`, acrossAfter.length === 0, acrossAfter);
    check(
      `${cc.id} after: the pieces closed across the hole before are leaks now (${acrossBefore.length} → 0)`,
      demoted >= acrossBefore.length,
      { before: acrossBefore, demoted },
    );
    // pieces far from the hole: every family untouched by the guard closes as before
    const hit = new Set(
      after.g.fams.filter((f) => f.candidates.some((x) => x.hole)).map((f) => f.seed),
    );
    const same = before.g.fams
      .filter((f) => !hit.has(f.seed) && !acrossBefore.some((k) => k.startsWith(`${f.seed}:`)))
      .filter((f) => {
        const a = after.g.fams.find((x) => x.seed === f.seed);
        return (
          !a ||
          a.candidates.map((x) => x.outcome).join() !== f.candidates.map((x) => x.outcome).join()
        );
      });
    check(
      `${cc.id} after: every piece the hole does not touch is as before`,
      same.length === 0,
      same.map((f) => f.seed),
    );
    if (after.g.manifest) {
      const mh = after.g.manifest.source.holes ?? [];
      check(
        `${cc.id} manifest: source.holes per cell with line and chain ends`,
        mh.length === holes.length && mh.every((h) => h.origin === 'operator' && h.chainEnds >= 0),
        mh,
      );
    } else console.log(`      ${cc.id}: no written manifest (the run did not reach the write)`);
  }
}

// ── the real wizard hook with the autopilot: stop on the missing pages, the operator's click ──
async function hookRun(path: string, drop: number[], card: string[]) {
  const { sessionClient } = await import('./autopilot-entry');
  const { mountHook, rerender } = await import('./react-hook-shim');
  const { driveTick, newDriveState } = await import(
    'components/managers/tech-card/components/pattern-import/auto-drive'
  );
  const { hookDriveCtx, resolverFor } = await import(
    'components/managers/tech-card/components/pattern-import/autopilot'
  );
  const { useImportSession } = await import(
    'components/managers/tech-card/components/pattern-import/use-import-session'
  );
  const { stubBuildDraft } = await import(
    'components/managers/tech-card/components/pattern-import/stub-client'
  );
  type Api = ReturnType<typeof useImportSession>;
  const cardCtx = {
    techCardId: 4242,
    sizes: card.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] })),
    scopes: [
      {
        scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
        fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        bomLineKey: 'L1',
        label: 'main',
        isInterlining: false,
        sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
      },
    ],
    existingPieces: [],
    styleLabel: 'holes',
  } as never;
  const { client } = sessionClient();
  let api!: Api;
  mountHook(() => {
    api = useImportSession({
      client,
      card: cardCtx,
      namer: async () => [],
      buildDraft: stubBuildDraft,
      applyDraft: async () => ({ ok: true, uploaded: [] }),
    } as never);
  });
  const settle = async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
    rerender();
  };
  const name = path.split('/').pop()!;
  await api.dispatch({ type: 'files', files: [new File([bytesOf(path)], name)] });
  await settle();
  const file = api.session.files[0]?.id ?? '0';
  await api.dispatch({
    type: 'clean',
    edits: drop.map((p) => ({ file, page: p, role: 'instructions' as const })),
  });
  await settle();
  const stops: { step: string; why: string }[] = [];
  const auto = resolverFor(cardCtx, () => api);
  // the operator answers the files step's page-role question as the autopilot metric's controls
  // do (autopilot-entry `operatorPages`): the pages stay as read — not what this probe is about
  const resolve = ((snap: Parameters<typeof auto>[0]) => {
    const a = auto(snap);
    if (a.stop && a.reason?.step === 'files' && /is it a pattern page\?/.test(a.reason.reason))
      return { proceed: true, assumptions: [] };
    return a;
  }) as typeof auto;
  const drive = async () => {
    const st = newDriveState();
    for (let t = 0; t < 300; t++) {
      const r = await driveTick(
        st,
        hookDriveCtx(() => api, settle, resolve),
      );
      await settle();
      if (r.kind === 'stopped') {
        stops.push({ step: api.session.step, why: `${r.why}: ${r.reason ?? r.question ?? ''}` });
        return;
      }
    }
  };
  await drive();
  const first = stops[0];
  check(
    `hook ${name}: the autopilot stops on the sheet step's missing pages (the operator's answer)`,
    first?.step === 'sheet' && /pages are missing/.test(first.why),
    first,
  );
  const blockerBefore = api.blocker;
  await api.acceptMissing();
  await settle();
  check(
    `hook ${name}: one click — nothing missing, the cells are holes, the blocker is gone`,
    !api.session.sheet?.sheet.missing.length &&
      (api.session.sheet?.sheet.holes?.length ?? 0) > 0 &&
      api.inputs.sheetAcceptMissing.every((a) => a.origin === 'operator') &&
      !/missing/.test(api.blocker ?? ''),
    { before: blockerBefore, after: api.blocker, holes: api.session.sheet?.sheet.holes?.length },
  );
  await drive();
  const last = stops[stops.length - 1];
  const holes = api.session.sheet?.sheet.holes ?? [];
  const fams = api.session.pieces?.families ?? [];
  const leaks = fams.flatMap((f) => f.candidates.filter((c) => c.hole)).length;
  console.log(
    `      hook ${name}: after the click the autopilot ran to ${last?.step} (${last?.why.slice(0, 140)}) · pieces ${fams.length}, held as leaks by the holes ${leaks} · assumptions ${api.inputs.autopilot.map((a) => a.kind).join(',')}`,
  );
  check(
    `hook ${name}: the autopilot went past the sheet step and never answered the holes itself`,
    stops.length >= 2 &&
      !!last &&
      ['sizes', 'pieces', 'meaning', 'fabrics', 'check', 'apply'].includes(last.step) &&
      !api.inputs.autopilot.some((a) => a.kind === 'missing-accepted'),
    last,
  );
  check(
    `hook ${name}: no closed piece runs into the uncovered part of a hole`,
    !fams.some((f) =>
      f.candidates.some(
        (c) => c.outcome === 'closed' && holeHit(c, holeCuts({ chains: [] }, holes)),
      ),
    ),
  );
}

/** The worker session alone (extract → clean with the drop → scale → assemble): what it misses. */
async function sessionDrop(path: string, drops: number[]) {
  const { Session } = await import('lib/pattern-import/worker/session');
  const ctx = { checkCancel: () => {}, progress: () => {} };
  const s = new Session(1, [{ name: path.split('/').pop()!, bytes: bytesOf(path) }]);
  const ex = await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx);
  const file = ex.files[0].id;
  const cl = await s.runStage(
    'clean',
    { edits: drops.map((p) => ({ file, page: p, role: 'instructions' as const })) },
    ctx,
  );
  const best = cl.scale[0] ?? ex.scale[0];
  await s.runStage(
    'scale',
    { decision: { factor: best.factor, method: best.method, operatorConfirmed: true } },
    ctx,
  );
  const as = await s.runStage('assemble', { sheet: 0 }, ctx);
  const tiles = cl.classes.filter((c) => c.cls === 'tile').map((c) => c.page + 1);
  console.log(
    `${path} drop ${drops.map((p) => p + 1)}: file ${file}, tiles ${tiles.length} (${tiles.includes(drops[0] + 1) ? 'STILL A TILE' : 'dropped'}), missing ${as.sheet.missing.map((m) => `s${m.sheet} r${m.row} c${m.col} ends ${m.lineEnds}`).join(' | ') || 'none'}, refused ${as.sheet.refused?.length ?? 0}`,
  );
}

export async function main(args: string[]): Promise<number> {
  if (args.includes('--session')) {
    const [pdf, ...pages] = args.filter((a) => !a.startsWith('--'));
    await sessionDrop(pdf, pages.map(Number));
    return 0;
  }
  if (args.includes('--explore')) {
    for (const p of args.filter((a) => !a.startsWith('--'))) await explore(p);
    return 0;
  }
  units();
  const only = args.filter((a) => !a.startsWith('--'));
  if (!args.includes('--units')) {
    await corpus(only);
    if (ALGHERO && (!only.length || only.includes('hook')))
      await hookRun(ALGHERO, [45], ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']);
  }
  console.log(fails ? `HOLES: ${fails} FAIL` : 'HOLES: all PASS');
  return fails ? 1 : 0;
}
