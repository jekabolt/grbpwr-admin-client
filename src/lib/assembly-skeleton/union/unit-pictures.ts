// PICTOGRAMS FOR A CARD'S UNITS — the steps of an assembly order (proposed or already on the card)
// → one UnionPicture per unit they make.
//
// A unit is drawn from its LEAF pieces: a step's inputs are piece keys or earlier units' keys, so
// each unit is resolved back to the pieces it holds. The seams are the graph's (lanes A + A4);
// unionLayout keeps only those with both ends inside the unit. A unit none of whose pieces has a
// contour gets no picture — the surfaces then draw exactly what they drew before.

import type { Affine, PieceGeom, SeamGraph, UnionLayout, UnionPlacement } from '../types';
import { apply } from './affine';
import { unionLayout } from './layout';
import { unionPicture, type UnionPicture } from './picture';

export type UnitStep = { inputs: readonly string[]; outputUnitKey: string };

export const LOWER_LAYER_FILL = 'rgba(0,0,0,.15)';
export const LOWER_LAYER_STROKE = '#8a8a8a';
export const LOWER_LAYER_STROKE_SCALE = 0.9;
export const STACKED_TWIN_OFFSET_MM = 3;

export type LayerBox = {
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/** Bottom-to-top result order, with collapsed stack followers placed below their visible leader. */
export function orderedLayerKeys(
  layers: readonly string[],
  stacked: readonly (readonly string[])[],
  keys: readonly string[],
): string[] {
  const ordered = [...new Set([...layers, ...keys])];
  for (const stack of stacked) {
    const present = stack.filter((key) => ordered.includes(key));
    if (present.length < 2) continue;
    const at = Math.min(...present.map((key) => ordered.indexOf(key)));
    const members = new Set(present);
    const without = ordered.filter((key) => !members.has(key));
    without.splice(at, 0, ...present.slice(1), present[0]);
    ordered.splice(0, ordered.length, ...without);
  }
  return ordered;
}

/** A piece is lower only when a later result layer overlaps its transformed bounding box. */
export function lowerLayerKeys(layers: readonly string[], boxes: readonly LayerBox[]): string[] {
  const byKey = new Map(boxes.map((box) => [box.key, box]));
  const ordered = layers.filter((key) => byKey.has(key));
  return ordered.filter((key, index) => {
    const box = byKey.get(key)!;
    return ordered.slice(index + 1).some((later) => {
      const above = byKey.get(later)!;
      return box.x0 < above.x1 && above.x0 < box.x1 && box.y0 < above.y1 && above.y0 < box.y1;
    });
  });
}

type StepLayoutPicture = {
  T: ReadonlyMap<string, Affine>;
  stacked: readonly (readonly string[])[];
  onRuns: readonly string[];
  hung?: readonly (readonly [piece: string, host: string])[];
};

const layoutBox = (
  placements: readonly UnionPlacement[],
  geoms: ReadonlyMap<string, PieceGeom>,
): UnionLayout['bbox'] => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const placement of placements)
    for (const point of geoms.get(placement.pieceKey)?.rs ?? []) {
      const [x, y] = apply(placement.T, point);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
};

/** Adapt the editor's authoritative mm layout to the existing unit-pictogram renderer. */
export function unionPictureOfLayout(
  layout: StepLayoutPicture,
  geoms: ReadonlyMap<string, PieceGeom>,
  layers: readonly string[],
): UnionPicture {
  const ordered = orderedLayerKeys(layers, layout.stacked, [...layout.T.keys()]).filter(
    (piece) => layout.T.has(piece) && geoms.has(piece),
  );
  const twinLabels = new Map<string, number>();
  layout.stacked.forEach((stack) =>
    stack.slice(1).forEach((piece, index) => twinLabels.set(piece, index + 2)),
  );
  const placements = ordered.map((piece): UnionPlacement => {
    const source = layout.T.get(piece)!;
    const twin = twinLabels.get(piece);
    const offset = twin ? STACKED_TWIN_OFFSET_MM * (twin - 1) : 0;
    const T: Affine = offset
      ? [source[0], source[1], source[2], source[3], source[4] + offset, source[5] - offset]
      : source;
    return {
      pieceKey: piece,
      T,
      mirrored: T[0] * T[3] - T[1] * T[2] < 0,
    };
  });
  const union: UnionLayout = {
    placements,
    bbox: layoutBox(placements, geoms),
    stacked: [],
    hung: [...new Set((layout.hung ?? []).map(([piece]) => piece))],
    onRuns: [...layout.onRuns],
    overflow: [],
    underlay: [],
    overlap: 0,
  };
  const boxes = placements.map((placement): LayerBox => {
    const points = geoms.get(placement.pieceKey)!.rs.map((point) => apply(placement.T, point));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
      key: placement.pieceKey,
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    };
  });
  const lower = new Set(lowerLayerKeys(ordered, boxes));
  twinLabels.forEach((_, piece) => lower.add(piece));
  const picture = unionPicture(union, geoms);
  if (!lower.size) return picture;
  return {
    ...picture,
    lowerLayers: ordered.filter((piece) => lower.has(piece)),
    twinLabels: Object.fromEntries(twinLabels),
  };
}

/** Unit key → its leaf piece keys, resolved through earlier units (cycles and unknowns dropped). */
export function unitLeaves(
  steps: readonly UnitStep[],
  isPiece: (key: string) => boolean,
): Map<string, string[]> {
  const direct = new Map<string, string[]>();
  for (const s of steps) {
    const k = s.outputUnitKey.trim();
    if (!k) continue;
    direct.set(k, [...(direct.get(k) ?? []), ...s.inputs]);
  }
  const memo = new Map<string, string[]>();
  const resolve = (key: string, seen: Set<string>): string[] => {
    const hit = memo.get(key);
    if (hit) return hit;
    if (seen.has(key)) return [];
    seen.add(key);
    const out: string[] = [];
    for (const i of direct.get(key) ?? []) {
      if (isPiece(i)) out.push(i);
      else if (direct.has(i)) out.push(...resolve(i, seen));
    }
    const leaves = [...new Set(out)];
    memo.set(key, leaves);
    return leaves;
  };
  for (const k of direct.keys()) resolve(k, new Set());
  return memo;
}

/**
 * One picture per unit made by `steps`, drawn on `graph`. `maxPieces` caps the size of a unit worth
 * a pictogram (the finished garment of 40 pieces is not a glyph); larger units get none.
 */
export function unitPictures(
  graph: SeamGraph,
  steps: readonly UnitStep[],
  { maxPieces = 16 }: { maxPieces?: number } = {},
): Map<string, UnionPicture> {
  const geoms = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const out = new Map<string, UnionPicture>();
  for (const [unit, leaves] of unitLeaves(steps, (k) => geoms.has(k))) {
    if (leaves.length === 0 || leaves.length > maxPieces) continue;
    const pic = unionPicture(unionLayout(leaves, graph.chosen, geoms), geoms);
    if (pic.shapes.length > 0) out.set(unit, pic);
  }
  return out;
}
