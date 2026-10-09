// Assembly skeleton — the shared contract of the wave (01-PLAN.md §1). Pure TS: no React, no
// imports from components/**, so the same code runs in a worker and in a node probe.
//
// Pipeline: PieceDTO[] (base size) + card facts → PieceGeom[] (geometry/) → SeamGraph →
// SkeletonProposal (skeleton/) → OperationsField; UnionLayout (union/) draws a unit's pictogram.
// Units inside: millimetres. PieceDTO is in centimetres — convert at the geometry boundary.

import type { PieceDTO } from 'lib/nesting/types';

export type Mm = number;
export type Pt2 = [number, number];

// Same literals as PieceClothState in tech-card/components/piece-cloth.ts; restated here so lib/**
// does not import components/**. A card-side PieceClothState is assignable to it.
export type ClothState =
  | 'unbound'
  | 'unsorted'
  | 'main'
  | 'contrast'
  | 'lining'
  | 'pocketing'
  | 'mesh'
  | 'interfacing'
  | 'insulation'
  | 'other';

export type Hand = 'L' | 'R' | null;

// ── Input ───────────────────────────────────────────────────────────────────────────────────

/** One card piece as the skeleton sees it: geometry (base size) + what the card knows about it. */
export type SkeletonPieceInput = {
  /** Card piece key (lineKey) — the id every step input refers to. */
  pieceKey: string;
  name: string;
  piece: PieceDTO;
  piecesPerGarment: number;
  /** Card cut symmetry: MIRRORED / FOLD / IDENTICAL / … as the card stores it, or null. */
  cutSymmetry: string | null;
  cloth: ClothState | null;
  /** Fused with interfacing (manifest `fused` or a BOM interlining row bound to it). */
  fused: boolean;
};

/** BOM trims that decide closures and finishing steps (§G); counts, not article ids. */
export type SkeletonBomFacts = {
  zipper: number;
  buttons: number;
  snaps: number;
  tape: number;
  elastic: number;
  drawcord: number;
  interlining: number;
};

export type SkeletonCategory = 'tee' | 'sweat' | 'trousers' | 'shirt' | 'jacket-lined' | 'generic';

export type SkeletonFacts = {
  pieces: SkeletonPieceInput[];
  category: SkeletonCategory;
  bom: SkeletonBomFacts;
  /** Default machine of the card's profile; the draft falls back to 'lockstitch'. */
  defaultMachineType: string | null;
};

// ── Geometry (lane A) ───────────────────────────────────────────────────────────────────────

export type EdgeId = string; // `${pieceKey}#${k}`

export type Edge = {
  id: EdgeId;
  pieceKey: string;
  k: number;
  /** Start / end indices into the piece's resample `rs` (end may wrap past the seam of the ring). */
  s: number;
  e: number;
  pts: Pt2[];
  lenMm: Mm;
  chordMm: Mm;
  /** Signed total turn along the edge, degrees: + convex, − concave (CCW contour). */
  turnDeg: number;
  /** Notch positions measured from the edge start, mm. */
  notchesMm: Mm[];
  /** chain = two neighbouring edges joined across a soft corner. */
  kind: 'edge' | 'chain';
};

export type PieceGeom = {
  pieceKey: string;
  name: string;
  hand: Hand;
  cloth: ClothState | null;
  /** Contour resampled at SKELETON.resampleMm, mm, CCW. */
  rs: Pt2[];
  corners: number[];
  notchIdx: number[];
  edges: Edge[];
  rect: boolean;
  areaMm2: number;
  perimMm: Mm;
  twinOf: { key: string; kind: 'mirror' | 'identical' }[];
};

export type SeamEvidence = {
  dLenMm: Mm;
  relLen: number;
  notchScore: 0 | 0.3 | 0.7 | 1 | null;
  curvature: 'complementary' | 'both-convex' | 'flat';
  hand: 'same' | 'neutral' | 'cross';
  twin: 'none' | 'mirror' | 'identical';
  self: boolean;
  /** Which §G rule decided it, in words (shown to the technologist). */
  rule?: string;
  /** Lengths of the two edges, mm — lets the screen say «518 = 518 mm». Optional (lane D reads). */
  aLenMm?: Mm;
  bLenMm?: Mm;
  /** Notches that matched along the pair. Optional (lane D reads). */
  notchesMatched?: number;
};

export type SeamCandidate = {
  a: EdgeId;
  b: EdgeId;
  score: number;
  evidence: SeamEvidence;
  kind: 'edge' | 'partial' | 'composite' | 'surface' | 'closure-not-seam';
  /**
   * Composite side (A4): every edge of the glued run, in walk order, across pieces. `a` / `b` is
   * then the run's longest part — the edge a pictogram hangs the other side on.
   */
  aParts?: EdgeId[];
  bParts?: EdgeId[];
  /** Alternatives within SKELETON.ambiguity of this score. */
  ambiguousWith?: SeamCandidate[];
};

export type SeamGraph = {
  pieces: PieceGeom[];
  chosen: SeamCandidate[];
  rejected: SeamCandidate[];
  /** Connected components by pieceKey. */
  components: string[][];
  warnings: string[];
};

// ── Skeleton (lane B) ───────────────────────────────────────────────────────────────────────

export type SkeletonOperationType = 'MACHINE' | 'PRESS' | 'PRESS_OPEN' | 'FUSING' | 'HANDWORK';

export type SkeletonStep = {
  /** Piece lineKeys or earlier steps' outputUnitKey, in order. */
  inputs: string[];
  outputUnitKey: string;
  outputUnitName: string;
  operationType: SkeletonOperationType;
  machineType?: string;
  zone: string;
  seams: SeamCandidate[];
  /** 0..1 — shown as words, never as a bare number. */
  confidence: number;
  reason: string;
  source: 'geometry' | 'template' | 'bom' | 'ai';
  /** Alternative input sets for an ambiguous join; the first entry of `inputs` wins by default. */
  alternatives?: { inputs: string[]; seams: SeamCandidate[]; reason: string }[];
  /** What the step does, in words («Join shoulders», «Press seams open») — the row's title in D2. */
  label?: string;
};

export type SkeletonProposal = {
  steps: SkeletonStep[];
  unresolved: SeamCandidate[];
  /** Template id the order came from (skeleton/templates/<id>.json). */
  template: string;
  warnings: string[];
  /** The seam graph the proposal was read from — pieces' geometry and seams for the pictograms. */
  graph?: SeamGraph;
};

/** Shell and lining are two parallel subtrees (§G); a piece is lining when its cloth is. */
export type SkeletonTree = 'shell' | 'lining';

/**
 * A unit as `groupUnits` (B1) sees it: one join that turns its inputs into a named unit before the
 * body is assembled (layers, panels, plackets on fronts …). `key` is provisional (`~u1`) until
 * `buildSkeleton` swaps it for a unit code; lane A's composite pass (A4) reads `pieceKeys`.
 */
export type SkeletonUnit = {
  key: string;
  name: string;
  /** Piece keys or earlier units' provisional keys. */
  inputs: string[];
  /** Leaf pieces of the unit, in card order. */
  pieceKeys: string[];
  /** Role ids from skeleton/templates/roles.json; the first one is the unit's own. */
  roles: string[];
  hand: Hand;
  tree: SkeletonTree;
  kind: 'fuse' | 'layers' | 'panel' | 'merge' | 'wrap' | 'attach' | 'geometry';
  seams: SeamCandidate[];
  confidence: number;
  reason: string;
  source: 'geometry' | 'template';
  alternatives?: { inputs: string[]; seams: SeamCandidate[]; reason: string }[];
};

/** The draft card a zone is inferred on: pieces + the steps built so far (unit keys provisional). */
export type SkeletonDraftCard = {
  pieces: { lineKey: string; name: string }[];
  steps: SkeletonStep[];
};

/** Step shape of the frontier sweep (assembly-frontier.ts `AssemblyStep`), restated for lib/**. */
export type SkeletonCheckStep = {
  inputs: { kind: 'piece' | 'unit'; key: string }[];
  outputUnitKey: string;
  outputUnitName: string;
};

export type SkeletonViolation = { rule: number; detail: string; step: number; message: string };

/**
 * What `buildSkeleton` borrows from the tech-card components. Injected, because lib/** must not
 * import components/**; the composed instance lives next to them (assembly-skeleton-deps.ts).
 */
export type SkeletonDeps = {
  /** Zone of draft step `index` as a full enum value, or '' when the sources are silent/disagree. */
  zoneOf: (draft: SkeletonDraftCard, index: number) => string;
  /** `suggestUnitCode` of assembly-suggest.ts: `taken` = piece keys + unit codes already given. */
  suggestUnitCode: (zone: string, taken: Set<string>) => string;
  /** `assemblySweep` (rules 1–3, 6, 7) + `assemblyReleaseCheck` (rule 4) of assembly-frontier.ts. */
  checkAssembly: (
    pieces: { lineKey: string; name: string }[],
    steps: SkeletonCheckStep[],
  ) => { violations: SkeletonViolation[]; release: SkeletonViolation[] };
};

/** Switches over the template's own defaults (01-PLAN §2 B2: press steps are switchable). */
export type SkeletonOptions = {
  /** PRESS_OPEN after a seam join. */
  pressOpen?: boolean;
  /** PRESS (flat) after a turned subassembly (collar, cuff, placket …). */
  pressFlat?: boolean;
};

// ── Union pictogram (lane C) ────────────────────────────────────────────────────────────────

/** Affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (SVG matrix order). */
export type Affine = [number, number, number, number, number, number];

export type UnionPlacement = {
  pieceKey: string;
  T: Affine;
  mirrored: boolean;
  attachedVia?: EdgeId;
  /** Placed by approximation (3D / composite join) — drawn «suspended» with «~». */
  approx?: boolean;
};

export type UnionLayout = {
  placements: UnionPlacement[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Identical layers drawn as one shape with «×n». */
  stacked: string[][];
  /** Pieces hung on a 3D / composite join («~»). */
  hung: string[];
  /** Pieces that did not fit without overlap > SKELETON.overlapMax (or have no contour). */
  overflow: string[];
  /** Surface joins (patch pocket, appliqué): drawn ON their host, last. */
  surface?: string[];
  /** Interfacing pieces: never a shape of their own — an underlay of the piece they fuse to. */
  underlay?: string[];
  /** Largest pairwise overlap of the drawn shapes, share of the smaller piece (0..1). */
  overlap?: number;
};

// ── Thresholds ──────────────────────────────────────────────────────────────────────────────
// The values that produced the probe's numbers (00-FEASIBILITY.md §B). Change only with a re-measure.

export const SKELETON = {
  resampleMm: 1,
  cornerDeg: 38,
  cornerWinMm: 6,
  lenAbsMm: 2.5,
  lenRel: 0.015,
  lenRelEased: 0.08,
  notchTolMm: 3,
  minSeamMm: 60,
  twinMirrorPenalty: 0.3,
  selfPenalty: 0.2,
  chainPenalty: 0.05,
  accept: 0.6,
  ambiguity: 0.05,
  overlapMax: 0.15,
} as const;
