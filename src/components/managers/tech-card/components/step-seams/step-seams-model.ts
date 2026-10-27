// THE STEP'S SEAMS, PURE (assembly-schema T8): which pieces a step takes, which side a piece sits
// on, what to suggest, and the rows a pick writes. No React here — the picker and its test share it.
//
// Coordinates. The picker draws in the PDF's drawing frame (techpack/use-assembly-geometry: mm,
// y down — `cut`, `inner`). A piece's segmentation (`PieceGeom`, edges, anchors) lives in the same
// millimetres with y UP, so an edge is drawn as [x, −y] and an inner line is anchored as [x, −y].

import type { EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
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
};

/**
 * The step's inputs, each as the pieces it is made of: a piece is itself, a unit is the leaves of
 * the latest EARLIER step that produced it (recursively). Order = the step's input order.
 */
export function inputGroups(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
): { key: string; pieces: string[] }[] {
  const leaves = (key: string, before: number, seen: Set<string>): string[] => {
    const k = key.trim();
    if (!k) return [];
    if (pieceKeys.has(k)) return [k];
    if (seen.has(`${k}@${before}`)) return [];
    seen.add(`${k}@${before}`);
    for (let i = before - 1; i >= 0; i--) {
      if ((ops[i]?.outputUnitKey ?? '').trim() !== k) continue;
      const out: string[] = [];
      for (const inKey of ops[i]?.inputKeys ?? []) out.push(...leaves(inKey, i, seen));
      return out;
    }
    return [];
  };
  return (ops[index]?.inputKeys ?? [])
    .map((key) => ({ key: key.trim(), pieces: [...new Set(leaves(key, index, new Set()))] }))
    .filter((g) => g.key && g.pieces.length > 0);
}

/** Distinct leaf pieces held by this step's WITH inputs; materials and photos are not inputs. */
export function stepInputPieces(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
): string[] {
  return [...new Set(inputGroups(ops, index, pieceKeys).flatMap((group) => group.pieces))];
}

/** The seams row exists only when WITH resolves to at least two distinct pieces. */
export function hasMultipleStepPieces(
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
): boolean {
  return stepInputPieces(ops, index, pieceKeys).length >= 2;
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

/** Within this share of the longer edge a pair is offered at all. */
const SUGGEST_REL = 0.03;

/**
 * The pair of edges, one per side, closest in length (notch counts break ties and penalise a
 * mismatch); none within 3 % → nothing. Edges already sewn by this step are skipped.
 */
export function suggestPair(
  groups: readonly { pieces: readonly string[] }[],
  geoms: ReadonlyMap<string, PieceGeom>,
  used: ReadonlySet<EdgeId>,
  ease: number | null,
): Suggestion | null {
  const sides: [string[], string[]] =
    groups.length >= 2
      ? [[...groups[0].pieces], groups.slice(1).flatMap((g) => [...g.pieces])]
      : [[...(groups[0]?.pieces ?? [])], [...(groups[0]?.pieces ?? [])]];
  const edges = (ps: readonly string[]) =>
    ps.flatMap((p) => {
      const g = geoms.get(p);
      return g ? plainEdges(g).filter((e) => !used.has(e.id)) : [];
    });
  let best: { score: number; s: Suggestion } | null = null;
  for (const ea of edges(sides[0])) {
    for (const eb of edges(sides[1])) {
      if (ea.pieceKey === eb.pieceKey) continue;
      const d = deltaMm(ea.lenMm, eb.lenMm, ease);
      const rel = d / Math.max(ea.lenMm, eb.lenMm, 1);
      if (rel > SUGGEST_REL || ea.lenMm < 30) continue;
      const notch = ea.notchesMm.length === eb.notchesMm.length ? 0 : 0.01;
      const score = rel + notch;
      if (!best || score < best.score)
        best = { score, s: { a: [ea.id], b: [eb.id], aLen: ea.lenMm, bLen: eb.lenMm } };
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
  if (new Set(groups.flatMap((group) => group.pieces)).size < 2) return null;
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
