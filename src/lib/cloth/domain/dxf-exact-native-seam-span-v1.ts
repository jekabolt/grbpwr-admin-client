import {
  compileDxfAssemblyHandoffV1,
  type DxfAssemblyHandoffV1,
  type DxfBoundaryVertexV1,
  type DxfSeamSideV1,
  type DxfPatternPieceV1,
  type DxfPatternContourV1,
} from './dxf-assembly-handoff-v1';
import type {
  Phase2BoundarySamplingPieceV1,
  Phase2NativeBoundaryEdgeV1,
} from '../mesh/triangulation/phase2-boundary-sampling-v1';
import { preflightTriangulationInput } from '../mesh/triangulation/audit';

export const DXF_EXACT_NATIVE_SEAM_SPAN_V1 = 'dxf-exact-native-seam-span/1' as const;
export const DXF_EXACT_NATIVE_SEAM_SPAN_LIMITS_V1 = Object.freeze({
  maximumPieces: 64,
  maximumContours: 64,
  maximumEdges: 8192,
  maximumDepth: 32,
  maximumNodes: 500_000,
  maximumProperties: 2_000_000,
  maximumArrayLength: 32_768,
  maximumStringLength: 4096,
  maximumTextBytes: 32 * 1024 * 1024,
});
export const DXF_EXACT_NATIVE_SEAM_SPAN_CLAIMS_V1 = Object.freeze({
  contentConsistencyOnly: true,
  handoffSealReplayed: true,
  nativeSourceAuthenticated: false,
  savedSourceAuthenticated: false,
  durableAuthority: false,
  runtimeAuthority: false,
  meshCompiled: false,
  sharedSeamGridProduced: false,
  coordinateIdentityInferenceUsed: false,
  originalCornersPreserved: true,
});

export type DxfExactNativeSeamSpanRequestV1 = Readonly<{
  schemaVersion: typeof DXF_EXACT_NATIVE_SEAM_SPAN_V1;
  handoff: DxfAssemblyHandoffV1;
  /** Existing sampling content with outgoing native proof in sealed contour order. A normalized
   * edge may carry [1,0] when it traverses the original native primitive in reverse. The fixed
   * upstream native binder owns that proof; this resolver checks content, not source authority. */
  sourceSampling: Readonly<{
    sourceFileId: string;
    pieces: readonly Phase2BoundarySamplingPieceV1[];
  }>;
  side: DxfSeamSideV1;
}>;

export type DxfExactNativeSeamSpanWitnessV1 = Readonly<{
  schemaVersion: typeof DXF_EXACT_NATIVE_SEAM_SPAN_V1;
  source: Readonly<{
    handoffCanonicalSha256: string;
    sourceFileId: string;
    sourceSha256: string;
    exportSha256: string;
  }>;
  pieceId: string;
  contourId: string;
  authoredAnchors: readonly [string, string];
  direction: 'forward' | 'reverse';
  /** Select this interval first; direction reverses its ordering, never selects the other arc. */
  intervalPolicy: 'increasing-contour-index-with-wrap-then-direction-reversal/1';
  wrapsContourOrigin: boolean;
  terminalBoundaryVertexIds: readonly [string, string];
  orderedEdgeIds: readonly string[];
  orderedSourceCurveIds: readonly string[];
  edges: readonly Readonly<{
    /** Unmodified original contour-order occurrence, not a new edge or AO sub-seam. */
    occurrence: Phase2NativeBoundaryEdgeV1;
    directedBoundaryVertexIds: readonly [string, string];
    directedSourceCurveTRange: readonly [number, number];
    lengthMm: number;
  }>[];
  corners: readonly Readonly<{
    vertex: DxfBoundaryVertexV1;
    contourVertexIndex: number;
    cumulativeLengthMm: number;
    normalizedProgress: number;
  }>[];
  /** Sum in original increasing-contour order, so reversal cannot change total length. */
  lengthMm: number;
  claims: typeof DXF_EXACT_NATIVE_SEAM_SPAN_CLAIMS_V1;
}>;
export type DxfExactNativeSeamSpanResultV1 =
  | Readonly<{ ok: true; witness: DxfExactNativeSeamSpanWitnessV1; blockers: readonly [] }>
  | Readonly<{
      ok: false;
      witness: null;
      blockers: readonly [Readonly<{ code: string; detail: string }>];
    }>;

class SpanFailure extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'SpanFailure';
  }
}
function fail(code: string, detail: string): never {
  throw new SpanFailure(code, detail);
}
const limits = DXF_EXACT_NATIVE_SEAM_SPAN_LIMITS_V1;
const encoder = new TextEncoder();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function check(signal?: AbortSignal): void {
  if (signal !== undefined && aborted.call(signal)) fail('cancelled', 'Span read cancelled.');
}
function blocked(error: unknown): DxfExactNativeSeamSpanResultV1 {
  const failure =
    error instanceof SpanFailure ? error : new SpanFailure('invalid-input', 'Invalid span input.');
  return Object.freeze({
    ok: false,
    witness: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [Readonly<{ code: string; detail: string }>],
  });
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function exact(value: unknown, keys: readonly string[], field: string): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())
  )
    fail('invalid-shape', field + ' fields differ.');
}
function text(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > limits.maximumStringLength)
    fail('invalid-identity', field + ' must be a bounded nonempty ID.');
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).sort(),
    bk = Object.keys(b).sort();
  return (
    sameKeys(ak, bk) &&
    ak.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}
function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}
function capture(input: unknown): unknown {
  let nodes = 0,
    properties = 0,
    textBytes = 0;
  const seen = new Set<object>();
  function copy(value: unknown, depth: number): unknown {
    if (++nodes > limits.maximumNodes || depth > limits.maximumDepth)
      fail('bounds', 'Input graph exceeds bounds.');
    if (value === null || value === undefined || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0))
        fail('invalid-number', 'Finite canonical numbers are required.');
      return value;
    }
    if (typeof value === 'string') {
      if (value.length > limits.maximumStringLength) fail('bounds', 'Input string exceeds bounds.');
      textBytes += encoder.encode(value).byteLength;
      if (textBytes > limits.maximumTextBytes) fail('bounds', 'Input text exceeds bounds.');
      return value;
    }
    if (typeof value !== 'object' || seen.has(value))
      fail('invalid-input', 'Expected acyclic plain content.');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype))
      fail('invalid-input', 'Class instances and typed arrays are not span content.');
    seen.add(value);
    let arrayLength = 0;
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      if (
        !length ||
        !('value' in length) ||
        !Number.isSafeInteger(length.value) ||
        length.value > limits.maximumArrayLength
      )
        fail('bounds', 'Input array exceeds bounds.');
      arrayLength = length.value;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    properties += keys.length;
    if (properties > limits.maximumProperties) fail('bounds', 'Input properties exceed bounds.');
    if (array && keys.length !== arrayLength + 1)
      fail('invalid-input', 'Sparse arrays are unsupported.');
    const result: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of keys) {
      if (typeof key !== 'string' || key === '__proto__')
        fail('invalid-input', 'Noncanonical property.');
      if (array && key === 'length') continue;
      const d = descriptors[key];
      if (
        !d.enumerable ||
        !('value' in d) ||
        (array &&
          (!/^(0|[1-9][0-9]*)$/.test(key) ||
            !Number.isSafeInteger(Number(key)) ||
            Number(key) >= arrayLength))
      )
        fail('invalid-input', 'Accessors and hidden properties are unsupported.');
      (result as Record<string, unknown>)[key] = copy(d.value, depth + 1);
    }
    seen.delete(value);
    return result;
  }
  return copy(input, 0);
}

function validateSampling(
  request: DxfExactNativeSeamSpanRequestV1,
): Map<string, Phase2NativeBoundaryEdgeV1[]> {
  const { handoff, sourceSampling } = request;
  exact(sourceSampling, ['sourceFileId', 'pieces'], 'sourceSampling');
  text(sourceSampling.sourceFileId, 'sourceFileId');
  if (
    !Array.isArray(sourceSampling.pieces) ||
    sourceSampling.pieces.length !== handoff.pieces.length ||
    handoff.pieces.length > limits.maximumPieces
  )
    fail('piece-coverage', 'Sampling must cover every bounded handoff piece exactly once.');
  const pieceMap = new Map(sourceSampling.pieces.map((p) => [p.input.pieceId, p]));
  if (pieceMap.size !== sourceSampling.pieces.length)
    fail('piece-coverage', 'Repeated sampling piece.');
  const edgeIds = new Set<string>(),
    vertexIds = new Set<string>(),
    curveIds = new Set<string>();
  const byContour = new Map<string, Phase2NativeBoundaryEdgeV1[]>();
  let contourCount = 0,
    edgeCount = 0;
  for (const piece of handoff.pieces) {
    const sample = pieceMap.get(piece.id);
    if (!sample || piece.cutCount !== 1)
      fail('piece-coverage', 'Exact single-instance piece required.');
    exact(sample, ['input', 'edges'], 'sampling piece');
    if (!Array.isArray(sample.edges) || !Array.isArray(sample.input.holes))
      fail('invalid-shape', 'Sampling arrays required.');
    const rings = [sample.input.shell, ...sample.input.holes];
    if (
      rings.length !== piece.contours.length ||
      sample.input.grainDegrees !== piece.grainDegrees ||
      preflightTriangulationInput(sample.input).length
    )
      fail('boundary-binding', 'Sampling input differs or fails existing geometry preflight.');
    const ringMap = new Map(rings.map((r) => [r.id, r]));
    if (ringMap.size !== rings.length) fail('boundary-binding', 'Repeated sampling contour.');
    const occurrences = new Map<string, Phase2NativeBoundaryEdgeV1>();
    for (const edge of sample.edges) {
      exact(
        edge,
        [
          'edgeId',
          'pieceId',
          'ringId',
          'edgeIndex',
          'startBoundaryVertexId',
          'endBoundaryVertexId',
          'native',
        ],
        'native occurrence',
      );
      text(edge.edgeId, 'edgeId');
      if (
        !Number.isSafeInteger(edge.edgeIndex) ||
        edge.edgeIndex < 0 ||
        edge.pieceId !== piece.id ||
        edgeIds.has(edge.edgeId)
      )
        fail('edge-coverage', 'Duplicate or invalid native edge identity.');
      edgeIds.add(edge.edgeId);
      const key = edge.ringId + '\0' + edge.edgeIndex;
      if (occurrences.has(key)) fail('edge-coverage', 'Ambiguous native edge occurrence.');
      occurrences.set(key, edge);
    }
    let covered = 0;
    for (const contour of piece.contours) {
      if (
        ++contourCount > limits.maximumContours ||
        (edgeCount += contour.vertices.length) > limits.maximumEdges
      )
        fail('bounds', 'Native contour/edge count exceeds bounds.');
      const ring = ringMap.get(contour.id);
      const expected = contour.vertices.map((v) => ({
        id: v.id,
        positionMm: v.positionMm,
        source: {
          contourId: contour.id,
          sourceCurveId: v.source.sourceCurveId,
          sourceCurveParameterSpace: v.source.parameterSpace,
          sourceCurveT: v.source.sourceCurveT,
          normalizedArc: v.source.normalizedArc,
        },
      }));
      if (
        !ring ||
        ring.role !== (contour.role === 'hole' ? 'hole' : 'shell') ||
        !same(ring.vertices, expected)
      )
        fail('boundary-binding', 'Exact handoff corners/provenance must equal sampling ring.');
      const ordered = contour.vertices.map((start, index) => {
        if (vertexIds.has(start.id))
          fail('boundary-binding', 'Duplicate exact boundary vertex ID.');
        vertexIds.add(start.id);
        const end = contour.vertices[(index + 1) % contour.vertices.length];
        const edge = occurrences.get(contour.id + '\0' + index);
        if (!edge || edge.startBoundaryVertexId !== start.id || edge.endBoundaryVertexId !== end.id)
          fail('edge-coverage', 'Missing or disconnected exact native edge.');
        const native = edge.native;
        exact(
          native,
          [
            'sourceFileId',
            'sourceCurveId',
            'curveKind',
            'parameterSpace',
            'sourceCurveTRange',
            'chordErrorBoundMm',
            'periodic',
            'transform',
          ],
          'native descriptor',
        );
        exact(native.transform, ['kind'], 'native transform');
        if (
          native.curveKind !== 'line' ||
          native.parameterSpace !== 'unit' ||
          native.chordErrorBoundMm !== 0 ||
          native.periodic !== false ||
          native.transform.kind !== 'identity'
        )
          fail(
            'unsupported-native-geometry',
            'Only existing identity-frame nonperiodic native straight edges are supported.',
          );
        if (
          native.sourceFileId !== sourceSampling.sourceFileId ||
          native.sourceCurveId !== start.source.sourceCurveId ||
          start.source.parameterSpace !== 'unit' ||
          start.source.sourceCurveT !== native.sourceCurveTRange[0] ||
          (!same(native.sourceCurveTRange, [0, 1]) && !same(native.sourceCurveTRange, [1, 0])) ||
          curveIds.has(native.sourceCurveId)
        )
          fail(
            'native-binding',
            'Exact native curve/source/parameter identity differs or is duplicated.',
          );
        curveIds.add(native.sourceCurveId);
        const length = Math.hypot(
          end.positionMm[0] - start.positionMm[0],
          end.positionMm[1] - start.positionMm[1],
        );
        if (!(length > 0) || !Number.isFinite(length))
          fail('invalid-length', 'Native edge has no finite positive length.');
        covered++;
        return edge;
      });
      byContour.set(piece.id + '\0' + contour.id, ordered);
    }
    if (covered !== sample.edges.length) fail('edge-coverage', 'Extra native edge occurrence.');
  }
  return byContour;
}

// Guards only synchronous reflection/capture reentry. Independent async reads are allowed.
let capturing = false;
export async function resolveDxfExactNativeSeamSpanV1(
  input: unknown,
  signal?: AbortSignal,
): Promise<DxfExactNativeSeamSpanResultV1> {
  if (capturing)
    return blocked(new SpanFailure('reentrant-call', 'Span capture is already active.'));
  let request: DxfExactNativeSeamSpanRequestV1;
  try {
    capturing = true;
    try {
      check(signal);
      request = capture(input) as DxfExactNativeSeamSpanRequestV1;
    } finally {
      capturing = false;
    }
    exact(request, ['schemaVersion', 'handoff', 'sourceSampling', 'side'], 'request');
    if (request.schemaVersion !== DXF_EXACT_NATIVE_SEAM_SPAN_V1)
      fail('unsupported-version', 'Unknown span semantics.');
    exact(request.side, ['pieceId', 'contourId', 'anchors', 'direction'], 'side');
    const { side, handoff } = request;
    text(side.pieceId, 'pieceId');
    text(side.contourId, 'contourId');
    if (
      !Array.isArray(side.anchors) ||
      side.anchors.length !== 2 ||
      side.anchors[0] === side.anchors[1] ||
      !['forward', 'reverse'].includes(side.direction)
    )
      fail('invalid-span', 'Two distinct exact anchors and an explicit direction are required.');
    side.anchors.forEach((id) => text(id, 'anchor'));
    if (!Array.isArray(handoff?.pieces) || handoff.pieces.length > limits.maximumPieces)
      fail('bounds', 'Handoff exceeds bounded piece coverage.');
    const handoffPieces: readonly DxfPatternPieceV1[] = handoff.pieces;
    let totalContours = 0,
      totalVertices = 0;
    for (const piece of handoffPieces) {
      if (!piece || !Array.isArray(piece.contours))
        fail('invalid-shape', 'Contour array required.');
      const contours: readonly DxfPatternContourV1[] = piece.contours;
      totalContours += contours.length;
      for (const contour of contours) {
        if (!contour || !Array.isArray(contour.vertices))
          fail('invalid-shape', 'Vertex array required.');
        totalVertices += contour.vertices.length;
      }
      if (totalContours > limits.maximumContours || totalVertices > limits.maximumEdges)
        fail('bounds', 'Handoff exceeds bounded native span coverage.');
    }
    const verified = await compileDxfAssemblyHandoffV1(handoff);
    check(signal);
    if (!verified.ok) fail('handoff-invalid', verified.code + ': ' + verified.errors.join('; '));
    if (handoff.physicalSurface.mode !== 'sewing-surface')
      fail('unsupported-surface', 'Explicit sewing surface required.');
    const byContour = validateSampling(request);
    const piece = handoffPieces.find((p) => p.id === side.pieceId);
    const contour = piece?.contours.find((c) => c.id === side.contourId);
    if (!contour || contour.role !== 'sewing-boundary')
      fail('missing-contour', 'Exact sewing contour is absent.');
    const start = contour.vertices.findIndex((v) => v.id === side.anchors[0]);
    const end = contour.vertices.findIndex((v) => v.id === side.anchors[1]);
    if (start < 0 || end < 0)
      fail('missing-anchor', 'Exact native anchor is absent from this contour.');
    const indices = [start],
      edgeIndices: number[] = [],
      prefix = [0];
    let cursor = start,
      wraps = false;
    while (cursor !== end) {
      if (edgeIndices.length >= contour.vertices.length - 1)
        fail('invalid-span', 'Repeated/full-cycle span is unsupported.');
      const next = (cursor + 1) % contour.vertices.length;
      const a = contour.vertices[cursor].positionMm,
        b = contour.vertices[next].positionMm;
      const total = prefix[prefix.length - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!Number.isFinite(total) || !(total > prefix[prefix.length - 1]))
        fail('invalid-length', 'Cumulative native length is not strictly representable.');
      prefix.push(total);
      edgeIndices.push(cursor);
      indices.push(next);
      wraps ||= next === 0;
      cursor = next;
    }
    const lengthMm = prefix[prefix.length - 1];
    const reversed = side.direction === 'reverse';
    const selected = byContour.get(piece!.id + '\0' + contour.id)!;
    const edges = edgeIndices.map((index) => ({
      occurrence: selected[index],
      directedBoundaryVertexIds: [
        contour.vertices[index].id,
        contour.vertices[(index + 1) % contour.vertices.length].id,
      ] as readonly [string, string],
      directedSourceCurveTRange: [...selected[index].native.sourceCurveTRange] as readonly [
        number,
        number,
      ],
      lengthMm: Math.hypot(
        contour.vertices[(index + 1) % contour.vertices.length].positionMm[0] -
          contour.vertices[index].positionMm[0],
        contour.vertices[(index + 1) % contour.vertices.length].positionMm[1] -
          contour.vertices[index].positionMm[1],
      ),
    }));
    if (reversed) {
      edges.reverse();
      for (const edge of edges) {
        edge.directedBoundaryVertexIds = [
          edge.directedBoundaryVertexIds[1],
          edge.directedBoundaryVertexIds[0],
        ];
        edge.directedSourceCurveTRange = [
          edge.directedSourceCurveTRange[1],
          edge.directedSourceCurveTRange[0],
        ];
      }
    }
    const corners = indices.map((index, i) => ({
      vertex: contour.vertices[index],
      contourVertexIndex: index,
      cumulativeLengthMm: prefix[i],
      normalizedProgress: prefix[i] / lengthMm,
    }));
    if (reversed) {
      corners.reverse();
      for (const corner of corners) {
        corner.cumulativeLengthMm = lengthMm - corner.cumulativeLengthMm;
        corner.normalizedProgress = corner.cumulativeLengthMm / lengthMm;
      }
    }
    for (let i = 1; i < corners.length; i++)
      if (
        !(corners[i].cumulativeLengthMm > corners[i - 1].cumulativeLengthMm) ||
        !(corners[i].normalizedProgress > corners[i - 1].normalizedProgress)
      )
        fail('invalid-length', 'Directed native progress is not strictly representable.');
    check(signal);
    return freeze({
      ok: true,
      witness: {
        schemaVersion: DXF_EXACT_NATIVE_SEAM_SPAN_V1,
        source: {
          handoffCanonicalSha256: handoff.seal.canonicalSha256,
          sourceFileId: request.sourceSampling.sourceFileId,
          sourceSha256: handoff.source.sourceSha256,
          exportSha256: handoff.source.exportSha256,
        },
        pieceId: side.pieceId,
        contourId: side.contourId,
        authoredAnchors: side.anchors,
        direction: side.direction,
        intervalPolicy: 'increasing-contour-index-with-wrap-then-direction-reversal/1',
        wrapsContourOrigin: wraps,
        terminalBoundaryVertexIds: [corners[0].vertex.id, corners[corners.length - 1].vertex.id],
        orderedEdgeIds: edges.map((e) => e.occurrence.edgeId),
        orderedSourceCurveIds: edges.map((e) => e.occurrence.native.sourceCurveId),
        edges,
        corners,
        lengthMm,
        claims: DXF_EXACT_NATIVE_SEAM_SPAN_CLAIMS_V1,
      },
      blockers: [],
    });
  } catch (error) {
    return blocked(error);
  }
}
