import { describe, expect, it, vi } from 'vitest';

import { readDxfWithPathProvenanceV1 } from '../../pattern-import/adapters/dxf/extract';
import {
  createDxfPieceSpecProvenanceSourceV1,
  type DxfPieceSpecContourBoundaryV1,
} from '../../pattern-import/dxf-piece-spec-provenance-bridge-v1';
import {
  attachDxfPipelineContentBindingV1,
  bridgeDxfPipelineProvenanceV1,
  computeDxfPipelineContentBindingV1,
  DXF_PIPELINE_CONTENT_BINDING_V1,
} from '../../pattern-import/dxf-pipeline-provenance-v1';
import {
  DXF_PIPELINE_CONTENT_BINDING_V2,
  DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
  type DxfPipelineSourcePathArtifactV2,
} from '../../pattern-import/dxf-pipeline-source-path-carrier-v2';
import { buildDxfProductPhaseDReplayV1 } from '../../pattern-import/dxf-product-phase-d-replay-v1';
import { selectDxfProductPhaseDSizeV1 } from '../../pattern-import/dxf-product-phase-d-size-selection-v1';
import { readDxfWithSourceNativeStraightEdgeAuthorityV1 } from '../../pattern-import/dxf-source-native-straight-edge-authority-v1';
import {
  buildPatternImportDxfProductPhaseEMultiseamChoicesV2,
  createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  proposePatternImportDxfProductPhaseEMultiseamAssemblyV2,
  type PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from '../../pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type CardDraft,
  type DraftScopeTarget,
  type ManifestSource,
  type PieceSizeSpec,
  type PieceSpec,
  type PtMm,
  type WriteJob,
} from '../../pattern-import/types';
import { writeDxfDetailed } from '../../pattern-import/write';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  bindDxfProductPhaseDNativeStraightEdgesV3,
  consumeDxfProductPhaseDNativeStraightEdgesV3,
} from './dxf-product-phase-d-native-straight-edge-binding-v1';
import { DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1 } from './dxf-product-phase1-build-inputs-v1';
import { createDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1 } from './dxf-product-zero-allowance-cut-surface-equivalence-v1';
import { PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1 } from './pattern-import-dxf-two-sided-seam-mapping-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  type PatternImportDxfTwoSidedSeamMappingSealV2,
  type PatternImportDxfTwoSidedSeamMappingV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2,
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V2,
  buildPatternImportDxfProductGarmentMeshComposerV2,
  disposePatternImportDxfProductGarmentMeshComposerV2,
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerRequestV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';

const sourceFileId = 'product/source-file';
const createdAt = '2026-11-14T10:00:00.000Z';

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Entry)[]
    ? Mutable<Entry>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

function bytes(): ArrayBuffer {
  const polyline = (handle: string, x: number) =>
    `0\nLWPOLYLINE\n5\n${handle}\n8\n1\n90\n4\n70\n1\n10\n${x}\n20\n0\n10\n${x + 100}\n20\n0\n10\n${x + 100}\n20\n100\n10\n${x}\n20\n100`;
  return new TextEncoder().encode(
    `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${polyline('F1', 0)}\n${polyline('B1', 200)}\n0\nENDSEC\n0\nEOF\n`,
  ).buffer as ArrayBuffer;
}

function clonePoints(points: readonly Readonly<PtMm>[]): PtMm[] {
  return points.map(({ x, y }) => ({ x, y }));
}

function pieceSize(points: readonly Readonly<PtMm>[]): PieceSizeSpec {
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    rank: 0,
    sizeToken: 'M',
    sizeId: 7,
    cut: clonePoints(points),
    seam: clonePoints(points),
    grain: {
      kind: 'grain',
      origin: 'operator',
      ranges: [],
      confidence: 1,
      a: { x: (minX + maxX) / 2, y: minY + 10 },
      b: { x: (minX + maxX) / 2, y: maxY - 10 },
      angleDeg: 90,
      evidence: ['operator'],
    },
    notches: [],
    drills: [],
    internal: [],
    fold: null,
    offset: null,
    walls: [],
    bbox: { minX, minY, maxX, maxY },
    areaMm2: (maxX - minX) * (maxY - minY),
  };
}

function piece(identity: 'FRONT' | 'BACK', points: readonly Readonly<PtMm>[]): PieceSpec {
  return {
    identity,
    code: identity,
    mods: [],
    displayName: identity,
    nameOrigin: 'operator',
    seed: identity === 'FRONT' ? 1 : 2,
    variant: null,
    pairHand: null,
    pairOf: null,
    unfoldedFold: false,
    piecesPerGarment: 1,
    allowance: { meaning: 'both', allowanceMm: 0, origin: 'operator', evidence: ['fixture'] },
    fabrics: ['main'],
    fused: false,
    ungraded: false,
    sizes: [pieceSize(points)],
  };
}

function job(pieces: readonly PieceSpec[], sourceSha256: string): WriteJob {
  const scope: DraftScopeTarget = {
    scopeKey: 'main',
    fabricPurpose: 'main',
    bomLineKey: 'bom-main',
    label: 'Main',
    isInterlining: false,
  };
  const source: ManifestSource = {
    files: [{ name: 'two-panels.dxf', sha256: sourceSha256, bytes: 256, kind: 'dxf', pages: 1 }],
    scale: { method: 'declared', factor: 1, measuredMm: null, declaredMm: 100 },
    sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
    sizeEncoding: 'single',
    variant: null,
  };
  return {
    techCardId: 120,
    scope,
    pieces: pieces.map((value) => structuredClone(value)),
    sizes: [{ token: 'M', sizeId: 7, name: 'Medium', sourceLabel: 'M', rank: 0 }],
    source,
    generator: 'c6-canonical-test',
    dialect: 'r12',
  };
}

async function shaText(value: string): Promise<string> {
  const result = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function freeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => freeze(child, seen));
  return Object.freeze(value);
}

function catalogFromSelection(
  selection: Extract<Awaited<ReturnType<typeof selectDxfProductPhaseDSizeV1>>, { ok: true }>,
): PatternImportDxfProductPhaseEAuthoringCatalogV1 {
  const carrier = selection.pipeline.carrier;
  if (!carrier) throw new Error('selected carrier missing');
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
    techCardId: 120,
    scopeKey: 'main',
    sizeToken: 'M',
    sourceFileId,
    sizeSelectionCanonicalSha256: selection.selection.canonicalSha256,
    pieces: carrier.pieces.map((carried) => ({
      pieceId: carried.pieceId,
      pieceLineKey: carried.pieceId === 'FRONT' ? 'piece-front' : 'piece-back',
      contours: carried.contours.map((contour) => {
        const selected = selection.phaseD.contours.find(
          (candidate) =>
            candidate.pieceId === carried.pieceId &&
            candidate.sizeToken === carried.sizeToken &&
            candidate.contourId === contour.id,
        );
        if (!selected) throw new Error('selected contour missing');
        return {
          contourId: contour.id,
          role: contour.role,
          geometry:
            contour.geometry.kind === 'cut-loop'
              ? { kind: contour.geometry.kind, index: contour.geometry.index }
              : { kind: contour.geometry.kind },
          closed: selected.closed,
          boundaryVertices: contour.sourceVertices.map(({ vertexId, normalizedArc }, ordinal) => ({
            ordinal,
            vertexId,
            normalizedArc,
          })),
        };
      }),
    })),
    requiredExplicitFields: [
      'documentId-and-revision',
      'physical-surface',
      'two-seam-sides-and-anchor-ranges',
      'side-directions',
      'mapping-and-length-ratio',
      'operation-stage-and-order',
      'immutable-material-revisions',
      'tolerances',
    ],
    canonicalSha256: '0'.repeat(64),
    geometryCoordinatesExposed: false,
    rawDxfExposed: false,
    assemblyInferred: false,
    productionReady: false,
  };
}

function boundaryIds(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  pieceId: 'FRONT' | 'BACK',
) {
  const values = catalog.pieces.find(({ pieceId: id }) => id === pieceId)?.contours[0]
    ?.boundaryVertices;
  if (!values || values.length !== 4) throw new Error('expected four boundary vertices');
  return values.map(({ vertexId }) => vertexId) as [string, string, string, string];
}

function anchor(pieceLineKey: string, edgeHint: string) {
  return {
    pieceLineKey,
    edgeHint,
    range: [0, 1] as const,
    lenMm: 100,
    contourSig: `${pieceLineKey}:${edgeHint}`,
  };
}

type C6SurfaceFixtureOptions = Readonly<{
  physicalSurface?: 'sewing-surface' | 'cut-surface';
  allowanceMm?: number;
  seamGeometry?: 'equal' | 'missing' | 'drifted' | 'reversed';
}>;

async function compositionFixture(
  generation: number,
  options: C6SurfaceFixtureOptions = {},
): Promise<{
  request: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  nativeRead: Extract<
    Awaited<ReturnType<typeof readDxfWithSourceNativeStraightEdgeAuthorityV1>>,
    { ok: true }
  >;
}> {
  const inputBytes = bytes();
  const detailed = await readDxfWithPathProvenanceV1(
    { id: 'legacy', name: 'two-panels.dxf', bytes: inputBytes },
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId },
  );
  if (!detailed.ok) throw new Error(detailed.blockers[0].detail);
  const nativeRead = await readDxfWithSourceNativeStraightEdgeAuthorityV1(
    { id: 'legacy-native', name: 'two-panels.dxf', bytes: inputBytes },
    { sagittaMm: 0.05, keepFills: true },
    { sourceFileId },
  );
  if (!nativeRead.ok) throw new Error(nativeRead.blockers[0].detail);
  const inputSourceSha256 = detailed.value.read.doc.file.sha256;
  const sourceResult = createDxfPieceSpecProvenanceSourceV1(detailed.value);
  if (!sourceResult.ok) throw new Error(sourceResult.blockers[0].detail);
  const source = sourceResult.value;
  const pieces = [
    piece('FRONT', source.paths[0].pointsMm),
    piece('BACK', source.paths[1].pointsMm),
  ];
  for (const candidate of pieces) {
    candidate.allowance.allowanceMm = options.allowanceMm ?? 0;
    const size = candidate.sizes[0];
    if (options.seamGeometry === 'missing') size.seam = null;
    else if (options.seamGeometry === 'drifted' && size.seam)
      size.seam[0] = { ...size.seam[0], x: size.seam[0].x + 0.001 };
    else if (options.seamGeometry === 'reversed' && size.seam) size.seam = [...size.seam].reverse();
  }
  const shellRole =
    options.physicalSurface === 'cut-surface'
      ? ('cut-boundary' as const)
      : ('sewing-boundary' as const);
  const contours: readonly DxfPieceSpecContourBoundaryV1[] = freeze(
    source.paths.map((path, index) => ({
      pieceId: index === 0 ? 'FRONT' : 'BACK',
      sizeToken: 'M',
      contourId: index === 0 ? 'front-shell' : 'back-shell',
      role: shellRole,
      geometry:
        shellRole === 'cut-boundary'
          ? ({ kind: 'cut' as const } as const)
          : ({ kind: 'seam' as const } as const),
      closed: true as const,
      pointsMm: clonePoints(path.pointsMm),
      lineage: {
        sourcePathIds: [path.pathId],
        uniformPositiveScale: 1,
        cyclicShift: 0,
        direction: 'forward' as const,
        mutations: [],
      },
    })),
  );
  const bare = bridgeDxfPipelineProvenanceV1(source, contours);
  if (!bare.pipelineIntegrated || !bare.carrier) throw new Error(JSON.stringify(bare.blockers));
  const binding = await computeDxfPipelineContentBindingV1(bare.carrier, pieces, inputSourceSha256);
  if (!binding.ok) throw new Error(binding.blocker.detail);
  const pipeline = attachDxfPipelineContentBindingV1(bare, binding.value);
  const replay = await buildDxfProductPhaseDReplayV1(source, contours, pieces, pipeline);
  const selection = await selectDxfProductPhaseDSizeV1({
    scopeKey: 'main',
    sizeToken: 'M',
    pieces,
    pipeline,
    replay,
  });
  if (!selection.ok) throw new Error(selection.blockers[0].detail);
  const unsignedCatalog = { ...catalogFromSelection(selection) };
  Reflect.deleteProperty(unsignedCatalog, 'canonicalSha256');
  const catalogSha = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
    unsignedCatalog,
    crypto,
  );
  if (!catalogSha) throw new Error('catalog SHA unavailable');
  const catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1 = {
    ...unsignedCatalog,
    canonicalSha256: catalogSha,
  };
  const front = boundaryIds(catalog, 'FRONT');
  const back = boundaryIds(catalog, 'BACK');
  const proposed = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(catalog, {
    selectedOperationNumber: 120,
    operations: [
      {
        authoringOperationId: null,
        number: 120,
        work: 'overlock_serge',
        phaseEKind: 'stitch',
        inputKeys: ['piece-front', 'piece-back'],
        outputUnitKey: 'shell',
        outputUnitName: 'SHELL',
        seamKeys: ['side-open', 'side-close'],
      },
    ],
    seams: [
      {
        seamKey: 'side-open',
        confirmed: true,
        stale: false,
        kind: 'edge',
        direction: 'reversed',
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'open')],
        sideB: [anchor('piece-back', 'open')],
      },
      {
        seamKey: 'side-close',
        confirmed: true,
        stale: false,
        kind: 'edge',
        direction: 'reversed',
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'closing')],
        sideB: [anchor('piece-back', 'closing')],
      },
    ],
  });
  if (!proposed.ok) throw new Error(proposed.blockers[0].detail);
  const initial = createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
    catalog,
    proposed.proposal,
    { documentId: sourceFileId, revision: 'revision-7' },
    generation,
  );
  const state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 = {
    ...initial,
    documentRevisionConfirmed: true,
    physicalSurface:
      options.physicalSurface === 'cut-surface'
        ? { mode: 'cut-surface', seamAllowancePhysical: true }
        : { mode: 'sewing-surface', seamAllowancePhysical: false },
    physicalSurfaceConfirmed: true,
    operationStage: 4,
    operationConfirmed: true,
    seams: [
      {
        seamId: 'side-open',
        mapping: 'equal',
        lengthRatio: 1,
        confirmed: true,
        sides: [
          {
            pieceId: 'FRONT',
            contourId: 'front-shell',
            boundaryVertexIds: [front[1], front[2]],
            direction: 'forward',
            confirmed: true,
          },
          {
            pieceId: 'BACK',
            contourId: 'back-shell',
            boundaryVertexIds: [back[2], back[1]],
            direction: 'reverse',
            confirmed: true,
          },
        ],
      },
      {
        seamId: 'side-close',
        mapping: 'equal',
        lengthRatio: 1,
        confirmed: true,
        sides: [
          {
            pieceId: 'FRONT',
            contourId: 'front-shell',
            boundaryVertexIds: [front[3], front[0]],
            direction: 'forward',
            confirmed: true,
          },
          {
            pieceId: 'BACK',
            contourId: 'back-shell',
            boundaryVertexIds: [back[0], back[3]],
            direction: 'reverse',
            confirmed: true,
          },
        ],
      },
    ],
    materialSelections: [
      { pieceId: 'FRONT', optionId: 'front-material', confirmed: true },
      { pieceId: 'BACK', optionId: 'back-material', confirmed: true },
    ],
    tolerance: {
      endpointMm: 0,
      fullLengthMm: 0.000001,
      fullLengthRelative: 0,
      confirmed: true,
    },
  };
  const choices = await buildPatternImportDxfProductPhaseEMultiseamChoicesV2(
    catalog,
    proposed.proposal,
    state,
    [
      { id: 'front-material', label: 'Front', materialRevision: 'cotton/front/r1' },
      { id: 'back-material', label: 'Back', materialRevision: 'cotton/back/r1' },
    ],
  );
  if (!choices.ok) throw new Error(choices.blockers[0].detail);
  const writeJob = job(pieces, inputSourceSha256);
  const detail = writeDxfDetailed(writeJob, { now: () => new Date(createdAt) });
  const draft: CardDraft = {
    techCardId: 120,
    scopes: [
      {
        target: writeJob.scope,
        filename: 'main.dxf',
        name: 'Main',
        dxfText: detail.dxfText,
        manifest: detail.manifest,
        writerReplay: {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
          job: writeJob,
          createdAt,
        },
        identities: ['FRONT', 'BACK'],
      },
    ],
    pieces: [],
    aliases: [],
    pieceUpdates: [],
    downloads: [],
  };
  const row = {
    techCardId: 120,
    scopeKey: 'main',
    patternLineKey: 'pattern:main',
    dxfSha256: await shaText(detail.dxfText),
    patternVersion: 7,
    cardLockVersion: 11,
  };
  return {
    request: {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
      draft,
      selection,
      catalog,
      proposal: proposed.proposal,
      choices: choices.choices,
      prepared: {
        importGeneration: generation,
        row: structuredClone(row),
        sizeSelectionSha256: selection.selection.canonicalSha256,
        catalogCanonicalSha256: catalog.canonicalSha256,
        proposalFingerprint: proposed.proposal.deterministicFingerprint,
        phaseEPlanSha256: choices.choices.aggregatePlanSeal.canonicalSha256,
        documentId: choices.choices.documentId,
        revision: choices.choices.revision,
      },
      current: { importGeneration: generation, row: structuredClone(row) },
    },
    nativeRead,
  };
}

function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function digest(domain: string, value: unknown): Promise<string> {
  return shaText(`${domain}\0${canonical(value)}`);
}

async function c6Fixture(
  generation = 1,
  options: C6SurfaceFixtureOptions = {},
): Promise<PatternImportDxfProductGarmentMeshComposerRequestV2> {
  const source = await compositionFixture(generation, options);
  const composition = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
    source.request,
  );
  if (!composition.ok) throw new Error(JSON.stringify(composition.blockers));
  const pathRecords = source.nativeRead.value.provenance.paths.slice(0, 2);
  const carrier: DxfPipelineSourcePathArtifactV2 = {
    schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
    carrier: {
      schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_V2,
      sourceFileId,
      pieces: composition.handoff.pieces.map((piece) => {
        const sourcePathId = composition.aggregate.seams[0].sides.find(
          ({ pieceId }) => pieceId === piece.id,
        )?.sourcePathId;
        const path = pathRecords.find(({ pathId }) => pathId === sourcePathId);
        if (!path) throw new Error(`missing native path for ${piece.id}`);
        return {
          pieceId: piece.id,
          sizeToken: 'M',
          contours: piece.contours.map((contour) => ({
            id: contour.id,
            role: contour.role,
            geometry:
              contour.role === 'cut-boundary'
                ? ({ kind: 'cut' as const } as const)
                : ({ kind: 'seam' as const } as const),
            sourceVertices: path.provenance.samples.map((sample, vertexIndex, all) => ({
              ...sample,
              normalizedArc: vertexIndex / all.length,
              sourcePathId: path.pathId,
            })),
          })),
        };
      }),
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
      sourceFileId,
      sourceSha256: source.nativeRead.value.read.doc.file.sha256,
      baseContentBindingVersion: DXF_PIPELINE_CONTENT_BINDING_V1,
      baseSelectedGeometrySha256: composition.aggregate.sourceBinding.baseFinalCoordinateSha256,
      selectedGeometryAndSourcePathSha256:
        composition.aggregate.sourceBinding.sourcePathCoordinateSha256,
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
  const native = await bindDxfProductPhaseDNativeStraightEdgesV3(
    source.nativeRead.value.owner,
    carrier,
    {
      sourceFileId,
      sourceSha256: source.nativeRead.value.read.doc.file.sha256,
      selectedGeometrySha256: composition.aggregate.sourceBinding.baseFinalCoordinateSha256,
    },
  );
  if (!native.ok) throw new Error(native.blockers[0].detail);
  const childMappings = composition.aggregate.seams.map(
    (seam): PatternImportDxfTwoSidedSeamMappingV2 => {
      const maximumLength = Math.max(...seam.sides.map(({ lengthMm }) => lengthMm));
      const tolerance = source.request.choices.tolerance;
      return {
        schemaVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
        baseWitnessVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V1,
        sourceBinding: {
          ...composition.aggregate.sourceBinding,
          handoffCanonicalSha256: composition.handoff.seal.canonicalSha256,
        },
        scope: composition.aggregate.scope,
        seam,
        compatibility: {
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
        },
      };
    },
  ) as [PatternImportDxfTwoSidedSeamMappingV2, PatternImportDxfTwoSidedSeamMappingV2];
  const childSeals = (await Promise.all(
    childMappings.map(
      async (mapping): Promise<PatternImportDxfTwoSidedSeamMappingSealV2> => ({
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
  )) as [PatternImportDxfTwoSidedSeamMappingSealV2, PatternImportDxfTwoSidedSeamMappingSealV2];
  const operation = composition.handoff.operations[0];
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V2,
    origin: 'fresh-import',
    compositionRequest: source.request,
    expected: {
      importGeneration: composition.evidence.importGeneration,
      savedRow: structuredClone(source.request.current.row),
      sourceFileId,
      documentId: source.request.choices.documentId,
      revision: source.request.choices.revision,
      sizeSelectionSha256: composition.evidence.sizeSelectionSha256,
      catalogCanonicalSha256: composition.evidence.catalogSha256,
      proposalFingerprint: composition.evidence.proposalFingerprint,
      phaseEPlanSha256: composition.evidence.phaseEPlanSha256,
      compositionCanonicalSha256: composition.compositionSeal.canonicalSha256,
      twoSeamMappingAggregateSha256: composition.aggregateSeal.canonicalSha256,
      handoffCanonicalSha256: composition.handoff.seal.canonicalSha256,
      pieceIds: composition.handoff.pieces.map(({ id }) => id).sort() as [string, string],
      seamIds: composition.handoff.seams.map(({ id }) => id).sort() as [string, string],
      operation: {
        id: operation.id,
        sourceOperationNumber: composition.evidence.sourceOperationNumber,
        stage: operation.stage,
        order: 0,
      },
    },
    phase1BuildInputsRequest: {
      schemaVersion: DXF_PRODUCT_PHASE1_BUILD_INPUTS_REQUEST_V1,
      handoff: composition.handoff,
      aggregate: composition.aggregate,
      aggregateSeal: composition.aggregateSeal,
      childMappings,
      childSeals,
    },
    phaseDNativeStraightEdgeOwner: native.owner,
    targetEdgeMm: 50,
  };
}

describe('product garment mesh composer V2', () => {
  it('builds canonical #120 through full composition, genuine V3, and exact eight-CDT Phase-2', async () => {
    const request = await c6Fixture();
    expect(request.phase1BuildInputsRequest.handoff.operations[0]).toMatchObject({
      order: 0,
      kind: 'stitch',
    });
    expect(request.expected.operation).toMatchObject({ sourceOperationNumber: 120, order: 0 });

    const result = await buildPatternImportDxfProductGarmentMeshComposerV2(request);
    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    expect(result.snapshot).toMatchObject({
      status: 'in-memory-product-mesh-authority-candidate',
      row: {
        techCardId: 120,
        importGeneration: 1,
        dxfSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      assembly: { sourceOperationNumber: 120, localOperationOrder: 0 },
      seals: {
        sourceFileSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        handoffSourceAggregateSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        productExportSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      mesh: { pieceCount: 2, seamCount: 2, cdt2dInvocationCount: 8 },
      claims: {
        deterministicMeshBuiltTwice: true,
        sourceNativeBound: true,
        rawDxfRetained: false,
        staticPreviewReady: false,
        placementReady: false,
        runtimeReady: false,
        persistenceIntegrated: false,
        savedRowPersistenceAuthority: false,
        productionReady: false,
      },
    });
    expect(JSON.stringify(result.snapshot)).not.toContain('SECTION');
    const first = projectPatternImportDxfProductGarmentMeshComposerV2(result.owner);
    const second = projectPatternImportDxfProductGarmentMeshComposerV2(result.owner);
    if (!first || !second) throw new Error('projection missing');
    expect(first.mesh.restPositions2Mm).not.toBe(second.mesh.restPositions2Mm);
    expect(first).toMatchObject({
      callerOwnedMutableCopies: true,
      staticPreviewAuthority: false,
      placementAuthority: false,
      runtimeAuthority: false,
      persistenceAuthority: false,
      productionAuthority: false,
    });
    const retained = second.mesh.restPositions2Mm[0];
    first.mesh.restPositions2Mm[0] = retained + 25;
    expect(
      projectPatternImportDxfProductGarmentMeshComposerV2(result.owner)?.mesh.restPositions2Mm[0],
    ).toBe(retained);
    expect(disposePatternImportDxfProductGarmentMeshComposerV2(result.owner)).toBe(true);
    expect(projectPatternImportDxfProductGarmentMeshComposerV2(result.owner)).toBeNull();
    expect(disposePatternImportDxfProductGarmentMeshComposerV2(result.owner)).toBe(false);
  });

  it('admits a cut shell through C6 closure only when cut and seam are zero-allowance equivalents', async () => {
    const request = await c6Fixture(1, { physicalSurface: 'cut-surface' });
    expect(request.compositionRequest.choices.physicalSurface).toEqual({
      mode: 'cut-surface',
      seamAllowancePhysical: true,
    });
    expect(
      request.compositionRequest.catalog.pieces.every((piece) =>
        piece.contours.every(({ role }) => role === 'cut-boundary'),
      ),
    ).toBe(true);

    const result = await buildPatternImportDxfProductGarmentMeshComposerV2(request);
    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    expect(result.snapshot.claims).toMatchObject({
      cutSurfaceAcceptedOnlyWithZeroAllowanceExactSeamEquivalence: true,
      sourceNativeBound: true,
      productionReady: false,
    });
    expect(
      PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_CLAIMS_V2.cutSurfaceAcceptedOnlyWithZeroAllowanceExactSeamEquivalence,
    ).toBe(true);
    expect(disposePatternImportDxfProductGarmentMeshComposerV2(result.owner)).toBe(true);
  });

  it('snapshots zero-allowance capability inputs without invoking accessors and bounds hostile graphs', async () => {
    const request = await c6Fixture(1, { physicalSurface: 'cut-surface' });
    const input = {
      compositionRequest: request.compositionRequest,
      handoff: request.phase1BuildInputsRequest.handoff,
    };
    await expect(
      createDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1(input),
    ).resolves.toMatchObject({ ok: true });

    const getter = vi.fn();
    const accessor = Object.defineProperties(
      {},
      {
        compositionRequest: { enumerable: true, get: getter },
        handoff: { enumerable: true, value: input.handoff },
      },
    );
    await expect(
      createDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1(accessor),
    ).resolves.toMatchObject({ ok: false, blockers: [{ code: 'invalid-input' }] });
    expect(getter).not.toHaveBeenCalled();

    const getTrap = vi.fn();
    const dataProxy = new Proxy(input, {
      get(target, property, receiver) {
        getTrap(property);
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(
      createDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1(dataProxy),
    ).resolves.toMatchObject({ ok: true });
    expect(getTrap).not.toHaveBeenCalled();

    const revoked = Proxy.revocable(input, {});
    revoked.revoke();
    await expect(
      createDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1(revoked.proxy),
    ).resolves.toMatchObject({ ok: false, blockers: [{ code: 'invalid-input' }] });

    const cyclic: Record<string, unknown> = { handoff: input.handoff };
    cyclic.compositionRequest = cyclic;
    await expect(
      createDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1(cyclic),
    ).resolves.toMatchObject({ ok: false, blockers: [{ code: 'invalid-input' }] });

    await expect(
      createDxfProductZeroAllowanceCutSurfaceEquivalenceOwnerV1({
        compositionRequest: new SharedArrayBuffer(8),
        handoff: input.handoff,
      }),
    ).resolves.toMatchObject({ ok: false, blockers: [{ code: 'invalid-input' }] });
  });

  it('rejects cut shells with physical allowance, missing seam, or any seam geometry drift', async () => {
    for (const options of [
      { physicalSurface: 'cut-surface' as const, allowanceMm: 1 },
      { physicalSurface: 'cut-surface' as const, seamGeometry: 'missing' as const },
      { physicalSurface: 'cut-surface' as const, seamGeometry: 'drifted' as const },
      { physicalSurface: 'cut-surface' as const, seamGeometry: 'reversed' as const },
    ]) {
      const result = await buildPatternImportDxfProductGarmentMeshComposerV2(
        await c6Fixture(1, options),
      );
      expect(result).toMatchObject({
        ok: false,
        owner: null,
        snapshot: null,
        blockers: [{ code: 'topology-unsupported' }],
      });
    }
  });

  it('rejects retained generation, saved-row, and composition-seal drift atomically', async () => {
    const generation =
      (await c6Fixture()) as unknown as Mutable<PatternImportDxfProductGarmentMeshComposerRequestV2>;
    generation.expected.importGeneration += 1;
    await expect(
      buildPatternImportDxfProductGarmentMeshComposerV2(generation),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'expected-binding-mismatch' }],
    });

    const row =
      (await c6Fixture()) as unknown as Mutable<PatternImportDxfProductGarmentMeshComposerRequestV2>;
    row.compositionRequest.current.row.patternVersion += 1;
    await expect(buildPatternImportDxfProductGarmentMeshComposerV2(row)).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'mapping-composition-blocked' }],
    });

    const seal =
      (await c6Fixture()) as unknown as Mutable<PatternImportDxfProductGarmentMeshComposerRequestV2>;
    seal.expected.compositionCanonicalSha256 = '0'.repeat(64);
    await expect(buildPatternImportDxfProductGarmentMeshComposerV2(seal)).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'expected-binding-mismatch' }],
    });
  });

  it('changes the fresh composition seal for equal geometry under a new import generation', async () => {
    const first = await c6Fixture(1);
    const second = await c6Fixture(2);

    expect(first.expected.importGeneration).toBe(1);
    expect(second.expected.importGeneration).toBe(2);
    expect(first.expected.compositionCanonicalSha256).not.toBe(
      second.expected.compositionCanonicalSha256,
    );
    const firstResult = await buildPatternImportDxfProductGarmentMeshComposerV2(first);
    const secondResult = await buildPatternImportDxfProductGarmentMeshComposerV2(second);
    if (!firstResult.ok || !secondResult.ok) throw new Error('expected both generation owners');
    expect(firstResult.snapshot.seal.canonicalSha256).not.toBe(
      secondResult.snapshot.seal.canonicalSha256,
    );
    disposePatternImportDxfProductGarmentMeshComposerV2(firstResult.owner);
    disposePatternImportDxfProductGarmentMeshComposerV2(secondResult.owner);
  });

  it('rejects a caller Phase-1 aggregate graph substitution before touching V3 authority', async () => {
    const original = await c6Fixture();
    const phase1 = structuredClone(original.phase1BuildInputsRequest) as unknown as Mutable<
      PatternImportDxfProductGarmentMeshComposerRequestV2['phase1BuildInputsRequest']
    >;
    phase1.aggregate.operation.stage += 1;

    await expect(
      buildPatternImportDxfProductGarmentMeshComposerV2({
        ...original,
        phase1BuildInputsRequest: phase1,
      }),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'phase1-request-binding-mismatch' }],
    });
  });

  it('publishes no owner for missing, forged, or stale V3 authority', async () => {
    const missing = await c6Fixture();
    const forged = await c6Fixture();
    const stale = await c6Fixture();
    consumeDxfProductPhaseDNativeStraightEdgesV3(stale.phaseDNativeStraightEdgeOwner, {
      sourceFileId,
      sourceSha256: stale.compositionRequest.current.row.dxfSha256,
      selectedGeometrySha256:
        stale.phase1BuildInputsRequest.aggregate.sourceBinding.baseFinalCoordinateSha256,
    });

    for (const request of [
      { ...missing, phaseDNativeStraightEdgeOwner: null },
      {
        ...forged,
        phaseDNativeStraightEdgeOwner: {
          version: 'dxf-product-phase-d-native-straight-edges-owner/3',
          opaque: 'module-private-weak-owner',
        },
      },
      stale,
    ]) {
      const result = await buildPatternImportDxfProductGarmentMeshComposerV2(request);
      expect(result).toMatchObject({
        ok: false,
        owner: null,
        snapshot: null,
        blockers: [{ code: 'phase2-fresh-build-blocked' }],
      });
      if (result.ok) throw new Error('expected V3 blocker');
      expect(result.blockers[0].detail).toContain('forged-or-stale-native-edge-owner');
    }
  });

  it('publishes nothing when the final composer seal fails after the nested mesh build', async () => {
    const request = await c6Fixture();
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    const rejectingCrypto = {
      subtle: {
        async digest(
          algorithm: Parameters<typeof realDigest>[0],
          data: Parameters<typeof realDigest>[1],
        ) {
          const bytes =
            data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          if (
            new TextDecoder()
              .decode(bytes.subarray(0, 80))
              .startsWith('pattern-import-dxf-product-garment-mesh-composer-v2\0')
          )
            throw new Error('final composer seal unavailable');
          return realDigest(algorithm, data);
        },
      } as SubtleCrypto,
    };

    await expect(
      buildPatternImportDxfProductGarmentMeshComposerV2(request, { crypto: rejectingCrypto }),
    ).resolves.toMatchObject({
      ok: false,
      owner: null,
      snapshot: null,
      blockers: [{ code: 'sha256-unavailable' }],
    });
    await expect(buildPatternImportDxfProductGarmentMeshComposerV2(request)).resolves.toMatchObject(
      {
        ok: false,
        owner: null,
        blockers: [{ code: 'phase2-fresh-build-blocked' }],
      },
    );
  });

  it('rejects hostile accessors without reading them and detaches before the first await', async () => {
    const getter = vi.fn();
    const hostile = Object.defineProperties(
      {},
      {
        schemaVersion: {
          enumerable: true,
          value: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V2,
        },
        origin: { enumerable: true, value: 'fresh-import' },
        compositionRequest: { enumerable: true, get: getter },
        expected: { enumerable: true, value: {} },
        phase1BuildInputsRequest: { enumerable: true, value: {} },
        phaseDNativeStraightEdgeOwner: { enumerable: true, value: {} },
        targetEdgeMm: { enumerable: true, value: 50 },
      },
    );
    await expect(buildPatternImportDxfProductGarmentMeshComposerV2(hostile)).resolves.toMatchObject(
      {
        ok: false,
        owner: null,
        blockers: [{ code: 'invalid-input' }],
      },
    );
    expect(getter).not.toHaveBeenCalled();

    const detached =
      (await c6Fixture()) as unknown as Mutable<PatternImportDxfProductGarmentMeshComposerRequestV2>;
    const pending = buildPatternImportDxfProductGarmentMeshComposerV2(detached);
    detached.expected.importGeneration = 999;
    detached.compositionRequest.current.importGeneration = 999;
    const detachedResult = await pending;
    expect(detachedResult).toMatchObject({ ok: true });
    if (detachedResult.ok)
      expect(disposePatternImportDxfProductGarmentMeshComposerV2(detachedResult.owner)).toBe(true);
  });

  it('never materializes or disposes projections from non-owners', () => {
    expect(projectPatternImportDxfProductGarmentMeshComposerV2({})).toBeNull();
    expect(disposePatternImportDxfProductGarmentMeshComposerV2({})).toBe(false);
  });
});
