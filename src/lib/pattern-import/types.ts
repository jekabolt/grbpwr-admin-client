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
  confidence: number;
  why: string;
};

export type RegistrationMethod = 'recurrence' | 'edge-stitch' | 'grid-label' | 'manual';

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
  /** Pages the grid says exist but no file provides. */
  missing: { row: number; col: number }[];
  /** Overview page, if one was found: its own scale relative to the sheet, for the gate. */
  overview?: { file: FileId; page: PageIndex; factor: number; bbox: BoxMm };
  /** Paths of every tile already in sheet frame and deduplicated across overlaps. */
  paths: IRPath[];
  texts: IRText[];
  rasters: IRRaster[];
  styles: Style[];
  warnings: string[];
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
  | { kind: 'colour-only'; rgb: [number, number, number] };

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

export type ChainSet = {
  chains: Chain[];
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
  edits: { classId: ClassId; role: ChainRole; sizeLabel: string | null }[],
) => ChainSet;

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
  origin: 'text' | 'click' | 'ai';
  /** Text that produced the seed (piece number / name), when origin = 'text'. */
  text?: IRText;
  /** Variant filter the seed belongs to (Mod. 125 / Style A). null = all. */
  variant: string | null;
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
   * AUTO A6 (later phase): 'inferred' = two or more independent sheet evidences agree on n (legend
   * text, nest depth, file count, AI). The size stage treats it like 'operator' (n known, ranks
   * still proven). Not produced yet.
   */
  from: 'source' | 'operator' | 'inferred';
};

/**
 * The sizes step's "sizes drawn on this sheet" question (D1). Asked when the source does not state
 * the count (an unencoded sheet; a DXF whose blocks draw outline and sew line alike); required
 * while `expected` is null. `inferred` = what the lines alone show, offered first as a suggestion,
 * never applied.
 */
export type SizeCountAsk = { inferred: { n: number; why: string } | null };

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
  /** Fill gap when outcome = 'leak': where the outside got in. */
  leakAt?: PtMm;
  /** Features already known at segmentation (DXF fast path: notches, drills, grain). */
  features?: Feature[];
  /**
   * How this rank's walls were chosen (F4): 'class' = the F3 size class of this rank + common;
   * 'innerPlug' = + the smaller ranks' lines (this rank coincides with one where it is not drawn);
   * 'bundleRank' = ranked locally by nesting inside the seed's region (F3 had no usable class);
   * 'single' = one-size source, every line a wall. Absent on DXF fast-path candidates.
   */
  rankFrom?: 'class' | 'innerPlug' | 'bundleRank' | 'single' | 'grade';
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
};

/** F4b outline edges the source does not draw (see `PieceCandidate.derived`); gate G15 audits them. */
export type DerivedEdgeKind = 'bridge' | 'operator-bridge' | 'band-cut';
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
};
export type DrillFeature = FeatureBase & { kind: 'drill'; at: PtMm };
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
  | 'borrowed';
export type GrainFeature = Omit<FeatureBase, 'origin'> & {
  kind: 'grain';
  /**
   * AUTO A1 (later phase): 'proposed' = a grainline the drawing suggests (strip axis, symmetry axis,
   * straight CF/CB edge) with a single evidence: shown as a proposal, accepted only by a click.
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
  /** Owner decision 9: pairs are TWO blocks. `pairOf` names the sibling identity. */
  pairHand: PairHand | null;
  pairOf: PieceKey | null;
  /** Owner decision 8: fold pieces are unfolded; the fold line goes to layer 8. */
  unfoldedFold: boolean;
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
};

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
        >
      >
    >
  >;
  operatorGrain: Partial<Record<SeedId, { a: PtMm; b: PtMm }>>;
  /**
   * D3: per seed, the quantity an AI name auto-accepted at T backs with printed evidence
   * (`cut-qty`) — "cut n" read off the sheet next to the piece. It counts as the sheet's word; a
   * bare model call without that evidence does not.
   */
  aiQuantity?: Partial<Record<SeedId, { qty: number; pair: boolean }>>;
  /**
   * The fold edge the operator picked per seed (E1a): a straight edge of the outline in the rank of
   * that seed's `FoldAsk`; every size unfolds across its own matching edge. "Not a fold" is
   * `pieceOverrides[seed].unfoldedFold = false`.
   */
  operatorFold?: Partial<Record<SeedId, { a: PtMm; b: PtMm }>>;
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
  /** The text label of each text-seeded piece ("22", "Piece 7"), for binding the cutting list. */
  seedLabels?: Partial<Record<SeedId, string>>;
  /** Text of the document's other pages (instructions, cutting list); the session fills it. */
  docTexts?: string[];
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
};

export type SemanticsOutput = {
  pieces: PieceSpec[];
  /** Seeds that cannot be exported yet and why (no grain, offset failed, grammar). */
  blocked: { seed: SeedId; reason: BlockReason; detail: string }[];
  warnings: string[];
  /** Open fold questions, one per seed blocked 'fold-question' (absent = none). */
  folds?: FoldAsk[];
  /** The cutting list's fold pieces are not all unfolded and not yet checked (absent = fine). */
  foldList?: FoldListCheck;
  /**
   * D3 (10.10): what the drawing does not prove. The piece is built as shown, but the export waits
   * for the operator — a per-piece answer (an override), or "confirm as shown" (the wizard keeps
   * those confirmations, keyed by `shown`, so a value that changes asks again).
   */
  unproven: Unproven[];
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
  | 'fold-question';

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
};

export type ProposeFabricsFn = (
  sheet: Sheet,
  families: PieceFamily[],
  bom: DraftScopeTarget[],
) => FabricAssignment;

export type DraftScope = {
  target: DraftScopeTarget;
  filename: string;
  /** Operator display name for the pattern row ('' = unnamed). */
  name: string;
  dxfText: string;
  manifest: ConversionManifest;
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
  /** F14: the manifest's proof that every contour is drawn — both hands of a pair / unfolded fold. */
  symmetryForce?: 'pair' | 'unfolded';
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

export type ApplyUploaded = { scopeKey: string; url: string; filename: string; sizeBytes: number };

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
  sheet: { pages: number; method: RegistrationMethod | 'single'; maxResidualMm: Mm };
  sizeEncoding: SizeEncoding;
  variant: string | null;
};

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
  /** A8: internal-layer length against the outline length (warn). */
  /** A8: a found grainline that stands on lettering strokes (block) or touches one (warn). */
  | 'G18-grain-source';

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
};

export type WriteJob = {
  techCardId: number;
  scope: DraftScopeTarget;
  pieces: PieceSpec[];
  sizes: ManifestSize[];
  source: ManifestSource;
  generator: string;
  /** Which CLO dialect to emit (K2 decides the default; both must read back through our parser). */
  dialect: 'r12' | 'r2000';
};

export type WriteResult = { dxfText: string; manifest: ConversionManifest; warnings: string[] };

export type WriteDxfFn = (job: WriteJob) => WriteResult;
export type EmbedManifestFn = (dxfText: string, manifest: ConversionManifest) => string;
/** null when the text carries no manifest (a foreign DXF); throws on a corrupt one. */
export type ReadManifestFn = (dxfText: string) => ConversionManifest | null;

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
  overview?: Record<PieceKey, BoxMm>;
  /** Vector sources use 0.3; raster 0.5 (mm). */
  hausdorffP95Mm: Mm;
  /** Open fold questions of the run (E1a): G6 blocks the whole file while any is unanswered. */
  openFolds?: readonly string[];
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
    };
  };
  /** A8: the input pages cleaned before anything is parsed (masks, dropped pages, scale hints). */
  clean: { in: CleanInput; out: CleanOutput };
  scale: { in: { decision: ScaleDecision }; out: { applied: ScaleDecision } };
  assemble: {
    in: { sheet: number; override?: GridOverride };
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
    in: { opts: ChainOpts; legend?: Parameters<ApplyLegendFn>[1] };
    out: {
      classes: LineClass[];
      bundles: Bundle[];
      orphans: ChainId[];
      /** One polyline per chain, index = ChainId (an empty array for a chain not drawn). */
      chainPreview: Float32Array[];
      warnings: string[];
      /** What the legend could not decide alone (F3 `ChainSet.ambiguities`), shown as flags. */
      ambiguities?: ChainAmbiguity[];
    };
  };
  sizes: {
    in: {
      card: CardSize[];
      operatorMap?: SizeMapEntry[];
      /** pieces/grade (H1): the operator's answer to "how many sizes are drawn on this sheet". */
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
    };
  };
  pieces: {
    in: { seeds?: Seed[]; edits: PieceEdit[]; opts: FillOpts };
    out: {
      seeds: Seed[];
      families: PieceFamily[];
      /**
       * Models the sheet names ("Style A", "Mod. 125": F4 `variantLabels` over the sheet and the
       * instruction pages), also when no seed carries one — the wizard offers them as the model
       * choice, and the chosen one's cutting lines become knives (FillOpts.variant).
       */
      variants?: string[];
      /**
       * pieces/grade (H1): what the size solver could not decide (kind 'size-count' /
       * 'grade-ambiguous'), and the size count the fill assumed — the refused candidates carry
       * the per-piece reason.
       */
      grade?: { expected: ExpectedSizes | null; ambiguities: ChainAmbiguity[] };
    };
  };
  semantics: {
    in: Omit<
      SemanticsInput,
      'sheet' | 'set' | 'run' | 'sizeMap' | 'families' | 'traced' | 'docTexts' | 'seedLabels'
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
  write: {
    in: {
      /** The card the manifest is written for: the card trusts a manifest only with its own id. */
      techCardId: number;
      scopes: DraftScopeTarget[];
      assignment: FabricAssignment;
      sizes: ManifestSize[];
      dialect: WriteJob['dialect'];
      generator: string;
    };
    out: { scopes: DraftScope[]; gate: Record<string, GateReport> };
  };
};

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
  | { type: 'scale'; decision: ScaleDecision }
  | { type: 'sheet'; sheet: number; override?: GridOverride }
  | { type: 'legend'; edits: Parameters<ApplyLegendFn>[1] }
  | { type: 'size-map'; entries: SizeMapEntry[] }
  /** pieces/grade (H1): the operator's "sizes drawn on this sheet" (null = the card's run). */
  | { type: 'drawn-sizes'; n: number | null }
  | { type: 'variant'; variant: string | null }
  | { type: 'piece-edits'; edits: PieceEdit[] }
  | { type: 'names'; decisions: NameDecision[] }
  | { type: 'semantics'; input: StageIO['semantics']['in'] }
  | { type: 'fabrics'; assignment: FabricAssignment }
  | { type: 'write' }
  | { type: 'apply' }
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

/** A9 hook (the early AI page call, later phase): one evidence each where it is given. Empty today. */
export type CleanAiHints = {
  pages?: { file: FileId; page: PageIndex; role: PageClass; confidence: number }[];
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
  dropped: { file: FileId; page: PageIndex; cls: PageClass; why: string }[];
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
  /** G18: a grain end / line this close to a short internal stroke is "touching" it, mm. */
  grainStrokeNearMm: 2,
} as const;
