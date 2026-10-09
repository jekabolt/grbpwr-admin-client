// FIXTURE for the stub worker — a plausible tiled coat pattern, so every wizard step renders.
//
// The story it tells (each beat exercises one branch of the wizard):
//   · one PDF, 15 pages: cover, instructions, overview, 12 A4 tiles (3 × 4), a 50 mm test square;
//   · five sizes 44–52 drawn as five dash motifs, one of them only RECOVERED (low confidence);
//   · two models on the sheet (MOD. 125 with a patch pocket, MOD. 126 with a hood) → variant pick;
//   · collar and facing touch → their seeds land in ONE region ("merged") → lasso split;
//   · the pocket flap has no printed label → found only by a click seed;
//   · the placket's outline has a gap → "leak", the operator drops it or reseeds;
//   · a 15 × 20 mm care-label box → "tiny", not a piece;
//   · the sleeve has no grainline → export blocked until the two-click tool draws one;
//   · the facing is narrow: a 15 mm allowance collapses its offset → gate G6 blocks at check.
//
// Units mm, y-up (the contract's IR frame). Pure data + pure functions; the stub client holds state.
import type {
  AllowanceDecision,
  BoxMm,
  Bundle,
  CardSize,
  ChainRole,
  ConversionManifest,
  DraftScope,
  DraftScopeTarget,
  FabricAssignment,
  FabricProposal,
  GateCheck,
  GateReport,
  GrainFeature,
  GridOverride,
  LineClass,
  ManifestSize,
  NameDecision,
  NotchFeature,
  PageClassification,
  PagePose,
  PairTransform,
  PieceEdit,
  PieceFamily,
  PieceSpec,
  PtMm,
  ScaleCandidate,
  ScaleDecision,
  Seed,
  SemanticsOutput,
  SizeMap,
  SizeMapEntry,
  SizeRun,
  SomMark,
  SourceFileInfo,
  StageIO,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { kindOfName } from './formats';
import { identitiesOf, identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';

// ── the sheet ───────────────────────────────────────────────────────────────────────────────
export const PAGE_W = 210;
export const PAGE_H = 297;
const STEP_X = 200;
const STEP_Y = 287;
export const ROWS = 3;
export const COLS = 4;
export const SHEET_BOX: BoxMm = {
  minX: 0,
  minY: 0,
  maxX: STEP_X * (COLS - 1) + PAGE_W,
  maxY: STEP_Y * (ROWS - 1) + PAGE_H,
};
export const SOURCE_SIZES = ['44', '46', '48', '50', '52'];
const RANK_SCALE = [0.95, 0.975, 1, 1.025, 1.05];
const TEST_SQUARE: BoxMm = { minX: 720, minY: 800, maxX: 769.94, maxY: 849.94 };

export const PURPOSE = {
  main: 'TECH_CARD_BOM_PURPOSE_MAIN',
  lining: 'TECH_CARD_BOM_PURPOSE_LINING',
  interlining: 'TECH_CARD_BOM_PURPOSE_INTERFACING',
} as const;
type FabricTag = keyof typeof PURPOSE;

// ── the pieces ──────────────────────────────────────────────────────────────────────────────
type Unit = [number, number][];
export type FixPiece = {
  key: string;
  code: string;
  mods: string[];
  name: string;
  /** Printed label → a text seed. null: only a click finds the piece. */
  text: string | null;
  /** Base-size (rank 2) box: x, y, w, h. */
  box: [number, number, number, number];
  shape: Unit;
  variant: string | null;
  pair: boolean;
  /** Drawn on the fold (the right edge of the box is the fold). */
  fold: boolean;
  grain: boolean;
  cutQty: number;
  fabrics: FabricTag[];
  nameOrigin: 'text' | 'ai' | 'ai-auto';
  ai: number;
  special?: 'leak' | 'tiny' | 'merge';
  /** Narrow enough that a 15 mm offset collapses into the hull (gate G6). */
  narrow?: boolean;
  /** Allowance printed next to this piece ("припуск 1,5"), mm — overrides the file default. */
  allowanceMm?: number;
};

const RECT: Unit = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export const PIECES: FixPiece[] = [
  {
    key: 'collar',
    code: 'CLR',
    mods: [],
    name: 'collar',
    text: 'ВОРОТНИК · 1 дет. · сгиб',
    box: [30, 40, 200, 80],
    shape: [
      [0, 0.15],
      [0.55, 0],
      [1, 0.05],
      [1, 1],
      [0.6, 0.92],
      [0, 0.7],
    ],
    variant: null,
    pair: false,
    fold: true,
    grain: true,
    cutQty: 1,
    fabrics: ['main', 'interlining'],
    nameOrigin: 'text',
    ai: 0.97,
    special: 'merge',
  },
  {
    key: 'facing',
    code: 'FAC',
    mods: [],
    name: 'facing',
    text: '7',
    box: [232, 40, 66, 230],
    shape: [
      [0, 0],
      [1, 0],
      [0.85, 0.55],
      [1, 1],
      [0.1, 1],
      [0.25, 0.5],
    ],
    variant: null,
    pair: true,
    fold: false,
    grain: true,
    cutQty: 2,
    fabrics: ['main', 'interlining'],
    nameOrigin: 'ai',
    ai: 0.64,
    special: 'merge',
    narrow: true,
    allowanceMm: 15,
  },
  {
    key: 'flap',
    code: 'PCK',
    mods: ['1'],
    name: 'pocket flap',
    text: null,
    box: [330, 40, 150, 60],
    shape: [
      [0, 0.35],
      [0.5, 0],
      [1, 0.35],
      [1, 1],
      [0, 1],
    ],
    variant: 'MOD. 125',
    pair: true,
    fold: false,
    grain: true,
    cutQty: 2,
    fabrics: ['main'],
    nameOrigin: 'ai',
    ai: 0.71,
  },
  {
    key: 'pocket',
    code: 'PCK',
    mods: [],
    name: 'patch pocket',
    text: '5',
    box: [330, 120, 150, 170],
    shape: [
      [0, 0.12],
      [0.12, 0],
      [0.88, 0],
      [1, 0.12],
      [1, 1],
      [0, 1],
    ],
    variant: 'MOD. 125',
    pair: true,
    fold: false,
    grain: true,
    cutQty: 2,
    fabrics: ['main', 'lining'],
    nameOrigin: 'ai-auto',
    ai: 0.9,
  },
  {
    key: 'label',
    code: '',
    mods: [],
    name: '',
    text: '·',
    box: [500, 50, 20, 15],
    shape: RECT,
    variant: null,
    pair: false,
    fold: false,
    grain: false,
    cutQty: 1,
    fabrics: [],
    nameOrigin: 'ai',
    ai: 0.2,
    special: 'tiny',
  },
  {
    key: 'hood',
    code: 'HD',
    mods: [],
    name: 'hood',
    text: '9 капюшон',
    box: [540, 40, 230, 280],
    shape: [
      [0, 0],
      [0.8, 0],
      [1, 0.35],
      [0.95, 0.75],
      [0.7, 1],
      [0.2, 0.95],
      [0, 0.7],
    ],
    variant: 'MOD. 126',
    pair: true,
    fold: false,
    grain: true,
    cutQty: 2,
    fabrics: ['main', 'lining'],
    nameOrigin: 'text',
    ai: 0.95,
  },
  {
    key: 'front',
    code: 'FP',
    mods: [],
    name: 'front',
    text: '1 ПОЛОЧКА · 2 дет.',
    box: [30, 320, 230, 500],
    shape: [
      [0, 0],
      [1, 0],
      [1, 0.62],
      [0.9, 0.72],
      [0.86, 0.86],
      [0.74, 0.97],
      [0.55, 1],
      [0.36, 0.93],
      [0.2, 0.98],
      [0, 0.9],
    ],
    variant: null,
    pair: true,
    fold: false,
    grain: true,
    cutQty: 2,
    fabrics: ['main'],
    nameOrigin: 'text',
    ai: 0.96,
  },
  {
    key: 'back',
    code: 'BP',
    mods: [],
    name: 'back',
    text: '2 СПИНКА · 1 дет. · сгиб',
    box: [280, 320, 210, 500],
    shape: [
      [0, 0],
      [1, 0],
      [1, 0.94],
      [0.72, 1],
      [0.42, 0.96],
      [0.3, 0.82],
      [0.1, 0.74],
      [0, 0.62],
    ],
    variant: null,
    pair: false,
    fold: true,
    grain: true,
    cutQty: 1,
    fabrics: ['main', 'lining'],
    nameOrigin: 'text',
    ai: 0.97,
  },
  {
    key: 'sleeve',
    code: 'SL',
    mods: [],
    name: 'sleeve',
    text: '3',
    box: [510, 350, 200, 480],
    shape: [
      [0.14, 0],
      [0.86, 0],
      [1, 0.76],
      [0.82, 0.92],
      [0.5, 1],
      [0.18, 0.93],
      [0, 0.76],
    ],
    variant: null,
    pair: true,
    fold: false,
    grain: false,
    cutQty: 2,
    fabrics: ['main', 'lining'],
    nameOrigin: 'ai-auto',
    ai: 0.93,
  },
  {
    key: 'placket',
    code: 'PLK',
    mods: [],
    name: 'placket',
    text: '8',
    box: [730, 360, 60, 400],
    shape: RECT,
    variant: null,
    pair: false,
    fold: false,
    grain: true,
    cutQty: 1,
    fabrics: ['main'],
    nameOrigin: 'ai',
    ai: 0.41,
    special: 'leak',
  },
];

// ── geometry helpers ────────────────────────────────────────────────────────────────────────
export function bboxOf(pts: PtMm[]): BoxMm {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function areaOf(pts: PtMm[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const inBox = (p: PtMm, b: BoxMm) =>
  p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

function boxAtRank(p: FixPiece, rank: number): BoxMm {
  const [x, y, w, h] = p.box;
  const s = RANK_SCALE[rank] ?? 1;
  // A fold piece grades away from its fold: the fold edge (right) stays put.
  const cx = p.fold ? x + w : x + w / 2;
  const cy = y + h / 2;
  const nw = w * s;
  const nh = h * s;
  const minX = p.fold ? cx - nw : cx - nw / 2;
  return { minX, minY: cy - nh / 2, maxX: minX + nw, maxY: cy + nh / 2 };
}

export function outlineOf(p: FixPiece, rank: number): PtMm[] {
  const b = boxAtRank(p, rank);
  return p.shape.map(([u, v]) => ({
    x: b.minX + u * (b.maxX - b.minX),
    y: b.minY + v * (b.maxY - b.minY),
  }));
}

/** Mirror across the vertical fold edge x = xf, returning the full (unfolded) outline. */
function unfold(pts: PtMm[], xf: number): PtMm[] {
  // Walk the outline starting right after the fold edge, so it begins and ends ON the fold; the
  // mirror is appended without its two fold points — the fold line is not a cut.
  const on = (p: PtMm) => Math.abs(p.x - xf) < 1e-6;
  const n = pts.length;
  const i = pts.findIndex((p, k) => on(p) && on(pts[(k + 1) % n]));
  if (i < 0) return pts;
  const walk = Array.from({ length: n }, (_, k) => pts[(i + 1 + k) % n]);
  const mirrored = [...walk].reverse().map((p) => ({ x: 2 * xf - p.x, y: p.y }));
  return [...walk, ...mirrored.slice(1, -1)];
}

/** Uniform growth about the bbox centre — a picture of an offset, not an offset. */
function grow(pts: PtMm[], mm: number): PtMm[] {
  const b = bboxOf(pts);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const sx = (b.maxX - b.minX + 2 * mm) / Math.max(b.maxX - b.minX, 1);
  const sy = (b.maxY - b.minY + 2 * mm) / Math.max(b.maxY - b.minY, 1);
  return pts.map((p) => ({ x: cx + (p.x - cx) * sx, y: cy + (p.y - cy) * sy }));
}

function grainOf(p: FixPiece, rank: number): GrainFeature {
  const b = boxAtRank(p, rank);
  const x = p.fold ? b.maxX - (b.maxX - b.minX) * 0.3 : (b.minX + b.maxX) / 2;
  const h = b.maxY - b.minY;
  return {
    kind: 'grain',
    origin: 'detected',
    ranges: [],
    confidence: 0.95,
    a: { x, y: b.minY + h * 0.2 },
    b: { x, y: b.minY + h * 0.8 },
    angleDeg: 90,
  };
}

function notchesOf(outline: PtMm[]): NotchFeature[] {
  return [1, Math.floor(outline.length / 2)].map((i) => {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return {
      kind: 'notch' as const,
      origin: 'detected' as const,
      ranges: [],
      confidence: 0.9,
      at,
      seg: [at, { x: at.x, y: at.y + 4 }] as [PtMm, PtMm],
      depthMm: 4,
    };
  });
}

const mergedOutline = (rank: number): PtMm[] => {
  const s = (RANK_SCALE[rank] - 1) * 40;
  return [
    { x: 30 - s, y: 40 - s },
    { x: 298 + s, y: 40 - s },
    { x: 298 + s, y: 270 + s },
    { x: 232 - s, y: 270 + s },
    { x: 232 - s, y: 120 + s },
    { x: 30 - s, y: 120 + s },
  ];
};

const toF32 = (pts: PtMm[], close: boolean) => {
  const out = new Float32Array((pts.length + (close ? 1 : 0)) * 2);
  pts.forEach((p, i) => {
    out[i * 2] = p.x;
    out[i * 2 + 1] = p.y;
  });
  if (close) {
    out[pts.length * 2] = pts[0].x;
    out[pts.length * 2 + 1] = pts[0].y;
  }
  return out;
};

// ── stage 1: extract ────────────────────────────────────────────────────────────────────────
export function fixtureFiles(input: { name: string; bytes: ArrayBuffer }[]): SourceFileInfo[] {
  return input.map((f, i) => ({
    id: String(i),
    name: f.name,
    bytes: f.bytes.byteLength || 2_418_331,
    sha256: `f13stub${i}`.padEnd(64, '0'),
    kind: kindOfName(f.name) ?? 'pdf',
    // The first file is the tiled PDF; the rest read as one page each (file-per-size).
    pages: i === 0 ? 3 + ROWS * COLS : 1,
    producer: i === 0 ? 'Adobe Illustrator 27.0 (fixture)' : undefined,
  }));
}

export function fixtureExtract(files: SourceFileInfo[]): StageIO['extract']['out'] {
  const pages: PageClassification[] = [];
  files.forEach((f, fi) => {
    if (fi === 0) {
      pages.push({
        file: f.id,
        page: 0,
        cls: 'cover',
        confidence: 0.92,
        why: 'title text, no strokes',
      });
      pages.push({
        file: f.id,
        page: 1,
        cls: 'instructions',
        confidence: 0.88,
        why: 'paragraph text, size table',
      });
      pages.push({
        file: f.id,
        page: 2,
        cls: 'overview',
        confidence: 0.81,
        why: 'all pieces at 1:4 on one page',
      });
      for (let i = 0; i < ROWS * COLS; i++)
        pages.push({
          file: f.id,
          page: 3 + i,
          cls: 'tile',
          sheet: 0,
          confidence: 0.97,
          why: `crop marks + label ${String.fromCharCode(65 + Math.floor(i / COLS))}${(i % COLS) + 1}`,
        });
    } else {
      pages.push({
        file: f.id,
        page: 0,
        cls: 'tile',
        sheet: 0,
        confidence: 0.6,
        why: 'one size per file — merged into the size run',
      });
    }
  });
  const scale: ScaleCandidate[] = [
    {
      method: 'test-square',
      factor: 50 / 49.94,
      measuredMm: 49.94,
      declaredMm: 50,
      evidence: { page: 14, bbox: TEST_SQUARE, text: '5 cm / 2"' },
      confidence: 0.95,
    },
    {
      method: 'grid',
      factor: 1.0009,
      measuredMm: 9.991,
      declaredMm: 10,
      evidence: { page: 3, bbox: { minX: 0, minY: 0, maxX: 210, maxY: 297 }, text: 'tile grid' },
      confidence: 0.6,
    },
    {
      method: 'none',
      factor: 1,
      measuredMm: null,
      declaredMm: null,
      evidence: null,
      confidence: 0,
    },
  ];
  const warnings =
    files.length > 1
      ? [`${files.length} files: read as one file per size and merged into one run`]
      : [];
  return { files, pages, scale, warnings };
}

export function fixtureScale(decision: ScaleDecision): StageIO['scale']['out'] {
  return { applied: decision };
}

// ── stage 3: assemble ───────────────────────────────────────────────────────────────────────
export function pagePoses(override?: GridOverride): PagePose[] {
  const rows = override?.rows ?? ROWS;
  const cols = override?.cols ?? COLS;
  const sx = override?.stepXMm ?? STEP_X;
  const sy = override?.stepYMm ?? STEP_Y;
  const jitter = [0.04, 0.11, 0.07, 0.18, 0.05, 0.09, 0.27, 0.12, 0.06, 0.14, 0.08, 0.1];
  const out: PagePose[] = [];
  for (let i = 0; i < rows * cols; i++) {
    const row = override?.order === 'col-major' ? i % rows : Math.floor(i / cols);
    const col = override?.order === 'col-major' ? Math.floor(i / rows) : i % cols;
    out.push({
      file: '0',
      page: 3 + i,
      toSheet: { a: 1, b: 0, c: 0, d: 1, e: col * sx, f: (rows - 1 - row) * sy },
      widthMm: PAGE_W,
      heightMm: PAGE_H,
      row,
      col,
      residualMm: override ? 0 : jitter[i % jitter.length],
    });
  }
  return out;
}

function pagePairs(poses: PagePose[], manual: boolean): PairTransform[] {
  const out: PairTransform[] = [];
  for (const a of poses)
    for (const b of poses) {
      const right = a.row === b.row && b.col === (a.col ?? 0) + 1;
      const below = a.col === b.col && b.row === (a.row ?? 0) + 1;
      if (!right && !below) continue;
      const weak = !manual && a.page === 8 && right;
      out.push({
        from: { file: a.file, page: a.page },
        to: { file: b.file, page: b.page },
        dxMm: b.toSheet.e - a.toSheet.e,
        dyMm: b.toSheet.f - a.toSheet.f,
        rotDeg: 0,
        method: manual ? 'manual' : weak ? 'edge-stitch' : 'recurrence',
        score: weak ? 9 : 40 + ((a.page * 7) % 30),
        secondBestRatio: weak ? 2.1 : 4 + ((a.page * 3) % 5),
      });
    }
  return out;
}

export function fixtureAssemble(override?: GridOverride): StageIO['assemble']['out'] {
  const poses = pagePoses(override);
  const preview: Float32Array[] = [];
  for (const p of PIECES)
    for (let r = 0; r < SOURCE_SIZES.length; r++) preview.push(toF32(outlineOf(p, r), true));
  const sq = TEST_SQUARE;
  preview.push(
    toF32(
      [
        { x: sq.minX, y: sq.minY },
        { x: sq.maxX, y: sq.minY },
        { x: sq.maxX, y: sq.maxY },
        { x: sq.minX, y: sq.maxY },
      ],
      true,
    ),
  );
  return {
    sheet: {
      id: 0,
      poses,
      pairs: pagePairs(poses, !!override),
      bbox: SHEET_BOX,
      missing: [],
      overview: {
        file: '0',
        page: 2,
        factor: 0.25,
        bbox: { minX: 0, minY: 0, maxX: 202, maxY: 217 },
      },
      warnings: override
        ? ['manual grid: registration skipped, residuals not measured']
        : ['tile B2 ↔ B3 stitched by edge only: second-best ratio 2.1 (< 3)'],
    },
    previewPaths: preview,
  };
}

// ── stage 4a: chains + legend ───────────────────────────────────────────────────────────────
type ChainBank = { pts: Float32Array; cls: number }[];

function chainBank(): ChainBank {
  const bank: ChainBank = [];
  for (const p of PIECES) {
    for (let r = 0; r < SOURCE_SIZES.length; r++)
      bank.push({ pts: toF32(outlineOf(p, r), true), cls: r });
    if (p.fold) {
      const b = boxAtRank(p, 4);
      bank.push({
        pts: toF32(
          [
            { x: b.maxX, y: b.minY },
            { x: b.maxX, y: b.maxY },
          ],
          false,
        ),
        cls: 5,
      });
    }
    if (p.grain) {
      const g = grainOf(p, 2);
      bank.push({ pts: toF32([g.a, g.b], false), cls: 6 });
    }
    for (const n of notchesOf(outlineOf(p, 2))) bank.push({ pts: toF32(n.seg, false), cls: 7 });
  }
  const sq = TEST_SQUARE;
  bank.push({
    pts: toF32(
      [
        { x: sq.minX, y: sq.minY },
        { x: sq.maxX, y: sq.minY },
        { x: sq.maxX, y: sq.maxY },
        { x: sq.minX, y: sq.maxY },
      ],
      true,
    ),
    cls: 8,
  });
  return bank;
}

const DASHES: number[][] = [[6, 2], [4, 2], [], [8, 2, 1, 2], [2, 2]];

export function fixtureChains(
  legend?: { classId: number; role: ChainRole; sizeLabel: string | null }[],
): StageIO['chains']['out'] {
  const bank = chainBank();
  const chainsOf = (cls: number) => bank.flatMap((c, i) => (c.cls === cls ? [i] : []));
  const lengthOf = (ids: number[]) =>
    ids.reduce((s, id) => {
      const a = bank[id].pts;
      let l = 0;
      for (let i = 2; i < a.length; i += 2) l += Math.hypot(a[i] - a[i - 2], a[i + 1] - a[i - 1]);
      return s + l;
    }, 0);
  const classes: LineClass[] = SOURCE_SIZES.map((label, r) => ({
    id: r,
    role: 'size' as const,
    sizeLabel: label,
    chains: chainsOf(r),
    totalLengthMm: lengthOf(chainsOf(r)),
    evidence:
      r === 3
        ? [{ kind: 'recovered-motif' as const, motif: DASHES[r] }]
        : r === 2
          ? [
              { kind: 'ocg' as const, name: `Size ${label}` },
              { kind: 'text-label' as const, text: label, distanceMm: 12 },
            ]
          : [
              { kind: 'declared-dash' as const, dash: DASHES[r] },
              { kind: 'text-label' as const, text: label, distanceMm: 8 + r * 3 },
            ],
    confidence: r === 3 ? 0.58 : 0.9 + r * 0.01,
  }));
  const extra: [ChainRole, number, LineClass['evidence'], number][] = [
    ['common', 5, [{ kind: 'text-label', text: 'сгиб', distanceMm: 14 }], 0.86],
    ['grain', 6, [{ kind: 'color', rgb: [0, 0, 0] }], 0.82],
    ['notch', 7, [{ kind: 'recovered-motif', motif: [4] }], 0.77],
    ['ignore', 8, [{ kind: 'text-label', text: '5 cm / 2"', distanceMm: 6 }], 0.94],
  ];
  for (const [role, id, evidence, confidence] of extra)
    classes.push({
      id,
      role,
      sizeLabel: null,
      chains: chainsOf(id),
      totalLengthMm: lengthOf(chainsOf(id)),
      evidence,
      confidence,
    });
  for (const e of legend ?? []) {
    const c = classes.find((x) => x.id === e.classId);
    if (c) {
      c.role = e.role;
      c.sizeLabel = e.role === 'size' ? e.sizeLabel : null;
    }
  }
  const bundles: Bundle[] = PIECES.map((p, i) => ({
    id: i,
    chains: SOURCE_SIZES.map((_, r) => i * 100 + r),
    spacingMm: 6 + (i % 3),
    endsOn: [null, null],
  }));
  return {
    classes,
    bundles,
    orphans: [],
    chainPreview: bank.map((c) => c.pts),
    warnings: ['class 3 (size 50) was recognised by a recovered dash motif only — confirm it'],
  };
}

// ── stage 4b: sizes ─────────────────────────────────────────────────────────────────────────
export function fixtureSizes(
  card: CardSize[],
  operatorMap: SizeMapEntry[] | undefined,
  classes: LineClass[],
): StageIO['sizes']['out'] {
  const sizeClasses = classes.filter((c) => c.role === 'size' && c.sizeLabel);
  const run: SizeRun = {
    encoding: 'declared-dash',
    sizes: sizeClasses.map((c, rank) => ({ label: c.sizeLabel!, rank, classId: c.id, file: null })),
    evidence: ['size table on page 2: 44 46 48 50 52'],
  };
  let entries: SizeMapEntry[];
  if (operatorMap) entries = operatorMap;
  else {
    const byToken = new Map(card.map((c) => [c.token.toLowerCase(), c]));
    entries = run.sizes.map((s) => ({
      source: s,
      card: byToken.get(s.label.toLowerCase()) ?? null,
      origin: 'auto' as const,
    }));
    // Nothing matched by spelling → align the tops of the two runs (the AI/auto guess, marked).
    if (entries.every((e) => !e.card) && card.length > 0) {
      const off = run.sizes.length - card.length;
      entries = run.sizes.map((s, i) => ({
        source: s,
        card: card[i - Math.max(off, 0)] ?? null,
        origin: 'auto' as const,
      }));
    }
  }
  const used = new Set(entries.flatMap((e) => (e.card ? [e.card.sizeId] : [])));
  const map: SizeMap = { entries, unmapped: card.filter((c) => !used.has(c.sizeId)) };
  return { run, map };
}

// ── stage 5: pieces ─────────────────────────────────────────────────────────────────────────
const pieceBox = (p: FixPiece): BoxMm => {
  const b = boxAtRank(p, 4);
  return { minX: b.minX - 2, minY: b.minY - 2, maxX: b.maxX + 2, maxY: b.maxY + 2 };
};

export const pieceAt = (at: PtMm): FixPiece | null =>
  [...PIECES]
    .sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3])
    .find((p) => inBox(at, pieceBox(p))) ?? null;

export function textSeeds(): Seed[] {
  let id = 1;
  return PIECES.flatMap((p) =>
    p.text
      ? [
          {
            id: id++,
            at: {
              x: p.box[0] + p.box[2] * 0.5,
              y: p.box[1] + p.box[3] * (p.special === 'merge' ? 0.5 : 0.55),
            },
            origin: 'text' as const,
            variant: p.variant,
          },
        ]
      : [],
  );
}

/** Apply the full edit list to the text seeds — deterministic, so the stub can recompute. */
export function fixturePieces(
  input: StageIO['pieces']['in'],
  sizeCount: number,
): StageIO['pieces']['out'] & { split: boolean } {
  let seeds = input.seeds ?? textSeeds();
  let split = false;
  for (const e of input.edits) seeds = applyEdit(seeds, e, () => (split = true));
  const variant = input.opts.variant;
  const visible = seeds.filter((s) => {
    const p = pieceAt(s.at);
    return !variant || !p?.variant || p.variant === variant;
  });
  const families: PieceFamily[] = visible.map((s) => familyOf(s, sizeCount, split));
  return { seeds: visible, families, split };
}

function applyEdit(seeds: Seed[], e: PieceEdit, onSplit: () => void): Seed[] {
  switch (e.kind) {
    case 'not-a-piece':
      return seeds.filter((s) => s.id !== e.seed);
    case 'merge':
      return seeds.filter((s) => s.id === e.seeds[0] || !e.seeds.includes(s.id));
    case 'split':
      onSplit();
      return seeds;
    case 'reseed':
      return seeds.map((s) => (s.id === e.seed ? { ...s, at: e.at } : s));
    default:
      return seeds;
  }
}

function familyOf(seed: Seed, sizeCount: number, split: boolean): PieceFamily {
  const p = pieceAt(seed.at);
  const ranks = Array.from({ length: sizeCount }, (_, r) => r);
  const candidates = ranks.map((rank) => {
    let outer: PtMm[];
    let outcome: PieceFamily['candidates'][number]['outcome'] = 'closed';
    let leakAt: PtMm | undefined;
    if (!p) {
      outcome = 'leak';
      leakAt = seed.at;
      outer = [
        { x: SHEET_BOX.minX, y: SHEET_BOX.minY },
        { x: SHEET_BOX.maxX, y: SHEET_BOX.minY },
        { x: SHEET_BOX.maxX, y: SHEET_BOX.maxY },
        { x: SHEET_BOX.minX, y: SHEET_BOX.maxY },
      ];
    } else if (p.special === 'merge' && !split) {
      outcome = 'merged';
      outer = mergedOutline(rank);
    } else {
      outer = outlineOf(p, rank);
      if (p.special === 'tiny') outcome = 'tiny';
      if (p.special === 'leak') {
        outcome = 'leak';
        leakAt = { x: p.box[0] + p.box[2], y: p.box[1] + p.box[3] * 0.6 };
      }
    }
    return {
      seed: seed.id,
      rank,
      outer,
      walls: [],
      inside: [],
      textsInside: [],
      outcome,
      areaMm2: areaOf(outer),
      bbox: bboxOf(outer),
      sourceCoverage: outcome === 'closed' ? 0.991 + ((seed.id * 7 + rank) % 9) / 1000 : 0.81,
      p95Mm: outcome === 'closed' ? 0.06 + ((seed.id + rank) % 5) * 0.03 : 1.4,
      leakAt,
    };
  });
  return { seed: seed.id, candidates, monotone: true };
}

// ── stage 6: names (AI, main-thread in the real thing) ──────────────────────────────────────
export function fixtureMarks(families: PieceFamily[]): SomMark[] {
  return families.map((f, i) => {
    const c = f.candidates[Math.min(2, f.candidates.length - 1)];
    const p = pieceAt(
      c.bbox
        ? { x: (c.bbox.minX + c.bbox.maxX) / 2, y: (c.bbox.minY + c.bbox.maxY) / 2 }
        : { x: 0, y: 0 },
    );
    return {
      mark: i + 1,
      seed: f.seed,
      bboxMm: [c.bbox.minX, c.bbox.minY, c.bbox.maxX, c.bbox.maxY],
      areaMm2: c.areaMm2,
      textInside: p?.text ? [p.text] : [],
      textNear: [],
      cutQtyHint: p?.cutQty ?? null,
      sizeCount: f.candidates.length,
      mirrorTwinMark: null,
    };
  });
}

export function fixtureNames(families: PieceFamily[], seeds: Seed[]): NameDecision[] {
  return families.map((f, i) => {
    const s = seeds.find((x) => x.id === f.seed);
    const p = s ? pieceAt(s.at) : null;
    const conf = p ? p.ai : 0.3;
    const auto = !!p && p.nameOrigin === 'ai-auto' && conf >= PATIMPORT.aiAutoAcceptInitial;
    return {
      seed: f.seed,
      suggestion: p
        ? {
            mark: i + 1,
            code: p.code,
            mods: p.mods,
            displayName: p.name,
            fabrics: p.fabrics.map((t) => PURPOSE[t]),
            cutQty: p.cutQty,
            onFold: p.fold,
            pair: p.pair,
            variant: p.variant,
            modelConfidence: conf,
            evidence: p.text ? [`text inside: “${p.text}”`] : ['shape only'],
          }
        : null,
      evidence:
        p?.text && p.nameOrigin === 'text'
          ? [{ kind: 'text-synonym', text: p.text, code: p.code, weight: 0.5 }]
          : [{ kind: 'grammar-ok', weight: 0.1 }],
      confidence: conf,
      // Text-backed names are not "AI" at all; they arrive accepted and say where they came from.
      autoAccepted: auto || p?.nameOrigin === 'text',
      code: p?.code ?? '',
      mods: p?.mods ?? [],
      displayName: p?.name ?? '',
    };
  });
}

export const nameOriginOf = (seeds: Seed[], seed: number): FixPiece['nameOrigin'] | null => {
  const s = seeds.find((x) => x.id === seed);
  const p = s ? pieceAt(s.at) : null;
  return p ? p.nameOrigin : null;
};

// ── stage 6b: semantics ─────────────────────────────────────────────────────────────────────
export const DEFAULT_ALLOWANCE: AllowanceDecision = {
  meaning: 'seam',
  allowanceMm: PATIMPORT.defaultAllowanceMm,
  origin: 'default',
  evidence: [
    'no allowance text found on the sheet',
    'outline reads as the sewing line (dashed seam style)',
  ],
};

export function fixtureSemantics(args: {
  input: StageIO['semantics']['in'];
  seeds: Seed[];
  families: PieceFamily[];
  map: SizeMap;
  sizeTokens: ReadonlySet<string>;
}): SemanticsOutput {
  const { input, seeds, families, map, sizeTokens } = args;
  const pieces: PieceSpec[] = [];
  const blocked: SemanticsOutput['blocked'] = [];
  const warnings: string[] = [];
  const exported = map.entries.filter((e) => e.card);
  for (const f of families) {
    const s = seeds.find((x) => x.id === f.seed);
    const p = s ? pieceAt(s.at) : null;
    const outcome = f.candidates[0]?.outcome;
    if (!p || outcome === 'leak') {
      blocked.push({
        seed: f.seed,
        reason: 'leak',
        detail: 'the outline has a gap — the fill escaped to the outside',
      });
      continue;
    }
    if (outcome === 'merged') {
      blocked.push({
        seed: f.seed,
        reason: 'merged',
        detail: 'two seeds share one region — split them with the lasso',
      });
      continue;
    }
    if (outcome === 'tiny') {
      blocked.push({
        seed: f.seed,
        reason: 'tiny',
        detail: `below ${PATIMPORT.minPieceAreaMm2} mm² — mark it "not a piece" or reseed`,
      });
      continue;
    }
    const ov = input.pieceOverrides[f.seed] ?? {};
    const code = ov.code ?? p.code;
    const mods = ov.mods ?? p.mods;
    const pairHand = ov.pairHand !== undefined ? ov.pairHand : p.pair ? 'L' : null;
    const unfolded = ov.unfoldedFold ?? p.fold;
    const allowance =
      ov.allowance ??
      (p.allowanceMm != null && input.fileAllowance.origin !== 'operator'
        ? {
            ...input.fileAllowance,
            allowanceMm: p.allowanceMm,
            origin: 'text' as const,
            evidence: [`“припуск ${p.allowanceMm / 10}” printed next to the piece`],
          }
        : input.fileAllowance);
    const opGrain = input.operatorGrain[f.seed];
    if (!p.grain && !opGrain) {
      blocked.push({ seed: f.seed, reason: 'no-grain', detail: 'no grainline found — draw it' });
      continue;
    }
    // Both hands of a declared pair, with their pair fields — so the grammar check gets the same
    // `_L`/`_R` exemption G11 applies (FP_L on a run with size L is fine; SL_L that is no pair is not).
    const written = identitiesOf(code, mods, pairHand);
    const isSizeToken = sizeTokenTest(sizeTokens);
    const bad = written
      .map((w) =>
        identityProblem(w.identity, { isSizeToken, pair: { hand: w.pairHand, of: w.pairOf } }),
      )
      .find((v) => v);
    if (bad) {
      blocked.push({ seed: f.seed, reason: 'grammar', detail: bad });
      continue;
    }
    const nameOrigin = ov.nameOrigin ?? p.nameOrigin;
    const aiConfidence =
      nameOrigin === 'ai' || nameOrigin === 'ai-auto' ? ov.aiConfidence ?? p.ai : undefined;
    written.forEach((w) => {
      const h = w.pairHand;
      const sizes = exported.map((e) => {
        const raw = outlineOf(p, e.source.rank);
        const drawn = unfolded && p.fold ? unfold(raw, boxAtRank(p, e.source.rank).maxX) : raw;
        const mirrored = h === 'R' ? drawn.map((q) => ({ x: -q.x, y: q.y })) : drawn;
        const cut = allowance.meaning === 'seam' ? grow(mirrored, allowance.allowanceMm) : mirrored;
        const g = opGrain
          ? {
              ...grainOf(p, e.source.rank),
              origin: 'operator' as const,
              a: opGrain.a,
              b: opGrain.b,
            }
          : grainOf(p, e.source.rank);
        return {
          rank: e.source.rank,
          sizeToken: e.card!.token,
          sizeId: e.card!.sizeId,
          cut,
          seam: allowance.meaning === 'cut' ? null : mirrored,
          grain: h === 'R' ? { ...g, a: { x: -g.a.x, y: g.a.y }, b: { x: -g.b.x, y: g.b.y } } : g,
          notches: notchesOf(cut),
          drills: [],
          internal: [],
          fold: null,
          offset: null,
          walls: [],
          bbox: bboxOf(cut),
          areaMm2: areaOf(cut),
        };
      });
      pieces.push({
        identity: w.identity,
        code,
        mods: w.mods,
        displayName: ov.displayName ?? p.name,
        nameOrigin,
        ...(aiConfidence != null ? { aiConfidence } : {}),
        seed: f.seed,
        variant: p.variant,
        pairHand: h,
        pairOf: w.pairOf,
        unfoldedFold: unfolded && p.fold,
        // Both hands of a pair count 1 each (PieceSpec); otherwise the operator/AI quantity.
        piecesPerGarment: h ? 1 : ov.piecesPerGarment ?? (p.fold && unfolded ? 1 : p.cutQty),
        allowance,
        fabrics: p.fabrics.map((t) => PURPOSE[t]),
        fused: ov.fused ?? false,
        ungraded: false,
        sizes,
      });
    });
  }
  const seen = new Map<string, number>();
  for (const sp of pieces) {
    const prev = seen.get(sp.identity);
    if (prev != null && prev !== sp.seed)
      blocked.push({
        seed: sp.seed,
        reason: 'duplicate-identity',
        detail: `${sp.identity} is used twice`,
      });
    seen.set(sp.identity, sp.seed);
  }
  const dup = new Set(blocked.filter((b) => b.reason === 'duplicate-identity').map((b) => b.seed));
  return { pieces: pieces.filter((x) => !dup.has(x.seed)), blocked, warnings };
}

/** Is this seed narrow (gate G6 collapses a wide offset)? */
export const narrowSeed = (seeds: Seed[], seed: number) => {
  const s = seeds.find((x) => x.id === seed);
  return !!(s && pieceAt(s.at)?.narrow);
};

// ── stage 7: fabrics ────────────────────────────────────────────────────────────────────────
const LABEL_OF: Record<FabricTag, string> = {
  main: 'ОСНОВНАЯ ТКАНЬ',
  lining: 'ПОДКЛАДКА',
  interlining: 'ДУБЛЕРИН',
};

export function fixtureFabrics(
  bom: DraftScopeTarget[],
  seeds: Seed[],
  specs: PieceSpec[],
): FabricAssignment {
  const exportedSeeds = [...new Set(specs.map((s) => s.seed))];
  const proposals: FabricProposal[] = (Object.keys(PURPOSE) as FabricTag[]).map((tag) => ({
    label: LABEL_OF[tag],
    purpose: PURPOSE[tag],
    seeds: exportedSeeds.filter((sd) => {
      const s = seeds.find((x) => x.id === sd);
      return !!s && !!pieceAt(s.at)?.fabrics.includes(tag);
    }),
    evidence:
      tag === 'main'
        ? [
            {
              kind: 'cut-layout',
              text: 'раскладка: ткань 150 см',
              widthCm: 150,
              pieces: ['1', '2', '3'],
            },
          ]
        : [{ kind: 'label', text: LABEL_OF[tag], seed: exportedSeeds[0] ?? 0 }],
    confidence: tag === 'main' ? 0.93 : 0.8,
  }));
  const byPurpose: Record<string, number[]> = {};
  for (const pr of proposals) {
    const target =
      bom.find((t) => t.fabricPurpose === pr.purpose) ??
      (pr.purpose === PURPOSE.main ? bom[0] : undefined);
    if (target) byPurpose[target.scopeKey] = [...pr.seeds];
  }
  return {
    byPurpose,
    interliningInBom: bom.some((t) => t.isInterlining),
    proposals,
  };
}

// ── stage 8: write + gate ───────────────────────────────────────────────────────────────────
function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'fabric'
  );
}

function dxfOf(blocks: { name: string; cut: PtMm[]; grain: GrainFeature | null }[]): string {
  const L: string[] = ['0', 'SECTION', '2', 'BLOCKS'];
  for (const b of blocks) {
    L.push(
      '0',
      'BLOCK',
      '8',
      '0',
      '2',
      b.name,
      '70',
      '0',
      '10',
      '0',
      '20',
      '0',
      '30',
      '0',
      '3',
      b.name,
    );
    L.push('0', 'POLYLINE', '8', '1', '66', '1', '70', '1');
    for (const p of b.cut)
      L.push('0', 'VERTEX', '8', '1', '10', p.x.toFixed(3), '20', p.y.toFixed(3));
    L.push('0', 'SEQEND', '8', '1');
    if (b.grain)
      L.push(
        '0',
        'LINE',
        '8',
        '7',
        '10',
        b.grain.a.x.toFixed(3),
        '20',
        b.grain.a.y.toFixed(3),
        '11',
        b.grain.b.x.toFixed(3),
        '21',
        b.grain.b.y.toFixed(3),
      );
    L.push('0', 'ENDBLK', '8', '0');
  }
  L.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  blocks.forEach((b, i) =>
    L.push('0', 'INSERT', '8', '0', '2', b.name, '10', String(i * 400), '20', '0'),
  );
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\n');
}

function gateOf(
  scope: DraftScopeTarget,
  specs: PieceSpec[],
  blocks: string[],
  seeds: Seed[],
  sizeTokens: ReadonlySet<string>,
): GateReport {
  const offsetFail = specs
    .filter(
      (s) =>
        narrowSeed(seeds, s.seed) && s.allowance.meaning !== 'cut' && s.allowance.allowanceMm > 12,
    )
    .map((s) => s.identity);
  const isSizeToken = sizeTokenTest(sizeTokens);
  const grammarFail = specs
    .filter((s) =>
      identityProblem(s.identity, { isSizeToken, pair: { hand: s.pairHand, of: s.pairOf } }),
    )
    .map((s) => s.identity);
  const coverageWarn = specs
    .filter((s) => s.code === 'FP')
    .map((s) => `${s.identity}_${s.sizes[0]?.sizeToken ?? ''}`);
  const overviewWarn = specs.filter((s) => s.code === 'BP').map((s) => s.identity);
  const c = (
    id: GateCheck['id'],
    ok: boolean,
    severity: GateCheck['severity'],
    value: GateCheck['value'],
    threshold: GateCheck['threshold'],
    named: string[],
    note: string,
  ): GateCheck => ({ id, ok, severity, value, threshold, blocks: named, note });
  const checks: GateCheck[] = [
    c(
      'G1-roundtrip',
      true,
      'block',
      `${blocks.length}/${blocks.length}`,
      'exact',
      [],
      'every block parses back with a closed cut contour',
    ),
    c(
      'G2-square',
      true,
      'block',
      0.02,
      PATIMPORT.squareTolMm,
      [],
      '100 mm probe square written and read back',
    ),
    c(
      'G3-coverage',
      coverageWarn.length === 0,
      'warn',
      coverageWarn.length ? 0.972 : 0.996,
      PATIMPORT.coverageWarn,
      coverageWarn,
      coverageWarn.length
        ? 'neckline wall followed at 97.2 % — the rest is within snap'
        : 'walls covered',
    ),
    c(
      'G4-hausdorff',
      true,
      'block',
      0.18,
      PATIMPORT.hausdorffP95VectorMm,
      [],
      'p95 cut-line distance to the source walls',
    ),
    c(
      'G5-features',
      true,
      'block',
      'notches 2/2 · grain 1',
      'exact',
      [],
      'notches and one grain segment per block',
    ),
    c(
      'G6-offset',
      offsetFail.length === 0,
      'block',
      offsetFail.length ? 'hull 0.997' : 'ok',
      `< ${0.995}`,
      offsetFail,
      offsetFail.length
        ? 'the allowance offset collapsed into the convex hull — lower the allowance or mark the line as cut'
        : 'offsets are one loop, no self-intersection',
    ),
    c(
      'G7-overview',
      overviewWarn.length === 0,
      'warn',
      overviewWarn.length ? 1.4 : 0.3,
      PATIMPORT.overviewBboxTolMm,
      overviewWarn,
      overviewWarn.length
        ? 'base size differs from the 1:4 overview by 1.4 mm'
        : 'matches the overview',
    ),
    c('G8-monotone', true, 'block', 'ok', 'strict', [], 'area grows with the size'),
    c('G9-sizes', true, 'block', 'ok', 'exact', [], 'block sizes = manifest sizes'),
    c('G10-uni', true, 'block', 0, 0, [], 'no UNI conflicts'),
    c(
      'G11-grammar',
      grammarFail.length === 0,
      'block',
      grammarFail.length,
      0,
      grammarFail,
      grammarFail.length ? 'identity fails the code grammar' : 'every identity passes the grammar',
    ),
    c(
      'G12-pair',
      true,
      'block',
      '±0.02 %',
      `±${PATIMPORT.pairAreaTol * 100} %`,
      [],
      '_R is the mirror of _L',
    ),
    c('G13-manifest', true, 'block', 'ok', '—', [], `manifest scope ${scope.label}`),
  ];
  return {
    passed: checks.every((x) => x.ok || x.severity === 'warn'),
    checks,
    durationMs: 640 + specs.length * 37,
  };
}

export function fixtureWrite(args: {
  input: StageIO['write']['in'];
  specs: PieceSpec[];
  seeds: Seed[];
  techCardId: number;
  sizeTokens: ReadonlySet<string>;
  sources: SourceFileInfo[];
  scale: ScaleDecision | null;
}): StageIO['write']['out'] {
  const { input, specs, seeds, techCardId, sizeTokens, sources, scale } = args;
  const scopes: DraftScope[] = [];
  const gate: Record<string, GateReport> = {};
  for (const target of input.scopes) {
    const seedSet = new Set(input.assignment.byPurpose[target.scopeKey] ?? []);
    const inScope = specs.filter((s) => seedSet.has(s.seed));
    if (inScope.length === 0) continue;
    const blocks = inScope.flatMap((s) =>
      s.sizes.map((z) => ({ name: `${s.identity}_${z.sizeToken}`, spec: s, size: z })),
    );
    const report = gateOf(
      target,
      inScope,
      blocks.map((b) => b.name),
      seeds,
      sizeTokens,
    );
    const manifest: ConversionManifest = {
      v: 1,
      generator: input.generator,
      createdAt: new Date().toISOString(),
      techCardId,
      scope: { fabricPurpose: target.fabricPurpose, bomLineKey: target.bomLineKey },
      units: 'mm',
      layers: { cut: '1', seam: '14', grain: '7', notch: '4', internal: '8' },
      cutLayerIsFinal: true,
      allowanceMm: inScope[0]?.allowance.allowanceMm ?? 0,
      sizes: input.sizes,
      pieces: inScope.map((s) => ({
        identity: s.identity,
        code: s.code,
        mods: s.mods,
        displayName: s.displayName,
        pairHand: s.pairHand,
        pairOf: s.pairOf,
        unfoldedFold: s.unfoldedFold,
        piecesPerGarment: s.piecesPerGarment,
        fabrics: s.fabrics,
        fused: s.fused,
        ungraded: s.ungraded,
        allowanceMm: s.allowance.allowanceMm,
        nameOrigin: s.nameOrigin,
        aiConfidence: s.aiConfidence,
      })),
      blocks: blocks.map(({ name, spec, size }) => ({
        block: name,
        identity: spec.identity,
        sizeToken: size.sizeToken,
        sizeId: size.sizeId,
        bboxMm: [size.bbox.minX, size.bbox.minY, size.bbox.maxX, size.bbox.maxY],
        areaMm2: size.areaMm2,
        hasGrain: !!size.grain,
        notches: size.notches.length,
        drills: 0,
        internal: 0,
        hasSeam: !!size.seam,
      })),
      source: {
        files: sources.map((f) => ({
          name: f.name,
          sha256: f.sha256,
          bytes: f.bytes,
          kind: f.kind,
          pages: f.pages,
        })),
        scale: {
          method: scale?.method ?? 'none',
          factor: scale?.factor ?? 1,
          measuredMm: 49.94,
          declaredMm: 50,
        },
        sheet: { pages: ROWS * COLS, method: 'recurrence', maxResidualMm: 0.27 },
        sizeEncoding: 'declared-dash',
        variant: inScope[0]?.variant ?? null,
      },
      gate: report,
    };
    const body = dxfOf(blocks.map((b) => ({ name: b.name, cut: b.size.cut, grain: b.size.grain })));
    const json = btoa(unescape(encodeURIComponent(JSON.stringify(manifest))));
    const chunks = json.match(new RegExp(`.{1,${PATIMPORT.manifestLineMax}}`, 'g')) ?? [];
    const head = chunks.flatMap((ch, i) => [
      '999',
      `GRBPWR-MANIFEST v1 ${i + 1}/${chunks.length} ${ch}`,
    ]);
    scopes.push({
      target,
      filename: `${slug(target.label)}.dxf`,
      name: target.label,
      dxfText: [...head, body].join('\n'),
      manifest,
      identities: inScope.map((s) => s.identity),
    });
    gate[target.scopeKey] = report;
  }
  return { scopes, gate };
}

export function interliningSeeds(a: FabricAssignment): Set<number> {
  return new Set(a.proposals.find((p) => p.purpose === PURPOSE.interlining)?.seeds ?? []);
}

export const manifestSizes = (map: SizeMap): ManifestSize[] =>
  map.entries.flatMap((e) =>
    e.card
      ? [
          {
            token: e.card.token,
            sizeId: e.card.sizeId,
            name: e.card.name,
            sourceLabel: e.source.label,
            rank: e.source.rank,
          },
        ]
      : [],
  );
