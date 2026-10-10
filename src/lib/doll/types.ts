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
  /** Call every ~20 passes with the current positions (the worker posts frames from it). */
  onFrame?: (positions: Float32Array, pass: number) => void;
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
  kind: SeamCandidate['kind'] | 'proposed-composite' | 'proposed-closure' | 'facing-free';
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
  /** The honesty line every view carries. */
  honesty: string;
};

/** A measure line in pattern space (POM engine, lib/pom) → 3D polyline on the doll. */
export type DollMeasureLine = { pieceKey: string; instance?: 0 | 1; pts: [number, number][] };
