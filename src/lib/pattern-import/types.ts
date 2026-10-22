// PATTERN-IMPORT — the contract every module under lib/pattern-import/ is written against (T0).
//
// This file holds TYPES ONLY: the canonical intermediate representation (IR) with provenance, the
// stage API every task (F1…F13) implements, the conversion manifest the card trusts, the draft that
// is applied to the card form atomically, and the worker protocol. No implementation lives here.
// Read tmp/plans/pdf-to-dxf/08-CONTRACT.md for the prose: units, tolerances, thresholds, who owns
// what and what each module may import.
//
// Main-thread rule (same as lib/nesting/types.ts): UI code may import ONLY this file,
// `manifest/` and `worker/client`. Everything else (pdf.js, dxf-parser, clipper, geometry) must
// stay reachable only from the worker graph.
//
// Units: MILLIMETRES, y-up (DXF convention), everywhere inside the IR. The nesting engine speaks
// cm; the gate converts at its boundary and nowhere else.

import type { PieceDTO } from 'lib/nesting/types';
import type { GarmentPassport, PassportDigest } from './passport/types';
import type { SheetAnswer, SheetLegend, SheetPieces } from './pieces/sheets';
export type { SheetAnswer, SheetLegend, SheetPieces } from './pieces/sheets';

// The garment passport (auto/PASSPORT.md): its own module, re-exported here for the UI.
export type {
  CutQty,
  EvidenceClass,
  ExpectedPiece,
  Fact,
  GarmentPassport,
  OutlineMeaning,
  PassportDigest,
  SourceRef,
} from './passport/types';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 0. Scalars and identifiers
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Millimetres. A plain number, named so a signature says what it carries. */
export type Mm = number;
export type Mm2 = number;
export type Deg = number;

export type PtMm = { x: Mm; y: Mm };
export type BoxMm = { minX: Mm; minY: Mm; maxX: Mm; maxY: Mm };

/** Row-major affine, p' = [a c e; b d f] · [x y 1]. Identity = {a:1,b:0,c:0,d:1,e:0,f:0}. */
export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Opaque id of one input file in a session (stable for the session, 0-based index as string). */
export type FileId = string;
/** 0-based page index inside its file. A DXF/SVG/HPGL file is one page. */
export type PageIndex = number;
export type PathId = number;
export type TextId = number;
export type RasterId = number;
export type StyleId = number;
export type ChainId = number;
export type BundleId = number;
export type ClassId = number;
export type PieceKey = string; // identity of a piece across sizes, e.g. "FP_L"
export type SeedId = number;

export type SourceKind = 'pdf' | 'dxf' | 'raster' | 'hpgl' | 'svg' | 'ai';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. Canonical IR — what every adapter produces
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Where a path came from. EVERY path carries one; nothing downstream may drop it. */
export type PathSource = {
  file: FileId;
  page: PageIndex;
  /** Index of the drawing operation (PDF path op / DXF entity / SVG element / HPGL pen-down run). */
  op: number;
  /** Sub-path inside that operation (PDF moveTo count, SVG `M` count). 0 for single-subpath ops. */
  sub: number;
  /** DXF: entity handle when present; SVG: element id; else undefined. */
  handle?: string;
  /** DXF block the entity was defined in (null = model space / not a DXF). */
  block?: string | null;
};

/** Stroke style, interned per page. Dash arrays are in mm after scale. */
export type Style = {
  id: StyleId;
  /** Integer channels 0..255 (all adapters). Fill-only paths carry the FILL colour here with widthMm 0. */
  strokeRgb: [number, number, number] | null;
  widthMm: Mm;
  /** Declared dash pattern (PDF `d`, SVG stroke-dasharray, DXF LTYPE). null = solid or unknown. */
  dash: Mm[] | null;
  /** Optional-content group name (PDF OCG) or layer name (DXF/SVG). null when the format has none. */
  layer: string | null;
  /** The path was FILLED (not just stroked): letters-as-curves, arrows, hatches live here. */
  fill: boolean;
  /** Clip path in force when the path was drawn, by id. Kept until classification — not dropped. */
  clip: string | null;
};

/**
 * One flattened polyline. Béziers/arcs are flattened at 0.05 mm sagitta by the adapter; a "segment"
 * downstream means (path, i) = the edge pts[i]→pts[i+1]. Coordinates are in PAGE frame, mm, y-up,
 * AFTER the scale step (a 1:1 pt→mm conversion until scale is confirmed).
 */
export type IRPath = {
  id: PathId;
  pts: PtMm[];
  closed: boolean;
  style: StyleId;
  src: PathSource;
  /**
   * A8 (clean stage): the page furniture this path was masked as. Masked, never deleted: assembly
   * still sees it (tile frames and registration marks register tiles); chains, the legend, seeds,
   * walls and the Set-of-Mark render skip it. Absent = line work.
   */
  background?: BackgroundKind;
};

export type IRText = {
  id: TextId;
  text: string;
  /** Baseline-left anchor and the glyph box, page frame, mm. */
  anchor: PtMm;
  bbox: BoxMm;
  /** Nominal font size (em height) in mm. Adapters that only know cap height (HPGL SI) use capHeight / 0.7. */
  fontSizeMm: Mm;
  rotationDeg: Deg;
  layer: string | null;
  src: PathSource;
  /** A8: page furniture text (a tile label repeated on every tile, a copyright line). */
  background?: BackgroundKind;
};

/** Metadata of an embedded raster. The pixels live in the session's blob store under `id`. */
export type IRRaster = {
  id: RasterId;
  page: PageIndex;
  file: FileId;
  /** Placement on the page, mm. */
  bbox: BoxMm;
  widthPx: number;
  heightPx: number;
  /** Effective dpi after placement (widthPx / bbox width in inches). */
  dpi: number;
  /** Share of the page area it covers — a 21 % watermark vs a 100 % scan. */
  pageCover: number;
  /**
   * RASTER: the traced pixels are not the source image as stored — only the window the page shows
   * ([x0, y0, x1, y1] source px) and/or an area resampling (`scale` = traced px per source px, ≤ 1,
   * read to stay within maxRasterPixels). The placement composes both, so mm stay exact.
   */
  source?: {
    widthPx: number;
    heightPx: number;
    window: [number, number, number, number];
    scale: number;
  };
};

/** One page of one source file, in page frame. */
export type IRPage = {
  file: FileId;
  page: PageIndex;
  widthMm: Mm;
  heightMm: Mm;
  styles: Style[];
  paths: IRPath[];
  texts: IRText[];
  rasters: IRRaster[];
  /** OCG / layer names present, in file order. */
  layers: string[];
  /**
   * Raster pages only (F11): the correction already applied to every coordinate of this page
   * (test square or inherited scanner factor). Absent on vector pages.
   */
  calibration?: RasterCalibration;
};

/** A printed test square found on a traced raster page (F11 `calibrate`). */
export type RasterSquare = {
  page: PageIndex;
  /** Corners as traced (page frame, before correction), counter-clockwise from min-angle. */
  cornersMm: PtMm[];
  /** Mean of opposite sides, as traced. */
  measuredWMm: Mm;
  measuredHMm: Mm;
  /** Orientation of the "horizontal" pair vs the page x axis. */
  angleDeg: number;
  /** Deviation of the corner angle from 90°. */
  skewDeg: number;
  /** Side the square is declared to have (ref or the matched candidate). */
  sideMm: Mm;
  /** RMS of the 4 corners after the fitted affine, mm. */
  residualMm: Mm;
};

/** Per-page raster correction (F11): traced page frame → true mm. */
export type RasterCalibration = {
  method: 'test-square' | 'inherited' | 'none';
  /** Traced page frame → corrected page frame (true mm). Identity for 'none'. */
  affine: Affine;
  square: RasterSquare | null;
  /** 0..1: square with a declared/matched side 0.95, inherited 0.5, none 0. */
  confidence: number;
  notes: string[];
};

export type SourceFileInfo = {
  id: FileId;
  name: string;
  bytes: number;
  sha256: string;
  kind: SourceKind;
  pages: number;
  /** Producer string when the format carries one (PDF /Producer, DXF $ACADVER). */
  producer?: string;
  /**
   * A10, DXF only: the dialect the reader recognised (aama, clo-…, grbpwr, generic) and how many
   * blocks carry a boundary on layer 1 (AAMA / ASTM: 1 = cut line, 14 = sew line).
   */
  dxf?: { dialect: string; cutBlocks: number };
};

/** Everything an adapter returns for one file. */
export type SourceDoc = {
  file: SourceFileInfo;
  pages: IRPage[];
  warnings: string[];
  /**
   * A0.1 (AUTO): the file states its own physical size — an SVG whose root width/height are in
   * mm / cm / in and agree with its viewBox (one user unit = `userUnitMm` on both axes). The scale
   * step reports it as method 'declared' (confidence 1.0, no tick to give). Absent = the file does
   * not say (px / unitless SVG, PDF, raster, HPGL): the test square decides as before.
   */
  declaredUnits?: DeclaredUnits;
};

/** A0.1: what the file says about its own units, and where (quoted to the operator). */
export type DeclaredUnits = {
  unit: 'mm' | 'cm' | 'in';
  /** Page size the file declares, mm. */
  widthMm: Mm;
  heightMm: Mm;
  /** mm per user unit (equal on both axes within 0.1 %, or the file is not declared). */
  userUnitMm: Mm;
  /** As written, e.g. `width="1000mm" height="700mm" viewBox="0 0 1000 700"`. */
  evidence: string;
};

export type ExtractOpts = {
  /** Flattening sagitta, mm. Default 0.05. */
  sagittaMm: Mm;
  /** Keep filled paths (letters-as-curves). Default true: they are seeds and evidence. */
  keepFills: boolean;
  /** Pages to extract; undefined = all. */
  pages?: PageIndex[];
  /**
   * C4: the work budget of this read (adapters/budget.ts). The session shares one across the
   * files of a run; a caller without one gets a budget per file.
   */
  budget?: WorkBudgetLike;
};

/** Units of adapter work (points emitted, PDF operators, SVG elements); throws past the limit. */
export type WorkBudgetLike = { spend(units: number, what: string): void };

export type Progress = (done: number, total: number, note?: string) => void;

/** F1 (pdf), F8 (dxf), F11 (raster), F12 (hpgl, svg). AI-as-PDF goes through the pdf adapter. */
export type ExtractFn = (
  file: { id: FileId; name: string; bytes: ArrayBuffer },
  opts: ExtractOpts,
  progress?: Progress,
) => Promise<SourceDoc>;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. Scale (F1)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type ScaleMethod = 'test-square' | 'grid' | 'declared' | 'manual' | 'none';

export type ScaleCandidate = {
  method: ScaleMethod;
  /** Multiply page-frame mm by this to get true mm. 1 = the file is already true size. */
  factor: number;
  measuredMm: Mm | null;
  declaredMm: Mm | null;
  /** Where the evidence sits (the square / the grid period / the text), for the operator. */
  evidence: { page: PageIndex; bbox: BoxMm; text?: string } | null;
  /** 0..1. test-square with text ≥ 0.9; grid 0.6; none 0. */
  confidence: number;
};

export type ScaleDecision = { factor: number; method: ScaleMethod; operatorConfirmed: boolean };

export type DetectScaleFn = (doc: SourceDoc) => ScaleCandidate[];
/** Pure: returns a new doc with every coordinate multiplied by factor. */
export type ApplyScaleFn = (doc: SourceDoc, decision: ScaleDecision) => SourceDoc;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. Assembly — pages → one sheet in a global frame (F2)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type PageClass = 'cover' | 'instructions' | 'overview' | 'tile' | 'blank' | 'unknown';

export type PageClassification = {
  file: FileId;
  page: PageIndex;
  cls: PageClass;
  /** For 'tile': which sheet (a 91-page Burda file carries several). */
  sheet?: number;
  /**
   * A10: what the page prints that tells the sheets apart — the models it names ("Mod. 125",
   * "Style B") and a sheet letter ("Bogen A"); absent = none. Read by the autopilot's card match.
   */
  labels?: { models?: string[]; sheets?: string[] };
  /** For 'cover' / 'instructions': line length (m), text items, characters, raster share. */
  ink?: { strokeM: number; texts: number; chars: number; raster: number };
  confidence: number;
  why: string;
};

export type RegistrationMethod = 'recurrence' | 'edge-stitch' | 'grid-label' | 'manual';

/**
 * TILESTEP: where a tile sheet's pitch (the offset between neighbouring tiles) came from —
 * 'recurrence' / 'edge-votes' measured on the drawing, 'raster-frame' (traced images abut),
 * 'tiles-line' (our own export's GRBPWR-TILES line, held to the file: assemble/tiles-line.ts),
 * 'page-size' (nothing measured: assumed), 'manual' (the operator's hand grid), 'single' (one page).
 */
export type PitchSource =
  | 'recurrence'
  | 'edge-votes'
  | 'raster-frame'
  | 'tiles-line'
  | 'page-size'
  | 'manual'
  | 'single';

export type PairTransform = {
  from: { file: FileId; page: PageIndex };
  to: { file: FileId; page: PageIndex };
  /** Translation only in v1 (tiles are not rotated); rotation reserved for mixed-orientation. */
  dxMm: Mm;
  dyMm: Mm;
  rotDeg: 0 | 90 | 180 | 270;
  method: RegistrationMethod;
  /** Vote count / second-best ratio for the operator and the gate. */
  score: number;
  secondBestRatio: number;
};

export type PagePose = {
  file: FileId;
  page: PageIndex;
  /** Page frame → sheet frame. */
  toSheet: Affine;
  /** The page's own size (IRPage.widthMm/heightMm) — the wizard draws the tile outline from it. */
  widthMm: Mm;
  heightMm: Mm;
  /** Row/column in the tile grid when known. */
  row?: number;
  col?: number;
  /** Max loop-closure residual through this page, mm. */
  residualMm: Mm;
};

export type Sheet = {
  /** Sheet index inside the session (one source may carry several sheets; one card run = one sheet). */
  id: number;
  poses: PagePose[];
  pairs: PairTransform[];
  bbox: BoxMm;
  /** Pages the grid says exist but no file provides (`sheet`: the tile sheet of the cell, D6). */
  missing: MissingCell[];
  /**
   * UXHOOKS: missing cells the operator (or the autopilot on two evidences, D5) accepted as BLANK
   * pages (`StageIO['assemble']['in'].acceptMissing`): they no longer block the sheet step, and
   * no piece closes across them (pieces/holes.ts `holeGuard`). Absent = none accepted.
   */
  holes?: SheetHole[];
  /**
   * D3: why this placement must not be used as it stands (the placement contradicts the printed
   * cell labels, tile pages left off a label grid, two pages naming one cell). Non-empty blocks
   * the sheet step; there is no "accept" — the operator fixes the pages or the grid.
   */
  refused?: string[];
  /** TILESTEP: where the tile pitch came from (absent on an older sheet / the DXF fast path). */
  pitchFrom?: PitchSource;
  /** Overview page, if one was found: its own scale relative to the sheet, for the gate. */
  overview?: { file: FileId; page: PageIndex; factor: number; bbox: BoxMm };
  /** Paths of every tile already in sheet frame and deduplicated across overlaps. */
  paths: IRPath[];
  texts: IRText[];
  rasters: IRRaster[];
  styles: Style[];
  warnings: string[];
  /**
   * D6 (one PDF = one garment): the tile sheets this drawing is made of, each registered on its
   * own and laid side by side (sheet 0 at the origin). Absent = one sheet in its own frame (the
   * DXF / one-page fast path, an older sheet).
   */
  parts?: SheetPart[];
};

/**
 * A tile cell the grid says exists but no file provides. `row`/`col` are the cell in its group's
 * lattice; the rest (UXHOOKS) is the evidence the sheet step and the autopilot read:
 *   box       where the page would lie (its paper rectangle), drawing frame;
 *   open      the part of it no placed page covers (box less its neighbours' paper), null when the
 *             neighbours cover it whole;
 *   lineEnds  ends of drawn (unmasked) lines inside `box` grown by 1 mm — lines the hole cuts;
 *   outside   `open` lies outside the box of the sheet's line work;
 *   labels    the printed index labels: 'complete' = every tile page numbered 1…N without a gap
 *             (no numbered page is absent), 'gap' = the run skips a number (a page IS absent).
 */
export type MissingCell = {
  row: number;
  col: number;
  sheet?: number;
  /** The file whose tile group lacks the cell (file-per-size sets carry several per sheet). */
  file?: FileId;
  box?: BoxMm;
  open?: BoxMm | null;
  lineEnds?: number;
  outside?: boolean;
  labels?: 'complete' | 'gap';
};

/** UXHOOKS: a missing cell accepted as a blank page (`Sheet.holes`). */
export type SheetHole = MissingCell & {
  sheet: number;
  box: BoxMm;
  open: BoxMm | null;
  lineEnds: number;
  origin: 'operator' | 'autopilot';
};

/**
 * UXHOOKS: "these missing cells of tile sheet `sheet` are blank pages" (the wizard input
 * `sheetAcceptMissing`, the assemble stage's `acceptMissing`). `cells` is the WHOLE accepted set of
 * the sheet (an empty list takes the answer back). `pages` binds it to the tile pages the sheet had
 * when it was given (`holePagesKey`): a sheet whose pages changed drops the answer (asked again).
 * Accepting never overrides a refused placement (`Sheet.refused` still blocks).
 */
export type SheetAcceptMissing = {
  sheet: number;
  /** `file`: that file's cell only (file-per-size sets); `origin`: per cell, over the entry's. */
  cells: HoleCell[];
  pages?: string;
  origin?: 'operator' | 'autopilot';
};

/** UXHOOKS: one accepted cell (an answer, an event). */
export type HoleCell = {
  row: number;
  col: number;
  file?: FileId;
  origin?: 'operator' | 'autopilot';
};

/** D6: one tile sheet inside the assembled drawing. */
export type SheetPart = {
  /** Tile-sheet index (PageClassification.sheet). */
  sheet: number;
  /** Its tile pages, file order. */
  pages: { file: FileId; page: PageIndex }[];
  /** Where the sheet's own frame (tile area lower-left at 0,0) sits in the drawing, mm. */
  dx: Mm;
  dy: Mm;
  /** Its tile area in the drawing's frame. */
  box: BoxMm;
  /** Its drawing (the path box it had alone), in the drawing's frame. */
  draw?: BoxMm;
  /** The largest sheet: laid first and unshifted, the drawing's raster grids are its own. */
  anchor?: boolean;
  maxResidualMm: Mm;
  /** Missing tile cells of this sheet. */
  missing: number;
  /** TILESTEP: where this sheet's tile pitch came from. */
  pitchFrom?: PitchSource;
};

export type GridOverride = {
  rows: number;
  cols: number;
  stepXMm: Mm;
  stepYMm: Mm;
  /** Reading order of pages. */
  order: 'row-major' | 'col-major';
  originPage: { file: FileId; page: PageIndex };
};

export type ClassifyPagesFn = (docs: SourceDoc[]) => PageClassification[];
export type AssembleSheetFn = (
  docs: SourceDoc[],
  classes: PageClassification[],
  sheet: number,
  override?: GridOverride,
  progress?: Progress,
) => Sheet;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. Chains, classes, bundles (F3)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A contiguous run of one source path: edges i..j (inclusive start, exclusive end). */
export type PathRange = { path: PathId; from: number; to: number };

/** A chain is an ordered polyline stitched from path ranges (dashes, beads, zigzag joined). */
export type Chain = {
  id: ChainId;
  pts: PtMm[];
  closed: boolean;
  /** Provenance: every edge of pts maps back to a source edge through these ranges, in order. */
  ranges: PathRange[];
  /** Recovered or declared dash motif, mm (dash, gap, …) quantised to 0.25 mm. null = solid. */
  motif: Mm[] | null;
  style: StyleId;
  lengthMm: Mm;
};

export type ChainRole =
  | 'size' // belongs to exactly one size (class carries which)
  | 'common' // shared by every size (fold, centre, ungraded edge)
  | 'seam'
  | 'grain'
  | 'notch'
  | 'internal'
  | 'ignore'; // frame, grid, legend, watermark, test square

/** Evidence the classifier used to propose a class → role/size. Shown in the legend table. */
export type ClassEvidence =
  | { kind: 'ocg'; name: string }
  | { kind: 'declared-dash'; dash: Mm[] }
  | { kind: 'recovered-motif'; motif: Mm[] }
  | { kind: 'color'; rgb: [number, number, number] }
  | { kind: 'file'; file: FileId; label: string }
  | { kind: 'text-label'; text: string; distanceMm: Mm }
  | { kind: 'nesting-order'; rank: number }
  /** A seam line drawn at this constant distance inside the cut line (role 'seam'). */
  | { kind: 'seam-offset'; offsetMm: Mm }
  /** Set aside only for its light-grey colour (no grid, frame or watermark evidence): confirm. */
  | { kind: 'colour-only'; rgb: [number, number, number] }
  /**
   * A0.3: the lines close these closed outlines (chains/face-role.ts); `cues` are the independent
   * evidences, `auto` = enough of them to assign the row without asking.
   */
  | { kind: 'faces'; pieces: number; cues: string[]; auto: boolean }
  /** A0.3: lines inside the closed outlines (grain, darts, placement). */
  | { kind: 'inside-faces'; pieces: number }
  /**
   * A0.3: lines that are no outline — outside them, in a junk face, offered as background.
   * `byWhy`: each chain's own reason (per-chain provenance; the size checks read it, gradeView).
   */
  | { kind: 'face-stray'; why: string; byWhy?: { why: string; chains: ChainId[] }[] }
  /**
   * gb2: lines the face pass would call strays on a sheet NOT proven one size (another size's line,
   * an edge drawn once for every size): candidate size lines — an 'ignore' row (no wall, no
   * feature), not asked; chains/face-role gradeView hands them to the size checks. `why` = the
   * evidence that the sheet may draw several sizes.
   */
  | {
      kind: 'face-graded';
      why: string;
      /** The one size the source names (its file name) against the graded look: the row is asked. */
      sourceOne?: string;
    }
  /** P2: the AAMA/ASTM meaning of the line's layer (chains/layer-role.ts). */
  | { kind: 'layer'; layer: string; meaning: string }
  /**
   * MOOD-F1: the drawing's own key names this row (sizes/legend-id.ts). `chain` is the key's
   * sample, `at` its middle and `textAt` its label; `score` how well the row's lines match the
   * sample (length-weighted), `second` the share of them that also agree on element order / dot
   * size (R7; a declared dash = 1); `alike` the key labels drawn like it and `nestingOnly` = those
   * are told apart by nesting alone — one evidence, a question (D3).
   */
  | {
      kind: 'legend-sample';
      label: string;
      chain: ChainId;
      at: PtMm;
      textAt: PtMm;
      distanceMm: Mm;
      score: number;
      second: number;
      alike: string[];
      nestingOnly: boolean;
    };

export type LineClass = {
  id: ClassId;
  /** Proposed role; the operator confirms in the legend. */
  role: ChainRole;
  /** Size label as it appears in the source ("44", "XL", "Size 38"); only for role 'size'. */
  sizeLabel: string | null;
  chains: ChainId[];
  totalLengthMm: Mm;
  evidence: ClassEvidence[];
  confidence: number;
  /**
   * What the row IS, apart from its number (pen, width, dash, layer, how it was found): the
   * operator's legend answers are bound to it, so a rebuild that renumbers the rows (a clean edit, a
   * grid change) does not hand an answer to another row (Codex A2 review).
   */
  sig?: string;
};

/** N parallel chains, one per size, ordered from the seed side outward (rank 0 = innermost). */
export type Bundle = {
  id: BundleId;
  /** chains[rank] — exactly one chain per size rank, length = size count. */
  chains: ChainId[];
  /** Mean spacing between neighbours, mm. */
  spacingMm: Mm;
  /** The common chain this bundle lands on at each end, if any. */
  endsOn: [ChainId | null, ChainId | null];
};

/** Something the size/legend step could not decide alone — shown to the operator in the legend. */
export type ChainAmbiguity = {
  kind:
    | 'size-count' // geometry and text disagree on how many sizes
    | 'labels-missing' // ranks known, size names not found
    | 'rank-direction' // smallest/largest may be swapped
    | 'class-merge' // two sizes drawn alike (one look over several ranks)
    | 'class-split' // one size drawn in several looks
    | 'size-empty' // a rank with no line
    | 'unassigned' // size-line chains without a rank
    | 'bundle-overfull' // parallel group wider than the size count after splitting
    | 'grade-ambiguous'; // pieces/grade (H1): two rank layouts of an unencoded graded piece fit
  message: string;
  classes: ClassId[];
  chains: ChainId[];
  /** Where to look on the sheet, when it is one place. */
  at: PtMm | null;
};

/**
 * MOOD Ф2 (sizes/corners.ts): a corner closed by a size's own pieces, as a wall of its rank: `pts`
 * from one own end (or a ramp's far end) round the corner to the other; `own` = the size lines it
 * hangs on (one rank, one pen — re-checked where the walls are built); `ends` = their ends it
 * closes ("chain:end"); `chains` = the stub / ramp drawn there.
 */
export type CornerWall = {
  rule: 'stub' | 'ramp' | 'extend';
  pts: PtMm[];
  own: ChainId[];
  ends: string[];
  chains: ChainId[];
};

export type ChainSet = {
  chains: Chain[];
  /** MOOD Ф2: derived corner walls (sizes/corners.ts); absent on sets joined from several sheets. */
  cornerWalls?: CornerWall[];
  /**
   * LABELFRAME (sizes/label-frame.ts): the closed lines drawn round a size label, put in the
   * 'ignore' row. Out of every wall and feature; the H1 solver alone still reads them as drawn
   * lines (pieces/grade/hook.ts). Absent = none found.
   */
  labelFrames?: ChainId[];
  classes: LineClass[];
  bundles: Bundle[];
  /** Chains that belong to no bundle and no 'common' class — shown as a diagnostic. */
  orphans: ChainId[];
  /**
   * Open questions for the operator (legend step); empty when everything was decided. Optional so
   * ChainSets built without size recovery (a CLO DXF read by blocks) need not invent an empty list.
   */
  ambiguities?: ChainAmbiguity[];
  warnings: string[];
  /**
   * LINEFIX: lines the operator put into a row by hand (chains/assign.ts) and the rows each is in
   * now (two size rows = a line both sizes run on, flagged). The pen checks take such a line as its
   * size's own (G22, R3 continuity guard) — only that line. Absent = no line answered.
   */
  assigned?: { chain: ChainId; classes: ClassId[] }[];
};

/**
 * MOOD-F1: a legend row's real look — ≈ 40 mm of its own drawing (chains/swatch.ts) in the
 * stretch's frame: x along it 0 … lengthMm, y across it (−halfMm … +halfMm), mm, 1:1. Shapes are
 * drawn as the source draws them: a stroked run with its declared dash from `dashOffset`, or a
 * filled / closed mark (`pts` flat x,y pairs).
 */
export type LineSwatch = {
  lengthMm: Mm;
  halfMm: Mm;
  /** The chain the stretch was cut from. */
  chain: ChainId;
  shapes: {
    pts: number[];
    closed: boolean;
    fill: boolean;
    widthMm: Mm;
    dash: Mm[] | null;
    dashOffset: Mm;
  }[];
};

export type ChainOpts = {
  /** Max gap bridged when joining dashes, mm. Default 3. */
  joinGapMm: Mm;
  /** Max heading change at a join, degrees. Default 15. */
  joinAngleDeg: Deg;
  /** Max lateral offset at a join, mm. Default 0.15. */
  joinLateralMm: Mm;
  /** Expected size count when known (from sizes/ or operator); bundles are cut to it. */
  sizeCount?: number;
};

export type BuildChainsFn = (sheet: Sheet, opts: ChainOpts, progress?: Progress) => ChainSet;
/** Operator edits to the legend: class → role/size. Returns a new ChainSet with roles applied. */
export type ApplyLegendFn = (
  set: ChainSet,
  edits: {
    classId: ClassId;
    role: ChainRole;
    sizeLabel: string | null;
    sig?: string;
    /**
     * MOOD-F1: the operator split this row in two — by look (dash / motif of its lines) or by
     * local nesting (which sizes its lines run between). chains/legend.ts `splitRows`.
     */
    split?: 'look' | 'nesting';
  }[],
) => ChainSet;

/**
 * LINEFIX: the operator's "these lines are size N" (chains/assign.ts `assignChains`). `keys` are
 * line keys as the chains stage hands them out (`chainLines[id].key`), read on tile sheet `sheet`
 * (`chainLines[id].sheet`). `to`: a size by its nesting rank (the size row whose `nesting-order`
 * evidence has it), a legend row by its key (`sig`, or `#id` — as `legendConfirmed`), or a role
 * row: 'common' (every size runs on it) / 'ignore' (no size line). Applied after the legend; the
 * line LEAVES every row it was in — except that two size answers for one line keep it in both
 * (flagged 'two-sizes'). A later 'common'/'ignore' answer replaces the line's earlier ones.
 */
export type ChainAssign = {
  sheet: number;
  keys: string[];
  to: { rank: number } | { row: string } | { cls: 'common' | 'ignore' };
};

/** LINEFIX: what the chains stage did with `chainAssign` (index `entry` into it). */
export type LineAssignReport = {
  /** Keys that found their line(s): `via` 'exact' key, 'near' (one line within tolerance), 'dup'
   * (the same line drawn twice in one pen: both take the answer). */
  applied: {
    entry: number;
    key: string;
    chains: ChainId[];
    to: ClassId;
    via: 'exact' | 'near' | 'dup';
  }[];
  /**
   * Keys NOT applied — never handed to another line: 'gone' (no line of that key now), 'ambiguous'
   * (several lines within tolerance, none exact), 'bad-key' (not a line key), 'no-target' (no size
   * row of that rank / no row of that key), 'not-here' (the DXF fast path reads no lines).
   */
  stale: {
    entry: number;
    key: string;
    why: 'gone' | 'ambiguous' | 'bad-key' | 'no-target' | 'not-here';
    detail: string;
  }[];
  /**
   * D3: answers taken (the operator is the authority) but shown: 'two-sizes' = the line is now in
   * two size rows; 'pen' = drawn with another size row's pen, not the target's.
   */
  flags: { chain: ChainId; key: string; kind: 'two-sizes' | 'pen'; detail: string }[];
  /**
   * LINEASSIGN-2: answers against their pen that the graded nest explains (chains/nests.ts
   * `penVerdict` 'slip': the pen is used twice in the line's nest — at its own size's place and at
   * the place the answer names — and the answer's size pen draws none of the nest): two evidences
   * against the pen, so not a flag (D3); recorded, shown quietly. Absent on an older report.
   */
  notes?: { chain: ChainId; key: string; kind: 'pen-slip'; detail: string }[];
};

/**
 * LINEASSIGN-2: a nest outline that sits outside the size row its graded nest names (chains/nests.ts
 * `lineSuspects`): `suggest` is that row; `pen` is the line's pen against it ('agrees' = a second
 * evidence, 'against' = the pen names another size, 'slip' = the pen names another size whose own
 * outline in the nest it already draws — the drawing's slip, 'unknown' = no pen read); `nest` an
 * index shared by the outlines of one nest; `why` says it for people.
 */
export type LineSuspect = {
  chain: ChainId;
  suggest: ClassId;
  why: string;
  pen: 'agrees' | 'against' | 'slip' | 'unknown';
  nest: number;
};

/** LINEASSIGN-2: per size row, the closed piece outlines its lines draw (chains/nests.ts). */
export type SizeOutlines = { cls: ClassId; n: number; chains: ChainId[]; maxAreaMm2: number };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5. Sizes — source size run → card size run (sizes/, owner F5; detection shared with F3)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type SizeEncoding =
  | 'ocg'
  | 'declared-dash'
  | 'subpath-dash'
  | 'separate-dash'
  | 'color'
  | 'file-per-size'
  | 'text-label'
  | 'dxf-block' // sizes come from DXF block names / AAMA SIZE labels (adapters/dxf fast path)
  | 'single'; // one size in the file (BLAZER M)

export type SourceSize = {
  /** Label as the source spells it ("44", "XL", "Size 38"). */
  label: string;
  /** Rank in the source run, 0 = smallest. */
  rank: number;
  classId: ClassId | null;
  file: FileId | null;
};

export type SizeRun = {
  encoding: SizeEncoding;
  sizes: SourceSize[];
  /** Text evidence ("XS to 5XL", "р. 42–50"). */
  evidence: string[];
};

/** A size of the card, as the form knows it. */
export type CardSize = {
  sizeId: number;
  name: string;
  token: string;
  rank: number;
  /**
   * Every spelling the card itself reads off the size's dictionary name (block-code
   * `sizeTokensOf('xs_44ta_m')` → xs, 44), filled on the card side (F13c): `proposeSizeMap` in the
   * worker matches against these, so the map agrees with the card's own reader. Absent = the
   * default reader of `sizes/map.ts`.
   */
  spellings?: string[];
};

export type SizeMapEntry = {
  source: SourceSize;
  /** null = this source size is NOT exported (not in the card's run). */
  card: CardSize | null;
  origin: 'auto' | 'operator';
  /**
   * 0..1 for an 'auto' entry (F5 proposeSizeMap): 1 = same token, lower = alias / numeric
   * equivalent / tall size / run alignment. Below 0.9 the wizard asks the operator to confirm.
   */
  confidence?: number;
  /** Why this card size (or why none) — shown next to the row. */
  evidence?: string[];
  /**
   * The sheet lists this size but draws no line of its own for it (viola's 34: 7 lines for 8
   * sizes). It is NOT filled from a neighbour and never written, whatever the map says; `wouldMap`
   * is the card size it would have taken (that card size gets no pattern from this sheet).
   */
  notDrawn?: { wouldMap: CardSize | null };
  /**
   * The operator's override of `notDrawn`: "this size is drawn — use the common outline". The rank
   * is mapped and filled on its walls as they are (the common lines); a piece it does not close
   * stays open — nothing is copied from a neighbour.
   */
  drawnAnyway?: true;
};

export type SizeMap = {
  entries: SizeMapEntry[];
  /** Card sizes with no source — exported as nothing; the card will show them missing. */
  unmapped: CardSize[];
};

export type DetectSizeRunFn = (sheet: Sheet, set: ChainSet, files: SourceFileInfo[]) => SizeRun;
export type ProposeSizeMapFn = (run: SizeRun, card: CardSize[]) => SizeMap;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 6. Pieces by seed + outer fill (F4)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type Seed = {
  id: SeedId;
  at: PtMm;
  /**
   * 'face' (A2): one per closed outline the sheet draws (pieces/faces.ts) — not a decision: the
   * piece still goes through the fill, the H1 guard and the gate, and "not a piece" drops it.
   */
  origin: 'text' | 'click' | 'ai' | 'face';
  /** Text that produced the seed (piece number / name), when origin = 'text'. */
  text?: IRText;
  /** A face seed's outline: area inside its outer wall, nesting depth of the seeded face, box. */
  face?: { areaMm2: number; depth: number; box: BoxMm };
  /**
   * A2: the set-aside outline (SetAside.id) the operator made a piece with "this is a piece" — such
   * a click does not supersede the face seed of the outline it lies in (it is another piece there).
   */
  aside?: number;
  /** Variant filter the seed belongs to (Mod. 125 / Style A). null = all. */
  variant: string | null;
  /**
   * VARIANTS: `variant` came from a certain 'piece' mark (the model's label in the piece's own
   * label block), not from the operator or a label by the piece number — the session re-reads it
   * on every pieces run (a seed passed back with it is not taken as fixed).
   */
  variantFrom?: 'claim';
};

/**
 * A2 (pieces/faces): why a closed outline got no seed. Outlines big enough to be a piece are never
 * dropped silently: every one comes back as a SetAside, one click from being a piece (D3).
 */
export type FaceJunk =
  | 'small'
  | 'sheet'
  | 'tile-frame'
  | 'test-square'
  | 'legend'
  | 'table'
  | 'logo'
  | 'background'
  /** A sheet whose text labels its pieces: an outline without a label is not seeded. */
  | 'unlabelled'
  /** File-per-size side by side: seeds go on the first size's drawing (the fill moves them). */
  | 'other-size'
  /** Inside a seeded outline, of its shape: another size of the same piece (a graded nest). */
  | 'size-copy'
  /** Inside a seeded outline, of its shape, one size drawn: its seam line (or a lining copy). */
  | 'seam-line'
  /** Drawn against a seeded outline along an edge (a strip of it, or a piece drawn touching it). */
  | 'joined'
  /** Split off a seeded outline by one of its inner lines (a yoke line, a dart drawn closed). */
  | 'inner-line'
  /** Drawn inside a seeded outline in another pen or in short strokes (a label box, a mark). */
  | 'other-pen';

/**
 * A2: a closed outline the pieces stage did not seed, or a text seed it held back because it sits
 * in junk (a "10" in the test square or a table cell). The pieces step lists them as "set aside:
 * N outlines · reason"; "this is a piece" makes one a seed (`seed` restored, else a click at `at`
 * carrying `aside`).
 */
export type SetAside = {
  id: number;
  at: PtMm;
  box: BoxMm;
  areaMm2: number;
  /**
   * NAP 'code-text': a bare number held back as a fragment of a printed code (smaller than the
   * sheet's piece numbers, another run of digits beside it on one line — pieces/seeds.ts
   * codeTextSeeds); no outline of its own (area 0), `why` says what was measured.
   */
  reason: Exclude<FaceJunk, 'small'> | 'code-text';
  /** The text seed held back. */
  seed?: Seed;
  /** NAP: the measured evidence, in words (a 'code-text' hold). */
  why?: string;
  /**
   * P2: positive evidence it is no piece — a closed loop on the internal layer inside a cut piece,
   * on a file whose layers proved their AAMA/ASTM meaning (chains/layer-role layerLoopAsides).
   */
  layerLoop?: string;
  /**
   * A 'size-copy' / 'seam-line' outline (pieces/faces CopyHow): how it was told another size of a
   * piece, and that piece — the seed point of the outline it was attached to, null when that one
   * was not seeded itself. Proven junk only as a copy of a piece still seeded (auto-advance
   * weakAsides); otherwise a guess, "this is a piece" one click away.
   */
  copy?: SetAsideCopy;
  /**
   * DARTS: the outline may be a dart of the piece it lies in, not a piece — its only label is a
   * dart word and its face a narrow wedge (pieces/faces wedgeOf). A dart only once its mouth is
   * proven on that piece's outline with its point inside every size (auto-advance dartOf);
   * otherwise a question like any other aside.
   */
  dart?: SetAsideDart;
};

/**
 * KOMBI-AP (D3/D5): two or more independent facts that prove why a piece-sized set-aside is not
 * another garment piece. The pieces stage exposes these to both the policy and the UI; absence
 * means the outline is still a question. This never promotes or drops geometry by itself.
 */
export type SetAsideEvidence = {
  id: number;
  verdict: 'not-piece';
  kind: 'family-shell' | 'grade-strip' | 'variant-band' | 'document-panel';
  /** Human-readable independent facts. There are always at least two. */
  evidence: string[];
  /** The already-seeded family this evidence belongs to, when there is one. */
  seed?: SeedId;
  /** A proved parent panel / family shell, when the outline sits inside it. */
  parent?: number;
};

export type SetAsideDart = {
  /** The dart word it prints («DART»). */
  label: string;
  /** The mouth's two corners and the point, mm. */
  base: [PtMm, PtMm];
  apex: PtMm;
  lenMm: number;
  /** The widest slice across the wedge (its mouth's opening), mm. */
  openMm: number;
  /** Points along its edge, on the lines that bound it (pieces/faces rimSamples), mm. */
  rim: PtMm[];
  /** The seed point of the outline it lies in (null when that one is not seeded). */
  host: PtMm | null;
  /** The face raster's cell, mm (how near a line its corners can be read). */
  cellMm: number;
  /**
   * The host's closed sizes, and how many of them draw their own V there (semantics/features
   * dartVs) — set by the session once the fill closed them; a dart only when every size does.
   */
  legs?: { sizes: number; drawn: number };
};

/**
 * A face set aside beside / inside a piece with no point further than this from its walls (no
 * wider than 2 × this anywhere) is a sliver: the gap between two sizes' lines, a seam allowance cut
 * into strips — narrower than any piece is cut (a belt loop, a bias strip ≥ 25 mm). Wider, it is
 * set aside on how it was drawn only (SetAside.copy).
 */
export const SLIVER_MM = 6;

export type SetAsideCopy = {
  how: 'shape' | 'sliver' | 'lines' | 'fragment';
  /** Distance from `at` to the nearest wall (half its width), mm. */
  clearMm: number;
  host: PtMm | null;
  /**
   * 'lines' / 'fragment': points along its edge (≤ 160) and the face raster's cell — proven part
   * of the host only when its whole edge runs along the host's own size outlines.
   */
  rim?: PtMm[];
  cellMm?: number;
  /**
   * A label of its own stands in its own face (pieces/faces pieceLabelText: a text seed that is
   * not its host's, or a piece name / letter its host does not carry elsewhere): a piece of its
   * own, never proven a copy. The label, for the question.
   */
  ownLabel?: string;
};

export type FillOutcome =
  | 'closed'
  | 'leak' // seed region touches the outside — contour has a gap
  | 'merged' // two seeds in one region
  | 'tiny' // area below MIN_PIECE_AREA
  /**
   * pieces/grade (H1): the sheet draws several sizes alike and this size of this piece could not
   * be PROVEN — no contour is given (`outer` empty), `gradeRefusal` says why. Not a gap: closing a
   * gap does not help; the operator answers the size count, picks an orientation, or traces it.
   */
  | 'refused';

/** pieces/grade (H1): why a candidate is 'refused'. */
export type GradeRefusal =
  /** several sizes are drawn alike here and nothing proves which line is which size */
  | 'sizes-not-distinguished'
  /** more than one size layout fits the drawn lines equally well */
  | 'grade-ambiguous'
  /** the size count is unknown, or the drawing shows a different number of lines side by side */
  | 'size-count';

/**
 * How many sizes the sheet draws, and who says so. 'source' = the file encodes its sizes (legend,
 * layers, colours, a size label on a one-size file); 'operator' = answered on the sizes step. The
 * card's size run is never the count (H1c-4) — the sizes step only offers it as a quick answer.
 */
export type ExpectedSizes = {
  n: number;
  /**
   * AUTO A6: 'inferred' = two or more independent sheet evidences agree on n (size text, nest
   * depth, file count, AI — `sizes/count-evidence.ts`). The size stage treats it like 'operator'
   * (n known, ranks still proven); the sizes step shows it as AUTO, one click takes it back.
   */
  from: 'source' | 'operator' | 'inferred';
};

/**
 * The sizes step's "sizes drawn on this sheet" question (D1). Asked when the source does not state
 * the count (an unencoded sheet; a DXF whose blocks draw outline and sew line alike); required
 * while `expected` is null. `inferred` = what the lines alone show, offered first as a suggestion,
 * never applied.
 */
export type SizeCountAsk = {
  inferred: { n: number; why: string } | null;
  /**
   * A6: what the sheet's independent evidences say about the count (every one found, agreeing or
   * not), and `n` when two or more agree and none disagrees. `applied` = it is the sizes stage's
   * `expected` (from 'inferred'); false when the operator took it back (`drawnSizes: 0`) or
   * answered himself.
   */
  auto?: {
    n: number | null;
    evidence: CountEvidence[];
    applied: boolean;
    /** Why AUTO is off whatever the evidences say ("2 models on this sheet"). */
    blocked?: string;
  };
};

/** A6: one evidence of how many sizes a sheet draws (`sizes/count-evidence.ts`). */
export type CountEvidence = {
  /**
   * 'label' = one size named in text ("SIZE 38", "Gr. 40"); 'text-run' = a size run in text
   * ("36–46", a legend); 'nests' = the rings around the largest closed outlines (A2 faces);
   * 'files' = one file per size; 'ai' = the AI read the count off the sheet (A3).
   */
  kind: 'label' | 'text-run' | 'nests' | 'files' | 'ai';
  /** The counts it allows (a range "36–46" reads as 6 at step 2 or 11 at step 1; [] = none). */
  n: number[];
  /**
   * Independence group: two evidences of one group are one fact (a size printed on each file and
   * the file's own name; the sheet's text; the geometry; the AI). AUTO needs two groups.
   */
  group: 'text' | 'files' | 'geometry' | 'ai';
  /**
   * It counts toward AUTO. False = shown as a suggestion only: a lone "SIZE 38" the geometry does
   * not back (a sample-size title sits on side-by-side graded sheets too), rings not proven to be
   * sizes, one outline drawn at two scales.
   */
  counts: boolean;
  /** Human-readable: "SIZE 38", "one line around each of 2 outlines, no scaled copies". */
  detail: string;
  /** 'label': the size token it names ("38", "M"). */
  label?: string;
};

/** One closed contour for one seed at one size rank, snapped to vector chains. */
export type PieceCandidate = {
  seed: SeedId;
  /** Size rank in the SOURCE run (SizeRun.sizes[rank]); 0 for single-size files. */
  rank: number;
  outer: PtMm[];
  /** Which chains make up the outer wall, in order; used for coverage and for edits. */
  walls: ChainId[];
  /** Chains fully inside the region (grain, internal, seam) — candidates for features. */
  inside: ChainId[];
  textsInside: TextId[];
  outcome: FillOutcome;
  areaMm2: Mm2;
  bbox: BoxMm;
  /** Share of wall length (chains marked for this rank/common) that the snapped outline covers. */
  sourceCoverage: number;
  /** p95 distance from outline vertices to the nearest wall chain, mm. */
  p95Mm: Mm;
  /**
   * UXHOOKS (D3): this candidate was NOT let close across a missing page accepted as blank — one
   * of its wall lines ends inside the hole's cell (a line the hole cuts), or its outline runs into
   * the uncovered part of the cell. Set with outcome 'leak' (`leakAt` on the cut); `was` is the
   * fill's own outcome before, `areaMm2` the area it closed to.
   */
  hole?: {
    sheet: number;
    row: number;
    col: number;
    why: 'cut-line' | 'through-hole';
    was: FillOutcome;
    areaMm2: number;
  };
  /** Fill gap when outcome = 'leak': where the outside got in. */
  leakAt?: PtMm;
  /** Features already known at segmentation (DXF fast path: notches, drills, grain). */
  features?: Feature[];
  /**
   * How this rank's walls were chosen (F4): 'class' = the F3 size class of this rank + common;
   * 'innerPlug' = + the smaller ranks' lines (this rank coincides with one where it is not drawn);
   * 'bundleRank' = ranked locally by nesting inside the seed's region (F3 had no usable class);
   * 'single' = one-size source, every line a wall; 'continuity' (P1) = + continuity walls: lines
   * the source draws that join this rank's own dangling ends (see `continuity`). Absent on DXF
   * fast-path candidates.
   */
  rankFrom?: 'class' | 'innerPlug' | 'bundleRank' | 'single' | 'grade' | 'continuity' | 'repair';
  /**
   * GRADE P2: this size was REPAIRED from the family's grade (rankFrom 'repair'): the outline runs
   * on the size's own and common lines where the grade model of its two neighbouring anchors puts
   * it, short holes between its own line ends filled from the model (derived 'grade-fill' edges,
   * G15). `kind` 'leak' = the size leaked; 'neighbour' = it closed on another size's line (G26).
   */
  repair?: RepairRecord;
  /**
   * GRADE P2: a size the repair refused (a leak, or a size G26 holds on another size's line) —
   * where the grade model of the anchors `from` puts it (`pred`, sheet mm, simplified; `extrapolated`
   * when both anchors lie on one side) and why the drawing does not prove it there (E1–E4). For the
   * operator's question: where the size should run. Absent = no model.
   */
  gradeHint?: { pred: PtMm[]; from: [number, number]; refusals: string[]; extrapolated?: boolean };
  /**
   * P1 provenance: the continuity walls this closed outline runs along — drawn lines of another
   * class or size that close this rank between its own dangling ends (R0 a chain path, R1 the
   * stretch of one line both ends lie on, R2 a spine several sizes end on). Kept only when the
   * family stayed consistent (areas monotone, outline within the grade spread of its neighbouring
   * ranks, same shape); `pts` is the stretch used, `chains` the drawn chains it lies on.
   */
  continuity?: ContinuityEdge[];
  /** P1 · D3: why the continuity closure was kept — its anchor ranks and the measured checks. */
  continuityVerdict?: ContinuityVerdict;
  /**
   * pieces/grade (H1): why this candidate is 'refused' (set only with that outcome).
   */
  gradeRefusal?: GradeRefusal;
  /** pieces/grade (H1): the refusal in words for the operator ("the drawing shows 5 lines …"). */
  gradeDetail?: string;
  /**
   * Outline stretches the SOURCE does not draw (F4b), shown to the operator: 'bridge' = an
   * automatic ≤ 3 mm gap close between two of this rank's lines; 'operator-bridge' = one the
   * operator drew; 'band-cut' = this rank's end tick across a band, carried to the band's edges
   * where the source stops it short;
   * 'shared-rank' = this rank is not drawn (the run lists it, no line carries it) and reuses the
   * neighbouring rank's contour; its `pts` is empty.
   * `chains` (band-cut only): the ladder rung(s) of this rank the cut carries across the band — its
   * source provenance and the ONLY chains that may carry it in G15 (F14e/S1, Codex round 3).
   */
  derived?: { kind: DerivedEdgeKind | 'shared-rank'; pts: PtMm[]; chains?: ChainId[] }[];
  /**
   * SHAPE / NOTCH (pieces/notch-marks.ts): compact closed marks the outline ran around and now
   * crosses on the size's own line — taken out of `walls`, then classified by semantics. A mark
   * containing a source-size word is a size tag and writes no layer-4 notch. Absent = none.
   */
  notchMarks?: ChainId[];
  /**
   * SHAPE-KINK (pieces/notch-marks.ts cleanPlacementMarks): placement marks (closed boxes longer
   * than a notch mark, straddling the line) this size's outline ran around while a strict majority
   * of the family's sizes did not, now kept on the size's own drawn line under them — the mark,
   * where it sits (sheet frame), how far the outline had left the line and over what span, mm.
   * Recorded (D5): piece note, manifest `kinkStraightened`, passport. Absent = none.
   */
  placeMarks?: { id: ChainId; at: PtMm; mm: number; spanMm: number }[];
};

/**
 * P1: one continuity wall a closed outline runs along. `chains` are the drawn chains it lies on
 * (R0: the path's chains, in order), `pts` the stretch used (sheet mm); `bracket`: the path runs on
 * an ignore / unclassified line, so the closure needs native anchor ranks on both sides.
 */
export type ContinuityEdge = {
  rule: 'R0' | 'R1' | 'R2';
  chains: ChainId[];
  pts: PtMm[];
  bracket?: boolean;
  /** MOOD Ф3.2: an R1 stretch walked along an overlay of ≥ 3 other sizes' lines. */
  overlay?: boolean;
};
/** P1 · D3: the verdict that kept a continuity closure (recorded, re-checked by gate G21). */
export type ContinuityVerdict = {
  /** The natively closed ranks (own lines only) the family's rate and spread came from. */
  anchors: number[];
  /** Per neighbouring rank judged: the measured value and what was allowed. */
  checks: {
    vs: number;
    steps: number;
    hMm: number;
    hAllowMm: number;
    hu: number;
    huAllow: number;
    /** ln(area ratio) per size step, and the band the anchors allow. */
    growth: number;
    band: [number, number];
    dk: number;
    kMax: number;
  }[];
};

/** F4b outline edges the source does not draw (see `PieceCandidate.derived`); gate G15 audits them. */
/** 'grade-fill' (GRADE P2): a hole ≤ 15 mm in a repaired size's own line, filled from the grade. */
export type DerivedEdgeKind = 'bridge' | 'operator-bridge' | 'band-cut' | 'grade-fill';

/** GRADE P2: how a repaired size was proven (PieceCandidate.repair). */
export type RepairRecord = {
  kind: 'leak' | 'neighbour';
  /** The anchor ranks (closed on their own lines) the grade model came from, below and above. */
  from: [number, number];
  /** The same as card size tokens (set by the semantics stage, for the manifest). */
  fromTokens?: [string, string];
  /** Share of the predicted perimeter on the size's own / common lines. */
  cover: number;
  /** Holes filled from the grade: count and total length, mm. */
  holes: number;
  holesMm: number;
  /** The model's leave-one-out score of the repaired size (≤ 1 = within tolerance). */
  score: number;
  /** Largest excess of the repaired outline over the corridor, mm. */
  devMm: number;
  /** kind 'neighbour': the outline it had closed to (simplified 0.3 mm) — for the audit picture. */
  was?: PtMm[];
};
export type DerivedEdge = {
  kind: DerivedEdgeKind;
  pts: PtMm[];
  /**
   * The drawn chains (IR, as extracted) the edge runs along or lands on, same frame: a band cut
   * follows its size tick, which is not one of the piece's walls when the outline snapped to the
   * cut. G15 measures the edge against walls + these; G3/G4 never see them.
   */
  along?: PtMm[][];
};

/** A family = one seed × every rank. Area must grow with rank (`monotone`). */
/**
 * One printed "Cutting line <model>" label and what it does to the pieces (pieces/variants), sheet
 * mm, the frame of `families[].candidates[].outer`.
 *   kind 'cut'  — the label runs along a line drawn ACROSS a piece: the model cuts the piece there
 *                 (`cutLines` = that line, one polyline per size it is drawn in);
 *   kind 'edge' — the label runs along the piece's own outline edge: the model keeps the piece as
 *                 drawn to that edge (`cutLines` = the edge, every size's run on that carrier);
 *   kind 'piece' — a bare model label ("Style A") in a piece's own label block: the piece belongs
 *                 to that model alone (`cutLines` empty, `pieces` = [that seed]).
 * `pieces`: the seeds the line lies in / on. `outlines` (only on a run without a chosen model, the
 * fill being uncut then): each such piece in one representative size, cut as the model cuts it —
 * absent where the cut cannot be made safely (the line does not cross the outline as one straight
 * cut). `uncertain` (D3): the label's line has no second evidence — `cutLines`, `pieces` and
 * `outlines` are empty, `why` says what is missing; nothing is cut by it.
 */
/**
 * One drawn copy of a model's cutting line (or of the labelled edge), sheet mm, and the size it is
 * drawn in. `size`: the source size label (as `outlines[].size` and `SizeRun.sizes[].label` spell
 * it) of the ONE size row the line's chain is in (its OCG layer / pen / dash — the legend's rows);
 * null when the line is in no single size row (a line shared by every size, a line in two rows, a
 * sheet without a size run). `offMm`: the second evidence — how far the line's farther end lies
 * from that size's outline of the mark's piece (the nearest piece when several), 0.1 mm; ≤ 1.5 =
 * the line sits on its own size's outline. Larger = the drawing's own line misses its size's
 * outline (kombinezon Style A Piece 4: sizes 8–20 are drawn short / long in the source, 5.3 mm in
 * size 10) — `size` stays the row the drawing puts it in, never the nearest outline's size. null =
 * not checked (no size, or the piece has no closed outline in that size).
 */
export type VariantCutLine = { size: string | null; poly: PtMm[]; offMm: number | null };

export type VariantMark = {
  /** The model ("Style A"), spelled as `variants` spells it. */
  label: string;
  /** Centre of the printed label. */
  at: PtMm;
  /** The printed text ("Cutting line Style A - High Waisted"). */
  text: string;
  kind: 'cut' | 'edge' | 'piece';
  /** One polyline per size the line is drawn in, with that size (see VariantCutLine). */
  cutLines: VariantCutLine[];
  pieces: SeedId[];
  outlines?: { seed: SeedId; size: string; poly: PtMm[] }[];
  uncertain?: boolean;
  why?: string;
};

export type PieceFamily = {
  seed: SeedId;
  candidates: PieceCandidate[];
  monotone: boolean;
  /** Overview-sheet bbox for this piece if the overview was found (gate G7). */
  overviewBbox?: BoxMm;
};

export type FillOpts = {
  /** Raster resolution of the fill, mm/px. Default 0.5. */
  cellMm: Mm;
  /** Endpoint snap tolerance when landing on vector chains, mm. Default 0.3. */
  snapMm: Mm;
  /** Only this variant's seeds; null = all seeds. */
  variant: string | null;
  /**
   * pieces/grade (H1) on sheets whose sizes are drawn alike (no size class carries the piece's
   * lines while more than one size is expected): 'solve' (default) ranks them and refuses what it
   * cannot prove, 'guard' refuses every expected size of them, 'off' = the single-size fill as
   * before (probes only — it can close a contour of no size).
   */
  grade?: 'solve' | 'guard' | 'off';
  /**
   * How many sizes the sheet draws (sizes stage `expected`). Absent = unknown: a piece that looks
   * graded is refused ('size-count') rather than closed as one size.
   */
  expectedSizes?: ExpectedSizes;
  /** F4b: longest wall gap closed by a derived bridge, mm. Default 3; 0 = never. */
  autoBridgeMm?: Mm;
};

export type ProposeSeedsFn = (sheet: Sheet, set: ChainSet) => Seed[];
export type FillPiecesFn = (
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  opts: FillOpts,
  progress?: Progress,
) => PieceFamily[];

export type PieceEdit =
  | { kind: 'merge'; seeds: SeedId[] }
  | { kind: 'split'; seed: SeedId; lassoMm: PtMm[] }
  | { kind: 'not-a-piece'; seed: SeedId }
  | { kind: 'reseed'; seed: SeedId; at: PtMm }
  | { kind: 'wall-override'; seed: SeedId; rank: number; use: ChainId; instead: ChainId }
  /**
   * The operator's "close gap" (F13c): a straight wall from `from` to `to` (both snapped to the
   * nearest drawn line), for one size rank or — `rank: null` — for every size. `seed` = the region
   * it was drawn for (informational; the wall serves every seed it touches).
   */
  | { kind: 'bridge'; seed: SeedId | null; rank: number | null; from: PtMm; to: PtMm }
  /** The operator's "ignore this line": the chain is never a wall (a frame, a watermark, a label box). */
  | { kind: 'ignore-line'; chain: ChainId }
  /**
   * The operator's "use line" (F4b `setWall`): the chain becomes a wall of one size rank, or —
   * `rank: null` — of every size (a facing line inside a hood that bounds the facing piece).
   */
  | { kind: 'set-wall'; chain: ChainId; rank: number | null };

export type ApplyPieceEditsFn = (
  families: PieceFamily[],
  edits: PieceEdit[],
  ctx: {
    sheet: Sheet;
    set: ChainSet;
    run: SizeRun;
    opts: FillOpts;
    /**
     * The operator's wall edits so far (F4b `PieceSession.walls`): a reseed / wall-override refill
     * keeps the gaps the operator closed and the lines they ignored or set.
     */
    walls?: {
      exclude?: ChainId[];
      include?: { rank: number | null; ids: ChainId[] }[];
      bridges?: { rank: number; from: PtMm; to: PtMm }[];
    };
  },
) => PieceFamily[];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 7. Typed features and piece semantics (F5)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type FeatureOrigin = 'detected' | 'operator' | 'ai' | 'derived';

type FeatureBase = {
  origin: FeatureOrigin;
  /** Source edges behind the feature; empty for operator-drawn and derived. */
  ranges: PathRange[];
  confidence: number;
};

export type NotchFeature = FeatureBase & {
  kind: 'notch';
  /** Point ON the contour and the short segment as drawn. */
  at: PtMm;
  seg: [PtMm, PtMm];
  depthMm: Mm;
  /**
   * GRADE P1: not drawn in this size — placed from the sizes that draw it (pieces/gfit/notch-grade:
   * ≥ 2 drawn copies at a grade-consistent place on the piece's canonical topology, or the
   * operator's "in every size"). D5: recorded and counted (ManifestBlock.notchesGraded), never
   * presented as drawn. Absent = drawn (or derived by an unfold).
   */
  graded?: { from: string[]; answered?: boolean };
  /**
   * GRADE P1: drawn AS the outline (a notch-shaped bump / dip, the same in ≥ 2 sizes) — the line
   * crosses it by the chord, counted in ManifestBlock.notchesChorded (the outline there is not as drawn).
   */
  chord?: true;
};
export type DrillFeature = FeatureBase & {
  kind: 'drill';
  at: PtMm;
  /** GRADE P1: not drawn in this size — placed by the operator's "in every size" at its graded place */
  graded?: { from: string[]; answered?: boolean };
};
/**
 * What made a grainline (G18, A8): `class` a grain-classed line, `arrowheads` short chains at an
 * end, `word` a grain word beside it, `dxf-layer` the source DXF's own grain layer, `operator` two
 * clicks, `borrowed` taken from another size of the piece. Recorded so the gate and the manifest
 * can say which evidence a grain stands on.
 */
export type GrainEvidenceKind =
  | 'class'
  | 'arrowheads'
  | 'word'
  | 'dxf-layer'
  | 'operator'
  | 'borrowed'
  // A1: the same straight line in every size copy (a grainline is not graded)
  | 'ungraded'
  // A1: 2–6 collinear dashes of one style read as one line (a dashed grainline)
  | 'dashes'
  // MOOD Ф3.4: a bias cross — two straight lines of one look crossing near both middles at ~90°
  // ("Cut 1 on bias": either arm is the grain); the other arm is the same mark, not an internal line
  | 'cross'
  // A1: proposed from the outline alone (fold line, symmetry axis, straight edge, strip axis)
  | 'geometry'
  // A1: the operator accepted a proposal (with the proposal's own evidence beside it)
  | 'accepted';
export type GrainFeature = Omit<FeatureBase, 'origin'> & {
  kind: 'grain';
  /**
   * A1: 'detected' = a drawn line with two or more independent evidences (a grain class counts
   * as two); 'proposed' = a drawn line with exactly one — never exported until the operator accepts
   * it (the geometric proposals travel as `SemanticsOutput.grainProposals`).
   */
  origin: FeatureOrigin | 'proposed';
  a: PtMm;
  b: PtMm;
  angleDeg: Deg;
  /** G18: the evidence kinds behind it; absent on a grain made before the field existed. */
  evidence?: GrainEvidenceKind[];
};
export type FoldFeature = FeatureBase & {
  kind: 'fold';
  /** The straight contour edge that is the fold. */
  a: PtMm;
  b: PtMm;
  label?: string; // "СГИБ", "Stoffbruch", "fold"
};
export type InternalFeature = FeatureBase & {
  kind: 'internal';
  pts: PtMm[];
  closed: boolean;
  label?: string; // "dart", "pocket placement"
  /** GRADE P1: not drawn in this size — placed by the operator's "in every size" at its graded place */
  graded?: { from: string[]; answered?: boolean };
};
export type SeamLineFeature = FeatureBase & { kind: 'seam'; pts: PtMm[] };
export type CutLineFeature = FeatureBase & { kind: 'cut'; pts: PtMm[] };

export type Feature =
  | NotchFeature
  | DrillFeature
  | GrainFeature
  | FoldFeature
  | InternalFeature
  | SeamLineFeature
  | CutLineFeature;

export type LineMeaning =
  | 'cut' // the drawn outline is the cutting line; seam = inward offset when allowance known
  | 'seam' // the drawn outline is the sewing line; cut = outward offset by allowanceMm
  | 'both'; // both drawn (Redcafe); allowance measured

export type AllowanceDecision = {
  meaning: LineMeaning;
  /** mm; 0 legal when meaning = 'cut' and nothing is added. */
  allowanceMm: Mm;
  origin: 'text' | 'measured' | 'operator' | 'default';
  evidence: string[];
};

/**
 * Offset outcome the gate reads. ANY of the three failure modes BLOCKS the piece (Codex C4):
 * the result must be one loop, same hole count, no self-intersection, not a convex hull.
 */
export type OffsetReport = {
  ok: boolean;
  loops: number;
  selfIntersects: boolean;
  /** Area ratio result/convexHull(result): 1.0 means the offset collapsed into the hull. */
  hullRatio: number;
  /** Max deviation between result and the expected parallel curve, mm. */
  maxDeviationMm: Mm;
  reason?: string;
};

export type PairHand = 'L' | 'R';

/** The final, per-identity description — what the writer turns into blocks. */
export type PieceSpec = {
  identity: PieceKey;
  /** Grammar: PREFIX[_mods]. `code` is PREFIX, mods in order (R/L, F/B, number, #). */
  code: string;
  mods: string[];
  displayName: string;
  nameOrigin: 'text' | 'ai' | 'ai-auto' | 'operator';
  aiConfidence?: number;
  seed: SeedId;
  variant: string | null;
  /**
   * BACK-VARIANT: the operator's answer to the piece's `NotchVariantAsk` as applied (an option key,
   * 'all' or 'none'); the notches left out are recorded in the piece's notes (D5). Absent = none.
   */
  notchVariant?: string;
  /** Owner decision 9: pairs are TWO blocks. `pairOf` names the sibling identity. */
  pairHand: PairHand | null;
  pairOf: PieceKey | null;
  /** Owner decision 8: fold pieces are unfolded; the fold line goes to layer 8. */
  unfoldedFold: boolean;
  /**
   * L13 (owner decision 19.10 a): printed «cut on fold» but no believable unfold (the half overlaps
   * itself or leaves a slot when mirrored): the HALF is exported as drawn, its fold edge written as
   * the AAMA mirror line (layer 6, «CUT ON FOLD») with no allowance across it; the cutter folds
   * the fabric. `evidence` = why (the printed claim, the bracket, each size's unfold failure).
   * Never set with `unfoldedFold`. In the manifest as `halfFold: true` (the card cuts it on the fold).
   */
  halfFold?: { evidence: string[] };
  /** Number of this identity in one garment (both hands of a pair count 1 each). */
  piecesPerGarment: number;
  allowance: AllowanceDecision;
  /** Fabric purposes this piece is cut from (owner decision 13; a piece may be in several). */
  fabrics: FabricPurposeKey[];
  /** Owner decision 14: interlining not in BOM → `fused` on the piece. */
  fused: boolean;
  /**
   * No grading: one contour for all sizes; written as ONE block `<identity>_UNI` (09-CARD-CONTRACT
   * obligation 12, K1 case g — `<identity>_UNI_<base>` would leak the base size into the card's
   * identity). Manifest `sizeToken: 'UNI'`, `sizeId` of the base size.
   */
  ungraded: boolean;
  /** One entry per exported size rank. */
  sizes: PieceSizeSpec[];
  /**
   * GRADE P1: count differences between sizes the operator answered "intended" (GradeAsk counts):
   * the G5 count warning / SHAPE_COUNTS_HOLD hold lifts for these, the passport records the answer.
   */
  gradeIntended?: GradeCountFeature[];
  /** SHAPE-KINK: the operator's one-shape moves on this piece (D5, manifest + passport). */
  shapeFixes?: ShapeFixRecord[];
};

/** SHAPE-KINK: what an operator one-shape move does to a size. */
export type ShapeFixAction = 'straighten' | 'drop';
/** SHAPE-KINK: one operator move, as the manifest records it (`mm` = the largest straightening). */
export type ShapeFixRecord = { size: string; action: ShapeFixAction; mm?: number };
export const shapeFixKey = (seed: SeedId | number, sizeToken: string) => `${seed}:${sizeToken}`;

/**
 * SHAPE-KINK: one stretch of a size's drawn outline straightened onto its line / the family's
 * structure (D5: recorded, never presented as drawn). `at` = the stretch's middle, sheet frame;
 * `mm` = how far the outline had left the chord / line; `spanMm` = the chord's length. Rules:
 * 'mark-wall' — a placement mark the fill took as a wall, the size's own line under it
 * (pieces/notch-marks.ts); 'jitter' — ≤ 2 mm over ≤ 20 mm against a strict majority;
 * 'mark-detour' — ≤ 6 mm, the size's own drawn line on the chord, against a strict majority;
 * 'operator' — api.fixShape (semantics/kink-repair.ts).
 */
export type KinkRule = 'mark-wall' | 'jitter' | 'mark-detour' | 'operator';
export type KinkRecord = { at: PtMm; mm: number; spanMm: number; rule: KinkRule };

/**
 * SHAPE-KINK: a G5 one-shape failure, structured for the check step's one-click moves
 * (GateCheck.shapeIssues). `at` = where the offending turn is, WRITTEN (block) frame, mm;
 * `mm` = how far straightening it moves the line (0 when not fixable); `kind`: the size has a turn
 * the majority lacks ('extra-turn') or lacks one the majority has ('missing-turn'); `fixable` =
 * api.fixShape(identity, size) can straighten it (else `why`); api.dropSize is always offered.
 */
export type ShapeIssue = {
  identity: string;
  seed: SeedId | null;
  size: string;
  at: PtMm;
  mm: number;
  kind: 'extra-turn' | 'missing-turn';
  fixable: boolean;
  why: string;
};

export type PieceSizeSpec = {
  rank: number;
  sizeToken: string; // card token written into the block name
  sizeId: number;
  cut: PtMm[];
  seam: PtMm[] | null;
  grain: GrainFeature | null;
  notches: NotchFeature[];
  drills: DrillFeature[];
  internal: InternalFeature[];
  fold: FoldFeature | null;
  offset: OffsetReport | null;
  /** Wall chains the cut line came from — coverage/Hausdorff are computed against them. */
  walls: ChainId[];
  bbox: BoxMm;
  areaMm2: Mm2;
  /** P1: this size closed through continuity walls — what, and the D3 verdict (gate G21). */
  continuity?: ContinuityRecord;
  /** GRADE P2: this size was repaired from the grade (holes filled, not drawn — D5). */
  repair?: RepairRecord;
  /**
   * GRADE P1: marks drawn in this size that the operator's "in no size" removed (count question
   * answered `none`), per kind — recorded (D5), counted in the manifest. Absent = none.
   */
  removedByOperator?: Partial<Record<GradeCountFeature, number>>;
  /** SHAPE-KINK: stretches of this size's outline straightened (D5). Absent = as drawn. */
  kinks?: KinkRecord[];
};

/**
 * P1 provenance of a continuity closure, without geometry (the geometry rides in the gate's
 * `continuityByBlock`, written frame). Per edge: its rule, the drawn chains it lies on with their
 * roles as read, `ownRank` = one of them is a line of this size's own class as read (the wall model
 * gave it to another rank; recorded for the audit — it is the size's own drawn line).
 */
export type ContinuityRecord = {
  rank: number;
  edges: {
    rule: ContinuityEdge['rule'];
    chains: ChainId[];
    roles: string[];
    bracket?: boolean;
    ownRank: boolean;
  }[];
  verdict: ContinuityVerdict | null;
};

/** P1: the manifest's continuity audit of a size (ManifestBlock.continuity): the record minus rank. */
export type ManifestContinuity = Pick<ContinuityRecord, 'edges' | 'verdict'>;

/** P1: per continuity edge (same order as the record), its stretch and its chains, written frame. */
export type ContinuityGeometry = { edges: { pts: PtMm[][]; chainLines: PtMm[][] }[] };

export type SemanticsInput = {
  sheet: Sheet;
  set: ChainSet;
  run: SizeRun;
  sizeMap: SizeMap;
  families: PieceFamily[];
  /** File-level allowance decision; per-piece overrides live in `pieceOverrides`. */
  fileAllowance: AllowanceDecision;
  /**
   * The outlines are TRACED from a scan (F11 raster source; set by the worker session, never by
   * the wizard): each is made a simple polygon (spurs, crossings, staircase out) before any offset.
   */
  traced?: boolean;
  /**
   * BACK-VARIANT: the model the pieces were filled for (the session's chosen model, null = none)
   * and the models the sheet names — a notch labelled for a variant is kept by its model only
   * (semantics/notch-variants). Set by the worker session, never by the wizard.
   */
  variant?: string | null;
  models?: string[];
  /**
   * Operator answers per seed. Names travel here (not only in the wizard) so `displayName`,
   * `nameOrigin` (incl. the 'ai-auto' flag) and `aiConfidence` reach PieceSpec → ManifestPiece;
   * `fused` comes from the fabrics step (interlining not in BOM, owner decision 14).
   */
  pieceOverrides: Partial<
    Record<
      SeedId,
      Partial<
        Pick<
          PieceSpec,
          | 'allowance'
          | 'pairHand'
          | 'unfoldedFold'
          | 'code'
          | 'mods'
          | 'displayName'
          | 'nameOrigin'
          | 'aiConfidence'
          | 'piecesPerGarment'
          | 'fused'
          // MOOD Ф5: the operator's word on one outline in every size (true: one piece for all)
          | 'ungraded'
          // BACK-VARIANT: which labelled notch alternative the chosen model keeps
          | 'notchVariant'
        >
      >
    >
  >;
  /**
   * The operator's grainline per seed: two clicks, or an accepted proposal (A1) — then `accepted`
   * carries the proposal's evidence kinds, written beside 'operator' + 'accepted' (G18, manifest).
   */
  operatorGrain: Partial<Record<SeedId, { a: PtMm; b: PtMm; accepted?: GrainEvidenceKind[] }>>;
  /**
   * D3: per seed, the quantity an AI name auto-accepted at T backs with printed evidence
   * (`cut-qty`) — "cut n" read off the sheet next to the piece. It counts as the sheet's word; a
   * bare model call without that evidence does not.
   */
  aiQuantity?: Partial<Record<SeedId, { qty: number; pair: boolean }>>;
  /**
   * The fold edge the operator picked per seed (E1a): a straight edge of the outline in the rank of
   * that seed's `FoldAsk`; every size unfolds across its own matching edge. "Not a fold" is
   * `pieceOverrides[seed].unfoldedFold = false`. `half: true` (L13, answer «half» to
   * `FoldAsk.half`): no unfold — the half is exported as drawn with its fold edge (the edge matching
   * a..b in each size) as the mirror line.
   */
  operatorFold?: Partial<Record<SeedId, { a: PtMm; b: PtMm; half?: true }>>;
  /**
   * Seeds the AI, reading the drawing, says are cut on fold (F10 `suggestion.onFold`) — the sheet's
   * words may be curves. Asked, never unfolded on that alone (E1a, D3).
   */
  foldHints?: SeedId[];
  /**
   * The cutting-list entries the operator has seen named and checked against the sheet
   * (`FoldListCheck.entries`, as printed); a new unbound entry asks again. `true` = all (legacy).
   */
  foldListChecked?: boolean | string[];
  /**
   * GRADE P1: the operator's answers to `SemanticsOutput.gradeAsks`, by key (a key whose question
   * is no longer asked does nothing). Never given by the autopilot.
   */
  gradeAnswers?: Readonly<Record<string, GradeAnswer>>;
  /**
   * SHAPE-KINK: the operator's one-shape moves, keyed `${seed}:${sizeToken}` (shapeFixKey):
   * 'straighten' = api.fixShape (that size's extra turns straightened onto the family's majority
   * structure, ≤ 6 mm, recorded), 'drop' = api.dropSize (the piece is exported without that size,
   * recorded). Never given by the autopilot. Absent = none.
   */
  shapeFixes?: Readonly<Record<string, ShapeFixAction>>;
  /** The text label of each text-seeded piece ("22", "Piece 7"), for binding the cutting list. */
  seedLabels?: Partial<Record<SeedId, string>>;
  /** MOOD Ф0 (G24): the text (TextId) each text-seeded piece was seeded from — its header. */
  seedTexts?: Partial<Record<SeedId, number>>;
  /** MOOD Ф0 (G24): every seed's point (text, click, face, AI). */
  seedAts?: Partial<Record<SeedId, PtMm>>;
  /** Text of the document's other pages (instructions, cutting list); the session fills it. */
  docTexts?: string[];
  /**
   * DARTS: the darts proven of a seeded piece on the pieces step (pieces/darts provenDarts): each
   * size of that piece writes its own dart legs as internal lines labelled «dart» (layer 8).
   */
  darts?: readonly {
    seed: SeedId;
    label: string;
    apex: PtMm;
    base: [PtMm, PtMm];
    lenMm: number;
  }[];
};

/**
 * Cutting-list entries "cut on fold" that no piece on the sheet could be bound to (E1a / S5): by
 * printed number or title. A bound entry is a fold question of its piece instead; these stay a
 * file-level question until the operator has seen them named and checked them.
 */
export type FoldListCheck = {
  /** The UNBOUND list lines, as printed ("1 - Спинка со сгибом 1 дет."). */
  entries: string[];
  /** Pieces unfolded in this run (any evidence). */
  unfolded: number;
  /** The entries that were bound, and to which piece (each is that piece's fold evidence). */
  bound: { entry: string; seed: SeedId }[];
};

/**
 * An open fold question (E1a, decision D3): the sheet says "fold" for this piece but the drawing
 * does not prove which edge — or unfolding across it does not give a believable whole piece. The
 * piece is blocked ('fold-question') until the operator picks an edge or says "not a fold".
 */
export type FoldAsk = {
  seed: SeedId;
  /** Source rank the edges below lie on (the largest exported size). */
  rank: number;
  /** The fold words read in or beside the piece, as printed; empty when only the operator asked. */
  evidence: string[];
  /** Straight outline edges a half could be unfolded across, longest first. */
  edges: { a: PtMm; b: PtMm; lenMm: number }[];
  /** Index into `edges` of the edge the sheet points at or that unfolds cleanly; null = none. */
  suggested: number | null;
  /** One line for the operator. */
  why: string;
  /**
   * L13 (owner decision 19.10 a): the sheet prints «cut on fold» but unfolding fails for an
   * overlap or a slot — the answer «export the half with a fold line» is offered:
   * `operatorFold[seed] = { ...edge, half: true }`. Absent when there is no such edge.
   */
  half?: FoldHalfOffer;
};

/**
 * L13: the half-with-fold-line offer of a fold question. `auto` = the rule holds (D3, ≥ 2
 * independent evidences): a printed claim on the piece, a bracket / arrow (or the claim text)
 * aiming at exactly one straight edge in every size, and the unfold across that edge failing in
 * every size for an overlap or a slot. The autopilot then answers «half» and records a 'fold-edge'
 * assumption with `evidence`; else it stops with the plain question.
 */
export type FoldHalfOffer = {
  /** The fold edge on the question's size (rank of the FoldAsk): a straight run of the outline. */
  edge: { a: PtMm; b: PtMm; lenMm: number };
  /** Each size's unfold failure across its own matching edge, smallest size first. */
  problems: { size: string; kind: 'overlap' | 'slot'; detail: string }[];
  /** The printed claims, the pointer and the failures, as the assumption records them. */
  evidence: string[];
  auto: boolean;
  /** Why not auto (one line), when `auto` is false. */
  missing?: string;
};

/**
 * A fold that was answered but does not hold in every size ('fold-unresolved'): the operator's
 * picked edge (or the source's own fold line) has no matching straight edge in `size`, or
 * unfolding across it there fails. Carries what the details step needs to ask again — the edges
 * of the size the pick lies on — never an answer (D3: the fold is never answered for the operator).
 */
export type FoldMiss = {
  seed: SeedId;
  /** Source rank `edges` and `picked` lie on (the largest exported size, where the pick was made). */
  rank: number;
  /** That size's token. */
  refSize: string;
  /** The first size the fold does not hold in (sizes are checked in order; the check stops there). */
  size: string;
  /** no-edge: no straight edge there matches (the loose match was tried); unfold: the unfold fails. */
  kind: 'no-edge' | 'unfold';
  /** unfold: why the unfold is not a believable piece. */
  problem: string | null;
  /** The operator's pick; null = the fold line is drawn in the source (a pick does not replace it). */
  picked: { a: PtMm; b: PtMm } | null;
  /** Straight outline edges of the reference size a half could be unfolded across, longest first. */
  edges: FoldAsk['edges'];
};

/**
 * GRADE P1: one piece, one shape across sizes — the questions only the operator answers (the
 * autopilot never does, D3/D5). Non-blocking: the export goes on as drawn (the G5 count warning
 * and the passport record it); an answer is given back as `SemanticsInput.gradeAnswers[key]`.
 *   notch-lone — a notch drawn in ONE size of ≥ 3: "in every size / in none / only in this one";
 *   counts     — the sizes carry different numbers of notches / drills / internal lines (buttonholes
 *                among them): "in size S 5, in XL 7 — intended?" with every size's places to light.
 * `key` is the question's content (piece, sizes, counts / place): a changed drawing asks again.
 */
export type GradeAsk =
  | {
      kind: 'notch-lone';
      seed: SeedId;
      identity: PieceKey | null;
      key: string;
      size: string;
      at: PtMm;
      question: string;
      answer?: 'all' | 'none' | 'only';
    }
  | {
      kind: 'counts';
      seed: SeedId;
      identity: PieceKey | null;
      key: string;
      feature: GradeCountFeature;
      perSize: { size: string; n: number; at: PtMm[] }[];
      question: string;
      /** the operator's answer as applied; absent while open (and while refused) */
      answer?: 'intended' | 'all' | 'none';
      /** the operator answered `all` / `none` but it could not be applied — why (the ask stays open) */
      refused?: string;
    };
export type GradeCountFeature = 'notches' | 'drills' | 'internal';
/**
 * BACK-VARIANT: one labelled alternative of a piece's notches — `key` = the label without its notch
 * words, lower case («high back»), the answer's value; `perSize` = where it sits in each size (sheet
 * mm, on that size's line) for the preview; `model` = the model the sheet's words tie its variant
 * word to — a hint, never applied (one evidence).
 */
export type NotchVariantOption = {
  key: string;
  label: string;
  model: string | null;
  perSize: { size: string; at: PtMm[] }[];
};
/**
 * BACK-VARIANT: which of a piece's labelled notch alternatives the chosen model keeps. Blocking
 * (the piece is blocked 'notch-variant' while open): the answer is
 * `SemanticsInput.pieceOverrides[seed].notchVariant` = an option's `key`, 'all' (every notch as
 * drawn) or 'none' (none of the labelled ones). Never answered by the autopilot (D3/D5).
 */
export type NotchVariantAsk = {
  seed: SeedId;
  identity: PieceKey | null;
  /** the question's content (piece + options): a changed drawing asks again */
  key: string;
  /** plain words: «which back: high / low?» */
  question: string;
  /** the chosen model the question is about */
  model: string;
  options: NotchVariantOption[];
  /** the option the sheet's words tie to the chosen model (a hint, one evidence) */
  suggested?: string;
  evidence: string[];
};

/** GRADE P1: the operator's answer to a `GradeAsk` (by its key). */
export type GradeAnswer = 'all' | 'none' | 'only' | 'intended';

export type SemanticsOutput = {
  pieces: PieceSpec[];
  /** GRADE P1: questions of one shape across sizes (absent = none). Never blocking. */
  gradeAsks?: GradeAsk[];
  /** BACK-VARIANT: open notch-variant questions, one per piece blocked 'notch-variant' (absent = none). */
  notchVariantAsks?: NotchVariantAsk[];
  /**
   * GRADE P1: answers that could not be applied, by question key → why ("its graded place falls
   * past the corner of its edge in size 10"). The question stays open. Absent = none.
   */
  gradeRefusals?: Record<string, string>;
  /** Seeds that cannot be exported yet and why (no grain, offset failed, grammar). */
  blocked: { seed: SeedId; reason: BlockReason; detail: string; name?: BlockedName }[];
  warnings: string[];
  /** Open fold questions, one per seed blocked 'fold-question' (absent = none). */
  folds?: FoldAsk[];
  /** One per seed blocked 'fold-unresolved': which size the answered fold fails in (absent = none). */
  foldMisses?: FoldMiss[];
  /** The cutting list's fold pieces are not all unfolded and not yet checked (absent = fine). */
  foldList?: FoldListCheck;
  /**
   * D3 (10.10): what the drawing does not prove. The piece is built as shown, but the export waits
   * for the operator — a per-piece answer (an override), or "confirm as shown" (the wizard keeps
   * those confirmations, keyed by `shown`, so a value that changes asks again).
   */
  unproven: Unproven[];
  /**
   * A1: per seed blocked 'no-grain' — and (N3) per seed still blocked 'grammar' (no name yet) whose
   * drawing proves no grain — the grainline the drawing or the outline proposes (absent = none), so
   * one review covers every piece. Never applied without the operator's click ("accept N proposed
   * grainlines", D3).
   */
  grainProposals?: SeedGrainProposal[];
  /**
   * PASSPORT Ф1: what the document says (text layer, layer names), bound to these pieces — the
   * outline word of the pieces' own wall layers, the cutting list bound by printed label. Evidence
   * a policy weighs, never geometry (absent = the reader found nothing / an old worker).
   */
  passport?: GarmentPassport;
};

/**
 * CODE lane: what the namer knew about a piece blocked 'grammar' / 'duplicate-identity' — so the
 * wizard's "name N pieces" (and the autopilot) can give it a code without losing what the source
 * said: its own name (kept as the display name) and, for a DRAWN pair (FP_L beside FP_R), the hand
 * and the twin, so both hands get ONE new code and stay a pair (a twin renamed apart is two singles,
 * each re-read as a pair of its own — a doubled cut).
 */
export type BlockedName = {
  /** The source's own words for the piece: the title read, the DXF block name; null = none. */
  source: string | null;
  /** The drawn hand of a pair whose other hand is `twin` (both blocked together); else null. */
  hand: PairHand | null;
  twin: SeedId | null;
};

/**
 * One answer the sheet does not give (D3):
 *   allowance — no text, no drawn cut + seam pair, no DXF layer says what the outline is;
 *   quantity  — no "cut n" / "pair", no DXF block count, no operator answer;
 *   name      — the code comes from sheet text that is not the piece's title (a construction note).
 */
export type Unproven = {
  seed: SeedId;
  kind: 'allowance' | 'quantity' | 'name';
  /** What the piece is built with now ("seam+10", "pair×1", "PCK") — a confirmation is of this. */
  shown: string;
  /** Why it is a question, in words (the note quoted, the shape that suggests a pair). */
  detail: string;
  /**
   * quantity only (E4): the pair is suggested by an asymmetric outline, but one long straight edge
   * (≥ 30 % of the perimeter) would unfold it cleanly — "cut on fold" is the suggested alternative.
   */
  foldAlt?: boolean;
};

export type BlockReason =
  | 'no-grain'
  | 'offset-hull'
  | 'offset-self-intersection'
  | 'offset-topology'
  | 'leak'
  /** Two seeds share one fill region — split them (lasso) before export. */
  | 'merged'
  /** Region below `minPieceAreaMm2` — not a piece unless the operator says so. */
  | 'tiny'
  | 'non-monotone'
  /** pieces/grade (H1): the piece's sizes are drawn alike and could not be told apart */
  | 'sizes-not-distinguished'
  /** pieces/grade (H1): the size count is unknown or disputed by the drawing */
  | 'size-count'
  /** pieces/grade (H1): more than one size layout fits */
  | 'grade-ambiguous'
  | 'grammar'
  | 'duplicate-identity'
  | 'size-unmapped'
  /** "On fold" declared/detected but no straight fold edge to mirror across — unfold by hand. */
  | 'fold-unresolved'
  /** The sheet says "fold" but no edge is proven (E1a, D3): pick the edge or say "not a fold". */
  | 'fold-question'
  /**
   * MOOD Ф3.3 (R11): a facing fold line across the piece is read in some sizes only, or a size's
   * outline stops at it while its lines go on beyond (the facing cut off): fix the outline on the
   * pieces step, or say "not a fold" (exported as drawn).
   */
  | 'facing-fold'
  /**
   * MOOD Ф5: every size closes on one outline, but only one evidence says it is one piece for all
   * sizes (drawn once / by every pen in one place, a label naming no size): the operator says.
   */
  | 'one-size-question'
  /**
   * BACK-VARIANT (semantics/notch-variants): the piece's notch labels are alternatives of one notch
   * («High back notch» / «Low back notch») and nothing proves which one the chosen model keeps —
   * answered by `pieceOverrides[seed].notchVariant` (`SemanticsOutput.notchVariantAsks`).
   */
  | 'notch-variant';

export type DetectAllowanceFn = (sheet: Sheet, families: PieceFamily[]) => AllowanceDecision;
export type BuildPieceSpecsFn = (input: SemanticsInput, progress?: Progress) => SemanticsOutput;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 8. Fabrics and the card draft (F7)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** `common_TechCardBomPurpose` literal, e.g. 'TECH_CARD_BOM_PURPOSE_LINING'. */
export type FabricPurposeKey = string;

export type FabricEvidence =
  | { kind: 'label'; text: string; seed: SeedId }
  | { kind: 'cut-layout'; text: string; widthCm?: number; pieces: string[] }
  | { kind: 'hatch'; seed: SeedId }
  | { kind: 'ai'; confidence: number };

export type FabricProposal = {
  /** Source label ("ПОДКЛАДКА", "Futter", "main"). */
  label: string;
  purpose: FabricPurposeKey;
  /** Seeds proposed for this fabric. */
  seeds: SeedId[];
  evidence: FabricEvidence[];
  confidence: number;
  /** The card scope this fabric goes to (F7); null = the BOM has none (refused, or `fused`). */
  scopeKey?: string | null;
};

/** A card scope the draft writes a DXF into. Mirrors FabricScope from bom-purpose.ts by key only. */
export type DraftScopeTarget = {
  /** FabricScope.key — a purpose literal or a BOM lineKey. */
  scopeKey: string;
  fabricPurpose: string;
  bomLineKey: string;
  label: string;
  /** True when the scope is interlining present in BOM (owner decision 14). */
  isInterlining: boolean;
  /**
   * BOM sections of the scope's lines (F7): an UNSORTED line (no purpose, scope = its lineKey) is
   * told apart by its section — lining, interlining, fabric — when the sheet's fabrics are mapped.
   */
  sections?: string[];
};

export type FabricAssignment = {
  /** purpose → seeds; a seed may be in several purposes. */
  byPurpose: Record<FabricPurposeKey, SeedId[]>;
  /** Interlining exists in BOM → its own DXF; else these seeds get `fused`. */
  interliningInBom: boolean;
  proposals: FabricProposal[];
  /**
   * Fabrics the sheet names that have no live BOM scope (F7): no DXF is written for them and their
   * seeds are listed here with the reason, never dropped silently. Interlining without a BOM line is
   * NOT refused — its seeds get `fused` (decision 14).
   */
  refused?: { label: string; purpose: FabricPurposeKey; seeds: SeedId[]; reason: string }[];
  /**
   * C7: pieces whose fabric rests on the AI alone (the sheet says nothing about them). A cloth other
   * than the main fabric (lining, interlining → fused, rib …) waits for the operator: `needsConfirm`
   * blocks the fabrics step until they confirm it or change the piece's ticks. A piece whose name
   * the operator edits loses its AI fabric (the hint was for the AI's name).
   */
  aiOnly?: { seed: SeedId; purposes: FabricPurposeKey[]; needsConfirm: boolean }[];
  /**
   * N1: pieces nothing names a fabric for (no label, list, hatch or AI word) — main by default.
   * With more than one fabric scope on the card the fabrics step shows them before the run goes on.
   */
  defaulted?: SeedId[];
};

export type ProposeFabricsFn = (
  sheet: Sheet,
  families: PieceFamily[],
  bom: DraftScopeTarget[],
) => FabricAssignment;

/**
 * RUL: the scope as base-size AAMA DXF + grade rule table (write `storage: 'rul'`), or why it cannot
 * be — a piece whose sizes are not the same drawing point for point, or a package that does not
 * expand back to every size within 0.1 mm. Never mixed into `dxfText` (a per-size file).
 */
export type DraftRul =
  | {
      ok: true;
      dxfFilename: string;
      dxfText: string;
      rulFilename: string;
      rulText: string;
      base: string;
      sizes: string[];
      rules: number;
      /** Largest distance of an expanded point from its per-size point, mm (≤ 0.1). */
      maxErrMm: number;
    }
  | {
      ok: false;
      reasons: string[];
      /**
       * SHAPE-KINK: the reasons per piece, for the UI to route — `identity` = the piece the reason
       * names (null = the whole package); `gradeAskKey` = the open GRADE P1 counts ask of that piece
       * whose answer would make its sizes the same drawing (notches / drills / internal lines differ
       * between sizes). Never answered for the operator. Absent on a package refused before this.
       */
      refusals?: RulRefusal[];
    };

/** SHAPE-KINK: one RUL refusal, structured (DraftRul.refusals). */
export type RulRefusal = { identity: string | null; why: string; gradeAskKey?: string };

export type DraftScope = {
  target: DraftScopeTarget;
  filename: string;
  /** Operator display name for the pattern row ('' = unnamed). */
  name: string;
  dxfText: string;
  manifest: ConversionManifest;
  /** RUL: the base DXF + .rul package of this scope (write `storage: 'rul'` only). */
  rul?: DraftRul;
  /** Identities written into THIS file. */
  identities: PieceKey[];
  /**
   * F7: the very same file (same content fingerprint in its name) is already a pattern row of this
   * scope — no upload, no new row; re-applying an import changes nothing.
   */
  alreadyOnCard?: { url: string; filename: string } | null;
  /**
   * MF-C (M4): a sheet THIS importer wrote earlier (its manifest is on the card) in the same scope.
   * `replace` (the default when present) puts the new file into that row (lineKey, name, binding
   * kept; url, filename and size new) instead of adding a second sheet the card would count as a
   * revision. `matchedBy`: the same source file (sha256 / file name) or just the same scope.
   */
  replaces?: DraftReplaceTarget | null;
  /** MF-C: the operator's answer when `replaces` is set; absent = 'replace'. */
  sheetMode?: 'replace' | 'add';
  /**
   * MF-C: block links of this scope that the replaced sheet's import wrote and the new file no
   * longer draws. Never removed by apply: listed, and handed to the piece-match modal's deletion
   * flow, which checks presence on the full parse and shows what a removal takes with it.
   */
  vanished?: DraftVanished[];
  /** MF-C: the new file read back completely (gate G1); removal is only offered when true. */
  readsBack?: boolean;
};

export type DraftReplaceTarget = {
  lineKey: string;
  url: string;
  filename: string;
  name: string;
  matchedBy: 'sha256' | 'source' | 'scope';
  /** When the replaced sheet was converted (its manifest `createdAt`). */
  convertedAt: string;
};

export type DraftVanished = { blockName: string; pieceLineKey: string; pieceName: string };

export type DraftPiece = {
  /** Client-minted ULID, same contract as pieces.N.lineKey. */
  lineKey: string;
  name: string;
  piecesPerGarment: number;
  /**
   * New piece: IDENTICAL_CUT_SYMMETRY (06-SYNTHESIS). Reused piece: what it will carry after apply —
   * IDENTICAL only when the manifest proves it (`symmetryForce`) or the piece was unmarked / an
   * impossible pair; an explicit MIRRORED/FOLD is kept otherwise (F14 MAJOR 2).
   */
  cutSymmetry: string;
  /**
   * F14: the manifest's proof that every contour is drawn — both hands of a pair / unfolded fold;
   * L13 'half': the manifest's proof that only the half is drawn — cut on the fold (FOLD).
   */
  symmetryForce?: 'pair' | 'unfolded' | 'half';
  grainline: string;
  fused: boolean;
  /** Reuse of an existing card piece instead of creating one. */
  existingLineKey: string | null;
  /** F7: one contour for every size (`PieceSpec.ungraded`). */
  ungraded?: boolean;
  /** F7: `TECH_CARD_PIECE_FUSING_MODE_*` — FULL when the whole piece is cut from interlining. */
  fusingMode?: string;
  /** F7: why this existing piece was chosen ('alias' = already bound to this block; 'name'). */
  basis?: 'alias' | 'name' | 'new';
  /** F7: the scope keys this piece is cut in (one alias set per scope). */
  scopeKeys?: string[];
};

export type DraftAlias = {
  scopeKey: string;
  fabricPurpose: string;
  bomLineKey: string;
  /** Identity (block name without the size tail), spelled as the file writes it. */
  blockName: string;
  pieceLineKey: string;
};

export type DraftPieceUpdate = {
  lineKey: string;
  /** Set only when the symmetry is rewritten (`importedCutSymmetry`). */
  cutSymmetry?: string;
  /** Shown to the operator: why an explicit MIRRORED/FOLD became IDENTICAL. */
  reason: string;
  /** F7: point writes beside the symmetry — only fields the import changes. */
  piecesPerGarment?: number;
  fused?: boolean;
  fusingMode?: string;
};

/** Everything the wizard hands the card — applied in ONE commit or not at all. */
export type CardDraft = {
  techCardId: number;
  scopes: DraftScope[];
  pieces: DraftPiece[];
  aliases: DraftAlias[];
  pieceUpdates: DraftPieceUpdate[];
  /** Also offered as a download: the same texts. */
  downloads: { filename: string; dxfText: string }[];
};

export type ApplyUploaded = {
  scopeKey: string;
  url: string;
  filename: string;
  sizeBytes: number;
  /** hex SHA-256 of the uploaded bytes (0423); '' / absent when unknown */
  sha256?: string;
};

/**
 * F7: a failure writes NOTHING to the form; `uploaded` then lists the files that did land before it
 * (orphans in object storage — acceptable, named so the operator knows). `reused` = scopes whose
 * identical file was already on the card; `writes` = form writes made (0 on a re-apply); `save` = the
 * card save's answer (autosave `flush`), when the host passed one.
 */
export type ApplyResult =
  | {
      ok: true;
      uploaded: ApplyUploaded[];
      reused?: string[];
      writes?: number;
      save?: string;
      /** MF-C: rows whose file was replaced in place (M4), old url → new url. */
      replaced?: { scopeKey: string; lineKey: string; oldUrl: string; newUrl: string }[];
    }
  | { ok: false; failedScope: string; message: string; uploaded: ApplyUploaded[] };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 9. Writer and manifest (F6) — the format the card trusts
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const MANIFEST_VERSION = 1 as const;
export const MANIFEST_TAG = 'GRBPWR-MANIFEST' as const;

/** Our layer numbers. The strings are DXF layer names. */
export type LayerMap = { cut: '1'; seam: '14'; grain: '7'; notch: '4'; internal: '8' };

export type ManifestSize = {
  token: string;
  sizeId: number;
  name: string;
  sourceLabel: string;
  rank: number;
};

export type ManifestPiece = {
  identity: PieceKey;
  code: string;
  mods: string[];
  displayName: string;
  pairHand: PairHand | null;
  pairOf: PieceKey | null;
  unfoldedFold: boolean;
  piecesPerGarment: number;
  fabrics: FabricPurposeKey[];
  fused: boolean;
  ungraded: boolean;
  allowanceMm: Mm;
  nameOrigin: PieceSpec['nameOrigin'];
  aiConfidence?: number;
  /** GRADE P1: per-size count differences the operator answered "intended" (absent = none). */
  gradeIntended?: GradeCountFeature[];
  /** SHAPE-KINK: the operator's one-shape moves (fixShape / dropSize) on this piece. */
  shapeFixes?: ShapeFixRecord[];
  /** L13: the half is drawn, its fold line the block's mirror line — the card cuts it on the fold. */
  halfFold?: true;
};

export type ManifestBlock = {
  block: string;
  identity: PieceKey;
  sizeToken: string;
  sizeId: number;
  bboxMm: [Mm, Mm, Mm, Mm];
  areaMm2: Mm2;
  hasGrain: boolean;
  notches: number;
  /** GRADE P1: of `notches`, how many are not drawn in this size but graded from the others. */
  notchesGraded?: number;
  /** GRADE P1: of `notches`, how many were drawn as the outline and are crossed by the chord. */
  notchesChorded?: number;
  /** GRADE P1: drills / internal lines not drawn in this size, placed by the operator's "in every size" */
  drillsGraded?: number;
  internalGraded?: number;
  /** GRADE P1: marks drawn in this size that the operator's "in no size" removed (D5) */
  notchesRemoved?: number;
  drillsRemoved?: number;
  internalRemoved?: number;
  drills: number;
  internal: number;
  hasSeam: boolean;
  /** G18 (A8): where the block's grain came from — absent on a manifest written before it. */
  grain?: { origin: GrainFeature['origin']; evidence: GrainEvidenceKind[] };
  /**
   * F14f (Codex R2): the cut ring, coarsened — what binds this entry to the drawn contour
   * (manifest/contour-sig.ts). Absent in a manifest written before F14f: the card then treats the
   * whole manifest as untrusted (legacy parse), never as matched.
   */
  contour?: ContourSignature;
  /**
   * P1: this size closed through continuity walls (drawn lines of another class or size between
   * its own ends) — the durable audit: per edge its rule, the chains it lies on with their roles as
   * read, `bracket`, `ownRank`; the D3 verdict (anchor ranks, every measured check and what it
   * allowed). G21 checks it against the run and checks its rules; absent = closed on its own lines.
   */
  continuity?: ManifestContinuity;
  /**
   * GRADE P2: where the geometry comes from — absent = drawn. 'repaired': the size's own lines
   * where the grade of `from` (card tokens of the anchor sizes) puts it, `holes` holes of `holesMm`
   * in all filled from the grade (derived 'grade-fill', G15 audits them); `cover` = share on its
   * own / common lines.
   */
  grade?: ManifestGrade;
  /**
   * SHAPE-KINK: stretches of this size's outline straightened onto its own line / the family's
   * structure (D5) — rule, how far it had left the line, the chord's span (mm). Absent = as drawn.
   */
  kinkStraightened?: { rule: KinkRule; mm: number; spanMm: number }[];
};

/** GRADE P2: ManifestBlock.grade. */
export type ManifestGrade = {
  geometryOrigin: 'repaired';
  from: [string, string];
  holes: number;
  holesMm: number;
  cover: number;
};

/**
 * Douglas–Peucker vertices of a cut ring, relative to its bbox min corner, in 0.1 mm integers,
 * delta-coded `[x0, y0, dx1, dy1, …]`; `dev` = how far (0.1 mm, rounded up) the ring strays from
 * this polyline. See manifest/contour-sig.ts.
 */
export type ContourSignature = { dev: number; pts: number[] };

export type ManifestSource = {
  files: { name: string; sha256: string; bytes: number; kind: SourceKind; pages: number }[];
  scale: { method: ScaleMethod; factor: number; measuredMm: Mm | null; declaredMm: Mm | null };
  /** The whole drawing (D6: every tile sheet): pages placed, first registration method, worst residual. */
  sheet: {
    pages: number;
    method: RegistrationMethod | 'single';
    maxResidualMm: Mm;
    /** TILESTEP: where the tile pitch came from. Optional and shape-tolerant on read. */
    pitch?: PitchSource;
  };
  /** D6: the tile sheets the drawing is made of, when there are several (absent = one). */
  sheets?: { sheet: number; pages: number; maxResidualMm: Mm; pitch?: PitchSource }[];
  /**
   * UXHOOKS: missing tile cells imported as blank pages — per cell, the drawn lines ending inside
   * it (`lineEnds`, the sheet's lines) and the traced chains ending inside it (`chainEnds`): the
   * lines the hole cuts. Absent = none.
   */
  holes?: {
    sheet: number;
    row: number;
    col: number;
    lineEnds: number;
    chainEnds: number;
    origin: 'operator' | 'autopilot';
  }[];
  sizeEncoding: SizeEncoding;
  variant: string | null;
  /**
   * VARIANTS (D5): the pieces the drawing ties to ONE model (a bare "Style A" in the piece's label
   * block), with what it rests on — `kept` = written in this file (it is the chosen model's, or no
   * model was chosen), else left out. Optional, shape-tolerant on read; absent = none tied.
   */
  models?: { piece: string; model: string; kept: boolean; evidence: string }[];
};
/** VARIANTS: at most this many `source.models` entries (the writer and the reader alike). */
export const MODELS_MAX = 64;

export type GateCheckId =
  | 'G1-roundtrip'
  | 'G2-square'
  | 'G3-coverage'
  | 'G4-hausdorff'
  | 'G5-features'
  | 'G6-offset'
  | 'G7-overview'
  | 'G8-monotone'
  | 'G9-sizes'
  | 'G10-uni'
  | 'G11-grammar'
  | 'G12-pair'
  | 'G13-manifest'
  /** MF-B preflight: the 999 manifest prologue is larger than `manifestPrologueWarnBytes` (warn). */
  | 'G14-prologue'
  /**
   * F14b (Codex C1): every derived outline edge (bridge, operator bridge, band cut) lands on drawn
   * walls at both ends and stays short, per edge and per piece. G3/G4 measure against the drawn
   * walls only; the stretch of the written line on an edge that passes here is left to this check.
   */
  | 'G15-derived'
  /** A8 safety net: lettering / watermark strokes on the internal layer (block). */
  | 'G16-glyphs'
  /** A2: a closed outline big enough to be a piece written on another piece's layer 8. */
  | 'G20-nested-piece'
  /** A8: internal-layer length against the outline length (warn). */
  /** A8: a found grainline that stands on lettering strokes (block) or touches one (warn). */
  | 'G18-grain-source'
  /**
   * A8b: the cut / seam line traced around tile chrome — a hairpin round a 1 mm bar (a corner
   * bracket), or a stretch ≥ 5 mm ON a masked / offered chrome line (block).
   */
  | 'G19-chrome'
  /**
   * P1: a size closed through continuity walls carries its provenance and D3 verdict; the stretch
   * lies on the chains it names, the written line runs along it, the rule's constraints hold, and
   * the verdict's checks are within what it allowed (block on any mismatch).
   */
  | 'G21-continuity'
  /**
   * D6: every tile sheet of the file is in the drawing, every sheet that holds pieces exports one,
   * and no piece is in the export twice from two sheets (a copy / an alternative rendering not
   * answered), nor a piece split between sheets exported as halves (block).
   */
  | 'G23-sheets'
  /**
   * MOOD Ф0 (R12): a size block of a rank identified by its pen (declared dash, recovered motif,
   * the drawing's key) lies on that pen's lines (± its corner stubs) — ≥ 0.85 of the written line
   * off the common edges; a rank of such a run whose pen is unknown proves nothing (block).
   * KINKS: and nowhere bends off them — no stretch > 2 mm that leaves its own line by ≥ 0.5 mm (a
   * neighbouring size's line, a tile mark, a corner cut short).
   */
  | 'G22-identity'
  /**
   * MOOD Ф0 (G24): one outline, one piece — the face holds another piece's header, or overlaps another
   * piece's outline of the same size > 5 %, or the area jumps past its neighbours' grade step.
   */
  | 'G24-one-piece';

/**
 * SILENT (G26, inside G22 / G8): the pieces-stage grade evidence of one written size block.
 * `hold` — the grade model's neighbour verdict: the size's outline leaves the family's grade for
 * ANOTHER size's drawn line (G22 blocks it, "G26"); `warn` — another disagreement with the grade
 * (shown in G8's note, never held); `drawsOwn` — the size's own drawn lines run beside its outline
 * (1.5–15 mm off it, ≥ 20 mm): the drawing grades it there, so a size written on the same outline as
 * its neighbour is a collapse (G8). Absent `drawsOwn` = not known (no wall model): G8 holds a
 * collapse on the geometry alone. (No GateCheckId of its own: the check step's label map is the UI
 * session's file — G26 rides in G22 / G8 the way KINKS' G25 rides in G22.)
 */
export type GradeEvidence = { hold?: string; warn?: string; drawsOwn?: boolean };

/**
 * MOOD Ф0 (G22): per written size block, the lines of its rank's pen near it and the common edges
 * every size uses (excused), in the written frame. `pen` null = an identity run whose rank has no
 * known pen. Absent for a block = no identity claim (the run is not identity encoded).
 */
export type IdentityGeometry = {
  pen: string | null;
  own: PtMm[][];
  excused: PtMm[][];
  /** Lines of another pen this rank's own lines land on (an edge drawn once): ≤ half excused. */
  shared?: PtMm[][];
  /** Lines provably another size's (another pen, another size's class, an orphan of another look). */
  foreign?: PtMm[][];
  /**
   * KINKS (G25): `own` without the lines another size's class holds — on a measured pen two sizes
   * may share one look (Mood's S and L motifs), and a line of the other one is no line of this size.
   * Absent = `own`.
   */
  ownStrict?: PtMm[][];
  /** KINKS (G25): the drawing's own size-line key names this size (a legend sample). */
  keyed?: boolean;
  /**
   * The pen is declared (a dash pattern, a plain stroke) — not a rhythm measured off the drawing or
   * the class's own lines: the stricter share applies.
   */
  exact?: boolean;
};

export type GateCheck = {
  id: GateCheckId;
  ok: boolean;
  /** 'block' fails the export; 'warn' is shown and passes. */
  severity: 'block' | 'warn';
  value: number | string | null;
  threshold: number | string | null;
  /** Blocks (or identities) the check names. */
  blocks: string[];
  note: string;
  /** SHAPE-KINK: the G5 one-shape hold, per held size (the check step's fixShape / dropSize). */
  shapeIssues?: ShapeIssue[];
  /**
   * SHAPE-KINK: where this failure is answered when it is not the check id's usual step — 'check'
   * = on the check step itself (shapeIssues: api.fixShape / api.dropSize). Absent = the id's step.
   */
  door?: 'check';
};

/** One derived edge G15 accepted — the audited list the manifest carries (`GateReport.derived`). */
export type DerivedEdgeAudit = {
  block: string;
  kind: DerivedEdgeKind;
  /** Edge length, and the part of it farther than `snapMm` from every drawn wall, mm (0.1). */
  lengthMm: Mm;
  offSourceMm: Mm;
  /** End points in the written frame, mm (0.1). */
  a: [Mm, Mm];
  b: [Mm, Mm];
};

export type GateReport = {
  passed: boolean;
  checks: GateCheck[];
  durationMs: number;
  /** F14b: the derived edges G15 accepted, per block; absent when there are none. */
  derived?: DerivedEdgeAudit[];
};

/**
 * The conversion manifest. Embedded in the DXF as 999 comments (see manifest/) AND returned next
 * to it. The card trusts it over every guess (Codex C2/C4/C10): block → identity → card size →
 * scope; cut layer is final; pairs are two blocks of one piece; symmetry is IDENTICAL.
 */
export type ConversionManifest = {
  v: typeof MANIFEST_VERSION;
  generator: string;
  createdAt: string;
  techCardId: number;
  scope: { fabricPurpose: string; bomLineKey: string };
  units: 'mm';
  layers: LayerMap;
  /** Layer 1 is the FINAL cutting line: the card must NOT add allowance again. */
  cutLayerIsFinal: true;
  /** File-level allowance, mm, informational (per piece in `pieces`). */
  allowanceMm: Mm;
  sizes: ManifestSize[];
  pieces: ManifestPiece[];
  blocks: ManifestBlock[];
  source: ManifestSource;
  gate: GateReport | null;
  /**
   * A10 (D5): what the autopilot answered instead of the operator — every answer the drawing did
   * not prove, with its rule, evidence and confidence. Absent = a run the operator answered.
   * Optional and shape-tolerant on read (an entry that does not validate is left out, never the
   * sheet), so a manifest written before or after this field reads the same.
   */
  autopilot?: AutopilotRecord;
  /**
   * PASSPORT Ф1: what the document said about the garment (≤ 2 KB digest). Optional and
   * shape-tolerant on read like `autopilot`.
   */
  passport?: PassportDigest;
  /**
   * AP-replay: every answer this sheet's run ended with — the operator's and the autopilot's alike —
   * in a reproducible form (kind + value; the subject is for people), so a re-import of the same
   * source files into the same card reuses them where they still land (autopilot/replay.ts).
   * Optional and shape-tolerant on read, like `autopilot`.
   */
  replay?: ReplayRecord;
};

/**
 * AP-replay: one answer of a run, as a re-import reuses it. `kind` says which question family
 * ('scale', 'size-map', 'piece' …), `value` is the answer itself (file references by their index
 * in `source.files`, pieces by their outline's area and centroid), `subject` is for people only.
 * `strong`: the answer was a strong autopilot assumption (a replay of it stays strong).
 */
export type ReplayAnswer = {
  step: string;
  kind: string;
  subject: string;
  value: AutopilotValue;
  strong?: boolean;
  /** The answer was the autopilot's (absent = the operator's). */
  auto?: boolean;
};

export type ReplayRecord = { v: 1; answers: ReplayAnswer[] };
/** AP-replay: at most this many answers per manifest; a value up to this many JSON characters. */
export const REPLAY_MAX = 400;
export const REPLAY_VALUE_MAX = 16384;

/**
 * A10 (D5): one answer the autopilot gave in the operator's place. `strong` = a dangerous default
 * the drawing gives no evidence for (grain from the piece's axis, the outline taken as the cut
 * line, 1:1 without a square, sizes mapped by order): the card shows these first.
 */
export type AutopilotAssumption = {
  /** The wizard step the question was on ('scale', 'sizes', 'meaning', …). */
  step: string;
  /** What kind of question (kebab-case: 'grain-axis', 'size-ordinal', 'outline', 'quantity' …). */
  kind: string;
  /** What it is about: a piece ('seed 12 · 21'), a size ('source 38'), the file, a page … */
  subject: string;
  /** The answer given, in words ('cut line', '×2', '38 → M', '90°'). */
  answer: string;
  /** The policy rule that gave it (one line). */
  rule: string;
  /** What it rests on (short lines). */
  evidence: string[];
  /** 0..1, the policy's own confidence in the answer. */
  confidence: number;
  strong: boolean;
  /**
   * The answer itself, replayable: the value the wizard input took (a factor, a size map entry, a
   * grain's two ends, a code …), keyed by `kind` + `subject`. Plain JSON, ≤ 2 KB written.
   */
  value?: AutopilotValue;
};

export type AutopilotValue =
  | string
  | number
  | boolean
  | null
  | AutopilotValue[]
  | { [k: string]: AutopilotValue };

export type AutopilotRecord = { v: 1; assumptions: AutopilotAssumption[] };

export type WriteJob = {
  techCardId: number;
  scope: DraftScopeTarget;
  pieces: PieceSpec[];
  sizes: ManifestSize[];
  source: ManifestSource;
  generator: string;
  /** Which CLO dialect to emit (K2 decides the default; both must read back through our parser). */
  dialect: 'r12' | 'r2000';
  /** A10: the autopilot's assumptions, carried into the manifest as they are. */
  autopilot?: AutopilotRecord;
  /** PASSPORT Ф1: the document's digest, carried into the manifest as it is. */
  passport?: PassportDigest;
  /** AP-replay: the run's answers, reproducible (manifest `replay`). */
  replay?: ReplayRecord;
};

export type WriteResult = { dxfText: string; manifest: ConversionManifest; warnings: string[] };

export type WriteDxfFn = (job: WriteJob) => WriteResult;
export type EmbedManifestFn = (dxfText: string, manifest: ConversionManifest) => string;
/** null when the text carries no manifest (a foreign DXF); throws on a corrupt one. */
export type ReadManifestFn = (dxfText: string) => ConversionManifest | null;

/** A8b (G19): one tile-chrome line — a mark (bracket, tile label: blocks) or a frame (warns). */
export type ChromeLine = { mark: boolean; pts: PtMm[] };

/** What the gate compares the written file against. */
export type GateExpectation = {
  pieces: PieceSpec[];
  manifest: ConversionManifest;
  /** Card size tokens (for G9 via deriveBlockSizes) — the card's `has(token)`. */
  sizeTokens: ReadonlySet<string>;
  /** Source walls per block: G4 measures the written line against them (whole chains are fine). */
  wallsByBlock: Record<string, PtMm[][]>;
  /**
   * G3's denominator (M7): the stretches of the walls this block uses, cut at junctions of the
   * source chain topology — never trimmed by the written line. Absent for a block = its
   * `wallsByBlock` (a CLO block's walls are its own outline).
   */
  coverageWallsByBlock?: Record<string, PtMm[][]>;
  /**
   * F14b (Codex C1): the outline's derived edges per block, written frame. Never walls: G15 checks
   * them against `wallsByBlock`, and G4 leaves out only the written stretch on an edge G15 passed.
   */
  derivedByBlock?: Record<string, DerivedEdge[]>;
  /**
   * GRADE P1: per block, the notches drawn AS the outline that its line crosses by the chord, with
   * the drawn bump, written frame — G3 does not count the bump's walls as off the line, G4 does not
   * measure the chord against them (the notch is on layer 4). Absent = none.
   */
  notchChordsByBlock?: Record<string, { chord: [PtMm, PtMm]; bump: PtMm[] }[]>;
  /** P1 (G21): per block closed through continuity walls, the used stretches and their chains. */
  continuityByBlock?: Record<string, ContinuityGeometry>;
  /**
   * A8b (G19): tile chrome near each block, written frame — the clean stage's masked frames,
   * marks and tile labels and the chrome it only offered. A cut / seam line on it is traced chrome.
   */
  chromeByBlock?: Record<string, ChromeLine[]>;
  /** MOOD Ф0 (G22): the block's rank pen lines and the common edges, written frame. */
  identityByBlock?: Record<string, IdentityGeometry>;
  /** MOOD Ф0 (G24): per block, why its outline may hold two pieces (pieces-stage evidence). */
  onePieceByBlock?: Record<string, string>;
  /** SILENT (G26 / G8): per block, the grade model's verdict and the drawing's own lines. */
  gradeByBlock?: Record<string, GradeEvidence>;
  overview?: Record<PieceKey, BoxMm>;
  /** Vector sources use 0.3; raster 0.5 (mm). */
  hausdorffP95Mm: Mm;
  /** Open fold questions of the run (E1a): G6 blocks the whole file while any is unanswered. */
  openFolds?: readonly string[];
  /** D6 (G23): the tile sheets of the whole garment (every fabric scope), as the run read them. */
  sheets?: SheetCover;
};

/** D6 (G23): what the run made of the file's tile sheets — over the whole garment, not one scope. */
export type SheetCover = {
  /** Tile sheets the page classes carry. */
  tileSheets: number[];
  /** Per sheet in the drawing: its pieces (families after the edits) and how many are exported. */
  parts: { sheet: number; pieces: number; exported: number }[];
  /** Cross-sheet questions not answered so a piece may be in the export twice or in halves. */
  open: string[];
  /** The passport's expected pieces no exported piece is bound to (an expectation: noted only). */
  expectedMissing?: string[];
  expected?: number;
};

export type RunGateFn = (dxfText: string, expect: GateExpectation) => Promise<GateReport>;

/** The gate's view of our own parser's output, so G1 can be asserted without the UI. */
export type RoundTrip = {
  pieces: PieceDTO[];
  blockNames: string[];
  failedFiles: number;
  skippedBlocks: number;
  warnings: string[];
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 10. AI naming (F10 client ↔ F9 backend `SuggestPatternPieces`)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One numbered region on the Set-of-Mark render, with the deterministic evidence the client measured
 * and read for it (F9 `PatternPieceEvidence` is a projection of this; `ai/wire.ts` maps it).
 */
export type SomMark = {
  mark: number;
  seed: SeedId;
  /** minX, minY, maxX, maxY of the piece's outer (largest) outline, sheet mm. */
  bboxMm: [Mm, Mm, Mm, Mm];
  areaMm2: Mm2;
  /** Texts whose glyph box centre lies inside the outline. */
  textInside: string[];
  /** Texts just outside (≤ 25 mm) that belong to no other piece. */
  textNear: string[];
  /** The quantity note as printed ("cut 2", "2 дет.", "Cut 1 on fold"); '' = none found. */
  quantityText: string;
  /** "2 дет." / "cut 2" / "cut x1 pair" (= 2) parsed from `quantityText`, if any. */
  cutQtyHint: number | null;
  /** A fold is drawn (FoldFeature) or written ("on fold", "im Bruch", "сгиб") on or at the piece. */
  foldHint: boolean;
  /** The outline is mirror-symmetric about one axis (a piece drawn whole, a collar). */
  symmetricHint: boolean;
  sizeCount: number;
  /** Chirality hint from geometry when a mirrored twin exists on the sheet. */
  mirrorTwinMark: number | null;
  /** The seed's variant (Mod. 125 / Style A); null = all. */
  variant: string | null;
};

/** One allowed base code for the model, with its English name (F9 `allowed_codes`). */
export type AllowedCode = { code: string; name: string };

export type SuggestPatternPiecesInput = {
  /** 0 = no card yet (the server only logs it). */
  techCardId: number;
  /** Media id of the uploaded SoM render of the whole sheet. */
  overviewMediaId: number;
  /** Close-ups of single pieces (≤ 12), media ids. */
  crops: { mark: number; mediaId: number }[];
  marks: SomMark[];
  /** The card's size tokens in rank order — a code may never end in one (FP_M). */
  sizeTokens: string[];
  /** BOM fabric purposes of the card (FabricPurposeKey). */
  bomPurposes: FabricPurposeKey[];
  /** Cut pieces the card already lists (Codex C10: never bound by name alone). */
  existingPieceNames: string[];
  /** Sheet text that belongs to no piece (piece list, legend), ≤ 4000 characters. */
  instructionsExcerpt: string;
  /** 'ru', 'de', … — prompt hint only; '' = unknown. */
  languageHint: string;
  allowedCodes: AllowedCode[];
  allowedModifiers: string[];
  force: boolean;
};

export type PieceSuggestion = {
  mark: number;
  /** Code words joined (`LIN_FP`); '' when the server refused the model's code. */
  code: string;
  /** Modifiers in grammar order (L/R, F/B, n, #). */
  mods: string[];
  displayName: string;
  fabrics: FabricPurposeKey[];
  /** Pieces per garment, both halves of a pair counted; null = the model did not say. */
  cutQty: number | null;
  onFold: boolean;
  /** One mark cut twice as a mirrored left + right (no L/R in the code). */
  pair: boolean;
  variant: string | null;
  /** Model's own 0..1. */
  modelConfidence: number;
  /** Free-text evidence the model cites. */
  evidence: string[];
};

export type SuggestPatternPiecesOutput = {
  suggestions: PieceSuggestion[];
  cached: boolean;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** As the server reports it ("" = the provider reported no cost). */
  costUsd: string;
  warnings: string[];
};

/** Deterministic evidence the client computes and combines with the model (Codex C10). */
export type NameEvidence =
  | { kind: 'text-synonym'; text: string; code: string; weight: number }
  /** Printed text names ANOTHER piece than the model says: never auto-accepted. */
  | { kind: 'text-conflict'; text: string; code: string; weight: number }
  | { kind: 'cut-qty'; qty: number; weight: number }
  /** The pair/fold call agrees with the geometry (hand = the declared L/R, null for pair/fold). */
  | { kind: 'chirality'; hand: PairHand | null; weight: number }
  | { kind: 'cut-layout'; fabric: FabricPurposeKey; weight: number }
  | { kind: 'grammar-ok'; weight: number }
  | { kind: 'unique'; weight: number }
  /** A modifier the sheet does not back (side no text states, hand without a twin, odd numbering). */
  | { kind: 'unconfirmed'; part: 'side' | 'hand' | 'number'; weight: number }
  | { kind: 'collides-existing'; name: string; weight: number };

export type NameDecision = {
  seed: SeedId;
  suggestion: PieceSuggestion | null;
  /**
   * Where the NAME came from: 'text' = read off the sheet by the deterministic reader alone (no
   * model); 'ai' = the model's answer (text evidence may back it); 'dxf' = the source DXF's own
   * block name (E3: outranks the AI, never sent to it — ai/dxf-names.ts). nameOrigin derives from
   * this + autoAccepted, so an auto-accepted AI row stays flagged 'ai-auto' even when the sheet
   * agrees; a DXF name is recorded as 'text' (the source's own words).
   */
  source: 'text' | 'ai' | 'dxf';
  evidence: NameEvidence[];
  /** Combined confidence, 0..1: 0.5·model + 0.5·clamp(Σ evidence weights) (08-CONTRACT §6). */
  confidence: number;
  /** Auto-accepted rows are still shown, flagged. */
  autoAccepted: boolean;
  code: string;
  mods: string[];
  displayName: string;
};

export type CombineNamesFn = (
  suggestions: PieceSuggestion[],
  marks: SomMark[],
  ctx: {
    existingPieceNames: string[];
    threshold: number;
    /** Card size tokens: an identity may not end in one (G11). */
    sizeTokens?: string[];
    /** BOM purposes, for the cut-layout evidence. */
    bomPurposes?: FabricPurposeKey[];
    /** Dictionary membership (dictionary/ isKnownCode); the AI may only auto-accept known codes. */
    isKnownCode?: (word: string) => boolean;
  },
) => NameDecision[];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 11. Worker protocol and wizard session
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type StageName =
  | 'extract'
  | 'clean'
  | 'scale'
  | 'assemble'
  | 'chains'
  | 'sizes'
  | 'pieces'
  | 'semantics'
  | 'fabrics'
  | 'render-som'
  /** A9 side stage: page thumbnails + stats for the AI page-role call (invalidates nothing). */
  | 'render-pages'
  | 'write';

/** Input/output of each stage as the worker sees them (session-held artifacts by id). */
export type StageIO = {
  extract: {
    in: { opts: ExtractOpts };
    out: {
      files: SourceFileInfo[];
      pages: PageClassification[];
      scale: ScaleCandidate[];
      warnings: string[];
      /**
       * The input is a garment DXF whose blocks already ARE pieces × sizes (F8 `dxfFastPath`): the
       * worker answers assemble / chains / pieces from the segmentation and the wizard skips the
       * sheet, legend and seed steps.
       */
      presegmented?: boolean;
      /** Traced raster pages (F11): the correction each page already carries (`IRPage.calibration`). */
      calibrations?: { file: FileId; page: PageIndex; calibration: RasterCalibration }[];
      /** PASSPORT Ф1: what the document says, as read before any piece (absent = nothing read). */
      passport?: GarmentPassport;
    };
  };
  /** A8: the input pages cleaned before anything is parsed (masks, dropped pages, scale hints). */
  clean: { in: CleanInput; out: CleanOutput };
  scale: { in: { decision: ScaleDecision }; out: { applied: ScaleDecision } };
  assemble: {
    /**
     * D6: EVERY tile sheet of the files is assembled (one file = one garment); `sheet` names the
     * sheet the operator's `override` grid is set on (ignored without one).
     */
    in: {
      sheet: number;
      override?: GridOverride;
      /** Probes only (D6 merged-vs-parts comparisons): assemble just these tile sheets. */
      probeSheets?: number[];
      /** UXHOOKS: missing cells accepted as blank pages (moved from `missing` to `holes`). */
      acceptMissing?: SheetAcceptMissing[];
    };
    out: {
      sheet: Omit<Sheet, 'paths' | 'texts' | 'rasters' | 'styles'>;
      previewPaths: Float32Array[];
      /**
       * A8 8b: what the sheet-wide pass masked after assembly (a watermark whose letters the tile
       * borders cut), in sheet frame, plus the tinted preview of every masked line by kind.
       */
      clean?: SheetClean;
    };
  };
  chains: {
    in: {
      opts: ChainOpts;
      legend?: Parameters<ApplyLegendFn>[1];
      /**
       * Rows the operator confirmed as proposed (keys: the row's sig, or `#id`): confidence 1 in the
       * built set (chains/legend confirmRows). Absent = no row confirmed.
       */
      confirmed?: string[];
      /** LINEFIX: the operator's per-line answers (chains/assign.ts), applied after the legend. */
      chainAssign?: ChainAssign[];
    };
    out: {
      classes: LineClass[];
      bundles: Bundle[];
      orphans: ChainId[];
      /** One polyline per chain, index = ChainId (an empty array for a chain not drawn). */
      chainPreview: Float32Array[];
      warnings: string[];
      /** What the legend could not decide alone (F3 `ChainSet.ambiguities`), shown as flags. */
      ambiguities?: ChainAmbiguity[];
      /** MOOD-F1: each row's real look by class id (absent = no drawing to cut one from). */
      swatches?: Record<ClassId, LineSwatch>;
      /** MOOD-F1: the key's own samples by their chain id (`legend-sample` evidence `chain`). */
      keySwatches?: Record<ChainId, LineSwatch>;
      /**
       * LINEFIX: per chain (index = ChainId, as `chainPreview`): its stable line key, the tile sheet
       * it lies on and its backbone pen (StyleId) — what a `chainAssign` answer names. Absent on the
       * DXF fast path.
       */
      chainLines?: { key: string; sheet: number; style: StyleId }[];
      /** LINEFIX: how `chainAssign` landed (absent = none given). */
      lineAssign?: LineAssignReport;
      /**
       * LINEASSIGN-2: nest outlines outside the size row their graded nest names, on the set as
       * answered (operator-answered lines are never suspects). [] = none; absent on the DXF fast
       * path.
       */
      suspects?: LineSuspect[];
      /** LINEASSIGN-2: closed outlines per size row (ends ≤ 2 mm, ≥ 200 mm); absent on the fast path. */
      outlines?: SizeOutlines[];
    };
  };
  sizes: {
    in: {
      card: CardSize[];
      operatorMap?: SizeMapEntry[];
      /**
       * pieces/grade (H1): the operator's answer to "how many sizes are drawn on this sheet".
       * 0 = he took the count the sheet's evidences agree on (A6 AUTO) back: asked as without it.
       */
      drawnSizes?: number;
    };
    out: {
      run: SizeRun;
      map: SizeMap;
      /**
       * pieces/grade (H1): sizes the sheet draws — from the source when it encodes them, else the
       * operator's answer; null = unknown (the sizes step asks).
       */
      expected: ExpectedSizes | null;
      /** D1: the step asks the count (null = the source states it, or it does not matter). */
      countAsk: SizeCountAsk | null;
      /** D6: the size lines each tile sheet draws (null = one sheet). */
      sheetLegend?: SheetLegend | null;
    };
  };
  pieces: {
    in: {
      seeds?: Seed[];
      edits: PieceEdit[];
      opts: FillOpts;
      /**
       * D6: the operator's (or autopilot's) answers to the cross-sheet questions, by key
       * (pieces/sheets.ts): 'both' / 'union' / 'separate' keep both, 'halves' blocks (G23). A
       * "copy" / "keep" answer is sent as "not a piece" edits on the copies.
       */
      sheetAnswers?: Record<string, SheetAnswer>;
    };
    out: {
      seeds: Seed[];
      families: PieceFamily[];
      /** D6: the pieces read across the tile sheets (copies, alternatives, splits); null = one sheet. */
      sheets?: SheetPieces | null;
      /**
       * Models the sheet names ("Style A", "Mod. 125": F4 `variantLabels` over the sheet and the
       * instruction pages), also when no seed carries one — the wizard offers them as the model
       * choice, and the chosen one's cutting lines become knives (FillOpts.variant).
       */
      variants?: string[];
      /**
       * What tells the models apart on the drawing (pieces/variants `variantMarksOut`): one entry
       * per printed "Cutting line <model>" label (and per single-model label in a piece), with the
       * line it names in sheet mm. `[]` = the models are PROVEN one garment (≥ 2 models, no mark of
       * any kind, no seed tied to a model, every piece holds a text naming all models together) —
       * the wizard may pick without asking. Absent = unknown: ask. See VariantMark.
       */
      variantMarks?: VariantMark[];
      /**
       * pieces/grade (H1): what the size solver could not decide (kind 'size-count' /
       * 'grade-ambiguous'), and the size count the fill assumed — the refused candidates carry
       * the per-piece reason.
       */
      grade?: { expected: ExpectedSizes | null; ambiguities: ChainAmbiguity[] };
      /** A2: closed outlines (and text seeds in junk) not seeded — shown, one click from a piece. */
      setAside?: SetAside[];
      /** KOMBI-AP: safe, explainable non-piece verdicts for set-asides; missing ids stay a question. */
      asideEvidence?: SetAsideEvidence[];
    };
  };
  semantics: {
    in: Omit<
      SemanticsInput,
      | 'sheet'
      | 'set'
      | 'run'
      | 'sizeMap'
      | 'families'
      | 'traced'
      | 'docTexts'
      | 'seedLabels'
      | 'seedTexts'
      | 'seedAts'
    >;
    out: SemanticsOutput;
  };
  fabrics: {
    in: {
      bom: DraftScopeTarget[];
      /** F7: the AI's `fabrics` per seed (F10 suggestions) — used where the sheet itself is silent. */
      aiHints?: { seed: SeedId; fabrics: FabricPurposeKey[]; confidence: number }[];
    };
    out: FabricAssignment;
  };
  'render-som': {
    in: { seeds: SeedId[]; dpi: number };
    out: {
      /** The overview render (PNG, or JPEG when the PNG is over the byte cap). */
      sheetPng: Blob;
      crops: { seed: SeedId; mark: number; png: Blob }[];
      marks: SomMark[];
      /** Sheet-level text for the prompt: what belongs to no piece, and the language it is in. */
      context?: { instructionsExcerpt: string; languageHint: string };
    };
  };
  /**
   * A9: the pages the AI page-role call sends — each drawn after the clean stage's mask (PNG, long
   * side ≤ `maxPx`) with its stats. `pictures: false` = stats only (the probes: no canvas, no AI).
   */
  'render-pages': {
    in: { pages: { file: FileId; page: PageIndex }[]; maxPx: number; pictures?: boolean };
    out: { pages: (PageStats & { png: Blob | null })[] };
  };
  write: {
    in: {
      /** The card the manifest is written for: the card trusts a manifest only with its own id. */
      techCardId: number;
      scopes: DraftScopeTarget[];
      assignment: FabricAssignment;
      sizes: ManifestSize[];
      dialect: WriteJob['dialect'];
      generator: string;
      /** A10: the autopilot's assumptions (absent = the operator answered) → every manifest. */
      autopilot?: AutopilotRecord;
      /** AP-replay: the run's answers in a reproducible form → every manifest. */
      replay?: ReplayRecord;
      /**
       * RUL (alternative storage): 'rul' ALSO packs every scope as base-size AAMA DXF + grade rule
       * table (`DraftScope.rul`), when its pieces are point-for-point gradable; the per-size DXF
       * (`dxfText`) stays the file of the scope either way. Absent / 'blocks' = per-size only.
       */
      storage?: 'blocks' | 'rul';
      /** RUL: the base (sample) size token; default the middle card size of `sizes`. */
      rulBase?: string;
    };
    out: { scopes: DraftScope[]; gate: Record<string, GateReport> };
  };
};

/**
 * RULHOOK: the operator's storage choice for the write (`Inputs.writeStorage`, event
 * `write-storage`). Absent = 'blocks' (per-size DXF only). `rulBase` is checked against the sizes
 * the run writes (an unknown one is ignored, with a reason) — see `writeStorageFor`.
 */
export type WriteStorage = { storage: 'blocks' | 'rul'; rulBase?: string };

/**
 * Why a worker request failed, so the wizard can say what to do (the message is for the operator):
 * `stage-unavailable` — that stage's module has not landed yet (honest placeholder, no fake data);
 * `unsupported-format` / `corrupt` — the file itself; `cancelled` — the operator stopped it;
 * `no-session` — the worker was restarted (hard cancel, crash) and the files must be read again;
 * `out-of-order` — a stage ran before what it needs; `crashed` — the worker died (memory).
 */
export type ImportErrorCode =
  | 'stage-unavailable'
  | 'unsupported-format'
  | 'corrupt'
  | 'cancelled'
  | 'no-session'
  | 'out-of-order'
  | 'crashed'
  /** MF-B input guards: too many bytes / files / pages / pixels — refused before reading. */
  | 'too-large'
  | 'internal';

export type ImportWorkerRequest =
  | { type: 'open'; id: number; files: { name: string; bytes: ArrayBuffer }[] }
  | {
      [S in StageName]: {
        type: 'run';
        id: number;
        sessionId: number;
        stage: S;
        input: StageIO[S]['in'];
      };
    }[StageName]
  | { type: 'cancel'; id: number }
  | { type: 'close'; id: number; sessionId: number };

export type ImportWorkerResponse =
  | { type: 'opened'; id: number; sessionId: number; files: SourceFileInfo[] }
  | { type: 'progress'; id: number; stage: StageName; done: number; total: number; note?: string }
  | {
      [S in StageName]: { type: 'result'; id: number; stage: S; output: StageIO[S]['out'] };
    }[StageName]
  | { type: 'error'; id: number; stage?: StageName; code?: ImportErrorCode; message: string }
  | { type: 'closed'; id: number; sessionId: number };

export type WizardStep =
  | 'files'
  | 'scale'
  | 'sheet'
  | 'sizes'
  | 'pieces'
  | 'meaning'
  | 'fabrics'
  | 'check'
  | 'apply';

/** Main-thread session state the wizard renders. Every field is the latest stage output. */
export type ImportSession = {
  sessionId: number | null;
  step: WizardStep;
  files: SourceFileInfo[];
  pages: PageClassification[];
  /** A8: the latest clean stage output (null before the files are read / for the fixture). */
  clean?: StageIO['clean']['out'] | null;
  scale: { candidates: ScaleCandidate[]; decision: ScaleDecision | null };
  sheet: StageIO['assemble']['out'] | null;
  chains: StageIO['chains']['out'] | null;
  sizes: StageIO['sizes']['out'] | null;
  pieces: StageIO['pieces']['out'] | null;
  names: NameDecision[];
  semantics: SemanticsOutput | null;
  fabrics: FabricAssignment | null;
  variant: string | null;
  draft: CardDraft | null;
  gate: Record<string, GateReport>;
  busy: { stage: StageName; done: number; total: number; note?: string } | null;
  error: string | null;
};

/** Transitions the wizard may take; the state machine is in 08-CONTRACT §6. */
export type WizardEvent =
  | { type: 'files'; files: File[] }
  /** A8: the operator's mask edits (undo a kind, accept a suggestion, re-include a page). */
  | { type: 'clean'; edits: PageMaskEdit[] }
  /** A9: ask the AI the page roles again (fresh answers for the pages as they are now). */
  | { type: 'page-roles' }
  | { type: 'scale'; decision: ScaleDecision }
  | { type: 'sheet'; sheet: number; override?: GridOverride }
  /**
   * UXHOOKS: the missing cells of tile sheet `sheet` are blank pages — `cells` is the whole
   * accepted set of that sheet ([] takes it back); the sheet is assembled again (`Sheet.holes`).
   */
  | {
      type: 'sheet-accept-missing';
      sheet: number;
      cells: HoleCell[];
      origin?: 'operator' | 'autopilot';
    }
  | { type: 'legend'; edits: Parameters<ApplyLegendFn>[1] }
  /** A low-confidence legend row confirmed as proposed (its key: sig, or `#id`). */
  | { type: 'legend-confirm'; key: string }
  /** LINEFIX: the operator's per-line answers — the WHOLE list (replaces the previous one). */
  | { type: 'line-assign'; assign: ChainAssign[] }
  | { type: 'size-map'; entries: SizeMapEntry[] }
  /** pieces/grade (H1): the operator's "sizes drawn on this sheet" (null = the card's run). */
  | { type: 'drawn-sizes'; n: number | null }
  | { type: 'variant'; variant: string | null }
  | { type: 'piece-edits'; edits: PieceEdit[] }
  /** D6: a cross-sheet answer (pieces/sheets.ts); `edits` = the "not a piece" edits it stands for. */
  | { type: 'sheet-answer'; key: string; answer: SheetAnswer; edits: PieceEdit[] }
  | { type: 'names'; decisions: NameDecision[] }
  | { type: 'semantics'; input: StageIO['semantics']['in'] }
  | { type: 'fabrics'; assignment: FabricAssignment }
  /** A10: an autopilot run hands its assumptions to the written manifests. */
  | { type: 'write'; autopilot?: AutopilotRecord }
  /**
   * RULHOOK: how the write stores the sizes (`Inputs.writeStorage`, RUL-SPEC.md §6) — 'rul' also
   * packs base DXF + .rul. The operator's choice only (never an autopilot answer); on the check
   * step it writes again.
   */
  | ({ type: 'write-storage' } & WriteStorage)
  /**
   * SHAPE-KINK: the operator's one-shape move on the check step (api.fixShape / api.dropSize /
   * api.clearShapeFix) — `Inputs.shapeFixes`, semantics and the write run again. The operator's
   * only: never an autopilot / replay answer (in no step of ANSWERS).
   */
  | { type: 'shape-fix'; identity: string; size: string; action: ShapeFixAction | 'clear' }
  /** `token`: the apply lock the caller took (`lockApply`) — the autopilot's gated path. */
  | { type: 'apply'; token?: number }
  | { type: 'download' }
  | { type: 'back'; to: WizardStep }
  | { type: 'reset' };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 11b. AUTO wave (tmp/plans/pdf-to-dxf/auto/00-PLAN.md) — types for the later phases, unused yet
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * D3 stays: what the drawing does not prove is asked. 'auto' = two or more independent evidences
 * agree (applied, shown with an AUTO pill, undoable); 'suggest' = one evidence (prefilled, one
 * "accept all" click); 'ask' = none (a question).
 */
export type AutoOrigin = 'auto' | 'suggest' | 'ask';

/** One decision the auto run took at a fork of the wizard (A4), with the evidence behind it. */
export type AutoDecision = {
  step: WizardStep;
  /** What was decided: 'scale', 'legend', 'drawn-sizes', 'size-map', 'seed', 'grain', 'fold', … */
  kind: string;
  /** The piece it is about, when it is about one. */
  seed?: SeedId;
  value: unknown;
  origin: AutoOrigin;
  /** Human-readable evidences, each independent of the others ("layer «Cut lines»", …). */
  evidence: string[];
};

/** A1: a grainline the geometry proposes (origin 'proposed' once it is a feature). */
export type GrainProposal = { a: PtMm; b: PtMm; why: string };
/** A1: a proposal for one seed, with the evidence kinds it stands on (one drawn evidence or geometry). */
export type SeedGrainProposal = GrainProposal & { seed: SeedId; evidence: GrainEvidenceKind[] };

// ── A8 clean stage: page furniture masked on the INPUT pages, before anything is parsed ─────────

/**
 * What a masked line is. `curve-text` is TEXT drawn as strokes (a piece label "ID: 1 PRZÓD SIZE: M"):
 * masked out of the line work, kept as text evidence (`CurveText`).
 */
export type BackgroundKind =
  | 'grid'
  | 'tile-frame'
  | 'regmark'
  | 'tile-label'
  | 'watermark'
  | 'curve-text'
  | 'logo'
  | 'copyright'
  | 'table'
  | 'legend-swatch'
  | 'test-square'
  | 'stray';

/**
 * D3 for the mask: 'auto' = two independent evidences (or page-relative repetition on ≥ 3 tiles)
 * — applied, undoable per kind; 'suggest' = one evidence — shown, applied only when accepted.
 */
export type MaskStatus = 'auto' | 'suggest';

/** One masked object on one page (a grid, a text band, a test square, the tile frame). */
export type MaskItem = {
  /** Stable for the same input: `${file}:${page}:${kind}:${n}` (8b items: `sheet:watermark:${n}`). */
  id: string;
  kind: BackgroundKind;
  status: MaskStatus;
  /** Each independent evidence, human-readable ("lattice 10 mm both ways", "repeats on 14 tiles"). */
  evidence: string[];
  confidence: number;
  /** Path ids on the page (`IRPath.id`). */
  paths: PathId[];
  /** Text ids on the page (`IRText.id`), for text furniture. */
  texts?: TextId[];
  /** Lines (chains) it covers — what the summary counts ("203 grid lines"). */
  lines: number;
  /** Page frame, mm. */
  bbox: BoxMm;
  /** What it reads, when known (a text label's string, the watermark's word). */
  label?: string;
  /** The operator's edit applies: auto undone (false) / suggestion accepted (true); absent = as found. */
  applied: boolean;
};

/** A8: the page's role as the clean stage uses it — `PageClass` after the operator's door. */
export type PageMask = {
  file: FileId;
  page: PageIndex;
  role: PageClass;
  /** The operator changed the role (re-included a page, or dropped one). */
  roleEdited?: boolean;
  /** A page set aside: 'auto' = no line work that could be pattern; 'suggest' = has some — shown. */
  status?: MaskStatus;
  items: MaskItem[];
};

/**
 * The operator's edits to the mask (the files step): per kind for the whole run (or one page), per
 * item, or a page's role (`tile` re-includes a page the classifier set aside, `blank` drops one).
 */
export type PageMaskEdit =
  | { kind: BackgroundKind; keep: boolean; file?: FileId; page?: PageIndex }
  | { item: string; keep: boolean }
  | { file: FileId; page: PageIndex; role: PageClass };

/** Text drawn as strokes: where it is (page frame), its direction and glyph height — SoM crops, seeds. */
export type CurveText = {
  file: FileId;
  page: PageIndex;
  bbox: BoxMm;
  along: 'x' | 'y';
  glyphs: number;
  heightMm: Mm;
};

/**
 * A9: what the AI reads a page as (ClassifyPatternPages, one call per file over its thumbnails).
 * `pattern_tile` — a part of a tiled sheet at 1:1; `pattern_sheet` — a whole sheet at 1:1;
 * `overview` — a reduced layout; `instructions` — sewing steps, diagrams; `cutting_layout` — the
 * layout on the fabric; `cover`; `table` — sizes / yardage; `other`.
 */
export type AiPageRole =
  | 'pattern_tile'
  | 'pattern_sheet'
  | 'overview'
  | 'instructions'
  | 'cutting_layout'
  | 'cover'
  | 'table'
  | 'other';

/** A9: one page's AI answer as the clean stage reads it (evidence №1; geometry is №2). */
export type AiPageHint = {
  file: FileId;
  page: PageIndex;
  role: AiPageRole;
  confidence: number;
  /** The model's own words (≤ 3 × 120 runes). */
  evidence?: string[];
  /**
   * A9 (Codex #4): asked before an edit that changed the page's render or the tile reference set —
   * it only suggests until asked again.
   */
  stale?: boolean;
};

/** A9 (clean/page-roles.ts): a chain of the tile chrome at one page place, as `repetition` reads it. */
export type TileMarkSig = { cx: Mm; cy: Mm; w: Mm; h: Mm; len: Mm };

/** A9: what a page is made of, sent with its thumbnail (PatternPageEvidence) and read by the rule. */
export type PageStats = {
  file: FileId;
  page: PageIndex;
  widthMm: Mm;
  heightMm: Mm;
  /** Line work on the page after the mask, m. */
  lineLengthM: number;
  /** Closed outlines of piece size that are not rectangles (`shapesOf`). */
  pieceSizedOutlines: number;
  /** The file's tile chrome at its page place on this page; undefined = unknown (no chrome on the tiles, other orientation). */
  hasTileMarks?: boolean;
  textChars: number;
  /** The page's words in reading order, ≤ 600 runes. */
  textExcerpt: string;
};

/** A9: the early AI page call (one evidence each where it is given). */
export type CleanAiHints = {
  pages?: AiPageHint[];
  /** Junk boxes on a page, page frame, with what the AI read there ("WWW.PAPAVERO.PL"). */
  junk?: { file: FileId; page: PageIndex; bbox: BoxMm; kind: BackgroundKind; text?: string }[];
};

export type CleanInput = {
  edits: PageMaskEdit[];
  /** A9 (later): the early AI call's page roles and junk boxes. Absent / empty today. */
  aiHints?: CleanAiHints;
};

/** The tinted picture of one page: its live lines and its masked lines by kind (page frame). */
export type CleanPreview = {
  file: FileId;
  page: PageIndex;
  widthMm: Mm;
  heightMm: Mm;
  live: Float32Array[];
  masked: { kind: BackgroundKind; status: MaskStatus; applied: boolean; lines: Float32Array[] }[];
};

export type CleanOutput = {
  pages: PageMask[];
  /** Pages set aside before anything else (cover, instructions, overview, blank). */
  dropped: {
    file: FileId;
    page: PageIndex;
    cls: PageClass;
    why: string;
    /**
     * 'auto' = the page holds no line work that could be pattern; 'suggest' = it does (`drawing`
     * says what) — still set aside as the classifier said, shown with its thumbnail to check.
     */
    status: MaskStatus;
    drawing?: string;
    /** A10: the page draws a closed outline of piece size (it may be a piece). */
    face?: boolean;
    /**
     * A10: an overview whose outlines are the tile pages' whole pieces at a smaller scale (Hu shape
     * match): how many matched, at what scale (clean/reduced-copy.ts).
     */
    reducedCopy?: { matches: number; of: number; scale: number };
    /**
     * A9: the AI's reading of the page (evidence №1), when the call answered for it — on a page
     * holding line work: not pattern = the pre-filled "keep it aside", `pattern_*` = "read it as a
     * tile" offered.
     */
    ai?: { role: AiPageRole; confidence: number; evidence: string[]; stale?: boolean };
    /**
     * A9: SUGGESTIVE geometric facts that the page is not pattern (another format, no tile chrome,
     * text-dominant, no registration) — never enough to set it aside, even with the AI.
     */
    geo?: string[];
    /**
     * A9: the EXCLUSIONARY geometric fact (clean/page-roles.ts `exclusionOf`: a reduced copy of the
     * file's tile pieces, or no piece-sized outline / long line and not in the tile grid).
     */
    exclusion?: string;
    /**
     * A9: set aside by the AI (≥ 0.85, a non-pattern role) AND the exclusionary fact although it
     * holds line work — status 'auto', shown "set aside · AI + geometry", undone with "read as tile".
     */
    aiAside?: boolean;
    /**
     * STOPS (clean/page-ink.ts): the page's line work read WITHOUT the AI, on a file with a tile
     * sheet. `explained` = every long / piece-sized line is a table rule, a frame, a test square,
     * one of the file's tile pieces reduced, or a small drawing in a pen the tiles do not use — in
     * words ("12 table rules / separators, 3 frames, 1 test square"); the autopilot takes it as the
     * second evidence beside the classifier's text-led role. `unexplained` = the first line nothing
     * explains (the page stays the question, and says what that line is).
     */
    ink?: { explained?: string; unexplained?: string };
  }[];
  /** A9: per file, the tile chrome the page stats test a page against (`PageStats.hasTileMarks`). */
  tileMarks?: { file: FileId; tile: { widthMm: Mm; heightMm: Mm }; sigs: TileMarkSig[] }[];
  /** Page classification after the operator's role edits — what assembly reads. */
  classes: PageClassification[];
  /** Lines masked per kind (applied items only) — the "removed: …" line. */
  summary: Partial<Record<BackgroundKind, number>>;
  /** Lines per kind offered but not applied (suggestions not accepted, autos undone). */
  offered: Partial<Record<BackgroundKind, number>>;
  /** Scale candidates the clean stage found (a test square drawn as line work). */
  scaleHints: ScaleCandidate[];
  /** extract's scale candidates merged with `scaleHints`, best first — what the scale step offers. */
  scale: ScaleCandidate[];
  curveTexts: CurveText[];
  previews: CleanPreview[];
  /** Detector notes for the error report (lines protected as walls, pages skipped). */
  notes: string[];
};

/** A8 8b: the sheet-wide pass after assembly (sheet frame). */
export type SheetClean = {
  items: (Omit<MaskItem, 'paths' | 'texts'> & { pages: { file: FileId; page: PageIndex }[] })[];
  summary: Partial<Record<BackgroundKind, number>>;
  /** Masked lines by kind for the sheet view, sheet frame (every applied 8a + 8b mask). */
  masked: { kind: BackgroundKind; lines: Float32Array[] }[];
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 12. Card-side consumption (F6b) — the manifest-aware paths of existing functions
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Per parsed file, what the card may trust without guessing. */
export type TrustedSheet = {
  fileIndex: number;
  manifest: ConversionManifest;
  /** block (ci) → size token. Replaces deriveBlockSizes for these blocks. */
  sizeByBlock: ReadonlyMap<string, string>;
  /** identity (ci) → pair sibling identity (ci). */
  pairOf: ReadonlyMap<string, string>;
  unfolded: ReadonlySet<string>;
  /** cut layer is final: allowance measurement is replaced by this number (cm, for the engine). */
  cutAllowanceCm: number;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 13. Tolerances and thresholds (single source; the prose repeats them with the reasons)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const PATIMPORT = {
  sagittaMm: 0.05,
  ptToMm: 25.4 / 72,
  scaleWarnRatio: 0.003,
  registrationStepMm: 0.1,
  registrationMinPeakRatio: 3,
  registrationMaxResidualMm: 0.3,
  joinGapMm: 3,
  joinAngleDeg: 15,
  joinLateralMm: 0.15,
  motifQuantMm: 0.25,
  fillCellMm: 0.5,
  snapMm: 0.3,
  minPieceAreaMm2: 400, // = MIN_PIECE_AREA_CM2
  notchMinMm: 2,
  notchMaxMm: 8,
  notchMinAngleDeg: 45,
  defaultAllowanceMm: 10,
  coverageWarn: 0.98,
  coverageBlock: 0.95,
  hausdorffP95VectorMm: 0.3,
  hausdorffP95RasterMm: 0.5,
  hausdorffMaxMm: 1.0,
  overviewBboxTolMm: 1,
  overviewBboxTolRatio: 0.01,
  pairAreaTol: 0.001,
  pairBboxTolMm: 0.1,
  /** G12 (F14b): symmetric Hausdorff of the mirrored `_L` vs `_R`, mm — the gate's "on the line". */
  pairHausdorffMm: 0.3,
  squareTolMm: 0.1,
  aiAutoAcceptInitial: 0.85,
  manifestLineMax: 200,
  /** Writer preflight (M1): a 999 prologue above this warns in the gate report (G14). */
  manifestPrologueWarnBytes: 48 * 1024,
  /** G3 (M7): a contiguous stretch of source wall off the written line this long blocks. */
  coverageGapMm: 10,
  /**
   * G15 (F14e, Codex R1): a band cut is carried by its drawn tick only where that tick (or the
   * piece's walls) runs along the cut CONTINUOUSLY for at least this share of the cut's length —
   * one contiguous run within `snapMm`, per edge. Corpus: reef's only tick-carried cut (L, rank 3)
   * is 91.1 % on its tick (86.6 mm of 95.25 mm; the 8.5 mm it stops short is what the cut carries).
   */
  derivedAlongMinShare: 0.85,
  // Input guards (M6), checked before anything is read; the worker re-checks.
  maxInputBytes: 150 * 1024 * 1024,
  maxInputFiles: 40,
  maxPdfPages: 200,
  /**
   * Pixels of one raster page / image (C5): the tracer's peak grows ≈ 16 B per pixel — measured
   * 345 MB at 18 MP (`yarn patimport:raster limit`, worker/limits.ts): A1 at 150 dpi, A2 at 200 dpi.
   */
  maxRasterPixels: 18_000_000,
  /**
   * C4: adapter work of one read (adapters/budget.ts) — points emitted + PDF operators + SVG
   * elements visited, all files together. Corpus (10.10): polupalto.pdf, 91 pages, spends 0.74 M
   * (the most of any file), a DXF ≤ 26 k; 8 M ≈ 11 polupaltos ≈ 300 MB of points.
   */
  maxWorkUnits: 8_000_000,
  /** C4: elements one SVG may visit, <use> copies included (≈ 2 µs each: ~1 s at the cap). */
  maxSvgElements: 500_000,
  /** C4: lines of one ASCII DXF (the tag stream is split whole). */
  maxDxfLines: 6_000_000,
  /**
   * G16 (A8 safety net): an internal-layer (8) item shorter than this is a "short stroke". Corpus
   * per block — CLO DXF 0, robe ≤ 26, reef 11, leonie 10, palto 13; the owner's wm M DXF 144–157,
   * wm ×7 493, r4454 66–76 (curve-drawn "2 ДЕТ." inside the pieces — junk, blocked on purpose).
   */
  glyphShortMm: 15,
  /** G16: this many short strokes in one block blocks it. */
  glyphMaxShortPerBlock: 40,
  /** G16: side of the grid cell (absolute, by a stroke's first point) the density is counted in. */
  glyphCellMm: 60,
  /** G16: this many short strokes in one cell blocks (robe/reef/leonie 4, owner 16–20, r4454 16). */
  glyphMaxShortPerCell: 10,
  /**
   * G20 (A2): a closed layer-8 contour of another shape (≤ 45 % of the cut's area) from this area is
   * a piece drawn inside the block (wm's collar inside the back, 160 cm²). Corpus negatives: CLO
   * blazer pocket welt 41 cm², the SVG smoke's placement box 66 cm², reef / kombinezon ≤ 10 cm².
   */
  nestedPieceMinMm2: 10000,
  /** G18: a grain end / line this close to a short internal stroke is "touching" it, mm. */
  grainStrokeNearMm: 2,
} as const;
