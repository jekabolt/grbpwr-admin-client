import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  readDxfWithSourceNativeStraightEdgeAuthorityV1,
  projectDxfSourceNativeStraightEdgeAuthorityV1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
} from '../../pattern-import/dxf-source-native-straight-edge-authority-v1';
import {
  buildDxfAssemblyHandoffV1,
  DXF_ASSEMBLY_HANDOFF_V1,
  type DxfAssemblyHandoffCandidateV1,
} from './dxf-assembly-handoff-v1';
import {
  DXF_EXACT_NATIVE_SEAM_SPAN_V1,
  DXF_EXACT_NATIVE_SEAM_SPAN_LIMITS_V1,
  resolveDxfExactNativeSeamSpanV1,
  type DxfExactNativeSeamSpanRequestV1,
  type DxfExactNativeSeamSpanResultV1,
} from './dxf-exact-native-seam-span-v1';
import type { Phase2BoundarySamplingPieceV1 } from '../mesh/triangulation/phase2-boundary-sampling-v1';

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
type Request = Mutable<DxfExactNativeSeamSpanRequestV1>;

// Actual native DXF decoder/projection and existing handoff seal, with explicitly authored
// synthetic polygons. This is content validation, not saved-card/native-owner/runtime admission.
async function fixture(clockwise = false) {
  const polygons = [
    [
      [0, 0],
      [60, 0],
      [60, 80],
      [0, 80],
    ],
    [
      [200, 0],
      [224, 18],
      [260, 18],
      [260, 92],
      [200, 92],
    ],
  ];
  const ids = ['panel-a', 'panel-b'];
  const handles = ['A1', 'B1'];
  const entities = polygons
    .map((points, i) =>
      [
        '0',
        'LWPOLYLINE',
        '5',
        handles[i],
        '8',
        '14',
        '90',
        String(points.length),
        '70',
        '1',
        ...(clockwise ? [points[0], ...points.slice(1).reverse()] : points).flatMap(([x, y]) => [
          '10',
          String(x),
          '20',
          String(y),
        ]),
      ].join('\n'),
    )
    .join('\n');
  const bytes = new TextEncoder().encode(
    '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n' +
      entities +
      '\n0\nENDSEC\n0\nEOF\n',
  );
  const sourceFileId = 'native-multiedge-fixture';
  const read = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
    { id: sourceFileId, name: 'two-authored-native-spans.dxf', bytes: bytes.buffer },
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId },
  );
  if (!read.ok) throw new Error(JSON.stringify(read.blockers));
  const native = projectDxfSourceNativeStraightEdgeAuthorityV1(read.value.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
    sourceFileId,
    sourceSha256: read.value.read.doc.file.sha256,
  });
  if (!native.ok || !native.projection.complete)
    throw new Error('Native fixture projection incomplete.');
  const rawRings = handles.map((handle) =>
    native.projection.descriptors
      .filter((e) => e.primitive.entityHandle === handle)
      .sort((a, b) => a.primitive.primitiveSegmentIndex - b.primitive.primitiveSegmentIndex),
  );
  expect(rawRings.map((r) => r.length)).toEqual([4, 5]);
  // Exact original endpoint IDs and occurrence order establish the normalized contour proof.
  // No coordinate search: CW raw polyline occurrences are walked in reverse, each with [1,0].
  const rings = rawRings.map((edges) =>
    clockwise
      ? [...edges].reverse().map((edge) => ({
          ...edge,
          startVertexId: edge.endVertexId,
          endVertexId: edge.startVertexId,
          startMm: edge.endMm,
          endMm: edge.startMm,
          native: { ...edge.native, sourceCurveTRange: [1, 0] as const },
        }))
      : edges,
  );

  const side = (
    piece: number,
    start: number,
    end: number,
    direction: 'forward' | 'reverse' = 'forward',
  ) => ({
    pieceId: ids[piece],
    contourId: ids[piece] + '-shell',
    anchors: [rings[piece][start].startVertexId, rings[piece][end].startVertexId] as const,
    direction,
  });
  const candidate: DxfAssemblyHandoffCandidateV1 = {
    schemaVersion: DXF_ASSEMBLY_HANDOFF_V1,
    source: {
      format: 'DXF',
      documentId: 'two-authored-native-spans',
      revision: '1',
      units: 'mm',
      sourceSha256: native.projection.sourceSha256,
      exportSha256: native.projection.sourceSha256,
      exporterId: 'test-actual-native-decoder',
      exporterVersion: '1',
      provenanceKind: 'synthetic-fixture',
      corpusEntryId: null,
    },
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
    pieces: rings.map((edges, i) => {
      const lengths = edges.map((e) =>
        Math.hypot(e.endMm[0] - e.startMm[0], e.endMm[1] - e.startMm[1]),
      );
      const perimeter = lengths.reduce((sum, length) => sum + length, 0);
      return {
        id: ids[i],
        name: ids[i],
        cutCount: 1,
        grainDegrees: 0,
        contours: [
          {
            id: ids[i] + '-shell',
            role: 'sewing-boundary',
            closed: true,
            vertices: edges.map((e, index) => ({
              id: e.startVertexId,
              positionMm: e.startMm,
              source: {
                sourceCurveId: e.sourceCurveId,
                parameterSpace: e.native.parameterSpace,
                sourceCurveT: e.native.sourceCurveTRange[0],
                normalizedArc: lengths.slice(0, index).reduce((a, b) => a + b, 0) / perimeter,
              },
            })),
          },
        ],
      };
    }),
    seams: [
      {
        id: 'authored-span',
        operationId: 'ao-10',
        mapping: 'equal',
        lengthRatio: 1,
        sides: [side(0, 0, 2), side(1, 0, 3)],
      },
    ],
    operations: [{ id: 'ao-10', stage: 1, order: 0, kind: 'stitch', seamIds: ['authored-span'] }],
    materials: [{ id: 'explicit-fixture-material', materialRevision: '1', pieceIds: ids }],
  };
  const built = await buildDxfAssemblyHandoffV1(candidate);
  if (!built.ok) throw new Error(JSON.stringify(built));
  const pieces: Phase2BoundarySamplingPieceV1[] = built.value.pieces.map((piece, i) => {
    const ring = piece.contours[0];
    return {
      input: {
        pieceId: piece.id,
        shell: {
          id: ring.id,
          role: 'shell',
          vertices: ring.vertices.map((v) => ({
            id: v.id,
            positionMm: v.positionMm,
            source: {
              contourId: ring.id,
              sourceCurveId: v.source.sourceCurveId,
              sourceCurveParameterSpace: v.source.parameterSpace,
              sourceCurveT: v.source.sourceCurveT,
              normalizedArc: v.source.normalizedArc,
            },
          })),
        },
        holes: [],
        seamEndpoints: [],
        grainDegrees: 0,
        options: {
          targetEdgeMm: 10,
          minInputEdgeMm: 1e-6,
          minTriangleAngleDegrees: 0.01,
          maxEdgeRatio: 1e9,
          maxRadiusEdgeRatio: 1e9,
          maxBoundaryErrorMm: 1e-9,
          collinearSinTolerance: 1e-12,
        },
      },
      edges: rings[i].map((e, edgeIndex) => ({
        edgeId: piece.id + '/edge-' + edgeIndex,
        pieceId: piece.id,
        ringId: ring.id,
        edgeIndex,
        startBoundaryVertexId: e.startVertexId,
        endBoundaryVertexId: e.endVertexId,
        native: { sourceFileId, ...e.native },
      })),
    };
  });
  return {
    request: {
      schemaVersion: DXF_EXACT_NATIVE_SEAM_SPAN_V1,
      handoff: built.value,
      sourceSampling: { sourceFileId, pieces },
      side: side(0, 0, 2),
    } satisfies DxfExactNativeSeamSpanRequestV1,
    side,
    rawRings,
  };
}
function success(result: DxfExactNativeSeamSpanResultV1) {
  if (!result.ok) throw new Error(JSON.stringify(result.blockers));
  return result.witness;
}

describe('pure exact native multiedge span (actual DXF fixture, no mesh or owner admission)', () => {
  let seed: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => {
    seed = await fixture();
  });
  afterEach(() => vi.restoreAllMocks());
  const clone = () => structuredClone(seed.request) as Request;

  it('retains 2-vs-3 noncollinear native spans with equal total length and every original corner', async () => {
    const a = success(await resolveDxfExactNativeSeamSpanV1(seed.request));
    const b = success(
      await resolveDxfExactNativeSeamSpanV1({ ...seed.request, side: seed.side(1, 0, 3) }),
    );
    expect(a.orderedEdgeIds).toEqual(['panel-a/edge-0', 'panel-a/edge-1']);
    expect(b.orderedEdgeIds).toEqual(['panel-b/edge-0', 'panel-b/edge-1', 'panel-b/edge-2']);
    expect(a.corners.map((c) => c.vertex.positionMm)).toEqual([
      [0, 0],
      [60, 0],
      [60, 80],
    ]);
    expect(b.corners.map((c) => c.vertex.positionMm)).toEqual([
      [200, 0],
      [224, 18],
      [260, 18],
      [260, 92],
    ]);
    expect(a.lengthMm).toBe(140);
    expect(b.lengthMm).toBe(140);
    expect(a.corners.map((c) => c.cumulativeLengthMm)).toEqual([0, 60, 140]);
    expect(b.corners.map((c) => c.cumulativeLengthMm)).toEqual([0, 30, 66, 140]);
    expect(a.orderedSourceCurveIds).toEqual(
      seed.request.sourceSampling.pieces[0].edges.slice(0, 2).map((e) => e.native.sourceCurveId),
    );
    expect(a.claims).toMatchObject({
      nativeSourceAuthenticated: false,
      savedSourceAuthenticated: false,
      durableAuthority: false,
      runtimeAuthority: false,
      meshCompiled: false,
      sharedSeamGridProduced: false,
      coordinateIdentityInferenceUsed: false,
    });
  });
  it('accepts genuine clockwise native primitives in normalized outgoing contour order and composes reversal', async () => {
    const cw = await fixture(true);
    const forward = success(await resolveDxfExactNativeSeamSpanV1(cw.request));
    const reverse = success(
      await resolveDxfExactNativeSeamSpanV1({ ...cw.request, side: cw.side(0, 0, 2, 'reverse') }),
    );
    expect(forward.lengthMm).toBe(140);
    expect(forward.corners.map((c) => c.vertex.positionMm)).toEqual([
      [0, 0],
      [60, 0],
      [60, 80],
    ]);
    expect(forward.edges.map((e) => e.directedSourceCurveTRange)).toEqual([
      [1, 0],
      [1, 0],
    ]);
    expect(reverse.edges.map((e) => e.directedSourceCurveTRange)).toEqual([
      [0, 1],
      [0, 1],
    ]);
    expect(reverse.orderedSourceCurveIds).toEqual([...forward.orderedSourceCurveIds].reverse());
    for (const edge of forward.edges) {
      const raw = cw.rawRings[0].find(
        (candidate) => candidate.sourceCurveId === edge.occurrence.native.sourceCurveId,
      )!;
      expect(edge.directedBoundaryVertexIds).toEqual([raw.endVertexId, raw.startVertexId]);
      expect(edge.occurrence.native.sourceCurveTRange).toEqual([1, 0]);
    }
    const b = success(
      await resolveDxfExactNativeSeamSpanV1({ ...cw.request, side: cw.side(1, 0, 3) }),
    );
    expect(b.lengthMm).toBe(forward.lengthMm);
    expect(b.edges).toHaveLength(3);
  });
  it('rejects a signed native range that disagrees with the sealed outgoing endpoint parameter', async () => {
    const cw = await fixture(true);
    const request = structuredClone(cw.request) as Request;
    request.sourceSampling.pieces[0].edges[0].native.sourceCurveTRange = [0, 1];
    expect(await resolveDxfExactNativeSeamSpanV1(request)).toMatchObject({
      ok: false,
      blockers: [{ code: 'native-binding' }],
    });
    const unsigned = clone();
    unsigned.sourceSampling.pieces[0].edges[0].native.sourceCurveTRange = [1, 0];
    expect(await resolveDxfExactNativeSeamSpanV1(unsigned)).toMatchObject({
      ok: false,
      blockers: [{ code: 'native-binding' }],
    });
  });
  it('wraps the original contour index, then reverses exactly that same selected interval', async () => {
    const forward = success(
      await resolveDxfExactNativeSeamSpanV1({ ...seed.request, side: seed.side(0, 3, 1) }),
    );
    const reverse = success(
      await resolveDxfExactNativeSeamSpanV1({
        ...seed.request,
        side: seed.side(0, 3, 1, 'reverse'),
      }),
    );
    expect(forward.orderedEdgeIds).toEqual(['panel-a/edge-3', 'panel-a/edge-0']);
    expect(reverse.orderedEdgeIds).toEqual([...forward.orderedEdgeIds].reverse());
    expect(reverse.corners.map((c) => c.vertex.id)).toEqual(
      forward.corners.map((c) => c.vertex.id).reverse(),
    );
    expect(reverse.terminalBoundaryVertexIds).toEqual(
      [...forward.terminalBoundaryVertexIds].reverse(),
    );
    expect(forward.wrapsContourOrigin).toBe(true);
    expect(reverse.wrapsContourOrigin).toBe(true);
    expect(reverse.lengthMm).toBe(forward.lengthMm);
    expect(reverse.corners.map((c) => c.cumulativeLengthMm)).toEqual([0, 60, 140]);
    expect(
      reverse.edges.every(
        (e) => e.directedSourceCurveTRange[0] === 1 && e.directedSourceCurveTRange[1] === 0,
      ),
    ).toBe(true);
    expect(reverse.edges[0].occurrence).toEqual(seed.request.sourceSampling.pieces[0].edges[0]);
  });
  it('selects N-1 edges rather than the legacy short reverse-adjacent edge', async () => {
    const span = success(
      await resolveDxfExactNativeSeamSpanV1({ ...seed.request, side: seed.side(0, 1, 0) }),
    );
    expect(span.orderedEdgeIds).toEqual(['panel-a/edge-1', 'panel-a/edge-2', 'panel-a/edge-3']);
    expect(span.lengthMm).toBe(220);
    expect(span.corners).toHaveLength(4);
  });
  it('keeps one edge valid without changing its descriptor, and is deterministic/deep detached', async () => {
    const input = clone();
    const side = seed.side(0, 0, 1);
    input.side = { ...side, anchors: [side.anchors[0], side.anchors[1]] };
    const before = structuredClone(input);
    const first = success(await resolveDxfExactNativeSeamSpanV1(input));
    const second = success(await resolveDxfExactNativeSeamSpanV1(input));
    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(first.edges[0].occurrence).toEqual(input.sourceSampling.pieces[0].edges[0]);
    expect(first.edges[0].occurrence).not.toBe(input.sourceSampling.pieces[0].edges[0]);
    expect(Object.isFrozen(first.corners[0].vertex.positionMm)).toBe(true);
    input.handoff.pieces[0].contours[0].vertices[0].positionMm[0] = 999;
    input.sourceSampling.pieces[0].edges[0].edgeId = 'changed';
    expect(first.corners[0].vertex.positionMm).toEqual([0, 0]);
    expect(first.orderedEdgeIds).toEqual(['panel-a/edge-0']);
  });
  it.each([
    [
      'missing endpoint',
      (r: Request) => {
        r.side.anchors[1] = 'missing';
      },
      'missing-anchor',
    ],
    [
      'same endpoint/full cycle',
      (r: Request) => {
        r.side.anchors[1] = r.side.anchors[0];
      },
      'invalid-span',
    ],
    [
      'wrong contour',
      (r: Request) => {
        r.side.contourId = 'panel-b-shell';
      },
      'missing-contour',
    ],
    [
      'cross-piece endpoint',
      (r: Request) => {
        r.side.anchors[1] = r.handoff.pieces[1].contours[0].vertices[0].id;
      },
      'missing-anchor',
    ],
    [
      'ambiguous occurrence',
      (r: Request) => {
        r.sourceSampling.pieces[0].edges.push({
          ...r.sourceSampling.pieces[0].edges[0],
          edgeId: 'duplicate-occurrence',
        });
      },
      'edge-coverage',
    ],
    [
      'duplicate edge ID',
      (r: Request) => {
        r.sourceSampling.pieces[1].edges[0].edgeId = r.sourceSampling.pieces[0].edges[0].edgeId;
      },
      'edge-coverage',
    ],
    [
      'missing unselected edge',
      (r: Request) => {
        r.sourceSampling.pieces[1].edges.pop();
      },
      'edge-coverage',
    ],
    [
      'disconnected endpoint',
      (r: Request) => {
        r.sourceSampling.pieces[0].edges[0].endBoundaryVertexId = r.side.anchors[1];
      },
      'edge-coverage',
    ],
    [
      'wrong original position',
      (r: Request) => {
        r.sourceSampling.pieces[0].input.shell.vertices[0].positionMm = [0.25, 0];
      },
      'boundary-binding',
    ],
    [
      'substitute same-position vertex',
      (r: Request) => {
        r.sourceSampling.pieces[0].input.shell.vertices[0].id = 'substitute';
      },
      'boundary-binding',
    ],
    [
      'duplicate sampling vertex',
      (r: Request) => {
        r.sourceSampling.pieces[0].input.shell.vertices[1].id =
          r.sourceSampling.pieces[0].input.shell.vertices[0].id;
      },
      'boundary-binding',
    ],
    [
      'wrong native source',
      (r: Request) => {
        r.sourceSampling.pieces[0].edges[0].native.sourceFileId = 'another-source';
      },
      'native-binding',
    ],
    [
      'wrong native curve',
      (r: Request) => {
        r.sourceSampling.pieces[0].edges[0].native.sourceCurveId = 'another-curve';
      },
      'native-binding',
    ],
    [
      'partial native parameters',
      (r: Request) => {
        r.sourceSampling.pieces[0].edges[0].native.sourceCurveTRange = [0, 0.5];
      },
      'native-binding',
    ],
    [
      'record pretending to be a parameter tuple',
      (r: Request) => {
        Object.defineProperty(r.sourceSampling.pieces[0].edges[0].native, 'sourceCurveTRange', {
          value: { 0: 0, 1: 1 },
          enumerable: true,
        });
      },
      'native-binding',
    ],
    [
      'curved source witness',
      (r: Request) => {
        r.sourceSampling.pieces[0].edges[0].native.chordErrorBoundMm = 0.01;
      },
      'unsupported-native-geometry',
    ],
    [
      'scaled source frame',
      (r: Request) => {
        r.sourceSampling.pieces[0].edges[0].native.transform = { kind: 'positive-uniform-scale' };
      },
      'unsupported-native-geometry',
    ],
    [
      'duplicate sampling piece',
      (r: Request) => {
        r.sourceSampling.pieces[1] = structuredClone(r.sourceSampling.pieces[0]);
      },
      'piece-coverage',
    ],
    [
      'stale handoff seal',
      (r: Request) => {
        r.handoff.source.exportSha256 = 'a'.repeat(64);
      },
      'handoff-invalid',
    ],
    [
      'repeated handoff vertex',
      (r: Request) => {
        r.handoff.pieces[0].contours[0].vertices[1].id =
          r.handoff.pieces[0].contours[0].vertices[0].id;
      },
      'handoff-invalid',
    ],
  ])('refuses %s without publishing a witness', async (_name, mutate, code) => {
    const request = clone();
    mutate(request);
    expect(await resolveDxfExactNativeSeamSpanV1(request)).toMatchObject({
      ok: false,
      witness: null,
      blockers: [{ code }],
    });
  });
  it('rejects accessors without executing them', async () => {
    const input = clone();
    const getter = vi.fn(() => input.side);
    Object.defineProperty(input, 'side', { enumerable: true, get: getter });
    expect(await resolveDxfExactNativeSeamSpanV1(input)).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-input' }],
    });
    expect(getter).not.toHaveBeenCalled();
  });
  it('guards descriptor-reflection reentry and releases the guard for later reads', async () => {
    let nested: Promise<DxfExactNativeSeamSpanResultV1> | undefined;
    const proxy = new Proxy(seed.request, {
      ownKeys(target) {
        nested ??= resolveDxfExactNativeSeamSpanV1(seed.request);
        return Reflect.ownKeys(target);
      },
    });
    expect((await resolveDxfExactNativeSeamSpanV1(proxy)).ok).toBe(true);
    expect(await nested).toMatchObject({ ok: false, blockers: [{ code: 'reentrant-call' }] });
    expect((await resolveDxfExactNativeSeamSpanV1(seed.request)).ok).toBe(true);
  });
  it('rejects oversized array before enumerating its properties', async () => {
    const request = clone();
    const ownKeys = vi.fn(Reflect.ownKeys);
    const huge = new Proxy(new Array(DXF_EXACT_NATIVE_SEAM_SPAN_LIMITS_V1.maximumArrayLength + 1), {
      ownKeys,
    });
    Object.defineProperty(request.side, 'anchors', { value: huge, enumerable: true });
    expect(await resolveDxfExactNativeSeamSpanV1(request)).toMatchObject({
      ok: false,
      blockers: [{ code: 'bounds' }],
    });
    expect(ownKeys).not.toHaveBeenCalled();
  });
  it('rejects a proxy length lie before constructing an oversized sparse snapshot', async () => {
    const request = clone();
    const sparse = new Array(4294967295);
    sparse[4294967294] = request.sourceSampling.pieces[0].edges[0];
    const misleading = new Proxy(sparse, {
      getOwnPropertyDescriptor(target, key) {
        const d = Reflect.getOwnPropertyDescriptor(target, key);
        return key === 'length' ? { ...d!, value: 1 } : d;
      },
    });
    request.sourceSampling.pieces[0].edges = misleading;
    expect(await resolveDxfExactNativeSeamSpanV1(request)).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-input' }],
    });
  });
  it('rejects nonfinite and cyclic data before hashing', async () => {
    const request = clone();
    request.sourceSampling.pieces[0].edges[0].native.chordErrorBoundMm = Number.NaN;
    expect(await resolveDxfExactNativeSeamSpanV1(request)).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-number' }],
    });
    const cyclic = { request } as { request: unknown };
    cyclic.request = cyclic;
    expect(await resolveDxfExactNativeSeamSpanV1(cyclic)).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-input' }],
    });
  });
  it('captures before the seal await and refuses cancellation after that await', async () => {
    const request = clone();
    const original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      request.side.anchors[1] = request.side.anchors[0];
      request.sourceSampling.pieces[0].edges[0].edgeId = 'changed-during-await';
      return result;
    });
    const witness = success(await resolveDxfExactNativeSeamSpanV1(request));
    expect(witness.orderedEdgeIds).toEqual(['panel-a/edge-0', 'panel-a/edge-1']);
    vi.restoreAllMocks();
    const controller = new AbortController();
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      controller.abort();
      return result;
    });
    expect(await resolveDxfExactNativeSeamSpanV1(seed.request, controller.signal)).toMatchObject({
      ok: false,
      witness: null,
      blockers: [{ code: 'cancelled' }],
    });
    expect((await resolveDxfExactNativeSeamSpanV1(seed.request)).ok).toBe(true);
  });
  it('a pre-aborted local read does not affect an independent read', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await resolveDxfExactNativeSeamSpanV1(seed.request, controller.signal)).toMatchObject({
      ok: false,
      blockers: [{ code: 'cancelled' }],
    });
    const [a, b] = await Promise.all([
      resolveDxfExactNativeSeamSpanV1(seed.request),
      resolveDxfExactNativeSeamSpanV1(seed.request),
    ]);
    expect(success(a)).toEqual(success(b));
  });
});
