// PAPER DOLL — level 0 of the 3D wave (tmp/plans/assembly-3d-doll/01-DESIGN-L0.md §3).
//
// The pattern's pieces, meshed on their seam lines, wrapped around a body proxy DERIVED FROM THE
// PATTERN (no mannequin) and pulled shut along the seam graph by a constraint solver (paper: keeps
// lengths, no gravity, no fabric). What it answers: does the seam graph close into a garment, which
// seams stay open, which pieces float, which joins the graph is missing. What it never answers: fit,
// drape, ease over a body. The shape is approximate; no number is ever read from it.
//
// Pure TS, no DOM, no React: the solver runs in a worker (worker/doll.worker.ts) and in node probes
// (scripts/doll/*). The main thread imports ONLY this file.

import type { EdgeId, SeamCandidate, SeamGraph, SkeletonFacts } from 'lib/assembly-skeleton/types';
import type { SizePieces } from 'lib/seams/transfer';
import type { StoredSeam } from 'lib/seams/types';

import type { DeclaredJoin } from './joins';

export type Vec3 = [number, number, number];

export type DollOptions = {
  /** Interior mesh step, mm; default adaptive (≈ 7 000 vertices for the whole garment). */
  gridMm?: number;
  /** Target vertex count when gridMm is not given (default 2 200). */
  targetVertices?: number;
  /** Propose inter-group joins (cap ↔ armhole, stand ↔ neckline …) from free loops. Default true. */
  proposeComposite?: boolean;
  /** Lining pieces are listed, not solved, unless this is set (design §8 q5). Default false. */
  lining?: boolean;
  /** Cap of solver passes before the settle check (determinism + time budget). Default 1800. */
  maxPasses?: number;
  /** Extra passes the settle loop may spend until travel < 1.5 mm per 20 passes. Default 2400. */
  settlePasses?: number;
  /** Seams to leave out (edge-id pairs `a~b`) — the negative control of the probe uses it. */
  dropSeams?: string[];
  /** Extra lines in `warnings` (charts, loops) for probes. */
  debug?: boolean;
  /**
   * Declared joins (the technologist's order, or the skeleton's units): which pieces must be sewn
   * together. A join the graph has no seam for is searched for between those pieces only and
   * proposed «from the technologist's order». See joins.ts (joinsFromOps).
   */
  joins?: DeclaredJoin[];
  /** Call every ~20 passes with the current positions (the worker posts frames from it). */
  onFrame?: (positions: Float32Array, pass: number) => void;
  /**
   * Called once, after meshing and before the first pass: the panels' topology (vertex ranges and
   * triangles), so a view can draw the frames of the doll closing before the report arrives.
   */
  onMesh?: (mesh: DollMesh) => void;
  /**
   * L4 — seams stored on the card (lib/seams rows). With rows the doll re-reads the graph from
   * `facts` with them resolved for `size` (lib/seams resolveAcrossSizes; `sizes` = other sizes'
   * pieces when the rows were confirmed on another size): confirmed seams are FORCED (never released
   * as a wrong pairing — one that cannot close is reported as a contradiction), rejected pairs are
   * never proposed, closures are drawn overlapped at the button line, a confirmed seam onto a
   * collar unit gives the neck path (tucks / pleats on it folded), a strip sewn by a confirmed seam
   * onto the top of the body is the waistband ring. No rows → the doll exactly as before.
   */
  seams?: { rows: readonly StoredSeam[]; size: string; sizes?: readonly SizePieces[] };
  /** The card's gender (front closure: left over right for men, the default; right over left for women). */
  gender?: 'MALE' | 'FEMALE' | null;
};

export type DollInput = {
  /** The seam graph every other reader uses (pipeline.readSeamGraph). */
  graph: SeamGraph;
  /** Card facts: piece names → roles (roles.json), cloth, multiplicity. */
  facts: SkeletonFacts;
  options?: DollOptions;
};

/** Wrap group: the pieces that become one tube / ring around one proxy primitive. */
export type DollGroupId =
  | 'BODY'
  | 'SLEEVE_L'
  | 'SLEEVE_R'
  | 'STAND'
  | 'COLLAR'
  | 'CUFF_L'
  | 'CUFF_R'
  | 'WAISTBAND'
  | 'HEMBAND'
  | 'HOOD'
  | 'LEG_L'
  | 'LEG_R'
  | 'FLOAT';

export type DollPanel = {
  pieceKey: string;
  instance: 0 | 1;
  mirrored: boolean;
  group: DollGroupId;
  /** Vertex offset of this panel in `DollReport.positions` (vertex index, not float index). */
  offset: number;
  count: number;
  /** Triangles, LOCAL vertex ids (0..count-1), wound so the normal points out of the garment. */
  tris: Uint32Array;
  /** Pattern coordinates of every vertex, mm, the piece's own frame (PieceGeom.rs) — for POM lift. */
  uv: Float32Array;
  /** Local vertex ids along the contour, in `rs` order (CCW in the pattern). */
  boundary: Uint32Array;
  /** Other pieces drawn as layers of this one (identical collar / yoke layers): «×n». */
  layers: string[];
};

export type DollSeamState = 'closed' | 'eased' | 'stretched' | 'open' | 'twisted' | 'proposed';

export type DollSeamReport = {
  /** `a~b` edge ids as in the graph, or the proposal's sides. */
  id: string;
  a: EdgeId[];
  b: EdgeId[];
  kind:
    | SeamCandidate['kind']
    | 'proposed-composite'
    | 'proposed-closure'
    | 'facing-free'
    /** Proposed from the technologist's order: a declared join the graph had no seam for. */
    | 'from-order';
  origin: 'graph' | 'doll-proposed' | 'layer';
  lenA: number;
  lenB: number;
  residualMeanMm: number;
  residualMaxMm: number;
  /** 95th percentile of the point gaps — what "closed" is judged on (one lagging corner point is not an open seam). */
  residualP95Mm: number;
  /** Largest strain of the cloth within 20 mm of the seam, % (paper should stay ≤ 3). */
  stretchPct: number;
  twisted: boolean;
  state: DollSeamState;
  /** Released by the solver because it could only close by tearing the paper. */
  released?: boolean;
  /** L4 (rows given): who says this seam exists — confirmed by a person (stored row), proposed by the
   *  doll, or read by the engine and not decided. Absent without rows. */
  decidedBy?: 'person' | 'doll' | 'engine';
  /** In words, with millimetres. */
  note: string;
  /** Global vertex ids of side A / side B polylines (for drawing). */
  pathA: Uint32Array;
  pathB: Uint32Array;
};

export type DollLoop = {
  group: DollGroupId;
  /** neck · armhole-L · armhole-R · hem · cap · wrist · top · bottom · opening · other */
  label: string;
  lenMm: number;
  closed: boolean;
  /** Global vertex ids in walk order. */
  path: Uint32Array;
};

export type DollProxy = {
  group: DollGroupId;
  kind: 'torso' | 'capsule' | 'ring';
  /** torso: [yMm, a, b] semi-axes per level; capsule/ring: [along, radius]. */
  profile: [number, number, number][];
  /** Capsule / ring frame: origin + axis (unit) — torso is the vertical y axis at x = z = 0. */
  origin?: Vec3;
  axis?: Vec3;
};

export type DollReport = {
  panels: DollPanel[];
  /** All vertices, mm, y up, the doll faces +z; the doll's LEFT is +x. */
  positions: Float32Array;
  seams: DollSeamReport[];
  loops: DollLoop[];
  floating: { pieceKey: string; reason: string }[];
  /** Pieces not drawn (lining, interfacing, surface pieces without a placement mark …). */
  skipped: { pieceKey: string; reason: string }[];
  proxies: DollProxy[];
  stats: {
    vertices: number;
    triangles: number;
    passes: number;
    ms: number;
    msMesh: number;
    msSolve: number;
    converged: boolean;
    nan: number;
    /** 99th percentile and max strain of all cloth edges, %. */
    stretchP99Pct: number;
    stretchMaxPct: number;
  };
  /** Words, never bare numbers. */
  warnings: string[];
  /** Seams proposed from declared joins (the technologist's order), with the join they serve. */
  orderJoins: { join: string; seam: string; note: string }[];
  /** Declared join parts sewn onto a panel's face (flap, welt, patch): no edge seam to draw. */
  orderSurface: { join: string; part: string[] }[];
  /** The neck path and the units sewn onto it (stand, fall, one-piece collar) — 04-COLLAR.md. */
  collar?: DollCollarReport;
  /** The honesty line every view carries. */
  honesty: string;
  /** L4 only: confirmed seams that cannot be what they say, in words (never silently dropped). */
  contradictions?: string[];
  /** L4 only: closures drawn overlapped at the button line. */
  closures?: DollClosureReport[];
  /** L4 only: the stored rows as resolved for this size (stale / orphan in words). */
  rows?: {
    applied: number;
    confirmed: number;
    rejected: number;
    closures: number;
    words: string[];
  };
};

/** A front closure drawn buttoned: the two centre-front lines on top of each other. */
export type DollClosureReport = {
  id: string;
  /** The piece on top (left for men, right for women) and the one under it. */
  top: string;
  under: string;
  /** Centre-front line in from each closure edge, mm, and where that came from. */
  offTopMm: number;
  offUnderMm: number;
  how: string;
  /** Distance between the two centre-front lines after solving (p95), mm. */
  cfGapP95Mm: number;
  /** How far the two closure edges cross over each other, mm (≈ offTop + offUnder). */
  overlapMm: number;
  /** Share of the top's overlap zone lying outside the under piece, %. */
  outsidePct: number;
  ok: boolean;
};

export type DollCollarUnit = {
  /** Drawn pieces of the unit. */
  keys: string[];
  /** stand: on the neck path, standing · fall: on the stand top, turned down · collar: a one-piece
   *  collar (no separate stand) on the neck path, drawn standing (its roll line is not modelled). */
  role: 'stand' | 'fall' | 'collar';
  base: 'neck path' | 'stand top';
  /** Seam id in `DollReport.seams`; null when the graph already sews the unit (not proposed). */
  seam: string | null;
  /** proposed: by the doll onto its base · graph: the pattern sews it to the base · stacked: sewn
   *  by the graph to another collar unit that is on the base (K4) · not sewn: base far off. */
  attached: 'proposed' | 'graph' | 'stacked' | 'not sewn' | 'confirmed';
  /** Length of the unit's edge that is sewn (between its anchor marks), mm. */
  sewnMm: number;
  /** Length of the base it is sewn onto, mm. */
  baseMm: number;
  /** sewn / base. */
  ease: number;
  /** Unsewn length of the edge beyond the anchor marks (button extensions), mm. */
  extMm: number;
  /** Anchors in words (CB by notch / middle, SNP, CF by notches / ends). */
  anchors: string;
  /** L4: tucks / pleats folded on the base before mapping (mm each), and what the base was. */
  folds?: number[];
  /** Layer order outward on a shared base (stacked units, K4): 0 = innermost. */
  layer: number;
  /** Fall only: mean height of the outer free edge vs mean height of the stand top it hangs from,
   *  and the share of its free vertices (all but the sewn neck edge, which lies on the stand top)
   *  outside the stand surface. */
  outerYMm?: number;
  baseYMm?: number;
  outsidePct?: number;
};

export type DollCollarReport = {
  neck: {
    lenMm: number;
    closed: boolean;
    /** The garment's own girth at the armholes (pattern), mm. */
    chestMm: number;
    ratio: number;
    /** Front extension cut off at each end (corner → CF notch), mm. */
    extMm: [number, number];
    /** Found by the K1 walk (true) or the closed-loop fallback after the sanity check failed. */
    ok: boolean;
    how: string;
  } | null;
  units: DollCollarUnit[];
  notes: string[];
};

/** Topology of the panels before solving: what `onFrame` positions are laid on. */
export type DollMesh = {
  vertices: number;
  panels: {
    pieceKey: string;
    group: DollGroupId;
    offset: number;
    count: number;
    tris: Uint32Array;
  }[];
};

/** A measure line in pattern space (POM engine, lib/pom) → 3D polyline on the doll. */
export type DollMeasureLine = { pieceKey: string; instance?: 0 | 1; pts: [number, number][] };
