// Grade map — the drawn elements of one piece traced through its sizes ("tracks with nodes").
//
// A track is one drawn element followed through the sizes: the cut line, the seam line, each
// internal line, each drill, each notch. A carried track has the same number of nodes in every size
// it carries; between two nodes a point keeps its arc fraction of its own line. Nodes are mm in each
// size's own piece frame (the frame the runtime sees after sourcePieces), stored as integers of
// 0.01 mm: the base size absolute, every other size as a difference from the base node.
//
// Trust: exact (from a .rul) · derived (a unique match, margin ≥ 1.5×) · fitted (a grade model, with
// its residual) · confirmed (the operator's answer) · refused (with the reason). Refusal is per
// track and per size, never per piece.

import type { ContourSignature, PtMm } from 'lib/pattern-import/types';

export type TrackKind = 'cut' | 'seam' | 'internal' | 'drill' | 'notch';
export type Trust = 'exact' | 'derived' | 'fitted' | 'confirmed' | 'refused';

/** Integer 0.01 mm. */
export type Q = number;
export const Q_PER_MM = 100;

/** One size of a track: its nodes as deltas from the base nodes, or why it is not carried. */
export type GmTrackSize = {
  sizeId: number;
  /** Per node [dx, dy] from the base node, 0.01 mm; absent when refused. */
  delta?: [Q, Q][];
  /** "code: detail" when this size is not carried. */
  refused?: string;
  /** How far node transfer strays from the proven correspondence in this size, mm. */
  residualMm?: number;
};

export type GmTrack = {
  kind: TrackKind;
  /** DXF layer of the element (cut '1', notches '4', …). */
  layer: string;
  closed: boolean;
  /** derived when at least one other size is carried; refused (with reason) when none is. */
  trust: Trust;
  reason?: string;
  /** The largest residual over the carried sizes, mm. */
  residualMm: number;
  /** Base nodes, absolute, 0.01 mm. */
  base: [Q, Q][];
  /** Every size of the piece except the base, in the file's size order. */
  sizes: GmTrackSize[];
};

export type GmPiece = {
  /** Piece key (block identity). */
  key: string;
  /** Signature of the base cut contour (the manifest's), the staleness key of the map. */
  sig: ContourSignature | null;
  tracks: GmTrack[];
};

export type GmFile = {
  format: 'GRBPWR-GRADEMAP';
  version: 1;
  builder: string;
  sizes: number[];
  baseSizeId: number;
  pieces: GmPiece[];
};

/** One drawn line of a size, in the size's piece frame (the runtime's FuseInternalLine shape). */
export type GmLine = { layer: string; closed: boolean; points: PtMm[] };

/** What the builder reads of one size of one piece. */
export type GmSizeGeometry = {
  sizeId: number;
  cut: PtMm[];
  seam?: PtMm[] | null;
  /** Every non-cut line: internal lines, drill marks, notches (layer '4'). */
  lines: GmLine[];
};

export type GmPieceInput = {
  key: string;
  baseSizeId: number;
  /** Any order; the base size must be among them. */
  sizes: GmSizeGeometry[];
};

export type GmBuildOptions = {
  /**
   * Corners matched by position (gaps allowed) instead of by equal count and cyclic shift. Off by
   * default: only the survey's what-if column turns it on.
   */
  gapTolerant?: boolean;
};

/** Survey-side facts the builder knows but the payload does not carry. */
export type GmTrackInfo = {
  /** Pairing margin: second-best cost over best (Infinity when there was no rival). */
  margin: number;
  /** Nodes that are anchors (corners, notches, line ends) vs added to hold 0.05 mm. */
  anchors: number;
  /** Per size: the gap-tolerant what-if result for a refused cut / seam size. */
  whatIf?: Record<number, string>;
  /** Index of the element in the base size's line list (internal, drill, notch). */
  source?: number;
};

export type GmPieceBuild = {
  piece: GmPiece;
  info: GmTrackInfo[];
  /** Lines of other sizes no base track claimed, per size. */
  unclaimed: Record<number, number>;
};
