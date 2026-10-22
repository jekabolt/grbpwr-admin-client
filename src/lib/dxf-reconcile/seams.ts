// A changed piece is a question only when its sewn edge stopped fitting. Stored seams use stable
// edge anchors, so resolve those anchors on the replacement sheet and measure the sewn stretches.
import { segmentPiece } from 'lib/assembly-skeleton/geometry';
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import {
  fromWire,
  resolveSeamDecisions,
  type AnchorHit,
  type ResolveOptions,
  type StoredSeam,
  type TechCardSeamWire,
} from 'lib/seams';

import { THRESH } from './defaults';
import type { SheetEntry } from './match';
import type { CardAlias, CardOperation, CardPiece, ReconcileInput, Review } from './types';

export type PieceGeometry = { entry: SheetEntry; scale: number };

export type SeamReview = {
  review: Review;
  pieceKeys: string[];
  operationIndexes: number[];
};

export type SeamReshapeVerdict = { kind: 'fallback' } | { kind: 'seams'; reviews: SeamReview[] };

const REMEASURE_THRESHOLDS = {
  lenRatio: [0, Infinity],
  notchDiff: Infinity,
  ratioDrift: Infinity,
} as unknown as NonNullable<ResolveOptions['thresholds']>;

const isStored = (s: TechCardSeamWire | StoredSeam): s is StoredSeam => Array.isArray(s.sideA);

const storedOf = (s: TechCardSeamWire | StoredSeam): StoredSeam | null =>
  isStored(s) ? s : fromWire(s);

const median = <T>(xs: readonly T[]): T | undefined => xs[Math.floor((xs.length - 1) / 2)];

function scaledPiece(p: PieceDTO, scale: number): PieceDTO {
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 1e-12) return p;
  const q = 1 / scale;
  const pt = (v: { x: number; y: number }) => ({ x: v.x * q, y: v.y * q });
  return {
    ...p,
    poly: p.poly.map(pt),
    bboxW: p.bboxW * q,
    bboxH: p.bboxH * q,
    areaCm2: p.areaCm2 * q * q,
    originX: p.originX === undefined ? undefined : p.originX * q,
    originY: p.originY === undefined ? undefined : p.originY * q,
    inner: p.inner?.map((x) => ({ ...x, pts: x.pts.map(pt) })),
    grain: p.grain?.map((x) => ({
      ...x,
      lengthCm: x.lengthCm * q,
      a: pt(x.a),
      b: pt(x.b),
    })),
  };
}

function geomOf(
  piece: CardPiece,
  ref: PieceGeometry,
  anchoredSize: string,
  sizeTokens: readonly string[],
): PieceGeom | null {
  const token = anchoredSize.trim().toLowerCase();
  const wanted = sizeTokens.find((s) => s.trim().toLowerCase() === token) ?? token;
  const dto =
    ref.entry.bySize.get(wanted) ?? median(ref.entry.sizes.map((s) => ref.entry.bySize.get(s)!));
  if (!dto) return null;
  return segmentPiece({
    pieceKey: piece.lineKey,
    name: piece.name,
    piece: scaledPiece(dto, ref.scale),
    piecesPerGarment: piece.piecesPerGarment ?? 1,
    cutSymmetry: piece.cutSymmetry ?? null,
    cloth: null,
    fused: false,
  });
}

const sideLength = (hits: readonly AnchorHit[]) =>
  hits.reduce((n, h) => n + h.lenMm * Math.abs(h.anchor.range[1] - h.anchor.range[0]), 0);

function notchCount(hit: AnchorHit, geoms: ReadonlyMap<string, PieceGeom>): number | null {
  const geom = geoms.get(hit.anchor.piece);
  if (!geom) return null;
  const edges = new Map(geom.edges.map((e) => [e.id, e]));
  let count = 0;
  for (const id of hit.edges) {
    const edge = edges.get(id);
    if (!edge) return null;
    count += edge.notchesMm.length;
  }
  return count;
}

const oldNotches = (hits: readonly AnchorHit[]) => hits.reduce((n, h) => n + h.anchor.notches, 0);

function newNotches(
  hits: readonly AnchorHit[],
  geoms: ReadonlyMap<string, PieceGeom>,
): number | null {
  let out = 0;
  for (const h of hits) {
    const n = notchCount(h, geoms);
    if (n === null) return null;
    out += n;
  }
  return out;
}

function joiningOperations<O extends CardOperation>(
  operations: readonly O[],
  sideA: ReadonlySet<string>,
  sideB: ReadonlySet<string>,
): number[] {
  const self = [...sideA].some((k) => sideB.has(k));
  const touches = (keys: readonly string[], side: ReadonlySet<string>) =>
    keys.some((k) => side.has(k.trim()));
  return operations.flatMap((op, i) => {
    const keys = (op.inputKeys ?? []).map((k) => k.trim());
    return touches(keys, sideA) && (self || touches(keys, sideB)) ? [i] : [];
  });
}

/**
 * Resolve every confirmed sewn seam touching `pieceKey`. No seam, or one unresolved anchor, asks
 * the caller to use the area/perimeter fallback. Otherwise only broken seam joins are returned; a
 * broken seam with no joining step returns an empty `operationIndexes` (piece-wide mark).
 */
export function seamReshapeVerdict<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
>(
  input: ReconcileInput<P, A, O>,
  pieceKey: string,
  geometry: ReadonlyMap<string, PieceGeometry>,
): SeamReshapeVerdict {
  const stored = (input.seams ?? [])
    .map(storedOf)
    .filter((s): s is StoredSeam => !!s)
    .filter(
      (s) =>
        s.status === 'confirmed' &&
        s.kind !== 'surface' &&
        s.kind !== 'closure' &&
        [...s.sideA, ...s.sideB].some((a) => a.piece.trim() === pieceKey.trim()),
    );
  if (!stored.length) return { kind: 'fallback' };

  const pieceByKey = new Map(input.pieces.map((p) => [p.lineKey.trim(), p]));
  const reviews: SeamReview[] = [];
  for (const seam of stored) {
    const keys = [...new Set([...seam.sideA, ...seam.sideB].map((a) => a.piece.trim()))];
    const geoms = new Map<string, PieceGeom>();
    for (const key of keys) {
      const piece = pieceByKey.get(key);
      const ref = geometry.get(key);
      const geom = piece && ref ? geomOf(piece, ref, seam.anchoredSize, input.sizeTokens) : null;
      if (!geom) return { kind: 'fallback' };
      geoms.set(key, geom);
    }
    const resolved = resolveSeamDecisions([{ ...seam, stale: false }], [...geoms.values()], {
      thresholds: REMEASURE_THRESHOLDS,
    });
    const hit = resolved.applied[0];
    if (!hit) return { kind: 'fallback' };
    const aLen = sideLength(hit.a);
    const bLen = sideLength(hit.b);
    const aNotches = newNotches(hit.a, geoms);
    const bNotches = newNotches(hit.b, geoms);
    if (aNotches === null || bNotches === null) return { kind: 'fallback' };
    const lengthMismatch =
      Math.abs(aLen - bLen) > Math.max(3, THRESH.seamMismatchRel * Math.max(aLen, bLen));
    const notchesChanged = aNotches !== oldNotches(hit.a) || bNotches !== oldNotches(hit.b);
    if (!lengthMismatch && !notchesChanged) continue;
    const sideA = new Set(seam.sideA.map((a) => a.piece.trim()).filter(Boolean));
    const sideB = new Set(seam.sideB.map((a) => a.piece.trim()).filter(Boolean));
    const operationIndexes = joiningOperations(input.operations, sideA, sideB);
    // The sides meet only through an assembly unit (A → ▣ U, then U + B): no step holds both. The
    // seam is still broken — mark every step that uses the reshaped piece, never drop the mark.
    if (operationIndexes.length)
      reviews.push({ review: 'reshaped', pieceKeys: keys, operationIndexes });
    else reviews.push({ review: 'reshaped', pieceKeys: [pieceKey.trim()], operationIndexes: [] });
  }
  return { kind: 'seams', reviews };
}
