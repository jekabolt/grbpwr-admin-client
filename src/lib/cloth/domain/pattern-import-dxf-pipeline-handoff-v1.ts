import {
  DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1,
  type DxfPieceSpecBridgeContourV1,
  type DxfPieceSpecBridgePieceV1,
  type DxfPieceSpecProvenanceBridgeArtifactV1,
} from '../../pattern-import/dxf-piece-spec-provenance-bridge-v1';
import {
  DXF_PIPELINE_CONTENT_BINDING_V1,
  DXF_PIPELINE_PROVENANCE_V1,
  computeDxfPipelineContentBindingV1,
  type DxfPipelineContentBindingV1,
  type DxfPipelineProvenanceStageOutputV1,
} from '../../pattern-import/dxf-pipeline-provenance-v1';
import type { PieceSizeSpec, PieceSpec } from '../../pattern-import/types';
import {
  DXF_ASSEMBLY_HANDOFF_V1_LIMITS,
  type DxfAssemblyHandoffOptionsV1,
  type DxfAssemblyHandoffV1,
  type DxfAssemblyOperationV1,
  type DxfMaterialAssignmentV1,
  type DxfSeamV1,
} from './dxf-assembly-handoff-v1';
import {
  PATTERN_IMPORT_DXF_HANDOFF_BRIDGE_V1,
  buildPatternImportDxfAssemblyHandoffBridgeV1,
  type PatternImportDxfBindingDigestsV1,
  type PatternImportDxfBridgeBindingV1,
  type PatternImportDxfBridgeBlockerCodeV1,
  type PatternImportDxfBridgeExplicitAssemblyV1,
  type PatternImportDxfBridgePieceV1,
  type PatternImportDxfHandoffBridgeInputV1,
  type PatternImportDxfManifestBridgeViewV1,
} from './pattern-import-dxf-handoff-bridge-v1';

import {
  matchesPatternImportDxfProductCommitReplaySourceV1,
  type PatternImportDxfProductVerifiedCommitReplayV1,
} from './pattern-import-dxf-product-commit-replay-v1';

export const PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1 =
  'pattern-import-dxf-pipeline-handoff/1' as const;

const MAX_BLOCKERS = 128;
const MAX_DEPTH = 32;
const MAX_NODES = 1_000_000;
const MAX_RECORD_KEYS = 128;
const MAX_TOTAL_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_UPSTREAM_BLOCKERS = 100_000;
const MAX_COORDINATE_ABS_MM = 10_000_000;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

export type PatternImportDxfPipelineHandoffInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1;
  /** Repeats the caller-owned open-file identity; it must equal the carrier exactly. */
  sourceFileId: string;
  /** Successful Phase-D side-stage output. A caller cannot supply an `explicit.pieces` substitute. */
  pipeline: DxfPipelineProvenanceStageOutputV1;
  manifest: PatternImportDxfManifestBridgeViewV1;
  /** Current SemanticsOutput pieces. Every piece/size must occur exactly once in the carrier. */
  pieces: readonly PieceSpec[];
  binding: PatternImportDxfBridgeBindingV1;
  physicalSurface: PatternImportDxfBridgeExplicitAssemblyV1['physicalSurface'];
  seams: readonly DxfSeamV1[];
  operations: readonly DxfAssemblyOperationV1[];
  materials: readonly DxfMaterialAssignmentV1[];
}>;

export type PatternImportDxfPipelineHandoffBlockerCodeV1 =
  | PatternImportDxfBridgeBlockerCodeV1
  | 'pipeline-carrier-missing'
  | 'source-file-mismatch'
  | 'selection-cardinality-mismatch'
  | 'contour-cardinality-mismatch'
  | 'contour-role-mismatch'
  | 'duplicate-identity'
  | 'reentrant-composition';

export type PatternImportDxfPipelineHandoffBlockerV1 = Readonly<{
  code: PatternImportDxfPipelineHandoffBlockerCodeV1;
  field: string;
  detail: string;
  identities: readonly string[];
}>;

export const PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_CLAIMS_V1 = Object.freeze({
  sourceVerticesOrigin: 'phase-d-carrier-only',
  callerSuppliedSourceVerticesAccepted: false,
  seamInferenceUsed: false,
  nearestGeometryRecoveryUsed: false,
  productionReady: false,
  trustedCorpusAuthorityIntegrated: false,
  postSavePersistenceIntegrated: false,
  simulationRuntimeIntegrated: false,
} as const);

export type PatternImportDxfPipelineHandoffResultV1 =
  | Readonly<{
      ok: true;
      handoff: DxfAssemblyHandoffV1;
      bindingDigests: PatternImportDxfBindingDigestsV1;
      sourceFileId: string;
      claims: typeof PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      handoff: null;
      blockers: readonly PatternImportDxfPipelineHandoffBlockerV1[];
      claims: typeof PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_CLAIMS_V1;
    }>;

export const PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_CONTRACT_V1 = Object.freeze({
  source: 'successful dxf-pipeline-provenance/1 carrier',
  explicitPieces: 'derived only from exact carrier.pieces',
  selections: 'derived only from exact carrier pieceId/sizeToken pairs',
  sourceFileIdentity: 'caller open identity must equal carrier sourceFileId',
  contourPolicy: 'one exact Phase-D outer contour per selected piece/size',
  seamInferenceAllowed: false,
  nearestGeometryRecoveryAllowed: false,
  rawDxfAllowed: false,
  atomicFailureHandoff: null,
  contentBindingAuthority:
    'unsigned consistency/integrity evidence only; browser callers can recompute it and it is not authenticity or trust authority',
  productionReadyClaim: false,
  trustedCorpusAuthorityClaim: false,
  postSavePersistenceClaim: false,
  simulationRuntimeClaim: false,
} as const);

class CompositionFailure extends Error {
  constructor(
    readonly code: PatternImportDxfPipelineHandoffBlockerCodeV1,
    readonly field: string,
    message: string,
    readonly identities: readonly string[] = [],
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

function boundedDetail(value: string): string {
  if (textEncoder.encode(value).byteLength <= 1_024) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(output + scalar + '…').byteLength > 1_024) break;
    output += scalar;
  }
  return output + '…';
}

function blocker(
  code: PatternImportDxfPipelineHandoffBlockerCodeV1,
  field: string,
  detail: string,
  identities: readonly string[] = [],
): PatternImportDxfPipelineHandoffBlockerV1 {
  return Object.freeze({
    code,
    field: boundedDetail(field),
    detail: boundedDetail(detail),
    identities: Object.freeze(
      [...identities]
        .filter((identity) => textEncoder.encode(identity).byteLength <= 256)
        .slice(0, 16)
        .sort(compareCodeUnits),
    ),
  });
}

function blocked(
  blockers: readonly PatternImportDxfPipelineHandoffBlockerV1[],
): PatternImportDxfPipelineHandoffResultV1 {
  const bounded = blockers.length
    ? blockers.slice(0, MAX_BLOCKERS)
    : [blocker('invalid-input', 'composition', 'composition failed without a typed blocker.')];
  return deepFreeze({
    ok: false as const,
    handoff: null,
    blockers: bounded,
    claims: PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_CLAIMS_V1,
  });
}

function fail(
  code: PatternImportDxfPipelineHandoffBlockerCodeV1,
  field: string,
  detail: string,
  identities: readonly string[] = [],
): never {
  throw new CompositionFailure(code, field, detail, identities);
}

/**
 * Descriptor-only clone. The composition claim is acquired before this function can invoke a
 * Proxy reflection trap, so synchronous reentry cannot observe or mint a partially checked input.
 */
function snapshotPlainData(value: unknown): unknown {
  const active = new Set<object>();
  let nodes = 0;
  let textBytes = 0;

  const visit = (current: unknown, path: string, depth: number, inArray: boolean): unknown => {
    nodes += 1;
    if (nodes > MAX_NODES) fail('bounds-exceeded', path, 'input node bound exceeded.');
    if (depth > MAX_DEPTH) fail('bounds-exceeded', path, 'input depth bound exceeded.');
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0))
        fail('invalid-input', path, 'numbers must be finite canonical values.');
      return current;
    }
    if (typeof current === 'string') {
      const bytes = textEncoder.encode(current).byteLength;
      textBytes += bytes;
      if (bytes > MAX_TEXT_BYTES || textBytes > MAX_TOTAL_TEXT_BYTES)
        fail('bounds-exceeded', path, 'input text bound exceeded.');
      return current;
    }
    if (current === undefined && !inArray) return undefined;
    if (typeof current !== 'object' || current === null)
      fail('invalid-input', path, 'contains a non-data value.');
    if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer)
      fail('raw-dxf-forbidden', path, 'binary buffers are forbidden at the composition boundary.');
    if (active.has(current)) fail('invalid-input', path, 'contains a cycle.');
    active.add(current);
    try {
      const prototype = Object.getPrototypeOf(current);
      const descriptors = Object.getOwnPropertyDescriptors(current) as Record<
        PropertyKey,
        PropertyDescriptor
      >;
      const keys = Reflect.ownKeys(descriptors);
      if (Array.isArray(current)) {
        if (prototype !== Array.prototype)
          fail('invalid-input', path, 'must have the exact Array prototype.');
        const lengthDescriptor = descriptors.length;
        const length = lengthDescriptor?.value;
        if (
          !Number.isSafeInteger(length) ||
          length < 0 ||
          length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxTotalVertices ||
          keys.length !== length + 1
        )
          fail('bounds-exceeded', path, 'must be a bounded dense array without extra fields.');
        const output: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (
            !descriptor ||
            !descriptor.enumerable ||
            !Object.prototype.hasOwnProperty.call(descriptor, 'value')
          )
            fail('invalid-input', `${path}[${index}]`, 'must be an enumerable data element.');
          output.push(visit(descriptor.value, `${path}[${index}]`, depth + 1, true));
        }
        return output;
      }
      if (prototype !== Object.prototype && prototype !== null)
        fail('invalid-input', path, 'must be a plain record.');
      if (keys.length > MAX_RECORD_KEYS)
        fail('bounds-exceeded', path, 'record key bound exceeded.');
      const output: Record<string, unknown> = {};
      for (const key of keys) {
        if (typeof key !== 'string') fail('invalid-input', path, 'symbol fields are forbidden.');
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
          fail('invalid-input', `${path}.${key}`, 'must be an enumerable data property.');
        Object.defineProperty(output, key, {
          value: visit(descriptor.value, `${path}.${key}`, depth + 1, false),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return output;
    } finally {
      active.delete(current);
    }
  };

  return visit(value, 'compositionInput', 0, false);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-input', field, 'must be an exact record.');
  const actual = Object.keys(value).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail('invalid-input', field, `must have exact keys: ${expected.join(', ')}.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value)) fail('invalid-input', field, 'must be an array.');
  if (value.length > maximum) fail('bounds-exceeded', field, `exceeds ${maximum} entries.`);
  return value;
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

function boundedString(value: unknown, field: string, stable = false): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    !wellFormed(value) ||
    textEncoder.encode(value).byteLength > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxStringBytes ||
    Array.from(value).some((scalar) => {
      const code = scalar.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    }) ||
    (stable && !STABLE_ID.test(value))
  )
    fail(
      'invalid-input',
      field,
      `must be a bounded canonical${stable ? ' stable-id' : ''} string.`,
    );
  return value;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0))
    fail('invalid-input', field, 'must be a finite canonical number.');
  return value;
}

function nonnegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail('invalid-input', field, 'must be a non-negative safe integer.');
  return value as number;
}

function snapshotGeometry(value: unknown, field: string): DxfPieceSpecBridgeContourV1['geometry'] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-input', field, 'must be an exact geometry selector.');
  const kind = (value as Record<string, unknown>).kind;
  if (kind === 'cut' || kind === 'seam') {
    exactRecord(value, ['kind'], field);
    return Object.freeze({ kind });
  }
  const record = exactRecord(value, ['kind', 'index'], field);
  if (record.kind !== 'cut-loop')
    fail('invalid-input', `${field}.kind`, 'is not a supported geometry selector.');
  return Object.freeze({
    kind: 'cut-loop' as const,
    index: nonnegativeInteger(record.index, `${field}.index`),
  });
}

type CarrierSnapshot = Readonly<{
  sourceFileId: string;
  pieces: readonly DxfPieceSpecBridgePieceV1[];
  contentBinding: DxfPipelineContentBindingV1;
}>;

function snapshotSuccessfulCarrier(value: unknown): CarrierSnapshot {
  const hasContentBinding =
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, 'contentBinding');
  const pipeline = exactRecord(
    value,
    [
      'schemaVersion',
      'pipelineIntegrated',
      'productionReady',
      'heuristicRecoveryUsed',
      'pieceSpecWireIntegrated',
      'includesRawDxf',
      'includesTags',
      'includesAst',
      'carrier',
      'blockers',
      ...(hasContentBinding ? ['contentBinding'] : []),
    ],
    'pipeline',
  );
  if (
    pipeline.schemaVersion !== DXF_PIPELINE_PROVENANCE_V1 ||
    pipeline.pipelineIntegrated !== true ||
    pipeline.productionReady !== false ||
    pipeline.heuristicRecoveryUsed !== false ||
    pipeline.pieceSpecWireIntegrated !== false ||
    pipeline.includesRawDxf !== false ||
    pipeline.includesTags !== false ||
    pipeline.includesAst !== false ||
    !hasContentBinding ||
    array(pipeline.blockers, 'pipeline.blockers', MAX_BLOCKERS).length !== 0
  )
    fail(
      'pipeline-carrier-missing',
      'pipeline',
      'requires one successful, blocker-free Phase-D side-stage result with conservative claims.',
    );

  const carrier = exactRecord(
    pipeline.carrier,
    [
      'schemaVersion',
      'sourceFileId',
      'pieces',
      'upstreamBlockerCount',
      'productionReady',
      'heuristicRecoveryUsed',
      'pieceSpecWireIntegrated',
      'includesRawDxf',
      'includesTags',
      'includesAst',
    ],
    'pipeline.carrier',
  );
  if (
    carrier.schemaVersion !== DXF_PIECE_SPEC_PROVENANCE_BRIDGE_V1 ||
    carrier.productionReady !== false ||
    carrier.heuristicRecoveryUsed !== false ||
    carrier.pieceSpecWireIntegrated !== false ||
    carrier.includesRawDxf !== false ||
    carrier.includesTags !== false ||
    carrier.includesAst !== false
  )
    fail(
      'pipeline-carrier-missing',
      'pipeline.carrier',
      'has unsupported schema or safety claims.',
    );
  const upstreamBlockerCount = nonnegativeInteger(
    carrier.upstreamBlockerCount,
    'pipeline.carrier.upstreamBlockerCount',
  );
  if (upstreamBlockerCount > MAX_UPSTREAM_BLOCKERS)
    fail('bounds-exceeded', 'pipeline.carrier.upstreamBlockerCount', 'exceeds the audit bound.');
  const sourceFileId = boundedString(carrier.sourceFileId, 'pipeline.carrier.sourceFileId');
  const contentBindingRecord = exactRecord(
    pipeline.contentBinding,
    ['schemaVersion', 'algorithm', 'sourceFileId', 'sourceSha256', 'selectedGeometrySha256'],
    'pipeline.contentBinding',
  );
  if (
    contentBindingRecord.schemaVersion !== DXF_PIPELINE_CONTENT_BINDING_V1 ||
    contentBindingRecord.algorithm !== 'SHA-256' ||
    contentBindingRecord.sourceFileId !== sourceFileId ||
    typeof contentBindingRecord.sourceSha256 !== 'string' ||
    !SHA256.test(contentBindingRecord.sourceSha256) ||
    typeof contentBindingRecord.selectedGeometrySha256 !== 'string' ||
    !SHA256.test(contentBindingRecord.selectedGeometrySha256)
  )
    fail(
      'pipeline-carrier-missing',
      'pipeline.contentBinding',
      'must exactly bind sourceFileId, direct-DXF SHA-256 and selected geometry SHA-256.',
    );
  const contentBinding = Object.freeze({
    schemaVersion: DXF_PIPELINE_CONTENT_BINDING_V1,
    algorithm: 'SHA-256' as const,
    sourceFileId,
    sourceSha256: contentBindingRecord.sourceSha256,
    selectedGeometrySha256: contentBindingRecord.selectedGeometrySha256,
  });
  const rawPieces = array(
    carrier.pieces,
    'pipeline.carrier.pieces',
    DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxPieces,
  );
  if (rawPieces.length === 0)
    fail('pipeline-carrier-missing', 'pipeline.carrier.pieces', 'must carry at least one piece.');

  const pieceKeys = new Set<string>();
  const vertexIds = new Set<string>();
  const parameterIdentities = new Set<string>();
  let totalVertices = 0;
  const pieces = rawPieces.map((pieceValue, pieceIndex) => {
    const field = `pipeline.carrier.pieces[${pieceIndex}]`;
    const piece = exactRecord(pieceValue, ['pieceId', 'sizeToken', 'contours'], field);
    const pieceId = boundedString(piece.pieceId, `${field}.pieceId`, true);
    const sizeToken = boundedString(piece.sizeToken, `${field}.sizeToken`);
    const pieceKey = `${pieceId}\u0000${sizeToken}`;
    if (pieceKeys.has(pieceKey))
      fail('duplicate-identity', field, 'repeats a pieceId/sizeToken pair.', [pieceId]);
    pieceKeys.add(pieceKey);
    const rawContours = array(
      piece.contours,
      `${field}.contours`,
      DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxContoursPerPiece,
    );
    // Phase D currently proves exactly one selected outer contour per final PieceSizeSpec.
    if (rawContours.length !== 1)
      fail(
        'contour-cardinality-mismatch',
        `${field}.contours`,
        'Phase-E V1 requires exactly one Phase-D outer contour per selected piece/size.',
        [pieceId],
      );
    const contourIds = new Set<string>();
    const contours = rawContours.map((contourValue, contourIndex) => {
      const contourField = `${field}.contours[${contourIndex}]`;
      const contour = exactRecord(
        contourValue,
        ['id', 'role', 'geometry', 'sourceVertices'],
        contourField,
      );
      const id = boundedString(contour.id, `${contourField}.id`, true);
      if (contourIds.has(id))
        fail('duplicate-identity', `${contourField}.id`, 'repeats a contour identity.', [pieceId]);
      contourIds.add(id);
      const geometry = snapshotGeometry(contour.geometry, `${contourField}.geometry`);
      const expectedRole =
        geometry.kind === 'cut'
          ? 'cut-boundary'
          : geometry.kind === 'seam'
            ? 'sewing-boundary'
            : 'hole';
      if (contour.role !== expectedRole)
        fail(
          'contour-role-mismatch',
          `${contourField}.role`,
          `role must be ${expectedRole} for ${geometry.kind}; no role inference is allowed.`,
          [pieceId],
        );
      const rawVertices = array(
        contour.sourceVertices,
        `${contourField}.sourceVertices`,
        DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxVerticesPerContour,
      );
      if (rawVertices.length < 3)
        fail(
          'contour-cardinality-mismatch',
          `${contourField}.sourceVertices`,
          'closed contours require at least three source vertices.',
          [pieceId],
        );
      totalVertices += rawVertices.length;
      if (totalVertices > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxTotalVertices)
        fail('bounds-exceeded', 'pipeline.carrier.pieces', 'total vertex bound exceeded.');
      let previousArc = -1;
      const sourceVertices = rawVertices.map((vertexValue, vertexIndex) => {
        const vertexField = `${contourField}.sourceVertices[${vertexIndex}]`;
        const vertex = exactRecord(
          vertexValue,
          ['vertexId', 'sourceCurveId', 'parameterSpace', 'sourceCurveT', 'normalizedArc'],
          vertexField,
        );
        const vertexId = boundedString(vertex.vertexId, `${vertexField}.vertexId`, true);
        const sourceCurveId = boundedString(
          vertex.sourceCurveId,
          `${vertexField}.sourceCurveId`,
          true,
        );
        if (vertexIds.has(vertexId))
          fail(
            'duplicate-identity',
            `${vertexField}.vertexId`,
            'repeats a global vertex identity.',
          );
        vertexIds.add(vertexId);
        if (
          vertex.parameterSpace !== 'unit' &&
          vertex.parameterSpace !== 'angle-radians' &&
          vertex.parameterSpace !== 'knot-domain'
        )
          fail(
            'invalid-input',
            `${vertexField}.parameterSpace`,
            'is not a native parameter space.',
          );
        const sourceCurveT = finiteNumber(vertex.sourceCurveT, `${vertexField}.sourceCurveT`);
        if (vertex.parameterSpace === 'unit' && (sourceCurveT < 0 || sourceCurveT > 1))
          fail('invalid-input', `${vertexField}.sourceCurveT`, 'unit parameter must be in [0, 1].');
        const normalizedArc = finiteNumber(vertex.normalizedArc, `${vertexField}.normalizedArc`);
        if (
          normalizedArc < 0 ||
          normalizedArc > 1 ||
          (vertexIndex === 0 && normalizedArc !== 0) ||
          (vertexIndex > 0 && normalizedArc <= previousArc)
        )
          fail(
            'invalid-input',
            `${vertexField}.normalizedArc`,
            'must start at zero and strictly increase in [0, 1].',
          );
        previousArc = normalizedArc;
        const parameterIdentity = `${sourceCurveId}\u0000${String(vertex.parameterSpace)}\u0000${sourceCurveT}`;
        if (parameterIdentities.has(parameterIdentity))
          fail(
            'duplicate-identity',
            vertexField,
            'repeats a global source-curve parameter identity.',
          );
        parameterIdentities.add(parameterIdentity);
        return Object.freeze({
          vertexId,
          sourceCurveId,
          parameterSpace: vertex.parameterSpace,
          sourceCurveT,
          normalizedArc,
        });
      });
      return Object.freeze({
        id,
        role: expectedRole,
        geometry,
        sourceVertices: Object.freeze(sourceVertices),
      });
    });
    return Object.freeze({ pieceId, sizeToken, contours: Object.freeze(contours) });
  });
  return Object.freeze({ sourceFileId, pieces: Object.freeze(pieces), contentBinding });
}

function selectedGeometry(size: PieceSizeSpec, contour: DxfPieceSpecBridgeContourV1): unknown {
  if (contour.geometry.kind === 'cut') return size.cut;
  if (contour.geometry.kind === 'seam') return size.seam;
  return size.cutLoops?.[contour.geometry.index] ?? null;
}

function verifyCompleteCurrentSelection(
  pieces: readonly PieceSpec[],
  carrier: CarrierSnapshot,
): void {
  if (pieces.length === 0 || pieces.length > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxPieces)
    fail('bounds-exceeded', 'pieces', 'current PieceSpec count is outside the handoff bound.');
  const carrierByKey = new Map<string, DxfPieceSpecBridgePieceV1>(
    carrier.pieces.map((piece) => [`${piece.pieceId}\u0000${piece.sizeToken}`, piece] as const),
  );
  const currentKeys = new Set<string>();
  const pieceIds = new Set<string>();
  let currentSizeCount = 0;
  for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
    const piece = pieces[pieceIndex];
    const pieceId = boundedString(piece.identity, `pieces[${pieceIndex}].identity`, true);
    if (pieceIds.has(pieceId))
      fail('duplicate-identity', `pieces[${pieceIndex}].identity`, 'repeats a PieceSpec identity.');
    pieceIds.add(pieceId);
    if (!Array.isArray(piece.sizes) || piece.sizes.length === 0)
      fail(
        'selection-cardinality-mismatch',
        `pieces[${pieceIndex}].sizes`,
        'every current PieceSpec must contain at least one selected size.',
        [pieceId],
      );
    currentSizeCount += piece.sizes.length;
    if (currentSizeCount > DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxPieces)
      fail(
        'bounds-exceeded',
        'pieces[].sizes',
        'selected piece-size count exceeds the handoff bound.',
      );
    for (let sizeIndex = 0; sizeIndex < piece.sizes.length; sizeIndex += 1) {
      const size = piece.sizes[sizeIndex];
      const sizeToken = boundedString(
        size.sizeToken,
        `pieces[${pieceIndex}].sizes[${sizeIndex}].sizeToken`,
      );
      const key = `${pieceId}\u0000${sizeToken}`;
      if (currentKeys.has(key))
        fail('duplicate-identity', `pieces[${pieceIndex}].sizes`, 'repeats a size token.', [
          pieceId,
        ]);
      currentKeys.add(key);
      const carried = carrierByKey.get(key);
      if (!carried)
        fail(
          'selection-cardinality-mismatch',
          `pieces[${pieceIndex}].sizes[${sizeIndex}]`,
          'current piece/size is absent from the exact carrier selection.',
          [pieceId],
        );
      const contour = carried.contours[0];
      const points = selectedGeometry(size, contour);
      if (!Array.isArray(points))
        fail(
          'contour-cardinality-mismatch',
          `pieces[${pieceIndex}].sizes[${sizeIndex}]`,
          'carrier geometry selector is absent from the current PieceSizeSpec.',
          [pieceId],
        );
      if (points.length !== contour.sourceVertices.length)
        fail(
          'contour-cardinality-mismatch',
          `pieces[${pieceIndex}].sizes[${sizeIndex}]`,
          'current geometry and exact carrier source-vertex counts differ.',
          [pieceId],
        );
      for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        const point = points[pointIndex] as { x?: unknown; y?: unknown };
        const x = finiteNumber(
          point?.x,
          `pieces[${pieceIndex}].sizes[${sizeIndex}][${pointIndex}].x`,
        );
        const y = finiteNumber(
          point?.y,
          `pieces[${pieceIndex}].sizes[${sizeIndex}][${pointIndex}].y`,
        );
        if (Math.abs(x) > MAX_COORDINATE_ABS_MM || Math.abs(y) > MAX_COORDINATE_ABS_MM)
          fail('bounds-exceeded', 'pieces', 'current PieceSpec coordinate bound exceeded.');
      }
    }
  }
  if (currentSizeCount !== carrier.pieces.length || currentKeys.size !== carrierByKey.size)
    fail(
      'selection-cardinality-mismatch',
      'pieces',
      `current/carrier piece-size cardinality differs (${currentSizeCount}/${carrier.pieces.length}).`,
    );
}

type SnapshotInput = Omit<PatternImportDxfPipelineHandoffInputV1, 'pipeline'> & {
  readonly pipeline: unknown;
};

let snapshotClaimed = false;

function snapshotCompositionInput(
  raw: unknown,
  savedCommit?: PatternImportDxfProductVerifiedCommitReplayV1,
):
  | Readonly<{ ok: true; input: SnapshotInput; carrier: CarrierSnapshot }>
  | Readonly<{ ok: false; result: PatternImportDxfPipelineHandoffResultV1 }> {
  if (snapshotClaimed)
    return Object.freeze({
      ok: false as const,
      result: blocked([
        blocker(
          'reentrant-composition',
          'compositionInput',
          'synchronous composition reentry was refused before reflection.',
        ),
      ]),
    });
  snapshotClaimed = true;
  try {
    const snapshot = snapshotPlainData(raw);
    const record = exactRecord(
      snapshot,
      [
        'schemaVersion',
        'sourceFileId',
        'pipeline',
        'manifest',
        'pieces',
        'binding',
        'physicalSurface',
        'seams',
        'operations',
        'materials',
      ],
      'compositionInput',
    );
    if (record.schemaVersion !== PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_V1)
      fail('invalid-input', 'compositionInput.schemaVersion', 'is unsupported.');
    const sourceFileId = boundedString(record.sourceFileId, 'compositionInput.sourceFileId');
    const carrier = snapshotSuccessfulCarrier(record.pipeline);
    if (sourceFileId !== carrier.sourceFileId)
      fail(
        'source-file-mismatch',
        'compositionInput.sourceFileId',
        'must exactly match the caller-owned sourceFileId carried from Session open.',
      );
    const pieces = array(
      record.pieces,
      'compositionInput.pieces',
      DXF_ASSEMBLY_HANDOFF_V1_LIMITS.maxPieces,
    ) as readonly PieceSpec[];
    verifyCompleteCurrentSelection(pieces, carrier);
    const manifest = record.manifest as PatternImportDxfManifestBridgeViewV1;
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      !manifest.source ||
      typeof manifest.source !== 'object' ||
      !Array.isArray(manifest.source.files) ||
      manifest.source.files.length !== 1 ||
      manifest.source.files[0]?.kind !== 'dxf'
    )
      fail(
        'source-file-mismatch',
        'compositionInput.manifest.source.files',
        'Phase-D composition requires the same direct single-DXF source set.',
      );
    const binding = record.binding as PatternImportDxfBridgeBindingV1;
    if (
      !SHA256.test(manifest.source.files[0].sha256) ||
      (manifest.source.files[0].sha256 !== carrier.contentBinding.sourceSha256 &&
        (!savedCommit ||
          !matchesPatternImportDxfProductCommitReplaySourceV1(
            savedCommit,
            manifest,
            carrier.contentBinding.sourceSha256,
            binding?.exportSha256,
          )))
    )
      fail(
        'source-file-mismatch',
        'compositionInput.manifest.source.files[0].sha256',
        'Phase D must match the direct DXF source or the exact verified committed writer export.',
      );
    return Object.freeze({
      ok: true as const,
      input: record as unknown as SnapshotInput,
      carrier,
    });
  } catch (error) {
    const known = error instanceof CompositionFailure;
    return Object.freeze({
      ok: false as const,
      result: blocked([
        blocker(
          known ? error.code : 'invalid-input',
          known ? error.field : 'compositionInput',
          known ? error.message : 'composition input is inaccessible or hostile.',
          known ? error.identities : [],
        ),
      ]),
    });
  } finally {
    snapshotClaimed = false;
  }
}

function explicitPiecesFromCarrier(
  carrier: CarrierSnapshot,
): readonly PatternImportDxfBridgePieceV1[] {
  return Object.freeze(
    carrier.pieces.map((piece) =>
      Object.freeze({
        pieceId: piece.pieceId,
        sizeToken: piece.sizeToken,
        contours: Object.freeze(
          piece.contours.map((contour) =>
            Object.freeze({
              id: contour.id,
              role: contour.role,
              geometry: contour.geometry,
              sourceVertices: contour.sourceVertices,
            }),
          ),
        ),
      }),
    ),
  );
}

/**
 * Composes the exact Phase-D identity carrier with explicit assembly metadata. The input shape has
 * no `explicit.pieces` or `sourceVertices` field: those are always rebuilt from the validated
 * carrier before invoking the existing pattern-import handoff bridge.
 */
export async function buildPatternImportDxfPipelineHandoffV1(
  raw: unknown,
  options: DxfAssemblyHandoffOptionsV1 = {},
  savedCommit?: PatternImportDxfProductVerifiedCommitReplayV1,
): Promise<PatternImportDxfPipelineHandoffResultV1> {
  const snapped = snapshotCompositionInput(raw, savedCommit);
  if (!snapped.ok) return snapped.result;
  const { input, carrier } = snapped;
  const recomputedContentBinding = await computeDxfPipelineContentBindingV1(
    (input.pipeline as DxfPipelineProvenanceStageOutputV1)
      .carrier as DxfPieceSpecProvenanceBridgeArtifactV1,
    input.pieces,
    carrier.contentBinding.sourceSha256,
    options.crypto,
  );
  if (!recomputedContentBinding.ok)
    return blocked([
      blocker(
        'sha256-unavailable',
        'pipeline.contentBinding',
        recomputedContentBinding.blocker.detail,
      ),
    ]);
  if (
    recomputedContentBinding.value.selectedGeometrySha256 !==
    carrier.contentBinding.selectedGeometrySha256
  )
    return blocked([
      blocker(
        'stale-geometry-binding',
        'pipeline.contentBinding.selectedGeometrySha256',
        'Phase-D selected geometry content binding does not match current PieceSpec coordinates.',
        carrier.pieces.map(({ pieceId }) => pieceId),
      ),
    ]);
  const downstreamInput: PatternImportDxfHandoffBridgeInputV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_HANDOFF_BRIDGE_V1,
    binding: input.binding,
    manifest: input.manifest,
    pieces: input.pieces,
    selections: carrier.pieces.map(({ pieceId, sizeToken }) => ({ pieceId, sizeToken })),
    explicit: {
      physicalSurface: input.physicalSurface,
      pieces: explicitPiecesFromCarrier(carrier),
      seams: input.seams,
      operations: input.operations,
      materials: input.materials,
    },
  };
  const downstream = await buildPatternImportDxfAssemblyHandoffBridgeV1(downstreamInput, options);
  if (!downstream.ok) {
    return blocked(
      downstream.blockers.map((item) =>
        blocker(item.code, item.field, item.detail, item.identities),
      ),
    );
  }
  return deepFreeze({
    ok: true as const,
    handoff: downstream.handoff,
    bindingDigests: downstream.bindingDigests,
    sourceFileId: carrier.sourceFileId,
    claims: PATTERN_IMPORT_DXF_PIPELINE_HANDOFF_CLAIMS_V1,
  });
}
