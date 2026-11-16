import { describe, expect, it, vi } from 'vitest';

import {
  DXF_PIPELINE_CONTENT_BINDING_V2,
  DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
  type DxfPipelineSourcePathArtifactV2,
} from '../../pattern-import/dxf-pipeline-source-path-carrier-v2';
import { DXF_PIPELINE_CONTENT_BINDING_V1 } from '../../pattern-import/dxf-pipeline-provenance-v1';
import { readDxfWithSourceNativeStraightEdgeAuthorityV1 } from '../../pattern-import/dxf-source-native-straight-edge-authority-v1';
import { PHASE2_BOUNDARY_SAMPLING_LIMITS_V1 } from '../mesh/triangulation/phase2-boundary-sampling-v1';
import {
  DXF_ASSEMBLY_HANDOFF_V1,
  buildDxfAssemblyHandoffV1,
  type DxfAssemblyHandoffCandidateV1,
  type DxfAssemblyHandoffV1,
  type DxfSeamSideV1,
} from './dxf-assembly-handoff-v1';
import {
  DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1,
  type DxfProductPhase1BuildInputsRequestV1,
} from './dxf-product-phase1-build-inputs-v1';
import {
  bindDxfProductPhaseDNativeStraightEdgesV3,
  consumeDxfProductPhaseDNativeStraightEdgesV3,
  type DxfProductPhaseDNativeStraightEdgesOwnerV3,
} from './dxf-product-phase-d-native-straight-edge-binding-v1';
import {
  DXF_PRODUCT_PHASE2_FRESH_BUILD_REQUEST_V1,
  DXF_PRODUCT_PHASE2_FRESH_BUILD_LIMITS_V1,
  buildDxfProductPhase2FreshBuildOwnerV1,
  disposeDxfProductPhase2FreshBuildOwnerV1,
  projectDxfProductPhase2FreshBuildOwnerV1,
  type DxfProductPhase2FreshBuildRequestV1,
} from './dxf-product-phase2-fresh-build-owner-v1';
import { PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1 } from './pattern-import-dxf-two-sided-seam-mapping-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  type PatternImportDxfTwoSidedSeamMappingSealV2,
  type PatternImportDxfTwoSidedSeamMappingV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';
import {
  PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_SEAL_V1,
  PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1,
  type PatternImportDxfTwoSeamMappingAggregateSealV1,
  type PatternImportDxfTwoSeamMappingAggregateV1,
} from './pattern-import-dxf-two-seam-mapping-aggregate-v1';

const SOURCE_FILE_ID = 'source-file';
const ASSEMBLY_DOCUMENT_ID = 'saved-document:card-120';
const SELECTED_SHA = 'b'.repeat(64);
const SOURCE_PATH_SHA = 'c'.repeat(64);
const HANDOFF_SOURCE_AGGREGATE_SHA = 'a'.repeat(64);
const EXPORT_SHA = 'e'.repeat(64);
const PIECES = ['front', 'back'] as const;

type RingVertex = Readonly<{
  id: string;
  point: readonly [number, number];
  sourceCurveId: string;
  sourcePathId: number;
}>;
type Rings = Readonly<Record<(typeof PIECES)[number], readonly RingVertex[]>>;
type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Entry)[]
    ? Mutable<Entry>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

function dxfBytes(): ArrayBuffer {
  const polyline = (handle: string, x: number) =>
    `0\nLWPOLYLINE\n5\n${handle}\n8\n1\n90\n4\n70\n1\n10\n${x}\n20\n0\n10\n${x + 100}\n20\n0\n10\n${x + 100}\n20\n100\n10\n${x}\n20\n100`;
  return new TextEncoder().encode(
    `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${polyline('F1', 0)}\n${polyline('B1', 200)}\n0\nENDSEC\n0\nEOF\n`,
  ).buffer as ArrayBuffer;
}

function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function digest(domain: string, value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(`${domain}\0${canonical(value)}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function handoffCandidate(rings: Rings, sourceSha256: string): DxfAssemblyHandoffCandidateV1 {
  const seam = (
    id: 'seam-closing' | 'seam-right',
    edgeIndex: 3 | 1,
    directions: readonly ['forward' | 'reverse', 'forward' | 'reverse'],
  ) => ({
    id,
    operationId: 'operation-120',
    mapping: 'equal' as const,
    lengthRatio: 1,
    sides: PIECES.map((pieceId, index) => ({
      pieceId,
      contourId: `${pieceId}-shell`,
      anchors: [
        rings[pieceId][edgeIndex].id,
        rings[pieceId][(edgeIndex + 1) % rings[pieceId].length].id,
      ] as [string, string],
      direction: directions[index],
    })) as unknown as [DxfSeamSideV1, DxfSeamSideV1],
  });
  return {
    schemaVersion: DXF_ASSEMBLY_HANDOFF_V1,
    source: {
      format: 'DXF',
      documentId: ASSEMBLY_DOCUMENT_ID,
      revision: 'revision-7',
      units: 'mm',
      sourceSha256,
      exportSha256: EXPORT_SHA,
      exporterId: 'phase2-owner-test',
      exporterVersion: '1',
      provenanceKind: 'untrusted-product',
      corpusEntryId: null,
    },
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
    pieces: PIECES.map((pieceId) => ({
      id: pieceId,
      name: pieceId,
      cutCount: 1,
      grainDegrees: 90,
      contours: [
        {
          id: `${pieceId}-shell`,
          role: 'sewing-boundary' as const,
          closed: true as const,
          vertices: rings[pieceId].map((vertex, index) => ({
            id: vertex.id,
            positionMm: vertex.point,
            source: {
              sourceCurveId: vertex.sourceCurveId,
              parameterSpace: 'unit' as const,
              sourceCurveT: 0,
              normalizedArc: index / rings[pieceId].length,
            },
          })),
        },
      ],
    })),
    seams: [
      seam('seam-closing', 3, ['reverse', 'forward']),
      seam('seam-right', 1, ['forward', 'reverse']),
    ],
    operations: [
      {
        id: 'operation-120',
        stage: 4,
        order: 0,
        kind: 'stitch',
        seamIds: ['seam-closing', 'seam-right'],
      },
    ],
    materials: [
      { id: 'material-main', pieceIds: ['front', 'back'], materialRevision: 'material/7' },
    ],
  };
}

function physicalEdge(handoff: DxfAssemblyHandoffV1, side: DxfSeamSideV1) {
  const contour = handoff.pieces
    .find(({ id }) => id === side.pieceId)!
    .contours.find(({ id }) => id === side.contourId)!;
  const first = contour.vertices.findIndex(({ id }) => id === side.anchors[0]);
  const second = contour.vertices.findIndex(({ id }) => id === side.anchors[1]);
  const start = (first + 1) % contour.vertices.length === second ? first : second;
  return { contour, start, end: (start + 1) % contour.vertices.length };
}

function mapping(
  handoff: DxfAssemblyHandoffV1,
  seamIndex: number,
): PatternImportDxfTwoSidedSeamMappingV2 {
  const seam = handoff.seams[seamIndex];
  return {
    schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
    baseWitnessVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
    sourceBinding: {
      sourceFileId: SOURCE_FILE_ID,
      documentId: handoff.source.documentId,
      revision: handoff.source.revision,
      baseFinalCoordinateSha256: SELECTED_SHA,
      sourcePathCoordinateSha256: SOURCE_PATH_SHA,
      handoffCanonicalSha256: handoff.seal.canonicalSha256,
    },
    scope: { scopeId: 'main', pieceIds: ['front', 'back'] },
    seam: {
      id: seam.id,
      operationId: seam.operationId,
      mapping: 'equal',
      lengthRatio: 1,
      sides: seam.sides.map((side, sideIndex) => {
        const { contour, start, end } = physicalEdge(handoff, side);
        const directed = side.direction === 'forward' ? [start, end] : [end, start];
        const startPoint = contour.vertices[start].positionMm;
        const endPoint = contour.vertices[end].positionMm;
        return {
          sideIndex: sideIndex as 0 | 1,
          pieceId: side.pieceId,
          contourId: side.contourId,
          sourcePathId: PIECES.indexOf(side.pieceId as (typeof PIECES)[number]),
          authoredAnchors: [...side.anchors] as [string, string],
          direction: side.direction,
          reversed: side.direction === 'reverse',
          contourTraversal: 'increasing-index' as const,
          orderedSamples: directed.map((index, ordinal) => {
            const vertex = contour.vertices[index];
            return {
              ordinal,
              vertexId: vertex.id,
              sourceCurveId: vertex.source.sourceCurveId,
              parameterSpace: vertex.source.parameterSpace,
              sourceCurveT: vertex.source.sourceCurveT,
              contourNormalizedArc: vertex.source.normalizedArc,
              normalizedProgress: ordinal,
            };
          }),
          lengthMm: Math.hypot(endPoint[0] - startPoint[0], endPoint[1] - startPoint[1]),
          endpointResidualMm: 0,
        };
      }) as unknown as PatternImportDxfTwoSidedSeamMappingV2['seam']['sides'],
    },
    compatibility: {
      endpointToleranceMm: 1e-6,
      maximumEndpointResidualMm: 0,
      fullLengthToleranceMm: 1e-6,
      fullLengthToleranceRelative: 0,
      effectiveFullLengthToleranceMm: 1e-6,
      fullLengthResidualMm: 0,
      fullLengthResidualRelative: 0,
      endpointsCompatible: true,
      fullLengthsCompatible: true,
    },
  };
}

async function mappingSeal(
  value: PatternImportDxfTwoSidedSeamMappingV2,
): Promise<PatternImportDxfTwoSidedSeamMappingSealV2> {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
    algorithm: 'SHA-256',
    canonicalSha256: await digest('pattern-import-dxf-two-sided-seam-mapping-v2', value),
    sealedMappingVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
    authority: 'unsigned-in-memory-consistency-only',
    writerExportShaBound: false,
    trustedAuthorityIntegrated: false,
    productionReady: false,
  };
}

async function resealPhase1Request(
  request: Mutable<DxfProductPhase1BuildInputsRequestV1>,
): Promise<void> {
  const seals = await Promise.all(
    request.childMappings.map((child) =>
      mappingSeal(child as unknown as PatternImportDxfTwoSidedSeamMappingV2),
    ),
  );
  request.childSeals = seals as Mutable<PatternImportDxfTwoSidedSeamMappingSealV2>[];
  const ordered = request.childMappings
    .map((child, index) => ({ child, seal: seals[index] }))
    .sort((left, right) => (left.child.seam.id < right.child.seam.id ? -1 : 1));
  request.aggregate.seams = ordered.map(({ child }) => child.seam);
  request.aggregate.childSeals = ordered.map(({ child, seal }) => ({
    seamId: child.seam.id,
    mappingCanonicalSha256: seal.canonicalSha256,
    handoffCanonicalSha256: request.handoff.seal.canonicalSha256,
  }));
  request.aggregateSeal.canonicalSha256 = await digest(
    'pattern-import-dxf-two-seam-mapping-aggregate-v1',
    request.aggregate,
  );
}

async function genuineRequest(): Promise<DxfProductPhase2FreshBuildRequestV1> {
  const read = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
    { id: 'legacy', name: 'two-pieces.dxf', bytes: dxfBytes() },
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId: SOURCE_FILE_ID },
  );
  if (!read.ok) throw new Error(read.blockers[0].detail);
  const sourceSha256 = read.value.read.doc.file.sha256;
  const pathRecords = read.value.provenance.paths.slice(0, 2);
  const rings = Object.fromEntries(
    PIECES.map((pieceId, pieceIndex) => {
      const path = read.value.read.doc.pages[0].paths[pieceIndex];
      const record = pathRecords.find(({ pathId }) => pathId === path.id)!;
      return [
        pieceId,
        record.provenance.samples.map((sample, index) => ({
          id: sample.vertexId,
          point: [path.pts[index].x, path.pts[index].y] as const,
          sourceCurveId: sample.sourceCurveId,
          sourcePathId: path.id,
        })),
      ];
    }),
  ) as unknown as Rings;
  const carrier: DxfPipelineSourcePathArtifactV2 = {
    schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
    carrier: {
      schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
      sourceFileId: SOURCE_FILE_ID,
      pieces: PIECES.map((pieceId, index) => ({
        pieceId,
        sizeToken: 'M',
        contours: [
          {
            id: `${pieceId}-shell`,
            role: 'sewing-boundary',
            geometry: { kind: 'seam' },
            sourceVertices: pathRecords[index].provenance.samples.map(
              (sample, vertexIndex, all) => ({
                ...sample,
                normalizedArc: vertexIndex / all.length,
                sourcePathId: pathRecords[index].pathId,
              }),
            ),
          },
        ],
      })),
      upstreamBlockerCount: 0,
      productionReady: false,
      heuristicRecoveryUsed: false,
      pieceSpecWireIntegrated: false,
      includesRawDxf: false,
      includesTags: false,
      includesAst: false,
    },
    contentBinding: {
      schemaVersion: DXF_PIPELINE_CONTENT_BINDING_V2,
      algorithm: 'SHA-256',
      sourceFileId: SOURCE_FILE_ID,
      sourceSha256,
      baseContentBindingVersion: DXF_PIPELINE_CONTENT_BINDING_V1,
      baseSelectedGeometrySha256: SELECTED_SHA,
      selectedGeometryAndSourcePathSha256: SOURCE_PATH_SHA,
    },
    claims: {
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
    },
  };
  const native = await bindDxfProductPhaseDNativeStraightEdgesV3(read.value.owner, carrier, {
    sourceFileId: SOURCE_FILE_ID,
    sourceSha256,
    selectedGeometrySha256: SELECTED_SHA,
  });
  if (!native.ok) throw new Error(native.blockers[0].detail);
  const handoff = await buildDxfAssemblyHandoffV1(
    handoffCandidate(rings, HANDOFF_SOURCE_AGGREGATE_SHA),
  );
  if (!handoff.ok) throw new Error(handoff.errors.join('; '));
  const mappings = [mapping(handoff.value, 0), mapping(handoff.value, 1)] as const;
  const seals = (await Promise.all(mappings.map(mappingSeal))) as [
    PatternImportDxfTwoSidedSeamMappingSealV2,
    PatternImportDxfTwoSidedSeamMappingSealV2,
  ];
  const ordered = mappings
    .map((child, index) => ({ child, seal: seals[index] }))
    .sort((left, right) => (left.child.seam.id < right.child.seam.id ? -1 : 1));
  const aggregate: PatternImportDxfTwoSeamMappingAggregateV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1,
    childMappingVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
    sourceBinding: {
      sourceFileId: SOURCE_FILE_ID,
      documentId: handoff.value.source.documentId,
      revision: handoff.value.source.revision,
      baseFinalCoordinateSha256: SELECTED_SHA,
      sourcePathCoordinateSha256: SOURCE_PATH_SHA,
    },
    scope: { scopeId: 'main', pieceIds: ['back', 'front'] },
    operation: {
      id: 'operation-120',
      sourceOperationNumber: 120,
      stage: 4,
      order: 0,
      kind: 'stitch',
      seamIds: ['seam-closing', 'seam-right'],
    },
    seams: [ordered[0].child.seam, ordered[1].child.seam],
    childSeals: ordered.map(({ child, seal }) => ({
      seamId: child.seam.id,
      mappingCanonicalSha256: seal.canonicalSha256,
      handoffCanonicalSha256: handoff.value.seal.canonicalSha256,
    })) as unknown as PatternImportDxfTwoSeamMappingAggregateV1['childSeals'],
  };
  const aggregateSeal: PatternImportDxfTwoSeamMappingAggregateSealV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_SEAL_V1,
    algorithm: 'SHA-256',
    canonicalSha256: await digest('pattern-import-dxf-two-seam-mapping-aggregate-v1', aggregate),
    sealedAggregateVersion: PATTERN_IMPORT_DXF_TWO_SEAM_MAPPING_AGGREGATE_V1,
    childMappingVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
    authority: 'unsigned-in-memory-consistency-only',
    atomicTwoSeamAuthority: true,
    writerExportShaBound: false,
    trustedAuthorityIntegrated: false,
    productionReady: false,
  };
  return {
    schemaVersion: DXF_PRODUCT_PHASE2_FRESH_BUILD_REQUEST_V1,
    phase1Request: {
      schemaVersion: DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1,
      handoff: handoff.value,
      aggregate,
      aggregateSeal,
      childMappings: [...mappings],
      childSeals: seals,
    },
    phaseDNativeStraightEdgeOwner: native.owner,
    zeroAllowanceCutSurfaceEquivalenceOwner: null,
    targetEdgeMm: 50,
    documentIdentity: {
      techCardId: 120,
      scopeKey: 'main',
      patternLineKey: 'pattern-line-main',
      patternVersion: 7,
      cardLockVersion: 11,
      importGeneration: 3,
      sourceFileId: SOURCE_FILE_ID,
      sourceFileSha256: sourceSha256,
      handoffSourceAggregateSha256: handoff.value.source.sourceSha256,
      selectedGeometrySha256: SELECTED_SHA,
      documentId: handoff.value.source.documentId,
      revision: handoff.value.source.revision,
      sizeToken: 'M',
      pieceIds: ['front', 'back'],
      dxfSha256: EXPORT_SHA,
    },
  };
}

describe('DXF product Phase-2 fresh-build owner V1', () => {
  it('fresh-builds the canonical closing/reverse two-seam garment twice with eight pinned CDT calls', async () => {
    const result = await buildDxfProductPhase2FreshBuildOwnerV1(await genuineRequest());

    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    expect(result.ok).toBe(true);
    expect(result.snapshot).toMatchObject({
      pieceCount: 2,
      seamCount: 2,
      nativeBoundaryEdgeCount: 8,
      buildCount: 2,
      phase1BaselineTriangulationCount: 4,
      phase2BoundarySamplingCount: 4,
      cdt2dInvocationCount: 8,
      claims: {
        phase1FreshRebuiltTwice: true,
        phase2FreshRebuiltTwice: true,
        reverseSeamTraversalSupported: true,
        reverseContourNativeSamplingIntegrated: false,
        documentRowChronologyAuthenticated: false,
        sourceAuthenticityAccepted: false,
        productionReady: false,
      },
    });
    expect(result.snapshot).not.toHaveProperty('identity');
    expect(result.snapshot.documentIdentitySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.snapshot.blockers).toContain('document-row-chronology-not-authenticated');

    const first = projectDxfProductPhase2FreshBuildOwnerV1(result.owner);
    const second = projectDxfProductPhase2FreshBuildOwnerV1(result.owner);
    expect(first?.mesh.seams).toHaveLength(2);
    expect(first?.mesh.restPositions2Mm).not.toBe(second?.mesh.restPositions2Mm);
    if (!first || !second) throw new Error('expected projection');
    const retained = second.mesh.restPositions2Mm[0];
    first.mesh.restPositions2Mm[0] = retained + 123;
    expect(projectDxfProductPhase2FreshBuildOwnerV1(result.owner)?.mesh.restPositions2Mm[0]).toBe(
      retained,
    );
    expect(disposeDxfProductPhase2FreshBuildOwnerV1(result.owner)).toBe(true);
    expect(disposeDxfProductPhase2FreshBuildOwnerV1(result.owner)).toBe(false);
    expect(projectDxfProductPhase2FreshBuildOwnerV1(result.owner)).toBeNull();
    expect(first.mesh.restPositions2Mm[0]).toBe(retained + 123);
  });

  it('retains distinct saved-document and native-source identities and rejects either swap', async () => {
    const acceptedRequest = await genuineRequest();
    expect(acceptedRequest.documentIdentity).toMatchObject({
      documentId: ASSEMBLY_DOCUMENT_ID,
      sourceFileId: SOURCE_FILE_ID,
    });
    const accepted = await buildDxfProductPhase2FreshBuildOwnerV1(acceptedRequest);
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.blockers));
    expect(accepted.snapshot.phase2SourceBinding).toMatchObject({
      assemblyDocumentId: ASSEMBLY_DOCUMENT_ID,
      samplingSourceFileId: SOURCE_FILE_ID,
      assemblyDocumentIdBound: true,
      samplingSourceFileIdBound: true,
      dualIdentityBound: true,
      documentIdMatch: false,
    });

    const expectIdentityBlocked = async (
      documentIdentity: DxfProductPhase2FreshBuildRequestV1['documentIdentity'],
      original: DxfProductPhase2FreshBuildRequestV1,
    ) => {
      await expect(
        buildDxfProductPhase2FreshBuildOwnerV1({ ...original, documentIdentity }),
      ).resolves.toMatchObject({
        ok: false,
        owner: null,
        snapshot: null,
        blockers: [{ code: 'native-edge-binding-mismatch' }],
      });
    };

    const documentTamper = await genuineRequest();
    await expectIdentityBlocked(
      { ...documentTamper.documentIdentity, documentId: SOURCE_FILE_ID },
      documentTamper,
    );
    const sourceTamper = await genuineRequest();
    await expectIdentityBlocked(
      { ...sourceTamper.documentIdentity, sourceFileId: ASSEMBLY_DOCUMENT_ID },
      sourceTamper,
    );
    const crossSwap = await genuineRequest();
    await expectIdentityBlocked(
      {
        ...crossSwap.documentIdentity,
        documentId: SOURCE_FILE_ID,
        sourceFileId: ASSEMBLY_DOCUMENT_ID,
      },
      crossSwap,
    );
  });

  it('is deterministic across two genuine independent native owners', async () => {
    const first = await buildDxfProductPhase2FreshBuildOwnerV1(await genuineRequest());
    const second = await buildDxfProductPhase2FreshBuildOwnerV1(await genuineRequest());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.snapshot.artifactSha256).toBe(second.snapshot.artifactSha256);
    expect(first.snapshot.deterministicFingerprint).toBe(second.snapshot.deterministicFingerprint);
    expect(first.snapshot.seal).toEqual(second.snapshot.seal);
  });

  it('rejects forged and stale V3 owners without publishing partial authority', async () => {
    const forged = await genuineRequest();
    const stale = await genuineRequest();
    consumeDxfProductPhaseDNativeStraightEdgesV3(stale.phaseDNativeStraightEdgeOwner, {
      sourceFileId: stale.documentIdentity.sourceFileId,
      sourceSha256: stale.documentIdentity.sourceFileSha256,
      selectedGeometrySha256: stale.documentIdentity.selectedGeometrySha256,
    });

    await expect(
      buildDxfProductPhase2FreshBuildOwnerV1({
        ...forged,
        phaseDNativeStraightEdgeOwner: {
          version: 'dxf-product-phase-d-native-straight-edges-owner/3',
          opaque: 'module-private-weak-owner',
        } as DxfProductPhaseDNativeStraightEdgesOwnerV3,
      }),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'forged-or-stale-native-edge-owner' }],
    });
    await expect(buildDxfProductPhase2FreshBuildOwnerV1(stale)).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'forged-or-stale-native-edge-owner' }],
    });
  });

  it('rejects native edge coverage drift after consuming the exact-bound V3 owner', async () => {
    const original = await genuineRequest();
    const value: DxfProductPhase2FreshBuildRequestV1 = {
      ...original,
      documentIdentity: { ...original.documentIdentity, sizeToken: 'L' },
    };

    await expect(buildDxfProductPhase2FreshBuildOwnerV1(value)).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'native-edge-coverage-mismatch' }],
    });
  });

  it('blocks coherently resealed source-path hash and seam occurrence PathId drift before CDT', async () => {
    const pathIdOriginal = await genuineRequest();
    const pathIdPhase1 = structuredClone(
      pathIdOriginal.phase1Request,
    ) as unknown as Mutable<DxfProductPhase1BuildInputsRequestV1>;
    const driftedSide = pathIdPhase1.childMappings[0].seam.sides[0];
    driftedSide.sourcePathId += 100;
    const aggregateSeam = pathIdPhase1.aggregate.seams.find(
      ({ id }) => id === pathIdPhase1.childMappings[0].seam.id,
    );
    if (!aggregateSeam) throw new Error('expected aggregate seam');
    aggregateSeam.sides[0].sourcePathId = driftedSide.sourcePathId;
    await resealPhase1Request(pathIdPhase1);

    await expect(
      buildDxfProductPhase2FreshBuildOwnerV1({
        ...pathIdOriginal,
        phase1Request: pathIdPhase1,
      }),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'native-edge-binding-mismatch' }],
    });

    const pathHashOriginal = await genuineRequest();
    const pathHashPhase1 = structuredClone(
      pathHashOriginal.phase1Request,
    ) as unknown as Mutable<DxfProductPhase1BuildInputsRequestV1>;
    const driftedPathSha256 = '9'.repeat(64);
    pathHashPhase1.aggregate.sourceBinding.sourcePathCoordinateSha256 = driftedPathSha256;
    for (const child of pathHashPhase1.childMappings)
      child.sourceBinding.sourcePathCoordinateSha256 = driftedPathSha256;
    await resealPhase1Request(pathHashPhase1);

    await expect(
      buildDxfProductPhase2FreshBuildOwnerV1({
        ...pathHashOriginal,
        phase1Request: pathHashPhase1,
      }),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'native-edge-binding-mismatch' }],
    });
  });

  it('blocks coherently resealed boundary normalizedArc drift from genuine V3 provenance', async () => {
    const original = await genuineRequest();
    const phase1 = structuredClone(
      original.phase1Request,
    ) as unknown as Mutable<DxfProductPhase1BuildInputsRequestV1>;
    const rebuiltCandidate: Mutable<DxfAssemblyHandoffCandidateV1> = {
      schemaVersion: phase1.handoff.schemaVersion,
      source: phase1.handoff.source,
      physicalSurface: phase1.handoff.physicalSurface,
      pieces: phase1.handoff.pieces,
      seams: phase1.handoff.seams,
      operations: phase1.handoff.operations,
      materials: phase1.handoff.materials,
    };
    const driftedVertex = rebuiltCandidate.pieces[0].contours[0].vertices[1];
    driftedVertex.source.normalizedArc += 0.01;
    const rebuilt = await buildDxfAssemblyHandoffV1(
      rebuiltCandidate as unknown as DxfAssemblyHandoffCandidateV1,
    );
    if (!rebuilt.ok) throw new Error(rebuilt.errors.join('; '));
    phase1.handoff = rebuilt.value as unknown as Mutable<DxfAssemblyHandoffV1>;
    for (const child of phase1.childMappings) {
      child.sourceBinding.handoffCanonicalSha256 = rebuilt.value.seal.canonicalSha256;
      for (const side of child.seam.sides) {
        const sample = side.orderedSamples.find(({ vertexId }) => vertexId === driftedVertex.id);
        if (sample) sample.contourNormalizedArc = driftedVertex.source.normalizedArc;
      }
    }
    await resealPhase1Request(phase1);

    await expect(
      buildDxfProductPhase2FreshBuildOwnerV1({ ...original, phase1Request: phase1 }),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'native-edge-binding-mismatch' }],
    });
  });

  it('blocks excessive boundary refinement before any Phase-2 build is published', async () => {
    const original = await genuineRequest();
    const value: DxfProductPhase2FreshBuildRequestV1 = {
      ...original,
      targetEdgeMm: 0.001,
    };

    await expect(buildDxfProductPhase2FreshBuildOwnerV1(value)).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'phase2-refinement-bound-exceeded' }],
    });
  });

  it('applies the product-local per-edge budget before the generic sampler ceiling and before CDT', async () => {
    const canonicalEdgeLengthMm = 100;
    const targetEdgeMm = 0.5;
    const canonicalBoundaryEdgeCount = 8;
    const segmentsPerEdge = Math.ceil(canonicalEdgeLengthMm / targetEdgeMm);
    expect(segmentsPerEdge).toBe(200);
    expect(segmentsPerEdge).toBeGreaterThan(
      DXF_PRODUCT_PHASE2_FRESH_BUILD_LIMITS_V1.maximumSamplesPerEdge,
    );
    expect(segmentsPerEdge).toBeLessThan(PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumSamplesPerEdge);
    expect(segmentsPerEdge * canonicalBoundaryEdgeCount).toBeLessThan(
      PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumSampledBoundaryVertices,
    );

    const request = await genuineRequest();
    await expect(
      buildDxfProductPhase2FreshBuildOwnerV1({ ...request, targetEdgeMm }),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'phase2-refinement-bound-exceeded' }],
      claims: { pinnedCdt2dInvocationCount: 0 },
    });
  });

  it('detaches before the first await and never invokes hostile request accessors', async () => {
    const request = (await genuineRequest()) as unknown as {
      documentIdentity: { sizeToken: string };
    } & DxfProductPhase2FreshBuildRequestV1;
    const pending = buildDxfProductPhase2FreshBuildOwnerV1(request);
    request.documentIdentity.sizeToken = 'hostile-after-call';
    await expect(pending).resolves.toMatchObject({ ok: true });

    const getter = vi.fn();
    const hostile = Object.defineProperties(
      {},
      {
        schemaVersion: { enumerable: true, value: DXF_PRODUCT_PHASE2_FRESH_BUILD_REQUEST_V1 },
        phase1Request: { enumerable: true, get: getter },
        phaseDNativeStraightEdgeOwner: { enumerable: true, value: {} },
        zeroAllowanceCutSurfaceEquivalenceOwner: { enumerable: true, value: null },
        targetEdgeMm: { enumerable: true, value: 50 },
        documentIdentity: { enumerable: true, value: {} },
      },
    );
    await expect(buildDxfProductPhase2FreshBuildOwnerV1(hostile)).resolves.toMatchObject({
      ok: false,
      owner: null,
      blockers: [{ code: 'invalid-input' }],
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it('cancels before consume or between independent builds and publishes no owner', async () => {
    const beforeConsume = await genuineRequest();
    await expect(
      buildDxfProductPhase2FreshBuildOwnerV1(beforeConsume, { signal: { aborted: true } }),
    ).resolves.toMatchObject({ ok: false, owner: null, blockers: [{ code: 'cancelled' }] });
    await expect(buildDxfProductPhase2FreshBuildOwnerV1(beforeConsume)).resolves.toMatchObject({
      ok: true,
    });

    const between = await genuineRequest();
    let reads = 0;
    const signal = Object.defineProperty({}, 'aborted', {
      get: () => {
        reads += 1;
        return reads >= 4;
      },
    }) as Pick<AbortSignal, 'aborted'>;
    await expect(
      buildDxfProductPhase2FreshBuildOwnerV1(between, { signal }),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'cancelled' }],
    });
    expect(reads).toBe(4);
  });
});
