import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
} from '../body/mesh-plane-section-perimeter-v1';

export const GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1 =
  'garment-body-section-compatibility-preflight/1' as const;

export const DEFAULT_GARMENT_BODY_SECTION_COMPATIBILITY_POLICY_V1 = Object.freeze({
  sectionCount: 9,
  minimumSectionCount: 9,
  maximumSectionCount: 33,
  requiredRadialClearanceM: 0.01,
  maximumCircumferentialStretchDelta: 0.01,
  comparisonToleranceM: 1e-6,
  boundaryInsetM: 0.0001,
} as const);

const MAXIMUM_BODY_VERTEX_COUNT = 250_000;
const MAXIMUM_BODY_TRIANGLE_COUNT = 250_000;
const MAXIMUM_GARMENT_VERTEX_COUNT = 50_000;
const MAXIMUM_GARMENT_TRIANGLE_COUNT = 100_000;
const MINIMUM_BOUNDARY_INSET_M = 0.000001;

const ArrayBufferCtor = ArrayBuffer;
const Float32ArrayCtor = Float32Array;
const Uint16ArrayCtor = Uint16Array;
const Uint32ArrayCtor = Uint32Array;
const reflectApply = Reflect.apply;
const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const getOwnPropertySymbols = Object.getOwnPropertySymbols;
const getPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const arrayIsArray = Array.isArray;
const arrayBufferIsView = ArrayBuffer.isView;
const float32ArrayPrototype = Float32ArrayCtor.prototype;
const uint16ArrayPrototype = Uint16ArrayCtor.prototype;
const uint32ArrayPrototype = Uint32ArrayCtor.prototype;
const typedArrayPrototype = getPrototypeOf(float32ArrayPrototype) as object;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const typedArraySet = float32ArrayPrototype.set;
const arrayBufferResizableGetter = Object.getOwnPropertyDescriptor(
  ArrayBufferCtor.prototype,
  'resizable',
)?.get;

if (!typedArrayBufferGetter || !typedArrayLengthGetter) {
  throw new Error('Typed-array intrinsic getters are unavailable.');
}

export type GarmentBodySectionCompatibilityVec3V1 = readonly [number, number, number];

export type GarmentBodySectionCompatibilityPolicyV1 = Readonly<{
  sectionCount: number;
  minimumSectionCount: number;
  maximumSectionCount: number;
  requiredRadialClearanceM: number;
  maximumCircumferentialStretchDelta: number;
  comparisonToleranceM: number;
  boundaryInsetM: number;
}>;

export type GarmentBodySectionCompatibilityInputV1 = Readonly<{
  schemaVersion: typeof GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1;
  bodyPositionsM: Float32Array;
  bodyTriangles: Uint16Array | Uint32Array;
  garmentPositionsM: Float32Array;
  garmentTriangles: Uint16Array | Uint32Array;
  verticalAxisOriginM: GarmentBodySectionCompatibilityVec3V1;
  garmentWaistYM: number;
  garmentHemYM: number;
  policy?: Partial<GarmentBodySectionCompatibilityPolicyV1>;
}>;

export type GarmentBodySectionCompatibilityFailureCodeV1 =
  | 'input-invalid'
  | 'body-section-failed'
  | 'garment-section-failed';

export type GarmentBodySectionCompatibilityEnvelopeV1 = Readonly<{
  minimumRadiusM: number;
  maximumRadiusM: number;
  minimumXM: number;
  maximumXM: number;
  minimumZM: number;
  maximumZM: number;
}>;

export type GarmentBodySectionCompatibilitySectionV1 = Readonly<{
  ordinal: number;
  normalizedHeightFromWaist: number;
  yM: number;
  body: Readonly<{
    perimeterM: number;
    centroidM: GarmentBodySectionCompatibilityVec3V1;
    pointCount: number;
    loopCount: number;
    verticalAxisEnclosed: true;
    envelope: GarmentBodySectionCompatibilityEnvelopeV1;
  }>;
  garment: Readonly<{
    perimeterM: number;
    centroidM: GarmentBodySectionCompatibilityVec3V1;
    pointCount: number;
    loopCount: number;
    verticalAxisEnclosed: true;
    envelope: GarmentBodySectionCompatibilityEnvelopeV1;
  }>;
  radialMarginM: number;
  requiredGarmentRadiusM: number;
  requiredRadialExpansionM: number;
  requiredCircumferentialStretchDelta: number;
  initialClearanceQualified: boolean;
  sizeCompatibleWithinStretchBudget: boolean;
}>;

const CLAIMS = Object.freeze({
  boundedUniformIntervalSampling: true as const,
  openBoundaryInsetApplied: true as const,
  boundedResourceCapsApplied: true as const,
  ownedInputSnapshotsUsed: true as const,
  sharedOrResizableBuffersRejected: true as const,
  proxyTrapFreedomClaimed: false as const,
  conservativeRadialEnvelopeCompared: true as const,
  perimeterAloneUsedForContainment: false as const,
  continuousEnvelopeProven: false as const,
  collisionClearanceClaimed: false as const,
  clothInitializationAdmitted: false as const,
  fitClaimEligible: false as const,
  runtimeAuthorityIssued: false as const,
  productionReady: false as const,
});

export type GarmentBodySectionCompatibilityResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1;
      status:
        | 'compatible-with-authored-clearance'
        | 'compatible-with-stretch-budget-only'
        | 'size-incompatible';
      policy: GarmentBodySectionCompatibilityPolicyV1;
      sections: readonly GarmentBodySectionCompatibilitySectionV1[];
      summary: Readonly<{
        minimumRadialMarginM: number;
        maximumRequiredRadialExpansionM: number;
        maximumRequiredCircumferentialStretchDelta: number;
        initialClearanceFailureCount: number;
        sizeCompatibilityFailureCount: number;
        initialClearanceQualified: boolean;
        sizeCompatibleWithinStretchBudget: boolean;
      }>;
      claims: typeof CLAIMS;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1;
      code: GarmentBodySectionCompatibilityFailureCodeV1;
      detail: string;
      failedSectionOrdinal: number | null;
      claims: typeof CLAIMS;
    }>;

function failure(
  code: GarmentBodySectionCompatibilityFailureCodeV1,
  detail: string,
  failedSectionOrdinal: number | null = null,
): GarmentBodySectionCompatibilityResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1,
    code,
    detail: detail.slice(0, 2_048),
    failedSectionOrdinal,
    claims: CLAIMS,
  });
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number') throw new TypeError(`${label} must be a number.`);
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function finiteNonNegative(value: unknown, label: string): number {
  const result = finite(value, label);
  if (result < 0) throw new RangeError(`${label} must be non-negative.`);
  return result;
}

function exactDataRecord(
  value: unknown,
  label: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`${label} must be an object with own data properties.`);
  }
  if (getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must not contain symbol properties.`);
  }
  const descriptors = getOwnPropertyDescriptors(value);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of objectKeys(descriptors)) {
    if (!allowed.has(key)) throw new TypeError(`${label}.${key} is not allowed.`);
    const descriptor = descriptors[key]!;
    if (!('value' in descriptor)) throw new TypeError(`${label}.${key} must be a data property.`);
  }
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of requiredKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) {
      throw new TypeError(`${label}.${key} is required as an own data property.`);
    }
    output[key] = descriptor.value;
  }
  for (const key of optionalKeys) {
    const descriptor = descriptors[key];
    if (descriptor && 'value' in descriptor) output[key] = descriptor.value;
  }
  return Object.freeze(output);
}

function finiteVec3(value: unknown, label: string): GarmentBodySectionCompatibilityVec3V1 {
  if (!arrayIsArray(value)) {
    throw new TypeError(`${label} must contain exactly three coordinates.`);
  }
  const snapshot = exactDataRecord(value, label, ['0', '1', '2', 'length']);
  if (snapshot.length !== 3)
    throw new TypeError(`${label} must contain exactly three coordinates.`);
  return Object.freeze([
    finite(snapshot[0], `${label}[0]`),
    finite(snapshot[1], `${label}[1]`),
    finite(snapshot[2], `${label}[2]`),
  ]) as GarmentBodySectionCompatibilityVec3V1;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return value;
}

function typedArrayBuffer(value: ArrayBufferView, label: string): ArrayBuffer {
  const buffer = reflectApply(typedArrayBufferGetter!, value, []) as ArrayBufferLike;
  if (!(buffer instanceof ArrayBufferCtor)) {
    throw new TypeError(`${label} must not be backed by SharedArrayBuffer.`);
  }
  if (
    arrayBufferResizableGetter &&
    (reflectApply(arrayBufferResizableGetter, buffer, []) as boolean)
  ) {
    throw new TypeError(`${label} must not be backed by a resizable ArrayBuffer.`);
  }
  return buffer;
}

function typedArrayLength(value: ArrayBufferView): number {
  return reflectApply(typedArrayLengthGetter!, value, []) as number;
}

function snapshotFloat32Array(
  value: unknown,
  label: string,
  maximumVertexCount: number,
): Float32Array {
  if (
    !arrayBufferIsView(value) ||
    getPrototypeOf(value) !== float32ArrayPrototype ||
    !(value instanceof Float32ArrayCtor)
  ) {
    throw new TypeError(`${label} must be an exact Float32Array.`);
  }
  typedArrayBuffer(value, label);
  const length = typedArrayLength(value);
  if (length === 0 || length % 3 !== 0) {
    throw new RangeError(`${label} must contain complete non-empty XYZ coordinates.`);
  }
  if (length / 3 > maximumVertexCount) {
    throw new RangeError(`${label} exceeds its bounded vertex cap.`);
  }
  const output = new Float32ArrayCtor(length);
  reflectApply(typedArraySet, output, [value]);
  for (let index = 0; index < output.length; index += 1) {
    if (!Number.isFinite(output[index]))
      throw new TypeError(`${label} contains a non-finite value.`);
  }
  return output;
}

function snapshotIndexArray(
  value: unknown,
  label: string,
  vertexCount: number,
  maximumTriangleCount: number,
): Uint16Array | Uint32Array {
  const exactUint16 =
    arrayBufferIsView(value) &&
    getPrototypeOf(value) === uint16ArrayPrototype &&
    value instanceof Uint16ArrayCtor;
  const exactUint32 =
    arrayBufferIsView(value) &&
    getPrototypeOf(value) === uint32ArrayPrototype &&
    value instanceof Uint32ArrayCtor;
  if (!exactUint16 && !exactUint32) {
    throw new TypeError(`${label} must be an exact Uint16Array or Uint32Array.`);
  }
  const source = value as Uint16Array | Uint32Array;
  typedArrayBuffer(source, label);
  const length = typedArrayLength(source);
  if (length === 0 || length % 3 !== 0) {
    throw new RangeError(`${label} must contain complete non-empty triangles.`);
  }
  if (length / 3 > maximumTriangleCount) {
    throw new RangeError(`${label} exceeds its bounded triangle cap.`);
  }
  const output = exactUint16 ? new Uint16ArrayCtor(length) : new Uint32ArrayCtor(length);
  reflectApply(typedArraySet, output, [source]);
  for (let index = 0; index < output.length; index += 1) {
    if (output[index]! >= vertexCount) {
      throw new RangeError(`${label} contains an out-of-range vertex index.`);
    }
  }
  return output;
}

function snapshotPolicy(partial: unknown): GarmentBodySectionCompatibilityPolicyV1 {
  const defaults = DEFAULT_GARMENT_BODY_SECTION_COMPATIBILITY_POLICY_V1;
  const values =
    partial === undefined
      ? Object.freeze(Object.create(null) as Record<string, unknown>)
      : exactDataRecord(
          partial,
          'policy',
          [],
          [
            'sectionCount',
            'minimumSectionCount',
            'maximumSectionCount',
            'requiredRadialClearanceM',
            'maximumCircumferentialStretchDelta',
            'comparisonToleranceM',
            'boundaryInsetM',
          ],
        );
  const minimumSectionCount = positiveSafeInteger(
    values.minimumSectionCount ?? defaults.minimumSectionCount,
    'policy.minimumSectionCount',
  );
  const maximumSectionCount = positiveSafeInteger(
    values.maximumSectionCount ?? defaults.maximumSectionCount,
    'policy.maximumSectionCount',
  );
  const sectionCount = positiveSafeInteger(
    values.sectionCount ?? defaults.sectionCount,
    'policy.sectionCount',
  );
  if (
    minimumSectionCount !== defaults.minimumSectionCount ||
    maximumSectionCount !== defaults.maximumSectionCount
  ) {
    throw new RangeError('The fixed section-count bounds may not be changed by the caller.');
  }
  if (sectionCount < minimumSectionCount || sectionCount > maximumSectionCount) {
    throw new RangeError('policy.sectionCount is outside the bounded section-count interval.');
  }
  const requiredRadialClearanceM = finiteNonNegative(
    values.requiredRadialClearanceM ?? defaults.requiredRadialClearanceM,
    'policy.requiredRadialClearanceM',
  );
  const maximumCircumferentialStretchDelta = finiteNonNegative(
    values.maximumCircumferentialStretchDelta ?? defaults.maximumCircumferentialStretchDelta,
    'policy.maximumCircumferentialStretchDelta',
  );
  const comparisonToleranceM = finiteNonNegative(
    values.comparisonToleranceM ?? defaults.comparisonToleranceM,
    'policy.comparisonToleranceM',
  );
  const boundaryInsetM = finiteNonNegative(
    values.boundaryInsetM ?? defaults.boundaryInsetM,
    'policy.boundaryInsetM',
  );
  if (requiredRadialClearanceM > 0.1) {
    throw new RangeError('policy.requiredRadialClearanceM may not exceed 0.1 m.');
  }
  if (maximumCircumferentialStretchDelta > 0.1) {
    throw new RangeError('policy.maximumCircumferentialStretchDelta may not exceed 0.1.');
  }
  if (comparisonToleranceM > 0.0001) {
    throw new RangeError('policy.comparisonToleranceM may not exceed 0.0001 m.');
  }
  if (boundaryInsetM < MINIMUM_BOUNDARY_INSET_M || boundaryInsetM > 0.01) {
    throw new RangeError(
      `policy.boundaryInsetM must be within [${MINIMUM_BOUNDARY_INSET_M}, 0.01] m.`,
    );
  }
  return Object.freeze({
    sectionCount,
    minimumSectionCount,
    maximumSectionCount,
    requiredRadialClearanceM,
    maximumCircumferentialStretchDelta,
    comparisonToleranceM,
    boundaryInsetM,
  });
}

type OwnedCompatibilityInputV1 = Readonly<{
  bodyPositionsM: Float32Array;
  bodyTriangles: Uint16Array | Uint32Array;
  garmentPositionsM: Float32Array;
  garmentTriangles: Uint16Array | Uint32Array;
  axis: GarmentBodySectionCompatibilityVec3V1;
  waistYM: number;
  hemYM: number;
  policy: GarmentBodySectionCompatibilityPolicyV1;
}>;

function snapshotInput(input: unknown): OwnedCompatibilityInputV1 {
  const values = exactDataRecord(
    input,
    'input',
    [
      'schemaVersion',
      'bodyPositionsM',
      'bodyTriangles',
      'garmentPositionsM',
      'garmentTriangles',
      'verticalAxisOriginM',
      'garmentWaistYM',
      'garmentHemYM',
    ],
    ['policy'],
  );
  if (values.schemaVersion !== GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1) {
    throw new TypeError('schemaVersion is not garment-body-section-compatibility-preflight/1.');
  }
  const policy = snapshotPolicy(values.policy);
  const axis = finiteVec3(values.verticalAxisOriginM, 'verticalAxisOriginM');
  const waistYM = finite(values.garmentWaistYM, 'garmentWaistYM');
  const hemYM = finite(values.garmentHemYM, 'garmentHemYM');
  if (!(waistYM > hemYM)) {
    throw new RangeError('garmentWaistYM must be strictly above garmentHemYM.');
  }
  if (policy.boundaryInsetM * 2 >= waistYM - hemYM) {
    throw new RangeError('policy.boundaryInsetM must leave a non-empty sampling interval.');
  }
  const bodyPositionsM = snapshotFloat32Array(
    values.bodyPositionsM,
    'bodyPositionsM',
    MAXIMUM_BODY_VERTEX_COUNT,
  );
  const bodyTriangles = snapshotIndexArray(
    values.bodyTriangles,
    'bodyTriangles',
    bodyPositionsM.length / 3,
    MAXIMUM_BODY_TRIANGLE_COUNT,
  );
  const garmentPositionsM = snapshotFloat32Array(
    values.garmentPositionsM,
    'garmentPositionsM',
    MAXIMUM_GARMENT_VERTEX_COUNT,
  );
  const garmentTriangles = snapshotIndexArray(
    values.garmentTriangles,
    'garmentTriangles',
    garmentPositionsM.length / 3,
    MAXIMUM_GARMENT_TRIANGLE_COUNT,
  );
  return Object.freeze({
    bodyPositionsM,
    bodyTriangles,
    garmentPositionsM,
    garmentTriangles,
    axis,
    waistYM,
    hemYM,
    policy,
  });
}

function envelope(
  loop: MeshPlaneSectionLoopV1,
  axis: GarmentBodySectionCompatibilityVec3V1,
): GarmentBodySectionCompatibilityEnvelopeV1 {
  let minimumRadiusM = Number.POSITIVE_INFINITY;
  let maximumRadiusM = 0;
  let minimumXM = Number.POSITIVE_INFINITY;
  let maximumXM = Number.NEGATIVE_INFINITY;
  let minimumZM = Number.POSITIVE_INFINITY;
  let maximumZM = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < loop.pointsM.length; index += 1) {
    const [x0, , z0] = loop.pointsM[index]!;
    const [x1, , z1] = loop.pointsM[(index + 1) % loop.pointsM.length]!;
    const x = x0 - axis[0];
    const z = z0 - axis[2];
    maximumRadiusM = Math.max(maximumRadiusM, Math.hypot(x, z));
    minimumXM = Math.min(minimumXM, x);
    maximumXM = Math.max(maximumXM, x);
    minimumZM = Math.min(minimumZM, z);
    maximumZM = Math.max(maximumZM, z);
    const dx = x1 - x0;
    const dz = z1 - z0;
    const lengthSquared = dx * dx + dz * dz;
    const projection =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((axis[0] - x0) * dx + (axis[2] - z0) * dz) / lengthSquared));
    minimumRadiusM = Math.min(
      minimumRadiusM,
      Math.hypot(x0 + projection * dx - axis[0], z0 + projection * dz - axis[2]),
    );
  }
  return Object.freeze({
    minimumRadiusM,
    maximumRadiusM,
    minimumXM,
    maximumXM,
    minimumZM,
    maximumZM,
  });
}

function enclosesVerticalAxis(
  loop: MeshPlaneSectionLoopV1,
  axis: GarmentBodySectionCompatibilityVec3V1,
): boolean {
  let inside = false;
  for (let index = 0, previous = loop.pointsM.length - 1; index < loop.pointsM.length; index += 1) {
    const [x, , z] = loop.pointsM[index]!;
    const [previousX, , previousZ] = loop.pointsM[previous]!;
    if (
      z > axis[2] !== previousZ > axis[2] &&
      axis[0] < ((previousX - x) * (axis[2] - z)) / (previousZ - z) + x
    ) {
      inside = !inside;
    }
    previous = index;
  }
  return inside;
}

function sectionLevels(
  waistYM: number,
  hemYM: number,
  count: number,
  boundaryInsetM: number,
): readonly number[] {
  const firstYM = waistYM - boundaryInsetM;
  const lastYM = hemYM + boundaryInsetM;
  return Object.freeze(
    Array.from({ length: count }, (_, ordinal) =>
      ordinal === count - 1 ? lastYM : firstYM + ((lastYM - firstYM) * ordinal) / (count - 1),
    ),
  );
}

export function evaluateGarmentBodySectionCompatibilityPreflightV1(
  input: GarmentBodySectionCompatibilityInputV1,
): GarmentBodySectionCompatibilityResultV1 {
  let owned: OwnedCompatibilityInputV1;
  try {
    owned = snapshotInput(input);
  } catch (reason: unknown) {
    return failure(
      'input-invalid',
      reason instanceof Error ? reason.message : 'Input validation failed.',
    );
  }

  const sections: GarmentBodySectionCompatibilitySectionV1[] = [];
  for (const [ordinal, yM] of sectionLevels(
    owned.waistYM,
    owned.hemYM,
    owned.policy.sectionCount,
    owned.policy.boundaryInsetM,
  ).entries()) {
    const seedM = [owned.axis[0], yM, owned.axis[2]] as const;
    const body = measureMeshPlaneSectionPerimetersV1({
      positionsM: owned.bodyPositionsM,
      triangleIndices: owned.bodyTriangles,
      planeOriginM: seedM,
      planeNormal: [0, 1, 0],
      selection: { kind: 'nearest-seed', seedM },
    });
    if (!body.ok || !body.selectedLoop) {
      return failure(
        'body-section-failed',
        body.ok
          ? 'Body section produced no selected torso loop.'
          : `${body.code}: ${body.errors.join(' ')}`,
        ordinal,
      );
    }
    const garment = measureMeshPlaneSectionPerimetersV1({
      positionsM: owned.garmentPositionsM,
      triangleIndices: owned.garmentTriangles,
      planeOriginM: seedM,
      planeNormal: [0, 1, 0],
      selection: { kind: 'nearest-seed', seedM },
    });
    if (!garment.ok || !garment.selectedLoop) {
      return failure(
        'garment-section-failed',
        garment.ok
          ? 'Garment section produced no selected loop.'
          : `${garment.code}: ${garment.errors.join(' ')}`,
        ordinal,
      );
    }

    const bodyEnvelope = envelope(body.selectedLoop, owned.axis);
    const garmentEnvelope = envelope(garment.selectedLoop, owned.axis);
    if (
      bodyEnvelope.minimumRadiusM <= owned.policy.comparisonToleranceM ||
      !enclosesVerticalAxis(body.selectedLoop, owned.axis)
    ) {
      return failure(
        'body-section-failed',
        'The selected body loop does not enclose the authenticated vertical axis.',
        ordinal,
      );
    }
    if (
      garmentEnvelope.minimumRadiusM <= owned.policy.comparisonToleranceM ||
      !enclosesVerticalAxis(garment.selectedLoop, owned.axis)
    ) {
      return failure(
        'garment-section-failed',
        'The selected garment loop does not enclose the authenticated vertical axis.',
        ordinal,
      );
    }

    const radialMarginM = garmentEnvelope.minimumRadiusM - bodyEnvelope.maximumRadiusM;
    const requiredGarmentRadiusM =
      bodyEnvelope.maximumRadiusM + owned.policy.requiredRadialClearanceM;
    const requiredRadialExpansionM = Math.max(
      0,
      requiredGarmentRadiusM - garmentEnvelope.minimumRadiusM,
    );
    const requiredCircumferentialStretchDelta =
      requiredRadialExpansionM / garmentEnvelope.minimumRadiusM;
    const initialClearanceQualified =
      radialMarginM + owned.policy.comparisonToleranceM >= owned.policy.requiredRadialClearanceM;
    const sizeCompatibleWithinStretchBudget =
      requiredCircumferentialStretchDelta <=
      owned.policy.maximumCircumferentialStretchDelta +
        owned.policy.comparisonToleranceM / garmentEnvelope.minimumRadiusM;
    sections.push(
      Object.freeze({
        ordinal,
        normalizedHeightFromWaist: (owned.waistYM - yM) / (owned.waistYM - owned.hemYM),
        yM,
        body: Object.freeze({
          perimeterM: body.selectedLoop.perimeterM,
          centroidM: body.selectedLoop.centroidM,
          pointCount: body.selectedLoop.pointsM.length,
          loopCount: body.loops.length,
          verticalAxisEnclosed: true,
          envelope: bodyEnvelope,
        }),
        garment: Object.freeze({
          perimeterM: garment.selectedLoop.perimeterM,
          centroidM: garment.selectedLoop.centroidM,
          pointCount: garment.selectedLoop.pointsM.length,
          loopCount: garment.loops.length,
          verticalAxisEnclosed: true,
          envelope: garmentEnvelope,
        }),
        radialMarginM,
        requiredGarmentRadiusM,
        requiredRadialExpansionM,
        requiredCircumferentialStretchDelta,
        initialClearanceQualified,
        sizeCompatibleWithinStretchBudget,
      }),
    );
  }

  const initialClearanceFailureCount = sections.filter(
    ({ initialClearanceQualified }) => !initialClearanceQualified,
  ).length;
  const sizeCompatibilityFailureCount = sections.filter(
    ({ sizeCompatibleWithinStretchBudget }) => !sizeCompatibleWithinStretchBudget,
  ).length;
  const initialClearanceQualified = initialClearanceFailureCount === 0;
  const sizeCompatibleWithinStretchBudget = sizeCompatibilityFailureCount === 0;
  return Object.freeze({
    ok: true as const,
    schemaVersion: GARMENT_BODY_SECTION_COMPATIBILITY_PREFLIGHT_V1,
    status: initialClearanceQualified
      ? ('compatible-with-authored-clearance' as const)
      : sizeCompatibleWithinStretchBudget
        ? ('compatible-with-stretch-budget-only' as const)
        : ('size-incompatible' as const),
    policy: owned.policy,
    sections: Object.freeze(sections),
    summary: Object.freeze({
      minimumRadialMarginM: Math.min(...sections.map(({ radialMarginM }) => radialMarginM)),
      maximumRequiredRadialExpansionM: Math.max(
        ...sections.map(({ requiredRadialExpansionM }) => requiredRadialExpansionM),
      ),
      maximumRequiredCircumferentialStretchDelta: Math.max(
        ...sections.map(
          ({ requiredCircumferentialStretchDelta }) => requiredCircumferentialStretchDelta,
        ),
      ),
      initialClearanceFailureCount,
      sizeCompatibilityFailureCount,
      initialClearanceQualified,
      sizeCompatibleWithinStretchBudget,
    }),
    claims: CLAIMS,
  });
}
