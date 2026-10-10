// POM engine (3D-doll wave P1): points of measure on the FLAT pattern, per graded size.
//
//   measurePattern({ facts, graph?, baseSize, sizes? }) → PomReport
//     facts  — the base size as the assembly skeleton reads it (pieces, category);
//     graph  — its SeamGraph (readSeamGraph(facts) when absent: pass the card's own to reuse it);
//     sizes  — every graded block keyed by the SAME piece keys (one SkeletonPieceInput per piece).
//   pomsToDictionary / compareToSizeChart (dictionary.ts) — the 16 measurement names of the card's
//     size chart, Δ against it within the display tolerance.
//
// Pure TS, worker-safe. Design: tmp/plans/assembly-3d-doll/01-DESIGN-L0.md §5.

import { drillPoints } from 'lib/assembly-skeleton/geometry';
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type {
  PieceGeom,
  Pt2,
  SeamGraph,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import { edgeMap, seamsOfGraph, type Model } from './model';
import { readPieces } from './pieces';
import { measureModel } from './poms';
import { classifyEdges } from './roles';
import { transferModel } from './sizes';
import type { GirthConvention, PomReport, PomValue, SizePoms } from './types';
import { grainRotation, rotatePt, uprightGeom, type Upright } from './upright';
import { contourSource, innerLines, type ContourSource } from './provenance';

/** Lines and landmarks back from the upright frame to each piece's own (PieceGeom) frame. */
function toPieceFrame(values: PomValue[], model: Model): PomValue[] {
  const back = (key: string, p: Pt2): Pt2 => {
    const up = model.upright.get(key);
    return up && up.deg ? rotatePt(p, -up.deg, up.c) : p;
  };
  return values.map((v) => ({
    ...v,
    path: {
      ...v.path,
      landmarks: v.path.landmarks.map((l) => ({ ...l, pt: back(l.pieceKey, l.pt) })),
      lines: v.path.lines.map((l) => ({ ...l, pts: l.pts.map((p) => back(l.pieceKey, p)) })),
    },
  }));
}

export type PomInput = {
  facts: SkeletonFacts;
  graph?: SeamGraph;
  baseSize: string;
  /** Graded blocks; the base size may be among them (it is measured once, from `facts`). */
  sizes?: { size: string; pieces: SkeletonPieceInput[] }[];
  convention?: GirthConvention;
  conventionSource?: 'default' | 'card';
};

/** The base size's model with edge roles read. */
export function baseModel(facts: SkeletonFacts, graph: SeamGraph, size: string): Model {
  const { pieces, garment } = readPieces(facts.pieces, graph.pieces, facts.category);
  const inputs = new Map(facts.pieces.map((p) => [p.pieceKey, p]));
  const geoms = new Map<string, PieceGeom>();
  const upright = new Map<string, Upright>();
  const drills = new Map<string, Pt2[]>();
  const contour = new Map<string, ContourSource>();
  const inner = new Map<string, Pt2[][]>();
  for (const g of graph.pieces) {
    const piece = inputs.get(g.pieceKey)?.piece;
    const { geom, up } = uprightGeom(g, grainRotation(piece));
    geoms.set(g.pieceKey, geom);
    upright.set(g.pieceKey, up);
    drills.set(g.pieceKey, piece ? drillPoints(piece).map((p) => rotatePt(p, up.deg, up.c)) : []);
    contour.set(g.pieceKey, contourSource(piece).source);
    inner.set(
      g.pieceKey,
      innerLines(piece).map((l) => l.map((p) => rotatePt(p, up.deg, up.c))),
    );
  }
  const model: Model = {
    size,
    garment,
    geoms,
    info: new Map(pieces.map((p) => [p.pieceKey, p])),
    edges: edgeMap(geoms.values()),
    seams: seamsOfGraph(graph),
    roles: new Map(),
    drills,
    upright,
    contour,
    inner,
    warnings: [...graph.warnings],
  };
  classifyEdges(model);
  assumeFolds(model);
  return model;
}

/**
 * A front or back without a hand whose CF / CB edge is sewn to nothing, that is not symmetric and
 * has no mirror twin, is half a piece cut on the fold — counted twice in girths, said so.
 */
function assumeFolds(m: Model) {
  for (const [key, info] of m.info) {
    if (info.hand || info.girthMult > 1 || info.lining || info.layerOf) continue;
    if (info.kind !== 'front' && info.kind !== 'back') continue;
    const g = m.geoms.get(key);
    if (!g || g.twinOf.some((t) => t.kind === 'mirror')) continue;
    const centre = g.edges.filter((e) => {
      const r = m.roles.get(e.id);
      return r && (r.role === 'cb' || r.role === 'cf') && r.confidence >= 0.55;
    });
    const unsewn = centre.filter(
      (e) => !m.seams.some((s) => s.a.includes(e.id) || s.b.includes(e.id)),
    );
    if (unsewn.length && unsewn.length === centre.length) {
      info.girthMult = 2;
      info.foldAssumed = true;
      info.why = `${info.why}; its ${unsewn.map((e) => m.roles.get(e.id)!.role.toUpperCase()).join('/')} is sewn to nothing and it has no twin — read as cut on the fold (×2)`;
    }
  }
}

export function measurePattern(input: PomInput): PomReport {
  const convention = input.convention ?? 'half';
  const graph = input.graph ?? readSeamGraph(input.facts);
  const base = baseModel(input.facts, graph, input.baseSize);
  const sizes: SizePoms[] = [];
  const order = input.sizes?.length
    ? input.sizes
    : [{ size: input.baseSize, pieces: input.facts.pieces }];
  for (const s of order) {
    if (s.size === input.baseSize) {
      sizes.push({
        size: s.size,
        values: toPieceFrame(measureModel(base, convention), base),
        regraded: [],
        warnings: [],
      });
      continue;
    }
    const { model, regraded } = transferModel(base, s.size, s.pieces);
    sizes.push({
      size: s.size,
      values: toPieceFrame(measureModel(model, convention), model),
      regraded,
      warnings: [
        ...model.warnings,
        ...regraded.map(
          (k) =>
            `grading changed the contour of ${k} — measured on its own, roles moved by position`,
        ),
      ],
    });
  }
  return {
    garment: base.garment,
    baseSize: input.baseSize,
    convention,
    conventionSource: input.conventionSource ?? 'default',
    pieces: [...base.info.values()],
    roles: Object.fromEntries(base.roles),
    sizes,
    warnings: base.warnings,
  };
}

export { classifyEdges } from './roles';
export { measureModel, POM_DEFS } from './poms';
export { layoutUnion, fitSeam } from './union';
export { transferModel } from './sizes';
export { readPieces } from './pieces';
export { grainRotation, uprightGeom } from './upright';
export { contourSource, innerLines } from './provenance';
export * from './dictionary';
export * from './types';
export type { Model, ModelSeam } from './model';
