import {
  DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2,
  buildDxfPipelineSourcePathCarrierV2,
  type DxfPipelineSourcePathArtifactV2,
} from '../../pattern-import/dxf-pipeline-source-path-carrier-v2';
import type {
  DxfPieceSpecContourBoundaryV1,
  DxfPieceSpecProvenanceSourceV1,
} from '../../pattern-import/dxf-piece-spec-provenance-bridge-v1';
import type { DxfPipelineProvenanceStageOutputV1 } from '../../pattern-import/dxf-pipeline-provenance-v1';
import type { PieceSpec } from '../../pattern-import/types';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
  buildPatternImportDxfTwoSidedSeamMappingV1,
  type PatternImportDxfTwoSidedSeamMappingInputV1,
  type PatternImportDxfTwoSidedSeamMappingWitnessV1,
  type PatternImportDxfTwoSidedSeamOrderedSampleWitnessV1,
} from './pattern-import-dxf-two-sided-seam-mapping-v1';

export const PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2 =
  'pattern-import-dxf-two-sided-seam-mapping/2' as const;
export const PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2 =
  'pattern-import-dxf-two-sided-seam-mapping-seal/2' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_TEXT_BYTES = 1_024;
const MAX_CANONICAL_BYTES = 4 * 1024 * 1024;
const textEncoder = new TextEncoder();

export type PatternImportDxfTwoSidedSeamMappingInputV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2;
  /** Existing G4F0/Phase-E input remains the only geometry and assembly authority. */
  base: PatternImportDxfTwoSidedSeamMappingInputV1;
  /** Fresh Phase-C lineage inputs. No caller-supplied V2 carrier or PathId is accepted. */
  phaseD: Readonly<{
    source: DxfPieceSpecProvenanceSourceV1;
    contours: readonly DxfPieceSpecContourBoundaryV1[];
    sourceSha256: string;
  }>;
}>;

export type PatternImportDxfTwoSidedSeamSideMappingV2 = Readonly<{
  sideIndex: 0 | 1;
  pieceId: string;
  contourId: string;
  sourcePathId: number;
  authoredAnchors: readonly [string, string];
  direction: 'forward' | 'reverse';
  reversed: boolean;
  contourTraversal: 'increasing-index';
  orderedSamples: readonly PatternImportDxfTwoSidedSeamOrderedSampleWitnessV1[];
  lengthMm: number;
  endpointResidualMm: number;
}>;

export type PatternImportDxfTwoSidedSeamMappingV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2;
  baseWitnessVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1;
  sourceBinding: Readonly<{
    sourceFileId: string;
    documentId: string;
    revision: string;
    baseFinalCoordinateSha256: string;
    sourcePathCoordinateSha256: string;
    handoffCanonicalSha256: string;
  }>;
  scope: PatternImportDxfTwoSidedSeamMappingWitnessV1['scope'];
  seam: Readonly<{
    id: string;
    operationId: string;
    mapping: 'equal';
    lengthRatio: 1;
    sides: readonly [
      PatternImportDxfTwoSidedSeamSideMappingV2,
      PatternImportDxfTwoSidedSeamSideMappingV2,
    ];
  }>;
  compatibility: PatternImportDxfTwoSidedSeamMappingWitnessV1['compatibility'];
}>;

export type PatternImportDxfTwoSidedSeamMappingSealV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  sealedMappingVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2;
  authority: 'unsigned-in-memory-consistency-only';
  writerExportShaBound: false;
  trustedAuthorityIntegrated: false;
  productionReady: false;
}>;

export const PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_CLAIMS_V2 = Object.freeze({
  geometryAuthority: 'existing-phase-e-handoff-only',
  pathIdOrigin: 'fresh-exact-phase-c-lineage-rebuild',
  pathIdAvailableFromV2Carrier: true,
  sourcePathIdIncludedInV2ContentBinding: true,
  sourceCurveIdParsingUsed: false,
  nearestGeometryRecoveryUsed: false,
  mappingProduced: true,
  mappingSealProduced: true,
  writerExportShaBound: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfTwoSidedSeamMappingBlockerCodeV2 =
  | 'reentrant-call'
  | 'invalid-input'
  | 'base-g4f0-evidence-unavailable'
  | 'source-path-carrier-blocked'
  | 'source-binding-mismatch'
  | 'source-path-identity-mismatch'
  | 'sha256-unavailable';

export type PatternImportDxfTwoSidedSeamMappingBlockerV2 = Readonly<{
  code: PatternImportDxfTwoSidedSeamMappingBlockerCodeV2;
  field: string;
  detail: string;
}>;

export type PatternImportDxfTwoSidedSeamMappingResultV2 =
  | Readonly<{
      ok: true;
      mapping: PatternImportDxfTwoSidedSeamMappingV2;
      seal: PatternImportDxfTwoSidedSeamMappingSealV2;
      baseWitness: PatternImportDxfTwoSidedSeamMappingWitnessV1;
      carrierEvidence: DxfPipelineSourcePathArtifactV2;
      blockers: readonly PatternImportDxfTwoSidedSeamMappingBlockerV2[];
      claims: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_CLAIMS_V2;
    }>
  | Readonly<{
      ok: false;
      mapping: null;
      seal: null;
      baseWitness: PatternImportDxfTwoSidedSeamMappingWitnessV1 | null;
      carrierEvidence: null;
      blockers: readonly PatternImportDxfTwoSidedSeamMappingBlockerV2[];
      claims: Readonly<{
        geometryAuthority: 'existing-phase-e-handoff-only';
        pathIdOrigin: 'fresh-exact-phase-c-lineage-rebuild';
        pathIdAvailableFromV2Carrier: false;
        sourcePathIdIncludedInV2ContentBinding: false;
        sourceCurveIdParsingUsed: false;
        nearestGeometryRecoveryUsed: false;
        mappingProduced: false;
        mappingSealProduced: false;
        writerExportShaBound: false;
        trustedAuthorityIntegrated: false;
        productionReady: false;
      }>;
    }>;

export const PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_CONTRACT_V2 = Object.freeze({
  baseAuthority: 'G4F0 V1 witness from existing Phase-E handoff',
  pathAuthority: 'fresh Phase-C rebuild from source PathId lineage',
  callerSuppliedSourcePathCarrierAccepted: false,
  callerSuppliedSourcePathIdAccepted: false,
  v1SchemaChanged: false,
  sourceCurveIdParsingAllowed: false,
  nearestGeometryRecoveryAllowed: false,
  mappingPolicy: 'equal continuous normalized progress',
  sealAuthority: 'unsigned in-memory consistency only',
  writerExportShaAuthority: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

class MappingFailure extends Error {
  constructor(
    readonly code: PatternImportDxfTwoSidedSeamMappingBlockerCodeV2,
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(
  code: PatternImportDxfTwoSidedSeamMappingBlockerCodeV2,
  field: string,
  detail: string,
): never {
  throw new MappingFailure(code, field, detail);
}

function bounded(value: string): string {
  if (textEncoder.encode(value).byteLength <= MAX_TEXT_BYTES) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > MAX_TEXT_BYTES) break;
    output += scalar;
  }
  return `${output}…`;
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', field, 'must be an exact plain data record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(descriptors);
  } catch {
    fail('invalid-input', field, 'reflection failed.');
  }
  if (prototype !== Object.prototype) fail('invalid-input', field, 'must use Object.prototype.');
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  )
    fail('invalid-input', field, 'contains missing, hidden, symbol, or unexpected fields.');
  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${field}.${key}`, 'must be an enumerable data property.');
    result[key] = descriptor.value;
  }
  return result;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError('non-canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('unsupported canonical value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

const BLOCKED_CLAIMS = Object.freeze({
  geometryAuthority: 'existing-phase-e-handoff-only' as const,
  pathIdOrigin: 'fresh-exact-phase-c-lineage-rebuild' as const,
  pathIdAvailableFromV2Carrier: false as const,
  sourcePathIdIncludedInV2ContentBinding: false as const,
  sourceCurveIdParsingUsed: false as const,
  nearestGeometryRecoveryUsed: false as const,
  mappingProduced: false as const,
  mappingSealProduced: false as const,
  writerExportShaBound: false as const,
  trustedAuthorityIntegrated: false as const,
  productionReady: false as const,
});

function blocked(
  error: unknown,
  baseWitness: PatternImportDxfTwoSidedSeamMappingWitnessV1 | null = null,
): PatternImportDxfTwoSidedSeamMappingResultV2 {
  const known = error instanceof MappingFailure;
  return deepFreeze({
    ok: false as const,
    mapping: null,
    seal: null,
    baseWitness,
    carrierEvidence: null,
    blockers: [
      {
        code: known ? error.code : ('invalid-input' as const),
        field: bounded(known ? error.field : 'input'),
        detail: bounded(
          known
            ? error.message
            : 'DXF V2 mapping rejected inaccessible, hostile, or inconsistent input.',
        ),
      },
    ],
    claims: BLOCKED_CLAIMS,
  });
}

function sourcePathSide(
  artifact: DxfPipelineSourcePathArtifactV2,
  witness: PatternImportDxfTwoSidedSeamMappingWitnessV1['seam']['sides'][number],
): PatternImportDxfTwoSidedSeamSideMappingV2 {
  const carriedPieces = artifact.carrier.pieces.filter(
    ({ pieceId }) => pieceId === witness.pieceId,
  );
  if (carriedPieces.length !== 1)
    fail(
      'source-path-identity-mismatch',
      `carrier.pieces.${witness.pieceId}`,
      'witness piece does not resolve to one V2 carrier piece.',
    );
  const contours = carriedPieces[0]!.contours.filter(({ id }) => id === witness.contourId);
  if (contours.length !== 1)
    fail(
      'source-path-identity-mismatch',
      `carrier.pieces.${witness.pieceId}.contours.${witness.contourId}`,
      'witness contour does not resolve to one V2 carrier contour.',
    );
  const pathByVertex = new Map(
    contours[0]!.sourceVertices.map(
      ({ vertexId, sourcePathId }) => [vertexId, sourcePathId] as const,
    ),
  );
  const pathIds = witness.orderedSamples.map(({ vertexId }) => pathByVertex.get(vertexId));
  if (pathIds.some((pathId) => pathId === undefined) || new Set(pathIds).size !== 1)
    fail(
      'source-path-identity-mismatch',
      `mapping.seam.sides[${witness.sideIndex}]`,
      'every exact ordered sample must resolve to one identical pre-projection PathId.',
    );
  const sourcePathId = pathIds[0];
  if (sourcePathId === undefined || !Number.isSafeInteger(sourcePathId) || sourcePathId < 0)
    fail(
      'source-path-identity-mismatch',
      `mapping.seam.sides[${witness.sideIndex}].sourcePathId`,
      'resolved PathId is invalid.',
    );
  return deepFreeze({
    sideIndex: witness.sideIndex,
    pieceId: witness.pieceId,
    contourId: witness.contourId,
    sourcePathId,
    authoredAnchors: witness.authoredAnchors,
    direction: witness.direction,
    reversed: witness.reversed,
    contourTraversal: witness.contourTraversal,
    orderedSamples: witness.orderedSamples,
    lengthMm: witness.lengthMm,
    endpointResidualMm: witness.endpointResidualMm,
  });
}

let claimed = false;

export async function buildPatternImportDxfTwoSidedSeamMappingV2(
  inputValue: unknown,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfTwoSidedSeamMappingResultV2> {
  if (claimed)
    return blocked(new MappingFailure('reentrant-call', 'input', 'reentrant V2 mapping refused.'));
  claimed = true;
  let baseWitness: PatternImportDxfTwoSidedSeamMappingWitnessV1 | null = null;
  try {
    const input = exactDataRecord(inputValue, ['schemaVersion', 'base', 'phaseD'], 'input');
    if (input.schemaVersion !== PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2)
      fail('invalid-input', 'input.schemaVersion', 'schema version is unsupported.');
    const phaseD = exactDataRecord(
      input.phaseD,
      ['source', 'contours', 'sourceSha256'],
      'input.phaseD',
    );
    if (typeof phaseD.sourceSha256 !== 'string' || !SHA256.test(phaseD.sourceSha256))
      fail('invalid-input', 'input.phaseD.sourceSha256', 'must be lowercase SHA-256.');

    const base = input.base as PatternImportDxfTwoSidedSeamMappingInputV1;
    const baseResult = await buildPatternImportDxfTwoSidedSeamMappingV1(base);
    if (
      baseResult.witness === null ||
      baseResult.mapping !== null ||
      baseResult.seal !== null ||
      baseResult.blockers.length !== 1 ||
      baseResult.blockers[0]?.code !== 'source-path-identity-unavailable'
    )
      fail(
        'base-g4f0-evidence-unavailable',
        'input.base',
        `fresh G4F0 evidence must reach only the exact missing-PathId blocker; got ${
          baseResult.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; ') ||
          'no blocker'
        }.`,
      );
    baseWitness = baseResult.witness;

    const baseRecord = exactDataRecord(
      base,
      ['schemaVersion', 'composition', 'expected', 'scopes', 'seamId', 'tolerance'],
      'input.base',
    );
    const composition = exactDataRecord(
      baseRecord.composition,
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
      'input.base.composition',
    );
    const carrierResult = await buildDxfPipelineSourcePathCarrierV2(
      {
        schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2,
        source: phaseD.source as DxfPieceSpecProvenanceSourceV1,
        contours: phaseD.contours as readonly DxfPieceSpecContourBoundaryV1[],
        pieces: composition.pieces as readonly PieceSpec[],
        pipeline: composition.pipeline as DxfPipelineProvenanceStageOutputV1,
        sourceSha256: phaseD.sourceSha256,
      },
      crypto,
    );
    if (!carrierResult.ok)
      fail(
        'source-path-carrier-blocked',
        'input.phaseD',
        carrierResult.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    const artifact = carrierResult.artifact;
    const basePipeline = composition.pipeline as DxfPipelineProvenanceStageOutputV1;
    if (
      artifact.carrier.sourceFileId !== baseWitness.sourceBinding.sourceFileId ||
      artifact.contentBinding.sourceFileId !== baseWitness.sourceBinding.sourceFileId ||
      !basePipeline.contentBinding ||
      artifact.contentBinding.baseSelectedGeometrySha256 !==
        basePipeline.contentBinding.selectedGeometrySha256
    )
      fail(
        'source-binding-mismatch',
        'input.phaseD',
        'V2 source-path carrier is not bound to the exact G4F0 source and Phase-D final-coordinate carrier.',
      );

    const firstSide = sourcePathSide(artifact, baseWitness.seam.sides[0]);
    const secondSide = sourcePathSide(artifact, baseWitness.seam.sides[1]);
    const mapping: PatternImportDxfTwoSidedSeamMappingV2 = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
      baseWitnessVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
      sourceBinding: {
        sourceFileId: baseWitness.sourceBinding.sourceFileId,
        documentId: baseWitness.sourceBinding.documentId,
        revision: baseWitness.sourceBinding.revision,
        baseFinalCoordinateSha256: baseWitness.sourceBinding.finalCoordinateSha256,
        sourcePathCoordinateSha256: artifact.contentBinding.selectedGeometryAndSourcePathSha256,
        handoffCanonicalSha256: baseWitness.sourceBinding.handoffCanonicalSha256,
      },
      scope: baseWitness.scope,
      seam: {
        id: baseWitness.seam.id,
        operationId: baseWitness.seam.operationId,
        mapping: 'equal' as const,
        lengthRatio: 1 as const,
        sides: [firstSide, secondSide] as const,
      },
      compatibility: baseWitness.compatibility,
    });
    if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
      fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 implementation is unavailable.');
    const encoded = textEncoder.encode(
      `pattern-import-dxf-two-sided-seam-mapping-v2\0${canonical(mapping)}`,
    );
    if (encoded.byteLength > MAX_CANONICAL_BYTES)
      fail('invalid-input', 'mapping', 'canonical mapping byte bound exceeded.');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
    if (digest.byteLength !== 32)
      fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 returned an invalid digest.');
    const seal: PatternImportDxfTwoSidedSeamMappingSealV2 = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
      algorithm: 'SHA-256' as const,
      canonicalSha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      sealedMappingVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
      authority: 'unsigned-in-memory-consistency-only' as const,
      writerExportShaBound: false as const,
      trustedAuthorityIntegrated: false as const,
      productionReady: false as const,
    });
    return deepFreeze({
      ok: true as const,
      mapping,
      seal,
      baseWitness,
      carrierEvidence: artifact,
      blockers: [],
      claims: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_CLAIMS_V2,
    });
  } catch (error) {
    return blocked(error, baseWitness);
  } finally {
    claimed = false;
  }
}
