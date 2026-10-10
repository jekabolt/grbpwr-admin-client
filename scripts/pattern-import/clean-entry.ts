// PATTERN-IMPORT · A8 probe — the clean stage (lib/pattern-import/clean) on the corpus:
//   wm-M    wm M (corpus/pdf/wm_kka_15_01_m_wykroj.pdf, the owner's "complete failure" of 10.10):
//           grid, ROW/COLUMN labels, stroke text, the test square (and its scale candidate), the
//           watermark of the sheet pass masked; the legend before / after; per-kind undo, an
//           accepted suggestion, the page-role door; then every detector switched off in turn —
//           its check must fail (mutation check);
//   synth   the wall guard on a synthetic page: a text-like row of strokes a piece outline meets
//           is never masked (and is, with the guard switched off — mutation check);
//   walls <case>  a negative control through the whole e2e operator pass, twice: clean undone
//           (every kind kept) and clean on — no wall of a closed piece of the first run is masked
//           in the second.
// Bundled by clean.mjs (one child process per case, like e2e.mjs).
import type {
  BackgroundKind,
  ChainSet,
  IRPage,
  PageMaskEdit,
  PieceFamily,
  Sheet,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import { CLEAN, cleanPages } from 'lib/pattern-import/clean';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  answerCtxOf,
  maskRevOf,
} from 'components/managers/tech-card/components/pattern-import/answers';

import { readRawDxf } from 'lib/pattern-import/gate/reader';
import { readManifest } from 'lib/pattern-import/manifest';
import { chromeProblems } from 'lib/pattern-import/gate/checks';
import { CHROME_GATE, hairpins } from 'lib/pattern-import/gate/chrome';
import { existsSync, readdirSync } from 'node:fs';

import { CASES, runCase } from './e2e-entry';

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const WM_M = 'pdf/wm_kka_15_01_m_wykroj.pdf';

type Check = { section: string; check: string; ok: boolean; got: string };
const checks: Check[] = [];
const check = (section: string, name: string, ok: boolean, got: unknown) =>
  checks.push({
    section,
    check: name,
    ok,
    got: typeof got === 'string' ? got : JSON.stringify(got),
  });

const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });
const KINDS: BackgroundKind[] = [
  'grid',
  'tile-frame',
  'regmark',
  'tile-label',
  'watermark',
  'curve-text',
  'logo',
  'copyright',
  'table',
  'legend-swatch',
  'test-square',
  'stray',
];
/** "Clean off": every kind kept (the operator's per-kind undo on all of them). */
const ALL_OFF: PageMaskEdit[] = KINDS.map((kind) => ({ kind, keep: true }));

function fileOf(rel: string) {
  const b = readFileSync(resolve(CORPUS, rel));
  return {
    name: basename(rel),
    bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  };
}

// ── wm M ────────────────────────────────────────────────────────────────────────────────

type WmRun = {
  clean: StageIO['clean']['out'];
  sheetClean: NonNullable<StageIO['assemble']['out']['clean']> | null;
  legend: { role: string; n: number; lenM: number }[];
  scaleBest: StageIO['clean']['out']['scale'][number];
};

async function wmRun(edits: PageMaskEdit[]): Promise<WmRun> {
  const s = new Session(1, [fileOf(WM_M)]);
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) => s.runStage(st, input, ctx());
  await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const clean = await run('clean', { edits });
  const best = clean.scale[0];
  await run('scale', {
    decision: { factor: best.factor, method: best.method, operatorConfirmed: true },
  });
  const as = await run('assemble', { sheet: 0 });
  const ch = await run('chains', {
    opts: { joinGapMm: 3, joinAngleDeg: 15, joinLateralMm: 0.15 },
  });
  s.close();
  return {
    clean,
    sheetClean: as.clean ?? null,
    legend: ch.classes.map((k) => ({
      role: k.role,
      n: k.chains.length,
      lenM: +(k.totalLengthMm / 1000).toFixed(1),
    })),
    scaleBest: best,
  };
}

const live = (r: WmRun) => r.legend.filter((k) => k.role !== 'ignore');
const liveChains = (r: WmRun) => live(r).reduce((a, k) => a + k.n, 0);
/** Lines of a kind offered (not applied) by the sheet pass, and whether any of it is auto. */
const sheetOffered = (r: WmRun, kind: BackgroundKind) =>
  (r.sheetClean?.items ?? [])
    .filter((i) => i.kind === kind && !i.applied)
    .reduce((a, i) => a + i.lines, 0);
const sheetAuto = (r: WmRun, kind: BackgroundKind) =>
  (r.sheetClean?.items ?? []).some((i) => i.kind === kind && i.status === 'auto');
const pageItems = (r: WmRun, kind: BackgroundKind) =>
  r.clean.pages.flatMap((p) => p.items.filter((i) => i.kind === kind));

/**
 * The wm M checks — each names the detector it rests on (the mutation check switches it off).
 * Round 2 (D3 until A9): only repetition or an explicit keyword masks by itself; the stroke text,
 * the watermark, the test square without its keyword are one-click suggestions per kind.
 */
function wmChecks(section: string, r: WmRun, base: WmRun | null, record = true) {
  const sm = r.clean.summary;
  const off = r.clean.offered;
  const out: { name: string; on: keyof typeof CLEAN.on | null; ok: boolean; got: unknown }[] = [];
  const sq = r.clean.scaleHints[0];
  out.push({
    name: 'test square (lettering, no keyword) offered, not masked; its scale candidate ≤ 0.6',
    on: 'square',
    ok:
      !!sq &&
      sq.confidence <= 0.6 &&
      (off['test-square'] ?? 0) === 4 &&
      !sm['test-square'] &&
      pageItems(r, 'test-square').every((i) => i.status === 'suggest'),
    got: sq ? `${sq.evidence?.text} conf ${sq.confidence}` : 'none',
  });
  const grids = pageItems(r, 'grid');
  out.push({
    name: 'background grid masked: proven on every tile (repetition ≥ 3 tiles / whole-page 10 mm), ≥ 550 lines',
    on: 'grid',
    ok:
      (sm.grid ?? 0) >= 550 &&
      grids.length >= 14 &&
      grids.every(
        (i) =>
          i.status === 'suggest' || i.evidence.some((e) => /repeats at one|whole page/.test(e)),
      ),
    got: `${sm.grid ?? 0} masked · ${grids.filter((i) => i.status === 'auto').length} of ${grids.length} pages auto`,
  });
  out.push({
    name: 'ROW/COLUMN labels masked as tile labels by repetition (≥ 800 strokes)',
    on: 'text',
    ok: (sm['tile-label'] ?? 0) >= 800,
    got: sm['tile-label'] ?? 0,
  });
  const ct = pageItems(r, 'curve-text');
  out.push({
    name: 'stroke text offered as a suggestion, none auto (≥ 1200 strokes, ≥ 20 bands kept as text evidence)',
    on: 'text',
    ok:
      (off['curve-text'] ?? 0) >= 1200 &&
      !sm['curve-text'] &&
      ct.every((i) => i.status === 'suggest') &&
      r.clean.curveTexts.length >= 20,
    got: `${off['curve-text'] ?? 0} offered · ${sm['curve-text'] ?? 0} masked · ${r.clean.curveTexts.length} bands`,
  });
  const rows = (r.sheetClean?.items ?? []).filter((i) => i.kind === 'watermark');
  out.push({
    name: 'watermark «WWW.PAPAVERO.PL» offered by the sheet pass (≥ 10 letters), never auto',
    on: 'watermark',
    ok:
      rows.some(
        (i) => /row of (\d+)/.exec(i.evidence[0]) && +/row of (\d+)/.exec(i.evidence[0])![1] >= 10,
      ) && !sheetAuto(r, 'watermark'),
    got: rows.map(
      (i) => `${i.status}${i.applied ? '' : '·off'} ${i.lines} lines: ${i.evidence.join('; ')}`,
    ),
  });
  out.push({
    name: "stroke text no page could see offered by the sheet pass (not the pages' again), never auto",
    on: 'sheetText',
    ok:
      sheetOffered(r, 'curve-text') >= 10 &&
      sheetOffered(r, 'curve-text') <= 0.2 * (off['curve-text'] ?? 0) &&
      !sheetAuto(r, 'curve-text'),
    got: `${sheetOffered(r, 'curve-text')} offered on the sheet vs ${off['curve-text'] ?? 0} on the pages`,
  });
  if (base) {
    const before = liveChains(base);
    const after = liveChains(r);
    out.push({
      name: 'the legend no longer lumps furniture with the pieces (live chains −60 %)',
      on: null,
      ok: after <= 0.4 * before,
      got: `live rows before ${JSON.stringify(live(base))} → after ${JSON.stringify(live(r))}`,
    });
  }
  if (record) for (const c of out) check(section, c.name, c.ok, c.got);
  return out;
}

/** The operator's clicks on wm M: accept the stroke text, the watermark, the test square. */
const ACCEPT_ALL: PageMaskEdit[] = [
  { kind: 'curve-text', keep: false },
  { kind: 'watermark', keep: false },
  { kind: 'test-square', keep: false },
];

export async function wmSection() {
  const base = await wmRun(ALL_OFF);
  check(
    'wm M',
    'clean undone: nothing masked',
    Object.keys(base.clean.summary).length === 0 &&
      !(base.sheetClean?.items ?? []).some((i) => i.applied),
    {
      summary: base.clean.summary,
      sheet: base.sheetClean?.summary,
    },
  );
  const on = await wmRun([]);
  const res = wmChecks('wm M', on, null);
  console.log(
    `WM ${JSON.stringify({ summary: on.clean.summary, offered: on.clean.offered, sheet: on.sheetClean?.summary, sheetItems: (on.sheetClean?.items ?? []).map((i) => `${i.kind} ${i.status} ${i.applied} ${i.lines}`), legendBefore: base.legend, legendAfter: on.legend, scale: on.scaleBest })}`,
  );
  // the operator accepts the three suggested kinds (3 clicks): the legend is clean, the square
  // is the certain scale
  const acc = await wmRun(ACCEPT_ALL);
  const before = liveChains(base);
  const after = liveChains(acc);
  // A0.3: the legend by faces already sets the leftover lettering apart from the outline row
  const outline = live(acc).find((k) => k.role === 'common');
  const apart = !!outline && live(acc).every((k) => k === outline || k.lenM <= outline.lenM);
  check(
    'wm M · 3 clicks',
    'accept stroke text + watermark + test square: the legend no longer lumps furniture with the pieces (live chains −60 %, or the outline row apart from the rest)',
    after <= 0.4 * before || apart,
    `live rows before ${JSON.stringify(live(base))} → defaults ${JSON.stringify(live(on))} → accepted ${JSON.stringify(live(acc))}`,
  );
  const rows = (acc.sheetClean?.items ?? []).filter((i) => i.kind === 'watermark');
  check(
    'wm M · 3 clicks',
    'accept "watermark": every suggested row is masked (one click for the kind)',
    rows.length >= 2 && rows.every((i) => i.applied),
    rows.map((i) => `${i.status} ${i.applied}`),
  );
  const sq = acc.clean.scaleHints[0];
  check(
    'wm M · 3 clicks',
    'accept "test square": its scale candidate is certain (0.97) and the best',
    !!sq &&
      sq.confidence >= 0.97 &&
      acc.scaleBest.method === 'test-square' &&
      Math.abs(acc.scaleBest.factor - 1) <= 0.003 &&
      (acc.clean.summary['test-square'] ?? 0) === 4,
    sq ? `${sq.evidence?.text} conf ${sq.confidence}` : 'none',
  );
  // per-kind undo: the grid comes back (to the legend's furniture row)
  const noGrid = await wmRun([{ kind: 'grid', keep: true }]);
  check(
    'wm M · edits',
    'undo "grid": the grid is line work again, everything else stays as it was',
    !noGrid.clean.summary.grid &&
      (noGrid.clean.offered.grid ?? 0) >= 550 &&
      (noGrid.clean.summary['tile-label'] ?? 0) === (on.clean.summary['tile-label'] ?? 0),
    { summary: noGrid.clean.summary, offered: noGrid.clean.offered },
  );
  // round 2 · 6: clean re-runs from the unmasked extract — in ONE session, an edit to one kind
  // leaves every other mask as it was, and undoing the edit brings the first mask back
  {
    const s = new Session(1, [fileOf(WM_M)]);
    const run = <S extends StageName>(st: S, input: StageIO[S]['in']) =>
      s.runStage(st, input, ctx());
    await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
    const a = await run('clean', { edits: [] });
    const b = await run('clean', { edits: [{ kind: 'grid', keep: true }] });
    const c = await run('clean', { edits: [] });
    s.close();
    const strip = (m: Partial<Record<BackgroundKind, number>>) =>
      JSON.stringify(Object.entries(m).filter(([k]) => k !== 'grid'));
    check(
      'wm M · rerun',
      'one session: undo "grid" keeps every other mask; re-doing it gives the first mask back',
      strip(b.summary) === strip(a.summary) &&
        !b.summary.grid &&
        (b.offered.grid ?? 0) === (a.summary.grid ?? 0) + (a.offered.grid ?? 0) &&
        JSON.stringify(c.summary) === JSON.stringify(a.summary) &&
        JSON.stringify(c.offered) === JSON.stringify(a.offered),
      { first: a.summary, undo: b.summary, undoOffered: b.offered, again: c.summary },
    );
  }
  // the page-role door: a tile set aside, then re-included
  const away = await wmRun([{ file: '0', page: 4, role: 'instructions' }]);
  check(
    'wm M · edits',
    'a tile set aside by the operator leaves the sheet; re-included it comes back',
    away.clean.dropped.some((d) => d.page === 4) &&
      away.clean.classes.find((c) => c.page === 4)?.cls === 'instructions',
    away.clean.dropped,
  );
  // mutation checks: each detector off → its check fails
  for (const det of ['square', 'grid', 'text', 'watermark', 'sheetText'] as const) {
    CLEAN.on[det] = false;
    try {
      const m = await wmRun([]);
      const mine = wmChecks('', m, null, false).filter((c) => c.on === det);
      check(
        'mutations',
        `${det} off → "${mine[0]?.name}" fails`,
        mine.length > 0 && mine.every((c) => !c.ok),
        mine.map((c) => c.got),
      );
    } finally {
      CLEAN.on[det] = true;
    }
  }
  return res;
}

// ── the wall guard on a synthetic page ──────────────────────────────────────────────────

/**
 * A 200 × 120 mm piece outline in four long strokes; inside it a word of 6 glyphs (12 mm, 3
 * strokes each) whose first and last glyph END on the outline; and a free word of 6 glyphs. The
 * free word is masked; the strokes the outline meets are not.
 */
function synthPage(): IRPage {
  const paths: IRPage['paths'] = [];
  const add = (pts: { x: number; y: number }[]) =>
    paths.push({
      id: paths.length,
      pts,
      closed: false,
      style: 0,
      src: { file: '0', page: 0, op: paths.length, sub: 0 },
    });
  const O = { x: 20, y: 40 };
  add([O, { x: O.x + 200, y: O.y }]);
  add([
    { x: O.x + 200, y: O.y },
    { x: O.x + 200, y: O.y + 120 },
  ]);
  add([
    { x: O.x + 200, y: O.y + 120 },
    { x: O.x, y: O.y + 120 },
  ]);
  add([{ x: O.x, y: O.y + 120 }, O]);
  // a glyph: an N-like zigzag of 3 strokes, width w, height 12, at x
  const glyph = (x: number, y: number, w: number) => {
    add([
      { x, y },
      { x, y: y + 12 },
    ]);
    add([
      { x, y: y + 12 },
      { x: x + w, y },
    ]);
    add([
      { x: x + w, y },
      { x: x + w, y: y + 12 },
    ]);
  };
  const widths = [6, 9, 5, 10, 7, 8];
  // word 1 touches the outline: it starts ON the left wall (x = 20) and its last glyph ends on
  // the top wall
  let x = O.x;
  widths.forEach((w) => {
    glyph(x, 140, w);
    x += w + 4;
  });
  add([
    { x: x - 4, y: 152 },
    { x: x - 4, y: O.y + 120 },
  ]);
  // word 2, free inside the piece
  x = 80;
  widths.forEach((w) => {
    glyph(x, 80, w);
    x += w + 4;
  });
  return {
    file: '0',
    page: 0,
    widthMm: 260,
    heightMm: 200,
    styles: [
      {
        id: 0,
        strokeRgb: [0, 0, 0],
        widthMm: 0.3,
        dash: null,
        layer: null,
        fill: false,
        clip: null,
      },
    ],
    paths,
    texts: [],
    rasters: [],
    layers: [],
  };
}

type P = { x: number; y: number };
type SynPage = {
  lines: P[][];
  texts?: { text: string; x: number; y: number }[];
  w?: number;
  h?: number;
};

/** Pages from polylines (one path each) and texts; `cls` per page (tile by default). */
function synthDoc(pages: SynPage[], cls: string[] = []) {
  const docPages: IRPage[] = pages.map((sp, k) => ({
    file: '0',
    page: k,
    widthMm: sp.w ?? 210,
    heightMm: sp.h ?? 297,
    styles: [
      {
        id: 0,
        strokeRgb: [0, 0, 0],
        widthMm: 0.3,
        dash: null,
        layer: null,
        fill: false,
        clip: null,
      },
    ],
    paths: sp.lines.map((pts, i) => ({
      id: i,
      pts,
      closed: false,
      style: 0,
      src: { file: '0', page: k, op: i, sub: 0 },
    })),
    texts: (sp.texts ?? []).map((t, i) => ({
      id: i,
      text: t.text,
      anchor: { x: t.x, y: t.y },
      bbox: { minX: t.x, minY: t.y - 4, maxX: t.x + 4 * t.text.length, maxY: t.y },
      heightMm: 4,
      angleDeg: 0,
      font: '',
      style: 0,
    })) as unknown as IRPage['texts'],
    rasters: [],
    layers: [],
  }));
  const docs = [
    {
      file: {
        id: '0',
        name: 'synth.svg',
        bytes: 0,
        sha256: '',
        kind: 'svg' as const,
        pages: pages.length,
      },
      pages: docPages,
      warnings: [],
    },
  ];
  const classes = pages.map((_, k) => ({
    file: '0',
    page: k,
    cls: (cls[k] ?? 'tile') as 'tile',
    ...((cls[k] ?? 'tile') === 'tile' ? { sheet: 0 } : {}),
    confidence: 1,
    why: 'synthetic',
  }));
  return { docs, classes, pages: docPages };
}
const rect = (x0: number, y0: number, x1: number, y1: number): P[][] => [
  [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
  ],
  [
    { x: x1, y: y0 },
    { x: x1, y: y1 },
  ],
  [
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  [
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ],
];
const closedRect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
  { x: x0, y: y0 },
];
/** A lattice at `pitch` over [x0..x1]×[y0..y1]. */
const lattice = (x0: number, y0: number, x1: number, y1: number, pitch: number): P[][] => {
  const out: P[][] = [];
  for (let x = x0; x <= x1 + 1e-6; x += pitch)
    out.push([
      { x, y: y0 },
      { x, y: y1 },
    ]);
  for (let y = y0; y <= y1 + 1e-6; y += pitch)
    out.push([
      { x: x0, y },
      { x: x1, y },
    ]);
  return out;
};
const itemsOfKind = (o: ReturnType<typeof cleanPages>, kind: BackgroundKind) =>
  o.pages.flatMap((p) => p.items.filter((i) => i.kind === kind));
const statusOf = (o: ReturnType<typeof cleanPages>, kind: BackgroundKind) =>
  itemsOfKind(o, kind).map((i) => `${i.status}${i.applied ? '' : '·off'} ${i.lines}`);

export function synthSection() {
  const pg = synthPage();
  const docs = [
    {
      file: { id: '0', name: 'synth.svg', bytes: 0, sha256: '', kind: 'svg' as const, pages: 1 },
      pages: [pg],
      warnings: [],
    },
  ];
  const classes = [
    { file: '0', page: 0, cls: 'tile' as const, sheet: 0, confidence: 1, why: 'synthetic' },
  ];
  /** Paths in any item (applied or offered) / applied only. */
  const inItems = (o: ReturnType<typeof cleanPages>, applied = false) =>
    new Set(
      o.pages.flatMap((p) => p.items.filter((i) => !applied || i.applied).flatMap((i) => i.paths)),
    );
  const walls = [0, 1, 2, 3];
  const o = cleanPages(docs, classes, { edits: [] });
  const offered = inItems(o);
  const touching = pg.paths
    .filter((p) => p.pts.some((q) => Math.abs(q.x - 20) < 0.01 && q.y > 130))
    .map((p) => p.id);
  check(
    'synthetic guard',
    'the free word is offered as stroke text — a suggestion, not masked (one geometric evidence)',
    offered.size >= 18 &&
      inItems(o, true).size === 0 &&
      itemsOfKind(o, 'curve-text').every(
        (i) => i.status === 'suggest' && !i.evidence.some((e) => /garment line/.test(e)),
      ),
    statusOf(o, 'curve-text'),
  );
  const acc = cleanPages(docs, classes, { edits: [{ kind: 'curve-text', keep: false }] });
  check(
    'synthetic guard',
    'accepted (one click for the kind): the free word is masked',
    inItems(acc, true).size >= 18,
    statusOf(acc, 'curve-text'),
  );
  check(
    'synthetic guard',
    'no wall of the piece and no stroke the outline meets is in any item (offered or applied)',
    walls.every((w) => !offered.has(w)) && touching.every((t) => !offered.has(t)),
    { inItems: [...offered].filter((i) => walls.includes(i) || touching.includes(i)) },
  );
  CLEAN.on.guard = false;
  try {
    const mm = inItems(cleanPages(docs, classes, { edits: [] }));
    check(
      'mutations',
      'guard off → a stroke the outline meets is in an item',
      touching.some((t) => mm.has(t)),
      [...mm].filter((i) => touching.includes(i)),
    );
  } finally {
    CLEAN.on.guard = true;
  }
  synthChrome();
  synthLattice();
  synthSquare();
  synthPagesAside();
  synthMaskRev();
}

/**
 * Three tiles of one file: the same frame (four sides) on each, a closed 60 × 40 mm shape at one
 * page place on each (a small piece the tiles repeat), and a different garment line per tile.
 */
function chromeDoc(variant: 'plain' | 'cf' | 'short') {
  const cfAlongFrame = variant === 'cf';
  const pages: SynPage[] = [0, 1, 2].map((k) => ({
    lines: [
      ...rect(10, 10, 200, 287),
      closedRect(120, 200, 180, 240),
      [
        { x: 40 + 10 * k, y: 60 },
        { x: 90 + 10 * k, y: 150 + 5 * k },
      ],
      // the CF of a piece drawn ON the frame's left side (one tile)
      ...(cfAlongFrame && k === 1
        ? [
            [
              { x: 10, y: 80 },
              { x: 10, y: 180 },
            ],
            [
              { x: 10, y: 180 },
              { x: 70, y: 180 },
            ],
          ]
        : []),
      // a 20 mm garment line (a notch, a short internal line) ending ON the frame (one tile)
      ...(variant === 'short' && k === 2
        ? [
            [
              { x: 100, y: 10 },
              { x: 100, y: 30 },
            ],
          ]
        : []),
    ],
  }));
  return synthDoc(pages);
}

function synthChrome() {
  const d = chromeDoc('plain');
  const o = cleanPages(d.docs, d.classes, { edits: [] });
  const frames = itemsOfKind(o, 'tile-frame');
  const piecePaths = new Set(o.pages.flatMap((p) => p.items.flatMap((i) => i.paths)));
  // path 4 = the closed repeated 60 × 40 shape on each tile
  check(
    'synthetic chrome',
    'a frame repeated on 3 tiles is masked by itself (auto)',
    frames.length === 3 && frames.every((i) => i.status === 'auto' && i.applied && i.lines === 4),
    statusOf(o, 'tile-frame'),
  );
  check(
    'synthetic chrome',
    'a closed piece-sized shape repeated at one page place is never chrome',
    !piecePaths.has(4),
    o.notes.filter((n) => /piece-sized/.test(n)),
  );
  const cf = chromeDoc('cf');
  const oc = cleanPages(cf.docs, cf.classes, { edits: [] });
  check(
    'synthetic chrome',
    'a CF running along the frame on one tile: the frame is offered on every tile, applied on none',
    itemsOfKind(oc, 'tile-frame').length >= 3 &&
      itemsOfKind(oc, 'tile-frame').every((i) => !i.applied),
    statusOf(oc, 'tile-frame'),
  );
  const sh = chromeDoc('short');
  const os = cleanPages(sh.docs, sh.classes, { edits: [] });
  check(
    'synthetic chrome',
    'a 20 mm line ending on the frame on one tile (< 50 mm protects too): the frame is offered, applied on no tile',
    itemsOfKind(os, 'tile-frame').length >= 3 &&
      itemsOfKind(os, 'tile-frame').every((i) => !i.applied),
    statusOf(os, 'tile-frame'),
  );
  const minMm = CLEAN.guardMinMm;
  CLEAN.guardMinMm = 50;
  try {
    const m = cleanPages(sh.docs, sh.classes, { edits: [] });
    check(
      'mutations',
      'guard back to lines ≥ 50 mm → the frame a 20 mm line ends on is applied',
      itemsOfKind(m, 'tile-frame').some((i) => i.applied),
      statusOf(m, 'tile-frame'),
    );
  } finally {
    CLEAN.guardMinMm = minMm;
  }
  CLEAN.on.chrome = false;
  try {
    const m = cleanPages(d.docs, d.classes, { edits: [] });
    check(
      'mutations',
      'chrome off → "a frame repeated on 3 tiles is masked by itself" fails',
      !itemsOfKind(m, 'tile-frame').some((i) => i.applied),
      statusOf(m, 'tile-frame'),
    );
  } finally {
    CLEAN.on.chrome = true;
  }
  CLEAN.on.guard = false;
  try {
    const m = cleanPages(cf.docs, cf.classes, { edits: [] });
    check(
      'mutations',
      'guard off → the frame the CF runs along is applied',
      itemsOfKind(m, 'tile-frame').some((i) => i.applied),
      statusOf(m, 'tile-frame'),
    );
  } finally {
    CLEAN.on.guard = true;
  }
}

function synthLattice() {
  const outline = rect(60, 60, 160, 220);
  // one page, a 10 mm lattice over the whole page under a piece
  const whole = synthDoc([{ lines: [...lattice(10, 10, 200, 280, 10), ...outline] }]);
  // one page, a 10 mm quilting lattice inside the piece, its lines ending on the piece's walls
  // (alone on the page: the piece IS the page's drawing)
  const quilt: P[][] = [];
  for (let y = 70; y <= 150; y += 10)
    quilt.push([
      { x: 60, y },
      { x: 160, y },
    ]);
  for (let x = 70; x <= 150; x += 10)
    quilt.push([
      { x, y: 60 },
      { x, y: 220 },
    ]);
  const region = synthDoc([{ lines: [...quilt, ...outline] }]);
  // three tiles, the same 7 mm print lattice on each (repetition)
  const tiles = synthDoc(
    [0, 1, 2].map((k) => ({
      lines: [
        ...lattice(10, 10, 199, 283, 7),
        [
          { x: 30 + 20 * k, y: 30 },
          { x: 120, y: 200 - 10 * k },
        ],
      ],
    })),
  );
  const ow = cleanPages(whole.docs, whole.classes, { edits: [] });
  const orr = cleanPages(region.docs, region.classes, { edits: [] });
  const ot = cleanPages(tiles.docs, tiles.classes, { edits: [] });
  const auto = (o: ReturnType<typeof cleanPages>) =>
    itemsOfKind(o, 'grid').length > 0 && itemsOfKind(o, 'grid').every((i) => i.status === 'auto');
  check(
    'synthetic lattice',
    'a 10 mm lattice over the whole page: auto',
    auto(ow),
    statusOf(ow, 'grid'),
  );
  // the outline is paths 18–21 (after the 18 quilting lines)
  const wallIn = (o: ReturnType<typeof cleanPages>) =>
    itemsOfKind(o, 'grid').some((i) => i.paths.some((p) => p >= 18));
  check(
    'synthetic lattice',
    'a quilting lattice inside a piece: never auto, no wall of the piece in any item',
    !itemsOfKind(orr, 'grid').some((i) => i.status === 'auto') && !wallIn(orr),
    { grid: statusOf(orr, 'grid'), paths: itemsOfKind(orr, 'grid').map((i) => i.paths.join(',')) },
  );
  CLEAN.on.guard = false;
  try {
    const m = cleanPages(region.docs, region.classes, { edits: [] });
    check(
      'mutations',
      'guard off → the quilting lattice takes the piece walls its spacing swallowed',
      wallIn(m),
      itemsOfKind(m, 'grid').map((i) => i.paths.join(',')),
    );
  } finally {
    CLEAN.on.guard = true;
  }
  check(
    'synthetic lattice',
    'a 7 mm lattice repeated on 3 tiles: auto',
    auto(ot),
    statusOf(ot, 'grid'),
  );
  const pitches = CLEAN.gridPitchesMm;
  CLEAN.gridPitchesMm = [];
  try {
    const m = cleanPages(whole.docs, whole.classes, { edits: [] });
    check(
      'mutations',
      'no proof pitch → "a 10 mm lattice over the whole page: auto" fails',
      !auto(m),
      statusOf(m, 'grid'),
    );
  } finally {
    CLEAN.gridPitchesMm = pitches;
  }
  // a ruled table with text in its cells on one page: offered; with a line running out of it: none
  const cells = lattice(20, 20, 100, 60, 10);
  const texts = [0, 1, 2, 3, 4, 5].map((k) => ({ text: `${36 + 2 * k}`, x: 22 + 10 * k, y: 28 }));
  const table = synthDoc([{ lines: [...cells, ...rect(10, 120, 190, 280)], texts }]);
  const crossed = synthDoc([
    {
      lines: [
        ...cells,
        [
          { x: 55, y: 45 },
          { x: 55, y: 200 },
        ],
      ],
      texts,
    },
  ]);
  const otb = cleanPages(table.docs, table.classes, { edits: [] });
  const ocr = cleanPages(crossed.docs, crossed.classes, { edits: [] });
  const tbl = [...itemsOfKind(otb, 'table'), ...itemsOfKind(otb, 'grid')];
  check(
    'synthetic lattice',
    'a ruled size table on one page: offered, not auto',
    tbl.length > 0 && tbl.every((i) => i.status === 'suggest'),
    [...statusOf(otb, 'table'), ...statusOf(otb, 'grid')],
  );
  check(
    'synthetic lattice',
    'a ruled grid a line runs out of (a garment through it): no table',
    itemsOfKind(ocr, 'table').length === 0,
    { table: statusOf(ocr, 'table'), notes: ocr.notes },
  );
}

function synthSquare() {
  const piece = rect(20, 150, 190, 280);
  const keyword = synthDoc([
    {
      lines: [...rect(40, 30, 140, 130), ...piece],
      texts: [{ text: 'TEST SQUARE 10 cm', x: 45, y: 140 }],
    },
  ]);
  const other = synthDoc([
    { lines: [...rect(40, 30, 140, 130), ...piece], texts: [{ text: 'POCKET x2', x: 45, y: 140 }] },
  ]);
  const ok = cleanPages(keyword.docs, keyword.classes, { edits: [] });
  const oo = cleanPages(other.docs, other.classes, { edits: [] });
  check(
    'synthetic square',
    'a 100 mm square labelled with the scale keyword: auto, scale 0.97',
    itemsOfKind(ok, 'test-square').some((i) => i.status === 'auto' && i.applied) &&
      ok.scaleHints[0]?.confidence >= 0.97,
    { items: statusOf(ok, 'test-square'), conf: ok.scaleHints.map((h) => h.confidence) },
  );
  check(
    'synthetic square',
    'a 100 mm square with another label (a candidate piece): at most a suggestion, scale ≤ 0.6',
    !itemsOfKind(oo, 'test-square').some((i) => i.status === 'auto') &&
      oo.scaleHints.every((h) => h.confidence <= 0.6),
    { items: statusOf(oo, 'test-square'), conf: oo.scaleHints.map((h) => h.confidence) },
  );
  CLEAN.on.square = false;
  try {
    const m = cleanPages(keyword.docs, keyword.classes, { edits: [] });
    check(
      'mutations',
      'square off → "labelled with the scale keyword: auto" fails',
      !itemsOfKind(m, 'test-square').length,
      statusOf(m, 'test-square'),
    );
  } finally {
    CLEAN.on.square = true;
  }
}

function synthPagesAside() {
  // page 0 a tile; page 1 instructions with only short strokes (text); page 2 a cover with a
  // 150 mm line; page 3 an overview with a closed 30 × 30 mm contour (900 mm² ≥ the piece area)
  const strokes: P[][] = [];
  for (let k = 0; k < 40; k++)
    strokes.push([
      { x: 20 + 4 * k, y: 30 },
      { x: 22 + 4 * k, y: 36 },
    ]);
  const d = synthDoc(
    [
      { lines: rect(20, 20, 180, 250) },
      { lines: strokes },
      {
        lines: [
          [
            { x: 20, y: 100 },
            { x: 170, y: 100 },
          ],
        ],
      },
      { lines: [closedRect(50, 50, 80, 80)] },
    ],
    ['tile', 'instructions', 'cover', 'overview'],
  );
  const o = cleanPages(d.docs, d.classes, { edits: [] });
  const st = Object.fromEntries(
    o.dropped.map((x) => [x.page, `${x.status}${x.drawing ? ` (${x.drawing})` : ''}`]),
  );
  check(
    'synthetic pages',
    'a page with no line work that could be pattern is set aside by itself; one with a long line / a piece-sized contour is flagged (suggest)',
    o.dropped.find((x) => x.page === 1)?.status === 'auto' &&
      o.dropped.find((x) => x.page === 2)?.status === 'suggest' &&
      o.dropped.find((x) => x.page === 3)?.status === 'suggest' &&
      o.pages.find((p) => p.page === 2)?.status === 'suggest',
    st,
  );
}

function synthMaskRev() {
  const at = { sheetIndex: 0, gridOverride: null, variant: null };
  const r1 = maskRevOf(['0:1:grid:0', '0:2:tile-label:0'], []);
  const r2 = maskRevOf(['0:1:grid:0'], []);
  const r3 = maskRevOf(['0:2:tile-label:0', '0:1:grid:0'], []);
  const r4 = maskRevOf(['0:1:grid:0', '0:2:tile-label:0'], [{ kind: 'grid', keep: true }]);
  const s1 = answerCtxOf({ ...at, maskRev: r1 }, null).scope;
  const s2 = answerCtxOf({ ...at, maskRev: r2 }, null).scope;
  const s4 = answerCtxOf({ ...at, maskRev: r4 }, null).scope;
  check(
    'mask revision',
    'answers carry the mask: another mask (or another mask edit) is another scope; the same mask in any order is the same',
    r1 === r3 && s1 !== s2 && s1 !== s4 && s1 === answerCtxOf({ ...at, maskRev: r3 }, null).scope,
    { r1, r2, r4, s1, s2 },
  );
}

// ── negative controls: no wall of a closed piece is masked ──────────────────────────────

const keyOf = (p: Sheet['paths'][number]) => `${p.src.file}|${p.src.page}|${p.src.op}|${p.src.sub}`;

function wallKeys(s: Session) {
  const S = s as unknown as {
    families: PieceFamily[] | null;
    wallSet: ChainSet | null;
    chains: ChainSet | null;
    sheet: Sheet | null;
  };
  const set = S.wallSet ?? S.chains;
  const out = new Set<string>();
  /** Area of every closed candidate, `seed:rank` → mm² (does the outline move?). */
  const areas = new Map<string, number>();
  /** The wall path keys of each closed candidate (`seed:rank`). */
  const byPiece = new Map<string, Set<string>>();
  let closed = 0;
  if (!set || !S.sheet || !S.families) return { keys: out, closed, areas, byPiece };
  const byId = new Map(S.sheet.paths.map((p) => [p.id, p]));
  for (const f of S.families)
    for (const c of f.candidates) {
      if (c.outcome !== 'closed') continue;
      closed++;
      areas.set(`${f.seed}:${c.rank}`, c.areaMm2);
      const mine = new Set<string>();
      byPiece.set(`${f.seed}:${c.rank}`, mine);
      for (const w of c.walls)
        for (const r of set.chains[w]?.ranges ?? []) {
          const p = byId.get(r.path);
          if (p) {
            out.add(keyOf(p));
            mine.add(keyOf(p));
          }
        }
    }
  return { keys: out, closed, areas, byPiece };
}

function bgKeys(s: Session) {
  const sheet = (s as unknown as { sheet: Sheet | null }).sheet;
  const out = new Map<string, string>();
  for (const p of sheet?.paths ?? []) if (p.background) out.set(keyOf(p), p.background);
  return out;
}

/** Where a masked wall is: page, box and length of its sheet paths (for the report). */
function whereOf(s: Session, keys: string[]) {
  const sheet = (s as unknown as { sheet: Sheet | null }).sheet;
  return (sheet?.paths ?? [])
    .filter((p) => keys.includes(keyOf(p)))
    .slice(0, 8)
    .map((p) => {
      const xs = p.pts.map((q) => q.x);
      const ys = p.pts.map((q) => q.y);
      let L = 0;
      for (let i = 1; i < p.pts.length; i++)
        L += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
      return `p${p.src.page + 1} op${p.src.op} ${p.background} L${L.toFixed(0)} [${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)}..${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)}]`;
    });
}

export async function wallsSection(id: string) {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  const none = (): ReturnType<typeof wallKeys> => ({
    keys: new Set(),
    closed: 0,
    areas: new Map(),
    byPiece: new Map(),
  });
  let off = none();
  let on = none();
  let glyphOnly = true;
  let bg = new Map<string, string>();
  let where: string[] = [];
  let lostNow: string[] = [];
  const a = await runCase(c, { cleanEdits: ALL_OFF, onPieces: (s) => (off = wallKeys(s)) });
  const b = await runCase(c, {
    onPieces: (s) => {
      on = wallKeys(s);
      bg = bgKeys(s);
      lostNow = [...off.keys].filter((k) => bg.has(k));
      where = whereOf(s, lostNow);
      // a masked "wall" no bigger than a glyph is a letter the fill leaned on, not an outline
      const sheet = (s as unknown as { sheet: Sheet | null }).sheet;
      glyphOnly = (sheet?.paths ?? [])
        .filter((p) => lostNow.includes(keyOf(p)))
        .every((p) => {
          const xs = p.pts.map((q) => q.x);
          const ys = p.pts.map((q) => q.y);
          return (
            Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) <= 10
          );
        });
    },
  });
  const lost = [...off.keys].filter((k) => bg.has(k));
  const kinds: Record<string, number> = {};
  for (const k of lost) kinds[bg.get(k)!] = (kinds[bg.get(k)!] ?? 0) + 1;
  // the outlines did not move: every piece closed before is closed after, at the same area
  let moved = 0;
  const movedAt: string[] = [];
  for (const [k, a0] of off.areas) {
    const a1 = on.areas.get(k);
    if (a1 === undefined || Math.abs(a1 - a0) > 0.005 * a0) {
      // an outline that let go of letters it leaned on (its masked walls are all glyph-sized)
      // moved for the better — the rendered comparison is in the probe's history (blazer seed 6)
      const leaned = [...(off.byPiece.get(k) ?? [])].filter((x) => bg.has(x));
      if (leaned.length && glyphOnly) {
        movedAt.push(
          `${k}: ${(a0 / 100).toFixed(0)}→${a1 === undefined ? '—' : (a1 / 100).toFixed(0)} cm² (let go of ${leaned.length} letter strokes)`,
        );
        continue;
      }
      moved++;
      movedAt.push(
        `${k}: ${(a0 / 100).toFixed(0)}→${a1 === undefined ? '—' : (a1 / 100).toFixed(0)} cm²`,
      );
    }
  }
  check(
    `walls · ${id}`,
    'no wall of a closed piece is masked (a glyph-sized stroke the fill leaned on aside), no outline moves',
    (lost.length === 0 || glyphOnly) && moved === 0,
    `walls ${off.keys.size} (${off.closed} closed) → ${on.keys.size} (${on.closed} closed) · masked walls ${lost.length} ${JSON.stringify(kinds)}${lost.length ? (glyphOnly ? ' (all ≤ 10 mm: letters)' : ' (OUTLINE STROKES)') : ''} · outlines moved ${moved}${movedAt.length ? ` (${movedAt.slice(0, 6).join(', ')})` : ''} · clean ${JSON.stringify(b.clean ?? null)} · clicks ${a.clicks?.total ?? '?'}→${b.clicks?.total ?? '?'}${where.length ? ` · masked: ${where.join(' ; ')}` : ''}`,
  );
}

// ── A8b · Redcafe corner brackets (owner 10.10: «засечки для позиционирования обозначило как
// детали») and the G19 safety net ─────────────────────────────────────────────────────────

const OWNER_REDCAFE_DXF =
  process.env.PATIMPORT_OWNER_REDCAFE_DXF ??
  '/Users/jekabolt/Downloads/fw26-fw26-001-main-5583a330.dxf';

/** Per tile page: is every small closed repeated mark (a 15 × 1 mm bracket) masked, auto? */
async function bracketsOf(file: string) {
  const s = new Session(1, [fileOf(file)]);
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) => s.runStage(st, input, ctx());
  await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const cl = await run('clean', { edits: [] });
  s.close();
  const tiles = cl.pages.filter((p) => p.role === 'tile');
  const withMarks = tiles.filter((p) =>
    p.items.some((i) => i.kind === 'regmark' && i.status === 'auto' && i.applied && i.lines >= 4),
  );
  return {
    tiles: tiles.length,
    masked: withMarks.length,
    lines: cl.summary.regmark ?? 0,
    offered: cl.offered.regmark ?? 0,
  };
}

/** The written files of one e2e run: hairpins on cut / seam, 15 × 1 mm bars on layer 8, G19. */
async function writtenOf(files: string[], id: string, cleanEdits?: PageMaskEdit[]) {
  const base = CASES.find((x) => x.id === 'redcafe')!;
  const sizes = files.map((f) => /(\d+)\.pdf$/.exec(f)![1]);
  const r = await runCase({ ...base, id, files, card: sizes }, { cleanEdits });
  const writes = (r.write ?? []) as { file: string; blocking?: string[] }[];
  let hp = 0;
  let bars = 0;
  for (const w of writes) {
    const raw = readRawDxf(readFileSync(w.file, 'latin1'));
    for (const [, ents] of raw.blocks)
      for (const e of ents) {
        if ((e.layer === '1' || e.layer === '14') && e.pts.length >= 4)
          hp += hairpins(e.pts, e.closed).length;
        if (e.layer === '8' && e.closed && e.pts.length >= 4) {
          const xs = e.pts.map((p) => p.x);
          const ys = e.pts.map((p) => p.y);
          const W = Math.max(...xs) - Math.min(...xs);
          const H = Math.max(...ys) - Math.min(...ys);
          if (Math.min(W, H) <= 2 && Math.max(W, H) >= 10 && Math.max(W, H) <= 25) bars++;
        }
      }
  }
  // the G19 notes in full, as the written file's embedded gate report carries them
  const g19 = writes.flatMap((w) =>
    (readManifest(readFileSync(w.file, 'latin1'))?.gate?.checks ?? [])
      .filter((k) => k.id === 'G19-chrome' && !k.ok && k.severity === 'block')
      .map((k) => `G19-chrome[${k.blocks.join(',')}] ${k.note}`),
  );
  return { hp, bars, g19, verdict: r.verdict, clicks: r.clicks?.total, write: writes };
}

/** Blocks of a DXF file with a hairpin (the finder alone: a raw file carries no chrome). */
function hairpinBlocks(file: string) {
  const raw = readRawDxf(readFileSync(file, 'latin1'));
  const out: string[] = [];
  for (const [name, ents] of raw.blocks) {
    if (name.startsWith('*')) continue;
    const n = ents
      .filter((e) => (e.layer === '1' || e.layer === '14') && e.pts.length >= 4)
      .reduce((a, e) => a + hairpins(e.pts, e.closed).length, 0);
    if (n) out.push(`${name}: ${n}`);
  }
  return out;
}

const ents = (layer: string, ...rings: PtLike[][]) =>
  rings.map((pts) => ({ type: 'LWPOLYLINE', layer, pts, closed: true })) as Parameters<
    typeof chromeProblems
  >[0];

export async function marksSection() {
  // 1 · clean: the brackets are masked (auto) on every tile of every Redcafe size file
  for (const n of ['44', '46', '48', '50', '52', '54']) {
    const b = await bracketsOf(`pdf/${n}.pdf`);
    check(
      'A8b marks',
      `${n}.pdf: the corner brackets are masked by themselves on every tile`,
      b.tiles > 0 && b.masked === b.tiles && !b.offered,
      b,
    );
  }
  // 1b · Codex: a small closed shape repeated OUTSIDE the tile margin (a drill circle of a
  // multi-page marker) is offered, never auto; the corner brackets of the same tiles are auto
  const disc = (cx: number, cy: number, r: number) =>
    Array.from({ length: 17 }, (_, k) => ({
      x: cx + r * Math.cos((2 * Math.PI * k) / 16),
      y: cy + r * Math.sin((2 * Math.PI * k) / 16),
    }));
  const bar = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];
  const tilesDoc = synthDoc(
    [0, 1, 2].map((k) => ({
      lines: [
        bar(12, 12, 27, 13),
        bar(183, 12, 198, 13),
        bar(12, 284, 27, 285),
        disc(105, 150, 3),
        [
          { x: 40 + 10 * k, y: 60 },
          { x: 90 + 10 * k, y: 150 + 5 * k },
        ],
      ],
    })),
  );
  const zoneRun = () => {
    const o = cleanPages(tilesDoc.docs, tilesDoc.classes, { edits: [] });
    const items = o.pages
      .flatMap((p) => p.items)
      .filter((i) => i.kind === 'regmark' || i.kind === 'tile-label');
    const drill = items.filter((i) => i.bbox.minX > 90 && i.bbox.maxX < 120);
    const brackets = items.filter((i) => !drill.includes(i));
    return { drill, brackets };
  };
  const z = zoneRun();
  check(
    'A8b marks',
    'a drill circle at one place on 3 tiles, mid-page: offered, never auto; the corner brackets: auto',
    z.drill.length > 0 &&
      z.drill.every((i) => i.status === 'suggest' && !i.applied) &&
      z.brackets.length > 0 &&
      z.brackets.every((i) => i.status === 'auto' && i.applied),
    {
      drill: z.drill.map((i) => `${i.status} ${i.applied} ${i.lines}`),
      brackets: z.brackets.map((i) => `${i.status} ${i.applied} ${i.lines}`),
    },
  );
  CLEAN.on.markZone = false;
  try {
    const m = zoneRun();
    check(
      'mutations',
      'mark zone off → the mid-page drill circle is auto-masked',
      m.drill.some((i) => i.status === 'auto' && i.applied),
      m.drill.map((i) => `${i.status} ${i.applied}`),
    );
  } finally {
    CLEAN.on.markZone = true;
  }
  // 2 · the owner's run (44 alone): no hairpin, no bar on layer 8, G19 quiet
  const w = await writtenOf(['pdf/44.pdf'], 'redcafe-44');
  check(
    'A8b marks',
    '44.pdf written: no hairpin round a bracket on any cut / seam line, no 15 × 1 mm bar on layer 8, G19 does not block',
    w.write.length > 0 && w.hp === 0 && w.bars === 0 && w.g19.length === 0,
    { hairpins: w.hp, bars: w.bars, g19: w.g19, verdict: w.verdict, clicks: w.clicks },
  );
  // 3 · the owner's DXF (beta): the hairpin finder sees its traced blocks (a raw file has no
  // chrome, so G19 itself judges them only at export, where the chrome is known — 5 below)
  if (existsSync(OWNER_REDCAFE_DXF)) {
    const bad = hairpinBlocks(OWNER_REDCAFE_DXF);
    check(
      'A8b G19',
      "the owner's Redcafe 44 DXF: the hairpin finder sees the blocks traced round a bracket",
      bad.length >= 3,
      bad.slice(0, 4),
    );
  } else console.log(`  skip the owner's DXF (${OWNER_REDCAFE_DXF} not here)`);
  // 4 · G19 units: a hairpin is judged only near chrome; marks block, frames warn
  const outline = (extra: PtLike[]) => [
    { x: 0, y: 0 },
    ...extra,
    { x: 200, y: 0 },
    { x: 200, y: 300 },
    { x: 0, y: 300 },
  ];
  // a 1 × 10 mm U notch, a slit notch (0.5 × 6) and a narrow dart (2 mm wide, 60 long) on the top
  const clo = outline([
    { x: 30, y: 0 },
    { x: 30, y: 10 },
    { x: 31, y: 10 },
    { x: 31, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 6 },
    { x: 60.5, y: 6 },
    { x: 60.5, y: 0 },
    { x: 100, y: 0 },
    { x: 101, y: 60 },
    { x: 102, y: 0 },
  ]);
  const farFrame = [
    {
      mark: false,
      pts: [
        { x: -50, y: -50 },
        { x: -50, y: 400 },
      ],
    },
  ];
  // the Redcafe trace: out and back round a 1 × 15 mm bracket the clean stage masked
  const traced = outline([
    { x: 120, y: 0 },
    { x: 120, y: -15 },
    { x: 121, y: -15 },
    { x: 121, y: 0 },
  ]);
  const bracket = [
    {
      mark: true,
      pts: [
        { x: 120.1, y: 0 },
        { x: 120.1, y: -14.9 },
        { x: 120.9, y: -14.9 },
        { x: 120.9, y: 0 },
        { x: 120.1, y: 0 },
      ],
    },
  ];
  const along = ents('1', outline([]));
  const onFrame = [
    {
      mark: false,
      pts: [
        { x: 0, y: 50 },
        { x: 0, y: 250 },
      ],
    },
  ];
  const shortFrame = [
    {
      mark: false,
      pts: [
        { x: 0, y: 50 },
        { x: 0, y: 110 },
      ],
    },
  ];
  const onMark = [
    {
      mark: true,
      pts: [
        { x: 0, y: 50 },
        { x: 0, y: 70 },
      ],
    },
  ];
  const pb = (e: Parameters<typeof chromeProblems>[0], c: Parameters<typeof chromeProblems>[1]) =>
    chromeProblems(e, c);
  check(
    'A8b G19',
    'a CLO-style outline (1 × 10 U notch, slit notch, 2 mm dart): no block, with or without chrome near',
    !pb(ents('1', clo), farFrame).block.length && !pb(ents('1', clo), undefined).block.length,
    pb(ents('1', clo), farFrame),
  );
  check(
    'A8b G19',
    'the Redcafe trace round a masked bracket blocks; the same hairpin with no chrome near is not judged',
    pb(ents('1', traced), bracket).block.length > 0 &&
      !pb(ents('1', traced), farFrame).block.length,
    { near: pb(ents('1', traced), bracket), far: pb(ents('1', traced), farFrame) },
  );
  check(
    'A8b G19',
    'a cut line 60 mm ON a frame line (a CF on the tile edge) warns; 200 mm on a frame blocks, naming the way out; ON a mark it blocks',
    !pb(along, shortFrame).block.length &&
      pb(along, shortFrame).warn.length > 0 &&
      pb(along, onFrame).block.some((x) => /keep the frame on the Files step/.test(x)) &&
      pb(along, onMark).block.length > 0,
    { short: pb(along, shortFrame), long: pb(along, onFrame), mark: pb(along, onMark) },
  );
  const nearMm = CHROME_GATE.hairpinNearMm;
  CHROME_GATE.hairpinNearMm = 1e6;
  try {
    check(
      'mutations',
      'hairpins judged anywhere → the CLO-style outline blocks',
      pb(ents('1', clo), farFrame).block.length > 0,
      pb(ents('1', clo), farFrame),
    );
  } finally {
    CHROME_GATE.hairpinNearMm = nearMm;
  }
  CHROME_GATE.frameBlocks = true;
  try {
    check(
      'mutations',
      'any frame contact blocks → the 60 mm CF on the tile edge blocks',
      pb(along, shortFrame).block.length > 0,
      pb(along, shortFrame),
    );
  } finally {
    CHROME_GATE.frameBlocks = false;
  }
  const frameMm = CHROME_GATE.frameBlockMm;
  CHROME_GATE.frameBlockMm = Infinity;
  try {
    check(
      'mutations',
      'no length limit on frames → the 200 mm frame trace only warns',
      !pb(along, onFrame).block.length,
      pb(along, onFrame),
    );
  } finally {
    CHROME_GATE.frameBlockMm = frameMm;
  }
  // 4b · the whole Redcafe run: BP_L_53_52's seam traced 273 mm along a tile frame blocks; the
  //      operator keeping the frame (the way out) clears it — un-keep → block, keep → no block
  const all = CASES.find((x) => x.id === 'redcafe')!.files;
  const rc = await writtenOf(all, 'redcafe-g19');
  const rcKept = await writtenOf(all, 'redcafe-g19-kept', [{ kind: 'tile-frame', keep: true }]);
  const frameBlock = (w: typeof rc) => w.g19.filter((x) => /along a tile frame/.test(x));
  check(
    'A8b G19',
    'Redcafe: the seam traced along a tile frame blocks, naming the way out; the operator keeps the frame → no G19 block',
    frameBlock(rc).length > 0 &&
      frameBlock(rc).every((x) => /keep the frame on the Files step/.test(x)) &&
      rcKept.g19.length === 0,
    {
      unkept: rc.g19.map((x) => x.slice(0, 420)),
      kept: rcKept.g19.map((x) => x.slice(0, 160)),
      verdicts: [rc.verdict, rcKept.verdict],
    },
  );
  // 5 · marks treated like frames (the 10.10 build): brackets offered, traced round, G19 blocks;
  //     the operator keeping the brackets as line work is the way out (G19 leaves kept chrome)
  CLEAN.on.marks = false;
  try {
    const b = await bracketsOf('pdf/44.pdf');
    const m = await writtenOf(['pdf/44.pdf'], 'redcafe-44-mut');
    check(
      'mutations',
      'marks off → 44.pdf brackets only offered, the written cut line has hairpins / bars and G19 blocks',
      b.masked < b.tiles && (m.hp > 0 || m.bars > 0) && m.g19.length > 0,
      { brackets: b, hairpins: m.hp, bars: m.bars, g19: m.g19.map((x: string) => x.slice(0, 120)) },
    );
    // the brackets sit on the frame line: both are kept (two clicks in the files step)
    const kept = await writtenOf(['pdf/44.pdf'], 'redcafe-44-kept', [
      { kind: 'regmark', keep: true },
      { kind: 'tile-frame', keep: true },
    ]);
    check(
      'A8b G19',
      'the operator keeps the brackets and frames as line work: G19 does not block on them (a way out)',
      kept.g19.length === 0,
      { hairpins: kept.hp, g19: kept.g19.map((x: string) => x.slice(0, 120)) },
    );
  } finally {
    CLEAN.on.marks = true;
  }
}

type PtLike = { x: number; y: number };

export async function main(args: string[]): Promise<number> {
  const [mode, id] = args;
  if (mode === 'wm-M') await wmSection();
  else if (mode === 'synth') synthSection();
  else if (mode === 'walls') await wallsSection(id);
  else if (mode === 'marks') await marksSection();
  else throw new Error(`mode? wm-M | synth | marks | walls <case>`);
  for (const c of checks) console.log(`@@CHECK ${JSON.stringify(c)}`);
  return 0;
}
