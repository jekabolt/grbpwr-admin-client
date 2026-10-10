// PATTERN-IMPORT · A2 + A0.3 probe — face seeds and the legend roles by faces, through the e2e
// operator pass (e2e-entry runCase): per case the automatic seeds (text / face), every blob with its
// junk reason, the legend rows, the click metric; PNGs of the face seeds + legend roles; the
// checks of auto/00-PLAN §A2 (wm M 4 seeds, the SVG 2 seeds and outlines = size/cut with 0 legend
// edits, fixture sheets ≤ 1 junk face, negative controls unchanged against the base E2E report),
// the r4454 M2 trap (two clicks in the back → one seed point) and a mutation check of every filter.
//   node scripts/pattern-import/faces.mjs [case…]     (yarn patimport:faces)
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS, PATIMPORT_E2E_OUT, FACES_BASE (base E2E json)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  faceMap,
  faceRaster,
  faceSeedsOf,
  judgeBlobs,
  type FaceBlob,
  type FaceJunk,
} from 'lib/pattern-import/pieces/faces';
import { rolesByFaces, type FaceRoleOpts } from 'lib/pattern-import/chains/face-role';
import type {
  BoxMm,
  Chain,
  ChainSet,
  IRText,
  PagePose,
  Style,
  PieceFamily,
  PtMm,
  Seed,
  Sheet,
  SizeRun,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';

import { CASES, runCase } from './e2e-entry';
import { renderPng, type Label, type Stroke } from './sizes-render';

const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const OUT = resolve(REPORTS, 'A2-faces');

type Inner = {
  sheet: Sheet;
  chains: ChainSet;
  run: SizeRun;
  faces: { map: ReturnType<typeof faceMap>; seeds: Seed[] } | null;
};
const inner = (s: Session) => s as unknown as Inner;

const ROLE_COLOR: Record<string, string> = {
  size: '#d62728',
  common: '#1f77b4',
  seam: '#9467bd',
  grain: '#2ca02c',
  notch: '#8c564b',
  internal: '#ff7f0e',
  ignore: '#d0d0d0',
};

type Auto = {
  seeds: Record<string, number>;
  faceSeeds: { at: PtMm; areaCm2: number; depth: number }[];
  blobs: { junk: string | null; areaCm2: number; text: boolean }[];
  junkBy: Record<string, number>;
  legend: { role: string; chains: number; lenM: number; conf: number; why: string }[];
  families: { seed: number; origin: string; outcomes: string; areasCm2: number[] }[];
};

function render(file: string, inn: Inner, pc: StageIO['pieces']['out'], title: string) {
  const { chains, sheet } = inn;
  const roleOf = new Map<number, string>();
  for (const k of chains.classes) for (const id of k.chains) roleOf.set(id, k.role);
  const strokes: Stroke[] = [];
  // ignore first (under), then the rest
  const order = [...chains.chains].sort(
    (a, b) => (roleOf.get(a.id) === 'ignore' ? 0 : 1) - (roleOf.get(b.id) === 'ignore' ? 0 : 1),
  );
  for (const c of order) {
    const r = roleOf.get(c.id) ?? 'orphan';
    strokes.push({
      pts: c.pts,
      closed: c.closed,
      color: ROLE_COLOR[r] ?? '#000',
      width: r === 'ignore' ? 0.5 : 1,
    });
  }
  const labels: Label[] = [];
  for (const f of pc.families) {
    const c0 = f.candidates.find((c) => c.outcome === 'closed' && c.outer.length > 2);
    if (c0)
      strokes.push({ pts: c0.outer, closed: true, color: '#2ca02c', width: 2.5, dash: '6 4' });
  }
  for (const b of inn.faces?.map.blobs ?? []) {
    if (!b.junk || b.areaMm2 < PATIMPORT.minPieceAreaMm2) continue;
    const q = b.box;
    strokes.push({
      pts: [
        { x: q.minX, y: q.minY },
        { x: q.maxX, y: q.minY },
        { x: q.maxX, y: q.maxY },
        { x: q.minX, y: q.maxY },
      ],
      closed: true,
      color: '#888',
      width: 1,
      dash: '2 3',
    });
    labels.push({
      at: { x: q.minX + 2, y: q.maxY - 6 },
      text: `junk:${b.junk}`,
      color: '#555',
      size: 11,
    });
  }
  for (const sd of pc.seeds) {
    const col = sd.origin === 'face' ? '#e41a1c' : sd.origin === 'text' ? '#377eb8' : '#984ea3';
    const r = 6;
    strokes.push({
      pts: [
        { x: sd.at.x - r, y: sd.at.y },
        { x: sd.at.x + r, y: sd.at.y },
      ],
      color: col,
      width: 3,
    });
    strokes.push({
      pts: [
        { x: sd.at.x, y: sd.at.y - r },
        { x: sd.at.x, y: sd.at.y + r },
      ],
      color: col,
      width: 3,
    });
    labels.push({
      at: { x: sd.at.x + 8, y: sd.at.y + 4 },
      text: `${sd.origin} #${sd.id}`,
      color: col,
      size: 14,
    });
  }
  const box = { ...sheet.bbox };
  box.minX -= 10;
  box.minY -= 10;
  box.maxX += 10;
  box.maxY += 10;
  const px = Math.min(1.6, 1800 / Math.max(1, box.maxX - box.minX));
  const legend = [
    { color: '#000', text: title },
    ...chains.classes.map((k) => ({
      color: ROLE_COLOR[k.role] ?? '#000',
      text: `${k.id}:${k.role}${k.sizeLabel ? ` ${k.sizeLabel}` : ''} ${k.chains.length} conf ${k.confidence.toFixed(2)}`,
    })),
    { color: '#e41a1c', text: 'face seed' },
    { color: '#377eb8', text: 'text seed' },
    { color: '#2ca02c', text: 'closed outline (first rank)' },
  ];
  renderPng(file, box, strokes, labels, px, legend);
}

function autoOf(inn: Inner, pc: StageIO['pieces']['out']): Auto {
  const seeds: Record<string, number> = {};
  for (const s of pc.seeds) seeds[s.origin] = (seeds[s.origin] ?? 0) + 1;
  const blobs = (inn.faces?.map.blobs ?? []).filter((b) => b.areaMm2 >= PATIMPORT.minPieceAreaMm2);
  const junkBy: Record<string, number> = {};
  for (const b of blobs) if (b.junk) junkBy[b.junk] = (junkBy[b.junk] ?? 0) + 1;
  return {
    seeds,
    faceSeeds: pc.seeds
      .filter((s) => s.origin === 'face')
      .map((s) => ({
        at: { x: +s.at.x.toFixed(1), y: +s.at.y.toFixed(1) },
        areaCm2: Math.round((s.face?.areaMm2 ?? 0) / 100),
        depth: s.face?.depth ?? -1,
      })),
    blobs: blobs.map((b) => ({
      junk: b.junk,
      areaCm2: Math.round(b.areaMm2 / 100),
      text: b.textSeed != null,
    })),
    junkBy,
    legend: inn.chains.classes.map((k) => ({
      role: k.role,
      chains: k.chains.length,
      lenM: +(k.totalLengthMm / 1000).toFixed(2),
      conf: k.confidence,
      why: k.evidence.map((e) => e.kind + ('name' in e ? `:${e.name}` : '')).join(','),
    })),
    families: pc.families.map((f: PieceFamily) => ({
      seed: f.seed,
      origin: pc.seeds.find((s) => s.id === f.seed)?.origin ?? '?',
      outcomes: f.candidates.map((c) => c.outcome[0]).join(''),
      areasCm2: f.candidates.map((c) => Math.round(c.areaMm2 / 100)),
    })),
  };
}

type Check = { section: string; check: string; ok: boolean; got: string };
const checks: Check[] = [];
const check = (section: string, name: string, ok: boolean, got: unknown) =>
  checks.push({
    section,
    check: name,
    ok,
    got: typeof got === 'string' ? got : JSON.stringify(got),
  });

/** One case through the e2e operator pass; the automatic pieces run captured. */
async function oneCase(id: string) {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  let auto: Auto | null = null;
  let snap: { inn: Inner; pc: StageIO['pieces']['out'] } | null = null;
  const rec = await runCase(c, {
    onAutoPieces: (s, pc) => {
      const i0 = inner(s);
      // the session is closed when the case ends: keep the references
      const inn: Inner = { sheet: i0.sheet, chains: i0.chains, run: i0.run, faces: i0.faces };
      auto = autoOf(inn, pc);
      snap = { inn, pc };
      mkdirSync(OUT, { recursive: true });
      render(resolve(OUT, `${id.replace(/[^\w.-]+/g, '_')}.png`), inn, pc, id);
    },
  });
  return {
    rec,
    auto: auto as Auto | null,
    snap: snap as { inn: Inner; pc: StageIO['pieces']['out'] } | null,
  };
}

const FIXTURE: Record<string, number> = { blazer: 8, r4454: 9, redcafe: 4, wm: 4 };

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });

/**
 * The r4454 M2 trap (FLY-final): the back seeded by a click at (1350, 720) closed all six sizes,
 * at (1410, 614) it was refused. The back's face seed, and each click alone → the back's outcome.
 */
async function m2(): Promise<Record<string, unknown>> {
  const b = readFileSync(resolve(CORPUS, 'pdf/r4454.pdf'));
  const file = {
    name: 'r4454.pdf',
    bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  };
  const s = new Session(1, [file]);
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) => s.runStage(st, input, ctx());
  await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const cl = await run('clean', { edits: [] });
  const best = cl.scale[0];
  await run('scale', {
    decision: { factor: best.factor, method: best.method, operatorConfirmed: true },
  });
  await run('assemble', { sheet: 0 });
  await run('chains', {
    opts: {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
    },
  });
  const card = CASES.find((x) => x.id === 'r4454')!.card.map((t, i) => ({
    sizeId: i + 1,
    token: t,
  }));
  await run('sizes', { card } as unknown as StageIO['sizes']['in']);
  const opts = { cellMm: PATIMPORT.fillCellMm, snapMm: PATIMPORT.snapMm, variant: null };
  const auto = await run('pieces', { edits: [], opts });
  const back = auto.seeds.find(
    (x) =>
      x.origin === 'face' &&
      !!x.face &&
      1350 >= x.face.box.minX &&
      1350 <= x.face.box.maxX &&
      720 >= x.face.box.minY &&
      720 <= x.face.box.maxY,
  );
  const fam = (out: StageIO['pieces']['out'], sid: number) => {
    const f = out.families.find((x) => x.seed === sid);
    return f
      ? {
          outcomes: f.candidates.map((c) => c.outcome[0]).join(''),
          areasCm2: f.candidates.map((c) => Math.round(c.areaMm2 / 100)),
          at: out.seeds.find((x) => x.id === sid)?.at,
        }
      : null;
  };
  const res: Record<string, unknown> = { face: back ? fam(auto, back.id) : null };
  for (const [k, at] of [
    ['click1350', { x: 1350, y: 720 }],
    ['click1410', { x: 1410, y: 614 }],
  ] as const) {
    const seed: Seed = { id: 900, at, origin: 'click', variant: null };
    const out = await run('pieces', { seeds: [seed], edits: [], opts });
    res[k] = fam(out, 900);
  }
  s.close();
  return res;
}

// ── synthetic: every filter of the face pass and every rule of the legend by faces ──────────────

const rect = (x0: number, y0: number, x1: number, y1: number): PtMm[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const polyLenOf = (p: PtMm[], closed: boolean) => {
  let L = 0;
  const q = closed ? [...p, p[0]] : p;
  for (let i = 1; i < q.length; i++) L += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y);
  return L;
};
const chainOf = (id: number, pts: PtMm[], closed: boolean, style = 0): Chain => ({
  id,
  pts,
  closed,
  ranges: [{ path: id, from: 0, to: pts.length - 1 }],
  motif: null,
  style,
  lengthMm: polyLenOf(pts, closed),
});
const textAt = (id: number, x: number, y: number, t: string): IRText => ({
  id,
  text: t,
  anchor: { x, y },
  bbox: { minX: x, minY: y, maxX: x + 6, maxY: y + 3 },
  fontSizeMm: 3,
  rotationDeg: 0,
  layer: null,
  src: { file: 'syn', page: 0, op: id, sub: 0 },
});
const STYLE = (id: number, layer: string | null): Style => ({
  id,
  strokeRgb: [0, 0, 0],
  widthMm: 0.3,
  dash: null,
  layer,
  fill: false,
  clip: null,
});
const sheetOf = (bbox: BoxMm, poses: PagePose[], texts: IRText[], styles: Style[]): Sheet => ({
  id: 0,
  poses,
  pairs: [],
  bbox,
  missing: [],
  paths: [],
  texts,
  rasters: [],
  styles,
  warnings: [],
});
const pose = (x: number, y: number, w: number, h: number): PagePose => ({
  file: 'syn',
  page: 0,
  toSheet: { a: 1, b: 0, c: 0, d: 1, e: x, f: y },
  widthMm: w,
  heightMm: h,
  residualMm: 0,
});

/** The face-pass filters on a synthetic sheet: each one's junk, and seeded when it is off. */
function synthFaces() {
  const items: { pts: PtMm[]; closed: boolean }[] = [];
  const add = (pts: PtMm[], closed = true) => items.push({ pts, closed });
  // page 1 (0..500 × 0..400) framed as a wall, a piece inside it (peel)
  add(rect(0, 0, 500, 400));
  add(rect(100, 100, 300, 300));
  // a piece on page 2 (500..1000)
  add(rect(600, 100, 800, 350));
  // a test square
  add(rect(850, 50, 950, 150));
  // a small box
  add(rect(850, 200, 860, 210));
  // a logo: a box full of tiny strokes
  add(rect(850, 250, 910, 310));
  for (let i = 0; i < 50; i++)
    add(
      [
        { x: 853 + (i % 10) * 5, y: 253 + Math.floor(i / 10) * 10 },
        { x: 856 + (i % 10) * 5, y: 255 + Math.floor(i / 10) * 10 },
      ],
      false,
    );
  // a table: 2 rows × 4 cells of 25 × 10
  add(rect(520, 0, 620, 20));
  for (const x of [545, 570, 595])
    add(
      [
        { x, y: 0 },
        { x, y: 20 },
      ],
      false,
    );
  add(
    [
      { x: 520, y: 10 },
      { x: 620, y: 10 },
    ],
    false,
  );
  // a legend: a box with 4 line samples, a size number after each
  add(rect(640, 0, 760, 60));
  const texts: IRText[] = [];
  for (let i = 0; i < 4; i++) {
    add(
      [
        { x: 650, y: 10 + i * 12 },
        { x: 690, y: 10 + i * 12 },
      ],
      false,
    );
    texts.push(textAt(100 + i, 694, 9 + i * 12, String(44 + 2 * i)));
  }
  // a box drawn only in lines the furniture classifier set aside (weak walls)
  const weak = [{ chain: 9999, pts: rect(880, 330, 980, 390), closed: true }];
  const wallItems = items.map((it, i) => ({ chain: i, pts: it.pts, closed: it.closed }));
  const chains = items.map((it, i) => chainOf(i, it.pts, it.closed));
  const sheet = sheetOf(
    { minX: 0, minY: 0, maxX: 1000, maxY: 400 },
    [pose(0, 0, 500, 400), pose(500, 0, 500, 400)],
    texts,
    [STYLE(0, null)],
  );
  const judge = (off?: Set<FaceJunk | 'peel' | 'nested'>) => {
    const fr = faceRaster(sheet.bbox, wallItems, weak, 0.5);
    return judgeBlobs(fr, sheet, chains, wallItems, [], { off });
  };
  const at = (bs: FaceBlob[], x: number, y: number) =>
    bs.find(
      (b) =>
        b.box.minX <= x && b.box.maxX >= x && b.box.minY <= y && b.box.maxY >= y && b.areaMm2 >= 50,
    );
  const on = judge();
  const want: [FaceJunk | 'peel', number, number][] = [
    ['tile-frame', 20, 20],
    ['test-square', 900, 100],
    ['small', 855, 205],
    ['logo', 880, 280],
    ['table', 570, 10],
    ['legend', 700, 30],
    ['background', 930, 360],
  ];
  for (const [k, x, y] of want) {
    const b = at(on, x, y);
    check(
      'synthetic faces',
      `${k}: junk`,
      b?.junk === k,
      b ? { junk: b.junk, area: Math.round(b.areaMm2) } : 'no blob',
    );
    const o = judge(new Set([k]));
    const b2 = at(o, x, y);
    check(
      'synthetic faces',
      `${k} off: seeded (mutation)`,
      !!b2 && !b2.junk,
      b2 ? { junk: b2.junk } : 'no blob',
    );
  }
  // the piece inside the framed page is peeled out and seeded; without peeling it is lost
  const inner = on.find((b) => b.peeled && b.box.minX >= 99 && b.box.maxX <= 301);
  check(
    'synthetic faces',
    'peel: the piece inside a framed page is seeded',
    !!inner && !inner.junk,
    inner ?? 'none',
  );
  const np = judge(new Set(['peel']));
  check(
    'synthetic faces',
    'peel off: it is not (mutation)',
    !np.some((b) => b.peeled),
    np.filter((b) => b.peeled).length,
  );
  const piece2 = at(on, 700, 200);
  check(
    'synthetic faces',
    'a plain piece is seeded',
    !!piece2 && !piece2.junk,
    piece2?.junk ?? null,
  );
  // a frame larger than 60 % of the sheet
  const big = sheetOf({ minX: 0, minY: 0, maxX: 520, maxY: 420 }, [], [], [STYLE(0, null)]);
  const bigItems = [
    { chain: 0, pts: rect(0, 0, 510, 410), closed: true },
    { chain: 1, pts: rect(100, 100, 300, 300), closed: true },
  ];
  const bigChains = bigItems.map((it) => chainOf(it.chain, it.pts, true));
  const fb = judgeBlobs(faceRaster(big.bbox, bigItems, [], 0.5), big, bigChains, bigItems, []);
  check(
    'synthetic faces',
    'sheet: a sheet-sized border is junk, the piece inside is seeded',
    fb.some((b) => b.junk === 'sheet') && fb.some((b) => b.peeled && !b.junk),
    fb.map((b) => [b.junk, Math.round(b.areaMm2 / 100)]),
  );
  const fb2 = judgeBlobs(faceRaster(big.bbox, bigItems, [], 0.5), big, bigChains, bigItems, [], {
    off: new Set(['sheet']),
  });
  check(
    'synthetic faces',
    'sheet off: the border is seeded (mutation)',
    !fb2.some((b) => b.junk === 'sheet'),
    fb2.map((b) => [b.junk, Math.round(b.areaMm2 / 100)]),
  );
}

/** The legend by faces on a synthetic one-pen sheet: each rule, and its mutation. */
function synthRoles() {
  const lines: { pts: PtMm[]; closed: boolean; style?: number; tag: string }[] = [];
  const L = (tag: string, pts: PtMm[], closed = false, style = 0) =>
    lines.push({ tag, pts, closed, style });
  // two pieces, cut + seam 10 mm inside, in the layer "Cut lines" (style 1, the same pen)
  L('cut', rect(0, 0, 300, 400), true, 1);
  L('seam', rect(10, 10, 290, 390), true, 1);
  L('cut', rect(400, 0, 650, 350), true, 1);
  L('seam', rect(410, 10, 640, 340), true, 1);
  // a grain line inside A
  L('grain', [
    { x: 200, y: 60 },
    { x: 200, y: 340 },
  ]);
  // a diagonal crossing A's outline
  L('cross', [
    { x: -40, y: 40 },
    { x: 120, y: 260 },
  ]);
  // stroke lettering inside A
  for (let i = 0; i < 6; i++)
    L('letters', [
      { x: 60 + i * 5, y: 100 },
      { x: 62 + i * 5, y: 110 },
    ]);
  // a hand-drawn wiggle inside B
  const zig: PtMm[] = [];
  for (let i = 0; i <= 24; i++) zig.push({ x: 450 + i * 6, y: 150 + (i % 2) * 8 });
  L('wiggle', zig);
  // a curve mostly outside B
  L('outside', [
    { x: 560, y: 300 },
    { x: 600, y: 380 },
    { x: 640, y: 420 },
    { x: 700, y: 430 },
  ]);
  // a line the clean step offered (path offered)
  L('offered', [
    { x: 450, y: 250 },
    { x: 600, y: 250 },
  ]);
  // a test square
  L('square', rect(700, 0, 800, 100), true);
  // a table of 2 × 4 cells
  L('table', rect(700, 200, 800, 220), true);
  for (const x of [725, 750, 775])
    L('table', [
      { x, y: 200 },
      { x, y: 220 },
    ]);
  L('table', [
    { x: 700, y: 210 },
    { x: 800, y: 210 },
  ]);
  const chains = lines.map((l, i) => chainOf(i, l.pts, l.closed, l.style));
  const styles = new Map<number, Style>([
    [0, STYLE(0, null)],
    [1, STYLE(1, 'Cut lines')],
  ]);
  const sheet = sheetOf(
    { minX: -50, minY: -10, maxX: 820, maxY: 440 },
    [],
    [],
    [...styles.values()],
  );
  const set: ChainSet = {
    chains,
    classes: [
      {
        id: 0,
        role: 'internal',
        sizeLabel: null,
        chains: chains.map((c) => c.id),
        totalLengthMm: chains.reduce((a, c) => a + c.lengthMm, 0),
        evidence: [],
        confidence: 0.5,
      },
    ],
    bundles: [],
    orphans: [],
    warnings: [],
  };
  const offered = new Set(lines.flatMap((l, i) => (l.tag === 'offered' ? [i] : [])));
  type Off = NonNullable<FaceRoleOpts['off']>;
  const roleOf = (off?: Off) => {
    const out = rolesByFaces(sheet, set, styles, offered, { off });
    const by = new Map<string, Set<string>>();
    for (const c of out.classes)
      for (const id of c.chains) {
        const t = lines[id].tag;
        if (!by.has(t)) by.set(t, new Set());
        by.get(t)!.add(c.role);
      }
    const row = out.classes.find((c) => c.evidence.some((e) => e.kind === 'faces'));
    const ev = row?.evidence.find((e) => e.kind === 'faces');
    return {
      role: (t: string) => [...(by.get(t) ?? [])].join('+'),
      auto: !!ev && ev.kind === 'faces' && ev.auto,
      cues: ev && ev.kind === 'faces' ? ev.cues : [],
      conf: row?.confidence ?? 0,
    };
  };
  const r = roleOf();
  const expect: [string, string][] = [
    ['cut', 'common'],
    ['seam', 'common'],
    ['grain', 'internal'],
    ['cross', 'ignore'],
    ['letters', 'ignore'],
    ['wiggle', 'ignore'],
    ['outside', 'ignore'],
    ['offered', 'ignore'],
    ['square', 'ignore'],
    ['table', 'ignore'],
  ];
  for (const [t, want] of expect)
    check('synthetic legend', `${t} → ${want}`, r.role(t) === want, r.role(t));
  check(
    'synthetic legend',
    'outline row auto (faces + layer + drawn double)',
    r.auto && r.conf >= 0.6,
    r.cues,
  );
  const mut: [NonNullable<Off> extends ReadonlySet<infer K> ? K : never, string, string][] = [
    ['inside', 'cross', 'internal'],
    ['inside', 'letters', 'internal'],
    ['inside', 'wiggle', 'internal'],
    ['outside', 'outside', 'internal'],
    ['offered', 'offered', 'internal'],
    ['square', 'square', 'common'],
    ['junk', 'table', 'internal'],
  ];
  for (const [k, t, want] of mut) {
    const m = roleOf(new Set([k]));
    check('synthetic legend', `${k} off: ${t} → ${want} (mutation)`, m.role(t) === want, m.role(t));
  }
  const noLayerRing = roleOf(new Set(['layer', 'ring']));
  check(
    'synthetic legend',
    'layer + ring off: one cue → asked, not auto (mutation)',
    !noLayerRing.auto && noLayerRing.conf < 0.6,
    noLayerRing.cues,
  );
  const noRing = roleOf(new Set(['ring']));
  check('synthetic legend', 'ring off: faces + layer still auto', noRing.auto, noRing.cues);
  const noLayer = roleOf(new Set(['layer']));
  check(
    'synthetic legend',
    'layer off: faces + drawn double still auto',
    noLayer.auto,
    noLayer.cues,
  );
  const all = roleOf(new Set(['all']));
  check(
    'synthetic legend',
    'all off: the legend is left as built (mutation)',
    all.role('cut') === 'internal',
    all.role('cut'),
  );
}

export async function main(args: string[]): Promise<number> {
  const mode = args[0];
  const id = args[1];
  if (mode === 'synth') {
    synthFaces();
    synthRoles();
    console.log(`@@RESULT ${JSON.stringify({ id: 'synthetic', checks })}`);
    return 0;
  }
  if (mode === 'm2') {
    console.log(`@@RESULT ${JSON.stringify({ id: 'r4454-M2', m2: await m2() })}`);
    return 0;
  }
  if (mode === 'case') {
    const { rec, auto, snap } = await oneCase(id);
    const out: Record<string, unknown> = {
      id,
      verdict: rec.verdict,
      reason: rec.reason,
      clicks: rec.clicks,
      faceSeeds: rec.faceSeeds,
      legendEdited: (rec.legend as Record<string, unknown> | undefined)?.edited ?? null,
      wrongPassing: rec.wrongPassing ?? 0,
      auto,
    };
    // mutation: each filter off → what it held back is seeded
    if (snap && args.includes('--mutate')) {
      const s = snap as { inn: Inner; pc: StageIO['pieces']['out'] };
      const text = s.pc.seeds.filter((x) => x.origin === 'text');
      const count = (off?: Set<FaceJunk | 'peel' | 'nested'>) =>
        faceSeedsOf(faceMap(s.inn.sheet, s.inn.chains, s.inn.run, text, { off }), 1000).length;
      const base = count();
      const mut: Record<string, number> = {};
      for (const k of [
        'small',
        'sheet',
        'tile-frame',
        'test-square',
        'legend',
        'table',
        'logo',
        'background',
        'unlabelled',
        'other-size',
        'peel',
        'nested',
      ] as const)
        mut[k] = count(new Set([k])) - base;
      out.mutation = mut;
    }
    console.log(`@@RESULT ${JSON.stringify(out)}`);
    return 0;
  }
  if (mode === 'summary') {
    const file = resolve(REPORTS, 'A2-faces.json');
    const rows = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[];
    const base = (() => {
      const f = process.env.FACES_BASE;
      if (!f || !existsSync(f)) return new Map<string, Record<string, unknown>>();
      return new Map(
        (JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>[]).map((r) => [
          r.id as string,
          r,
        ]),
      );
    })();
    const by = new Map(rows.map((r) => [r.id as string, r]));
    for (const c of (by.get('synthetic')?.checks as Check[] | undefined) ?? []) checks.push(c);
    const A = (r: Record<string, unknown> | undefined) => r?.auto as Auto | undefined;
    // wm M: 4 face seeds, 0 seed clicks; outline row apart from the junk
    const wm = by.get('wm-M');
    if (wm) {
      const a = A(wm)!;
      check(
        'wm M',
        '4 pieces seeded with 0 clicks',
        a.seeds.face === 4 && !(wm.clicks as { byKind: Record<string, number> })?.byKind?.seed,
        a.seeds,
      );
      const pieceRow = a.legend.filter(
        (k) => (k.role === 'size' || k.role === 'common') && k.chains > 0,
      );
      check(
        'wm M',
        'one piece-outline row, apart from the leftover junk',
        pieceRow.length === 1,
        a.legend,
      );
    }
    const svg = by.get('syn:inkscape-smoke-SML');
    if (svg) {
      const a = A(svg)!;
      check('SVG smoke', '2 face seeds', a.seeds.face === 2 && !a.seeds.text, a.seeds);
      check(
        'SVG smoke',
        '0 legend edits (outlines row = size/cut)',
        !svg.legendEdited &&
          !(svg.clicks as { byKind: Record<string, number> })?.byKind?.['legend-row'],
        { edited: svg.legendEdited, clicks: svg.clicks },
      );
    }
    for (const [k, n] of Object.entries(FIXTURE)) {
      const r = by.get(k);
      if (!r) continue;
      const fsd = r.faceSeeds as { offered: number; took: number; junk: number } | undefined;
      check(k, `face seeds: ≤ 1 junk face (fixture ${n} clicks)`, (fsd?.junk ?? 0) <= 1, fsd);
    }
    const m2r = by.get('r4454-M2')?.m2 as
      | Record<string, { outcomes: string; areasCm2: number[] } | null>
      | undefined;
    if (m2r) {
      const a = m2r.click1350;
      const b = m2r.click1410;
      const f = m2r.face;
      check(
        'r4454 M2',
        'the back: its face seed gives the outcome of the good click (1350,720), not the refused one',
        !!a &&
          !!f &&
          f.outcomes === a.outcomes &&
          JSON.stringify(f.areasCm2) === JSON.stringify(a.areasCm2),
        { face: f, click1350: a, click1410: b },
      );
      check('r4454 M2', 'the back closes in every size', !!f && /^c+$/.test(f.outcomes), f);
    }
    for (const r of rows) {
      const b = base.get(r.id as string);
      if (!b) continue;
      const now = (r.wrongPassing as number) ?? 0;
      const was = (b.wrongPassing as number) ?? 0;
      check('e2e', `${r.id}: wrongPassing not grown`, now <= was, { was, now });
    }
    for (const r of rows) {
      const mut = r.mutation as Record<string, number> | undefined;
      if (mut) check('mutation', `${r.id}`, true, mut);
    }
    const bad = checks.filter((c) => !c.ok);
    for (const c of checks)
      console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.section} · ${c.check}  — ${c.got.slice(0, 400)}`);
    console.log(`\n${checks.length - bad.length}/${checks.length} PASS`);
    writeFileSync(resolve(REPORTS, 'A2-faces-checks.json'), JSON.stringify(checks, null, 1));
    return bad.length ? 1 : 0;
  }
  throw new Error('mode? case <id> [--mutate] | summary');
}
