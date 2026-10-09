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
};

export type ExtractOpts = {
  /** Flattening sagitta, mm. Default 0.05. */
  sagittaMm: Mm;
  /** Keep filled paths (letters-as-curves). Default true: they are seeds and evidence. */
  keepFills: boolean;
  /** Pages to extract; undefined = all. */
  pages?: PageIndex[];
};

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
  | { kind: 'nesting-order'; rank: number };

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
    | 'bundle-overfull'; // parallel group wider than the size count after splitting
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
  /** Open questions for the operator (legend step); empty when everything was decided. */
  ambiguities: ChainAmbiguity[];
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
export type CardSize = { sizeId: number; name: string; token: string; rank: number };

export type SizeMapEntry = {
  source: SourceSize;
  /** null = this source size is NOT exported (not in the card's run). */
  card: CardSize | null;
  origin: 'auto' | 'operator';
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
  | 'tiny'; // area below MIN_PIECE_AREA

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
  | { kind: 'wall-override'; seed: SeedId; rank: number; use: ChainId; instead: ChainId };

export type ApplyPieceEditsFn = (
  families: PieceFamily[],
  edits: PieceEdit[],
  ctx: { sheet: Sheet; set: ChainSet; run: SizeRun; opts: FillOpts },
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
export type GrainFeature = FeatureBase & { kind: 'grain'; a: PtMm; b: PtMm; angleDeg: Deg };
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
  pieceOverrides: Partial<
    Record<
      SeedId,
      Partial<Pick<PieceSpec, 'allowance' | 'pairHand' | 'unfoldedFold' | 'code' | 'mods'>>
    >
  >;
  operatorGrain: Partial<Record<SeedId, { a: PtMm; b: PtMm }>>;
};

export type SemanticsOutput = {
  pieces: PieceSpec[];
  /** Seeds that cannot be exported yet and why (no grain, offset failed, grammar). */
  blocked: { seed: SeedId; reason: BlockReason; detail: string }[];
  warnings: string[];
};

export type BlockReason =
  | 'no-grain'
  | 'offset-hull'
  | 'offset-self-intersection'
  | 'offset-topology'
  | 'leak'
  | 'non-monotone'
  | 'grammar'
  | 'duplicate-identity'
  | 'size-unmapped';

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
};

export type FabricAssignment = {
  /** purpose → seeds; a seed may be in several purposes. */
  byPurpose: Record<FabricPurposeKey, SeedId[]>;
  /** Interlining exists in BOM → its own DXF; else these seeds get `fused`. */
  interliningInBom: boolean;
  proposals: FabricProposal[];
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
};

export type DraftPiece = {
  /** Client-minted ULID, same contract as pieces.N.lineKey. */
  lineKey: string;
  name: string;
  piecesPerGarment: number;
  /** Always IDENTICAL_CUT_SYMMETRY (06-SYNTHESIS): both hands / the unfolded piece are drawn. */
  cutSymmetry: string;
  grainline: string;
  fused: boolean;
  /** Reuse of an existing card piece instead of creating one. */
  existingLineKey: string | null;
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
  cutSymmetry: string;
  /** Shown to the operator: why an explicit MIRRORED/FOLD became IDENTICAL. */
  reason: string;
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

export type ApplyResult =
  | { ok: true; uploaded: { scopeKey: string; url: string; filename: string; sizeBytes: number }[] }
  | { ok: false; failedScope: string; message: string; uploaded: [] };

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
};

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
  | 'G13-manifest';

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

export type GateReport = { passed: boolean; checks: GateCheck[]; durationMs: number };

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
  /** Walls per block for G3/G4. */
  wallsByBlock: Record<string, PtMm[][]>;
  overview?: Record<PieceKey, BoxMm>;
  /** Vector sources use 0.3; raster 0.5 (mm). */
  hausdorffP95Mm: Mm;
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

/** One numbered region on the Set-of-Mark render. */
export type SomMark = {
  mark: number;
  seed: SeedId;
  bboxMm: [Mm, Mm, Mm, Mm];
  areaMm2: Mm2;
  textInside: string[];
  textNear: string[];
  /** "2 дет." / "cut 2" parsed from text, if any. */
  cutQtyHint: number | null;
  sizeCount: number;
  /** Chirality hint from geometry when a mirrored twin exists on the sheet. */
  mirrorTwinMark: number | null;
};

export type SuggestPatternPiecesInput = {
  techCardId: number;
  /** Media ids of the uploaded renders: the whole sheet with marks and one crop per mark. */
  sheetMediaId: number;
  crops: { mark: number; mediaId: number }[];
  marks: SomMark[];
  sizeRun: string[];
  bomFabrics: { purpose: FabricPurposeKey; name: string }[];
  /** Languages seen in the text ('ru','de','en',…) — prompt hint only. */
  languages: string[];
  variantLabels: string[];
  algoRev: string;
  force: boolean;
};

export type PieceSuggestion = {
  mark: number;
  code: string;
  mods: string[];
  displayName: string;
  fabrics: FabricPurposeKey[];
  cutQty: number | null;
  onFold: boolean;
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
};

/** Deterministic evidence the client computes and combines with the model (Codex C10). */
export type NameEvidence =
  | { kind: 'text-synonym'; text: string; code: string; weight: number }
  | { kind: 'cut-qty'; qty: number; weight: number }
  | { kind: 'chirality'; hand: PairHand; weight: number }
  | { kind: 'cut-layout'; fabric: FabricPurposeKey; weight: number }
  | { kind: 'grammar-ok'; weight: number }
  | { kind: 'unique'; weight: number }
  | { kind: 'collides-existing'; name: string; weight: number };

export type NameDecision = {
  seed: SeedId;
  suggestion: PieceSuggestion | null;
  evidence: NameEvidence[];
  /** Combined confidence, 0..1 (see 08-CONTRACT §9). */
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
  ctx: { existingPieceNames: string[]; threshold: number },
) => NameDecision[];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 11. Worker protocol and wizard session
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type StageName =
  | 'extract'
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
    };
  };
  scale: { in: { decision: ScaleDecision }; out: { applied: ScaleDecision } };
  assemble: {
    in: { sheet: number; override?: GridOverride };
    out: {
      sheet: Omit<Sheet, 'paths' | 'texts' | 'rasters' | 'styles'>;
      previewPaths: Float32Array[];
    };
  };
  chains: {
    in: { opts: ChainOpts; legend?: Parameters<ApplyLegendFn>[1] };
    out: {
      classes: LineClass[];
      bundles: Bundle[];
      orphans: ChainId[];
      chainPreview: Float32Array[];
      warnings: string[];
    };
  };
  sizes: {
    in: { card: CardSize[]; operatorMap?: SizeMapEntry[] };
    out: { run: SizeRun; map: SizeMap };
  };
  pieces: {
    in: { seeds?: Seed[]; edits: PieceEdit[]; opts: FillOpts };
    out: { seeds: Seed[]; families: PieceFamily[] };
  };
  semantics: {
    in: Omit<SemanticsInput, 'sheet' | 'set' | 'run' | 'sizeMap' | 'families'>;
    out: SemanticsOutput;
  };
  fabrics: { in: { bom: DraftScopeTarget[] }; out: FabricAssignment };
  'render-som': {
    in: { seeds: SeedId[]; dpi: number };
    out: { sheetPng: Blob; crops: { seed: SeedId; mark: number; png: Blob }[]; marks: SomMark[] };
  };
  write: {
    in: {
      scopes: DraftScopeTarget[];
      assignment: FabricAssignment;
      sizes: ManifestSize[];
      dialect: WriteJob['dialect'];
      generator: string;
    };
    out: { scopes: DraftScope[]; gate: Record<string, GateReport> };
  };
};

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
  | { type: 'error'; id: number; stage?: StageName; message: string }
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
  | { type: 'scale'; decision: ScaleDecision }
  | { type: 'sheet'; sheet: number; override?: GridOverride }
  | { type: 'legend'; edits: Parameters<ApplyLegendFn>[1] }
  | { type: 'size-map'; entries: SizeMapEntry[] }
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
  squareTolMm: 0.1,
  aiAutoAcceptInitial: 0.85,
  manifestLineMax: 200,
} as const;
