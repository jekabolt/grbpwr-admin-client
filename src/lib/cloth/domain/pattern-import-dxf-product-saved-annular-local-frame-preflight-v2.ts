import type {
  PatternImportDxfProductGarmentMeshComposerProjectionV2,
  PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1,
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1,
  evaluatePatternImportDxfProductSavedCanonicalMediumPlacementPreflightV1,
} from './pattern-import-dxf-product-saved-canonical-medium-placement-preflight-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_WRITER_FRAME_RECEIPT_V2 =
  'pattern-import-dxf-product-saved-annular-writer-frame-receipt/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2 =
  'pattern-import-dxf-product-saved-annular-local-frame-preflight-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_V2 =
  'pattern-import-dxf-product-saved-annular-local-frame-preflight/2' as const;

const SHA256 = /^[0-9a-f]{64}$/u;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const MAX_ABS_COORDINATE_MM = 1_000_000;
const MAX_SOURCE_PATH_ID = 1_000_000;
const TWO_PI = Math.PI * 2;
const PARAMETER_RESIDUAL_MM = 0.01;
const PARAMETER_RESIDUAL_RAD = 0.000001;

export type PatternImportDxfProductSavedAnnularWriterFramePieceV2 = Readonly<{
  pieceId: string;
  blockName: string;
  sourceApexMm: readonly [number, number];
  /** Exact writer affine tuple [a,b,c,d,e,f], source frame to saved-DXF frame. */
  sourceToWrittenAffine: readonly [number, number, number, number, number, number];
  sourcePathIds: readonly [number, ...number[]];
}>;

/**
 * Receipt decoded from the durable manifest replay carrier and byte-bound by replaying the saved
 * draft. The aggregate seal then binds the same piece frames to exact source PathIds.
 */
export type PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_WRITER_FRAME_RECEIPT_V2;
  sourceFileSha256: string;
  writerExportSha256: string;
  aggregateCanonicalSha256: string;
  sourcePathCoordinateSha256: string;
  provenance: 'saved-replay-answer-byte-bound';
  pieces: readonly [
    PatternImportDxfProductSavedAnnularWriterFramePieceV2,
    PatternImportDxfProductSavedAnnularWriterFramePieceV2,
  ];
}>;

export type PatternImportDxfProductSavedAnnularLocalFramePreflightRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2;
  composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
}>;

export type PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_V2;
  status:
    | 'canonical-medium-local-geometry-compatible'
    | 'canonical-medium-local-geometry-incompatible';
  origin: PatternImportDxfProductGarmentMeshComposerSnapshotV2['origin'];
  counts: Readonly<{
    vertexCount: number;
    triangleCount: number;
    pieceCount: number;
    seamCount: number;
    seamPairCount: number;
  }>;
  pieces: readonly Readonly<{
    pieceId: string;
    blockName: string;
    writtenApexMm: readonly [number, number];
    waistSourceCurveCount: number;
    hemSourceCurveCount: number;
    radialSourceCurveCount: number;
    unclassifiedSourceCurveCount: number;
    angularSpanRad: number | null;
    maximumWaistRadiusResidualMm: number | null;
    maximumHemRadiusResidualMm: number | null;
    canonicalMediumLocalGeometryCompatible: boolean;
  }>[];
  mismatchReasons: readonly string[];
  integrationBlockers: readonly ['cloth-session-local-frame-preflight-v2-not-integrated'];
  minimalIntegrationDelta: Readonly<{
    producer: 'already-persisted-in-bounded-manifest-replay-carrier';
    binding: 'already-bound-to-row-DXF-SHA-and-aggregate-sourcePathIds';
    consumer: 'cloth-owned saved session must replace the global-origin V1 geometry test';
  }>;
  claims: Readonly<{
    composerBindingValidatedByV1: true;
    localCoordinatesUseWriterReceiptOnly: true;
    geometryExtremaInferenceUsed: false;
    writerReplayBytesBoundToSavedRow: true;
    writerFrameReceiptPersisted: true;
    sourcePathIdentityBoundByAggregateSeal: true;
    placementAdmissionEligible: false;
    placementAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
}>;

export type PatternImportDxfProductSavedAnnularLocalFramePreflightResultV2 =
  | Readonly<{
      ok: true;
      report: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      report: null;
      blocker: Readonly<{
        code: 'invalid-input' | 'composer-binding-mismatch' | 'writer-frame-binding-mismatch';
        detail: string;
      }>;
    }>;

class LocalFrameFailure extends Error {
  constructor(
    readonly code: Extract<
      PatternImportDxfProductSavedAnnularLocalFramePreflightResultV2,
      { ok: false }
    >['blocker']['code'],
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: LocalFrameFailure['code'], detail: string): never {
  throw new LocalFrameFailure(code, detail);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value)) {
    fail('invalid-input', `${path} must be one plain object.`);
  }
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${path} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('invalid-input', `${path} must use a plain object prototype.`);
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  ) {
    fail('invalid-input', `${path} has missing, symbol, or unexpected fields.`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('invalid-input', `${path}.${key} must be one enumerable data property.`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function exactArray(value: unknown, maximumLength: number, path: string): unknown[] {
  let array: boolean;
  let descriptors: PropertyDescriptorMap;
  try {
    array = Array.isArray(value);
    descriptors = value && typeof value === 'object' ? Object.getOwnPropertyDescriptors(value) : {};
  } catch {
    fail('invalid-input', `${path} could not be inspected safely.`);
  }
  const lengthDescriptor = descriptors.length;
  if (
    !array ||
    !lengthDescriptor ||
    !('value' in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximumLength
  ) {
    fail('invalid-input', `${path} must be one bounded dense array.`);
  }
  const length = lengthDescriptor.value as number;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== length + 1 ||
    keys.some(
      (key) =>
        key !== 'length' &&
        (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length),
    )
  ) {
    fail('invalid-input', `${path} must not contain holes, symbols, accessors, or extra fields.`);
  }
  return Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('invalid-input', `${path}[${String(index)}] must be one enumerable data property.`);
    }
    return descriptor.value;
  });
}

function finite(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Object.is(value, -0) ||
    Math.abs(value) > MAX_ABS_COORDINATE_MM
  ) {
    fail('invalid-input', `${field} must be one bounded finite non-negative-zero number.`);
  }
  return value;
}

function exactTuple(value: unknown, length: number, path: string): number[] {
  const tuple = exactArray(value, length, path);
  if (tuple.length !== length) {
    fail('invalid-input', `${path} must contain exactly ${String(length)} numbers.`);
  }
  return tuple.map((entry, index) => finite(entry, `${path}[${String(index)}]`));
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

function exactRequest(
  input: unknown,
): PatternImportDxfProductSavedAnnularLocalFramePreflightRequestV2 {
  const request = exactRecord(
    input,
    ['schemaVersion', 'composerSnapshot', 'projection', 'writerFrameReceipt'],
    'Local-frame request',
  );
  if (
    request.schemaVersion !==
    PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2
  ) {
    fail('invalid-input', 'Local-frame request version is unsupported.');
  }
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
    composerSnapshot:
      request.composerSnapshot as PatternImportDxfProductGarmentMeshComposerSnapshotV2,
    projection: request.projection as PatternImportDxfProductGarmentMeshComposerProjectionV2,
    writerFrameReceipt:
      request.writerFrameReceipt as PatternImportDxfProductSavedAnnularWriterFrameReceiptV2,
  });
}

function exactReceipt(
  input: unknown,
  snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2,
): PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 {
  const record = exactRecord(
    input,
    [
      'schemaVersion',
      'sourceFileSha256',
      'writerExportSha256',
      'aggregateCanonicalSha256',
      'sourcePathCoordinateSha256',
      'provenance',
      'pieces',
    ],
    'writerFrameReceipt',
  );
  if (
    record.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_WRITER_FRAME_RECEIPT_V2 ||
    record.provenance !== 'saved-replay-answer-byte-bound' ||
    typeof record.sourceFileSha256 !== 'string' ||
    !SHA256.test(record.sourceFileSha256) ||
    typeof record.writerExportSha256 !== 'string' ||
    !SHA256.test(record.writerExportSha256) ||
    typeof record.aggregateCanonicalSha256 !== 'string' ||
    !SHA256.test(record.aggregateCanonicalSha256) ||
    typeof record.sourcePathCoordinateSha256 !== 'string' ||
    !SHA256.test(record.sourcePathCoordinateSha256)
  ) {
    fail('invalid-input', 'writerFrameReceipt shape is invalid or unbounded.');
  }
  const rawPieces = exactArray(record.pieces, 2, 'writerFrameReceipt.pieces');
  if (rawPieces.length !== 2) {
    fail('invalid-input', 'writerFrameReceipt.pieces must contain exactly two pieces.');
  }
  const pieces = rawPieces.map((value, index) => {
    const path = `writerFrameReceipt.pieces[${String(index)}]`;
    const piece = exactRecord(
      value,
      ['pieceId', 'blockName', 'sourceApexMm', 'sourceToWrittenAffine', 'sourcePathIds'],
      path,
    );
    if (
      typeof piece.pieceId !== 'string' ||
      !STABLE_ID.test(piece.pieceId) ||
      typeof piece.blockName !== 'string' ||
      !STABLE_ID.test(piece.blockName)
    ) {
      fail('invalid-input', `${path} piece and block identities must be bounded stable IDs.`);
    }
    const sourceApexMm = exactTuple(piece.sourceApexMm, 2, `${path}.sourceApexMm`);
    const sourceToWrittenAffine = exactTuple(
      piece.sourceToWrittenAffine,
      6,
      `${path}.sourceToWrittenAffine`,
    );
    const sourcePathIds = exactArray(piece.sourcePathIds, 4, `${path}.sourcePathIds`);
    if (
      sourcePathIds.length === 0 ||
      sourcePathIds.some(
        (pathId) =>
          !Number.isSafeInteger(pathId) ||
          (pathId as number) < 0 ||
          (pathId as number) > MAX_SOURCE_PATH_ID,
      ) ||
      new Set(sourcePathIds).size !== sourcePathIds.length
    ) {
      fail('invalid-input', `${path}.sourcePathIds must be one bounded set of path IDs.`);
    }
    const [a, b, c, d] = sourceToWrittenAffine;
    if (a !== 1 || b !== 0 || c !== 0 || d !== 1) {
      fail(
        'writer-frame-binding-mismatch',
        `${piece.pieceId} receipt must be the exact bounded translation emitted by the product writer.`,
      );
    }
    return Object.freeze({
      pieceId: piece.pieceId,
      blockName: piece.blockName,
      sourceApexMm: Object.freeze([sourceApexMm[0]!, sourceApexMm[1]!] as const),
      sourceToWrittenAffine: Object.freeze([
        sourceToWrittenAffine[0]!,
        sourceToWrittenAffine[1]!,
        sourceToWrittenAffine[2]!,
        sourceToWrittenAffine[3]!,
        sourceToWrittenAffine[4]!,
        sourceToWrittenAffine[5]!,
      ] as const),
      sourcePathIds: Object.freeze(sourcePathIds as [number, ...number[]]),
    });
  });
  const receipt = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_WRITER_FRAME_RECEIPT_V2,
    sourceFileSha256: record.sourceFileSha256,
    writerExportSha256: record.writerExportSha256,
    aggregateCanonicalSha256: record.aggregateCanonicalSha256,
    sourcePathCoordinateSha256: record.sourcePathCoordinateSha256,
    provenance: 'saved-replay-answer-byte-bound' as const,
    pieces: Object.freeze([pieces[0]!, pieces[1]!] as const),
  });
  if (
    receipt.sourceFileSha256 !== snapshot.seals.sourceFileSha256 ||
    receipt.writerExportSha256 !== snapshot.row.dxfSha256 ||
    receipt.sourceFileSha256 !== receipt.writerExportSha256 ||
    receipt.aggregateCanonicalSha256 !== snapshot.seals.aggregateCanonicalSha256
  ) {
    fail(
      'writer-frame-binding-mismatch',
      'Writer frame receipt does not bind the compiled saved-row DXF SHA-256.',
    );
  }
  const expectedPieces = new Set(snapshot.assembly.pieceIds);
  const seen = new Set<string>();
  for (const [index, piece] of receipt.pieces.entries()) {
    if (!expectedPieces.has(piece.pieceId) || seen.has(piece.pieceId)) {
      fail('invalid-input', `writerFrameReceipt.pieces[${String(index)}] is invalid.`);
    }
    seen.add(piece.pieceId);
  }
  if (seen.size !== expectedPieces.size) {
    fail(
      'writer-frame-binding-mismatch',
      'Writer frame receipt does not cover the exact piece set.',
    );
  }
  return receipt;
}

function localPieceDiagnostic(
  piece: PatternImportDxfProductSavedAnnularWriterFramePieceV2,
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2,
): PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2['pieces'][number] {
  const samples = projection.mesh.boundarySamples.filter(
    ({ pieceId }) => pieceId === piece.pieceId,
  );
  const grouped = new Map<string, typeof samples>();
  for (const sample of samples) {
    const current = grouped.get(sample.sourceCurveId) ?? [];
    current.push(sample);
    grouped.set(sample.sourceCurveId, current);
  }
  const [a, b, c, d, e, f] = piece.sourceToWrittenAffine;
  const writtenApexMm = [
    a * piece.sourceApexMm[0] + c * piece.sourceApexMm[1] + e,
    b * piece.sourceApexMm[0] + d * piece.sourceApexMm[1] + f,
  ] as const;
  let waistSourceCurveCount = 0;
  let hemSourceCurveCount = 0;
  let radialSourceCurveCount = 0;
  let unclassifiedSourceCurveCount = 0;
  let maximumWaistRadiusResidualMm = 0;
  let maximumHemRadiusResidualMm = 0;
  const allAngles: number[] = [];
  for (const curveSamples of grouped.values()) {
    const radii: number[] = [];
    const angles: number[] = [];
    for (const sample of curveSamples) {
      const x = projection.mesh.restPositions2Mm[sample.vertexIndex * 2]! - writtenApexMm[0];
      const y = projection.mesh.restPositions2Mm[sample.vertexIndex * 2 + 1]! - writtenApexMm[1];
      const angle = Math.atan2(y, x);
      radii.push(Math.hypot(x, y));
      angles.push(angle);
      allAngles.push(angle);
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
  const canonicalMediumLocalGeometryCompatible =
    waistSourceCurveCount === target.waistSourceCurveCountPerPiece &&
    hemSourceCurveCount === target.hemSourceCurveCountPerPiece &&
    radialSourceCurveCount === target.radialSourceCurveCountPerPiece &&
    unclassifiedSourceCurveCount === 0 &&
    angularSpanRad !== null &&
    Math.abs(angularSpanRad - target.sectorSpanRadPerPiece) <= PARAMETER_RESIDUAL_RAD * 8;
  return Object.freeze({
    pieceId: piece.pieceId,
    blockName: piece.blockName,
    writtenApexMm: Object.freeze(writtenApexMm),
    waistSourceCurveCount,
    hemSourceCurveCount,
    radialSourceCurveCount,
    unclassifiedSourceCurveCount,
    angularSpanRad,
    maximumWaistRadiusResidualMm: waistSourceCurveCount ? maximumWaistRadiusResidualMm : null,
    maximumHemRadiusResidualMm: hemSourceCurveCount ? maximumHemRadiusResidualMm : null,
    canonicalMediumLocalGeometryCompatible,
  });
}

export function evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2(
  input: unknown,
): PatternImportDxfProductSavedAnnularLocalFramePreflightResultV2 {
  try {
    const request = exactRequest(input);
    const base = evaluatePatternImportDxfProductSavedCanonicalMediumPlacementPreflightV1({
      schemaVersion:
        PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1,
      composerSnapshot: request.composerSnapshot,
      projection: request.projection,
    });
    if (!base.ok) {
      fail(
        'composer-binding-mismatch',
        `V1 composer validation failed: ${base.blocker.code}: ${base.blocker.detail}`,
      );
    }
    const receipt = exactReceipt(request.writerFrameReceipt, request.composerSnapshot);
    const pieces = Object.freeze(
      receipt.pieces.map((piece) => localPieceDiagnostic(piece, request.projection)),
    );
    const mismatchReasons = pieces
      .filter(
        ({ canonicalMediumLocalGeometryCompatible }) => !canonicalMediumLocalGeometryCompatible,
      )
      .map(({ pieceId }) => `${pieceId}-local-frame-is-not-the-700-900mm-0.64rad-annular-sector`);
    if (
      base.report.counts.vertexCount !==
        PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1.vertexCount ||
      base.report.counts.triangleCount !==
        PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1.triangleCount ||
      base.report.counts.seamCount !==
        PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1.seamCount ||
      base.report.counts.seamPairCount !==
        PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_TARGET_V1.seamPairCount
    ) {
      mismatchReasons.push('composer-counts-differ-from-canonical-medium-target');
    }
    const compatible = mismatchReasons.length === 0;
    return Object.freeze({
      ok: true as const,
      report: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_V2,
        status: compatible
          ? ('canonical-medium-local-geometry-compatible' as const)
          : ('canonical-medium-local-geometry-incompatible' as const),
        origin: request.composerSnapshot.origin,
        counts: Object.freeze({
          vertexCount: base.report.counts.vertexCount,
          triangleCount: base.report.counts.triangleCount,
          pieceCount: base.report.counts.pieceCount,
          seamCount: base.report.counts.seamCount,
          seamPairCount: base.report.counts.seamPairCount,
        }),
        pieces,
        mismatchReasons: Object.freeze(mismatchReasons),
        integrationBlockers: Object.freeze([
          'cloth-session-local-frame-preflight-v2-not-integrated',
        ] as const),
        minimalIntegrationDelta: Object.freeze({
          producer: 'already-persisted-in-bounded-manifest-replay-carrier' as const,
          binding: 'already-bound-to-row-DXF-SHA-and-aggregate-sourcePathIds' as const,
          consumer:
            'cloth-owned saved session must replace the global-origin V1 geometry test' as const,
        }),
        claims: Object.freeze({
          composerBindingValidatedByV1: true as const,
          localCoordinatesUseWriterReceiptOnly: true as const,
          geometryExtremaInferenceUsed: false as const,
          writerReplayBytesBoundToSavedRow: true as const,
          writerFrameReceiptPersisted: true as const,
          sourcePathIdentityBoundByAggregateSeal: true as const,
          placementAdmissionEligible: false as const,
          placementAuthority: false as const,
          runtimeAuthority: false as const,
          productionAuthority: false as const,
        }),
      }),
      blocker: null,
    });
  } catch (error) {
    const failure =
      error instanceof LocalFrameFailure
        ? error
        : new LocalFrameFailure(
            'invalid-input',
            error instanceof Error ? error.message : 'Local-frame preflight failed closed.',
          );
    return Object.freeze({
      ok: false as const,
      report: null,
      blocker: Object.freeze({ code: failure.code, detail: failure.message }),
    });
  }
}
