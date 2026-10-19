// GARMENT PASSPORT (auto/PASSPORT.md) — what the DOCUMENT itself says about the garment, read once
// over every file and page (text layer, SVG / DXF layer names, file names), kept apart from what the
// drawing proves. The passport is an EXPECTATION, the drawing is the FINDING: a fact here never
// builds geometry by itself, it is evidence a policy weighs (D3: auto only on ≥ 2 classes; D5: an
// autopilot answer is a recorded assumption).
//
// Ф1 = the deterministic reader (no AI, no backend): classes 'text' (OUR grammar parsed the words
// out of the text layer) and 'structure' (a layer / group name, a file name). The full passport lives
// in the worker session; the manifest carries a small digest (≤ 2 KB, `PassportDigest`).

/** Independence is counted by CLASS, never by the number of calls (PASSPORT.md §1). */
export type EvidenceClass = 'text' | 'structure' | 'geometry' | 'card' | 'ai' | 'operator';

export type SourceRef = {
  /** Index into the session's files (`SourceFileInfo.id` order). */
  file: number;
  /** 0-based page; null = the whole file (a layer name, the file name). */
  page: number | null;
  /** Normalised page box 0..1 (Ф3). */
  box?: [number, number, number, number];
  /** As printed, ≤ 160 characters. */
  quote?: string;
  /** The quote was found in the text layer by us (not read off a picture). */
  quoted?: boolean;
};

export type FactStatus = 'read' | 'verified' | 'agreed' | 'conflict' | 'confirmed' | 'rejected';

export type Fact<T> = {
  value: T;
  refs: SourceRef[];
  classes: EvidenceClass[];
  /** 0..1 — how sure the READER is that the document says this (not that it is right). */
  confidence: number;
  status: FactStatus;
  note?: string;
};

/**
 * How a list line says the piece is cut: 'fold' = once on fold, 'pair' = the text says pair / Paar /
 * пара, 'single' = one piece, 'count' = n pieces with no word on symmetry (Ф1 never guesses
 * mirrored vs identical).
 */
export type CutMode = 'single' | 'pair' | 'fold' | 'identical' | 'mirrored' | 'count';
export type CutQty = { n: number; mode: CutMode; text: string };

export type AllowanceStatement = {
  included: boolean | null;
  mm: number | null;
  hemMm: number | null;
};

export type ExpectedPiece = {
  /** 'e1', 'e2' … stable inside one passport. */
  key: string;
  /** The printed number / letter the sheet labels the piece with ("67", "A", "2a"). */
  label: Fact<string> | null;
  /** As printed (the list line without its number and count). */
  name: Fact<string>;
  nameEn: string | null;
  role: string | null;
  qty: Fact<CutQty> | null;
  cloth: Fact<string> | null;
  fused: Fact<boolean> | null;
  /** Ф2 reads «trace from 21» / «by dimensions»; Ф1 leaves it unknown (null) — never assumed drawn. */
  drawn: Fact<'drawn' | 'by-dimensions' | 'trace-from' | 'derived'> | null;
  models: string[] | null;
  sheet: string | null;
  allowance: Fact<AllowanceStatement> | null;
  /** Set by the worker after pieces: the piece on the sheet this entry is bound to, and how. */
  binding?: {
    seed: number;
    identity?: string;
    by: 'label' | 'shape' | 'som' | 'operator';
    classes: EvidenceClass[];
  };
};

/** What the drawn outline is, by the file's own word for the layer that holds it. */
export type OutlineMeaning = 'cut' | 'seam' | 'both';

/**
 * One layer / group name that SAYS what its lines are (a 'structure' fact): the outline word of an
 * Inkscape layer label, an Illustrator group id (`CUT_x5F_LINE`), a DXF layer name ("CUT").
 */
export type LayerWord = {
  file: number;
  /** The layer name as the adapter carries it (decoded). */
  layer: string;
  word: 'cut' | 'seam';
  /** Closed loops on this layer at extraction (any size) — informational. */
  loops: number;
};

export type GarmentPassport = {
  v: 1;
  /** sha256 over the sorted sha256 of the files (hex). */
  sourceDigest: string;
  readers: { kind: 'det' | 'ai'; rev: string; model?: string; costUsd?: string; at: string }[];
  garment: {
    category: Fact<string> | null;
    title: Fact<string> | null;
    models: Fact<string[]> | null;
    patternNo: Fact<string> | null;
  };
  /** A third evidence for the size run (A6), never its decider. Ф1: not read (null). */
  sizes: Fact<string[]> | null;
  allowance: Fact<AllowanceStatement> | null;
  /**
   * What is drawn: at extraction, from the layer words of the layers that hold closed loops; after
   * pieces (`bindPassport`), ONLY from the layers of the exported pieces' own outline walls.
   */
  outline: Fact<OutlineMeaning> | null;
  /** Every layer whose name is an outline word (the reader's raw finding, kept for the bind). */
  layerWords: LayerWord[];
  pieces: ExpectedPiece[];
  listComplete: Fact<boolean> | null;
  pages: {
    file: number;
    page: number;
    holds: (
      | 'piece-list'
      | 'cutting-layout'
      | 'sewing-steps'
      | 'size-table'
      | 'legend'
      | 'overview'
      | 'cover'
    )[];
  }[];
  watermarks: Fact<{ text: string; pages: number[] }>[];
  legend: { grain?: Fact<string>; fold?: Fact<string>; notch?: Fact<string> };
  steps: Fact<{ no: string; text: string; pieces: string[] }>[];
  /** "list: 2 pcs; sheet: 1 pc on fold" — two statements that disagree (both quoted). */
  conflicts: string[];
  /** After pieces: expected keys bound to no piece / exported identities no entry names. */
  missing?: string[];
  extra?: string[];
};

/**
 * The manifest's copy (≤ 2 KB, shape-tolerant on read like `autopilot`: an entry that does not
 * validate is left out, never the sheet).
 */
export type PassportDigest = {
  v: 1;
  sourceDigest: string;
  readers: { kind: 'det' | 'ai'; rev: string }[];
  category: string | null;
  outline: {
    value: OutlineMeaning;
    status: FactStatus;
    classes: EvidenceClass[];
    quote: string | null;
  } | null;
  allowance: {
    included: boolean | null;
    mm: number | null;
    classes: EvidenceClass[];
    quote: string | null;
  } | null;
  expected: {
    key: string;
    label: string | null;
    name: string;
    qty: number | null;
    mode: CutMode | null;
    drawn: string | null;
    cloth: string | null;
  }[];
  bound: { key: string; identity: string }[];
  missing: string[];
  extra: string[];
  /**
   * SHAPE soft rule (17.10): pieces whose sizes carry different notch / drill counts — "notches:
   * XS 1, S 2 … — one piece, one shape" — recorded, not held (SHAPE_COUNTS_HOLD=1 holds them).
   * Absent = none (or a digest written before the field).
   */
  shape?: { identity: string; note: string }[];
  /** The expected list was cut to fit the 2 KB budget. */
  truncated?: boolean;
};

export const PASSPORT_READER_REV = 'det-1';
export const PASSPORT_DIGEST_MAX = 2048;
