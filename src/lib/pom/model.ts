// The measured object of one size: pieces' sewing contours, which edges are sewn to which, and
// (after roles.ts) what each edge is. The base size comes straight from the assembly skeleton's
// SeamGraph; graded sizes are transferred onto it (sizes.ts).

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { Edge, EdgeId, PieceGeom, Pt2, SeamGraph } from 'lib/assembly-skeleton/types';
import type { GarmentKind, PieceInfo, RoleReading } from './types';
import type { Upright } from './upright';
import type { ContourSource } from './provenance';

export type ModelSeam = {
  a: EdgeId[];
  b: EdgeId[];
  kind: 'edge' | 'partial' | 'composite' | 'closure-not-seam';
};

export type Model = {
  size: string;
  garment: GarmentKind;
  geoms: Map<string, PieceGeom>;
  info: Map<string, PieceInfo>;
  edges: Map<EdgeId, Edge>;
  seams: ModelSeam[];
  roles: Map<EdgeId, RoleReading>;
  /** Drill centres per piece (button / placement marks), piece-local mm. */
  drills: Map<string, Pt2[]>;
  /** Rotation that stood each piece upright (grain vertical); the model's geometry is upright. */
  upright: Map<string, Upright>;
  /** Which line each contour is: the sewing line, or the cut line (allowance included). */
  contour: Map<string, ContourSource>;
  /** Open inner lines per piece (darts, pleats, placement), upright mm. */
  inner: Map<string, Pt2[][]>;
  warnings: string[];
};

export function edgeMap(geoms: Iterable<PieceGeom>): Map<EdgeId, Edge> {
  const out = new Map<EdgeId, Edge>();
  for (const g of geoms) for (const e of g.edges) out.set(e.id, e);
  return out;
}

/** Seams of the graph the POM engine reads: sewn edges and closures (surface joins are not edges). */
export function seamsOfGraph(graph: SeamGraph): ModelSeam[] {
  const out: ModelSeam[] = [];
  for (const c of graph.chosen) {
    if (c.kind === 'surface' || c.kind === 'closure-not-seam') continue;
    out.push({ a: c.aParts ?? edgeIdsOf(c.a), b: c.bParts ?? edgeIdsOf(c.b), kind: c.kind });
  }
  for (const c of graph.rejected) {
    if (c.kind !== 'closure-not-seam') continue;
    out.push({ a: edgeIdsOf(c.a), b: edgeIdsOf(c.b), kind: 'closure-not-seam' });
  }
  return out;
}

export const pieceOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));

export type Partner = { edge: EdgeId; piece: string; seam: ModelSeam; sameSide: EdgeId[] };

/** Every edge on the other side of a seam this edge is part of. */
export function partnersOf(model: Model, id: EdgeId): Partner[] {
  const out: Partner[] = [];
  for (const s of model.seams) {
    const sides: [EdgeId[], EdgeId[]][] = [
      [s.a, s.b],
      [s.b, s.a],
    ];
    for (const [mine, other] of sides) {
      if (!mine.includes(id)) continue;
      for (const o of other) out.push({ edge: o, piece: pieceOf(o), seam: s, sameSide: mine });
    }
  }
  return out;
}

export function roleOf(model: Model, id: EdgeId): RoleReading | undefined {
  return model.roles.get(id);
}
