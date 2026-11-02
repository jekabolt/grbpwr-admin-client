// Piece folds saved on the tech card (tech_card_piece_fold, backend 0443) — client types.
//
// A fold is one straight line on one piece, applied in `seq` order: a double turn-up is two rows. The
// line lives in the piece's seam frame (lib/seams/frame.ts: grain-upright, bbox = unit square), so it
// survives grading by scale; the optional edge locator (the edge's five samples + the distance from it in
// mm) keeps a hem allowance exact in mm across sizes. The paper doll reads `DollFold` (SPEC-T3).

import type { EdgeId, Pt2 } from 'lib/assembly-skeleton/types';

/** A point in the piece's unit square (the seam frame). */
export type UV = Pt2;

export type FoldKind = 'inward' | 'outward';
export type FoldSource = 'dxf' | 'owner' | 'accepted_hint';

/** What the doll applies (SPEC-T3 contract): per piece key, ordered by seq. */
export type DollFold = { seq: number; a: UV; b: UV; flipAt: UV; kind: FoldKind };

/** The edge the fold runs along: five samples in the seam frame + the fold's distance from it. */
export type FoldEdge = {
  /** The engine's run id when written — a fast path guarded by the contour signature. */
  hint: EdgeId | '';
  samples: UV[];
  /** Distance from the edge's chord, inward, mm (> 0). */
  offsetMm: number;
};

export type StoredFold = {
  foldKey: string;
  pieceKey: string;
  seq: number;
  kind: FoldKind;
  source: FoldSource;
  line: [UV, UV];
  flipAt: UV;
  edge: FoldEdge | null;
  contourSig: string;
  anchoredSize: string;
  note: string;
  /** OUTPUT ONLY — the server's verdict: the piece's source moved since the row was written. */
  stale: boolean;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
};

// ── hints (never saved until the owner accepts one) ─────────────────────────────────────────

/** Where a hint came from: a classified fold mark, an unfolded/mirror line, or a drawn inner line. */
export type FoldHintOrigin = 'mark' | 'unfolded' | 'mirror' | 'inner';

export type FoldHint = {
  /** Stable for one geometry: `${pieceKey}:${origin}:${i}`. */
  id: string;
  pieceKey: string;
  origin: FoldHintOrigin;
  /** strong = the pattern says «fold here»; weak = a cutting axis that MAY be a construction fold. */
  strength: 'strong' | 'weak';
  /** The source the row gets when accepted. */
  source: FoldSource;
  /** mm, the piece's `rs` frame, already extended to the contour. */
  lineMm: [Pt2, Pt2];
  /** The same line in the seam frame. */
  line: [UV, UV];
  /** The edge it runs along, when one is parallel and near. */
  edge: FoldEdge | null;
};

// ── resolution ────────────────────────────────────────────────────────────────────────────────

export type FoldVia = 'hint' | 'shape' | 'uv';

export type UnresolvedFold = { foldKey: string; pieceKey: string; seq: number; words: string };

export type ResolvedFolds = {
  /** Per piece key, ordered by seq — hand straight to `DollOptions.folds`. */
  folds: Record<string, DollFold[]>;
  /** Rows that could not be laid on this size: reported, omitted from `folds`. */
  unresolved: UnresolvedFold[];
  /** How each applied row was found (diagnostics): the edge by hint, by shape, or the stored (u,v). */
  via: Record<string, FoldVia>;
};

export const FOLDS = {
  /** RMS of the edge's five samples in the unit square (SEAMS.fitMax). */
  fitMax: 0.02,
  /** The best edge must beat the next disjoint one by this much, else the locator is a tie. */
  tieMargin: 0.01,
  /** Candidate runs: chains of up to this many neighbouring edges. */
  maxChain: 3,
  /** A resolved line shorter than this is not a fold. */
  minLenMm: 5,
  /** flipAt nearer the line than this is re-synthesised. */
  flipMinMm: 0.5,
  /** Probes (mm) off the line's midpoint when flipAt is synthesised. */
  flipProbeMm: [5, 2, 1, 10] as readonly number[],
  /** A drawn line is straight when no vertex is further than this from its chord. */
  straightMm: 1.5,
  /** A generic inner line must be at least this long to be offered as a fold. */
  innerMinMm: 30,
  /** An edge is «along» a line when their directions differ by less than this. */
  parallelDeg: 3,
  /** …and the line is no further from it than this (marks.ts search reach). */
  edgeReachMm: 66,
  /** Two hints closer than this (both ends) and within parallelDeg are one. */
  dedupeMm: 5,
  /** A line end this close to the contour is «on» it. */
  onContourMm: 3,
} as const;

export type FoldResolveOptions = {
  /** Degrees (CCW) that turn each piece upright by its grain (lib/seams grainDegOf). */
  grainDeg?: ReadonlyMap<string, number>;
  thresholds?: Partial<typeof FOLDS>;
  /** Display names for the words — never a ULID. */
  nameOf?: (pieceKey: string) => string;
};

// ── wire shape (proto common.TechCardPieceFold as the generated HTTP client carries it) ──

export type TechCardPieceFoldKindWire =
  | 'TECH_CARD_PIECE_FOLD_KIND_UNKNOWN'
  | 'TECH_CARD_PIECE_FOLD_KIND_INWARD'
  | 'TECH_CARD_PIECE_FOLD_KIND_OUTWARD';
export type TechCardPieceFoldSourceWire =
  | 'TECH_CARD_PIECE_FOLD_SOURCE_UNKNOWN'
  | 'TECH_CARD_PIECE_FOLD_SOURCE_DXF'
  | 'TECH_CARD_PIECE_FOLD_SOURCE_OWNER'
  | 'TECH_CARD_PIECE_FOLD_SOURCE_ACCEPTED_HINT';
export type TechCardPieceFoldSampleWire = { u: number | undefined; v: number | undefined };
export type TechCardPieceFoldWire = {
  foldKey: string | undefined;
  pieceLineKey: string | undefined;
  seq: number | undefined;
  kind: TechCardPieceFoldKindWire | undefined;
  line: TechCardPieceFoldSampleWire[] | undefined;
  flipAt: TechCardPieceFoldSampleWire | undefined;
  edgeHint: string | undefined;
  edgeSamples: TechCardPieceFoldSampleWire[] | undefined;
  offsetMm: number | undefined;
  contourSig: string | undefined;
  source: TechCardPieceFoldSourceWire | undefined;
  anchoredSize: string | undefined;
  note: string | undefined;
  // OUTPUT ONLY
  stale?: boolean | undefined;
  createdBy?: string | undefined;
  createdAt?: string | undefined;
  updatedBy?: string | undefined;
  updatedAt?: string | undefined;
};
