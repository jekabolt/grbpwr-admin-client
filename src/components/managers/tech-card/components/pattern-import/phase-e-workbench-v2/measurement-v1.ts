import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

export type PatternImportDxfPhaseEMeasurementKindV1 = 'point' | 'line' | 'edge';

export type PatternImportDxfPhaseEVertexAnchorV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  vertexId: string;
}>;

export type PatternImportDxfPhaseEMeasurementV1 = Readonly<{
  id: string;
  kind: PatternImportDxfPhaseEMeasurementKindV1;
  anchors: readonly PatternImportDxfPhaseEVertexAnchorV1[];
  valueMm: number | null;
  label: string;
}>;

export type PatternImportDxfPhaseEResolvedVertexV1 = Readonly<{
  anchor: PatternImportDxfPhaseEVertexAnchorV1;
  pointMm: Readonly<{ x: number; y: number }>;
  ordinal: number;
  contourClosed: boolean;
  contourVertexCount: number;
}>;

export type PatternImportDxfPhaseEMeasurementBuildResultV1 =
  | Readonly<{ ok: true; measurement: PatternImportDxfPhaseEMeasurementV1 }>
  | Readonly<{
      ok: false;
      code: 'invalid-anchor-count' | 'anchor-not-found' | 'cross-piece-line' | 'not-an-edge';
      detail: string;
    }>;

export function resolvePatternImportDxfPhaseEVertexV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  anchor: PatternImportDxfPhaseEVertexAnchorV1,
): PatternImportDxfPhaseEResolvedVertexV1 | null {
  const piece = projection.pieces.find(
    (candidate) =>
      candidate.pieceId === anchor.pieceId && candidate.pieceLineKey === anchor.pieceLineKey,
  );
  const contour = piece?.contours.find((candidate) => candidate.contourId === anchor.contourId);
  const vertex = contour?.vertices.find((candidate) => candidate.vertexId === anchor.vertexId);
  if (!piece || !contour || !vertex) return null;
  if (!Number.isFinite(vertex.pointMm.x) || !Number.isFinite(vertex.pointMm.y)) return null;
  return Object.freeze({
    anchor,
    pointMm: Object.freeze({ x: vertex.pointMm.x, y: vertex.pointMm.y }),
    ordinal: vertex.ordinal,
    contourClosed: contour.closed,
    contourVertexCount: contour.vertices.length,
  });
}

function distanceMm(
  left: PatternImportDxfPhaseEResolvedVertexV1,
  right: PatternImportDxfPhaseEResolvedVertexV1,
): number {
  return Math.hypot(right.pointMm.x - left.pointMm.x, right.pointMm.y - left.pointMm.y);
}

export function buildPatternImportDxfPhaseEMeasurementV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  id: string,
  kind: PatternImportDxfPhaseEMeasurementKindV1,
  anchors: readonly PatternImportDxfPhaseEVertexAnchorV1[],
): PatternImportDxfPhaseEMeasurementBuildResultV1 {
  const required = kind === 'point' ? 1 : 2;
  if (anchors.length !== required)
    return Object.freeze({
      ok: false,
      code: 'invalid-anchor-count',
      detail: `${kind} measurement requires exactly ${required} exact topology anchor${required === 1 ? '' : 's'}.`,
    });
  const resolved = anchors.map((anchor) =>
    resolvePatternImportDxfPhaseEVertexV1(projection, anchor),
  );
  if (resolved.some((vertex) => vertex === null))
    return Object.freeze({
      ok: false,
      code: 'anchor-not-found',
      detail: 'One measurement anchor is no longer present in the exact Phase-D projection.',
    });
  const vertices = resolved as PatternImportDxfPhaseEResolvedVertexV1[];
  if (kind === 'point') {
    const [{ pointMm }] = vertices;
    return Object.freeze({
      ok: true,
      measurement: Object.freeze({
        id,
        kind,
        anchors: Object.freeze([...anchors]),
        valueMm: null,
        label: `x ${pointMm.x.toFixed(1)} · y ${pointMm.y.toFixed(1)} mm`,
      }),
    });
  }
  const [left, right] = vertices;
  if (left.anchor.pieceId !== right.anchor.pieceId) {
    return Object.freeze({
      ok: false,
      code: 'cross-piece-line',
      detail: 'A free measurement must stay on one unplaced 2D piece.',
    });
  }
  if (kind === 'edge') {
    const sameContour = left.anchor.contourId === right.anchor.contourId;
    const ordinalDelta = Math.abs(left.ordinal - right.ordinal);
    const closingEdge =
      sameContour &&
      left.contourClosed &&
      left.contourVertexCount > 2 &&
      ordinalDelta === left.contourVertexCount - 1;
    if (!sameContour || (ordinalDelta !== 1 && !closingEdge))
      return Object.freeze({
        ok: false,
        code: 'not-an-edge',
        detail: 'Edge measurement requires two adjacent exact vertices on the same contour.',
      });
  }
  const valueMm = distanceMm(left, right);
  return Object.freeze({
    ok: true,
    measurement: Object.freeze({
      id,
      kind,
      anchors: Object.freeze([...anchors]),
      valueMm,
      label: `${valueMm.toFixed(1)} mm`,
    }),
  });
}
