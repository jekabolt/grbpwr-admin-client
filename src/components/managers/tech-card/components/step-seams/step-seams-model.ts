// THE STEP'S SEAMS, PURE (assembly-schema T8): which pieces a step takes, which side a piece sits
// on, what to suggest, and the rows a pick writes. No React here — the picker and its test share it.
//
// Coordinates. The picker draws in the PDF's drawing frame (techpack/use-assembly-geometry: mm,
// y down — `cut`, `inner`). A piece's segmentation (`PieceGeom`, edges, anchors) lives in the same
// millimetres with y UP, so an edge is drawn as [x, −y] and an inner line is anchored as [x, −y].

import { cornerTurn, edgeIdsOf, identicalSeamEdge } from 'lib/assembly-skeleton/geometry';
import { xSideOf } from 'lib/assembly-skeleton/geometry/plies';
import { roleOf, roleVeto } from 'lib/assembly-skeleton/assignment/costs';
import { readName, roleDef } from 'lib/assembly-skeleton/skeleton/model';
import {
  SKELETON,
  type Edge,
  type EdgeId,
  type Hand,
  type PieceGeom,
  type Pt2,
} from 'lib/assembly-skeleton/types';
import {
  contourSig,
  frameOf,
  newSeamKey,
  type EdgeAnchor,
  type SeamPlacement,
  type StoredSeam,
} from 'lib/seams';
import { runSamples } from 'lib/seams/frame';

import { edgeOf, pieceOf, plainEdges } from '../assembly-seams/words';

export type Pt = [number, number];

/** A pickable target: an edge (`P#3`) or an inner line (`P:i2`). */
export type TargetId = string;

const INNER = /^(.*):i(\d+)$/;
export const innerId = (piece: string, k: number): TargetId => `${piece}:i${k}`;
export function parseInner(id: TargetId): { piece: string; k: number } | null {
  const m = INNER.exec(id);
  return m ? { piece: m[1], k: Number(m[2]) } : null;
}
export const pieceOfTarget = (id: TargetId) => parseInner(id)?.piece ?? pieceOf(id);

// ─── the step's pieces ────────────────────────────────────────────────────────────────────────────

export type FormOpLike = {
  inputKeys?: readonly string[];
  outputUnitKey?: string;
  seamKeys?: readonly string[];
  operationNumber?: number;
  assemblyBlockDetached?: boolean;
  fullnessRatio?: string | number;
  /** `TECH_CARD_OPERATION_TYPE_PRESS` or the bare `press`: what kind of step it is. */
  operationType?: string;
  /** `join_lockstitch`, `press_flat`, `buttonhole`…: what the step does. */
  work?: string;
};

export type InputGroup = { key: string; pieces: string[] };

type Membership = {
  components: Map<string, string[]>;
  owner: Map<string, string>;
  units: Map<string, string[]>;
};

/** Unit membership immediately before a step, including pieces referenced by their old leaf key. */
function membershipBefore(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
): Membership {
  const components = new Map<string, string[]>();
  const owner = new Map<string, string>();
  const units = new Map<string, string[]>();
  for (const piece of pieceKeys) {
    components.set(piece, [piece]);
    owner.set(piece, piece);
  }

  const ownersOf = (raw: string): string[] => {
    const key = raw.trim();
    if (!key) return [];
    const leaves = pieceKeys.has(key) ? [key] : units.get(key) ?? [];
    return [...new Set(leaves.map((piece) => owner.get(piece)).filter((k): k is string => !!k))];
  };

  for (let i = 0; i < index; i++) {
    const op = ops[i];
    const output = (op?.outputUnitKey ?? '').trim();
    if (!output || op?.assemblyBlockDetached) continue;
    const inputs = [...new Set((op.inputKeys ?? []).flatMap(ownersOf))];
    if (inputs.length < 2) continue;
    const pieces = [
      ...new Set(inputs.flatMap((key) => components.get(key) ?? units.get(key) ?? [])),
    ];
    if (pieces.length < 2) continue;
    for (const key of inputs) components.delete(key);
    components.set(output, pieces);
    units.set(output, pieces);
    for (const piece of pieces) owner.set(piece, output);
  }
  return { components, owner, units };
}

/**
 * The step's inputs, each as the pieces it is made of: a piece is itself, a unit is the leaves of
 * the latest EARLIER step that produced it (recursively). Order = the step's input order.
 */
export function inputGroups(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
): InputGroup[] {
  const state = membershipBefore(ops, index, pieceKeys);
  const groups: InputGroup[] = [];
  const seen = new Set<string>();
  for (const raw of ops[index]?.inputKeys ?? []) {
    const key = raw.trim();
    if (!key) continue;
    const leaves = pieceKeys.has(key) ? [key] : state.units.get(key) ?? [];
    for (const owner of new Set(
      leaves.map((piece) => state.owner.get(piece)).filter((k): k is string => !!k),
    )) {
      if (seen.has(owner)) continue;
      const pieces = state.components.get(owner) ?? state.units.get(owner) ?? [];
      if (!pieces.length) continue;
      seen.add(owner);
      groups.push({ key: owner, pieces: [...pieces] });
    }
  }
  return groups;
}

/** Distinct leaf pieces held by this step's WITH inputs; materials and photos are not inputs. */
export function stepInputPieces(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
): string[] {
  return [...new Set(inputGroups(ops, index, pieceKeys).flatMap((group) => group.pieces))];
}

// ─── what kind of step sews ───────────────────────────────────────────────────────────────────────

const TYPE_PREFIX = 'TECH_CARD_OPERATION_TYPE_';
/** Step types that never make a seam between their inputs, whatever WITH lists. */
const NOT_SEWN_TYPES: ReadonlySet<string> = new Set([
  'press',
  'press_open',
  'fusing',
  'buttonhole',
  'button_attach',
  'bartack',
  'hardware_set',
  'fold',
  'thread_trim',
  'trim',
  'clean',
  'inspect',
  'pack',
  'wet_process',
  'print',
]);
/** Works that never make a seam between the step's inputs (a press of any kind is read by prefix). */
const NOT_SEWN_WORKS: ReadonlySet<string> = new Set([
  'button_attach',
  'buttonhole',
  'bartack',
  'embroidery',
  'fuse',
  'eyelet_grommet',
  'set_hardware',
]);
/** A work that joins: one input alone may be closed on itself (a sleeve into a tube). */
const JOIN_WORK = /^(join|overlock)/;

const typeOf = (op: FormOpLike | undefined) =>
  (op?.operationType ?? '').trim().replace(TYPE_PREFIX, '').toLowerCase();
const workOf = (op: FormOpLike | undefined) => (op?.work ?? '').trim().toLowerCase();
const keyedOf = (op: FormOpLike | undefined) => (op?.seamKeys?.length ?? 0) > 0;

/** A press, a fuse, a button, a bartack…: the step touches its inputs but sews none to another. */
export function sewsNothing(op: FormOpLike | undefined): boolean {
  const work = workOf(op);
  return NOT_SEWN_TYPES.has(typeOf(op)) || NOT_SEWN_WORKS.has(work) || work.startsWith('press');
}

/**
 * True when the step makes a seam its row can show: WITH resolves to two or more live inputs and
 * the step is not a press / fuse / button step (a stored row always counts), or — with the
 * geometry — one input alone that a join closes on itself (a sleeve's underarm, a cuff's ends).
 */
export function isJoinStep(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms?: ReadonlyMap<string, PieceGeom>,
): boolean {
  const op = ops[index];
  const groups = inputGroups(ops, index, pieceKeys);
  if (groups.length >= 2) return keyedOf(op) || !sewsNothing(op);
  if (groups.length !== 1) return false;
  if (keyedOf(op)) return true;
  return (
    !!geoms && selfJoin(op, groups[0], geoms) && selfPairs(groups[0], geoms, new Set()).length > 0
  );
}

/** Kept for the picker API; eligibility is input-unit count, not flattened piece count. */
export function hasMultipleStepPieces(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms?: ReadonlyMap<string, PieceGeom>,
): boolean {
  return isJoinStep(ops, index, pieceKeys, geoms);
}

/** A join step on one tube-like input (sleeve, cuff, band): it closes the input on itself. */
function selfJoin(
  op: FormOpLike | undefined,
  group: { pieces: readonly string[] },
  geoms: ReadonlyMap<string, PieceGeom>,
): boolean {
  return JOIN_WORK.test(workOf(op)) && TUBE_CLASSES.has(classOf(group, geoms));
}

/** Side a click lands on: by input when the step joins two or more inputs, else the chosen side. */
export function sideOf(
  piece: string,
  groups: readonly { pieces: readonly string[] }[],
  chosen: 'a' | 'b',
): 'a' | 'b' {
  if (groups.length < 2) return chosen;
  return groups[0].pieces.includes(piece) ? 'a' : 'b';
}

// ─── lengths ──────────────────────────────────────────────────────────────────────────────────────

/** Length of a side's targets, mm (inner lines by their own length). */
export function targetsLen(
  ids: readonly TargetId[],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLen: (piece: string, k: number) => number,
): number {
  return ids.reduce((s, id) => {
    const inner = parseInner(id);
    return s + (inner ? innerLen(inner.piece, inner.k) : edgeOf(id, geoms)?.lenMm ?? 0);
  }, 0);
}

/**
 * Δ between the sides, with the step's ease (fullness ratio, «1.2» = the long side gathered onto
 * the short one 1.2 : 1). No ease → plain |A − B|.
 */
export function deltaMm(a: number, b: number, ease: number | null): number {
  if (!(a > 0) || !(b > 0)) return 0;
  const r = ease && ease > 0 ? ease : 1;
  const long = Math.max(a, b);
  const short = Math.min(a, b);
  return Math.abs(long - short * r);
}

export const fmtMm = (v: number) => String(Math.round(v * 10) / 10);

// ─── suggestion ───────────────────────────────────────────────────────────────────────────────────

export type Suggestion = { a: EdgeId[]; b: EdgeId[]; aLen: number; bLen: number };

export type InputUnitEdges = InputGroup & { edges: Edge[] };

/** The step's ease (fullness ratio «1.2» or 1.2) as a number, or null when unset. */
export function easeOf(op: FormOpLike | undefined): number | null {
  const ratio = Number.parseFloat(String(op?.fullnessRatio ?? '').replace(',', '.'));
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/** Confirmed edge seams attached to a step, each side as its edge ids (contour order). */
function storedSidesOf(
  op: FormOpLike | undefined,
  seams: ReadonlyMap<string, StoredSeam> | undefined,
): { a: EdgeId[]; b: EdgeId[]; direction: StoredSeam['direction'] }[] {
  const out: { a: EdgeId[]; b: EdgeId[]; direction: StoredSeam['direction'] }[] = [];
  if (!seams) return out;
  for (const key of op?.seamKeys ?? []) {
    const seam = seams.get(key);
    if (
      !seam ||
      seam.status !== 'confirmed' ||
      seam.stale ||
      seam.kind === 'surface' ||
      seam.kind === 'closure'
    )
      continue;
    const ids = (side: readonly EdgeAnchor[]) =>
      side.flatMap((anchor) => (anchor.edgeHint.includes('#') ? edgeIdsOf(anchor.edgeHint) : []));
    const a = ids(seam.sideA);
    const b = ids(seam.sideB);
    if (a.length || b.length) out.push({ a, b, direction: seam.direction });
  }
  return out;
}

/** Edges occupied by confirmed seams attached to earlier steps. */
export function usedEdgesBeforeStep(
  ops: readonly FormOpLike[],
  index: number,
  seams: ReadonlyMap<string, StoredSeam>,
): Set<EdgeId> {
  const used = new Set<EdgeId>();
  for (let i = 0; i < index; i++) {
    for (const seam of storedSidesOf(ops[i], seams)) {
      for (const edge of [...seam.a, ...seam.b]) used.add(edge);
    }
  }
  return used;
}

/** The live input units and only their unconsumed outer edges. */
export function inputUnitsWithOuterEdges(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
  used: ReadonlySet<EdgeId>,
): InputUnitEdges[] {
  return inputGroups(ops, index, pieceKeys).map((group) => ({
    ...group,
    edges: group.pieces.flatMap((piece) => {
      const geom = geoms.get(piece);
      return geom ? plainEdges(geom).filter((edge) => !used.has(edge.id)) : [];
    }),
  }));
}

/** Within this share of the longer side a single-edge pair is offered at all. */
const SUGGEST_REL = 0.2;
/** A chain (two or more edges on a side) is offered within this share — card 83's neckline. */
const CHAIN_REL = 0.25;
/**
 * An edge bends at least this much to count as a curve. Card 83: shaped side seams turn 14–18°,
 * a shirt-tail hem 17–25°, a collar's neck edge 30°, armholes and caps 110–320°.
 */
const CURVE_DEG = 28;
/** Two curves this deep (deg) and bending the same way are never an implied seam. */
const DEEP_CURVE_DEG = 90;
/** A chain crosses a corner of its own piece turning less than this (deg). */
const SOFT_CORNER_DEG = 60;
/** A chain crosses a seam endpoint where the joined contour turns less than this (deg). */
const SOFT_JUNCTION_DEG = 45;
/** Sewn edges a chain may step across at one junction before it gives up. */
const WALK_GUARD = 6;
/** Score per edge beyond one on a side: a single edge is simpler than a chain of equal fit. */
const LINK_COST = 0.02;
/** Tie-break: sides whose outward normals oppose (face-up, drawn upright) pair first. */
const OPPOSE_TIE = 0.004;
/** A single edge shorter than this is never a side; a chain link shorter than this is skipped. */
const MIN_SIDE_MM = 30;
const MIN_LINK_MM = 10;
/** Mirror twins: their longest straight edges equal within this share are the centre line. */
const CENTRE_TOL = 0.02;
/** Mirror twins' edge rings line up when the summed length mismatch is within this perimeter share. */
const MIRROR_FIT = 0.05;
const STRAIGHT = 0.98;
/** A pair whose sides carry opposite hands (a right sleeve on the left armhole) pays this. */
const HAND_CROSS = 0.15;
/**
 * Sides cut to one length are a seam's best witness without notches: the bonus is whole when
 * the sewn lengths agree within this (mm, or share of the longer) and fades out from there.
 */
const EXACT_MM = 2;
const EXACT_REL = 0.01;
const EXACT_BONUS = 0.03;
/** Identical layers: an edge and the same edge of the twin layer read as one within this share. */
const LAYER_EDGE_REL = 0.01;
/** Identical layers: sewn along their designated edges (bonus), elsewhere a mistake (penalty). */
const LAYER_FIT = 0.03;
/** Two edges of one piece close it on itself when their lengths agree within this share. */
const SELF_REL = 0.03;
/**
 * An implied seam beside the step's own is kept only when it scores at least this well — a
 * back neck is no hem's partner, whatever the lengths say.
 */
export const GUESS_OK = -0.05;
/** Notch segments agree within this (mm, or share of the longer). */
const NOTCH_TOL_MM = 3;
const NOTCH_TOL_REL = 0.03;
/** The partner of a fully matched side must take part in the seam with at least this share. */
const ALIGN_SHARE = 0.5;
/**
 * A side shorter than this (mm) never joins two inputs beside the step's first proposal: three
 * panels of one front cut to one hem width meet hem to hem by length alone (card 58, op 80).
 */
const CONNECT_MIN_MM = 60;
/**
 * Panels of one part (pieces of one role, sewn side by side: their sides face opposite ways)
 * still hanging apart are joined up to this score, when their lengths agree within PANEL_REL —
 * a long side seam reads as a straight edge on a hooked one and scores no better (card 58, op 80).
 */
const PANEL_OK = 0.12;
const PANEL_REL = 0.1;
const PANEL_FACING = -0.7;
/** A chain sewn end to end within this share stands in for a partial reading it holds. */
const WHOLE_REL = 0.03;
/** A side sewn within this (mm) of its full length is read whole, not partially. */
const WHOLE_TOL_MM = 0.5;
/** What an alignment folds away costs this per whole side left over: sewing more wins. */
const FOLD_COST = 0.1;
/** A double notch: two notches this close are one. */
const MIN_SEG_MM = 5;
const BODY_ROLES = new Set(['front', 'back', 'side', 'yoke', 'placket', 'facing', 'fly', 'skirt']);
const NECK_ROLES = new Set(['collar', 'stand', 'rib', 'hood']);
const CENTRE_ROLES = new Set(['front', 'back']);
const TUBE_CLASSES: ReadonlySet<InputClass> = new Set(['sleeve', 'cuff', 'band']);

type InputClass = 'body' | 'sleeve' | 'neck' | 'cuff' | 'band' | 'other';

function roleOfPiece(piece: PieceGeom, geoms: ReadonlyMap<string, PieceGeom>): string | null {
  const own = readName(piece.name).role;
  if (roleDef(own)?.level === 'panel') return own;
  for (const twin of piece.twinOf ?? []) {
    if (twin.kind !== 'mirror') continue;
    const role = readName(geoms.get(twin.key)?.name ?? '').role;
    if (roleDef(role)?.level === 'panel') return role;
  }
  return own;
}

function classOf(group: { pieces: readonly string[] }, geoms: ReadonlyMap<string, PieceGeom>) {
  const roles = new Set(
    group.pieces
      .map((key) => geoms.get(key))
      .filter((piece): piece is PieceGeom => !!piece)
      .map((piece) => roleOfPiece(piece, geoms)),
  );
  if ([...roles].some((role) => !!role && BODY_ROLES.has(role))) return 'body' as const;
  if (roles.has('sleeve')) return 'sleeve' as const;
  if ([...roles].some((role) => !!role && NECK_ROLES.has(role))) return 'neck' as const;
  if (roles.has('cuff')) return 'cuff' as const;
  if (roles.has('waistband') || roles.has('hemband')) return 'band' as const;
  return 'other' as const;
}

function roleFits(input: InputClass, role: string | null): boolean {
  if (!role || input === 'other') return true;
  if (input === 'body') return BODY_ROLES.has(role);
  if (input === 'neck') return NECK_ROLES.has(role);
  return role === input || (input === 'band' && (role === 'waistband' || role === 'hemband'));
}

/** `sameHand`: both pieces named for the one hand (`FP_L`, `FP_1_L`). */
function pairRoleCost(a: string | null, b: string | null, sameHand: boolean): number {
  if (!a || !b) return 0;
  const pair = new Set([a, b]);
  // Two fronts meet only as the panels of ONE front (a left front's centre and side panels);
  // a left and a right front, or fronts no name hands, never meet edge to edge.
  if (a === 'front' && b === 'front') return sameHand ? 0.02 : Infinity;
  if (pair.has('front') && pair.has('back')) return -0.06;
  if (pair.has('front') && pair.has('placket')) return -0.06;
  if (pair.has('sleeve') && pair.has('cuff')) return -0.08;
  if (pair.has('collar') && pair.has('stand')) return -0.08;
  if (
    [...pair].some((role) => BODY_ROLES.has(role)) &&
    [...pair].some((role) => role === 'sleeve' || NECK_ROLES.has(role))
  )
    return -0.06;
  return a === b ? 0.02 : 0;
}

const isCurve = (turnDeg: number) => Math.abs(turnDeg) >= CURVE_DEG;
const isDeep = (turnDeg: number) => Math.abs(turnDeg) >= DEEP_CURVE_DEG;

/**
 * Curve against curve is a seam (opposite bends best: a cap on an armhole); a straight edge on a
 * gentle curve is a common one too (a yoke on a shaped back, a shaped side seam on a straight
 * one); a straight edge on a deep curve (a cap, a neckline) is not.
 */
function curveCost(a: number, b: number): number {
  const ca = isCurve(a);
  const cb = isCurve(b);
  if (ca && cb) return a * b < 0 ? -0.1 : -0.06;
  if (!ca && !cb) return 0;
  return isDeep(a) || isDeep(b) ? 0.08 : 0.03;
}

// ─── sides: single edges and chains ───────────────────────────────────────────────────────────────

/** One side of a candidate: a free edge, or neighbouring free edges of one input unit in order. */
type Side = {
  ids: EdgeId[];
  edges: Edge[];
  pieces: string[];
  lenMm: number;
  turnDeg: number;
  notches: number;
  /** Lengths between notches along the side in its order (a double notch read as one). */
  segs: number[];
  /** Summed outward chord normal (y up, CCW): the side's facing direction in the drawing. */
  nx: number;
  ny: number;
};

/**
 * What earlier steps have sewn, as a chain sees it. A chain entering a sewn edge at its start
 * (face-up, reversed seam) lands at the END of the other side's last edge and goes on from there.
 */
/** One seam an earlier step made: a stored row, or the best pair the step left implied. */
export type SewnPair = {
  a: EdgeId[];
  b: EdgeId[];
  stored: boolean;
  /**
   * What the step's row says it sews: a stored row, the step's own proposal, or the first join
   * the model makes between two of the step's inputs — not a further guess beside those.
   */
  own: boolean;
  /** Identical layers sewn as one (a cuff's two faces): no junction, drawn on each other. */
  layer: boolean;
  /** The model's score of an implied pair (lower is better; a stored row scores 0). */
  score: number;
};

/** Where a chain lands when it crosses a sewn edge: the other side's last edge. */
type Landing = { edge: Edge; piece: string };

type SewnState = {
  /** A stacked seam (a pocket bag and a panel on one edge) lands on each of its partners. */
  cross: Map<EdgeId, Landing[]>;
  /** Edges of stored seams of earlier steps: no side at all. */
  stored: Set<EdgeId>;
  /** Edges of stored seams and of what earlier steps' rows say they sew: no proposal takes them. */
  owned: Set<EdgeId>;
  /** Edges of stored or implied seams: no chain material. */
  sewn: Set<EdgeId>;
  /** Every seam sewn so far, in step order. */
  pairs: SewnPair[];
};

const emptyState = (): SewnState => ({
  cross: new Map(),
  stored: new Set(),
  owned: new Set(),
  sewn: new Set(),
  pairs: [],
});
const cloneState = (s: SewnState): SewnState => ({
  cross: new Map([...s.cross].map(([id, landings]) => [id, [...landings]])),
  stored: new Set(s.stored),
  owned: new Set(s.owned),
  sewn: new Set(s.sewn),
  pairs: [...s.pairs],
});

/** An edge's lengths between its notches, start to end; notches closer than a double notch merge. */
function segmentsOf(edge: Edge): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const n of [...edge.notchesMm].sort((x, y) => x - y)) {
    if (n - prev < MIN_SEG_MM || edge.lenMm - n < MIN_SEG_MM) continue;
    out.push(n - prev);
    prev = n;
  }
  out.push(edge.lenMm - prev);
  return out;
}

function sideOfEdges(edges: readonly Edge[]): Side {
  const side: Side = {
    ids: [],
    edges: [...edges],
    pieces: [],
    lenMm: 0,
    turnDeg: 0,
    notches: 0,
    segs: [],
    nx: 0,
    ny: 0,
  };
  for (const edge of edges) {
    side.ids.push(edge.id);
    if (!side.pieces.includes(edge.pieceKey)) side.pieces.push(edge.pieceKey);
    side.lenMm += edge.lenMm;
    side.turnDeg += edge.turnDeg;
    side.notches += edge.notchesMm.length;
    side.segs.push(...segmentsOf(edge));
    const p = edge.pts[0];
    const q = edge.pts[edge.pts.length - 1];
    if (p && q) {
      side.nx += q[1] - p[1];
      side.ny -= q[0] - p[0];
    }
  }
  return side;
}

// ─── hands ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Which side of the body an edge belongs to, read from the drawing (face up: a front's centre on
 * the viewer's right is the right front; a back's right is the wearer's right). A named hand
 * (`SLV_R`) is the piece's whole; a mirror-twin front / back takes its centre edge's side; a
 * symmetric front / back hands each edge by its side of the piece. Null where nothing says.
 */
type HandReader = (edge: Edge) => Hand;

function handReader(geoms: ReadonlyMap<string, PieceGeom>): HandReader {
  const centre = centreEdges(geoms);
  // A symmetric front's left edge (viewer's left, face up) is the wearer's right; a back's right
  // edge is. A half front with its centre on the viewer's right is the right front; a half back
  // with its centre on the viewer's left is the right back.
  const bySide = (role: string, x: -1 | 0 | 1): Hand =>
    x === 0 ? null : (role === 'front') === x < 0 ? 'R' : 'L';
  const pieceHand = new Map<string, Hand>();
  for (const g of geoms.values()) {
    if (g.hand) {
      pieceHand.set(g.pieceKey, g.hand);
      continue;
    }
    const role = roleOfPiece(g, geoms);
    if (!role || !CENTRE_ROLES.has(role)) continue;
    const own = plainEdges(g).find((e) => centre.has(e.id));
    if (own) pieceHand.set(g.pieceKey, bySide(role, (-xSideOf(g, own) as -1 | 0 | 1) || 0));
  }
  return (edge) => {
    const g = geoms.get(edge.pieceKey);
    if (!g) return null;
    if (pieceHand.has(g.pieceKey)) return pieceHand.get(g.pieceKey) ?? null;
    const role = roleOfPiece(g, geoms);
    if (!role || !CENTRE_ROLES.has(role)) return null;
    if (g.twinOf.some((t) => t.kind === 'mirror')) return null;
    return bySide(role, xSideOf(g, edge));
  };
}

/** The one hand a side's edges agree on; null when none has one or they disagree. */
function sideHand(side: Side, handOf: HandReader): Hand {
  let hand: Hand = null;
  for (const edge of side.edges) {
    const h = handOf(edge);
    if (!h) continue;
    if (hand && hand !== h) return null;
    hand = h;
  }
  return hand;
}

// ─── notches ──────────────────────────────────────────────────────────────────────────────────────

const near = (x: number, y: number) =>
  Math.abs(x - y) <= Math.max(NOTCH_TOL_MM, NOTCH_TOL_REL * Math.max(x, y));

/**
 * Every segment of `full`, in order, found in `part` in order (a part segment may be skipped:
 * a fold, a pleat, an extension the seam does not take): the matched length of `part`, or null.
 */
function matchInto(full: readonly number[], part: readonly number[]): number | null {
  if (full.length < 2) return null;
  let j = 0;
  let len = 0;
  for (const f of full) {
    while (j < part.length && !near(f, part[j])) j++;
    if (j >= part.length) return null;
    len += part[j];
    j++;
  }
  return len;
}

/**
 * The lengths two sides sew together as their notches read them: one side's notch segments all
 * found along the other, either way round — what is left over on the other side is folded away
 * (a box pleat at a back neck, a front edge's fold-back). Null when the notches tell nothing.
 */
type SewnLen = {
  aLen: number;
  bLen: number;
  /** The share of the folded side the seam takes: 1 when the notches align end to end. */
  share: number;
};

function sewnLengths(a: Side, b: Side): SewnLen | null {
  const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
  const found: SewnLen[] = [];
  for (const fullIsA of [true, false]) {
    const full = fullIsA ? a.segs : b.segs;
    const part = fullIsA ? b.segs : a.segs;
    for (const reversed of [false, true]) {
      const len = matchInto(full, reversed ? [...part].reverse() : part);
      if (len == null) continue;
      const share = len / Math.max(sum(part), 1);
      if (share < ALIGN_SHARE) continue;
      const fullLen = sum(full);
      found.push(
        fullIsA ? { aLen: fullLen, bLen: len, share } : { aLen: len, bLen: fullLen, share },
      );
    }
  }
  return found.sort((x, y) => y.share - x.share)[0] ?? null;
}

const cornerWin = Math.max(1, Math.round(SKELETON.cornerWinMm / SKELETON.resampleMm));

/** Contour turn at a resample index; NaN when the ring is too short to read a corner. */
const turnAt = (piece: PieceGeom, idx: number) =>
  piece.rs.length > 3 * cornerWin ? cornerTurn(piece, idx) : NaN;

/** The plain edge that follows `edge` around the piece's ring. */
function ringNext(piece: PieceGeom, edge: Edge): Edge | null {
  const n = piece.rs.length;
  if (!n) return null;
  let best: Edge | null = null;
  let bestGap = Infinity;
  for (const f of plainEdges(piece)) {
    if (f === edge) continue;
    const gap = (((f.s - edge.e) % n) + n) % n;
    if (gap < bestGap) {
      bestGap = gap;
      best = f;
    }
  }
  return best;
}

/** How a chain reads the sewn state of one unit: identical layers as one, stacked seams as all. */
type ChainCtx = {
  /** Sewn on this edge or on the same edge of an identical layer. */
  isSewn: (id: EdgeId) => boolean;
  /** Every landing across this edge's seams, on the unit's first layer. */
  landings: (id: EdgeId) => Landing[];
  /** Free material the chain may continue on (null: any unsewn edge). */
  isFree: ((id: EdgeId) => boolean) | null;
};

/**
 * Identical layers of a unit read as one: `BP_U#k` and `BP_U_1#k` are the same edge when the
 * layers' rings agree edge by edge, so a seam one layer carries (the yoke seam on the second
 * layer) is a junction for a chain walking the first, and a landing on the second layer goes
 * on along the first. The chain's reading of the state, for `follow`.
 */
function chainCtx(
  unit: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
  state: SewnState,
  followers: ReadonlySet<string>,
): ChainCtx {
  const alias = new Map<EdgeId, EdgeId[]>();
  const leaderEdge = new Map<EdgeId, Edge>();
  const inUnit = new Set(unit);
  for (const key of unit) {
    const g = geoms.get(key);
    if (!g) continue;
    for (const twin of g.twinOf) {
      if (twin.kind !== 'identical' || !inUnit.has(twin.key)) continue;
      const t = geoms.get(twin.key);
      if (!t) continue;
      const a = plainEdges(g);
      const b = plainEdges(t);
      if (a.length !== b.length) continue;
      if (a.some((e, k) => Math.abs(e.lenMm - b[k].lenMm) > LAYER_EDGE_REL * Math.max(e.lenMm, 1)))
        continue;
      a.forEach((e, k) => {
        alias.set(e.id, [...(alias.get(e.id) ?? []), b[k].id]);
        if (followers.has(key) && !followers.has(twin.key)) leaderEdge.set(e.id, b[k]);
      });
    }
  }
  const same = (id: EdgeId) => [id, ...(alias.get(id) ?? [])];
  const canon = (l: Landing): Landing => {
    const edge = leaderEdge.get(l.edge.id);
    return edge ? { edge, piece: edge.pieceKey } : l;
  };
  return {
    isSewn: (id) => same(id).some((x) => state.sewn.has(x)),
    landings: (id) => {
      const out: Landing[] = [];
      for (const x of same(id))
        for (const l of state.cross.get(x) ?? []) {
          const c = canon(l);
          if (!out.some((o) => o.edge.id === c.edge.id)) out.push(c);
        }
      return out;
    },
    isFree: null,
  };
}

/**
 * The free edge a chain continues onto after `edge`: the next edge of the same piece across a
 * soft corner, or — when that edge is sewn — the edge after the seam on the joined piece, when
 * the joined contour turns softly there. A stacked seam (a pocket bag and a panel sewn on one
 * edge) offers a landing on each partner: the chain takes the one that goes on along free
 * material with the smallest turn. Null at a hard corner, an unknown corner, or a seam whose far
 * side is unknown.
 */
function follow(
  edge: Edge,
  piece: PieceGeom,
  geoms: ReadonlyMap<string, PieceGeom>,
  ctx: ChainCtx,
  inUnit: ReadonlySet<string>,
): { id: EdgeId; junction: boolean } | null {
  const first = ringNext(piece, edge);
  if (!first) return null;
  const turn0 = turnAt(piece, edge.e);
  if (!Number.isFinite(turn0)) return null;
  if (!ctx.isSewn(first.id))
    return Math.abs(turn0) <= SOFT_CORNER_DEG ? { id: first.id, junction: false } : null;
  // A holder, not a plain `let`: TypeScript does not see the closure write it.
  const found: { best: { id: EdgeId; turn: number; free: boolean } | null } = { best: null };
  const visit = (next: Edge, turn: number, hop: number) => {
    if (hop >= WALK_GUARD) return;
    for (const land of ctx.landings(next.id)) {
      if (!inUnit.has(land.piece)) continue;
      const q = geoms.get(land.piece);
      if (!q) continue;
      const t = turnAt(q, land.edge.e);
      if (!Number.isFinite(t)) continue;
      const after = ringNext(q, land.edge);
      if (!after) continue;
      const turned = turn + t - 180;
      if (ctx.isSewn(after.id)) {
        visit(after, turned, hop + 1);
        continue;
      }
      if (Math.abs(turned) > SOFT_JUNCTION_DEG) continue;
      const free = ctx.isFree ? ctx.isFree(after.id) : true;
      if (
        !found.best ||
        (free && !found.best.free) ||
        (free === found.best.free && Math.abs(turned) < Math.abs(found.best.turn))
      )
        found.best = { id: after.id, turn: turned, free };
    }
  };
  visit(first, turn0, 0);
  return found.best ? { id: found.best.id, junction: true } : null;
}

/** Second and later identical layers of a unit: their edges lie under the first layer's. */
function layerFollowers(unit: readonly string[], geoms: ReadonlyMap<string, PieceGeom>) {
  const out = new Set<string>();
  const seen = new Set<string>();
  for (const key of unit) {
    const g = geoms.get(key);
    if (g?.twinOf.some((t) => t.kind === 'identical' && seen.has(t.key))) out.add(key);
    seen.add(key);
  }
  return out;
}

/** Mirror twins' edge rings run opposite ways: `P#k` ↔ `T#(c − k)` for the best-fitting offset. */
function mirrorEdges(p: PieceGeom, t: PieceGeom): Map<EdgeId, EdgeId> | null {
  const a = plainEdges(p);
  const b = plainEdges(t);
  const n = a.length;
  if (n < 2 || n !== b.length) return null;
  let best = -1;
  let bestCost = Infinity;
  for (let c = 0; c < n; c++) {
    let cost = 0;
    for (let k = 0; k < n; k++) cost += Math.abs(a[k].lenMm - b[(c - k + n) % n].lenMm);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  if (bestCost > MIRROR_FIT * Math.max(p.perimMm, 1)) return null;
  return new Map(a.map((edge, k) => [edge.id, b[(best - k + n) % n].id]));
}

/**
 * Every chain a unit offers: runs of free edges linked across soft corners and seam junctions.
 * A chain may stop at a junction but never inside a piece, and when it holds an edge whose
 * mirror edge is in the same run it holds that one too — a neckline takes both fronts.
 */
function chainSides(
  unit: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
  state: SewnState,
  exclude: ReadonlySet<EdgeId>,
): Side[] {
  const inUnit = new Set(unit);
  const followers = layerFollowers(unit, geoms);
  const ctx = chainCtx(unit, geoms, state, followers);
  const material = new Map<EdgeId, { edge: Edge; piece: PieceGeom }>();
  for (const key of unit) {
    const g = geoms.get(key);
    if (!g || followers.has(key)) continue;
    for (const edge of plainEdges(g)) {
      if (ctx.isSewn(edge.id) || exclude.has(edge.id) || edge.lenMm < MIN_LINK_MM) continue;
      material.set(edge.id, { edge, piece: g });
    }
  }
  if (material.size < 2) return [];
  ctx.isFree = (id) => material.has(id);

  const succ = new Map<EdgeId, { id: EdgeId; junction: boolean }>();
  const pred = new Set<EdgeId>();
  for (const [id, { edge, piece }] of material) {
    const link = follow(edge, piece, geoms, ctx, inUnit);
    if (!link || link.id === id || !material.has(link.id) || pred.has(link.id)) continue;
    succ.set(id, link);
    pred.add(link.id);
  }

  const mirror = new Map<EdgeId, EdgeId>();
  for (const key of unit) {
    const g = geoms.get(key);
    if (!g) continue;
    for (const twin of g.twinOf) {
      if (twin.kind !== 'mirror' || !inUnit.has(twin.key)) continue;
      const t = geoms.get(twin.key);
      const map = t ? mirrorEdges(g, t) : null;
      for (const [a, b] of map ?? []) mirror.set(a, b);
    }
  }

  type Run = { segments: EdgeId[][]; closed: boolean };
  const seen = new Set<EdgeId>();
  const walk = (start: EdgeId): Run => {
    const ids: EdgeId[] = [];
    const junctionBefore: boolean[] = [];
    let cur = start;
    let entry = false;
    let closed = false;
    for (;;) {
      ids.push(cur);
      junctionBefore.push(entry);
      seen.add(cur);
      const next = succ.get(cur);
      if (!next) break;
      if (next.id === start) {
        closed = true;
        junctionBefore[0] = next.junction;
        break;
      }
      if (seen.has(next.id)) break;
      cur = next.id;
      entry = next.junction;
    }
    // Segments split only at junctions; a cycle starts at a junction when it has one.
    let order = ids.map((_, k) => k);
    if (closed) {
      const first = junctionBefore.findIndex(Boolean);
      if (first > 0) order = [...order.slice(first), ...order.slice(0, first)];
    }
    const segments: EdgeId[][] = [];
    for (const k of order) {
      if (!segments.length || junctionBefore[k]) segments.push([]);
      segments[segments.length - 1].push(ids[k]);
    }
    return { segments, closed };
  };
  const runs: Run[] = [];
  for (const id of material.keys()) if (!pred.has(id) && !seen.has(id)) runs.push(walk(id));
  for (const id of material.keys()) if (!seen.has(id)) runs.push(walk(id));

  const out: Side[] = [];
  for (const run of runs) {
    const all = new Set(run.segments.flat());
    const m = run.segments.length;
    const offer = (segs: EdgeId[][]) => {
      const ids = segs.flat();
      if (ids.length < 2) return;
      const has = new Set(ids);
      for (const id of ids) {
        const twin = mirror.get(id);
        if (twin && all.has(twin) && !has.has(twin)) return;
      }
      const edges = ids.flatMap((id) => material.get(id)?.edge ?? []);
      if (edges.length === ids.length) out.push(sideOfEdges(edges));
    };
    if (!run.closed) {
      for (let i = 0; i < m; i++) for (let j = i; j < m; j++) offer(run.segments.slice(i, j + 1));
    } else {
      // A closed run (an armhole once shoulder and side seam are sewn) opens at any of its
      // junctions: the whole of it from each — its notches read from there — and every shorter
      // stretch.
      for (let start = 0; start < m; start++)
        for (let len = 1; len <= m; len++)
          offer(Array.from({ length: len }, (_, k) => run.segments[(start + k) % m]));
    }
  }
  return out;
}

// ─── scoring ──────────────────────────────────────────────────────────────────────────────────────

type Scored = {
  score: number;
  a: Side;
  b: Side;
  layer: boolean;
  /** What the sides sew together, mm — the full sides, or what their notches align. */
  aLen: number;
  bLen: number;
};

/** Centre lines: mirror-twin fronts / backs whose longest straight edges match in length. */
function centreEdges(geoms: ReadonlyMap<string, PieceGeom>): Set<EdgeId> {
  const out = new Set<EdgeId>();
  const centre = (g: PieceGeom): Edge | null => {
    let best: Edge | null = null;
    for (const e of plainEdges(g)) if (!best || e.lenMm > best.lenMm) best = e;
    return best && best.chordMm / Math.max(best.lenMm, 1) >= STRAIGHT ? best : null;
  };
  for (const g of geoms.values()) {
    const role = roleOfPiece(g, geoms);
    if (!role || !CENTRE_ROLES.has(role)) continue;
    for (const twin of g.twinOf) {
      if (twin.kind !== 'mirror') continue;
      const t = geoms.get(twin.key);
      const a = centre(g);
      const b = t ? centre(t) : null;
      if (!a || !b || Math.abs(a.lenMm - b.lenMm) > CENTRE_TOL * Math.max(a.lenMm, b.lenMm))
        continue;
      out.add(a.id);
      out.add(b.id);
    }
  }
  return out;
}

type ScoreCtx = {
  geoms: ReadonlyMap<string, PieceGeom>;
  ease: number | null;
  /** Implied seams are guesses: the conservative filters apply and layer seams are marked. */
  implied: boolean;
  centre: ReadonlySet<EdgeId>;
  handOf: HandReader;
};

function scoreSides(
  a: Side,
  b: Side,
  classA: InputClass,
  classB: InputClass,
  ctx: ScoreCtx,
): Scored | null {
  const { geoms, ease } = ctx;
  if (a.pieces.some((p) => b.pieces.includes(p))) return null;
  const chain = a.ids.length > 1 || b.ids.length > 1;
  const structuralCurve =
    (classA === 'body' && (classB === 'sleeve' || classB === 'neck')) ||
    (classB === 'body' && (classA === 'sleeve' || classA === 'neck'));
  if (structuralCurve && !(isCurve(a.turnDeg) && isCurve(b.turnDeg))) return null;
  let roleSum = 0;
  let pairs = 0;
  let layer = false;
  let twins = false;
  let layerFit = 0;
  for (const pa of a.pieces) {
    for (const pb of b.pieces) {
      const ga = geoms.get(pa);
      const gb = geoms.get(pb);
      if (!ga || !gb) return null;
      const roleA = roleOfPiece(ga, geoms);
      const roleB = roleOfPiece(gb, geoms);
      // The veto reads names only: FL (a flap by name, FR's mirror twin) is a front here.
      if (roleVeto(ga, gb) && roleA === roleOf(ga) && roleB === roleOf(gb)) return null;
      const cost = pairRoleCost(roleA, roleB, !!ga.hand && ga.hand === gb.hand);
      if (!Number.isFinite(cost)) return null;
      roleSum += cost;
      pairs++;
      if (ga.twinOf.some((t) => t.key === pb && t.kind === 'identical')) {
        twins = true;
        // Identical layers are sewn once, along their designated edges (a collar's outer edge,
        // its neck edge left open for the body), never along a chain: a guess takes nothing
        // else, a proposal ranks the designated pair first.
        const designated =
          !chain &&
          identicalSeamEdge(ga)?.id === a.ids[0] &&
          identicalSeamEdge(gb)?.id === b.ids[0];
        if (ctx.implied && !designated) return null;
        layerFit = designated ? -LAYER_FIT : LAYER_FIT;
        layer = !chain;
      }
    }
  }
  if (ctx.implied) {
    const deep = (s: Side) => Math.abs(s.turnDeg) >= DEEP_CURVE_DEG;
    if (deep(a) && deep(b) && a.turnDeg * b.turnDeg > 0) return null;
    const crossesCentre = (s: Side, other: Side) =>
      s.ids.some((id) => {
        if (!ctx.centre.has(id)) return false;
        const g = geoms.get(pieceOf(id));
        return other.pieces.some((p) => !g?.twinOf.some((t) => t.key === p && t.kind === 'mirror'));
      });
    if (crossesCentre(a, b) || crossesCentre(b, a)) return null;
  }
  // What the sides sew: the full sides, or — when one side's notches all find their places along
  // the other — the notched stretch, the rest of the other side folded away.
  const plain: SewnLen = { aLen: a.lenMm, bLen: b.lenMm, share: 1 };
  const relOf = (l: SewnLen) => deltaMm(l.aLen, l.bLen, ease) / Math.max(l.aLen, l.bLen, 1);
  const aligned = a.notches && b.notches ? sewnLengths(a, b) : null;
  // The notched reading when it fits no worse: an alignment end to end reads the plain lengths
  // and is still the notches agreeing (a cap's shoulder notch sits at the armhole's junction).
  const sewn = aligned && relOf(aligned) <= relOf(plain) ? aligned : plain;
  const rel = relOf(sewn);
  if (rel > (chain ? CHAIN_REL : SUGGEST_REL)) return null;
  // Notches that align are the best witness; what the alignment folds away still costs — a back
  // armhole alone fits half a sleeve cap, the whole armhole fits all of it and must win.
  const notch =
    sewn !== plain
      ? -0.02 + FOLD_COST * (1 - sewn.share)
      : a.notches !== b.notches
        ? 0.02
        : a.notches > 0
          ? -0.01
          : 0;
  const slack = Math.max(EXACT_MM, EXACT_REL * Math.max(sewn.aLen, sewn.bLen));
  const exact = -EXACT_BONUS * Math.max(0, 1 - deltaMm(sewn.aLen, sewn.bLen, ease) / slack);
  const handA = sideHand(a, ctx.handOf);
  const handB = sideHand(b, ctx.handOf);
  const hands = handA && handB && handA !== handB ? HAND_CROSS : 0;
  const fits = (s: Side, input: InputClass) =>
    s.pieces.every((p) => {
      const g = geoms.get(p);
      return !g || roleFits(input, roleOfPiece(g, geoms));
    });
  const endpoint = (fits(a, classA) ? -0.025 : 0.1) + (fits(b, classB) ? -0.025 : 0.1);
  const shape = curveCost(a.turnDeg, b.turnDeg);
  const lengthTie = -Math.min(a.lenMm, b.lenMm, 1000) / 1_000_000;
  const links = LINK_COST * (a.ids.length + b.ids.length - 2);
  const na = Math.hypot(a.nx, a.ny);
  const nb = Math.hypot(b.nx, b.ny);
  // Pieces sewn and opened face each other across the seam. Identical layers lie ON each other,
  // drawn alike: their sewn edges are the one pair that faces the same way (a cuff's two top
  // edges, not a top and a bottom — that pair would fold the layer over).
  const facing = na > 0 && nb > 0 ? (a.nx * b.nx + a.ny * b.ny) / (na * nb) : 0;
  const oppose = (OPPOSE_TIE * (1 + (twins ? -facing : facing))) / 2;
  const score =
    rel +
    notch +
    exact +
    endpoint +
    roleSum / pairs +
    shape +
    lengthTie +
    links +
    oppose +
    hands +
    layerFit;
  return { score, a, b, layer, aLen: sewn.aLen, bLen: sewn.bLen };
}

/**
 * Pairs that close one input on itself: two free edges of one piece, not neighbours, one on each
 * side of the piece, running opposite ways over at least half its height, equal in length — a
 * sleeve's underarm, a cuff's or a band's ends. Best first.
 */
function selfPairs(
  group: { pieces: readonly string[] },
  geoms: ReadonlyMap<string, PieceGeom>,
  used: ReadonlySet<EdgeId>,
): Scored[] {
  const out: Scored[] = [];
  const followers = layerFollowers(group.pieces, geoms);
  for (const key of group.pieces) {
    const piece = geoms.get(key);
    if (!piece || followers.has(key)) continue;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [, y] of piece.rs) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const height = y1 - y0;
    const rise = (e: Edge) => (e.pts[e.pts.length - 1]?.[1] ?? 0) - (e.pts[0]?.[1] ?? 0);
    const edges = plainEdges(piece).filter((e) => !used.has(e.id) && e.lenMm >= MIN_SIDE_MM);
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const a = edges[i];
        const b = edges[j];
        if (ringNext(piece, a) === b || ringNext(piece, b) === a) continue;
        const xa = xSideOf(piece, a);
        const xb = xSideOf(piece, b);
        if (!xa || !xb || xa === xb) continue;
        const ra = rise(a);
        const rb = rise(b);
        if (ra * rb >= 0 || Math.min(Math.abs(ra), Math.abs(rb)) < height / 2) continue;
        const rel = deltaMm(a.lenMm, b.lenMm, null) / Math.max(a.lenMm, b.lenMm, 1);
        if (rel > SELF_REL) continue;
        out.push({
          score: rel - Math.min(a.lenMm, b.lenMm, 1000) / 1_000_000,
          a: sideOfEdges([a]),
          b: sideOfEdges([b]),
          layer: false,
          aLen: a.lenMm,
          bLen: b.lenMm,
        });
      }
    }
  }
  return out.sort((x, y) => x.score - y.score);
}

/** The one hand an input's pieces agree on (a left sleeve with its cuff); null when none or mixed. */
function groupHand(group: { pieces: readonly string[] }, geoms: ReadonlyMap<string, PieceGeom>) {
  let hand: Hand = null;
  for (const key of group.pieces) {
    const h = geoms.get(key)?.hand ?? null;
    if (!h) continue;
    if (hand && hand !== h) return null;
    hand = h;
  }
  return hand;
}

/**
 * Edges an input may sew again: sewn to a piece of the SAME input by an earlier step (a pocket
 * bag on a panel's edge, the first layer of a yoke on the back), they are still the input's
 * outline and take the next piece on top — a stacked seam. A layer seam (identical layers sewn
 * face to face) is closed, not an outline.
 */
function stackable(
  group: { pieces: readonly string[] },
  state: SewnState,
  used: ReadonlySet<EdgeId>,
): Set<EdgeId> {
  const own = new Set(group.pieces);
  const out = new Set<EdgeId>();
  for (const pair of state.pairs) {
    if (pair.layer || pair.stored) continue;
    const inside = [...pair.a, ...pair.b].every((id) => own.has(pieceOf(id)) && !used.has(id));
    if (!inside) continue;
    for (const id of [...pair.a, ...pair.b]) out.add(id);
  }
  return out;
}

/**
 * Every plausible pair across two different input units, best first. With three or more
 * inputs, two of opposite hands (a left and a right sleeve round a body) are never paired.
 */
function scoredPairs(
  groups: readonly { pieces: readonly string[] }[],
  geoms: ReadonlyMap<string, PieceGeom>,
  state: SewnState,
  used: ReadonlySet<EdgeId>,
  ease: number | null,
  implied: boolean,
): Scored[] {
  const ctx: ScoreCtx = {
    geoms,
    ease,
    implied,
    centre: implied ? centreEdges(geoms) : new Set(),
    handOf: handReader(geoms),
  };
  const sidesOf = (group: { pieces: readonly string[] }): Side[] => {
    const followers = layerFollowers(group.pieces, geoms);
    const stack = stackable(group, state, used);
    const singles = group.pieces.flatMap((p) => {
      const g = geoms.get(p);
      if (!g || followers.has(p)) return [];
      // A proposal leaves alone what earlier rows sew (a cuff's layer seam), not what the model
      // merely guessed there; a guess leaves alone every sewn edge — except what the input may
      // sew again on top of its own seam.
      return plainEdges(g)
        .filter(
          (e) =>
            !used.has(e.id) &&
            (!(implied ? state.sewn : state.owned).has(e.id) || stack.has(e.id)) &&
            e.lenMm >= MIN_SIDE_MM,
        )
        .map((e) => sideOfEdges([e]));
    });
    return [...singles, ...chainSides(group.pieces, geoms, state, used)];
  };
  const sides = groups.map(sidesOf);
  const classes = groups.map((group) => classOf(group, geoms));
  const hands = groups.map((group) => groupHand(group, geoms));
  const out: Scored[] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (groups.length >= 3 && hands[i] && hands[j] && hands[i] !== hands[j]) continue;
      for (const a of sides[i]) {
        for (const b of sides[j]) {
          const scored = scoreSides(a, b, classes[i], classes[j], ctx);
          if (scored) out.push(scored);
        }
      }
    }
  }
  return out.sort((x, y) => x.score - y.score);
}

// ─── what earlier steps sewed ─────────────────────────────────────────────────────────────────────

/** Records a seam: its edges leave the pool; unless it is a layer seam, it becomes a junction. */
function sew(
  state: SewnState,
  a: readonly EdgeId[],
  b: readonly EdgeId[],
  geoms: ReadonlyMap<string, PieceGeom>,
  opts: { stored: boolean; junction: boolean; own?: boolean; score?: number },
) {
  for (const id of [...a, ...b]) {
    state.sewn.add(id);
    if (opts.stored) state.stored.add(id);
    if (opts.stored || opts.own) state.owned.add(id);
  }
  if (a.length && b.length)
    state.pairs.push({
      a: [...a],
      b: [...b],
      stored: opts.stored,
      own: opts.stored || !!opts.own,
      layer: isLayerSeam(a, b, geoms),
      score: opts.score ?? 0,
    });
  if (!opts.junction || !a.length || !b.length) return;
  const lastA = edgeOf(a[a.length - 1], geoms);
  const lastB = edgeOf(b[b.length - 1], geoms);
  if (!lastA || !lastB) return;
  const land = (id: EdgeId, edge: Edge) => {
    const landings = state.cross.get(id) ?? [];
    if (!landings.some((l) => l.edge.id === edge.id))
      state.cross.set(id, [...landings, { edge, piece: edge.pieceKey }]);
  };
  land(a[0], lastB);
  land(b[0], lastA);
}

function isLayerSeam(
  a: readonly EdgeId[],
  b: readonly EdgeId[],
  geoms: ReadonlyMap<string, PieceGeom>,
) {
  const pa = new Set(a.map(pieceOf));
  const pb = new Set(b.map(pieceOf));
  if (pa.size !== 1 || pb.size !== 1) return false;
  const [ka] = pa;
  const [kb] = pb;
  return !!geoms.get(ka)?.twinOf.some((t) => t.key === kb && t.kind === 'identical');
}

/**
 * One earlier step's seams into the state: the stored ones first, then — for what the step's
 * inputs still have free — the best-scoring pairs as implied seams, each edge sewn once.
 * Implied seams only build junctions and keep chains off edges they take; a single edge an
 * implied seam guessed wrong still shows as itself.
 */
function applyStep(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
  seams: ReadonlyMap<string, StoredSeam> | undefined,
  state: SewnState,
) {
  const op = ops[index];
  if (!op || op.assemblyBlockDetached) return;
  const groups = inputGroups(ops, index, pieceKeys);
  if (!groups.length) return;
  const groupOf = new Map<string, number>();
  groups.forEach((g, n) => g.pieces.forEach((p) => groupOf.set(p, n)));
  // The inputs the sewn pairs connect, as one set each: the first pair between two sets is what
  // the step's row says it does, any pair inside one set a guess. Not "the first pair between
  // two inputs": a step of three inputs joins them with two seams, and a third pair between two
  // inputs already connected through the other is a coincidence (card 59, op 610).
  const root = groups.map((_, n) => n);
  const find = (n: number): number => (root[n] === n ? n : (root[n] = find(root[n])));
  const connect = (a: readonly EdgeId[], b: readonly EdgeId[]) => {
    const i = find(groupOf.get(pieceOf(a[0])) ?? -1);
    const j = find(groupOf.get(pieceOf(b[0])) ?? -1);
    if (i < 0 || j < 0 || i === j) return false;
    root[i] = j;
    return true;
  };
  const rows = storedSidesOf(op, seams);
  for (const seam of rows) {
    sew(state, seam.a, seam.b, geoms, {
      stored: true,
      junction: seam.direction !== 'same' && !isLayerSeam(seam.a, seam.b, geoms),
    });
    if (seam.a.length && seam.b.length) connect(seam.a, seam.b);
  }
  const taken = new Set(state.sewn);
  const ease = easeOf(op);
  if (groups.length === 1) {
    // One input a join closes on itself: its best self pair, unless a row says what it sews.
    if (rows.length || !selfJoin(op, groups[0], geoms)) return;
    const cand = selfPairs(groups[0], geoms, state.stored).find(
      (c) => ![...c.a.ids, ...c.b.ids].some((id) => taken.has(id)),
    );
    if (cand)
      sew(state, cand.a.ids, cand.b.ids, geoms, { stored: false, junction: true, own: true });
    return;
  }
  if (sewsNothing(op)) return;
  // The step's own proposal first — what its row offers is what the step sews (a placket onto a
  // front's centre edge, which no guess would cross) — then the best guesses for what is still
  // free: a pair that connects two inputs still apart is what the step does, a further one
  // (the proposal too, once a stored row connects them) only when it scores like a seam, not
  // like a coincidence of lengths.
  const stack = new Set(groups.flatMap((g) => [...stackable(g, state, state.stored)]));
  // What the step proposes connects every input: those pairs are its own seams — the first
  // always, a further one when a guess could have made it too (no centre line crossed, no two
  // deep curves bending one way). A yoke proposed beside a layer seam is sewn, so a later
  // sleeve finds the armhole, not the yoke edge (card 59, op 610 → 670).
  const connecting: Scored[] = [];
  proposalsOf(groups, geoms, state, state.stored, ease, connecting);
  const guesses = scoredPairs(groups, geoms, state, state.stored, ease, true);
  const pairKey = (c: Scored) => [...c.a.ids, '|', ...c.b.ids].join(',');
  const guessable = new Set(guesses.map(pairKey));
  const own = connecting.filter((c, n) => n === 0 || guessable.has(pairKey(c)));
  for (const cand of [...own, ...guesses]) {
    const ids = [...cand.a.ids, ...cand.b.ids];
    // An edge this step already took is gone; one an earlier step sewed inside the input is
    // stacked on, once.
    if (ids.some((id) => taken.has(id) && !(stack.has(id) && stack.delete(id)))) continue;
    const first = connect(cand.a.ids, cand.b.ids);
    if (!first && cand.score > GUESS_OK) continue;
    for (const id of ids) taken.add(id);
    sew(state, cand.a.ids, cand.b.ids, geoms, {
      stored: false,
      junction: !cand.layer,
      own: first,
      score: cand.score,
    });
  }
}

type StateCache = {
  pieceKeys: ReadonlySet<string>;
  geoms: ReadonlyMap<string, PieceGeom>;
  seams: ReadonlyMap<string, StoredSeam> | undefined;
  states: SewnState[];
};
const stateCache = new WeakMap<readonly FormOpLike[], StateCache>();

/** The sewn state before a step, built step by step and kept per ops array. */
function stateBefore(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
  seams: ReadonlyMap<string, StoredSeam> | undefined,
): SewnState {
  let cache = stateCache.get(ops);
  if (!cache || cache.pieceKeys !== pieceKeys || cache.geoms !== geoms || cache.seams !== seams) {
    cache = { pieceKeys, geoms, seams, states: [emptyState()] };
    stateCache.set(ops, cache);
  }
  while (cache.states.length <= index) {
    const i = cache.states.length - 1;
    const next = cloneState(cache.states[i]);
    applyStep(ops, i, pieceKeys, geoms, seams, next);
    cache.states.push(next);
  }
  return cache.states[index];
}

/**
 * The seams the steps before `index` made, stored rows and implied guesses alike, in step order —
 * what a unit on this step's WITH row is already sewn along. `ops.length` reads the whole card.
 */
export function sewnBeforeStep(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
  seams?: ReadonlyMap<string, StoredSeam>,
): readonly SewnPair[] {
  return stateBefore(ops, Math.min(index, ops.length), pieceKeys, geoms, seams).pairs;
}

// ─── the suggestion ───────────────────────────────────────────────────────────────────────────────

/**
 * The best free outer-edge pair across two different input units: single edges, or chains of
 * neighbouring free edges of one unit (across soft corners and across the seams earlier steps
 * made — an armhole of front + back, a neckline of front + back + front). Length is the gate;
 * roles, curve compatibility and notches rank the plausible pairs inside it. A body ↔ sleeve or
 * body ↔ neck join is an armhole ↔ cap or a neckline ↔ collar: only a curve ↔ curve pair is
 * offered there — a side seam or a hem that happens to have the right length is no answer, so
 * the row says «no seam» instead. Without a step list, chains cross no seams.
 */
export function suggestPair(
  groups: readonly { pieces: readonly string[] }[],
  geoms: ReadonlyMap<string, PieceGeom>,
  used: ReadonlySet<EdgeId>,
  ease: number | null,
): Suggestion | null {
  return proposalsOf(groups, geoms, emptyState(), used, ease)[0] ?? null;
}

/** One of the seams a step proposes, with the side of the body it sits on when the pieces say. */
export type StepProposal = Suggestion & { hand: Hand };

/** «left» / «right» by the proposal's hand, else «seam n». */
export function proposalLabel(proposal: StepProposal, index: number): string {
  return proposal.hand === 'L' ? 'left' : proposal.hand === 'R' ? 'right' : `seam ${index + 1}`;
}

/**
 * A side read by its notches as part of the other (a back armhole on half a cap) gives way to a
 * chain that holds it and sews the same partner end to end: the chain takes the partial's
 * place in the ranking, the partial is dropped. Card 69, op 250: BP#5 alone aligns with half of
 * SLV_L#0 and outscores FL#1 + BP#5, the whole armhole; cards 57/70/71: the armhole without its
 * back yoke edge.
 */
export function wholeOverPartial(scored: readonly Scored[]): Scored[] {
  const partial = (c: Scored) =>
    Math.abs(c.aLen - c.a.lenMm) > WHOLE_TOL_MM || Math.abs(c.bLen - c.b.lenMm) > WHOLE_TOL_MM;
  const plainRel = (c: Scored) =>
    Math.abs(c.a.lenMm - c.b.lenMm) / Math.max(c.a.lenMm, c.b.lenMm, 1);
  const same = (x: Side, y: Side) =>
    x.ids.length === y.ids.length && x.ids.every((id) => y.ids.includes(id));
  const holds = (big: Side, small: Side) =>
    big.ids.length > small.ids.length && small.ids.every((id) => big.ids.includes(id));
  const whole = scored.filter((w) => !partial(w) && plainRel(w) <= WHOLE_REL);
  const holder = (c: Scored) =>
    whole.find(
      (w) =>
        (same(w.a, c.a) && holds(w.b, c.b)) ||
        (same(w.b, c.b) && holds(w.a, c.a)) ||
        (same(w.a, c.b) && holds(w.b, c.a)) ||
        (same(w.b, c.a) && holds(w.a, c.b)),
    );
  const promoted = new Map<Scored, number>();
  const kept = scored.filter((c) => {
    const w = partial(c) ? holder(c) : undefined;
    if (w) promoted.set(w, Math.min(promoted.get(w) ?? w.score, c.score));
    return !w;
  });
  if (!promoted.size) return kept;
  return kept
    .map((c) => (promoted.has(c) ? { ...c, score: promoted.get(c)! } : c))
    .sort((x, y) => x.score - y.score);
}

/**
 * The step's seams: the best pair, then — on a step with three or more inputs — the best pair
 * between two inputs no earlier proposal joins, on edges no earlier proposal takes, on a hand no
 * earlier proposal has, as long as it scores like a seam (both sleeves on a body, both side
 * seams of a back). Hands read from the pieces: a right sleeve, a left front, a symmetric back's
 * edge by its side. Left before right before the unhanded, best first within.
 */
function proposalsOf(
  groups: readonly { pieces: readonly string[] }[],
  geoms: ReadonlyMap<string, PieceGeom>,
  state: SewnState,
  used: ReadonlySet<EdgeId>,
  ease: number | null,
  connecting?: Scored[],
): StepProposal[] {
  const handOf = handReader(geoms);
  const groupOf = new Map<string, number>();
  groups.forEach((g, n) => g.pieces.forEach((p) => groupOf.set(p, n)));
  // The inputs a proposal has already joined, as one set each: a proposal joins two sets, until
  // every input is in one.
  const root = groups.map((_, n) => n);
  const find = (n: number): number => (root[n] === n ? n : (root[n] = find(root[n])));
  let parts = groups.length;
  const joinOf = (a: Side, b: Side) => {
    const i = groupOf.get(a.pieces[0]) ?? -1;
    const j = groupOf.get(b.pieces[0]) ?? -1;
    return `${Math.min(i, j)}|${Math.max(i, j)}`;
  };
  const joined = new Set<string>();
  const taken = new Set<EdgeId>();
  const hands = new Set<Hand>();
  const out: StepProposal[] = [];
  const take = (cand: Scored, hand: Hand) => {
    joined.add(joinOf(cand.a, cand.b));
    hands.add(hand);
    for (const id of [...cand.a.ids, ...cand.b.ids]) taken.add(id);
    out.push({ a: cand.a.ids, b: cand.b.ids, aLen: cand.aLen, bLen: cand.bLen, hand });
  };
  const scored = wholeOverPartial(scoredPairs(groups, geoms, state, used, ease, false));
  const long = (c: Scored) => Math.min(c.a.lenMm, c.b.lenMm) >= CONNECT_MIN_MM;
  const roleOfKey = (p: string) => {
    const g = geoms.get(p);
    return g ? roleOfPiece(g, geoms) : null;
  };
  // Two panels of one part laid side by side: one role, sides facing opposite ways, one length.
  const panels = (c: Scored) => {
    const roles = new Set([...c.a.pieces, ...c.b.pieces].map(roleOfKey));
    const na = Math.hypot(c.a.nx, c.a.ny);
    const nb = Math.hypot(c.b.nx, c.b.ny);
    const facing = na > 0 && nb > 0 ? (c.a.nx * c.b.nx + c.a.ny * c.b.ny) / (na * nb) : 0;
    return (
      roles.size === 1 &&
      !roles.has(null) &&
      facing <= PANEL_FACING &&
      Math.abs(c.aLen - c.bLen) / Math.max(c.aLen, c.bLen, 1) <= PANEL_REL
    );
  };
  // First what connects every input — the step joins them all, so each set's best free pair to
  // another set, whatever it scores and whichever hand it is on (three left pieces of one front).
  for (const cand of scored) {
    if (parts <= 1) break;
    if (out.length && cand.score > PANEL_OK) break;
    if (out.length && (!long(cand) || (cand.score > GUESS_OK && !panels(cand)))) continue;
    if ([...cand.a.ids, ...cand.b.ids].some((id) => taken.has(id))) continue;
    const i = find(groupOf.get(cand.a.pieces[0]) ?? -1);
    const j = find(groupOf.get(cand.b.pieces[0]) ?? -1);
    if (i < 0 || j < 0 || i === j) continue;
    root[i] = j;
    parts--;
    connecting?.push(cand);
    take(cand, sideHand(cand.a, handOf) ?? sideHand(cand.b, handOf));
  }
  // Then what closes a ring (the panels of a bag): a pair between two inputs no proposal joins
  // yet, on a hand none has, as long as it scores like a seam.
  for (const cand of scored) {
    if (cand.score > GUESS_OK) break;
    if (!long(cand)) continue;
    if ([...cand.a.ids, ...cand.b.ids].some((id) => taken.has(id))) continue;
    if (joined.has(joinOf(cand.a, cand.b))) continue;
    const hand = sideHand(cand.a, handOf) ?? sideHand(cand.b, handOf);
    if (hand && hands.has(hand)) continue;
    take(cand, hand);
  }
  const rank = (h: Hand) => (h === 'L' ? 0 : h === 'R' ? 1 : 2);
  return out
    .map((p, i) => ({ p, i }))
    .sort((x, y) => rank(x.p.hand) - rank(y.p.hand) || x.i - y.i)
    .map(({ p }) => p);
}

/**
 * Every seam one step proposes (see `proposalsOf`): one per pair of inputs, best first — a step
 * that sets both sleeves offers the left cap on the left armhole and the right on the right.
 */
export function suggestStepPairs(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
  used: ReadonlySet<EdgeId>,
  ease: number | null,
  seams?: ReadonlyMap<string, StoredSeam>,
): StepProposal[] {
  const op = ops[index];
  const groups = inputGroups(ops, index, pieceKeys);
  if (!groups.length || (groups.length >= 2 && sewsNothing(op) && !keyedOf(op))) return [];
  const state = stateBefore(ops, index, pieceKeys, geoms, seams);
  if (groups.length === 1) {
    if (!selfJoin(op, groups[0], geoms)) return [];
    const best = selfPairs(groups[0], geoms, new Set([...used, ...state.stored]))[0];
    return best
      ? [{ a: best.a.ids, b: best.b.ids, aLen: best.aLen, bLen: best.bLen, hand: null }]
      : [];
  }
  return proposalsOf(groups, geoms, state, used, ease);
}

/**
 * One step's suggestion, including the shared WITH piece-count gate. With the card's seams the
 * earlier steps' stored seams are junctions a chain may cross; what those steps left unsewn is
 * filled in by implied seams (the same scoring, each edge once), so a chain can also cross a
 * seam the technologist has not recorded yet.
 */
export function suggestStepPair(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
  used: ReadonlySet<EdgeId>,
  ease: number | null,
  seams?: ReadonlyMap<string, StoredSeam>,
): Suggestion | null {
  return suggestStepPairs(ops, index, pieceKeys, geoms, used, ease, seams)[0] ?? null;
}

/** Compact words shared by the row and picker: `BP_U-5 ↔ BP_MAIN-1`. */
export function suggestionWords(suggestion: Suggestion, nameOf: (piece: string) => string): string {
  const words = (ids: readonly EdgeId[]) =>
    ids.map((id) => `${nameOf(pieceOf(id))}-${id.slice(id.lastIndexOf('#') + 1)}`).join(' + ');
  return `${words(suggestion.a)} ↔ ${words(suggestion.b)}`;
}

// ─── the rows a pick writes ───────────────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const polyLen = (pts: readonly Pt[]) =>
  pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : s), 0);

/** An inner line of a host piece as an anchor: edge hint `i<k>`, samples in the host's frame. */
export function innerAnchor(
  host: PieceGeom,
  k: number,
  line: readonly Pt[],
  grainDeg: number,
  placement?: SeamPlacement,
): EdgeAnchor | null {
  const pts: Pt2[] = line.map(([x, y]) => [x, -y]);
  const len = polyLen(line);
  if (pts.length < 2 || !(len > 0)) return null;
  const f = frameOf(host, grainDeg);
  return {
    piece: host.pieceKey,
    samples: runSamples(f, { pts }).map(([u, v]) => [r(clamp01(u), 3), r(clamp01(v), 3)]),
    perimShare: r(Math.min(1, Math.max(1e-4, len / (host.perimMm || len))), 4),
    lenMm: r(len, 1),
    notches: 0,
    turnDeg: 0,
    range: [0, 1],
    edgeHint: `i${k}`,
    contourSig: contourSig(host, f),
    ...(placement ? { placement } : {}),
  };
}

/**
 * A surface seam: the host's inner line on side A, the part on side B (its picked edges, or its
 * longest edge — the drawing places the part itself). A hand placement rides on both anchors.
 */
export function surfaceRow(
  host: { geom: PieceGeom; k: number; line: readonly Pt[]; grainDeg: number },
  partAnchors: readonly EdgeAnchor[],
  placement: SeamPlacement | undefined,
  seamKey = newSeamKey(),
): StoredSeam | null {
  const a = innerAnchor(host.geom, host.k, host.line, host.grainDeg, placement);
  if (!a || partAnchors.length === 0) return null;
  return {
    seamKey,
    status: 'confirmed',
    kind: 'surface',
    direction: 'unknown',
    source: 'manual',
    sideA: [a],
    sideB: partAnchors.map((p) => (placement ? { ...p, placement } : p)),
    anchoredSize: '',
    note: '',
  };
}

/** The longest plain edge of a piece — a part's anchor when no edge of it was picked. */
export function longestEdge(g: PieceGeom | undefined): EdgeId | null {
  if (!g) return null;
  let best: { id: EdgeId; len: number } | null = null;
  for (const e of plainEdges(g)) if (!best || e.lenMm > best.len) best = { id: e.id, len: e.lenMm };
  return best?.id ?? null;
}

// ─── words ────────────────────────────────────────────────────────────────────────────────────────

/** «FP_L·3» for an edge, «SLV_L·line 1» for an inner line. */
export function targetWords(id: TargetId, nameOf: (piece: string) => string): string {
  const inner = parseInner(id);
  if (inner) return `${nameOf(inner.piece)}·line ${inner.k + 1}`;
  return `${nameOf(pieceOf(id))}·${id.slice(id.lastIndexOf('#') + 1)}`;
}

/** A stored row in a step chip: «FP_L ↔ BP_L», «SLV_L ↔ FLP_L» (pieces, each side once). */
export function rowWords(row: StoredSeam, nameOf: (piece: string) => string): string {
  const side = (xs: readonly EdgeAnchor[]) =>
    [...new Set(xs.map((a) => a.piece))].map(nameOf).join(' + ') || '—';
  return row.sideB.length ? `${side(row.sideA)} ↔ ${side(row.sideB)}` : side(row.sideA);
}

/** The form ops with every key in `gone` taken out; null when nothing changed. */
export function dropKeys<T extends FormOpLike>(ops: readonly T[], gone: ReadonlySet<string>) {
  let changed = false;
  const next = ops.map((o) => {
    const keys = o.seamKeys ?? [];
    if (!keys.some((k) => gone.has(k))) return o;
    changed = true;
    return { ...o, seamKeys: keys.filter((k) => !gone.has(k)) };
  });
  return changed ? next : null;
}
