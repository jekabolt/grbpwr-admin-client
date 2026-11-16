import { DXF_PIPELINE_CONTENT_BINDING_V1 } from '../../pattern-import/dxf-pipeline-provenance-v1';
import {
  DXF_PIPELINE_CONTENT_BINDING_V2,
  DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
  type DxfPipelineSourcePathArtifactV2,
} from '../../pattern-import/dxf-pipeline-source-path-carrier-v2';
import type { DxfSourceNativeStraightEdgeReadV1 } from '../../pattern-import/dxf-source-native-straight-edge-authority-v1';
import { bindDxfProductPhaseDNativeStraightEdgesV3 } from './dxf-product-phase-d-native-straight-edge-binding-v1';
import { DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1 } from './dxf-product-phase1-build-inputs-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V2,
  type PatternImportDxfProductGarmentMeshComposerRequestV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import { PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1 } from './pattern-import-dxf-two-sided-seam-mapping-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  type PatternImportDxfTwoSidedSeamMappingSealV2,
  type PatternImportDxfTwoSidedSeamMappingV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REQUEST_V1 =
  'pattern-import-dxf-product-garment-mesh-native-ingress-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REPORT_V1 =
  'pattern-import-dxf-product-garment-mesh-native-ingress-report/1' as const;

const SHA256 = /^[0-9a-f]{64}$/u;
const MAXIMUM_TARGET_EDGE_MM = 1_000;
const textEncoder = new TextEncoder();
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;

export type PatternImportDxfProductGarmentMeshNativeIngressRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REQUEST_V1;
  origin: PatternImportDxfProductGarmentMeshComposerRequestV2['origin'];
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  nativeRead: DxfSourceNativeStraightEdgeReadV1;
  targetEdgeMm: number;
}>;

export type PatternImportDxfProductGarmentMeshNativeIngressReportV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REPORT_V1;
  status: 'composer-request-ready';
  bindings: Readonly<{
    sourceFileId: string;
    sourceSha256: string;
    handoffCanonicalSha256: string;
    compositionCanonicalSha256: string;
    aggregateCanonicalSha256: string;
    sourceNativeAuthoritySha256: string;
    nativeStraightEdgesSha256: string;
  }>;
  counts: Readonly<{
    pieceCount: 2;
    contourCount: 2;
    seamCount: 2;
    nativePathCount: 2;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_CLAIMS_V1;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_CLAIMS_V1 = Object.freeze({
  compositionFreshRebuilt: true,
  tableCompositionRequestReused: true,
  callerSuppliedCompositionResultTrusted: false,
  secondTopologyAuthorityCreated: false,
  sourceNativeDecoderAuthorityConsumedOnce: true,
  phaseDSourcePathIdentityBound: true,
  childMappingSealsFreshRebuilt: true,
  rawDxfRetained: false,
  nearestGeometryRecoveryUsed: false,
  physicalPackageCompiled: false,
  solverRuntimeImported: false,
  placementAuthority: false,
  runtimeAuthority: false,
  productionAuthority: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_CLAIMS_V1,
  compositionFreshRebuilt: false as const,
  tableCompositionRequestReused: false as const,
  callerSuppliedCompositionResultTrusted: false as const,
  secondTopologyAuthorityCreated: false as const,
  sourceNativeDecoderAuthorityConsumedOnce: false as const,
  phaseDSourcePathIdentityBound: false as const,
  childMappingSealsFreshRebuilt: false as const,
});

export type PatternImportDxfProductGarmentMeshNativeIngressBlockerCodeV1 =
  | 'invalid-input'
  | 'composition-blocked'
  | 'source-identity-mismatch'
  | 'source-path-binding-mismatch'
  | 'native-straight-edge-binding-blocked'
  | 'child-mapping-seal-blocked'
  | 'sha256-unavailable';

export type PatternImportDxfProductGarmentMeshNativeIngressResultV1 =
  | Readonly<{
      ok: true;
      request: PatternImportDxfProductGarmentMeshComposerRequestV2;
      report: PatternImportDxfProductGarmentMeshNativeIngressReportV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      request: null;
      report: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfProductGarmentMeshNativeIngressBlockerCodeV1;
          detail: string;
        }>,
      ];
      claims: typeof BLOCKED_CLAIMS;
    }>;

class IngressFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductGarmentMeshNativeIngressBlockerCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: PatternImportDxfProductGarmentMeshNativeIngressBlockerCodeV1,
  detail: string,
): never {
  throw new IngressFailure(code, detail);
}

function blocked(error: unknown): PatternImportDxfProductGarmentMeshNativeIngressResultV1 {
  const failure =
    error instanceof IngressFailure
      ? error
      : new IngressFailure(
          'invalid-input',
          error instanceof Error ? error.message : 'Native garment ingress failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    request: null,
    report: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [Readonly<{ code: typeof failure.code; detail: string }>],
    claims: BLOCKED_CLAIMS,
  });
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
  if (!value || typeof value !== 'object') throw new TypeError('non-canonical value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function digest(domain: string, value: unknown): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function')
    fail('sha256-unavailable', 'SHA-256 is unavailable.');
  const bytes = textEncoder.encode(`${domain}\0${canonical(value)}`);
  try {
    const result = await Reflect.apply(capturedDigest, capturedSubtle, ['SHA-256', bytes]);
    if (!(result instanceof ArrayBuffer) || result.byteLength !== 32)
      fail('sha256-unavailable', 'SHA-256 returned an invalid digest.');
    return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch (error) {
    if (error instanceof IngressFailure) throw error;
    fail('sha256-unavailable', 'SHA-256 failed.');
  }
}

function sourcePathCarrier(
  request: PatternImportDxfProductMultiseamMappingCompositionRequestV2,
  handoff: Extract<
    Awaited<ReturnType<typeof buildPatternImportDxfProductMultiseamMappingCompositionV2>>,
    { ok: true }
  >,
  nativeRead: DxfSourceNativeStraightEdgeReadV1,
): DxfPipelineSourcePathArtifactV2 {
  const sourceFileId = request.catalog.sourceFileId;
  const sourceSha256 = nativeRead.read.doc.file.sha256;
  const pipeline = request.selection.pipeline;
  const selection = request.selection.selection;
  if (!pipeline || !selection)
    fail('source-path-binding-mismatch', 'Phase-D selection is unavailable.');
  const phaseDCarrier = pipeline.carrier;
  if (!phaseDCarrier) fail('source-path-binding-mismatch', 'Phase-D carrier is unavailable.');
  const pathsById = new Map(nativeRead.provenance.paths.map((path) => [path.pathId, path]));
  if (pathsById.size !== nativeRead.provenance.paths.length)
    fail('source-path-binding-mismatch', 'Native source path identities are not unique.');

  const pieces = handoff.handoff.pieces.map((piece) => {
    if (piece.contours.length !== 1)
      fail(
        'source-path-binding-mismatch',
        'The bounded V1 ingress requires one exact physical contour per piece.',
      );
    const contour = piece.contours[0]!;
    const aggregateSides = handoff.aggregate.seams.flatMap(({ sides }) =>
      sides.filter((side) => side.pieceId === piece.id && side.contourId === contour.id),
    );
    const sourcePathIds = [...new Set(aggregateSides.map(({ sourcePathId }) => sourcePathId))];
    if (sourcePathIds.length !== 1)
      fail(
        'source-path-binding-mismatch',
        `Piece ${piece.id}/${contour.id} does not bind exactly one native path.`,
      );
    const path = pathsById.get(sourcePathIds[0]!);
    if (!path)
      fail('source-path-binding-mismatch', `Native path is missing for ${piece.id}/${contour.id}.`);
    const carriedPiece = phaseDCarrier.pieces.find(
      (candidate) => candidate.pieceId === piece.id && candidate.sizeToken === selection.sizeToken,
    );
    const carriedContour = carriedPiece?.contours.find((candidate) => candidate.id === contour.id);
    if (!carriedContour)
      fail(
        'source-path-binding-mismatch',
        `Phase-D contour is missing for ${piece.id}/${contour.id}.`,
      );
    if (
      path.provenance.samples.length !== contour.vertices.length ||
      path.provenance.samples.some(
        (sample, index) => contour.vertices[index]?.id !== sample.vertexId,
      )
    )
      fail(
        'source-path-binding-mismatch',
        `Native path vertices drifted for ${piece.id}/${contour.id}.`,
      );
    return Object.freeze({
      pieceId: piece.id,
      sizeToken: selection.sizeToken,
      contours: Object.freeze([
        Object.freeze({
          id: contour.id,
          role: contour.role,
          geometry: Object.freeze({ ...carriedContour.geometry }),
          sourceVertices: Object.freeze(
            path.provenance.samples.map((sample, vertexIndex) =>
              Object.freeze({
                ...sample,
                normalizedArc: contour.vertices[vertexIndex]!.source.normalizedArc,
                sourcePathId: path.pathId,
              }),
            ),
          ),
        }),
      ]),
    });
  });

  return Object.freeze({
    schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
    carrier: Object.freeze({
      schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
      sourceFileId,
      pieces: Object.freeze(pieces),
      upstreamBlockerCount: 0,
      productionReady: false,
      heuristicRecoveryUsed: false,
      pieceSpecWireIntegrated: false,
      includesRawDxf: false,
      includesTags: false,
      includesAst: false,
    }),
    contentBinding: Object.freeze({
      schemaVersion: DXF_PIPELINE_CONTENT_BINDING_V2,
      algorithm: 'SHA-256' as const,
      sourceFileId,
      sourceSha256,
      baseContentBindingVersion: DXF_PIPELINE_CONTENT_BINDING_V1,
      baseSelectedGeometrySha256: handoff.aggregate.sourceBinding.baseFinalCoordinateSha256,
      selectedGeometryAndSourcePathSha256:
        handoff.aggregate.sourceBinding.sourcePathCoordinateSha256,
    }),
    claims: Object.freeze({
      rebuiltFromExactPhaseCLineage: true,
      baseCarrierByteSemanticMatch: true,
      baseContentBindingFreshlyRecomputed: true,
      sourcePathIdIncludedInV2ContentBinding: true,
      sourceCurveIdParsingUsed: false,
      nearestGeometryRecoveryUsed: false,
      topologyMutationRecoveryUsed: false,
      writerExportShaBound: false,
      trustedAuthorityIntegrated: false,
      productionReady: false,
    }),
  });
}

function childMappings(
  composition: Extract<
    Awaited<ReturnType<typeof buildPatternImportDxfProductMultiseamMappingCompositionV2>>,
    { ok: true }
  >,
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2,
): readonly [PatternImportDxfTwoSidedSeamMappingV2, PatternImportDxfTwoSidedSeamMappingV2] {
  const values = composition.aggregate.seams.map((seam): PatternImportDxfTwoSidedSeamMappingV2 => {
    const maximumLength = Math.max(...seam.sides.map(({ lengthMm }) => lengthMm));
    const tolerance = compositionRequest.choices.tolerance;
    return Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
      baseWitnessVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
      sourceBinding: Object.freeze({
        ...composition.aggregate.sourceBinding,
        handoffCanonicalSha256: composition.handoff.seal.canonicalSha256,
      }),
      scope: composition.aggregate.scope,
      seam,
      compatibility: Object.freeze({
        endpointToleranceMm: tolerance.endpointMm,
        maximumEndpointResidualMm: Math.max(
          ...seam.sides.map(({ endpointResidualMm }) => endpointResidualMm),
        ),
        fullLengthToleranceMm: tolerance.fullLengthMm,
        fullLengthToleranceRelative: tolerance.fullLengthRelative,
        effectiveFullLengthToleranceMm: Math.max(
          tolerance.fullLengthMm,
          tolerance.fullLengthRelative * maximumLength,
        ),
        fullLengthResidualMm: Math.abs(seam.sides[0].lengthMm - seam.sides[1].lengthMm),
        fullLengthResidualRelative:
          Math.abs(seam.sides[0].lengthMm - seam.sides[1].lengthMm) / maximumLength,
        endpointsCompatible: true,
        fullLengthsCompatible: true,
      }),
    });
  });
  if (values.length !== 2)
    fail('source-path-binding-mismatch', 'Exactly two seam mappings are required.');
  return Object.freeze(values) as readonly [
    PatternImportDxfTwoSidedSeamMappingV2,
    PatternImportDxfTwoSidedSeamMappingV2,
  ];
}

async function sealMappings(
  mappings: readonly [PatternImportDxfTwoSidedSeamMappingV2, PatternImportDxfTwoSidedSeamMappingV2],
): Promise<
  readonly [PatternImportDxfTwoSidedSeamMappingSealV2, PatternImportDxfTwoSidedSeamMappingSealV2]
> {
  const seals = await Promise.all(
    mappings.map(
      async (mapping): Promise<PatternImportDxfTwoSidedSeamMappingSealV2> =>
        Object.freeze({
          schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
          algorithm: 'SHA-256',
          canonicalSha256: await digest('pattern-import-dxf-two-sided-seam-mapping-v2', mapping),
          sealedMappingVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
          authority: 'unsigned-in-memory-consistency-only',
          writerExportShaBound: false,
          trustedAuthorityIntegrated: false,
          productionReady: false,
        }),
    ),
  );
  if (seals.length !== 2 || seals.some(({ canonicalSha256 }) => !SHA256.test(canonicalSha256)))
    fail('child-mapping-seal-blocked', 'Child mapping seals could not be rebuilt.');
  return Object.freeze(seals) as readonly [
    PatternImportDxfTwoSidedSeamMappingSealV2,
    PatternImportDxfTwoSidedSeamMappingSealV2,
  ];
}

/**
 * Compiler-side ingress only. It consumes the exact table/domain composition and the one-shot
 * decoder-minted straight-edge capability, then emits the existing Composer V2 request. It does
 * not compile a physical package, place a garment, or import a solver/runtime.
 */
export async function buildPatternImportDxfProductGarmentMeshNativeIngressV1(
  input: PatternImportDxfProductGarmentMeshNativeIngressRequestV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductGarmentMeshNativeIngressResultV1> {
  try {
    if (
      !input ||
      input.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REQUEST_V1 ||
      (input.origin !== 'fresh-import' && input.origin !== 'verified-saved-row') ||
      !input.compositionRequest ||
      !input.nativeRead ||
      !Number.isFinite(input.targetEdgeMm) ||
      input.targetEdgeMm <= 0 ||
      input.targetEdgeMm > MAXIMUM_TARGET_EDGE_MM
    )
      fail('invalid-input', 'Exact composition, native read, origin and target edge are required.');

    const composition = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
      input.compositionRequest,
      crypto,
    );
    if (!composition.ok)
      fail(
        'composition-blocked',
        composition.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );

    const sourceFileId = input.compositionRequest.catalog.sourceFileId;
    const sourceSha256 = input.nativeRead.read.doc.file.sha256;
    if (
      !SHA256.test(sourceSha256) ||
      input.nativeRead.provenance.sourceFileId !== sourceFileId ||
      sourceSha256 !== composition.evidence.sourceFileSha256
    )
      fail(
        'source-identity-mismatch',
        `Native read and Phase-D composition source identities differ: file=${input.nativeRead.provenance.sourceFileId}/${sourceFileId}, native=${sourceSha256}, evidence=${composition.evidence.sourceFileSha256}.`,
      );

    const carrier = sourcePathCarrier(input.compositionRequest, composition, input.nativeRead);
    const native = await bindDxfProductPhaseDNativeStraightEdgesV3(
      input.nativeRead.owner,
      carrier,
      {
        sourceFileId,
        sourceSha256,
        selectedGeometrySha256: composition.aggregate.sourceBinding.baseFinalCoordinateSha256,
      },
      crypto,
    );
    if (!native.ok)
      fail(
        'native-straight-edge-binding-blocked',
        `${native.blockers[0].code}: ${native.blockers[0].detail}`,
      );

    const mappings = childMappings(composition, input.compositionRequest);
    const seals = await sealMappings(mappings);
    const operation = composition.handoff.operations[0];
    if (!operation)
      fail('source-path-binding-mismatch', 'The sealed handoff has no stitch operation.');

    const request: PatternImportDxfProductGarmentMeshComposerRequestV2 = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V2,
      origin: input.origin,
      compositionRequest: input.compositionRequest,
      expected: Object.freeze({
        importGeneration: composition.evidence.importGeneration,
        savedRow: structuredClone(input.compositionRequest.current.row),
        sourceFileId,
        documentId: input.compositionRequest.choices.documentId,
        revision: input.compositionRequest.choices.revision,
        sizeSelectionSha256: composition.evidence.sizeSelectionSha256,
        catalogCanonicalSha256: composition.evidence.catalogSha256,
        proposalFingerprint: composition.evidence.proposalFingerprint,
        phaseEPlanSha256: composition.evidence.phaseEPlanSha256,
        compositionCanonicalSha256: composition.compositionSeal.canonicalSha256,
        twoSeamMappingAggregateSha256: composition.aggregateSeal.canonicalSha256,
        handoffCanonicalSha256: composition.handoff.seal.canonicalSha256,
        pieceIds: composition.handoff.pieces.map(({ id }) => id).sort() as [string, string],
        seamIds: composition.handoff.seams.map(({ id }) => id).sort() as [string, string],
        operation: Object.freeze({
          id: operation.id,
          sourceOperationNumber: composition.evidence.sourceOperationNumber,
          stage: operation.stage,
          order: 0 as const,
        }),
      }),
      phase1BuildInputsRequest: Object.freeze({
        schemaVersion: DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1,
        handoff: composition.handoff,
        aggregate: composition.aggregate,
        aggregateSeal: composition.aggregateSeal,
        childMappings: mappings,
        childSeals: seals,
      }),
      phaseDNativeStraightEdgeOwner: native.owner,
      targetEdgeMm: input.targetEdgeMm,
    });
    const report = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REPORT_V1,
      status: 'composer-request-ready' as const,
      bindings: Object.freeze({
        sourceFileId,
        sourceSha256,
        handoffCanonicalSha256: composition.handoff.seal.canonicalSha256,
        compositionCanonicalSha256: composition.compositionSeal.canonicalSha256,
        aggregateCanonicalSha256: composition.aggregateSeal.canonicalSha256,
        sourceNativeAuthoritySha256: native.receipt.binding.sourceNativeAuthoritySha256,
        nativeStraightEdgesSha256: native.receipt.binding.nativeStraightEdgesSha256,
      }),
      counts: Object.freeze({
        pieceCount: 2 as const,
        contourCount: 2 as const,
        seamCount: 2 as const,
        nativePathCount: 2 as const,
      }),
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_CLAIMS_V1,
    });
    return Object.freeze({
      ok: true as const,
      request,
      report,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_CLAIMS_V1,
    });
  } catch (error) {
    return blocked(error);
  }
}
