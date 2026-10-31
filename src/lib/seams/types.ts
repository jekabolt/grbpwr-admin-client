// Confirmed seams saved on the tech card — the client side (03-SEAMS-DESIGN.md §2–§4).
//
// A stored seam is two SIDES, each a list of EDGE ANCHORS, never `pieceKey#k` (that number is
// counted from the DXF's first vertex and moves with the exporter). An anchor = the piece's
// line_key + the run's SHAPE in the piece's own frame + consistency numbers; the resolver finds
// the run again on today's geometry or says «stale» in words — it never re-points silently.
//
// Pure TS (no React, no generated API types): the wire shape below mirrors proto
// `common.TechCardSeam` 1:1 so the card read / RPC layer converts with `fromWire` / `toWire`.

import type {
  EdgeId,
  ExcludedPair,
  Mm,
  SeamCandidate,
  SeamDecisions,
} from 'lib/assembly-skeleton/types';

/** One run of one piece taking part in a seam side. */
export type EdgeAnchor = {
  /** tech_card_piece.line_key (the skeleton's pieceKey) — never a block name, never an id. */
  piece: string;
  /**
   * Five points along the run at s = 0, ¼, ½, ¾, 1 of its length, walk order (CCW), in the piece's
   * frame: the sewing loop turned upright by its grain line (±8°, lib/pom upright), then its bbox
   * as the unit square. 3 decimals.
   */
  samples: [number, number][];
  /** Run length / sewing-line perimeter when anchored, 4 decimals. */
  perimShare: number;
  /** Run length at the anchored size, mm, 1 decimal. */
  lenMm: Mm;
  /** Notches on the run, ends excluded (Edge.notchesMm). */
  notches: number;
  /** Signed turn of the run, degrees (+ convex). */
  turnDeg: number;
  /** Sewn sub-range as shares of the run from its start; [0, 1] = the whole run. */
  range: [number, number];
  /** The engine's run id when anchored ('FP_L#2', 'BP#3+4') — fast path + diagnostics only. */
  edgeHint: string;
  /** Fingerprint of the piece's segmentation when anchored (16 hex) — the fast path's guard. */
  contourSig: string;
  /**
   * «Place by hand», interpreted by seam kind. Surface: the part's drawing-frame bbox corner from
   * the host's, then an in-plane turn and mirror. Edge / partial / composite, on the moved piece's
   * anchors only: `xMm` is the signed slide from a centred fit along the partner's current seam run;
   * `yMm` is 1 for inside and 0 for opened out; `rotDeg` is a turn about the seam and `flip` is face
   * down. On read those kinds re-snap from today's resolved runs and clamp the slide. The x/y values
   * are never applied as a free pose, so grading cannot pull the piece away from its seam.
   */
  placement?: SeamPlacement;
};

export type SeamPlacement = { xMm: number; yMm: number; rotDeg: number; flip: boolean };

export type StoredSeamStatus = 'confirmed' | 'rejected';
/** The kinds of a SEAM. A pose rides the same table but is not one (`StoredPose`). */
export type StoredSeamKind = 'edge' | 'partial' | 'composite' | 'surface' | 'closure';
export type StoredSeamDirection = 'reversed' | 'same' | 'unknown';
export type StoredSeamSource = 'graph' | 'doll' | 'order' | 'manual' | 'ai';

/** One stored seam decision (a row of tech_card_seam), in the client's words. */
export type StoredSeam = {
  /** ULID, client-minted, the row's identity across saves. */
  seamKey: string;
  status: StoredSeamStatus;
  kind: StoredSeamKind;
  direction: StoredSeamDirection;
  source: StoredSeamSource;
  /** Anchors in walk order; a partial's long side carries the range. */
  sideA: EdgeAnchor[];
  sideB: EdgeAnchor[];
  anchoredSize: string;
  note: string;
  /** Server verdict: the pieces' source (sheets + block links) moved since the row was written. */
  stale?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
};

/**
 * A row of tech_card_seam that is NOT a seam (P8, kind `pose`): a piece placed by hand in a step.
 * `sideA` = the one anchor of the moved piece, its `placement` = the piece in the host's frame as a
 * surface placement is encoded; `sideB` = the one anchor of the host piece. Linked to its step by
 * the op's seam keys like a seam, but it never reaches a seam reader: the wire loaders split it off
 * (`splitWire`), and a stale pose is still laid (the owner's last word), never counted.
 */
export type StoredPose = Omit<StoredSeam, 'kind'> & { kind: 'pose' };

/** Any row of the card's seam table: a seam or a pose. */
export type StoredRow = StoredSeam | StoredPose;

// ── wire shape (proto common.TechCardSeam as protojson / the generated HTTP client sends it) ──

export type TechCardSeamSampleWire = { u: number | undefined; v: number | undefined };
export type TechCardSeamAnchorWire = {
  pieceLineKey: string | undefined;
  samples: TechCardSeamSampleWire[] | undefined;
  perimShare: number | undefined;
  lenMm: number | undefined;
  notches: number | undefined;
  turnDeg: number | undefined;
  rangeFrom: number | undefined;
  rangeTo: number | undefined;
  edgeHint: string | undefined;
  contourSig: string | undefined;
  placement?:
    | {
        xMm: number | undefined;
        yMm: number | undefined;
        rotDeg: number | undefined;
        flip: boolean | undefined;
      }
    | undefined;
};
export type TechCardSeamSideWire = { parts: TechCardSeamAnchorWire[] | undefined };
export type TechCardSeamStatusWire =
  | 'TECH_CARD_SEAM_STATUS_UNKNOWN'
  | 'TECH_CARD_SEAM_STATUS_CONFIRMED'
  | 'TECH_CARD_SEAM_STATUS_REJECTED';
export type TechCardSeamKindWire =
  | 'TECH_CARD_SEAM_KIND_UNKNOWN'
  | 'TECH_CARD_SEAM_KIND_EDGE'
  | 'TECH_CARD_SEAM_KIND_PARTIAL'
  | 'TECH_CARD_SEAM_KIND_COMPOSITE'
  | 'TECH_CARD_SEAM_KIND_SURFACE'
  | 'TECH_CARD_SEAM_KIND_CLOSURE'
  | 'TECH_CARD_SEAM_KIND_POSE';
export type TechCardSeamDirectionWire =
  | 'TECH_CARD_SEAM_DIRECTION_UNKNOWN'
  | 'TECH_CARD_SEAM_DIRECTION_REVERSED'
  | 'TECH_CARD_SEAM_DIRECTION_SAME';
export type TechCardSeamSourceWire =
  | 'TECH_CARD_SEAM_SOURCE_UNKNOWN'
  | 'TECH_CARD_SEAM_SOURCE_GRAPH'
  | 'TECH_CARD_SEAM_SOURCE_DOLL'
  | 'TECH_CARD_SEAM_SOURCE_ORDER'
  | 'TECH_CARD_SEAM_SOURCE_MANUAL'
  | 'TECH_CARD_SEAM_SOURCE_AI';
export type TechCardSeamWire = {
  seamKey: string | undefined;
  status: TechCardSeamStatusWire | undefined;
  kind: TechCardSeamKindWire | undefined;
  direction: TechCardSeamDirectionWire | undefined;
  source: TechCardSeamSourceWire | undefined;
  sideA: TechCardSeamSideWire | undefined;
  sideB: TechCardSeamSideWire | undefined;
  anchoredSize: string | undefined;
  note: string | undefined;
  // OUTPUT ONLY
  stale?: boolean | undefined;
  createdBy?: string | undefined;
  createdAt?: string | undefined;
  updatedBy?: string | undefined;
  updatedAt?: string | undefined;
};

// ── resolution ────────────────────────────────────────────────────────────────────────────────

/** How one anchor was found today. */
export type AnchorHit = {
  anchor: EdgeAnchor;
  /** The run it resolved to: an edge id or a chain `P#3+4` (+5). */
  run: EdgeId;
  edges: EdgeId[];
  /** Length of each of `edges`, mm. */
  edgeLens: Mm[];
  lenMm: Mm;
  how: 'hint' | 'shape' | 'topology';
  /** The piece's frame against the anchor's: as is, turned 180°, mirrored across u or v. */
  frame: Frame;
  /** RMS of the five samples in the unit square (0 on the fast path). */
  fit: number;
};

export type Frame = 'asis' | 'rot180' | 'mirrorU' | 'mirrorV';

/** A stored row not applied today, with the reason in words. */
export type StaleRow = {
  seam: StoredSeam;
  /** server = the source fingerprint moved; geometry = an anchor no longer fits; tie = two runs fit. */
  reason: 'server' | 'geometry' | 'tie' | 'drift';
  /** A server-stale row whose anchors still resolve: one click re-confirms it. */
  stillFits: boolean;
  words: string;
};

export type OrphanRow = { seam: StoredSeam; missing: string[]; words: string };

/** A stored row that IS applied, with what it resolved to. */
export type AppliedRow = {
  seam: StoredSeam;
  a: AnchorHit[];
  b: AnchorHit[];
  /** The candidate handed to the graph (confirmed / closure) or the pair excluded (rejected). */
  candidate?: SeamCandidate;
  excluded?: ExcludedPair;
  /** The pair's edges, order-free (two rows of one pair share it: read as one seam). */
  sig?: string;
};

export type Resolved = SeamDecisions & {
  applied: AppliedRow[];
  stale: StaleRow[];
  orphan: OrphanRow[];
};

/** Thresholds of the resolver (03-SEAMS-DESIGN §2.2). Change only with a re-measure. */
export const SEAMS = {
  /** RMS of the five samples in the unit square: ≈ 10 mm on a 50 cm piece. */
  fitMax: 0.02,
  /** The best fit must beat the next DISJOINT run by this much, else the anchor is a tie. */
  tieMargin: 0.01,
  /** A piece's frame is its own when it beats the next frame by this mean fit; else the file's. */
  frameMargin: 0.01,
  /** len / anchored len (POM's LEN_RATIO: grading never leaves it). */
  lenRatio: [0.8, 1.25] as readonly [number, number],
  /** Notch count may differ by this much (a notch dropped or added on re-export). */
  notchDiff: 1,
  /** The two sides' length ratio may drift this much from the anchored one (grading keeps it). */
  ratioDrift: 0.03,
  /** Candidate runs: chains of up to this many neighbouring edges. */
  maxChain: 3,
} as const;

export type ResolveOptions = {
  /** Degrees (CCW) that turn each piece upright by its grain — the frame the anchors were written in. */
  grainDeg?: ReadonlyMap<string, number>;
  /** Thresholds override (the probe's negative control). */
  thresholds?: Partial<typeof SEAMS>;
  /** Display names for the words («FP L» instead of a ULID). */
  nameOf?: (pieceKey: string) => string;
  /**
   * An anchor already placed by other means (lib/seams `resolveAcrossSizes`: carried from the size
   * it was confirmed on by the piece's edge sequence). Tried before the fast path and the shape
   * search; undefined = resolve this anchor as usual.
   */
  preHit?: (a: EdgeAnchor) => AnchorHit | undefined;
  /** The size these pieces are, for the words («… on XL»). */
  size?: string;
};
