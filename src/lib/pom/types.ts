// POM engine — points of measure read off the FLAT pattern (3D-doll wave, P1; design:
// tmp/plans/assembly-3d-doll/01-DESIGN-L0.md §5). Pure TS, no React, no components/** imports: the
// same code runs in a worker, on the main thread and in the node probe (`yarn pom:check`).
//
// Every number is measured on the SEWING line of the pattern laid flat, per graded size, pieces
// upright in the drawing frame (DXF y up, as CLO exports them). Nothing is read from a 3D shape.
// Units inside: millimetres.

import type { EdgeId, Pt2 } from 'lib/assembly-skeleton/types';

export type { EdgeId, Pt2 };

/** What one edge of a piece is, in garment words (§5.2). `unknown` is an honest answer. */
export type EdgeRole =
  // body (tops)
  | 'neckline'
  | 'shoulder'
  | 'armhole'
  | 'side'
  | 'hem'
  | 'cf'
  | 'cb'
  | 'yoke-seam'
  | 'panel'
  // sleeve
  | 'cap'
  | 'underarm'
  | 'sleeve-seam'
  | 'wrist'
  | 'vent'
  // collar / stand
  | 'collar-neck'
  | 'collar-outer'
  | 'stand-neck'
  | 'stand-top'
  | 'collar-end'
  // strips: placket, cuff, waistband, facing, rib, hem band, loop, fly
  | 'strip-attach'
  | 'strip-edge'
  | 'strip-end'
  | 'pocket-edge'
  // bottoms
  | 'waist'
  | 'rise'
  | 'inseam'
  | 'outseam'
  | 'leg-hem'
  | 'unknown';

/** What a piece is, from its name (roles.json tokens) and the garment category. */
export type PieceKind =
  | 'front'
  | 'back'
  | 'side'
  | 'yoke'
  | 'sleeve'
  | 'collar'
  | 'stand'
  | 'cuff'
  | 'placket'
  | 'facing'
  | 'pocket'
  | 'waistband'
  | 'hood'
  | 'rib'
  | 'hemband'
  | 'loop'
  | 'fly'
  | 'skirt'
  | 'leg-front'
  | 'leg-back'
  | 'unknown';

export type GarmentKind = 'top' | 'bottom';

export type RoleReading = {
  role: EdgeRole;
  /** 0..1. Below POM.roleAccept the role is shown as «?» and no POM leans on it. */
  confidence: number;
  /** Which signal decided it, in words. */
  why: string;
  /**
   * What the reading rests on: a seam partner (`partner`); a fixed relation to a partner-backed
   * edge — the run on the HPS end of a sewn shoulder, the free bottom run of a panel whose long
   * sides are sewn (`anchored`); or shape / position / name alone (`shape`). A POM resting on a
   * `shape` reading is never `exact`.
   */
  evidence: 'partner' | 'anchored' | 'shape';
};

export type PieceInfo = {
  pieceKey: string;
  name: string;
  kind: PieceKind;
  hand: 'L' | 'R' | null;
  lining: boolean;
  /**
   * Physical width multiplier for girths: 2 for a FOLD half or one block cut as a mirrored pair
   * (the card's cutSymmetry), else 1. Identical layers (collar + under collar, yoke + yoke facing)
   * are not counted twice: `layerOf` names the piece they duplicate.
   */
  girthMult: number;
  layerOf: string | null;
  /**
   * Counted twice in girths because it reads as a half cut on the fold (an unsewn CB / CF and no
   * mirror twin) although the card does not say FOLD. Girths over it are approximate.
   */
  foldAssumed?: boolean;
  /** Why the kind is what it is (name token, or why a name was distrusted). */
  why: string;
};

/** A point on the pattern: piece-local mm (the PieceGeom frame) and where it came from. */
export type LandmarkPoint = {
  id: string;
  pieceKey: string;
  pt: Pt2;
  exactness: 'exact' | 'approx';
  /** How it was found, in words («corner FRONT_R#1 neckline ∩ #2 shoulder»). */
  from: string;
};

export type PomCode =
  | 'chest'
  | 'waist'
  | 'hip'
  | 'hem'
  | 'length-hps'
  | 'length-cb'
  | 'across-shoulder'
  | 'shoulder'
  | 'neck-width'
  | 'neck-drop-front'
  | 'neck-drop-back'
  | 'armhole'
  | 'sleeve-length'
  | 'underarm'
  | 'bicep'
  | 'sleeve-opening'
  | 'collar-length'
  | 'stand-height'
  | 'collar-point'
  | 'front-rise'
  | 'back-rise'
  | 'inseam'
  | 'outseam'
  | 'thigh'
  | 'knee'
  | 'leg-opening';

export type PomMethod = 'flat-width' | 'flat-length' | 'edge-length' | 'girth-sum' | 'chord';

export type PomDef = {
  code: PomCode;
  name: string;
  garment: GarmentKind;
  method: PomMethod;
  /** A girth: `halfMm` and `fullMm` are both reported; the card's convention picks one. */
  girth: boolean;
  /** How it is measured, in words (the «how to measure» line). */
  how: string;
};

export type Exactness = 'exact' | 'approx' | 'not-found';

/** One drawable piece of the measure line: a polyline in piece-local mm. */
export type PomLine = { pieceKey: string; pts: Pt2[] };

export type PomValue = {
  code: PomCode;
  name: string;
  method: PomMethod;
  /** The number in the reported convention (half for girths by default), mm; null = not found. */
  valueMm: number | null;
  /** Girths only: both conventions, always. */
  halfMm?: number | null;
  fullMm?: number | null;
  exactness: Exactness;
  /** Why it is approximate / not found, or a note on how it was read. */
  reason?: string;
  /** Extra readings (left/right, front/back, chord vs curve) in words. */
  detail?: string[];
  /** Edges whose ROLES the value rests on (their evidence decides whether it can be exact). */
  basis?: EdgeId[];
  /** The path the value was read along: landmarks, edges, and the lines to draw. */
  path: { landmarks: LandmarkPoint[]; edges: EdgeId[]; lines: PomLine[] };
};

export type SizePoms = {
  size: string;
  values: PomValue[];
  /** Pieces whose grading changed the contour (re-segmented, roles moved by position). */
  regraded: string[];
  warnings: string[];
};

export type GirthConvention = 'half' | 'full';

export type PomReport = {
  garment: GarmentKind;
  baseSize: string;
  convention: GirthConvention;
  /** «default» until the card says which convention its chart uses. */
  conventionSource: 'default' | 'card';
  pieces: PieceInfo[];
  /** Edge roles on the base size. */
  roles: Record<EdgeId, RoleReading>;
  sizes: SizePoms[];
  warnings: string[];
};

export const POM = {
  /** A role below this is shown as «?» and no landmark leans on it. */
  roleAccept: 0.6,
  /** 1 inch: chest / bicep / thigh levels sit this far below their landmark. */
  inchMm: 25.4,
  /** Display tolerance until the card stores one (owner 10.10: ±1 cm, labelled «default»). */
  defaultTolMm: 10,
  /** Two readings of one POM (left/right, front/back) further apart than this are reported. */
  pairDiffMm: 3,
  /** Seam alignment worse than this (RMS after anchoring) makes a girth approximate. */
  alignRmsMm: 6,
} as const;
