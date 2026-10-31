// THE INPUT OF ONE HINTS RUN (SPEC-F §3) and the way back: the client reads the SAVED card into
// names the model can talk about (pieces by their card names, units by their names, steps by their
// numbers), and turns the answer's piece names back into the line keys the seam model reads.
// Pure: no React, no network. The atlas PNG is added by the caller on a run only (not digested).

import type { PieceGeom } from 'lib/assembly-skeleton/types';

import type { SeamHints } from './merge';

/** One card piece as the input builder needs it. */
export type HintPieceSource = {
  key: string;
  /** The card's piece name; empty falls back to a neutral «PIECE n» (never the line key). */
  name: string;
  /** BOM purpose of the piece's cloth (`main`, `pocketing`, …), or empty. */
  purpose?: string;
  fused?: boolean;
  /** `identical`, `mirrored`, `fold`, or empty. */
  symmetry?: string;
  /** The effective dictionary role of the name (hints vocabulary), or null. */
  dictRole?: string | null;
  geom?: PieceGeom;
  notches?: number;
  innerLines?: number;
};

/** One step of the saved card. */
export type HintOpSource = {
  operationNumber?: number;
  zone?: string;
  work?: string;
  operationType?: string;
  inputKeys?: readonly string[];
  outputUnitKey?: string;
  outputUnitName?: string;
};

export type SeamHintsInputPiece = {
  name: string;
  purpose: string;
  fused: boolean;
  symmetry: string;
  dict_role: string;
  aspect: number;
  area: number;
  perimeter: number;
  notches: number;
  inner_lines: number;
};

export type SeamHintsInput = {
  pieces: SeamHintsInputPiece[];
  units: { name: string; inputs: string[] }[];
  ops: {
    number: number;
    zone: string;
    work: string;
    operation_type: string;
    inputs: string[];
    output: string;
  }[];
  sketch_media_ids: number[];
  atlas_png?: string;
};

export type SeamHintsInputBuild = {
  input: SeamHintsInput;
  /** The name sent for each piece key, and back. */
  nameOfKey: ReadonlyMap<string, string>;
  keyOfName: ReadonlyMap<string, string>;
  /** A sent name (piece or unit) → the piece keys under it (a unit: every piece it holds). */
  piecesOfName: ReadonlyMap<string, readonly string[]>;
};

// The server's bounds (techcardseamhints/input.go): longer text is refused, so it is cut here.
const MAX_PIECES = 120;
const MAX_OPS = 300;
const MAX_UNITS = 120;
const MAX_OP_INPUTS = 24;
const MAX_UNIT_INPUTS = 60;
const MAX_SKETCHES = 4;
const NAME_RUNES = 64;
const TEXT_RUNES = 120;
const SHORT_RUNES = 32;

const cut = (s: string | undefined, max: number) => [...(s ?? '').trim()].slice(0, max).join('');
const bare = (s: string | undefined, prefix: string) =>
  cut((s ?? '').replace(prefix, '').toLowerCase(), SHORT_RUNES);
const ZONE = 'TECH_CARD_GARMENT_ZONE_';
const OP_TYPE = 'TECH_CARD_OPERATION_TYPE_';
const UNKNOWN = /(^|_)(unknown|unset|unspecified)$/;

const round = (x: number, places: number) => {
  const p = 10 ** places;
  return Number.isFinite(x) ? Math.round(Math.max(0, x) * p) / p : 0;
};

function shapeOf(geom: PieceGeom | undefined) {
  if (!geom || geom.rs.length < 3) return { aspect: 0, area: 0, perimeter: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of geom.rs) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const long = Math.max(x1 - x0, y1 - y0);
  const short = Math.min(x1 - x0, y1 - y0);
  return {
    aspect: short > 0 ? round(long / short, 2) : 0,
    area: round(geom.areaMm2, 0),
    perimeter: round(geom.perimMm, 0),
  };
}

/** A name not yet taken: `name`, else `name_2`, `name_3`… (kept within the name bound). */
function unique(name: string, taken: Set<string>): string {
  let out = cut(name, NAME_RUNES);
  for (let n = 2; taken.has(out); n += 1) {
    const tail = `_${n}`;
    out = cut(name, NAME_RUNES - tail.length) + tail;
  }
  taken.add(out);
  return out;
}

/** The saved card → the hints input (no atlas), with the piece-name ↔ key maps. */
export function buildSeamHintsInput(
  pieces: readonly HintPieceSource[],
  ops: readonly HintOpSource[],
  sketchMediaIds: readonly number[],
): SeamHintsInputBuild {
  const taken = new Set<string>();
  const nameOfKey = new Map<string, string>();
  const keyOfName = new Map<string, string>();
  const outPieces: SeamHintsInputPiece[] = [];
  pieces.slice(0, MAX_PIECES).forEach((piece, i) => {
    if (!piece.key || nameOfKey.has(piece.key)) return;
    const name = unique(piece.name.trim() || `PIECE ${i + 1}`, taken);
    nameOfKey.set(piece.key, name);
    keyOfName.set(name, piece.key);
    outPieces.push({
      name,
      purpose: UNKNOWN.test((piece.purpose ?? '').toLowerCase())
        ? ''
        : bare(piece.purpose, 'TECH_CARD_BOM_PURPOSE_'),
      fused: !!piece.fused,
      symmetry: UNKNOWN.test((piece.symmetry ?? '').toLowerCase())
        ? ''
        : bare(piece.symmetry, 'TECH_CARD_PIECE_CUT_SYMMETRY_'),
      dict_role: piece.dictRole ?? '',
      ...shapeOf(piece.geom),
      notches: Math.min(1000, piece.notches ?? 0),
      inner_lines: Math.min(1000, piece.innerLines ?? 0),
    });
  });

  // Units: a step's output, named by the card (else a neutral «UNIT n»), made of the step's inputs.
  const unitName = new Map<string, string>();
  const numbered = ops.filter((op) => (op.operationNumber ?? 0) > 0).slice(0, MAX_OPS);
  for (const op of numbered) {
    const key = op.outputUnitKey?.trim();
    if (!key || unitName.has(key) || unitName.size >= MAX_UNITS) continue;
    unitName.set(key, unique(op.outputUnitName?.trim() || `UNIT ${unitName.size + 1}`, taken));
  }
  const nameOf = (key: string) => nameOfKey.get(key) ?? unitName.get(key) ?? null;
  const inputsOf = (op: HintOpSource, max: number) =>
    [...new Set((op.inputKeys ?? []).map(nameOf).filter((n): n is string => !!n))].slice(0, max);

  const units = new Map<string, string[]>();
  for (const op of numbered) {
    const key = op.outputUnitKey?.trim();
    const name = key ? unitName.get(key) : undefined;
    if (!name || units.has(name)) continue;
    units.set(
      name,
      inputsOf(op, MAX_UNIT_INPUTS).filter((n) => n !== name),
    );
  }

  const piecesOfName = new Map<string, readonly string[]>();
  for (const [name, key] of keyOfName) piecesOfName.set(name, [key]);
  const leaves = (name: string, seen: Set<string>): string[] => {
    const done = piecesOfName.get(name);
    if (done) return [...done];
    if (seen.has(name)) return [];
    seen.add(name);
    return [...new Set((units.get(name) ?? []).flatMap((part) => leaves(part, seen)))];
  };
  for (const name of units.keys()) piecesOfName.set(name, leaves(name, new Set()));

  return {
    input: {
      pieces: outPieces,
      units: [...units].map(([name, inputs]) => ({ name, inputs })),
      ops: numbered.map((op) => ({
        number: op.operationNumber ?? 0,
        zone: UNKNOWN.test((op.zone ?? '').toLowerCase()) ? '' : bare(op.zone, ZONE),
        work: cut(op.work, TEXT_RUNES),
        operation_type: UNKNOWN.test((op.operationType ?? '').toLowerCase())
          ? ''
          : bare(op.operationType, OP_TYPE),
        inputs: inputsOf(op, MAX_OP_INPUTS),
        output: (op.outputUnitKey && unitName.get(op.outputUnitKey.trim())) || '',
      })),
      sketch_media_ids: [...new Set(sketchMediaIds.filter((id) => id > 0))].slice(0, MAX_SKETCHES),
    },
    nameOfKey,
    keyOfName,
    piecesOfName,
  };
}

/**
 * The hints with piece NAMES turned into the line keys the seam model reads. A row naming a piece
 * this card no longer has is dropped (its pair could never match).
 */
export function keyedSeamHints(
  hints: SeamHints,
  keyOfName: ReadonlyMap<string, string>,
): SeamHints {
  const keys = (names: readonly string[]) => {
    const out = names.map((name) => keyOfName.get(name));
    return out.every((key): key is string => !!key) ? out : null;
  };
  return {
    ...hints,
    roles: hints.roles.flatMap((row) => {
      const key = keyOfName.get(row.piece);
      return key ? [{ ...row, piece: key }] : [];
    }),
    joins: hints.joins.flatMap((row) => {
      const a = keys(row.a.pieces);
      const b = keys(row.b.pieces);
      return a && b ? [{ ...row, a: { ...row.a, pieces: a }, b: { ...row.b, pieces: b } }] : [];
    }),
  };
}

/**
 * The steps with the card's hints attached where a live join row names their number (`SignalOp
 * .hints`); every other step keeps its identity. No live row → the very same array: no hints, the
 * guess is today's guess.
 */
export function withSeamHints<T extends { operationNumber?: number }>(
  ops: readonly T[],
  hints: SeamHints | null | undefined,
): readonly T[] {
  const live = new Set(
    (hints?.joins ?? []).filter((row) => row.state !== 'off').map((row) => row.op),
  );
  if (!hints || live.size === 0) return ops;
  return ops.map((op) =>
    op?.operationNumber != null && live.has(op.operationNumber) ? { ...op, hints } : op,
  );
}

// ── the saved card → the builder's sources ──────────────────────────────────────────────────

type CardPiece = {
  lineKey?: string;
  name?: string;
  fused?: boolean;
  cutSymmetry?: string;
  materials?: { bomLineKey?: string }[];
};
type CardMedia = { media?: { id?: number }; kind?: string };
export type SeamHintsCard = {
  techCard?: {
    pieces?: CardPiece[];
    bomItems?: { lineKey?: string; purpose?: string }[];
    operations?: HintOpSource[];
  };
  resolvedTechnicalMedia?: CardMedia[];
};
/** What the DXF read gives a piece (AsmPiece): its segmentation and its line counts. */
export type SeamHintsShape = {
  geom: PieceGeom;
  inner: readonly unknown[];
  notch: readonly unknown[];
};

const SKETCH_ORDER = ['FRONT', 'BACK', 'DETAIL'];

/** The card's sketch ids: the technical sheet's flats, front and back first (the server takes 4). */
export function sketchIdsOf(card: SeamHintsCard): number[] {
  const rank = (kind: string | undefined) => {
    const at = SKETCH_ORDER.findIndex((word) => (kind ?? '').toUpperCase().endsWith(word));
    return at < 0 ? SKETCH_ORDER.length : at;
  };
  return [...(card.resolvedTechnicalMedia ?? [])]
    .map((row, i) => ({ id: row.media?.id ?? 0, rank: rank(row.kind), i }))
    .filter((row) => row.id > 0)
    .sort((x, y) => x.rank - y.rank || x.i - y.i)
    .map((row) => row.id);
}

/** The saved card (not the form: the digest must not move while the owner types) → sources. */
export function cardSources(
  card: SeamHintsCard | undefined,
  shapes: ReadonlyMap<string, SeamHintsShape>,
  dictRoleOf: (name: string) => string | null,
): { pieces: HintPieceSource[]; ops: HintOpSource[]; sketchMediaIds: number[] } {
  const purposeOf = new Map(
    (card?.techCard?.bomItems ?? []).map((row) => [row.lineKey ?? '', row.purpose ?? '']),
  );
  const pieces = (card?.techCard?.pieces ?? []).flatMap((piece): HintPieceSource[] => {
    const key = piece.lineKey ?? '';
    if (!key) return [];
    const name = (piece.name ?? '').trim();
    const shape = shapes.get(key);
    return [
      {
        key,
        name,
        purpose: purposeOf.get(piece.materials?.[0]?.bomLineKey ?? '') ?? '',
        fused: !!piece.fused,
        symmetry: piece.cutSymmetry ?? '',
        dictRole: name ? dictRoleOf(name) : null,
        geom: shape?.geom,
        notches: shape?.notch.length ?? 0,
        innerLines: shape?.inner.length ?? 0,
      },
    ];
  });
  return {
    pieces,
    ops: card?.techCard?.operations ?? [],
    sketchMediaIds: card ? sketchIdsOf(card) : [],
  };
}
