import { sameSavedDraftRowV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-saved-source-selection-v1';
import type { SavedCompleteAssemblyNativeStitchAnchorsV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-complete-assembly-native-stitch-anchors-v1';
import type { Vec2Mm } from 'lib/cloth/domain/garment-assembly-ir';
import {
  seamSegmentIsCoveredByMeshV1,
  seamSegmentMeshPartitionV1,
} from 'lib/cloth/mesh/triangulation/seam-point-embedding-v1';
import type { SourceCutMassTransferMeshV1 } from 'lib/cloth/mesh/triangulation/source-cut-mass-transfer-v1';
import type { prepareSourceCutSurfaceProjectionV1 } from 'lib/cloth/runtime/cpu/source-cut-surface-projection-v1';
import robustOrientation from 'robust-orientation';

type WholeSource = SavedCompleteAssemblyNativeStitchAnchorsV1;
type Surface = ReturnType<typeof prepareSourceCutSurfaceProjectionV1>;
type Line = Extract<WholeSource['spans'][number], { kind: 'native-internal-l8' }>;
type EndpointWeights = readonly [number, number, number];

type Endpoint = Readonly<{
  triangleIndex: number;
  weights: EndpointWeights;
}>;

export type SavedNativeCutInternalLineTraceV1 = Readonly<{
  operationNumber: number;
  pieceLineKey: string;
  nativePathId: number;
  segmentCount: number;
  /** Consecutive pairs of world XYZ endpoints in the accepted display's metre frame. */
  project: (drawPositionsM: Float32Array) => Float32Array | null;
}>;

const samePoint = (a: Vec2Mm, b: Vec2Mm) => a[0] === b[0] && a[1] === b[1];

function matchesNativeRing(
  original: WholeSource['sourceCuts'][number],
  materialCut: SourceCutMassTransferMeshV1,
) {
  const { nativePointsMm: native } = original;
  const { verticesMm } = materialCut;
  const length = native.length;
  return (
    length >= 3 &&
    length === verticesMm.length &&
    verticesMm.some(
      ([x, y], start) =>
        x === native[0].x &&
        y === native[0].y &&
        [1, -1].some((direction) =>
          native.every(({ x, y }, index) => {
            const vertex = verticesMm[(start + direction * index + length) % length];
            return x === vertex[0] && y === vertex[1];
          }),
        ),
    )
  );
}

function readDrawChart(
  surface: Surface,
  range: Surface['drawRanges'][number],
  carrierRestPositions2Mm: Float32Array,
) {
  const triangles = new Uint32Array(range.triangleCount * 3);
  const vertices: Vec2Mm[] = [];
  const representativeOffsets = new Map<number, number>();
  for (let index = 0; index < triangles.length; index++) {
    const first = range.triangleOffset * 3;
    const corner = first + index;
    const representative = surface.cornerRepresentative(corner);
    if (representative < first || representative > corner) return null;
    const known = representativeOffsets.get(representative);
    if (known !== undefined) {
      triangles[index] = known;
      continue;
    }
    if (representative !== corner) return null;
    const { particleOffsets, weights } = surface.cornerSupport(corner);
    const at = (axis: number) => {
      const a = carrierRestPositions2Mm[particleOffsets[0] / 2 + axis];
      const b = carrierRestPositions2Mm[particleOffsets[1] / 2 + axis];
      const c = carrierRestPositions2Mm[particleOffsets[2] / 2 + axis];
      return a + weights[1] * (b - a) + weights[2] * (c - a);
    };
    const vertex = [at(0), at(1)] as const;
    if (!vertex.every(Number.isFinite)) return null;
    representativeOffsets.set(representative, vertices.length);
    triangles[index] = vertices.length;
    vertices.push(vertex);
  }
  return { vertices, triangles };
}

function endpointWeights(
  face: readonly [Vec2Mm, Vec2Mm, Vec2Mm],
  start: Vec2Mm,
  end: Vec2Mm,
  t: number,
): EndpointWeights | null {
  const point = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t] as const;
  const [a, b, c] = face;
  const area = -robustOrientation(a, b, c);
  const weights = [
    -robustOrientation(b, c, point) / area,
    -robustOrientation(c, a, point) / area,
    -robustOrientation(a, b, point) / area,
  ];
  // Coverage is already proven by indexed face clipping. These bounds only absorb
  // interpolation roundoff at the previously proved face crossing.
  if (weights.some((weight) => !Number.isFinite(weight) || weight < -1e-10 || weight > 1 + 1e-10))
    return null;
  const [u, v, w] = weights.map((weight) => Math.max(0, weight));
  const sum = u + v + w;
  return sum > 0 ? [u / sum, v / sum, w / sum] : null;
}

/** Prepare one operation-owned, straight-segment L8 line on one verified cut material chart. */
export function prepareSavedNativeCutInternalLineTraceV1(
  input: Readonly<{
    source: Pick<WholeSource, 'sizeToken' | 'sourceCuts' | 'spans'>;
    line: Line;
    materialCut: SourceCutMassTransferMeshV1;
    carrierRestPositions2Mm: Float32Array;
    surface: Surface;
    maxTriangleTests: number;
  }>,
): SavedNativeCutInternalLineTraceV1 | null {
  const { source, line, materialCut, carrierRestPositions2Mm, surface, maxTriangleTests } = input;
  if (!source.spans.includes(line) || line.kind !== 'native-internal-l8' || line.span.layer !== '8')
    return null;
  const cuts = source.sourceCuts.filter(({ pieceLineKey }) => pieceLineKey === line.pieceLineKey);
  const ranges = surface.drawRanges.filter(({ pieceId }) => pieceId === line.pieceLineKey);
  const [cut] = cuts;
  const [range] = ranges;
  const intervals = line.span.intervals;
  if (
    cuts.length !== 1 ||
    ranges.length !== 1 ||
    cut.sizeToken !== source.sizeToken ||
    cut.blockName !== line.blockName ||
    !sameSavedDraftRowV1(cut.row, line.row) ||
    cut.sourceInstancePath.length === 0 ||
    cut.sourceInstancePath.length !== line.span.sourceInstancePath.length ||
    cut.sourceInstancePath.some((part, i) => part !== line.span.sourceInstancePath[i]) ||
    !matchesNativeRing(cut, materialCut) ||
    !Number.isSafeInteger(maxTriangleTests) ||
    maxTriangleTests < 1 ||
    intervals.length === 0 ||
    intervals.length * (range.triangleCount + materialCut.triangles.length / 3) > maxTriangleTests
  )
    return null;

  const endpoints: Endpoint[] = [];
  try {
    const chart = readDrawChart(surface, range, carrierRestPositions2Mm);
    if (!chart) return null;
    for (const [index, { startMm, endMm }] of intervals.entries()) {
      if (
        samePoint(startMm, endMm) ||
        (index > 0 && !samePoint(intervals[index - 1].endMm, startMm)) ||
        !seamSegmentIsCoveredByMeshV1(materialCut.verticesMm, materialCut.triangles, startMm, endMm)
      )
        return null;
      const partition = seamSegmentMeshPartitionV1(chart.vertices, chart.triangles, startMm, endMm);
      if (!partition) return null;
      for (const [from, to, face] of partition) {
        const at = face * 3;
        const vertices = [
          chart.vertices[chart.triangles[at]],
          chart.vertices[chart.triangles[at + 1]],
          chart.vertices[chart.triangles[at + 2]],
        ] as const;
        const start = endpointWeights(vertices, startMm, endMm, from);
        const end = endpointWeights(vertices, startMm, endMm, to);
        if (!start || !end) return null;
        const triangleIndex = range.triangleOffset + face;
        endpoints.push({ triangleIndex, weights: start }, { triangleIndex, weights: end });
      }
    }
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }

  const drawCoordinates =
    9 * surface.drawRanges.reduce((count, item) => count + item.triangleCount, 0);
  return Object.freeze({
    operationNumber: line.operationNumber,
    pieceLineKey: line.pieceLineKey,
    nativePathId: line.span.nativePathId,
    segmentCount: endpoints.length / 2,
    project(drawPositionsM: Float32Array) {
      if (drawPositionsM.length !== drawCoordinates) return null;
      const result = new Float32Array(3 * endpoints.length);
      for (const [index, { triangleIndex, weights }] of endpoints.entries()) {
        const offset = 9 * triangleIndex;
        for (let axis = 0; axis < 3; axis++) {
          const a = drawPositionsM[offset + axis];
          const b = drawPositionsM[offset + axis + 3];
          const c = drawPositionsM[offset + axis + 6];
          const value = a + weights[1] * (b - a) + weights[2] * (c - a);
          if (!Number.isFinite(value)) return null;
          result[index * 3 + axis] = value;
        }
      }
      return result;
    },
  });
}
