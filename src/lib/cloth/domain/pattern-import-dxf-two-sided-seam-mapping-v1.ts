import type {
  DxfAssemblyHandoffOptionsV1,
  DxfBoundaryVertexV1,
  DxfPatternContourV1,
  DxfSeamSideV1,
} from './dxf-assembly-handoff-v1';
import {
  buildPatternImportDxfPipelineHandoffV1,
  type PatternImportDxfPipelineHandoffBlockerCodeV1,
  type PatternImportDxfPipelineHandoffInputV1,
} from './pattern-import-dxf-pipeline-handoff-v1';

import {
  readPatternImportDxfProductCommitReplayScopeV1,
  type PatternImportDxfProductVerifiedCommitReplayV1,
} from './pattern-import-dxf-product-commit-replay-v1';

export const PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1 =
  'pattern-import-dxf-two-sided-seam-mapping/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_TEXT_BYTES = 256;
const MAX_SCOPES = 32;
const MAX_PIECES = 256;
const textEncoder = new TextEncoder();

export const PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_PUBLIC_VERTEX_KEYS_V1 = Object.freeze([
  'vertexId',
  'sourceCurveId',
  'parameterSpace',
  'sourceCurveT',
  'normalizedArc',
] as const);

export type PatternImportDxfTwoSidedSeamExpectedBindingV1 = Readonly<{
  sourceFileId: string;
  documentId: string;
  revision: string;
  finalCoordinateSha256: string;
}>;

export type PatternImportDxfTwoSidedSeamScopeV1 = Readonly<{
  scopeId: string;
  pieceIds: readonly string[];
}>;

export type PatternImportDxfTwoSidedSeamToleranceV1 = Readonly<{
  /** Exact anchors normally produce zero residual; this makes the admission check explicit. */
  endpointMm: number;
  /** Absolute side-length residual accepted for the whole authored span. */
  fullLengthMm: number;
  /** Relative side-length residual accepted for the whole authored span. */
  fullLengthRelative: number;
}>;

export type PatternImportDxfTwoSidedSeamMappingInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1;
  /** Existing Phase-E composition input. It remains the sole geometry/handoff authority. */
  composition: PatternImportDxfPipelineHandoffInputV1;
  expected: PatternImportDxfTwoSidedSeamExpectedBindingV1;
  /** V1 is intentionally one accepted output scope only. */
  scopes: readonly PatternImportDxfTwoSidedSeamScopeV1[];
  seamId: string;
  tolerance: PatternImportDxfTwoSidedSeamToleranceV1;
}>;

export type PatternImportDxfTwoSidedSeamMappingBlockerCodeV1 =
  | 'invalid-input'
  | 'bounds-exceeded'
  | 'reentrant-composition'
  | 'phase-e-blocked'
  | 'binding-mismatch'
  | 'scope-cardinality-mismatch'
  | 'scope-coverage-mismatch'
  | 'seam-cardinality-mismatch'
  | 'seam-operation-mismatch'
  | 'seam-side-cardinality-mismatch'
  | 'seam-span-invalid'
  | 'endpoint-tolerance-exceeded'
  | 'full-length-tolerance-exceeded'
  | 'mapping-policy-unsupported'
  | 'source-path-identity-unavailable';

export type PatternImportDxfTwoSidedSeamMappingBlockerV1 = Readonly<{
  code: PatternImportDxfTwoSidedSeamMappingBlockerCodeV1;
  causeCode: PatternImportDxfPipelineHandoffBlockerCodeV1 | null;
  field: string;
  detail: string;
  identities: readonly string[];
}>;

export type PatternImportDxfTwoSidedSeamOrderedSampleWitnessV1 = Readonly<{
  ordinal: number;
  vertexId: string;
  sourceCurveId: string;
  parameterSpace: DxfBoundaryVertexV1['source']['parameterSpace'];
  sourceCurveT: number;
  contourNormalizedArc: number;
  normalizedProgress: number;
}>;

export type PatternImportDxfTwoSidedSeamSideWitnessV1 = Readonly<{
  sideIndex: 0 | 1;
  pieceId: string;
  contourId: string;
  sourcePathId: null;
  authoredAnchors: readonly [string, string];
  direction: DxfSeamSideV1['direction'];
  reversed: boolean;
  /** GarmentAssemblyIR selects the normalized range forward, then applies reversal to ordering. */
  contourTraversal: 'increasing-index';
  orderedSamples: readonly PatternImportDxfTwoSidedSeamOrderedSampleWitnessV1[];
  lengthMm: number;
  endpointResidualMm: number;
}>;

export type PatternImportDxfTwoSidedSeamMappingWitnessV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1;
  sourceBinding: Readonly<{
    sourceFileId: string;
    documentId: string;
    revision: string;
    finalCoordinateSha256: string;
    handoffCanonicalSha256: string;
  }>;
  scope: PatternImportDxfTwoSidedSeamScopeV1;
  seam: Readonly<{
    id: string;
    operationId: string;
    mapping: 'equal';
    lengthRatio: 1;
    sides: readonly [
      PatternImportDxfTwoSidedSeamSideWitnessV1,
      PatternImportDxfTwoSidedSeamSideWitnessV1,
    ];
  }>;
  compatibility: Readonly<{
    endpointToleranceMm: number;
    maximumEndpointResidualMm: number;
    fullLengthToleranceMm: number;
    fullLengthToleranceRelative: number;
    effectiveFullLengthToleranceMm: number;
    fullLengthResidualMm: number;
    fullLengthResidualRelative: number;
    endpointsCompatible: true;
    fullLengthsCompatible: true;
  }>;
  gap: Readonly<{
    publicCarrierVertexKeys: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_PUBLIC_VERTEX_KEYS_V1;
    requiredMissingKey: 'sourcePathId';
    guessedSourceCurveIdParsingAllowed: false;
    minimalUpstreamChange: 'additive Phase-D sourcePathId populated before projection and included in the existing final-coordinate content binding';
  }>;
}>;

export const PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_CLAIMS_V1 = Object.freeze({
  geometryAuthority: 'existing-phase-e-handoff-only',
  exactlyTwoAuthoredSidesRequired: true,
  pathIdAvailableFromPublicCarrier: false,
  sourceCurveIdParsingUsed: false,
  nearestGeometryRecoveryUsed: false,
  mappingProduced: false,
  mappingSealProduced: false,
  writerExportShaBound: false,
  productionReady: false,
  trustedAuthorityIntegrated: false,
} as const);

export type PatternImportDxfTwoSidedSeamMappingResultV1 = Readonly<{
  ok: false;
  mapping: null;
  seal: null;
  witness: PatternImportDxfTwoSidedSeamMappingWitnessV1 | null;
  blockers: readonly PatternImportDxfTwoSidedSeamMappingBlockerV1[];
  claims: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_CLAIMS_V1;
}>;

export const PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_CONTRACT_V1 = Object.freeze({
  authority: 'buildPatternImportDxfPipelineHandoffV1',
  geometryTruthCopiesCreated: false,
  scopePolicy: 'exactly one explicit scope covering every Phase-E piece exactly once',
  seamPolicy: 'exactly one explicit equal-mapping seam with two authored directed sides',
  binding:
    'exact sourceFileId + documentId + revision + existing selected-final-coordinate SHA-256',
  pathIdentityPolicy: 'fail closed when the public Phase-D carrier omits sourcePathId',
  writerExportShaAuthority: false,
  positiveMappingAvailable: false,
} as const);

type Snapshot = Readonly<{
  composition: unknown;
  expected: PatternImportDxfTwoSidedSeamExpectedBindingV1;
  scopes: readonly PatternImportDxfTwoSidedSeamScopeV1[];
  seamId: string;
  tolerance: PatternImportDxfTwoSidedSeamToleranceV1;
}>;

class SnapshotFailure extends Error {
  constructor(
    readonly code: Extract<
      PatternImportDxfTwoSidedSeamMappingBlockerCodeV1,
      'invalid-input' | 'bounds-exceeded' | 'reentrant-composition'
    >,
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function boundedText(value: string): string {
  if (textEncoder.encode(value).byteLength <= 1_024) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(output + scalar + '…').byteLength > 1_024) break;
    output += scalar;
  }
  return output + '…';
}

function blocker(
  code: PatternImportDxfTwoSidedSeamMappingBlockerCodeV1,
  field: string,
  detail: string,
  identities: readonly string[] = [],
  causeCode: PatternImportDxfPipelineHandoffBlockerCodeV1 | null = null,
): PatternImportDxfTwoSidedSeamMappingBlockerV1 {
  return Object.freeze({
    code,
    causeCode,
    field: boundedText(field),
    detail: boundedText(detail),
    identities: Object.freeze([...identities].sort(compareCodeUnits).slice(0, 16)),
  });
}

function blocked(
  blockers: readonly PatternImportDxfTwoSidedSeamMappingBlockerV1[],
  witness: PatternImportDxfTwoSidedSeamMappingWitnessV1 | null = null,
): PatternImportDxfTwoSidedSeamMappingResultV1 {
  return deepFreeze({
    ok: false as const,
    mapping: null,
    seal: null,
    witness,
    blockers: blockers.length
      ? [...blockers]
      : [blocker('invalid-input', 'mapping', 'mapping admission failed without a blocker.')],
    claims: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_CLAIMS_V1,
  });
}

function dataRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new SnapshotFailure('invalid-input', field, 'must be an exact plain data record.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new SnapshotFailure('invalid-input', field, 'must have a plain-record prototype.');
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
    PropertyKey,
    PropertyDescriptor
  >;
  const ownKeys = Reflect.ownKeys(descriptors);
  const sortedExpected = [...keys].sort(compareCodeUnits);
  const sortedActual = ownKeys
    .filter((key): key is string => typeof key === 'string')
    .sort(compareCodeUnits);
  if (
    ownKeys.length !== sortedExpected.length ||
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((key, index) => key !== sortedExpected[index])
  )
    throw new SnapshotFailure(
      'invalid-input',
      field,
      `must have exact data keys: ${sortedExpected.join(', ')}.`,
    );
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
      throw new SnapshotFailure('invalid-input', `${field}.${key}`, 'must be a data property.');
    output[key] = descriptor.value;
  }
  return output;
}

function denseArray(value: unknown, field: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value))
    throw new SnapshotFailure('invalid-input', field, 'must be a dense array.');
  if (Object.getPrototypeOf(value) !== Array.prototype)
    throw new SnapshotFailure('invalid-input', field, 'must have the exact Array prototype.');
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
    PropertyKey,
    PropertyDescriptor
  >;
  const ownKeys = Reflect.ownKeys(descriptors);
  const length = descriptors.length?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > maximum ||
    ownKeys.length !== length + 1
  )
    throw new SnapshotFailure('bounds-exceeded', field, `must contain at most ${maximum} items.`);
  const output: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
      throw new SnapshotFailure('invalid-input', `${field}[${index}]`, 'must be a data element.');
    output.push(descriptor.value);
  }
  return output;
}

function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function canonicalString(value: unknown, field: string, stable = false): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    !wellFormed(value) ||
    textEncoder.encode(value).byteLength > MAX_TEXT_BYTES ||
    Array.from(value).some((scalar) => {
      const code = scalar.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    }) ||
    (stable && !STABLE_ID.test(value))
  )
    throw new SnapshotFailure('invalid-input', field, 'must be a bounded canonical string.');
  return value;
}

function canonicalTolerance(value: unknown, field: string, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Object.is(value, -0) ||
    value < 0 ||
    value > maximum
  )
    throw new SnapshotFailure(
      'invalid-input',
      field,
      `must be a canonical number in [0, ${maximum}].`,
    );
  return value;
}

let snapshotClaimed = false;

function snapshotInput(raw: unknown): Snapshot {
  if (snapshotClaimed)
    throw new SnapshotFailure(
      'reentrant-composition',
      'mappingInput',
      'synchronous mapping snapshot reentry was refused.',
    );
  snapshotClaimed = true;
  try {
    const input = dataRecord(
      raw,
      ['schemaVersion', 'composition', 'expected', 'scopes', 'seamId', 'tolerance'],
      'mappingInput',
    );
    if (input.schemaVersion !== PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1)
      throw new SnapshotFailure('invalid-input', 'mappingInput.schemaVersion', 'is unsupported.');
    const expectedRecord = dataRecord(
      input.expected,
      ['sourceFileId', 'documentId', 'revision', 'finalCoordinateSha256'],
      'mappingInput.expected',
    );
    const expected = Object.freeze({
      sourceFileId: canonicalString(
        expectedRecord.sourceFileId,
        'mappingInput.expected.sourceFileId',
      ),
      documentId: canonicalString(expectedRecord.documentId, 'mappingInput.expected.documentId'),
      revision: canonicalString(expectedRecord.revision, 'mappingInput.expected.revision'),
      finalCoordinateSha256: (() => {
        const digest = canonicalString(
          expectedRecord.finalCoordinateSha256,
          'mappingInput.expected.finalCoordinateSha256',
        );
        if (!SHA256.test(digest))
          throw new SnapshotFailure(
            'invalid-input',
            'mappingInput.expected.finalCoordinateSha256',
            'must be lowercase SHA-256.',
          );
        return digest;
      })(),
    });
    const scopes = Object.freeze(
      denseArray(input.scopes, 'mappingInput.scopes', MAX_SCOPES).map((scopeValue, scopeIndex) => {
        const field = `mappingInput.scopes[${scopeIndex}]`;
        const scope = dataRecord(scopeValue, ['scopeId', 'pieceIds'], field);
        const pieceIds = denseArray(scope.pieceIds, `${field}.pieceIds`, MAX_PIECES).map(
          (pieceId, pieceIndex) =>
            canonicalString(pieceId, `${field}.pieceIds[${pieceIndex}]`, true),
        );
        if (new Set(pieceIds).size !== pieceIds.length)
          throw new SnapshotFailure('invalid-input', `${field}.pieceIds`, 'must be unique.');
        return Object.freeze({
          scopeId: canonicalString(scope.scopeId, `${field}.scopeId`, true),
          pieceIds: Object.freeze([...pieceIds].sort(compareCodeUnits)),
        });
      }),
    );
    const toleranceRecord = dataRecord(
      input.tolerance,
      ['endpointMm', 'fullLengthMm', 'fullLengthRelative'],
      'mappingInput.tolerance',
    );
    const tolerance = Object.freeze({
      endpointMm: canonicalTolerance(
        toleranceRecord.endpointMm,
        'mappingInput.tolerance.endpointMm',
        1_000,
      ),
      fullLengthMm: canonicalTolerance(
        toleranceRecord.fullLengthMm,
        'mappingInput.tolerance.fullLengthMm',
        1_000_000,
      ),
      fullLengthRelative: canonicalTolerance(
        toleranceRecord.fullLengthRelative,
        'mappingInput.tolerance.fullLengthRelative',
        1,
      ),
    });
    return Object.freeze({
      composition: input.composition,
      expected,
      scopes,
      seamId: canonicalString(input.seamId, 'mappingInput.seamId', true),
      tolerance,
    });
  } finally {
    snapshotClaimed = false;
  }
}

type SideEvidence = Readonly<{
  witness: PatternImportDxfTwoSidedSeamSideWitnessV1;
  endpointsCompatible: boolean;
}>;

function sideEvidence(
  side: DxfSeamSideV1,
  sideIndex: 0 | 1,
  contour: DxfPatternContourV1,
  endpointToleranceMm: number,
): SideEvidence | null {
  if (!Array.isArray(side.anchors) || side.anchors.length !== 2) return null;
  const startIndex = contour.vertices.findIndex((vertex) => vertex.id === side.anchors[0]);
  const endIndex = contour.vertices.findIndex((vertex) => vertex.id === side.anchors[1]);
  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) return null;
  const rangeIndices = [startIndex];
  let current = startIndex;
  for (let step = 0; step < contour.vertices.length; step += 1) {
    if (current === endIndex) break;
    current = (current + 1) % contour.vertices.length;
    rangeIndices.push(current);
  }
  if (
    rangeIndices[rangeIndices.length - 1] !== endIndex ||
    rangeIndices.length > contour.vertices.length
  )
    return null;
  const indices = side.direction === 'forward' ? rangeIndices : [...rangeIndices].reverse();
  const cumulative = [0];
  for (let index = 1; index < indices.length; index += 1) {
    const previous = contour.vertices[indices[index - 1]].positionMm;
    const next = contour.vertices[indices[index]].positionMm;
    cumulative.push(
      cumulative[index - 1] + Math.hypot(next[0] - previous[0], next[1] - previous[1]),
    );
  }
  const lengthMm = cumulative[cumulative.length - 1];
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) return null;
  const expectedStart = contour.vertices[side.direction === 'forward' ? startIndex : endIndex];
  const expectedEnd = contour.vertices[side.direction === 'forward' ? endIndex : startIndex];
  const orderedStart = contour.vertices[indices[0]];
  const orderedEnd = contour.vertices[indices[indices.length - 1]];
  const endpointResidualMm = Math.max(
    Math.hypot(
      orderedStart.positionMm[0] - expectedStart.positionMm[0],
      orderedStart.positionMm[1] - expectedStart.positionMm[1],
    ),
    Math.hypot(
      orderedEnd.positionMm[0] - expectedEnd.positionMm[0],
      orderedEnd.positionMm[1] - expectedEnd.positionMm[1],
    ),
  );
  const orderedSamples = indices.map((vertexIndex, ordinal) => {
    const vertex = contour.vertices[vertexIndex];
    return Object.freeze({
      ordinal,
      vertexId: vertex.id,
      sourceCurveId: vertex.source.sourceCurveId,
      parameterSpace: vertex.source.parameterSpace,
      sourceCurveT: vertex.source.sourceCurveT,
      contourNormalizedArc: vertex.source.normalizedArc,
      normalizedProgress: cumulative[ordinal] / lengthMm,
    });
  });
  return Object.freeze({
    witness: Object.freeze({
      sideIndex,
      pieceId: side.pieceId,
      contourId: side.contourId,
      sourcePathId: null,
      authoredAnchors: Object.freeze([side.anchors[0], side.anchors[1]] as const),
      direction: side.direction,
      reversed: side.direction === 'reverse',
      contourTraversal: 'increasing-index',
      orderedSamples: Object.freeze(orderedSamples),
      lengthMm,
      endpointResidualMm,
    }),
    endpointsCompatible: endpointResidualMm <= endpointToleranceMm,
  });
}

/**
 * Audits the narrow untouched-DXF two-sided seam route without inventing missing PathId semantics.
 * V1 deliberately has no success constructor: the current public Phase-D carrier drops PathId.
 */
export async function buildPatternImportDxfTwoSidedSeamMappingV1(
  raw: unknown,
  options: DxfAssemblyHandoffOptionsV1 = {},
  savedCommit?: PatternImportDxfProductVerifiedCommitReplayV1,
): Promise<PatternImportDxfTwoSidedSeamMappingResultV1> {
  let input: Snapshot;
  try {
    input = snapshotInput(raw);
  } catch (error) {
    const known = error instanceof SnapshotFailure;
    return blocked([
      blocker(
        known ? error.code : 'invalid-input',
        known ? error.field : 'mappingInput',
        known ? error.message : 'mapping input is inaccessible or hostile.',
      ),
    ]);
  }
  if (input.scopes.length !== 1)
    return blocked([
      blocker(
        'scope-cardinality-mismatch',
        'mappingInput.scopes',
        `exactly one explicit output scope is required; received ${input.scopes.length}.`,
      ),
    ]);

  const phaseE = await buildPatternImportDxfPipelineHandoffV1(
    input.composition,
    options,
    readPatternImportDxfProductCommitReplayScopeV1(savedCommit) === input.scopes[0]?.scopeId
      ? savedCommit
      : undefined,
  );
  if (!phaseE.ok)
    return blocked(
      phaseE.blockers.map((item) =>
        blocker('phase-e-blocked', item.field, item.detail, item.identities, item.code),
      ),
    );

  const handoff = phaseE.handoff;
  const bindingMismatches: string[] = [];
  if (phaseE.sourceFileId !== input.expected.sourceFileId) bindingMismatches.push('sourceFileId');
  if (handoff.source.documentId !== input.expected.documentId) bindingMismatches.push('documentId');
  if (handoff.source.revision !== input.expected.revision) bindingMismatches.push('revision');
  if (phaseE.bindingDigests.selectedGeometrySha256 !== input.expected.finalCoordinateSha256)
    bindingMismatches.push('finalCoordinateSha256');
  if (bindingMismatches.length)
    return blocked([
      blocker(
        'binding-mismatch',
        'mappingInput.expected',
        `does not match the accepted Phase-E handoff: ${bindingMismatches.join(', ')}.`,
      ),
    ]);

  const scope = input.scopes[0];
  const handoffPieceIds = handoff.pieces.map(({ id }) => id).sort(compareCodeUnits);
  if (
    scope.pieceIds.length !== handoffPieceIds.length ||
    scope.pieceIds.some((pieceId, index) => pieceId !== handoffPieceIds[index])
  )
    return blocked([
      blocker(
        'scope-coverage-mismatch',
        'mappingInput.scopes[0].pieceIds',
        'the one scope must cover every Phase-E piece exactly once.',
        [...scope.pieceIds, ...handoffPieceIds],
      ),
    ]);

  const selectedSeams = handoff.seams.filter(({ id }) => id === input.seamId);
  if (selectedSeams.length !== 1)
    return blocked([
      blocker(
        'seam-cardinality-mismatch',
        'mappingInput.seamId',
        'the narrow V1 route requires exactly one explicit Phase-E seam with this exact ID.',
        handoff.seams.map(({ id }) => id),
      ),
    ]);
  const seam = selectedSeams[0];
  const seamOperations = handoff.operations.filter(({ id }) => id === seam.operationId);
  if (seamOperations.length !== 1 || !seamOperations[0].seamIds.includes(seam.id))
    return blocked([
      blocker(
        'seam-operation-mismatch',
        `handoff.seams[${seam.id}].operationId`,
        'the selected seam must belong to exactly one explicit operation that lists it.',
        [seam.id, seam.operationId],
      ),
    ]);
  if (!Array.isArray(seam.sides) || seam.sides.length !== 2)
    return blocked([
      blocker(
        'seam-side-cardinality-mismatch',
        `handoff.seams[${seam.id}].sides`,
        'exactly two authored sides are required.',
        [seam.id],
      ),
    ]);
  if (seam.mapping !== 'equal' || seam.lengthRatio !== 1)
    return blocked([
      blocker(
        'mapping-policy-unsupported',
        `handoff.seams[${seam.id}].mapping`,
        'V1 only admits equal/1 mapping; eased/gathered ratio semantics are not guessed.',
        [seam.id],
      ),
    ]);

  const contourFor = (side: DxfSeamSideV1): DxfPatternContourV1 | null =>
    handoff.pieces
      .find((piece) => piece.id === side.pieceId)
      ?.contours.find((contour) => contour.id === side.contourId) ?? null;
  const contourA = contourFor(seam.sides[0]);
  const contourB = contourFor(seam.sides[1]);
  if (!contourA || !contourB)
    return blocked([
      blocker(
        'seam-span-invalid',
        `handoff.seams[${seam.id}].sides`,
        'an authored side does not resolve to its exact Phase-E contour.',
        [seam.id],
      ),
    ]);
  const sideA = sideEvidence(seam.sides[0], 0, contourA, input.tolerance.endpointMm);
  const sideB = sideEvidence(seam.sides[1], 1, contourB, input.tolerance.endpointMm);
  if (!sideA || !sideB)
    return blocked([
      blocker(
        'seam-span-invalid',
        `handoff.seams[${seam.id}].sides`,
        'anchors/direction do not form two finite non-degenerate ordered contour spans.',
        [seam.id],
      ),
    ]);

  const maximumEndpointResidualMm = Math.max(
    sideA.witness.endpointResidualMm,
    sideB.witness.endpointResidualMm,
  );
  if (!sideA.endpointsCompatible || !sideB.endpointsCompatible)
    return blocked([
      blocker(
        'endpoint-tolerance-exceeded',
        `handoff.seams[${seam.id}].sides`,
        `endpoint residual ${maximumEndpointResidualMm} mm exceeds explicit tolerance ${input.tolerance.endpointMm} mm.`,
        [seam.id],
      ),
    ]);

  const fullLengthResidualMm = Math.abs(sideA.witness.lengthMm - sideB.witness.lengthMm);
  const maximumLengthMm = Math.max(sideA.witness.lengthMm, sideB.witness.lengthMm);
  const fullLengthResidualRelative = fullLengthResidualMm / maximumLengthMm;
  const effectiveFullLengthToleranceMm = Math.max(
    input.tolerance.fullLengthMm,
    input.tolerance.fullLengthRelative * maximumLengthMm,
  );
  if (fullLengthResidualMm > effectiveFullLengthToleranceMm)
    return blocked([
      blocker(
        'full-length-tolerance-exceeded',
        `handoff.seams[${seam.id}].lengthRatio`,
        `side-length residual ${fullLengthResidualMm} mm exceeds explicit effective tolerance ${effectiveFullLengthToleranceMm} mm.`,
        [seam.id],
      ),
    ]);

  const witness: PatternImportDxfTwoSidedSeamMappingWitnessV1 = deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
    sourceBinding: {
      sourceFileId: phaseE.sourceFileId,
      documentId: handoff.source.documentId,
      revision: handoff.source.revision,
      finalCoordinateSha256: phaseE.bindingDigests.selectedGeometrySha256,
      handoffCanonicalSha256: handoff.seal.canonicalSha256,
    },
    scope,
    seam: {
      id: seam.id,
      operationId: seam.operationId,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      sides: [sideA.witness, sideB.witness] as const,
    },
    compatibility: {
      endpointToleranceMm: input.tolerance.endpointMm,
      maximumEndpointResidualMm,
      fullLengthToleranceMm: input.tolerance.fullLengthMm,
      fullLengthToleranceRelative: input.tolerance.fullLengthRelative,
      effectiveFullLengthToleranceMm,
      fullLengthResidualMm,
      fullLengthResidualRelative,
      endpointsCompatible: true as const,
      fullLengthsCompatible: true as const,
    },
    gap: {
      publicCarrierVertexKeys: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_PUBLIC_VERTEX_KEYS_V1,
      requiredMissingKey: 'sourcePathId' as const,
      guessedSourceCurveIdParsingAllowed: false as const,
      minimalUpstreamChange:
        'additive Phase-D sourcePathId populated before projection and included in the existing final-coordinate content binding' as const,
    },
  });
  return blocked(
    [
      blocker(
        'source-path-identity-unavailable',
        'pipeline.carrier.pieces[].contours[].sourceVertices[].sourcePathId',
        'all public side/anchor/orientation/length evidence is exact, but Phase D drops numeric PathId before the public carrier; no mapping or seal was minted.',
        [seam.id, ...scope.pieceIds],
      ),
    ],
    witness,
  );
}
