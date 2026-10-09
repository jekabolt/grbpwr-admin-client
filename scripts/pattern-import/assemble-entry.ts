// PATTERN-IMPORT · F2 probe entry (bundled by assemble.mjs). Modes:
//   corpus    every vector sample (+ leonie through the raster adapter): extract → classifyPages →
//             assembleSheet per sheet; layout vs the K0 grid truth, exact-lattice check where
//             recurrence gives the truth, overview check, residuals, one PNG per sheet
//   controls  negative controls: a 2 mm wrong pair, a 2 mm moved tile, a dropped tile, a quarter-
//             turned tile, the manual grid override
//   perf      polupalto (91 pages) timings and peak RSS in this process
//   all       corpus + controls + perf → reports/F2-<date>.json + F2.md + F2-sheets/*.png

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { encode as encodePng } from 'fast-png';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { extractRasterPdfDetailed, setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import {
  assembleSheetDetailed,
  classifyPages,
  pairResiduals,
  solvePosesDetailed,
  type SheetReport,
} from 'lib/pattern-import/assemble';
import type {
  IRPage,
  PageClassification,
  PagePose,
  PairTransform,
  Sheet,
  SourceDoc,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const SHEETS_DIR = resolve(REPORTS, 'F2-sheets');
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);
setRasterPdfjsLoader(() => import(LEGACY));

const ab = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Samples and their K0 truth (corpus/truth.json + TRUTH.md, transcribed: tiles per row, or per
// column for column-major files; the exact pitch where recurrence proves it).
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Sample = {
  id: string;
  files: string[];
  raster?: boolean;
  /** Per sheet (in sheet-id order): tiles per row (or per column when byCol). null = unknown. */
  grid: (number[] | null)[];
  /** Per file of a file-per-size set: tiles per row/col. */
  perFile?: number[][];
  byCol?: boolean;
  /** Exact tile pitch where recurrence gives the truth (mm). */
  exact?: [number, number];
  /** Pitch measured by the Ф0/Ф0.5 probes, for comparison. */
  probePitch?: [number, number];
  /** Expected classification counts (pages per class), from TRUTH.md. */
  pagesNote: string;
};

const W = (s: string) => `wm_kka_15_01_${s}_wykroj.pdf`;
const SAMPLES: Sample[] = [
  {
    id: 'reef',
    files: ['reef.pdf'],
    grid: [[6, 6, 5, 5, 5, 5]],
    probePitch: [196.8, 266.7],
    pagesNote: 'p1–3 cover/instructions, 32 tiles A1…F5',
  },
  {
    id: 'robe',
    files: ['robe.pdf'],
    grid: [[7, 7, 7]],
    exact: [170, 257],
    pagesNote: 'p1–10 cover/instr., p11 overview, p12–32 tiles',
  },
  {
    id: 'viola',
    files: ['viola.pdf'],
    grid: [[6, 6, 6, 6, 6, 5]],
    probePitch: [195.9, 259.4],
    pagesNote: '35 tiles (p1 square, p2 key, p29 size table are tiles)',
  },
  {
    id: 'palto',
    files: ['palto.pdf'],
    grid: [[7, 7, 7, 7, 7]],
    exact: [170, 257],
    pagesNote: 'p1 instructions, p2 overview, p3–37 tiles',
  },
  {
    id: 'zhaket',
    files: ['zhaket.pdf'],
    grid: [[7, 7, 7, 7]],
    exact: [170, 257],
    pagesNote: 'p1 overview, p2–29 tiles',
  },
  {
    id: 'kombinezon',
    files: ['kombinezon.pdf'],
    grid: [[5, 5, 5, 5, 5, 5, 5, 3, 3, 3]],
    exact: [190, 280],
    pagesNote: '44 tiles (7×5 + 3×3 under cols 1–3)',
  },
  {
    id: 'blazer',
    files: ['blazer.pdf'],
    grid: [[4, 4, 4, 4, 4, 4]],
    exact: [190, 280],
    pagesNote: 'p1 landscape cover/overview, p2–25 portrait tiles',
  },
  {
    id: 'r4454',
    files: ['r4454.pdf'],
    grid: [[8, 8, 8, 7], null],
    probePitch: [185.9, 272.9],
    pagesNote: 'p1–3 info, p4–34 main sheet, p35–39 interfacing sheet',
  },
  {
    id: 'polupalto',
    files: ['polupalto.pdf'],
    grid: [
      [10, 10, 10, 10, 10],
      [7, 7, 7, 7, 7],
    ],
    exact: [170, 257],
    pagesNote: 'p1–4 instr., p5 overview A, p6–55 A, p56 overview B, p57–91 B',
  },
  {
    id: 'redcafe',
    files: ['44.pdf', '46.pdf', '48.pdf', '50.pdf', '52.pdf', '54.pdf'],
    grid: [null],
    perFile: [
      [7, 7, 6],
      [7, 7, 7],
      [7, 7, 7],
      [7, 7, 7],
      [7, 8, 7],
      [8, 8, 8],
    ],
    probePitch: [186, 273],
    pagesNote: 'p1 info page per file, tiles with r:c labels',
  },
  {
    id: 'wm',
    files: ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'].map(W),
    grid: [null],
    perFile: [...Array(6).fill([3, 3, 2, 3, 3]), [3, 3, 3, 3, 3]],
    byCol: true,
    pagesNote: '14 tiles (15 in xxxl), column-major, R3C3 omitted except xxxl',
  },
  {
    id: 'leonie',
    files: ['leonie.pdf'],
    raster: true,
    grid: [[3, 3, 3, 3, 3, 3, 3, 3, 3]],
    pagesNote: '27 raster tiles A1…I3 (labels in the raster)',
  },
];

async function loadDocs(s: Sample): Promise<{ docs: SourceDoc[]; ms: number }> {
  const t = Date.now();
  const docs: SourceDoc[] = [];
  for (let i = 0; i < s.files.length; i++) {
    const f = { id: String(i), name: s.files[i], bytes: ab(resolve(CORPUS, 'pdf', s.files[i])) };
    docs.push(
      s.raster
        ? (await extractRasterPdfDetailed(f, DEFAULT_EXTRACT_OPTS)).doc
        : await extractPdf(f, DEFAULT_EXTRACT_OPTS),
    );
  }
  return { docs, ms: Date.now() - t };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Rendering (PNG, downscaled): tile outlines blue, drawing per file colour.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const PALETTE: [number, number, number][] = [
  [0, 0, 0],
  [200, 30, 30],
  [30, 120, 200],
  [20, 150, 60],
  [190, 110, 0],
  [130, 50, 170],
  [0, 150, 150],
];

function renderSheet(sheet: Sheet, file: string, maxPx = 1800) {
  const box = sheet.bbox;
  const s = maxPx / Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
  const w = Math.ceil((box.maxX - box.minX) * s) + 4;
  const h = Math.ceil((box.maxY - box.minY) * s) + 4;
  const data = new Uint8Array(w * h * 3).fill(255);
  const px = (x: number, y: number, c: [number, number, number]) => {
    const X = Math.round((x - box.minX) * s) + 2;
    const Y = Math.round((box.maxY - y) * s) + 2;
    if (X < 0 || Y < 0 || X >= w || Y >= h) return;
    const i = (Y * w + X) * 3;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  };
  const line = (ax: number, ay: number, bx: number, by: number, c: [number, number, number]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * s));
    if (n > 40000) return;
    for (let i = 0; i <= n; i++) px(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, c);
  };
  for (const p of sheet.poses) {
    const m = p.toSheet;
    const c = [
      [0, 0],
      [p.widthMm, 0],
      [p.widthMm, p.heightMm],
      [0, p.heightMm],
    ].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    for (let i = 0; i < 4; i++)
      line(c[i][0], c[i][1], c[(i + 1) % 4][0], c[(i + 1) % 4][1], [150, 200, 255]);
  }
  for (const path of sheet.paths) {
    const st = sheet.styles[path.style];
    const fill = st?.fill && !st.widthMm;
    const col = fill
      ? ([170, 170, 170] as [number, number, number])
      : PALETTE[+path.src.file % PALETTE.length];
    const pts = path.closed ? [...path.pts, path.pts[0]] : path.pts;
    for (let i = 1; i < pts.length; i++) line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, col);
  }
  writeFileSync(file, encodePng({ width: w, height: h, data, channels: 3 }));
  return { file, w, h };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Tiles per row (or per column), rows in order, per file. */
function lineCounts(poses: PagePose[], byCol: boolean): number[] {
  const m = new Map<number, number>();
  for (const p of poses) {
    const k = byCol ? p.col : p.row;
    if (k === undefined) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}

/** Max deviation of the poses from the EXACT lattice (pitch from truth), mm. */
function exactLatticeDev(poses: PagePose[], pitch: [number, number]): number {
  const ref = poses.find((p) => p.row !== undefined && p.col !== undefined);
  if (!ref || ref.row === undefined || ref.col === undefined) return NaN;
  let dev = 0;
  for (const p of poses) {
    if (p.row === undefined || p.col === undefined) continue;
    const ex = ref.toSheet.e + (p.col - ref.col) * pitch[0];
    const ey = ref.toSheet.f - (p.row - ref.row) * pitch[1];
    dev = Math.max(dev, Math.hypot(p.toSheet.e - ex, p.toSheet.f - ey));
  }
  return dev;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

type SheetOut = {
  sheet: number;
  pages: number;
  files: string[];
  ms: number;
  layout: {
    file: string;
    from: string;
    order: string;
    flow: string;
    lines: number[];
    expected: number[] | null;
    ok: boolean | null;
  }[];
  pitch: { file: string; method: string; right: [number, number]; below: [number, number] }[];
  exactLattice: { pitch: [number, number]; maxDevMm: number; ok: boolean } | null;
  latticeFitMaxMm: number;
  maxPairResidualMm: number;
  rejectedPairs: number;
  pairs: Record<string, number>;
  unverifiedPages: number;
  missing: Sheet['missing'];
  tileExtentMm: [number, number];
  drawingBboxMm: [number, number];
  overview: SheetReport['overview'];
  overviewOk: boolean | null;
  place: SheetReport['place'];
  alignment: SheetReport['alignment'];
  png: string;
  warnings: string[];
};

type SampleOut = {
  id: string;
  files: string[];
  extractMs: number;
  classifyMs: number;
  classes: {
    file: string;
    page: number;
    cls: string;
    sheet?: number;
    confidence: number;
    why: string;
  }[];
  classSummary: string;
  pagesNote: string;
  sheets: SheetOut[];
  error?: string;
};

function summarizeClasses(cls: PageClassification[], files: string[]): string {
  const parts: string[] = [];
  let cur: { k: string; file: string; a: number; b: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const f = files.length > 1 ? `${files[+cur.file]}:` : '';
    parts.push(`${f}${cur.k} p${cur.a + 1}${cur.b > cur.a ? `–${cur.b + 1}` : ''}`);
  };
  for (const c of cls) {
    const k = `${c.cls}${c.sheet !== undefined ? `#${c.sheet}` : ''}`;
    if (cur && cur.k === k && cur.file === c.file && cur.b === c.page - 1) cur.b = c.page;
    else {
      flush();
      cur = { k, file: c.file, a: c.page, b: c.page };
    }
  }
  flush();
  return parts.join(', ');
}

async function runSample(s: Sample): Promise<SampleOut> {
  const { docs, ms: extractMs } = await loadDocs(s);
  const t1 = Date.now();
  const classes = classifyPages(docs);
  const classifyMs = Date.now() - t1;
  const sheetIds = [
    ...new Set(classes.filter((c) => c.cls === 'tile').map((c) => c.sheet as number)),
  ].sort((a, b) => a - b);
  const sheets: SheetOut[] = [];
  for (const sid of sheetIds) {
    const t = Date.now();
    const { sheet, report } = assembleSheetDetailed(docs, classes, sid);
    const ms = Date.now() - t;
    const png = renderSheet(sheet, resolve(SHEETS_DIR, `${s.id}-sheet${sid}.png`));
    const files = [...new Set(sheet.poses.map((p) => p.file))];
    const layout = report.groups.map((g, gi) => {
      const lines = lineCounts(g.poses, !!s.byCol);
      const expected = s.perFile ? s.perFile[+g.file] ?? null : s.grid[sid] ?? null;
      return {
        file: s.files[+g.file],
        from: g.layoutFrom,
        order: g.layout.order,
        flow: g.layout.flow,
        lines,
        expected,
        ok: expected ? JSON.stringify(lines) === JSON.stringify(expected) : null,
        gi,
      };
    });
    const pitch = report.groups.map((g) => ({
      file: s.files[+g.file],
      method: g.pitch.from,
      right: [r3((g.fitted ?? g.pitch).right.dx), r3((g.fitted ?? g.pitch).right.dy)] as [
        number,
        number,
      ],
      below: [r3((g.fitted ?? g.pitch).below.dx), r3((g.fitted ?? g.pitch).below.dy)] as [
        number,
        number,
      ],
    }));
    const exact = s.exact
      ? (() => {
          const dev = Math.max(
            ...report.groups.map((g) => exactLatticeDev(g.poses, s.exact as [number, number])),
          );
          return { pitch: s.exact, maxDevMm: r3(dev), ok: dev <= 0.1 };
        })()
      : null;
    const pairs: Record<string, number> = {};
    for (const p of sheet.pairs) pairs[p.method] = (pairs[p.method] ?? 0) + 1;
    const res = report.groups.flatMap((g) => g.residuals);
    sheets.push({
      sheet: sid,
      pages: sheet.poses.length,
      files: files.map((f) => s.files[+f]),
      ms,
      layout: layout.map(({ gi: _gi, ...l }) => l),
      pitch,
      exactLattice: exact,
      latticeFitMaxMm: r3(Math.max(0, ...report.groups.map((g) => g.latticeMaxMm))),
      maxPairResidualMm: r3(Math.max(0, ...res)),
      rejectedPairs: report.groups.reduce((n, g) => n + g.rejected.length, 0),
      pairs,
      unverifiedPages: report.groups.reduce((n, g) => n + g.unverified.length, 0),
      missing: sheet.missing,
      tileExtentMm: [r3(report.tileExtent[0]), r3(report.tileExtent[1])],
      drawingBboxMm: [r3(sheet.bbox.maxX - sheet.bbox.minX), r3(sheet.bbox.maxY - sheet.bbox.minY)],
      overview: report.overview,
      overviewOk: report.overview
        ? Math.abs(report.overview.errX) <= 0.02 && Math.abs(report.overview.errY) <= 0.02
        : null,
      place: report.place,
      alignment: report.alignment,
      png: png.file,
      warnings: sheet.warnings,
    });
  }
  return {
    id: s.id,
    files: s.files,
    extractMs,
    classifyMs,
    classes: classes.map((c) => ({
      file: s.files[+c.file],
      page: c.page + 1,
      cls: c.cls,
      sheet: c.sheet,
      confidence: c.confidence,
      why: c.why,
    })),
    classSummary: summarizeClasses(classes, s.files),
    pagesNote: s.pagesNote,
    sheets,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Negative controls
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Control = { name: string; expect: string; got: string; pass: boolean };

const sample = (id: string) => SAMPLES.find((s) => s.id === id) as Sample;

/** Quarter-turn a page CCW: (x, y) → (H − y, x); width ↔ height. */
function turnPage(p: IRPage): IRPage {
  const H = p.heightMm;
  const T = (v: { x: number; y: number }) => ({ x: H - v.y, y: v.x });
  return {
    ...p,
    widthMm: p.heightMm,
    heightMm: p.widthMm,
    paths: p.paths.map((q) => ({ ...q, pts: q.pts.map(T) })),
    texts: p.texts.map((t) => {
      const a = T({ x: t.bbox.minX, y: t.bbox.minY });
      const b = T({ x: t.bbox.maxX, y: t.bbox.maxY });
      return {
        ...t,
        anchor: T(t.anchor),
        bbox: {
          minX: Math.min(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxX: Math.max(a.x, b.x),
          maxY: Math.max(a.y, b.y),
        },
        rotationDeg: t.rotationDeg + 90,
      };
    }),
    rasters: [],
    // Clip boxes are page-frame boxes; turned page = no clip info needed for this control.
    styles: p.styles.map((st) => ({ ...st, clip: null })),
  };
}

async function controls(): Promise<Control[]> {
  const out: Control[] = [];
  // 1. A 2 mm wrong pair measurement in the solve.
  for (const id of ['palto', 'reef', 'viola']) {
    const { docs } = await loadDocs(sample(id));
    const cls = classifyPages(docs);
    const { report } = assembleSheetDetailed(docs, cls, 0);
    const g = report.groups[0];
    const geo = g.pairs.filter((p) => p.method === 'edge-stitch' || p.method === 'recurrence');
    // A seam pair (adjacent tiles), in the middle of the sheet.
    const k = geo.findIndex((p, i) => i >= geo.length / 2 && Math.hypot(p.dxMm, p.dyMm) < 300);
    const bad = geo[k];
    const pairs: PairTransform[] = g.pairs.map((p) => (p === bad ? { ...p, dxMm: p.dxMm + 2 } : p));
    const sol = solvePosesDetailed(
      pairs,
      new Map(),
      g.poses.map((p) => ({ file: p.file, page: p.page })),
    );
    const rejectedBad = sol.rejected.some(
      (r) =>
        r.pair.from.page === bad.from.page &&
        r.pair.to.page === bad.to.page &&
        Math.abs(r.pair.dxMm - bad.dxMm - 2) < 1e-9,
    );
    const flagged = sol.warnings.length > 0;
    // Poses unaffected once the bad pair is out?
    const before = new Map(g.poses.map((p) => [`${p.file}:${p.page}`, p.toSheet]));
    let drift = 0;
    for (const p of sol.poses) {
      const b = before.get(`${p.file}:${p.page}`);
      const b0 = before.get(`${sol.poses[0].file}:${sol.poses[0].page}`);
      if (!b || !b0) continue;
      drift = Math.max(
        drift,
        Math.hypot(
          p.toSheet.e - sol.poses[0].toSheet.e - (b.e - b0.e),
          p.toSheet.f - sol.poses[0].toSheet.f - (b.f - b0.f),
        ),
      );
    }
    out.push({
      name: `${id}: pair p${bad.from.page + 1}→p${bad.to.page + 1} (${bad.method}) measured +2 mm`,
      expect: 'flagged by loop closure (rejected or residual > 0.3 mm)',
      got: `${rejectedBad ? 'rejected' : 'not rejected'}; warnings: ${sol.warnings.slice(0, 2).join(' | ')}; max pose drift after the solve ${drift.toFixed(3)} mm`,
      pass: flagged,
    });
    // 2. A 2 mm moved tile (pose perturbed after the solve): the seam residuals see it.
    const page = g.poses[Math.floor(g.poses.length / 2)];
    const moved = g.poses.map((p) =>
      p === page ? { ...p, toSheet: { ...p.toSheet, e: p.toSheet.e + 2 } } : p,
    );
    const resBefore = pairResiduals(
      g.poses,
      g.pairs.filter((p) => p.method !== 'grid-label'),
    );
    const resAfter = pairResiduals(
      moved,
      g.pairs.filter((p) => p.method !== 'grid-label'),
    );
    const hit = resAfter.filter((r) => r > PATIMPORT.registrationMaxResidualMm).length;
    out.push({
      name: `${id}: tile p${page.page + 1} moved 2 mm after assembly`,
      expect: 'its seams exceed the 0.3 mm residual',
      got: `max residual ${Math.max(...resBefore).toFixed(3)} → ${Math.max(...resAfter).toFixed(3)} mm; ${hit} pair(s) over 0.3`,
      pass: hit > 0 && Math.max(...resBefore) <= PATIMPORT.registrationMaxResidualMm,
    });
  }
  // 3. A dropped tile: reef (cell labels), palto (windowed recurrence).
  for (const [id, drop] of [
    ['reef', 22],
    ['palto', 20],
  ] as [string, number][]) {
    const { docs } = await loadDocs(sample(id));
    const d0 = docs[0];
    const page = d0.pages.find((p) => p.page === drop - 1) as IRPage;
    const full = assembleSheetDetailed(docs, classifyPages(docs), 0).sheet;
    const cell = full.poses.find((p) => p.page === drop - 1);
    const cut: SourceDoc = { ...d0, pages: d0.pages.filter((p) => p !== page) };
    const cls = classifyPages([cut]);
    const { sheet } = assembleSheetDetailed([cut], cls, 0);
    const found = sheet.missing.some((m) => m.row === cell?.row && m.col === cell?.col);
    out.push({
      name: `${id}: tile p${drop} (row ${(cell?.row ?? 0) + 1}, col ${(cell?.col ?? 0) + 1}) removed`,
      expect: 'Sheet.missing names that cell',
      got: `missing = ${JSON.stringify(sheet.missing)}`,
      pass: found,
    });
  }
  // 4. Mixed orientation: robe tile p20 quarter-turned.
  {
    const { docs } = await loadDocs(sample('robe'));
    const d0 = docs[0];
    const ref = assembleSheetDetailed(docs, classifyPages(docs), 0).sheet;
    const turned: SourceDoc = {
      ...d0,
      pages: d0.pages.map((p) => (p.page === 19 ? turnPage(p) : p)),
    };
    const cls = classifyPages([turned]);
    const c20 = cls.find((c) => c.page === 19);
    const { sheet } = assembleSheetDetailed([turned], cls, 0);
    const a = ref.poses.find((p) => p.page === 19);
    const b = sheet.poses.find((p) => p.page === 19);
    let err = NaN;
    if (a && b) {
      // Same physical point: original (x, y) ↔ turned (H − y, x).
      const H = d0.pages[19].heightMm;
      const pts = [
        { x: 10, y: 10 },
        { x: 150, y: 240 },
      ];
      err = Math.max(
        ...pts.map((p) => {
          const s0 = {
            x: a.toSheet.a * p.x + a.toSheet.c * p.y + a.toSheet.e,
            y: a.toSheet.b * p.x + a.toSheet.d * p.y + a.toSheet.f,
          };
          const q = { x: H - p.y, y: p.x };
          const s1 = {
            x: b.toSheet.a * q.x + b.toSheet.c * q.y + b.toSheet.e,
            y: b.toSheet.b * q.x + b.toSheet.d * q.y + b.toSheet.f,
          };
          return Math.hypot(s0.x - s1.x, s0.y - s1.y);
        }),
      );
    }
    const rot = b ? Math.round((Math.atan2(b.toSheet.b, b.toSheet.a) * 180) / Math.PI) : NaN;

    out.push({
      name: 'robe: tile p20 turned a quarter (page 257.5×170.5 among 170.5×257.5)',
      expect: 'classified tile, registered with a 270° pose, same sheet position ±0.1 mm',
      got: `class ${c20?.cls}; pose rotation ${rot}°; position error ${err.toFixed(4)} mm`,
      pass: c20?.cls === 'tile' && err <= 0.1,
    });
  }
  // 5. Manual override: viola as an operator would type it.
  {
    const { docs } = await loadDocs(sample('viola'));
    const cls = classifyPages(docs);
    const auto = assembleSheetDetailed(docs, cls, 0).sheet;
    const man = assembleSheetDetailed(docs, cls, 0, {
      rows: 6,
      cols: 6,
      stepXMm: 195.9,
      stepYMm: 259.4,
      order: 'row-major',
      originPage: { file: '0', page: 0 },
    }).sheet;
    const am = new Map(auto.poses.map((p) => [p.page, p]));
    let dev = 0;
    for (const p of man.poses) {
      const q = am.get(p.page);
      if (q) dev = Math.max(dev, Math.hypot(p.toSheet.e - q.toSheet.e, p.toSheet.f - q.toSheet.f));
    }
    out.push({
      name: 'viola: manual GridOverride 6×6, 195.9 × 259.4, row-major',
      expect: 'every page placed (35), method manual, within 0.5 mm of the automatic poses',
      got: `${man.poses.length} poses, pairs ${[...new Set(man.pairs.map((p) => p.method))].join('/')}, max |manual − auto| ${dev.toFixed(3)} mm`,
      pass: man.poses.length === 35 && dev <= 0.5,
    });
  }
  return out;
}

async function perf() {
  const t0 = Date.now();
  const { docs, ms } = await loadDocs(sample('polupalto'));
  const mb = () => {
    (globalThis as { gc?: () => void }).gc?.();
    const m = process.memoryUsage();
    return Math.round(m.heapUsed / 1e6);
  };
  const rss: Record<string, number> = { afterExtract: mb() }; // heap used after a forced gc (--expose-gc)
  const t1 = Date.now();
  const cls = classifyPages(docs);
  const tc = Date.now() - t1;
  rss.afterClassify = mb();
  const per: { sheet: number; ms: number; paths: number }[] = [];
  for (const sid of [0, 1]) {
    const t = Date.now();
    const { sheet } = assembleSheetDetailed(docs, cls, sid);
    per.push({ sheet: sid, ms: Date.now() - t, paths: sheet.paths.length });
    rss[`afterSheet${sid}`] = mb();
  }
  return {
    file: 'polupalto.pdf',
    pages: docs[0].pages.length,
    extractMs: ms,
    classifyMs: tc,
    assemble: per,
    totalMs: Date.now() - t0,
    heapAfterGcMb: rss,
    peakRssMb: Math.round((process.resourceUsage().maxRSS * 1024) / 1e6),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────────────────────

function markdown(
  res: SampleOut[],
  ctl: Control[],
  pf: Awaited<ReturnType<typeof perf>> | null,
): string {
  const L: string[] = [];
  const ok = (b: boolean | null) => (b === null ? '—' : b ? 'PASS' : 'FAIL');
  L.push('# F2 — page segmentation + global sheet assembly: acceptance report');
  L.push('');
  L.push(
    'Run: `yarn patimport:assemble` (= `node scripts/pattern-import/assemble.mjs all`). Raw numbers: `F2-<date>.json`; sheet renders: `F2-sheets/`.',
  );
  L.push('');
  L.push('## Sheets');
  L.push('');
  L.push(
    '| sample | sheet | tiles | layout (tiles per row/col) | truth | from | pitch R / B (mm) | exact lattice (dev) | fit dev | max pair res. | pairs | unverified | missing | tile extent | overview Δ | ms |',
  );
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of res) {
    if (s.error) {
      L.push(`| ${s.id} | — | ERROR: ${s.error} |||||||||||||||`);
      continue;
    }
    for (const sh of s.sheets) {
      const lay = sh.layout
        .map((l) => `${sh.layout.length > 1 ? `${l.file}: ` : ''}${l.lines.join('/')}`)
        .join('<br>');
      const tr = sh.layout
        .map((l) => (l.expected ? `${l.expected.join('/')} ${ok(l.ok)}` : '—'))
        .join('<br>');
      const from = [
        ...new Set(sh.layout.map((l) => `${l.from} ${l.order}${l.flow === 'up' ? '↑' : ''}`)),
      ].join(', ');
      const pitch = [
        ...new Set(sh.pitch.map((p) => `${p.right[0]} / ${-p.below[1]} (${p.method})`)),
      ]
        .slice(0, 3)
        .join('<br>');
      const ex = sh.exactLattice
        ? `${sh.exactLattice.pitch.join('×')}: ${sh.exactLattice.maxDevMm} ${ok(sh.exactLattice.ok)}`
        : '—';
      const ov = sh.overview
        ? `${(sh.overview.errX * 100).toFixed(2)} % × ${(sh.overview.errY * 100).toFixed(2)} % ${ok(sh.overviewOk)}`
        : '—';
      L.push(
        `| ${s.id} | ${sh.sheet} | ${sh.pages} | ${lay} | ${tr} | ${from} | ${pitch} | ${ex} | ${sh.latticeFitMaxMm} | ${sh.maxPairResidualMm} | ${Object.entries(
          sh.pairs,
        )
          .map(([k, v]) => `${k} ${v}`)
          .join(
            ', ',
          )} | ${sh.unverifiedPages} | ${sh.missing.length ? JSON.stringify(sh.missing) : '—'} | ${sh.tileExtentMm.map((v) => v.toFixed(0)).join('×')} | ${ov} | ${sh.ms} |`,
      );
    }
  }
  L.push('');
  L.push('## Overview check (sheet extent from the overview page vs the assembled drawing, ±2 %)');
  L.push('');
  L.push(
    '| sample | overview page | grid cells (overview / layout) | factor x / y | sheet from overview (mm) | assembled drawing (mm) | Δ |',
  );
  L.push('|---|---|---|---|---|---|---|');
  for (const s of res)
    for (const sh of s.sheets) {
      const o = sh.overview;
      if (!o) continue;
      L.push(
        `| ${s.id} #${sh.sheet} | p${o.page + 1} | ${o.cells.join('×')} / ${o.layoutCells.join('×')} | ${o.factorX.toFixed(4)} / ${o.factorY.toFixed(4)} | ${o.sheetFromOverview.map((v) => v.toFixed(1)).join(' × ')} | ${o.sheetDrawing.map((v) => v.toFixed(1)).join(' × ')} | ${(o.errX * 100).toFixed(2)} % × ${(o.errY * 100).toFixed(2)} % ${ok(sh.overviewOk)} |`,
      );
    }
  L.push('');
  L.push('## Page classification per file');
  L.push('');
  L.push('| sample | expected (K0) | got | classify ms |');
  L.push('|---|---|---|---|');
  for (const s of res) L.push(`| ${s.id} | ${s.pagesNote} | ${s.classSummary} | ${s.classifyMs} |`);
  L.push('');
  L.push('## Dedupe (whole-path copies of windowed tiles, overlap-strip edges)');
  L.push('');
  L.push(
    '| sample | sheet | paths in → out | whole copies dropped | overlap edges dropped / edges | texts dropped |',
  );
  L.push('|---|---|---|---|---|---|');
  for (const s of res)
    for (const sh of s.sheets)
      L.push(
        `| ${s.id} | ${sh.sheet} | ${sh.place.pathsIn} → ${sh.place.pathsOut} | ${sh.place.wholeDuplicates} | ${sh.place.edgesDropped} / ${sh.place.edgesIn} | ${sh.place.textsDropped} |`,
      );
  L.push('');
  L.push('## Negative controls');
  L.push('');
  L.push('| control | expect | got | |');
  L.push('|---|---|---|---|');
  for (const c of ctl) L.push(`| ${c.name} | ${c.expect} | ${c.got} | ${ok(c.pass)} |`);
  if (pf) {
    L.push('');
    L.push('## Performance (polupalto, 91 pages, node, one process)');
    L.push('');
    L.push(
      `extract ${pf.extractMs} ms · classify ${pf.classifyMs} ms · assemble ${pf.assemble.map((a) => `sheet ${a.sheet} ${a.ms} ms (${a.paths} paths)`).join(', ')} · total ${pf.totalMs} ms · peak RSS ${pf.peakRssMb} MB`,
    );
  }
  L.push('');
  L.push('## Warnings per sheet');
  L.push('');
  for (const s of res)
    for (const sh of s.sheets) {
      if (!sh.warnings.length) continue;
      L.push(
        `- **${s.id} #${sh.sheet}**: ${sh.warnings
          .slice(0, 8)
          .map((w) => w.replace(/\|/g, '/'))
          .join(' · ')}${sh.warnings.length > 8 ? ` · (+${sh.warnings.length - 8})` : ''}`,
      );
    }
  return L.join('\n') + '\n';
}

export async function main(args: string[]): Promise<number> {
  const mode = args[0] ?? 'all';
  const only = new Set(args.slice(1));
  mkdirSync(SHEETS_DIR, { recursive: true });
  const res: SampleOut[] = [];
  if (mode === 'all' || mode === 'corpus') {
    for (const s of SAMPLES) {
      if (only.size && !only.has(s.id)) continue;
      process.stdout.write(`${s.id} … `);
      try {
        const r = await runSample(s);
        res.push(r);
        console.log(
          r.sheets
            .map(
              (sh) =>
                `#${sh.sheet} ${sh.pages}p ${sh.layout.map((l) => l.lines.join('/')).join(' | ')} ${sh.exactLattice ? `exact ${sh.exactLattice.maxDevMm}` : ''} ov ${sh.overview ? `${(sh.overview.errX * 100).toFixed(2)}%/${(sh.overview.errY * 100).toFixed(2)}%` : '—'} ${sh.ms}ms`,
            )
            .join('; '),
        );
      } catch (e) {
        console.log('ERROR', e);
        res.push({
          id: s.id,
          files: s.files,
          extractMs: 0,
          classifyMs: 0,
          classes: [],
          classSummary: '',
          pagesNote: s.pagesNote,
          sheets: [],
          error: String(e),
        });
      }
    }
  }
  const ctl = mode === 'all' || mode === 'controls' ? await controls() : [];
  for (const c of ctl) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}: ${c.got}`);
  // perf runs in its OWN process so its peak RSS is polupalto's alone (not the whole corpus run).
  let pf: Awaited<ReturnType<typeof perf>> | null = null;
  if (mode === 'perf') {
    pf = await perf();
    console.log(`PERFJSON ${JSON.stringify(pf)}`);
  } else if (mode === 'all') {
    const child = spawnSync(process.execPath, ['--expose-gc', process.argv[1], 'perf'], {
      encoding: 'utf8',
    });
    const line = (child.stdout ?? '').split('\n').find((l) => l.startsWith('PERFJSON '));
    pf = line ? JSON.parse(line.slice(9)) : null;
    console.log('perf', JSON.stringify(pf));
  }
  if (mode === 'all') {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    writeFileSync(
      resolve(REPORTS, `F2-${date}.json`),
      JSON.stringify({ date, samples: res, controls: ctl, perf: pf }, null, 1),
    );
    writeFileSync(resolve(REPORTS, 'F2.md'), markdown(res, ctl, pf));
    console.log(`report → ${resolve(REPORTS, 'F2.md')}`);
  }
  const failed =
    res.some(
      (r) =>
        r.error ||
        r.sheets.some(
          (s) =>
            s.layout.some((l) => l.ok === false) ||
            s.exactLattice?.ok === false ||
            s.overviewOk === false,
        ),
    ) || ctl.some((c) => !c.pass);
  return failed ? 1 : 0;
}
