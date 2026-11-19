import {
  resolveDxfExactNativeSeamSpanV1,
  type DxfExactNativeSeamSpanRequestV1,
  type DxfExactNativeSeamSpanWitnessV1,
} from 'lib/cloth/domain/dxf-exact-native-seam-span-v1';
import { PHASE2_BOUNDARY_SAMPLING_LIMITS_V1 } from 'lib/cloth/mesh/triangulation/phase2-boundary-sampling-v1';

export const DXF_EXACT_NATIVE_SEAM_GRID_V1 = 'dxf-exact-native-seam-grid/1' as const;
export const DXF_EXACT_NATIVE_EASED_SEAM_GRID_V1 = 'dxf-exact-native-eased-seam-grid/1' as const;
export const DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1 =
  'dxf-exact-native-cross-row-seam-grid/1' as const;
export const DXF_EXACT_NATIVE_EASED_SEAM_FEED_V1 =
  'uniform-fractional-arclength-per-registration/1' as const;
export const DXF_EXACT_NATIVE_SEAM_GRID_LIMITS_V1 = Object.freeze({
  maximumGridPoints: 32768,
  maximumSamplesPerEdge: PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumSamplesPerEdge,
  maximumNodes: 1_000_000,
  maximumProperties: 4_000_000,
  maximumArrayLength: 32768,
  maximumDepth: 40,
  maximumStringLength: 4096,
  maximumTextBytes: 64 * 1024 * 1024,
});

export type DxfExactNativeSeamGridRequestV1 = Readonly<{
  schemaVersion: typeof DXF_EXACT_NATIVE_SEAM_GRID_V1;
  seamId: string;
  mapping: 'equal';
  lengthRatio: 1;
  exactToleranceMm: number;
  targetEdgeMm: number;
  minSegmentMm: number;
  /** Both are replayed through the fixed resolver; structural witnesses are not accepted. */
  sides: readonly [DxfExactNativeSeamSpanRequestV1, DxfExactNativeSeamSpanRequestV1];
}>;

export type DxfExactNativeSeamGridSampleV1 = Readonly<{
  gridIndex: number;
  normalizedProgress: number;
  kind: 'native-corner' | 'edge-interior';
  /** Original provenance is retained at corners, independent of directed seam traversal. */
  nativeCorner: DxfExactNativeSeamSpanWitnessV1['corners'][number] | null;
  edgeOrdinal: number;
  edgeId: string;
  sourceCurveId: string;
  directedBoundaryVertexIds: readonly [string, string];
  edgeProgress: number;
  sourceCurveT: number;
  positionMm: readonly [number, number];
}>;

const CLAIMS = Object.freeze({
  contentConsistencyOnly: true,
  spanResolverReplayed: true,
  allNativeCornersPreserved: true,
  exactNumericDeduplicationOnly: true,
  nativeVertexIdsMinted: false,
  coordinateIdentityInferenceUsed: false,
  sourceAuthorityMinted: false,
  runtimeAuthority: false,
  compilerAdmission: false,
  float32GeometryQualified: false,
} as const);

export type DxfExactNativeSeamGridWitnessV1 = Readonly<{
  schemaVersion: typeof DXF_EXACT_NATIVE_SEAM_GRID_V1;
  seamId: string;
  mapping: 'equal';
  lengthRatio: 1;
  exactToleranceMm: number;
  targetEdgeMm: number;
  minSegmentMm: number;
  /** Zero when each mandatory native-corner interval is subdivided independently. */
  uniformSubdivisionCount: number;
  normalizedProgress: readonly number[];
  sides: readonly [
    Readonly<{
      span: DxfExactNativeSeamSpanWitnessV1;
      samples: readonly DxfExactNativeSeamGridSampleV1[];
    }>,
    Readonly<{
      span: DxfExactNativeSeamSpanWitnessV1;
      samples: readonly DxfExactNativeSeamGridSampleV1[];
    }>,
  ];
  canonicalSha256: string;
  claims: typeof CLAIMS;
}>;

export type DxfExactNativeSeamGridResultV1 =
  | Readonly<{ ok: true; witness: DxfExactNativeSeamGridWitnessV1; blockers: readonly [] }>
  | Readonly<{
      ok: false;
      witness: null;
      blockers: readonly [Readonly<{ code: string; detail: string }>];
    }>;

type SeamPair<T> = readonly [T, T];

export type DxfExactNativeEasedSeamGridRequestV1 = Readonly<{
  schemaVersion: typeof DXF_EXACT_NATIVE_EASED_SEAM_GRID_V1;
  seamId: string;
  mapping: 'eased';
  /** The authored canonical B/A, verified by the fixed span resolver. */
  lengthRatio: number;
  feedPolicy: typeof DXF_EXACT_NATIVE_EASED_SEAM_FEED_V1;
  /** Paired original corner IDs in directed order, including both terminal pairs. */
  registrations: readonly (readonly [sideACornerId: string, sideBCornerId: string])[];
  minSegmentMm: number;
  maxSegmentMm: number;
  sides: SeamPair<DxfExactNativeSeamSpanRequestV1>;
}>;

export type DxfExactNativeEasedSeamGridSampleV1 = DxfExactNativeSeamGridSampleV1 &
  Readonly<{ materialArcLengthMm: number }>;

export type DxfExactNativeEasedSeamGridWitnessV1 = Readonly<{
  schemaVersion: typeof DXF_EXACT_NATIVE_EASED_SEAM_GRID_V1;
  seamId: string;
  mapping: 'eased';
  lengthRatio: number;
  feedPolicy: typeof DXF_EXACT_NATIVE_EASED_SEAM_FEED_V1;
  registrations: DxfExactNativeEasedSeamGridRequestV1['registrations'];
  registrationGridIndices: readonly number[];
  minSegmentMm: number;
  maxSegmentMm: number;
  /** A shared position within each registration interval. An interior registration occurs once,
   * as the end of its preceding interval. Side sample progress remains directed material progress. */
  stitchGrid: readonly Readonly<{ registrationIntervalIndex: number; intervalProgress: number }>[];
  sides: SeamPair<
    Readonly<{
      span: DxfExactNativeSeamSpanWitnessV1;
      samples: readonly DxfExactNativeEasedSeamGridSampleV1[];
    }>
  >;
  canonicalSha256: string;
  claims: typeof CLAIMS;
}>;

export type DxfExactNativeEasedSeamGridResultV1 =
  | Readonly<{ ok: true; witness: DxfExactNativeEasedSeamGridWitnessV1; blockers: readonly [] }>
  | Extract<DxfExactNativeSeamGridResultV1, { ok: false }>;

type CrossRowSeamSourceV1 = Readonly<{
  patternLineKey: string;
  sourceFileId: string;
  sourceSha256: string;
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
}>;

export type DxfExactNativeCrossRowSeamGridRequestV1 = Readonly<
  Omit<DxfExactNativeEasedSeamGridRequestV1, 'schemaVersion' | 'mapping' | 'lengthRatio'> & {
    schemaVersion: typeof DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1;
    rows: SeamPair<CrossRowSeamSourceV1>;
    sourceDecisionSha256: string;
  }
>;

export type DxfExactNativeCrossRowSeamGridWitnessV1 = Readonly<
  Omit<DxfExactNativeEasedSeamGridWitnessV1, 'schemaVersion' | 'mapping' | 'lengthRatio'> & {
    schemaVersion: typeof DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1;
    rows: SeamPair<CrossRowSeamSourceV1>;
    sourceDecisionSha256: string;
    measuredLengthRatio: number;
  }
>;

export type DxfExactNativeCrossRowSeamGridResultV1 =
  | Readonly<{ ok: true; witness: DxfExactNativeCrossRowSeamGridWitnessV1; blockers: readonly [] }>
  | Extract<DxfExactNativeSeamGridResultV1, { ok: false }>;

class GridFailure extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: string, detail: string): never {
  throw new GridFailure(code, detail);
}
const limits = DXF_EXACT_NATIVE_SEAM_GRID_LIMITS_V1;
const encoder = new TextEncoder();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
function check(signal?: AbortSignal) {
  if (signal !== undefined && aborted.call(signal)) fail('cancelled', 'Grid generation cancelled.');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]))
      .join(',') +
    '}'
  );
}
function capture(input: unknown): unknown {
  let nodes = 0,
    properties = 0,
    textBytes = 0;
  const active = new Set<object>();
  const copy = (value: unknown, depth: number): unknown => {
    if (++nodes > limits.maximumNodes || depth > limits.maximumDepth)
      fail('bounds', 'Input graph exceeds bounds.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0))
        fail('invalid-input', 'Numbers must be finite canonical values.');
      return value;
    }
    if (typeof value === 'string') {
      textBytes += encoder.encode(value).byteLength;
      if (value.length > limits.maximumStringLength || textBytes > limits.maximumTextBytes)
        fail('bounds', 'Input text exceeds bounds.');
      return value;
    }
    if (!value || typeof value !== 'object' || active.has(value))
      fail('invalid-input', 'Input must be acyclic plain content.');
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype))
      fail('invalid-input', 'Unexpected input prototype.');
    const ds = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(ds);
    properties += keys.length;
    if (properties > limits.maximumProperties) fail('bounds', 'Input properties exceed bounds.');
    if (
      array &&
      (!Number.isSafeInteger(ds.length?.value) ||
        ds.length.value > limits.maximumArrayLength ||
        keys.length !== ds.length.value + 1)
    )
      fail('bounds', 'Arrays must be bounded and dense.');
    active.add(value);
    const output: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        (array &&
          (!/^(0|[1-9][0-9]*)$/.test(key) ||
            !Number.isSafeInteger(Number(key)) ||
            Number(key) >= ds.length.value))
      )
        fail('invalid-input', 'Unexpected input field.');
      const d = ds[key];
      if (!d.enumerable || !Object.hasOwn(d, 'value'))
        fail('invalid-input', 'Accessors and hidden fields are unsupported.');
      (output as Record<string, unknown>)[key] = copy(d.value, depth + 1);
    }
    active.delete(value);
    return output;
  };
  return copy(input, 0);
}

function samples(
  span: DxfExactNativeSeamSpanWitnessV1,
  grid: readonly number[],
  minimum: number,
  target: number,
): readonly DxfExactNativeSeamGridSampleV1[] {
  let edgeOrdinal = 0;
  const cornerByProgress = new Map(span.corners.map((c, i) => [c.normalizedProgress, i]));
  const perEdge = new Map<number, number>();
  const nativeProgressByEdge = new Map<number, number>();
  const output = grid.map((progress, gridIndex): DxfExactNativeSeamGridSampleV1 => {
    while (
      edgeOrdinal + 1 < span.edges.length &&
      progress >= span.corners[edgeOrdinal + 1].normalizedProgress
    )
      edgeOrdinal++;
    const edge = span.edges[edgeOrdinal];
    const a = span.corners[edgeOrdinal],
      b = span.corners[edgeOrdinal + 1];
    const cornerIndex = cornerByProgress.get(progress);
    const corner = cornerIndex === undefined ? null : span.corners[cornerIndex];
    const u =
      progress === a.normalizedProgress
        ? 0
        : progress === b.normalizedProgress
          ? 1
          : (progress - a.normalizedProgress) / (b.normalizedProgress - a.normalizedProgress);
    if (!Number.isFinite(u) || u < 0 || u > 1 || (!corner && !(u > 0 && u < 1)))
      fail(
        'unrepresentable-progress',
        'A grid point does not have one exact directed edge interval.',
      );
    if (gridIndex + 1 < grid.length) {
      const count = (perEdge.get(edgeOrdinal) ?? 0) + 1;
      perEdge.set(edgeOrdinal, count);
      if (count > limits.maximumSamplesPerEdge)
        fail('bounds', 'A native edge exceeds the segment bound.');
    }
    const position = corner
      ? corner.vertex.positionMm
      : ([
          a.vertex.positionMm[0] + (b.vertex.positionMm[0] - a.vertex.positionMm[0]) * u,
          a.vertex.positionMm[1] + (b.vertex.positionMm[1] - a.vertex.positionMm[1]) * u,
        ] as const);
    const [startT, endT] = edge.directedSourceCurveTRange;
    const sourceCurveT = u === 0 ? startT : u === 1 ? endT : startT + (endT - startT) * u;
    if (!Number.isFinite(sourceCurveT) || position.some((v) => !Number.isFinite(v)))
      fail('unrepresentable-progress', 'Sample position or native parameter is not finite.');
    const nativeProgress = (sourceCurveT - startT) / (endT - startT);
    const previousProgress = nativeProgressByEdge.get(edgeOrdinal);
    if (
      !Number.isFinite(nativeProgress) ||
      (!corner && !(nativeProgress > 0 && nativeProgress < 1)) ||
      (previousProgress !== undefined && !(nativeProgress > previousProgress))
    )
      fail(
        'unrepresentable-progress',
        'Distinct samples must retain strictly increasing directed native parameter progress.',
      );
    nativeProgressByEdge.set(edgeOrdinal, nativeProgress);
    return {
      gridIndex,
      normalizedProgress: progress,
      kind: corner ? 'native-corner' : 'edge-interior',
      nativeCorner: corner,
      edgeOrdinal,
      edgeId: edge.occurrence.edgeId,
      sourceCurveId: edge.occurrence.native.sourceCurveId,
      directedBoundaryVertexIds: edge.directedBoundaryVertexIds,
      edgeProgress: u,
      sourceCurveT,
      positionMm: position,
    };
  });
  for (let i = 1; i < output.length; i++) {
    const a = output[i - 1].positionMm,
      b = output[i].positionMm;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!Number.isFinite(length) || length < minimum)
      fail(
        'minimum-segment',
        'Distinct grid progress produces a collapsed or too short segment; native corners were not merged.',
      );
    if (length > target)
      fail('target-edge', 'Represented subdivision exceeds the requested target edge length.');
  }
  if (output.filter((s) => s.nativeCorner !== null).length !== span.corners.length)
    fail('corner-coverage', 'Every original native corner must appear exactly once.');
  return output;
}

let capturing = false;
function captureGrid(input: unknown): unknown {
  if (capturing) fail('reentrant-call', 'Reentrant grid capture refused.');
  capturing = true;
  try {
    return capture(input);
  } finally {
    capturing = false;
  }
}

async function resolveIndependentSeamSpans(
  sides: SeamPair<DxfExactNativeSeamSpanRequestV1>,
  signal?: AbortSignal,
): Promise<SeamPair<DxfExactNativeSeamSpanWitnessV1>> {
  const spans: DxfExactNativeSeamSpanWitnessV1[] = [];
  for (const side of sides) {
    const result = await resolveDxfExactNativeSeamSpanV1(side, signal);
    check(signal);
    if (!result.ok)
      fail('span-replay-blocked', result.blockers[0].code + ': ' + result.blockers[0].detail);
    spans.push(result.witness);
  }
  return [spans[0], spans[1]];
}

async function resolveSeamSpans(
  sides: SeamPair<DxfExactNativeSeamSpanRequestV1>,
  signal?: AbortSignal,
): Promise<SeamPair<DxfExactNativeSeamSpanWitnessV1>> {
  const spans = await resolveIndependentSeamSpans(sides, signal);
  if (
    spans[0].pieceId === spans[1].pieceId ||
    canonical(spans[0].source) !== canonical(spans[1].source)
  )
    fail('source-mismatch', 'Two distinct pieces in the same sealed source are required.');
  return spans;
}

function requireSeamBinding(
  request: Pick<
    DxfExactNativeSeamGridRequestV1 | DxfExactNativeEasedSeamGridRequestV1,
    'sides' | 'seamId' | 'mapping' | 'lengthRatio'
  >,
) {
  for (let i = 0; i < 2; i++) {
    const sideRequest = request.sides[i];
    const seam = sideRequest.handoff.seams.find((s) => s.id === request.seamId);
    if (
      !seam ||
      seam.mapping !== request.mapping ||
      seam.lengthRatio !== request.lengthRatio ||
      canonical(seam.sides[i]) !== canonical(sideRequest.side)
    )
      fail('seam-binding', 'Span side differs from the declared exact seam identity and order.');
  }
}

async function sealGrid<T extends { schemaVersion: string }>(content: T, signal?: AbortSignal) {
  const bytes = encoder.encode(content.schemaVersion + '\0' + canonical(content));
  if (bytes.length > limits.maximumTextBytes)
    fail('bounds', 'Grid canonical content exceeds its bound.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  check(signal);
  if (digest.length !== 32) fail('sha256-unavailable', 'Grid SHA-256 unavailable.');
  const canonicalSha256 = Array.from(digest, (v) => v.toString(16).padStart(2, '0')).join('');
  return freeze({
    ok: true as const,
    witness: { ...content, canonicalSha256 },
    blockers: [] as const,
  });
}

function blockedGrid(error: unknown): Extract<DxfExactNativeSeamGridResultV1, { ok: false }> {
  const known = error instanceof GridFailure;
  return freeze({
    ok: false,
    witness: null,
    blockers: [
      {
        code: known ? error.code : 'invalid-input',
        detail: known ? error.message : 'Grid content validation failed closed.',
      },
    ],
  });
}

function subdivideCornerIntervals(
  stations: readonly number[],
  longestSpanMm: number,
  targetEdgeMm: number,
): number[] {
  const grid = [stations[0]];
  for (let i = 1; i < stations.length; i++) {
    const from = stations[i - 1];
    const to = stations[i];
    const divisions = Math.floor(((to - from) * longestSpanMm) / targetEdgeMm) + 1;
    if (grid.length + divisions > limits.maximumGridPoints)
      fail('bounds', 'Required native-corner interval subdivisions exceed the grid bound.');
    for (let j = 1; j < divisions; j++) grid.push(from + (to - from) * (j / divisions));
    grid.push(to);
  }
  return grid;
}

/** Pure replayable content witness. It does not mint source, durable, mesh, or runtime authority. */
export async function buildDxfExactNativeSeamGridV1(
  input: unknown,
  signal?: AbortSignal,
): Promise<DxfExactNativeSeamGridResultV1> {
  try {
    check(signal);
    const request = captureGrid(input) as DxfExactNativeSeamGridRequestV1;
    const keys = [
      'schemaVersion',
      'seamId',
      'mapping',
      'lengthRatio',
      'exactToleranceMm',
      'targetEdgeMm',
      'minSegmentMm',
      'sides',
    ];
    if (
      !request ||
      canonical(Object.keys(request).sort()) !== canonical(keys.sort()) ||
      request.schemaVersion !== DXF_EXACT_NATIVE_SEAM_GRID_V1 ||
      typeof request.seamId !== 'string' ||
      !request.seamId.length ||
      !Array.isArray(request.sides) ||
      request.sides.length !== 2
    )
      fail('invalid-input', 'Grid request fields differ.');
    if (
      request.mapping !== 'equal' ||
      request.lengthRatio !== 1 ||
      !Number.isFinite(request.exactToleranceMm) ||
      request.exactToleranceMm < 0 ||
      request.exactToleranceMm > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumExactSeamToleranceMm
    )
      fail('unsupported-seam', 'Only strict equal seams are supported.');
    if (
      !(request.targetEdgeMm > 0) ||
      request.targetEdgeMm > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumTargetEdgeMm ||
      !(request.minSegmentMm > 0) ||
      request.minSegmentMm > request.targetEdgeMm
    )
      fail('invalid-policy', 'Explicit positive target and minimum lengths are required.');
    const spans = await resolveSeamSpans(request.sides, signal);
    check(signal);
    requireSeamBinding(request);
    if (Math.abs(spans[0].lengthMm - spans[1].lengthMm) > request.exactToleranceMm)
      fail('unequal-seam-length', 'Span lengths exceed the existing strict equal-seam tolerance.');
    // An exact target multiple receives one additional division, leaving numeric headroom.
    const longestSpanMm = Math.max(spans[0].lengthMm, spans[1].lengthMm);
    const count = Math.floor(longestSpanMm / request.targetEdgeMm) + 1;
    if (!Number.isSafeInteger(count) || count < 1 || count + 1 > limits.maximumGridPoints)
      fail('bounds', 'Requested uniform grid exceeds its bound.');
    const required = new Set<number>();
    for (const span of spans)
      for (const corner of span.corners) required.add(corner.normalizedProgress);
    const progress = new Set(required);
    for (let i = 0; i <= count; i++) progress.add(i / count);
    if (progress.size > limits.maximumGridPoints)
      fail('bounds', 'Native corner union exceeds the grid bound.');
    const sampleSides = (grid: readonly number[]): DxfExactNativeSeamGridWitnessV1['sides'] =>
      spans.map((span) => ({
        span,
        samples: samples(span, grid, request.minSegmentMm, request.targetEdgeMm),
      })) as unknown as DxfExactNativeSeamGridWitnessV1['sides'];
    let grid = [...progress].sort((a, b) => a - b);
    let uniformSubdivisionCount = count;
    let sides: DxfExactNativeSeamGridWitnessV1['sides'];
    try {
      sides = sampleSides(grid);
    } catch (error) {
      if (!(error instanceof GridFailure) || error.code !== 'minimum-segment' || required.size < 3)
        throw error;
      // A disposable uniform sample can fall too close to an exact CAD corner.
      // Subdivide between mandatory corners and reapply both segment bounds on both sides.
      grid = subdivideCornerIntervals(
        [...required].sort((a, b) => a - b),
        longestSpanMm,
        request.targetEdgeMm,
      );
      sides = sampleSides(grid);
      uniformSubdivisionCount = 0;
    }
    const content = freeze({
      schemaVersion: DXF_EXACT_NATIVE_SEAM_GRID_V1,
      seamId: request.seamId,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      exactToleranceMm: request.exactToleranceMm,
      targetEdgeMm: request.targetEdgeMm,
      minSegmentMm: request.minSegmentMm,
      uniformSubdivisionCount,
      normalizedProgress: grid,
      sides,
      claims: CLAIMS,
    });
    return await sealGrid(content, signal);
  } catch (error) {
    return blockedGrid(error);
  }
}

function resolveRegistrations(
  registrations: DxfExactNativeEasedSeamGridRequestV1['registrations'],
  spans: SeamPair<DxfExactNativeSeamSpanWitnessV1>,
): readonly SeamPair<number>[] {
  const indices = [
    new Map(spans[0].corners.map((corner, i) => [corner.vertex.id, i])),
    new Map(spans[1].corners.map((corner, i) => [corner.vertex.id, i])),
  ];
  let previous: SeamPair<number> = [-1, -1];
  return registrations.map((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((id) => typeof id !== 'string'))
      fail('invalid-registration', 'Each registration requires two exact native corner IDs.');
    const a = indices[0].get(pair[0]),
      b = indices[1].get(pair[1]);
    if (a === undefined || b === undefined || a <= previous[0] || b <= previous[1])
      fail(
        'invalid-registration',
        'Registration IDs must strictly increase in both directed spans.',
      );
    if (
      (i === 0 && (a !== 0 || b !== 0)) ||
      (i === registrations.length - 1 &&
        (a !== spans[0].corners.length - 1 || b !== spans[1].corners.length - 1))
    )
      fail(
        'invalid-registration',
        'The first and last registration must pair the directed endpoints.',
      );
    previous = [a, b];
    return previous;
  });
}

const binary64 = new DataView(new ArrayBuffer(8));
const hiddenBit = 1n << 52n;
/** Exact units for a nonnegative finite binary64 length. Every unit is 2^-1074 mm. */
function materialUnits(lengthMm: number): bigint {
  binary64.setFloat64(0, lengthMm);
  const bits = binary64.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & (hiddenBit - 1n);
  return exponent === 0 ? fraction : (hiddenBit | fraction) << BigInt(exponent - 1);
}

type RequiredPoint = {
  numerator: bigint;
  denominator: bigint;
  intervalProgress: number;
  cornerIndices: [number | null, number | null];
};
function compareFractions(a: RequiredPoint, b: RequiredPoint): -1 | 0 | 1 {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

type MaterialArcSpan = Readonly<{ corners: readonly Readonly<{ cumulativeLengthMm: number }>[] }>;

type EasedIntervalSide = {
  span: MaterialArcSpan;
  firstCorner: number;
  lastCorner: number;
  startMm: number;
  lengthMm: number;
  startUnits: bigint;
  lengthUnits: bigint;
};
function requiredPoints(sides: SeamPair<EasedIntervalSide>): readonly RequiredPoint[] {
  const candidates: RequiredPoint[] = [];
  sides.forEach((side, i) => {
    for (let corner = side.firstCorner; corner <= side.lastCorner; corner++) {
      const arcMm = side.span.corners[corner].cumulativeLengthMm;
      candidates.push({
        numerator: materialUnits(arcMm) - side.startUnits,
        denominator: side.lengthUnits,
        intervalProgress: (arcMm - side.startMm) / side.lengthMm,
        cornerIndices: i === 0 ? [corner, null] : [null, corner],
      });
    }
  });
  candidates.sort(compareFractions);
  const union: RequiredPoint[] = [];
  for (const point of candidates) {
    const previous = union.at(-1);
    if (previous && compareFractions(previous, point) === 0) {
      previous.cornerIndices[0] ??= point.cornerIndices[0];
      previous.cornerIndices[1] ??= point.cornerIndices[1];
    } else {
      if (previous && !(point.intervalProgress > previous.intervalProgress))
        fail(
          'unrepresentable-progress',
          'Distinct native corner fractions cannot share a stitch point.',
        );
      union.push(point);
    }
  }
  return union;
}

type EasedPoint = {
  registrationIntervalIndex: number;
  intervalProgress: number;
  sides: SeamPair<{ materialArcLengthMm: number; cornerIndex: number | null }>;
};

/** Shared exact arc arithmetic for already replayed and registered material paths. */
export function buildRegisteredMaterialArcGridV1(
  spans: SeamPair<MaterialArcSpan>,
  registrations: readonly SeamPair<number>[],
  minSegmentMm: number,
  maxSegmentMm: number,
) {
  const minimum = materialUnits(minSegmentMm),
    maximum = materialUnits(maxSegmentMm);
  const points: EasedPoint[] = [];
  const registrationGridIndices = [0];
  for (let i = 0; i + 1 < registrations.length; i++) {
    const intervalSide = (index: 0 | 1): EasedIntervalSide => {
      const span = spans[index],
        firstCorner = registrations[i][index],
        lastCorner = registrations[i + 1][index],
        startMm = span.corners[firstCorner].cumulativeLengthMm,
        endMm = span.corners[lastCorner].cumulativeLengthMm,
        startUnits = materialUnits(startMm);
      return {
        span,
        firstCorner,
        lastCorner,
        startMm,
        lengthMm: endMm - startMm,
        startUnits,
        lengthUnits: materialUnits(endMm) - startUnits,
      };
    };
    const sides = [intervalSide(0), intervalSide(1)] as const;
    const required = requiredPoints(sides);
    const [shorter, longer] =
      sides[0].lengthUnits <= sides[1].lengthUnits
        ? [sides[0].lengthUnits, sides[1].lengthUnits]
        : [sides[1].lengthUnits, sides[0].lengthUnits];
    const add = (intervalProgress: number, cornerIndices: SeamPair<number | null>) => {
      const at = (index: 0 | 1) => {
        const side = sides[index],
          cornerIndex = cornerIndices[index];
        return {
          materialArcLengthMm:
            cornerIndex === null
              ? side.startMm + intervalProgress * side.lengthMm
              : side.span.corners[cornerIndex].cumulativeLengthMm,
          cornerIndex,
        };
      };
      const previous = points.at(-1);
      if (
        previous?.registrationIntervalIndex === i &&
        !(intervalProgress > previous.intervalProgress)
      )
        fail('unrepresentable-progress', 'Subdivisions must have distinct stitch progress.');
      points.push({ registrationIntervalIndex: i, intervalProgress, sides: [at(0), at(1)] });
    };
    if (i === 0) add(0, required[0].cornerIndices);
    for (let j = 1; j < required.length; j++) {
      const a = required[j - 1],
        b = required[j];
      const numerator = b.numerator * a.denominator - a.numerator * b.denominator;
      const denominator = b.denominator * a.denominator;
      const upper = denominator * maximum;
      // The same subdivision count must meet the upper bound on the longer feed and the lower
      // bound on the shorter feed. Use the exact represented lengths before projecting samples.
      const count = (numerator * longer + upper - 1n) / upper;
      if (numerator * shorter < denominator * minimum * count)
        fail('minimum-segment', 'The two material feeds cannot both meet the segment bounds.');
      if (count > BigInt(limits.maximumGridPoints - points.length))
        fail('bounds', 'Required subdivisions exceed the grid bound.');
      const subdivisions = Number(count);
      for (let k = 1; k < subdivisions; k++)
        add(a.intervalProgress + (b.intervalProgress - a.intervalProgress) * (k / subdivisions), [
          null,
          null,
        ]);
      add(b.intervalProgress, b.cornerIndices);
    }
    registrationGridIndices.push(points.length - 1);
  }
  return { points, registrationGridIndices };
}

function easedSide(
  span: DxfExactNativeSeamSpanWitnessV1,
  points: readonly EasedPoint[],
  side: 0 | 1,
  minSegmentMm: number,
  maxSegmentMm: number,
): DxfExactNativeEasedSeamGridWitnessV1['sides'][number] {
  const arcs = points.map((point) => point.sides[side]);
  const grid = arcs.map(({ cornerIndex, materialArcLengthMm }, i) => {
    if (i > 0 && !(materialArcLengthMm > arcs[i - 1].materialArcLengthMm))
      fail('unrepresentable-progress', 'Material arclength must strictly increase on each side.');
    return cornerIndex === null
      ? materialArcLengthMm / span.lengthMm
      : span.corners[cornerIndex].normalizedProgress;
  });
  const sideSamples = samples(span, grid, minSegmentMm, maxSegmentMm).map((sample, i) => {
    const { cornerIndex, materialArcLengthMm } = arcs[i];
    const corner = cornerIndex === null ? null : span.corners[cornerIndex];
    if (sample.nativeCorner !== corner)
      fail(
        'unrepresentable-progress',
        'Material projection changed an original native corner binding.',
      );
    return { ...sample, materialArcLengthMm };
  });
  return { span, samples: sideSamples };
}

type RegisteredGridPolicy = Pick<
  DxfExactNativeEasedSeamGridRequestV1,
  'feedPolicy' | 'minSegmentMm' | 'maxSegmentMm' | 'registrations'
>;

function requireRegisteredGridPolicy(request: RegisteredGridPolicy) {
  if (
    request.feedPolicy !== DXF_EXACT_NATIVE_EASED_SEAM_FEED_V1 ||
    !Number.isFinite(request.minSegmentMm) ||
    !Number.isFinite(request.maxSegmentMm) ||
    !(request.minSegmentMm > 0) ||
    request.minSegmentMm > request.maxSegmentMm ||
    request.maxSegmentMm > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumTargetEdgeMm
  )
    fail(
      'invalid-policy',
      'Explicit uniform interval feed and positive segment bounds are required.',
    );
  if (!Array.isArray(request.registrations) || request.registrations.length < 2)
    fail('invalid-registration', 'The directed terminal registration pairs are required.');
}

function registeredGridContent(
  spans: SeamPair<DxfExactNativeSeamSpanWitnessV1>,
  request: RegisteredGridPolicy,
) {
  const registrations = resolveRegistrations(request.registrations, spans);
  const { points, registrationGridIndices } = buildRegisteredMaterialArcGridV1(
    spans,
    registrations,
    request.minSegmentMm,
    request.maxSegmentMm,
  );
  return {
    feedPolicy: request.feedPolicy,
    registrations: request.registrations,
    registrationGridIndices,
    minSegmentMm: request.minSegmentMm,
    maxSegmentMm: request.maxSegmentMm,
    stitchGrid: points.map(({ registrationIntervalIndex, intervalProgress }) => ({
      registrationIntervalIndex,
      intervalProgress,
    })),
    sides: [
      easedSide(spans[0], points, 0, request.minSegmentMm, request.maxSegmentMm),
      easedSide(spans[1], points, 1, request.minSegmentMm, request.maxSegmentMm),
    ] as const,
    claims: CLAIMS,
  };
}

/** Replayable explicit registration and feed content using the sealed native spans. */
export async function buildDxfExactNativeEasedSeamGridV1(
  input: unknown,
  signal?: AbortSignal,
): Promise<DxfExactNativeEasedSeamGridResultV1> {
  try {
    check(signal);
    const request = captureGrid(input) as DxfExactNativeEasedSeamGridRequestV1;
    const keys = [
      'schemaVersion',
      'seamId',
      'mapping',
      'lengthRatio',
      'feedPolicy',
      'registrations',
      'minSegmentMm',
      'maxSegmentMm',
      'sides',
    ];
    if (
      !request ||
      canonical(Object.keys(request).sort()) !== canonical(keys.sort()) ||
      request.schemaVersion !== DXF_EXACT_NATIVE_EASED_SEAM_GRID_V1 ||
      typeof request.seamId !== 'string' ||
      !request.seamId.length ||
      !Array.isArray(request.sides) ||
      request.sides.length !== 2
    )
      fail('invalid-input', 'Eased grid request fields differ.');
    if (
      request.mapping !== 'eased' ||
      !(request.lengthRatio > 0) ||
      !Number.isFinite(request.lengthRatio)
    )
      fail('unsupported-seam', 'An authored eased seam with a positive canonical B/A is required.');
    requireRegisteredGridPolicy(request);
    const spans = await resolveSeamSpans(request.sides, signal);
    check(signal);
    requireSeamBinding(request);
    if (spans[1].lengthMm / spans[0].lengthMm !== request.lengthRatio)
      fail('length-ratio-mismatch', 'The authored B/A differs from the exact measured span ratio.');
    return await sealGrid(
      freeze({
        schemaVersion: DXF_EXACT_NATIVE_EASED_SEAM_GRID_V1,
        seamId: request.seamId,
        mapping: 'eased' as const,
        lengthRatio: request.lengthRatio,
        ...registeredGridContent(spans, request),
      }),
      signal,
    );
  } catch (error) {
    return blockedGrid(error);
  }
}

/** Replays both row seals independently and retains their IDs at every registered stitch pair. */
export async function buildDxfExactNativeCrossRowSeamGridV1(
  input: unknown,
  signal?: AbortSignal,
): Promise<DxfExactNativeCrossRowSeamGridResultV1> {
  try {
    check(signal);
    const request = captureGrid(input) as DxfExactNativeCrossRowSeamGridRequestV1;
    const keys = [
      'schemaVersion',
      'seamId',
      'rows',
      'sourceDecisionSha256',
      'feedPolicy',
      'registrations',
      'minSegmentMm',
      'maxSegmentMm',
      'sides',
    ];
    if (
      !request ||
      canonical(Object.keys(request).sort()) !== canonical(keys.sort()) ||
      request.schemaVersion !== DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1 ||
      typeof request.seamId !== 'string' ||
      !request.seamId.length ||
      typeof request.sourceDecisionSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(request.sourceDecisionSha256) ||
      !Array.isArray(request.sides) ||
      request.sides.length !== 2 ||
      !Array.isArray(request.rows) ||
      request.rows.length !== 2
    )
      fail('invalid-input', 'Both explicit seam rows and a source decision digest are required.');
    const fields = [
      'contourId',
      'patternLineKey',
      'pieceId',
      'pieceLineKey',
      'sourceFileId',
      'sourceSha256',
    ];
    for (const row of request.rows) {
      if (
        !row ||
        canonical(Object.keys(row).sort()) !== canonical(fields) ||
        !Object.values(row).every((value) => typeof value === 'string' && value.length > 0) ||
        !/^[a-f0-9]{64}$/.test(row.sourceSha256)
      )
        fail(
          'invalid-input',
          'Each seam row requires exact piece, contour, file and SHA identities.',
        );
    }
    if (
      request.rows[0].patternLineKey === request.rows[1].patternLineKey ||
      request.rows[0].sourceFileId === request.rows[1].sourceFileId ||
      request.rows[0].pieceId === request.rows[1].pieceId ||
      request.rows[0].pieceLineKey === request.rows[1].pieceLineKey
    )
      fail('source-mismatch', 'Expected two distinct source rows and cut pieces.');
    requireRegisteredGridPolicy(request);
    const spans = await resolveIndependentSeamSpans(request.sides, signal);
    check(signal);
    for (const [i, span] of spans.entries()) {
      const row = request.rows[i];
      if (
        span.source.sourceSha256 !== row.sourceSha256 ||
        span.source.sourceFileId !== row.sourceFileId ||
        span.pieceId !== row.pieceId ||
        span.contourId !== row.contourId
      )
        fail('source-mismatch', 'A directed span differs from its bound source row.');
    }
    return await sealGrid(
      freeze({
        schemaVersion: DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1,
        seamId: request.seamId,
        rows: request.rows,
        sourceDecisionSha256: request.sourceDecisionSha256,
        measuredLengthRatio: spans[1].lengthMm / spans[0].lengthMm,
        ...registeredGridContent(spans, request),
      }),
      signal,
    );
  } catch (error) {
    return blockedGrid(error);
  }
}
