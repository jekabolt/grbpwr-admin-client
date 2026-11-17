import type {
  PatternImportDxfProductGarmentMeshComposerProjectionV2,
  PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1 =
  'pattern-import-dxf-product-saved-canonical-medium-placement-preflight-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_V1 =
  'pattern-import-dxf-product-saved-canonical-medium-placement-preflight/1' as const;

const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_VERTICES = 100_000;
const MAX_BOUNDARY_SAMPLES = 100_000;
const PARAMETER_RESIDUAL_MM = 0.01;
const PARAMETER_RESIDUAL_RAD = 0.000001;
const TWO_PI = Math.PI * 2;

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1 = Object.freeze({
  pieceIds: Object.freeze(['FRONT', 'BACK'] as const),
  vertexCount: 244,
  triangleCount: 240,
  seamCount: 2,
  seamPairCount: 34,
  waistSlantRadiusMm: 700,
  hemSlantRadiusMm: 900,
  sectorSpanRadPerPiece: 0.64,
  waistSourceCurveCountPerPiece: 40,
  hemSourceCurveCountPerPiece: 50,
  radialSourceCurveCountPerPiece: 2,
} as const);

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_CLAIMS_V1 =
  Object.freeze({
    detachedComposerSnapshotAndProjectionBound: true,
    canonicalMediumGeometryEvaluated: true,
    callerProjectionIsPlacementAuthority: false,
    liveComposerV2OwnerAvailable: false,
    composerV3RefinementIntegrated: false,
    actualBodyOwnerPresented: false,
    placementTransformGenerated: false,
    collisionEvaluated: false,
    initializationAdmitted: false,
    runtimeAuthority: false,
    productionAuthority: false,
  } as const);

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_DEFERRED_V1 =
  Object.freeze([
    'cloth-owned-live-composer-v2-owner-handoff-not-integrated',
    'composer-v3-refinement-not-integrated',
    'actual-body-owner-not-presented',
    'placement-transform-not-generated',
    'collision-and-self-intersection-not-evaluated',
    'runtime-owner-not-integrated',
    'production-qualification-not-run',
  ] as const);

export type PatternImportDxfProductSavedCanonicalMediumPlacementPreflightRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1;
  composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
}>;

export type PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_V1;
  status: 'canonical-medium-geometry-compatible' | 'canonical-medium-geometry-incompatible';
  origin: PatternImportDxfProductGarmentMeshComposerSnapshotV2['origin'];
  bindings: Readonly<{
    composerCanonicalSha256: string;
    phase2ArtifactSha256: string;
    sourceAssemblyFingerprint: string;
  }>;
  counts: Readonly<{
    vertexCount: number;
    triangleCount: number;
    pieceCount: number;
    seamCount: number;
    seamPairCount: number;
    boundarySampleCount: number;
  }>;
  pieces: readonly Readonly<{
    pieceId: string;
    waistSourceCurveCount: number;
    hemSourceCurveCount: number;
    radialSourceCurveCount: number;
    unclassifiedSourceCurveCount: number;
    angularSpanRad: number | null;
    maximumWaistRadiusResidualMm: number | null;
    maximumHemRadiusResidualMm: number | null;
    canonicalMediumGeometryCompatible: boolean;
  }>[];
  mismatchReasons: readonly string[];
  deferred: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_DEFERRED_V1;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_CLAIMS_V1;
}>;

export type PatternImportDxfProductSavedCanonicalMediumPlacementPreflightResultV1 =
  | Readonly<{
      ok: true;
      report: PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      report: null;
      blocker: Readonly<{
        code: 'invalid-input' | 'composer-binding-mismatch' | 'mesh-invalid';
        detail: string;
      }>;
    }>;

class PreflightFailure extends Error {
  constructor(
    readonly code: Extract<
      PatternImportDxfProductSavedCanonicalMediumPlacementPreflightResultV1,
      { ok: false }
    >['blocker']['code'],
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: PreflightFailure['code'], detail: string): never {
  throw new PreflightFailure(code, detail);
}

function requestParts(input: unknown): Readonly<{
  composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
}> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ArrayBuffer.isView(input)) {
    fail('invalid-input', 'Preflight request must be one exact plain object.');
  }
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    fail('invalid-input', 'Preflight request could not be inspected safely.');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('invalid-input', 'Preflight request must use a plain object prototype.');
  }
  const expected = ['composerSnapshot', 'projection', 'schemaVersion'];
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string' || !expected.includes(key))
  ) {
    fail('invalid-input', 'Preflight request has missing, hidden, symbol, or unexpected fields.');
  }
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('invalid-input', `Preflight request ${key} must be an enumerable data property.`);
    }
  }
  if (
    descriptors.schemaVersion!.value !==
    PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1
  ) {
    fail('invalid-input', 'Preflight request version is unsupported.');
  }
  return Object.freeze({
    composerSnapshot: descriptors.composerSnapshot!
      .value as PatternImportDxfProductGarmentMeshComposerSnapshotV2,
    projection: descriptors.projection!
      .value as PatternImportDxfProductGarmentMeshComposerProjectionV2,
  });
}

function exactTypedArray(
  value: unknown,
  prototype: object,
  maximumLength: number,
  path: string,
): asserts value is Float32Array | Uint32Array {
  if (!value || typeof value !== 'object') fail('mesh-invalid', `${path} must be a typed array.`);
  let actualPrototype: object | null;
  try {
    actualPrototype = Object.getPrototypeOf(value);
  } catch {
    fail('mesh-invalid', `${path} could not be inspected safely.`);
  }
  if (actualPrototype !== prototype) fail('mesh-invalid', `${path} has an unsupported prototype.`);
  const typed = value as Float32Array | Uint32Array;
  if (!(typed.buffer instanceof ArrayBuffer) || typed.length > maximumLength) {
    fail('mesh-invalid', `${path} must use bounded private ArrayBuffer storage.`);
  }
}

function normalizedAngle(value: number): number {
  const result = value % TWO_PI;
  return result < 0 ? result + TWO_PI : result;
}

function circularSpan(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.map(normalizedAngle).sort((left, right) => left - right);
  if (sorted.length === 1) return 0;
  let maximumGap = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    maximumGap = Math.max(maximumGap, sorted[index]! - sorted[index - 1]!);
  }
  maximumGap = Math.max(maximumGap, sorted[0]! + TWO_PI - sorted.at(-1)!);
  return TWO_PI - maximumGap;
}

function pieceDiagnostic(
  pieceId: string,
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2,
): PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1['pieces'][number] {
  const samples = projection.mesh.boundarySamples.filter((sample) => sample.pieceId === pieceId);
  const byCurve = new Map<string, typeof samples>();
  for (const sample of samples) {
    if (
      !Number.isSafeInteger(sample.vertexIndex) ||
      sample.vertexIndex < 0 ||
      sample.vertexIndex * 2 + 1 >= projection.mesh.restPositions2Mm.length ||
      typeof sample.sourceCurveId !== 'string' ||
      sample.sourceCurveId.length === 0
    ) {
      fail('mesh-invalid', `${pieceId} contains invalid boundary provenance.`);
    }
    const current = byCurve.get(sample.sourceCurveId) ?? [];
    current.push(sample);
    byCurve.set(sample.sourceCurveId, current);
  }
  let waistSourceCurveCount = 0;
  let hemSourceCurveCount = 0;
  let radialSourceCurveCount = 0;
  let unclassifiedSourceCurveCount = 0;
  let maximumWaistRadiusResidualMm = 0;
  let maximumHemRadiusResidualMm = 0;
  const allAngles: number[] = [];
  for (const curveSamples of byCurve.values()) {
    const radii: number[] = [];
    const angles: number[] = [];
    for (const sample of curveSamples) {
      const x = projection.mesh.restPositions2Mm[sample.vertexIndex * 2]!;
      const y = projection.mesh.restPositions2Mm[sample.vertexIndex * 2 + 1]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        fail('mesh-invalid', `${pieceId} contains a non-finite rest position.`);
      }
      radii.push(Math.hypot(x, y));
      angles.push(Math.atan2(y, x));
      allAngles.push(Math.atan2(y, x));
    }
    const waistResidual = Math.max(
      ...radii.map((radius) =>
        Math.abs(
          radius - PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1.waistSlantRadiusMm,
        ),
      ),
    );
    const hemResidual = Math.max(
      ...radii.map((radius) =>
        Math.abs(
          radius - PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1.hemSlantRadiusMm,
        ),
      ),
    );
    if (waistResidual <= PARAMETER_RESIDUAL_MM) {
      waistSourceCurveCount += 1;
      maximumWaistRadiusResidualMm = Math.max(maximumWaistRadiusResidualMm, waistResidual);
    } else if (hemResidual <= PARAMETER_RESIDUAL_MM) {
      hemSourceCurveCount += 1;
      maximumHemRadiusResidualMm = Math.max(maximumHemRadiusResidualMm, hemResidual);
    } else if ((circularSpan(angles) ?? Infinity) <= PARAMETER_RESIDUAL_RAD * 4) {
      radialSourceCurveCount += 1;
    } else {
      unclassifiedSourceCurveCount += 1;
    }
  }
  const angularSpanRad = circularSpan(allAngles);
  const target = PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1;
  const canonicalMediumGeometryCompatible =
    waistSourceCurveCount === target.waistSourceCurveCountPerPiece &&
    hemSourceCurveCount === target.hemSourceCurveCountPerPiece &&
    radialSourceCurveCount === target.radialSourceCurveCountPerPiece &&
    unclassifiedSourceCurveCount === 0 &&
    angularSpanRad !== null &&
    Math.abs(angularSpanRad - target.sectorSpanRadPerPiece) <= PARAMETER_RESIDUAL_RAD * 8;
  return Object.freeze({
    pieceId,
    waistSourceCurveCount,
    hemSourceCurveCount,
    radialSourceCurveCount,
    unclassifiedSourceCurveCount,
    angularSpanRad,
    maximumWaistRadiusResidualMm: waistSourceCurveCount === 0 ? null : maximumWaistRadiusResidualMm,
    maximumHemRadiusResidualMm: hemSourceCurveCount === 0 ? null : maximumHemRadiusResidualMm,
    canonicalMediumGeometryCompatible,
  });
}

export function evaluatePatternImportDxfProductSavedCanonicalMediumPlacementPreflightV1(
  input: unknown,
): PatternImportDxfProductSavedCanonicalMediumPlacementPreflightResultV1 {
  try {
    const { composerSnapshot, projection } = requestParts(input);
    if (!composerSnapshot || typeof composerSnapshot !== 'object') {
      fail('invalid-input', 'A Composer V2 snapshot is required.');
    }
    if (!projection || typeof projection !== 'object') {
      fail('invalid-input', 'A detached Composer V2 projection is required.');
    }
    if (
      !SHA256.test(composerSnapshot.seal.canonicalSha256) ||
      !SHA256.test(composerSnapshot.seals.phase2ArtifactSha256) ||
      composerSnapshot.seal.canonicalSha256 !== projection.composerCanonicalSha256 ||
      composerSnapshot.seals.phase2ArtifactSha256 !== projection.phase2ArtifactSha256
    ) {
      fail('composer-binding-mismatch', 'Composer snapshot and detached projection seals differ.');
    }
    if (
      projection.placementAuthority !== false ||
      projection.runtimeAuthority !== false ||
      projection.productionAuthority !== false
    ) {
      fail('composer-binding-mismatch', 'Detached projection crossed an authority boundary.');
    }
    exactTypedArray(
      projection.mesh.restPositions2Mm,
      Float32Array.prototype,
      MAX_VERTICES * 2,
      'projection.mesh.restPositions2Mm',
    );
    exactTypedArray(
      projection.mesh.triangles,
      Uint32Array.prototype,
      MAX_VERTICES * 6,
      'projection.mesh.triangles',
    );
    if (
      !Array.isArray(projection.mesh.pieceRanges) ||
      !Array.isArray(projection.mesh.boundarySamples) ||
      !Array.isArray(projection.mesh.seams) ||
      projection.mesh.boundarySamples.length > MAX_BOUNDARY_SAMPLES
    ) {
      fail('mesh-invalid', 'Projection mesh collections are invalid or exceed bounds.');
    }
    for (const [index, seam] of projection.mesh.seams.entries()) {
      exactTypedArray(
        seam.vertexPairs,
        Uint32Array.prototype,
        MAX_BOUNDARY_SAMPLES * 2,
        `projection.mesh.seams[${index}].vertexPairs`,
      );
    }
    const vertexCount = projection.mesh.restPositions2Mm.length / 2;
    const triangleCount = projection.mesh.triangles.length / 3;
    const seamPairCount = projection.mesh.seams.reduce(
      (total, seam) => total + seam.vertexPairs.length / 2,
      0,
    );
    if (
      !Number.isSafeInteger(vertexCount) ||
      !Number.isSafeInteger(triangleCount) ||
      projection.mesh.triangles.some((index) => index >= vertexCount) ||
      composerSnapshot.mesh.vertexCount !== vertexCount ||
      composerSnapshot.mesh.triangleCount !== triangleCount ||
      composerSnapshot.mesh.pieceCount !== projection.mesh.pieceRanges.length ||
      composerSnapshot.mesh.seamCount !== projection.mesh.seams.length ||
      composerSnapshot.mesh.distributedSeamPairCount !== seamPairCount
    ) {
      fail('mesh-invalid', 'Composer counts and detached mesh bytes differ.');
    }
    const target = PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1;
    const pieceIds = projection.mesh.pieceRanges.map(({ pieceId }) => pieceId);
    const pieces = Object.freeze(pieceIds.map((pieceId) => pieceDiagnostic(pieceId, projection)));
    const mismatchReasons: string[] = [];
    if (
      pieceIds.length !== target.pieceIds.length ||
      target.pieceIds.some((pieceId) => !pieceIds.includes(pieceId))
    ) {
      mismatchReasons.push('piece-set-is-not-canonical-front-back');
    }
    if (vertexCount !== target.vertexCount || triangleCount !== target.triangleCount) {
      mismatchReasons.push('v2-mesh-counts-differ-from-canonical-medium-annular-fixture');
    }
    if (
      projection.mesh.seams.length !== target.seamCount ||
      seamPairCount !== target.seamPairCount
    ) {
      mismatchReasons.push('distributed-seam-counts-differ-from-canonical-medium-fixture');
    }
    for (const piece of pieces) {
      if (!piece.canonicalMediumGeometryCompatible) {
        mismatchReasons.push(`${piece.pieceId}-is-not-the-700-900mm-0.64rad-annular-sector`);
      }
    }
    const compatible = mismatchReasons.length === 0;
    const report = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_V1,
      status: compatible
        ? ('canonical-medium-geometry-compatible' as const)
        : ('canonical-medium-geometry-incompatible' as const),
      origin: composerSnapshot.origin,
      bindings: Object.freeze({
        composerCanonicalSha256: composerSnapshot.seal.canonicalSha256,
        phase2ArtifactSha256: composerSnapshot.seals.phase2ArtifactSha256,
        sourceAssemblyFingerprint: projection.mesh.sourceAssemblyFingerprint,
      }),
      counts: Object.freeze({
        vertexCount,
        triangleCount,
        pieceCount: projection.mesh.pieceRanges.length,
        seamCount: projection.mesh.seams.length,
        seamPairCount,
        boundarySampleCount: projection.mesh.boundarySamples.length,
      }),
      pieces,
      mismatchReasons: Object.freeze(mismatchReasons),
      deferred: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_DEFERRED_V1,
      claims: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_CLAIMS_V1,
    });
    return Object.freeze({ ok: true as const, report, blocker: null });
  } catch (error) {
    const failure =
      error instanceof PreflightFailure
        ? error
        : new PreflightFailure(
            'invalid-input',
            error instanceof Error ? error.message : 'Placement preflight failed closed.',
          );
    return Object.freeze({
      ok: false as const,
      report: null,
      blocker: Object.freeze({ code: failure.code, detail: failure.message }),
    });
  }
}
