// PICTOGRAMS FOR A CARD'S UNITS — the steps of an assembly order (proposed or already on the card)
// → one UnionPicture per unit they make.
//
// A unit is drawn from its LEAF pieces: a step's inputs are piece keys or earlier units' keys, so
// each unit is resolved back to the pieces it holds. The seams are the graph's (lanes A + A4);
// unionLayout keeps only those with both ends inside the unit. A unit none of whose pieces has a
// contour gets no picture — the surfaces then draw exactly what they drew before.

import type { SeamGraph } from '../types';
import { unionLayout } from './layout';
import { unionPicture, type UnionPicture } from './picture';

export type UnitStep = { inputs: readonly string[]; outputUnitKey: string };

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
