import { describe, expect, it } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';

import { PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1 } from './callout-session-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
  buildPatternImportDxfProductCompositeSidecarV4,
  decodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductExactNSeamComponentV4,
} from './composite-sidecar-v4';
import {
  PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
  buildPatternImportDxfProductCompositeSidecarV5,
  decodePatternImportDxfProductCompositeSidecarV5,
  derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1,
  encodePatternImportDxfPhaseETopologyAnnotationsV1,
  encodePatternImportDxfProductCompositeSidecarV5,
  readPatternImportDxfProductCompositeComponentBytesV5,
  restorePatternImportDxfPhaseETopologyAnnotationsV5,
} from './composite-sidecar-v5';
import {
  buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2,
  type PatternImportDxfPhaseEExactNSeamConsistencyResultV2,
} from './exact-n-seam-consistency-carrier-v2';
import {
  PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
  type PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2,
} from './exact-n-seam-authority-gap-v2';

const hash = (character: string): string => character.repeat(64);

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

const bytesOf = (value: unknown): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(canonical(value));

const bindings: PatternImportDxfProductCompositeSidecarBindingsV3 = {
  row: {
    techCardId: 11,
    scopeKey: 'fabric:main',
    patternLineKey: 'pattern:main',
    revision: 8,
    cardLockVersion: 301,
    url: 'https://media.example.invalid/pants.dxf',
    sizeBytes: 42,
    sha256: hash('a'),
  },
  serverAssemblyRevision: 'assembly-revision:91',
  assemblyTopologySha256: hash('b'),
};

function semanticDocument() {
  const sample = (ordinal: number, progress: number) => ({
    ordinal,
    vertexId: `vertex-${ordinal}`,
    sourceCurveId: 'curve-1',
    parameterSpace: 'unit',
    sourceCurveT: progress,
    contourNormalizedArc: progress,
    normalizedProgress: progress,
  });
  const side = (sideIndex: 0 | 1, pieceId: string) => ({
    sideIndex,
    pieceId,
    contourId: `${pieceId}-contour`,
    sourcePathId: sideIndex + 1,
    authoredAnchors: [`${pieceId}-start`, `${pieceId}-end`],
    direction: sideIndex === 0 ? 'forward' : 'reverse',
    reversed: sideIndex === 1,
    contourTraversal: 'increasing-index',
    orderedSamples: [sample(0, 0), sample(1, 1)],
    lengthMm: 100,
    endpointResidualMm: 0,
  });
  return {
    schemaVersion: 'pattern-import-dxf-product-semantic-sidecar-document/1',
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
    encoding: 'canonical-json-utf8',
    product: {
      writerReceiptVersion: 'pattern-import-dxf-product-writer-replay-receipt/1',
      writerId: 'grbpwr.pattern-import.writeDxfDetailed',
      writerDialect: 'r12',
      format: 'AAMA-DXF-AC1009',
      scopeKey: bindings.row.scopeKey,
      exportSha256: bindings.row.sha256,
      byteLength: bindings.row.sizeBytes,
      phaseEPlanSha256: hash('c'),
      sizeSelectionSha256: hash('d'),
      mappingCompositionSealSha256: hash('e'),
    },
    mapping: {
      version: 'pattern-import-dxf-two-sided-seam-mapping/2',
      sealSha256: hash('f'),
      artifact: {
        schemaVersion: 'pattern-import-dxf-two-sided-seam-mapping/2',
        baseWitnessVersion: 'pattern-import-dxf-two-sided-seam-mapping/1',
        sourceBinding: {
          sourceFileId: 'source-file',
          documentId: 'document',
          revision: 'r1',
          baseFinalCoordinateSha256: hash('1'),
          sourcePathCoordinateSha256: hash('2'),
          handoffCanonicalSha256: hash('3'),
        },
        scope: { scopeId: bindings.row.scopeKey, pieceIds: ['front', 'back'] },
        seam: {
          id: 'left',
          operationId: 'operation-1',
          mapping: 'equal',
          lengthRatio: 1,
          sides: [side(0, 'front'), side(1, 'back')],
        },
        compatibility: {
          endpointToleranceMm: 0.1,
          maximumEndpointResidualMm: 0,
          fullLengthToleranceMm: 0.1,
          fullLengthToleranceRelative: 0.01,
          effectiveFullLengthToleranceMm: 1,
          fullLengthResidualMm: 0,
          fullLengthResidualRelative: 0,
          endpointsCompatible: true,
          fullLengthsCompatible: true,
        },
      },
    },
    persistence: {
      receiptVersion: 'pattern-import-dxf-product-post-save-readback-receipt/1',
      receiptSealVersion: 'pattern-import-dxf-product-post-save-readback-seal/1',
      receiptSealSha256: hash('4'),
      card: {
        techCardId: bindings.row.techCardId,
        previousLockVersion: bindings.row.cardLockVersion - 1,
        observedLockVersion: bindings.row.cardLockVersion,
      },
      pattern: {
        lineKey: bindings.row.patternLineKey,
        url: bindings.row.url,
        scopeKey: bindings.row.scopeKey,
        sizeId: 0,
        version: 4,
        sha256: bindings.row.sha256,
      },
      pieceLineKeys: ['line:front', 'line:back'],
      aliases: [],
    },
  };
}

function candidate(): PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2 {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
    status: 'untrusted-authority-candidate',
    row: bindings.row,
    serverAssemblyRevision: bindings.serverAssemblyRevision,
    assemblyTopologySha256: bindings.assemblyTopologySha256,
    selectedOperation: {
      sourceOperationNumber: 120,
      authoringOperationId: 'operation:side-seams',
      localOperationOrder: 0,
      seamIds: ['seam:1'],
    },
    catalogCanonicalSha256: hash('5'),
    phaseEAggregatePlanSha256: hash('6'),
    sides: [
      {
        seamId: 'seam:1',
        sideIndex: 0,
        pieceLineKey: 'line:front',
        pieceId: 'piece:front',
        contourId: 'contour:front',
        boundaryVertexIds: ['vertex:front:0', 'vertex:front:1'],
        direction: 'forward',
      },
      {
        seamId: 'seam:1',
        sideIndex: 1,
        pieceLineKey: 'line:back',
        pieceId: 'piece:back',
        contourId: 'contour:back',
        boundaryVertexIds: ['vertex:back:0', 'vertex:back:1'],
        direction: 'reverse',
      },
    ],
  };
}

async function exactEnvelope(): Promise<
  Extract<PatternImportDxfPhaseEExactNSeamConsistencyResultV2, { ok: true }>
> {
  const built = await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(candidate());
  if (!built.ok) throw new Error(built.blockers[0].detail);
  return built;
}

async function v4Bytes(): Promise<Uint8Array<ArrayBuffer>> {
  const v3 = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings,
    expectedPreviousSidecarSha256: null,
    semanticProductV1Bytes: bytesOf(semanticDocument()),
    placementV2Bytes: null,
    exactTopologyBytes: null,
  });
  if (!v3.ok) throw new Error(v3.blockers[0].detail);
  const encodedV3 = encodePatternImportDxfProductCompositeSidecarV3(v3.owner);
  if (!encodedV3.ok) throw new Error('V3 fixture encode failed.');
  const exact = await exactEnvelope();
  const encodedExact = await encodePatternImportDxfProductExactNSeamComponentV4({
    carrier: exact.carrier,
    seal: exact.seal,
  });
  if (!encodedExact.ok) throw new Error(encodedExact.blocker.detail);
  const v4 = await buildPatternImportDxfProductCompositeSidecarV4({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
    bindings,
    expectedPreviousSidecarSha256: hash('7'),
    compositeV3Bytes: encodedV3.bytes,
    exactNSeamConsistencyBytes: encodedExact.bytes,
  });
  if (!v4.ok) throw new Error(v4.blockers[0].detail);
  const encodedV4 = encodePatternImportDxfProductCompositeSidecarV4(v4.owner);
  if (!encodedV4.ok) throw new Error('V4 fixture encode failed.');
  return encodedV4.bytes;
}

const source = {
  identity: 'phase-e-source|revision-19|sha-9',
  revision: 'revision-19',
  sha256: hash('9'),
};

const pointAnchor = {
  pieceId: 'piece:front',
  pieceLineKey: 'line:front',
  contourId: 'contour:front',
  vertexId: 'vertex:front:0',
  pointMm: { x: 12.5, y: 44.25 },
};

async function annotationBytes() {
  const encoded = await encodePatternImportDxfPhaseETopologyAnnotationsV1({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1,
    bindings: derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1(bindings, source),
    measurements: [
      {
        id: 'measurement:point:1',
        kind: 'point',
        anchors: [pointAnchor],
        valueMm: null,
        label: 'x 12.5 · y 44.3 mm',
      },
    ],
    callouts: [
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1,
        id: 'callout:1',
        anchor: pointAnchor,
        text: 'Align notch before sewing.',
      },
    ],
  });
  if (!encoded.ok) throw new Error(encoded.blocker.detail);
  return encoded.bytes;
}

async function builtV5() {
  const originalV4 = await v4Bytes();
  const built = await buildPatternImportDxfProductCompositeSidecarV5({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
    bindings,
    expectedPreviousSidecarSha256: hash('8'),
    compositeV4Bytes: originalV4,
    topologyAnnotationsBytes: await annotationBytes(),
  });
  if (!built.ok) throw new Error(built.blockers[0].detail);
  return { built, originalV4 };
}

describe('Composite V5 durable topology annotations', () => {
  it('preserves original V4 bytes exactly and restores exact annotations', async () => {
    const { built, originalV4 } = await builtV5();
    expect(
      readPatternImportDxfProductCompositeComponentBytesV5(built.owner, 'composite-v4'),
    ).toEqual(originalV4);
    expect(built.topologyAnnotations.measurements[0].anchors[0]).toEqual(pointAnchor);

    const encoded = encodePatternImportDxfProductCompositeSidecarV5(built.owner);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) throw new Error('fixture');
    const decoded = await decodePatternImportDxfProductCompositeSidecarV5(encoded.bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('fixture');
    expect(
      readPatternImportDxfProductCompositeComponentBytesV5(decoded.owner, 'composite-v4'),
    ).toEqual(originalV4);

    const restored = restorePatternImportDxfPhaseETopologyAnnotationsV5(decoded.owner, {
      bindings,
      sourceIdentity: source.identity,
      sourceRevision: source.revision,
      sourceSha256: source.sha256,
    });
    expect(restored).toMatchObject({
      ok: true,
      sourceIdentity: source.identity,
      measurements: [{ id: 'measurement:point:1', anchors: [{ vertexId: 'vertex:front:0' }] }],
      callouts: [{ id: 'callout:1', text: 'Align notch before sewing.' }],
    });
  });

  it('is not accepted by the V4 reader', async () => {
    const { built } = await builtV5();
    const encoded = encodePatternImportDxfProductCompositeSidecarV5(built.owner);
    if (!encoded.ok) throw new Error('fixture');
    const v4 = await decodePatternImportDxfProductCompositeSidecarV4(encoded.bytes);
    expect(v4).toMatchObject({ ok: false, blockers: [{ code: 'unsupported-schema' }] });
  });

  it('fails closed for stale source and saved-row authority', async () => {
    const { built } = await builtV5();
    expect(
      restorePatternImportDxfPhaseETopologyAnnotationsV5(built.owner, {
        bindings,
        sourceIdentity: source.identity,
        sourceRevision: 'revision-20',
        sourceSha256: source.sha256,
      }),
    ).toMatchObject({ ok: false, blockers: [{ code: 'stale-authority' }] });
    expect(
      restorePatternImportDxfPhaseETopologyAnnotationsV5(built.owner, {
        bindings: { ...bindings, row: { ...bindings.row, revision: bindings.row.revision + 1 } },
        sourceIdentity: source.identity,
        sourceRevision: source.revision,
        sourceSha256: source.sha256,
      }),
    ).toMatchObject({ ok: false, blockers: [{ code: 'stale-authority' }] });
  });

  it('rejects missing, corrupted and noncanonical annotation components', async () => {
    const { built } = await builtV5();
    const encoded = encodePatternImportDxfProductCompositeSidecarV5(built.owner);
    if (!encoded.ok) throw new Error('fixture');
    const parsed = JSON.parse(new TextDecoder().decode(encoded.bytes)) as Record<string, unknown>;
    const components = parsed.components as Array<Record<string, unknown>>;

    const missing = structuredClone(parsed);
    (missing.components as unknown[]).pop();
    expect(await decodePatternImportDxfProductCompositeSidecarV5(bytesOf(missing))).toMatchObject({
      ok: false,
      blockers: [{ code: 'component-order-mismatch' }],
    });

    const corrupted = structuredClone(parsed);
    ((corrupted.components as Array<Record<string, unknown>>)[1].base64 as string) = (
      components[1].base64 as string
    ).replace(/^./, 'A');
    expect(await decodePatternImportDxfProductCompositeSidecarV5(bytesOf(corrupted))).toMatchObject(
      { ok: false },
    );

    const annotations = await annotationBytes();
    const noncanonicalAnnotations = new TextEncoder().encode(
      `${JSON.stringify(JSON.parse(new TextDecoder().decode(annotations)))}\n`,
    );
    const rejected = await buildPatternImportDxfProductCompositeSidecarV5({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
      bindings,
      expectedPreviousSidecarSha256: hash('8'),
      compositeV4Bytes: await v4Bytes(),
      topologyAnnotationsBytes: noncanonicalAnnotations,
    });
    expect(rejected).toMatchObject({ ok: false, blockers: [{ code: 'noncanonical-bytes' }] });
  });

  it('does not expose an autosave or localStorage claim', async () => {
    const { built } = await builtV5();
    expect(built.claims).toMatchObject({ autosaveAllowed: false, localStorageAllowed: false });
    expect(encodePatternImportDxfProductCompositeSidecarV5({ ...built.owner })).toEqual({
      ok: false,
      code: 'invalid-owner',
      bytes: null,
    });
  });
});
