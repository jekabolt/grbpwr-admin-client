// Types private to the DXF adapter (F8). The contract types live in ../../types.ts; these are the
// side-channel the DXF fast path needs (see 08-CONTRACT addition proposed in reports/F8.md).

import type {
  Affine,
  AllowanceDecision,
  BoxMm,
  Feature,
  PathId,
  PieceCandidate,
  PtMm,
  SourceDoc,
  TextId,
} from '../../types';
import type { DecodedLabel } from './text';

export type DxfDialect =
  | 'grbpwr' // our writer (manifest present)
  | 'clo-r2000' // CLO-DXF R2000: LWPOLYLINE, no labels, name+size only in the block name
  | 'clo-aama-r12' // CLO-AAMA R12: POLYLINE/POINT, AAMA labels, `<S>` sizes
  | 'clo-aama-gerber' // CLO-AAMA through CLO's Gerber target: plain sizes, decimated L3/L14
  | 'aama' // foreign AAMA/ASTM (Gerber, Optitex, Lectra, Valentina, …): PIECE NAME labels
  | 'generic'; // any other DXF (blocks by name, or loose entities)

export type UnitsSource = 'insunits' | 'units-text' | 'measurement' | 'guess';

export type TallyRow = {
  type: string;
  /** Records of this type in BLOCKS + ENTITIES, counted while parsing the tag stream. */
  in: number;
  /** Records that produced at least one IR element (path / text / raster). */
  rendered: number;
  /** Records consumed as structure (BLOCK/ENDBLK/SEQEND/VERTEX/INSERT/DIMENSION expansion, ATTDEF
   * templates inside a block). */
  structural: number;
  /** Records that produced nothing, each with an explicit reason. */
  dropped: number;
  reasons: Record<string, number>;
  /** IR elements emitted from this type (instances count: a block inserted 3× emits 3×). */
  emittedPaths: number;
  emittedTexts: number;
  emittedRasters: number;
};

export type EntityTally = {
  rows: TallyRow[];
  /** 999 comments inside sections (CLO's font size) — not entities, dropped on purpose. */
  innerComments: number;
  /** in === rendered + structural + dropped for every row, and no reason is 'UNACCOUNTED'. */
  balanced: boolean;
};

/** POINT attributes dxf-parser loses (10-CLO-DXF-FORMAT §2.4-2): CLO writes the notch's inward
 * angle in 50 and its depth in 30. Angle is in PAGE frame after every transform. */
export type DxfPointAttrs = {
  path: PathId;
  at: PtMm;
  angleDeg: number | null;
  /** code 30 × units (CLO: notch depth, mm). */
  z: number;
  thickness: number;
  layer: string;
};

/** One top-level INSERT instance (= one piece × size in a garment DXF), or the loose model-space
 * entities. */
export type DxfGroup = {
  index: number;
  kind: 'insert' | 'loose';
  /** Top-level block name (null for loose). */
  block: string | null;
  insertOp: number | null;
  insertHandle?: string;
  /** Block → page transform of this instance (identity for loose). */
  transform: Affine;
  paths: PathId[];
  texts: TextId[];
};

export type DxfUnits = {
  insunits: number | null;
  mmPerUnit: number;
  source: UnitsSource;
  evidence: string;
};

export type DxfMeta = {
  version: string | null;
  dialect: DxfDialect;
  producer: string | null;
  encoding: string;
  encodingFallback: boolean;
  /** Binary DXF and its group-code width (F17); null = ASCII. */
  binary: 'r12' | 'r13+' | null;
  units: DxfUnits;
  manifest: boolean;
  /** Model-space `KEY: value` texts (AAMA header: STYLE NAME, SAMPLE SIZE, UNITS, AUTHOR…). */
  modelLabels: DecodedLabel[];
  groups: DxfGroup[];
  /** Entity type behind each path / text id (index = id). */
  pathEntity: string[];
  textEntity: string[];
  /** ATTRIB tag per text id (when the text came from an ATTRIB). */
  attribTag: Record<TextId, string>;
  points: Record<PathId, DxfPointAttrs>;
  tally: EntityTally;
  extents: BoxMm;
  blockCount: number;
  insertCount: number;
};

export type DxfRead = { doc: SourceDoc; meta: DxfMeta };

// ── segmentation (pre-segmented piece candidates) ────────────────────────────────────────────

/** How layer 1 / 14 relate across sizes (10-CLO-DXF-FORMAT §2.3). */
export type CutMode =
  | 'A' // L1 ungraded (sample cut copied into every size), L14 graded → cut = L14 + allowance
  | 'B' // L1 == L14 (both the graded cut line), seam on L8
  | 'C' // L1 and L14 both graded, L14 inside L1 (AAMA-correct, ours)
  | 'single' // one size only: grading cannot be measured; L1 taken as the cut line
  | 'cut-only' // no seam line anywhere
  | 'seam-only' // only a seam line (rare foreign files) → outward offset downstream
  | 'none'; // no closed contour

export type NotchOn = 'cut' | 'seam' | 'none';

export type DxfNotch = {
  /** On the contour it belongs to. */
  at: PtMm;
  /** Unit vector pointing INTO the piece. */
  dir: PtMm;
  depthMm: number;
  angleDeg: number;
  on: NotchOn;
  /** Distance from `at` to that contour, mm. */
  distMm: number;
  source: 'line' | 'point' | 'derived';
  /** Every source path folded into this logical notch (twins and duplicates included). */
  paths: PathId[];
  /** For `derived` notches: the sample-size notch it was transferred from. */
  from?: { group: number; path: PathId; method: 'corner' | 'arc-length' };
};

export type DxfGrain = {
  a: PtMm;
  b: PtMm;
  angleDeg: number;
  form: 'clo-arrow' | 'axis' | 'longest-segment';
  /** true when the drawing fixes the direction (CLO arrow); a bare LINE is an axis only. */
  directed: boolean;
  path: PathId;
  /** Other grain-layer paths in the block (shown, not used). */
  others: PathId[];
};

export type DxfLabels = {
  pieceName: string | null;
  size: string | null;
  quantity: number | null;
  material: string | null;
  category: string | null;
  annotation: string[];
  description: string | null;
  other: DecodedLabel[];
  /** Ids of the texts the labels were read from. */
  texts: TextId[];
};

export type PathRole =
  | 'cut'
  | 'cut-extra' // closed cut-layer loop that is not the outer contour and not inside it
  | 'hole' // closed loop inside the outer contour (cut layer or layer 11)
  | 'seam'
  | 'seam-extra'
  | 'grain'
  | 'notch'
  | 'drill'
  | 'internal'
  | 'fold' // AAMA layer 6 mirror line
  | 'grade-point' // AAMA L2 turn / L3 curve point
  | 'qv-copy' // ASTM quality-validation layers 84–87
  | 'other';

export type DxfContour = {
  paths: PathId[];
  pts: PtMm[];
  areaMm2: number;
  signedAreaMm2: number;
  bbox: BoxMm;
  layer: string;
};

export type DxfBlockPiece = {
  group: number;
  block: string;
  /** Identity as the converter will name it (block name minus size, or PIECE NAME). */
  identity: string;
  identitySource: 'label' | 'block-name';
  /** Size as written (`<S>`), decoration-stripped upper-case token (`S`), '' when none. */
  sizeRaw: string;
  size: string;
  sizeSource: 'label' | 'block-name' | 'none';
  /** UNI token in the name: the author declared the piece ungraded. */
  uni: boolean;
  labels: DxfLabels;
  cut: DxfContour | null;
  seam: DxfContour | null;
  seamSource: 'L14' | 'L8-loop' | 'L8-chain' | null;
  /** L1 and L14 are the same contour (mode B marker). */
  cutEqualsSeam: boolean;
  /** Median distance seam → cut over seam vertices, mm (the allowance as drawn). */
  seamToCutMm: number | null;
  grain: DxfGrain | null;
  notches: DxfNotch[];
  notchStats: { raw: number; exactDuplicates: number; twins: number; derived: number };
  drills: { at: PtMm; path: PathId; form: 'square' | 'circle' | 'point' }[];
  roles: Record<PathId, PathRole>;
  texts: TextId[];
  gradePoints: { turn: number; curve: number };
  pointNumbers: number;
  annotations: TextId[];
};

export type DxfIdentity = {
  identity: string;
  /** Piece indices (into DxfSegmentation.pieces) by size rank. */
  pieces: number[];
  sizes: string[];
  uni: boolean;
  /** L1 identical across ≥2 sizes while L14 grades (CLO all-sizes export). null = can't tell. */
  layer1Ungraded: boolean | null;
  mode: CutMode;
  hand: 'L' | 'R' | null;
  pairOf: string | null;
  quantity: number | null;
  material: string | null;
  category: string | null;
};

export type DxfPair = {
  left: string;
  right: string;
  /** |area L| / |area R| at the sample (or first common) size. */
  areaRatio: number;
  /** Signed areas have opposite signs (an explicit reflection, as CLO writes hands). */
  mirrored: boolean;
  bboxDeltaMm: number;
  /** Name pair confirmed by geometry: |area| equal ±0.1 %, bbox equal ±0.1 mm (winding is free —
   * CLO is not consistent, our writer normalises it — so `mirrored` is information only). */
  geometryConfirmed: boolean;
};

export type DxfSegmentation = {
  /** Pieces come from blocks: the wizard can skip assemble/chains/pieces (see stages.ts). */
  presegmented: boolean;
  dialect: DxfDialect;
  sizes: { token: string; raw: string[]; rank: number }[];
  sampleSize: { token: string; source: 'text' | 'geometry' } | null;
  mode: CutMode;
  /** Any identity has an ungraded layer 1 (mode A). */
  layer1Ungraded: boolean;
  allowance: AllowanceDecision | null;
  pieces: DxfBlockPiece[];
  identities: DxfIdentity[];
  pairs: DxfPair[];
  warnings: string[];
};

/** A contract PieceCandidate plus what the DXF already knows (features, block, size). Structurally
 * assignable to PieceCandidate, so F5 can take it as-is. */
export type DxfPieceCandidate = PieceCandidate & {
  dxf: {
    block: string;
    group: number;
    identity: string;
    size: string;
    features: Feature[];
    /** The outer contour is L14 (mode A: the true graded line) — cut = outward offset. */
    outerIsSeam: boolean;
  };
};
