// PATTERN-IMPORT · A8 probe — the clean stage (lib/pattern-import/clean) on the corpus:
//   wm      wm M (corpus/pdf/wm_kka_15_01_m_wykroj.pdf, the owner's "complete failure" of 10.10):
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
const watermarkAuto = (r: WmRun) =>
  (r.sheetClean?.items ?? []).filter(
    (i) => i.kind === 'watermark' && i.status === 'auto' && i.applied,
  );

/** The wm M checks — each names the detector it rests on (the mutation check switches it off). */
function wmChecks(section: string, r: WmRun, base: WmRun | null, record = true) {
  const sm = r.clean.summary;
  const out: { name: string; on: keyof typeof CLEAN.on | null; ok: boolean; got: unknown }[] = [];
  const sq = r.clean.scaleHints[0];
  out.push({
    name: 'test square found by geometry, offered as the certain scale',
    on: 'square',
    ok:
      !!sq &&
      sq.confidence >= 0.9 &&
      r.scaleBest.method === 'test-square' &&
      Math.abs(r.scaleBest.factor - 1) <= 0.003 &&
      (sm['test-square'] ?? 0) === 4,
    got: sq ? `${sq.evidence?.text} conf ${sq.confidence}` : 'none',
  });
  out.push({
    name: 'background grid masked (≥ 600 lines on 14 tiles)',
    on: 'grid',
    ok: (sm.grid ?? 0) >= 600,
    got: sm.grid ?? 0,
  });
  out.push({
    name: 'ROW/COLUMN labels masked as tile labels (≥ 800 strokes)',
    on: 'chrome',
    ok: (sm['tile-label'] ?? 0) >= 800,
    got: sm['tile-label'] ?? 0,
  });
  out.push({
    name: 'stroke text masked, kept as text evidence (≥ 1200 strokes, ≥ 20 bands)',
    on: 'text',
    ok: (sm['curve-text'] ?? 0) >= 1200 && r.clean.curveTexts.length >= 20,
    got: `${sm['curve-text'] ?? 0} strokes · ${r.clean.curveTexts.length} bands`,
  });
  const wm = watermarkAuto(r);
  out.push({
    name: 'watermark «WWW.PAPAVERO.PL» masked by the sheet pass (auto, ≥ 10 letters)',
    on: 'watermark',
    ok: wm.some(
      (i) => /row of (\d+)/.exec(i.evidence[0]) && +/row of (\d+)/.exec(i.evidence[0])![1] >= 10,
    ),
    got: (r.sheetClean?.items ?? [])
      .filter((i) => i.kind === 'watermark')
      .map(
        (i) => `${i.status}${i.applied ? '' : '·off'} ${i.lines} lines: ${i.evidence.join('; ')}`,
      ),
  });
  out.push({
    name: 'stroke text cut by tile borders masked by the sheet pass',
    on: 'sheetText',
    ok: (r.sheetClean?.summary['curve-text'] ?? 0) >= 30,
    got: r.sheetClean?.summary ?? null,
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
  const res = wmChecks('wm M', on, base);
  console.log(
    `WM ${JSON.stringify({ summary: on.clean.summary, offered: on.clean.offered, sheet: on.sheetClean?.summary, legendBefore: base.legend, legendAfter: on.legend, scale: on.scaleBest })}`,
  );
  // per-kind undo: the grid comes back (to the legend's furniture row)
  const noGrid = await wmRun([{ kind: 'grid', keep: true }]);
  check(
    'wm M · edits',
    'undo "grid": the grid is line work again, everything else stays masked',
    !noGrid.clean.summary.grid &&
      (noGrid.clean.offered.grid ?? 0) >= 600 &&
      (noGrid.clean.summary['tile-label'] ?? 0) === (on.clean.summary['tile-label'] ?? 0),
    { summary: noGrid.clean.summary, offered: noGrid.clean.offered },
  );
  // an accepted suggestion: every watermark row of the sheet pass is masked
  const acc = await wmRun([{ kind: 'watermark', keep: false }]);
  const rows = (acc.sheetClean?.items ?? []).filter((i) => i.kind === 'watermark');
  check(
    'wm M · edits',
    'accept "watermark": the suggested rows are masked too',
    rows.length >= 2 && rows.every((i) => i.applied),
    rows.map((i) => `${i.status} ${i.applied}`),
  );
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
  for (const det of ['square', 'grid', 'chrome', 'text', 'watermark', 'sheetText'] as const) {
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
  const masked = (o: ReturnType<typeof cleanPages>) =>
    new Set(o.pages.flatMap((p) => p.items.filter((i) => i.applied).flatMap((i) => i.paths)));
  const walls = [0, 1, 2, 3];
  const o = cleanPages(docs, classes, { edits: [] });
  const m = masked(o);
  const touching = pg.paths
    .filter((p) => p.pts.some((q) => Math.abs(q.x - 20) < 0.01 && q.y > 130))
    .map((p) => p.id);
  check('synthetic guard', 'the free word is masked as stroke text', m.size >= 18, [...m].length);
  check(
    'synthetic guard',
    'no wall of the piece and no stroke the outline meets is masked',
    walls.every((w) => !m.has(w)) && touching.every((t) => !m.has(t)),
    { masked: [...m].filter((i) => walls.includes(i) || touching.includes(i)) },
  );
  CLEAN.on.guard = false;
  try {
    const mm = masked(cleanPages(docs, classes, { edits: [] }));
    check(
      'mutations',
      'guard off → a stroke the outline meets is masked',
      touching.some((t) => mm.has(t)),
      [...mm].filter((i) => touching.includes(i)),
    );
  } finally {
    CLEAN.on.guard = true;
  }
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

export async function main(args: string[]): Promise<number> {
  const [mode, id] = args;
  if (mode === 'wm') await wmSection();
  else if (mode === 'synth') synthSection();
  else if (mode === 'walls') await wallsSection(id);
  else throw new Error(`mode? wm | synth | walls <case>`);
  for (const c of checks) console.log(`@@CHECK ${JSON.stringify(c)}`);
  return 0;
}
