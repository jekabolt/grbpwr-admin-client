// THE STEP'S SEAMS, PURE (assembly-schema T8): which pieces a step takes, which side a piece sits
// on, what to suggest, and the rows a pick writes. No React here — the picker and its test share it.
//
// Coordinates. The picker draws in the PDF's drawing frame (techpack/use-assembly-geometry: mm,
// y down — `cut`, `inner`). A piece's segmentation (`PieceGeom`, edges, anchors) lives in the same
// millimetres with y UP, so an edge is drawn as [x, −y] and an inner line is anchored as [x, −y].

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import { roleOf, roleVeto } from 'lib/assembly-skeleton/assignment/costs';
import { readName, roleDef } from 'lib/assembly-skeleton/skeleton/model';
import type { Edge, EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
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

/** True when WITH resolves to at least two separate live pieces or units. */
export function isJoinStep(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
): boolean {
  return inputGroups(ops, index, pieceKeys).length >= 2;
}

/** Kept for the picker API; eligibility is input-unit count, not flattened piece count. */
export function hasMultipleStepPieces(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
): boolean {
  return isJoinStep(ops, index, pieceKeys);
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

/** Edges occupied by confirmed seams attached to earlier steps. */
export function usedEdgesBeforeStep(
  ops: readonly FormOpLike[],
  index: number,
  seams: ReadonlyMap<string, StoredSeam>,
): Set<EdgeId> {
  const used = new Set<EdgeId>();
  for (let i = 0; i < index; i++) {
    for (const key of ops[i]?.seamKeys ?? []) {
      const seam = seams.get(key);
      if (
        !seam ||
        seam.status !== 'confirmed' ||
        seam.stale ||
        seam.kind === 'surface' ||
        seam.kind === 'closure'
      )
        continue;
      for (const anchor of [...seam.sideA, ...seam.sideB]) {
        if (!anchor.edgeHint.includes('#')) continue;
        for (const edge of edgeIdsOf(anchor.edgeHint)) used.add(edge);
      }
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

/** Within this share of the longer edge a pair is offered at all. */
const SUGGEST_REL = 0.2;
/**
 * An edge bends at least this much to count as a curve. Card 83: shaped side seams turn 14–18°,
 * a shirt-tail hem 17–25°, a collar's neck edge 30°, armholes and caps 110–320°.
 */
const CURVE_DEG = 28;
const BODY_ROLES = new Set(['front', 'back', 'side', 'yoke', 'placket', 'facing', 'fly', 'skirt']);
const NECK_ROLES = new Set(['collar', 'stand', 'rib', 'hood']);

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

function pairRoleCost(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const pair = new Set([a, b]);
  if (a === 'front' && b === 'front') return Infinity;
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

const isCurve = (edge: Edge) => Math.abs(edge.turnDeg) >= CURVE_DEG;

function curveCost(a: Edge, b: Edge): number {
  const ca = isCurve(a);
  const cb = isCurve(b);
  if (ca && cb) return a.turnDeg * b.turnDeg < 0 ? -0.1 : -0.06;
  return ca || cb ? 0.08 : 0;
}

/**
 * The best free outer-edge pair across two different input units. Length remains the gate; roles,
 * curve compatibility and notches rank the plausible pairs inside it. A body ↔ sleeve or body ↔
 * neck join is an armhole ↔ cap or a neckline ↔ collar: only a curve ↔ curve pair is offered
 * there — a side seam or a hem that happens to have the right length is no answer, so the row
 * says «no seam» instead (card 83, steps 370 / 400).
 */
export function suggestPair(
  groups: readonly { pieces: readonly string[] }[],
  geoms: ReadonlyMap<string, PieceGeom>,
  used: ReadonlySet<EdgeId>,
  ease: number | null,
): Suggestion | null {
  const edges = (ps: readonly string[]) =>
    ps.flatMap((p) => {
      const g = geoms.get(p);
      return g ? plainEdges(g).filter((e) => !used.has(e.id)) : [];
    });
  let best: { score: number; s: Suggestion } | null = null;
  for (let i = 0; i < groups.length; i++) {
    const classA = classOf(groups[i], geoms);
    for (let j = i + 1; j < groups.length; j++) {
      const classB = classOf(groups[j], geoms);
      const structuralCurve =
        (classA === 'body' && (classB === 'sleeve' || classB === 'neck')) ||
        (classB === 'body' && (classA === 'sleeve' || classA === 'neck'));
      for (const ea of edges(groups[i].pieces)) {
        for (const eb of edges(groups[j].pieces)) {
          if (ea.pieceKey === eb.pieceKey || ea.lenMm < 30 || eb.lenMm < 30) continue;
          if (structuralCurve && !(isCurve(ea) && isCurve(eb))) continue;
          const ga = geoms.get(ea.pieceKey);
          const gb = geoms.get(eb.pieceKey);
          if (!ga || !gb) continue;
          const roleA = roleOfPiece(ga, geoms);
          const roleB = roleOfPiece(gb, geoms);
          // The veto reads names only: FL (a flap by name, FR's mirror twin) is a front here.
          if (roleVeto(ga, gb) && roleA === roleOf(ga) && roleB === roleOf(gb)) continue;
          const roleCost = pairRoleCost(roleA, roleB);
          if (!Number.isFinite(roleCost)) continue;
          const d = deltaMm(ea.lenMm, eb.lenMm, ease);
          const rel = d / Math.max(ea.lenMm, eb.lenMm, 1);
          if (rel > SUGGEST_REL) continue;
          const notch = ea.notchesMm.length === eb.notchesMm.length ? 0 : 0.02;
          const endpoint =
            (roleFits(classA, roleA) ? -0.025 : 0.1) + (roleFits(classB, roleB) ? -0.025 : 0.1);
          const shape = curveCost(ea, eb);
          const lengthTie = -Math.min(ea.lenMm, eb.lenMm, 1000) / 1_000_000;
          const score = rel + notch + endpoint + roleCost + shape + lengthTie;
          if (!best || score < best.score)
            best = { score, s: { a: [ea.id], b: [eb.id], aLen: ea.lenMm, bLen: eb.lenMm } };
        }
      }
    }
  }
  return best?.s ?? null;
}

/** One step's suggestion, including the shared WITH piece-count gate. */
export function suggestStepPair(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
  used: ReadonlySet<EdgeId>,
  ease: number | null,
): Suggestion | null {
  const groups = inputGroups(ops, index, pieceKeys);
  if (groups.length < 2) return null;
  return suggestPair(groups, geoms, used, ease);
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
