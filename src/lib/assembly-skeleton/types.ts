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

export type SkeletonCategory =
  | 'tee'
  | 'sweat'
  | 'hoodie'
  | 'trousers'
  | 'skirt'
  | 'dress'
  | 'jumpsuit'
  | 'shirt'
  | 'jacket-lined'
  | 'coat-lined'
  | 'generic';

/**
 * The order already on the card, for a proposal APPENDED to it: the skeleton is built only over the
 * pieces no existing join has consumed, the existing units still on the table are inputs it may
 * sew on, and its unit codes never collide with the card's.
 */
export type SkeletonExistingOrder = {
  /** The card's steps as they stand (inputs are piece keys or unit codes). */
  steps: SkeletonCheckStep[];
};

export type SkeletonFacts = {
  pieces: SkeletonPieceInput[];
  category: SkeletonCategory;
  bom: SkeletonBomFacts;
  /** Default machine of the card's profile; the draft falls back to 'lockstitch'. */
  defaultMachineType: string | null;
  /** Append mode: the card's own order the proposal continues (absent = a fresh order). */
  existing?: SkeletonExistingOrder;
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
  /** Internal marks of the piece, classified (geometry/marks.ts); seam-line copies left out. */
  marks?: PieceMark[];
};

// ── Internal marks (P2 step 0, 03-P2-DESIGN §2) ─────────────────────────────────────────────
// What the pattern draws INSIDE a piece, read once for the three geometric lanes (surface joins,
// darts, closures). CLO writes the sewing line on layer 8 and Gerber duplicates every internal line
// on L8/L85, so copies of the sewing line, twins and lines parallel to an edge are told apart here
// before anything is called a mark.

export type PieceMarkKind =
  /** A copy of the sewing / cut line (closed, an offset of the contour). Filtered: never returned. */
  | 'seam-copy'
  /** A drill hole: a closed loop ≤ markDrillMaxMm, or a cross of short segments. */
  | 'drill'
  /** A straight open segment 12–40 mm, with end ticks (Gerber) or alone. */
  | 'buttonhole'
  /** A straight line ≥ markFoldMinMm parallel to an edge, ≤ markFoldOffsetMm in. */
  | 'fold'
  /** A line that follows an edge at a constant offset: topstitch, hem, facing turn. */
  | 'parallel'
  /** A path inside, bbox ≥ 40 mm both ways, not fold / parallel: a pocket or part placed on top. */
  | 'placement'
  /** Open, exactly one sharp corner, both ends on the sewing line: a dart — or a vent. */
  | 'vee'
  | 'other';

export type PieceMark = {
  /** `${pieceKey}@${i}` — stable for one piece geometry. */
  id: string;
  kind: PieceMarkKind;
  layer: string;
  closed: boolean;
  /** mm, in the piece's `rs` frame (the same as PieceGeom.rs). */
  pts: Pt2[];
  bbox: { w: Mm; h: Mm; cx: Mm; cy: Mm };
  lenMm: Mm;
  /** vee: the opening at the contour (intake), the depth from it, the apex angle, the edge it opens on. */
  vee?: { intakeMm: Mm; depthMm: Mm; apexDeg: number; edge: EdgeId };
  /**
   * drill / buttonhole / fold / parallel: the nearest edge, the offset from it, the foot along it.
   * Absent when no edge is within the classifier's search reach (66 mm): not «at» an edge.
   */
  nearEdge?: { edge: EdgeId; offsetMm: Mm; alongMm: Mm };
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
   * Surface join (P2 lane S): part `part` laid on host `host` along placement mark `mark`; `T` puts
   * the part's `rs` onto the mark in the host's `rs` frame; `fit` 0..1 of the bbox match.
   */
  surface?: { host: string; part: string; mark: string; T: Affine; fit: number };
  /** Closure (P2 lane Z): what closes this edge and why it is believed. */
  closure?: {
    kind: 'buttons' | 'zip' | 'snaps' | 'unknown';
    evidence: string;
    lengthMm?: Mm;
    open: 'full' | 'to-notch';
    count?: number;
  };
  /**
   * Composite side (A4): every edge of the glued run, in walk order, across pieces. `a` / `b` is
   * then the run's longest part — the edge a pictogram hangs the other side on.
   */
  aParts?: EdgeId[];
  bParts?: EdgeId[];
  /** Alternatives within SKELETON.ambiguity of this score. */
  ambiguousWith?: SeamCandidate[];
  /**
   * A seam a person decided on (stored on the card, resolved by lib/seams): where it came from and
   * who said so. Absent on the engine's own readings.
   */
  provenance?: SeamProvenance;
  /**
   * Sewn sub-range of each side, mm along the run from its start (a partial seam stored with its
   * range). Absent = the whole run.
   */
  range?: { a: [Mm, Mm]; b: [Mm, Mm] };
};

/** Who decided a stored seam, and how its edges were found today. */
export type SeamProvenance = {
  seamKey: string;
  status: 'confirmed' | 'rejected';
  source: 'graph' | 'doll' | 'order' | 'manual' | 'ai';
  direction: 'reversed' | 'same' | 'unknown';
  by: string;
  at: string;
  /**
   * hint = the stored edge id still fits the same contour; shape = found by its shape; topology =
   * carried from the size it was confirmed on by the piece's edge sequence.
   */
  how: 'hint' | 'shape' | 'topology';
};

/** One stored «not this seam»: any candidate meeting both sides is dropped with `rule`. */
export type ExcludedPair = {
  aIds: EdgeId[];
  bIds: EdgeId[];
  rule: string;
  /** A rejected surface join: the part is not laid on the host. */
  surface?: { host: string; part: string };
};

/**
 * Stored seam decisions resolved against today's pieces (lib/seams `resolveSeamDecisions`).
 * `forced` seams are taken before the engine's greedy (their edges out of play), `closures` block
 * their edges, `excluded` pairs are dropped with the person's words, `words` go to the warnings.
 */
export type SeamDecisions = {
  forced: SeamCandidate[];
  closures: SeamCandidate[];
  excluded: ExcludedPair[];
  words: string[];
};

/** Decisions as a value, or resolved against the pieces the graph is about to match. */
export type SeamDecisionsInput = SeamDecisions | ((pieces: readonly PieceGeom[]) => SeamDecisions);

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
  /** The other readings of an ambiguous join (the chosen one is `inputs`), in the decision's order. */
  alternatives?: { inputs: string[]; seams: SeamCandidate[]; reason: string }[];
  /**
   * The ambiguous join as a decision: `id` is stable across rebuilds, `chosen` is the reading this
   * proposal was built with (0 = the engine's own). The readings in their stable order are
   * `alternatives` with `inputs` spliced in at `chosen`. Choosing another reading REBUILDS the whole
   * proposal with `SkeletonOptions.pins` — never patches one step, which would leave the steps after
   * it on the old topology.
   */
  decision?: SkeletonDecision;
  /**
   * Index (in `SkeletonProposal.steps`) of the join this processing / press step follows, set when
   * the step is built. A derived step inherits the join's tick and confidence and is not a decision
   * of its own: unticking the join unticks it.
   */
  derivedFrom?: number;
  /** What the step does, in words («Join shoulders», «Press seams open») — the row's title in D2. */
  label?: string;
  /** A feature sewn on one piece / unit, read off its internal marks (P2 lanes D, Z, S). */
  feature?: {
    kind: 'dart' | 'buttonholes' | 'buttons' | 'zip' | 'vent' | 'surface';
    pieceKey: string;
    count?: number;
    /** PieceMark ids the step stands on. */
    marks: string[];
  };
};

export type SkeletonDecision = { id: string; chosen: number };

/** Pinned readings: decision id → reading index (0 = the engine's own). */
export type SkeletonPins = Readonly<Record<string, number>>;

export type SkeletonProposal = {
  steps: SkeletonStep[];
  unresolved: SeamCandidate[];
  /** Template id the order came from (skeleton/templates/<id>.json). */
  template: string;
  warnings: string[];
  /** The seam graph the proposal was read from — pieces' geometry and seams for the pictograms. */
  graph?: SeamGraph;
  /** Append mode: the card's steps it continues — their units are drawn from the same graph. */
  existing?: SkeletonCheckStep[];
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
  /** Physical copies (a unit of ×2 mirrored blocks is two units): absent = one. */
  mult?: number;
  kind: 'fuse' | 'layers' | 'panel' | 'merge' | 'wrap' | 'attach' | 'geometry';
  seams: SeamCandidate[];
  confidence: number;
  reason: string;
  source: 'geometry' | 'template';
  alternatives?: { inputs: string[]; seams: SeamCandidate[]; reason: string }[];
  decision?: SkeletonDecision;
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
  /** PRESS (flat) after a turned subassembly (collar, cuff, placket …). Off unless asked for. */
  pressFlat?: boolean;
  /** Readings the person chose for ambiguous joins; the proposal is rebuilt around them. */
  pins?: SkeletonPins;
  /** Seams stored on the card (confirmed / rejected / closures), resolved by lib/seams. */
  decisions?: SeamDecisionsInput;
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
  /** Thin lines drawn over a piece's silhouette (dart legs …), per pieceKey, in its `rs` frame. */
  marks?: Record<string, Pt2[][]>;
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
  /**
   * Above this many contoured pieces the proposal is not computed at all: the all-pairs edge pass
   * is O(n²) on the main thread (541 pieces of a marker file took > 5 s). A garment has 10–60.
   */
  maxPieces: 150,

  // ── internal marks (P2 step 0, 03-P2-DESIGN §2) ──
  /** A closed loop is a sewing-line copy when its bbox is the contour's ± 2·offset within this. */
  markSeamCopyTolMm: 4,
  /** Drill: a loop / cross no bigger than this both ways. */
  markDrillMaxMm: 15,
  /** Fold: a straight line at least this long… */
  markFoldMinMm: 150,
  /** …no further than this from the edge it runs along (also the reach of `parallel`). */
  markFoldOffsetMm: 60,
  /** Darts (lane D): intake range at the contour, minimum depth, depth / intake, widest apex. */
  dartIntakeMm: [8, 60] as readonly [number, number],
  dartDepthMin: 40,
  dartDepthRatio: 1.5,
  dartApexDeg: 35,
  /** Surface joins (lane S): bbox tolerance (share of the larger side), part / host area cap. */
  surfaceBboxTol: 0.1,
  surfaceAreaMax: 0.35,
  /** Closures (lane Z): a drill this close to an edge belongs to it (= DRILL_EDGE_MM in match.ts). */
  drillEdgeMm: 40,
} as const;
