import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  readDxfWithSourceNativeStraightEdgeAuthorityV1,
  projectDxfSourceNativeStraightEdgeAuthorityV1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import {
  buildDxfAssemblyHandoffV1,
  DXF_ASSEMBLY_HANDOFF_V1,
  type DxfAssemblyHandoffCandidateV1,
} from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import {
  DXF_EXACT_NATIVE_SEAM_SPAN_V1,
  type DxfExactNativeSeamSpanRequestV1,
} from 'lib/cloth/domain/dxf-exact-native-seam-span-v1';
import type { Phase2BoundarySamplingPieceV1 } from 'lib/cloth/mesh/triangulation/phase2-boundary-sampling-v1';
import {
  buildDxfExactNativeSeamGridV1,
  DXF_EXACT_NATIVE_SEAM_GRID_V1,
  type DxfExactNativeSeamGridRequestV1,
} from './dxf-exact-native-seam-grid-v1';
async function fixture(
  reverse = false,
  wrap = false,
  split = 30,
  clockwise = false,
  extraLength = 0,
) {
  const polygons = [
    [
      [0, 0],
      [60, 0],
      [60, 80],
      [0, 80],
    ],
    [
      [200, 0],
      [224, 18 + split - 30],
      [248, 0],
      [248, 140 - 2 * Math.hypot(24, 18 + split - 30) + extraLength],
      [200, 140 - 2 * Math.hypot(24, 18 + split - 30) + extraLength],
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
        sides: [
          side(0, wrap ? 3 : 0, wrap ? 1 : 2),
          side(1, wrap ? 4 : 0, wrap ? 2 : 3, reverse ? 'reverse' : 'forward'),
        ],
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
      side: side(0, wrap ? 3 : 0, wrap ? 1 : 2),
    } satisfies DxfExactNativeSeamSpanRequestV1,
    side,
    rawRings,
  };
}

async function request(
  reverse = false,
  wrap = false,
  split = 30,
  clockwise = false,
  extraLength = 0,
): Promise<DxfExactNativeSeamGridRequestV1> {
  const f = await fixture(reverse, wrap, split, clockwise, extraLength);
  return {
    schemaVersion: DXF_EXACT_NATIVE_SEAM_GRID_V1,
    seamId: 'authored-span',
    mapping: 'equal',
    lengthRatio: 1,
    exactToleranceMm: 1e-6,
    targetEdgeMm: 20,
    minSegmentMm: 1e-8,
    sides: [
      f.request,
      {
        ...f.request,
        side: f.side(1, wrap ? 4 : 0, wrap ? 2 : 3, reverse ? 'reverse' : 'forward'),
      },
    ],
  };
}
afterEach(() => vi.restoreAllMocks());
describe('exact paired native span common grid; actual DXF and fixed resolver', () => {
  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, false],
    [false, false, true],
    [true, false, true],
  ])('preserves every corner reverse=%s wrap=%s nativeCW=%s', async (reverse, wrap, clockwise) => {
    const input = await request(reverse, wrap, 30, clockwise);
    const out = await buildDxfExactNativeSeamGridV1(input);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    if (!out.ok) throw new Error('grid failed');
    const w = out.witness;
    expect(w.sides.map((s) => s.span.edges.length)).toEqual([2, 3]);
    expect(w.sides.map((s) => s.samples.length)).toEqual([
      w.normalizedProgress.length,
      w.normalizedProgress.length,
    ]);
    for (const side of w.sides) {
      expect(
        side.samples.filter((s) => s.nativeCorner).map((s) => s.nativeCorner!.vertex.id),
      ).toEqual(side.span.corners.map((c) => c.vertex.id));
      expect(side.samples.every((s) => s.edgeProgress >= 0 && s.edgeProgress <= 1)).toBe(true);
      for (let i = 1; i < side.samples.length; i++) {
        const a = side.samples[i - 1].positionMm,
          b = side.samples[i].positionMm;
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThanOrEqual(input.targetEdgeMm);
      }
    }
    expect(w.claims).toMatchObject({
      nativeVertexIdsMinted: false,
      sourceAuthorityMinted: false,
      compilerAdmission: false,
    });
    expect(Object.isFrozen(w.sides[0].samples[0])).toBe(true);
    expect(await buildDxfExactNativeSeamGridV1(input)).toEqual(out);
    if (reverse)
      expect(w.sides[1].samples.some((s) => s.edgeProgress > 0 && s.edgeProgress < 1)).toBe(true);
  });
  it('subdivides between mandatory native corners when a uniform sample is too close', async () => {
    const split = 12 + Math.sqrt(35.02 ** 2 - 24 ** 2);
    const input = await request(false, false, split);
    const out = await buildDxfExactNativeSeamGridV1({
      ...input,
      targetEdgeMm: 36,
      minSegmentMm: 1,
    });
    if (!out.ok) throw new Error(JSON.stringify(out));
    expect(out.witness.uniformSubdivisionCount).toBe(0);
    expect(out.witness.normalizedProgress).not.toContain(0.25);
    for (const { span, samples } of out.witness.sides) {
      expect(samples.flatMap((s) => (s.nativeCorner ? [s.nativeCorner.vertex.id] : []))).toEqual(
        span.corners.map((c) => c.vertex.id),
      );
      const lengths = samples.slice(1).map((s, i) => {
        const [x, y] = samples[i].positionMm;
        return Math.hypot(s.positionMm[0] - x, s.positionMm[1] - y);
      });
      expect(Math.min(...lengths)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...lengths)).toBeLessThanOrEqual(36);
    }
  });
  it('rejects close but distinct corner progress rather than merging native IDs', async () => {
    const input = await request(false, false, 30 + 1e-4);
    const out = await buildDxfExactNativeSeamGridV1({ ...input, minSegmentMm: 1e-3 });
    expect(out).toMatchObject({ ok: false, blockers: [{ code: 'minimum-segment' }] });
  });
  it('rejects unequal actual span lengths without easing or changing the source', async () => {
    const input = await request(false, false, 30, false, 1);
    expect(await buildDxfExactNativeSeamGridV1(input)).toMatchObject({
      ok: false,
      blockers: [{ code: 'unequal-seam-length' }],
    });
  });
  it('rechecks cancellation after the final grid digest', async () => {
    const input = await request();
    const controller = new AbortController();
    const original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      if (
        new TextDecoder().decode(bytes.subarray(0, DXF_EXACT_NATIVE_SEAM_GRID_V1.length + 1)) ===
        DXF_EXACT_NATIVE_SEAM_GRID_V1 + '\0'
      )
        controller.abort();
      return original(algorithm, data);
    });
    expect(await buildDxfExactNativeSeamGridV1(input, controller.signal)).toMatchObject({
      ok: false,
      blockers: [{ code: 'cancelled' }],
    });
  });
  it('refuses wrong seam identity, reversed side order, eased mapping and excessive tolerance', async () => {
    const input = await request();
    for (const edit of [
      { seamId: 'other' },
      { sides: [input.sides[1], input.sides[0]] },
      { mapping: 'eased' },
      { exactToleranceMm: 0.001 },
    ])
      expect((await buildDxfExactNativeSeamGridV1({ ...input, ...edit })).ok).toBe(false);
  });
  it('refuses excessive uniform subdivisions', async () => {
    const input = await request();
    expect(
      await buildDxfExactNativeSeamGridV1({ ...input, targetEdgeMm: 1e-5, minSegmentMm: 1e-9 }),
    ).toMatchObject({ ok: false, blockers: [{ code: 'bounds' }] });
  });
  it('does not read accessors and handles cancellation before work', async () => {
    const input = await request();
    let reads = 0;
    const hostile = { ...input };
    Object.defineProperty(hostile, 'seamId', {
      enumerable: true,
      get() {
        reads++;
        return 'authored-span';
      },
    });
    expect((await buildDxfExactNativeSeamGridV1(hostile)).ok).toBe(false);
    expect(reads).toBe(0);
    const c = new AbortController();
    c.abort();
    expect(await buildDxfExactNativeSeamGridV1(hostile, c.signal)).toMatchObject({
      ok: false,
      blockers: [{ code: 'cancelled' }],
    });
    expect(reads).toBe(0);
  });
  it('rejects a proxy array advertising an out-of-range numeric key', async () => {
    const input = await request();
    const sides = new Proxy([...input.sides], {
      ownKeys: () => ['0', '1000000000', 'length'],
      getOwnPropertyDescriptor(target, key) {
        if (key === '1000000000')
          return { value: target[1], enumerable: true, writable: true, configurable: true };
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(await buildDxfExactNativeSeamGridV1({ ...input, sides })).toMatchObject({
      ok: false,
      blockers: [{ code: 'invalid-input' }],
    });
  });
  it('captures both sides and policy before the first digest await', async () => {
    const input = structuredClone(await request());
    const pending = buildDxfExactNativeSeamGridV1(input);
    Object.assign(input, { seamId: 'changed', targetEdgeMm: 0 });
    const out = await pending;
    expect(out.ok, JSON.stringify(out)).toBe(true);
    if (out.ok) expect(out.witness.seamId).toBe('authored-span');
  });
  it('claims capture before proxy traps can reenter', async () => {
    const input = await request();
    let nested: ReturnType<typeof buildDxfExactNativeSeamGridV1> | undefined;
    const hostile = new Proxy(input, {
      getPrototypeOf(target) {
        nested ??= buildDxfExactNativeSeamGridV1(input);
        return Reflect.getPrototypeOf(target);
      },
    });
    expect((await buildDxfExactNativeSeamGridV1(hostile)).ok).toBe(true);
    expect(await nested).toMatchObject({ ok: false, blockers: [{ code: 'reentrant-call' }] });
  });
  it('refuses a changed sealed handoff and structural witness instead of resolver input', async () => {
    const input = await request();
    const changed = structuredClone(input);
    Object.assign(changed.sides[1].handoff.pieces[0].contours[0].vertices[0], {
      positionMm: [99, 99],
    });
    expect((await buildDxfExactNativeSeamGridV1(changed)).ok).toBe(false);
    expect(
      (await buildDxfExactNativeSeamGridV1({ ...input, sides: [{ witness: {} }, input.sides[1]] }))
        .ok,
    ).toBe(false);
  });
});
