import { readDxfWithPathProvenanceV1 } from '../../pattern-import/adapters/dxf/extract';
import {
  createDxfPieceSpecProvenanceSourceV1,
  type DxfPieceSpecContourBoundaryV1,
} from '../../pattern-import/dxf-piece-spec-provenance-bridge-v1';
import {
  attachDxfPipelineContentBindingV1,
  bridgeDxfPipelineProvenanceV1,
  computeDxfPipelineContentBindingV1,
} from '../../pattern-import/dxf-pipeline-provenance-v1';
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
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  buildPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerRequestV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REQUEST_V1,
  buildPatternImportDxfProductGarmentMeshNativeIngressV1,
} from './pattern-import-dxf-product-garment-mesh-native-ingress-v1';

const sourceFileId = 'product/source-file';
const createdAt = '2026-11-14T10:00:00.000Z';

type ProductGarmentMeshFixtureGeometryV2 = 'square' | 'annular-sector';

export type PatternImportDxfProductAnnularSectorFixtureV1 = Readonly<{
  waistSlantRadiusMm: number;
  hemSlantRadiusMm: number;
  sectorSpanRad: number;
  arcSegmentCount: number;
  waistArcSegmentCount?: number;
  hemArcSegmentCount?: number;
  frontApexMm: readonly [number, number];
  backApexMm: readonly [number, number];
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_ANNULAR_SECTOR_FIXTURE_V1: PatternImportDxfProductAnnularSectorFixtureV1 =
  Object.freeze({
    waistSlantRadiusMm: 1_800,
    hemSlantRadiusMm: 2_000,
    sectorSpanRad: 0.2,
    arcSegmentCount: 32,
    frontApexMm: Object.freeze([0, 0] as const),
    backApexMm: Object.freeze([0, 0] as const),
  });

export const PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1: PatternImportDxfProductAnnularSectorFixtureV1 =
  Object.freeze({
    waistSlantRadiusMm: 700,
    hemSlantRadiusMm: 900,
    sectorSpanRad: 0.64,
    arcSegmentCount: 40,
    waistArcSegmentCount: 40,
    hemArcSegmentCount: 50,
    frontApexMm: Object.freeze([0, 0] as const),
    backApexMm: Object.freeze([0, 0] as const),
  });

function bytes(
  geometry: ProductGarmentMeshFixtureGeometryV2,
  annularFixture: PatternImportDxfProductAnnularSectorFixtureV1 = PATTERN_IMPORT_DXF_PRODUCT_ANNULAR_SECTOR_FIXTURE_V1,
): ArrayBuffer {
  if (geometry === 'annular-sector') {
    const fixture = annularFixture;
    const waistArcSegmentCount = fixture.waistArcSegmentCount ?? fixture.arcSegmentCount;
    const hemArcSegmentCount = fixture.hemArcSegmentCount ?? fixture.arcSegmentCount;
    const writerExact = (value: number) => Number(value.toFixed(6));
    const points = (apex: readonly [number, number], direction: 1 | -1) => {
      const point = (radiusMm: number, angleRad: number) =>
        [
          writerExact(apex[0] + direction * radiusMm * Math.cos(angleRad)),
          writerExact(apex[1] + direction * radiusMm * Math.sin(angleRad)),
        ] as const;
      const output: (readonly [number, number])[] = [
        point(fixture.waistSlantRadiusMm, 0),
        point(fixture.hemSlantRadiusMm, 0),
      ];
      for (let index = 1; index <= hemArcSegmentCount; index += 1) {
        output.push(
          point(fixture.hemSlantRadiusMm, (fixture.sectorSpanRad * index) / hemArcSegmentCount),
        );
      }
      output.push(point(fixture.waistSlantRadiusMm, fixture.sectorSpanRad));
      for (let index = 1; index < waistArcSegmentCount; index += 1) {
        output.push(
          point(
            fixture.waistSlantRadiusMm,
            fixture.sectorSpanRad * (1 - index / waistArcSegmentCount),
          ),
        );
      }
      return output;
    };
    const polyline = (handle: string, vertices: readonly (readonly [number, number])[]) =>
      `0\nLWPOLYLINE\n5\n${handle}\n8\n1\n90\n${vertices.length}\n70\n1\n${vertices
        .map(([x, y]) => `10\n${x}\n20\n${y}`)
        .join('\n')}`;
    return new TextEncoder().encode(
      `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${polyline(
        'F1',
        points(fixture.frontApexMm, 1),
      )}\n${polyline('B1', points(fixture.backApexMm, -1))}\n0\nENDSEC\n0\nEOF\n`,
    ).buffer as ArrayBuffer;
  }
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
  if (!values || values.length < 4) throw new Error('expected a bounded closed boundary');
  return values.map(({ vertexId }) => vertexId);
}

function anchor(pieceLineKey: string, edgeHint: string, lenMm = 100) {
  return {
    pieceLineKey,
    edgeHint,
    range: [0, 1] as const,
    lenMm,
    contourSig: `${pieceLineKey}:${edgeHint}`,
  };
}

async function compositionFixture(
  generation: number,
  geometry: ProductGarmentMeshFixtureGeometryV2 = 'square',
  annularFixture: PatternImportDxfProductAnnularSectorFixtureV1 = PATTERN_IMPORT_DXF_PRODUCT_ANNULAR_SECTOR_FIXTURE_V1,
): Promise<{
  request: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  nativeRead: Extract<
    Awaited<ReturnType<typeof readDxfWithSourceNativeStraightEdgeAuthorityV1>>,
    { ok: true }
  >;
}> {
  const inputBytes = bytes(geometry, annularFixture);
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
  const contours: readonly DxfPieceSpecContourBoundaryV1[] = freeze(
    source.paths.map((path, index) => ({
      pieceId: index === 0 ? 'FRONT' : 'BACK',
      sizeToken: 'M',
      contourId: index === 0 ? 'front-shell' : 'back-shell',
      role: 'sewing-boundary' as const,
      geometry: { kind: 'seam' as const },
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
  const seamLengthMm =
    geometry === 'annular-sector'
      ? annularFixture.hemSlantRadiusMm - annularFixture.waistSlantRadiusMm
      : 100;
  const annularEndSeamStart =
    1 + (annularFixture.hemArcSegmentCount ?? annularFixture.arcSegmentCount);
  const annularEndSeamEnd = annularEndSeamStart + 1;
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
        direction: geometry === 'annular-sector' ? 'same' : 'reversed',
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'open', seamLengthMm)],
        sideB: [anchor('piece-back', 'open', seamLengthMm)],
      },
      {
        seamKey: 'side-close',
        confirmed: true,
        stale: false,
        kind: 'edge',
        direction: geometry === 'annular-sector' ? 'same' : 'reversed',
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'closing', seamLengthMm)],
        sideB: [anchor('piece-back', 'closing', seamLengthMm)],
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
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
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
            boundaryVertexIds:
              geometry === 'annular-sector' ? [front[0]!, front[1]!] : [front[1]!, front[2]!],
            direction: 'forward',
            confirmed: true,
          },
          {
            pieceId: 'BACK',
            contourId: 'back-shell',
            boundaryVertexIds:
              geometry === 'annular-sector' ? [back[0]!, back[1]!] : [back[2]!, back[1]!],
            direction: geometry === 'annular-sector' ? 'forward' : 'reverse',
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
            boundaryVertexIds:
              geometry === 'annular-sector'
                ? [front[annularEndSeamStart]!, front[annularEndSeamEnd]!]
                : [front[3]!, front[0]!],
            direction: 'forward',
            confirmed: true,
          },
          {
            pieceId: 'BACK',
            contourId: 'back-shell',
            boundaryVertexIds:
              geometry === 'annular-sector'
                ? [back[annularEndSeamStart]!, back[annularEndSeamEnd]!]
                : [back[0]!, back[3]!],
            direction: geometry === 'annular-sector' ? 'forward' : 'reverse',
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
    aliases: [
      {
        scopeKey: 'main',
        fabricPurpose: 'main',
        bomLineKey: 'bom-main',
        blockName: 'FRONT',
        pieceLineKey: 'piece-front',
      },
      {
        scopeKey: 'main',
        fabricPurpose: 'main',
        bomLineKey: 'bom-main',
        blockName: 'BACK',
        pieceLineKey: 'piece-back',
      },
    ],
    pieceUpdates: [],
    downloads: [],
    dxfProvenance: pipeline,
    dxfPhaseDReplay: replay,
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

/**
 * Detached saved-row inputs for DEV/browser integration evidence. No Phase-D selection, Phase-E
 * catalog/proposal/choices or prepared object escapes this fixture: the caller must reconstruct
 * every one of those through the real saved-DXF owner.
 */
export async function createPatternImportDxfProductSavedRuntimeSeedV1Fixture() {
  const source = await compositionFixture(1);
  const scope = source.request.draft.scopes[0];
  const replay = scope?.writerReplay;
  if (!scope || !replay) throw new Error('saved runtime fixture has no writer replay');
  const savedDxfBytes = new TextEncoder().encode(scope.dxfText);
  const row = {
    techCardId: 120,
    scopeKey: 'main',
    patternLineKey: 'pattern:main',
    revision: 7,
    cardLockVersion: 11,
    url: 'https://assembly-evidence.invalid/card-120/main.dxf',
    sizeBytes: savedDxfBytes.byteLength,
    sha256: await shaText(scope.dxfText),
  };
  const anchor = (pieceLineKey: string, edgeHint: string, x: number) => ({
    pieceLineKey,
    edgeHint,
    range: [0, 1] as [number, number],
    lenMm: 100,
    contourSig: `${pieceLineKey}:${edgeHint}`,
    samples: [
      [(x % 200) / 100, 0],
      [(x % 200) / 100, 0.25],
      [(x % 200) / 100, 0.5],
      [(x % 200) / 100, 0.75],
      [(x % 200) / 100, 1],
    ] as [number, number][],
  });
  const assembly = {
    ops: [
      {
        number: 120,
        work: 'overlock_serge',
        inputKeys: ['piece-front', 'piece-back'],
        outputUnitKey: 'shell',
        outputUnitName: 'SHELL',
        seamKeys: ['side-open', 'side-close'],
      },
    ],
    seams: [
      {
        pieces: ['piece-front', 'piece-back'],
        confirmed: true,
        seamKey: 'side-open',
        stale: false,
        kind: 'edge' as const,
        direction: 'reversed' as const,
        source: 'order' as const,
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'open', 0)],
        sideB: [anchor('piece-back', 'open', 200)],
      },
      {
        pieces: ['piece-front', 'piece-back'],
        confirmed: true,
        seamKey: 'side-close',
        stale: false,
        kind: 'edge' as const,
        direction: 'reversed' as const,
        source: 'order' as const,
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'close', 100)],
        sideB: [anchor('piece-back', 'close', 300)],
      },
    ],
  };
  return structuredClone({
    savedDxfBytes,
    draft: source.request.draft,
    row,
    card: {
      techCardId: 120,
      sizes: [{ sizeId: 7, token: 'M', name: 'Medium', rank: 0, spellings: ['M', 'Medium'] }],
      scopes: [replay.job.scope],
      existingPieces: [
        {
          lineKey: 'piece-front',
          name: 'FRONT',
          cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL',
          piecesPerGarment: 1,
        },
        {
          lineKey: 'piece-back',
          name: 'BACK',
          cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL',
          piecesPerGarment: 1,
        },
      ],
      existingAliases: [
        { scopeKey: 'main', blockName: 'FRONT', pieceLineKey: 'piece-front' },
        { scopeKey: 'main', blockName: 'BACK', pieceLineKey: 'piece-back' },
      ],
      existingPatterns: [
        {
          scopeKey: 'main',
          filename: scope.filename,
          url: row.url,
          lineKey: row.patternLineKey,
          name: scope.name,
          manifest: scope.manifest,
        },
      ],
      styleLabel: 'Assembly evidence 120',
      cardName: 'Assembly evidence two-panel shell',
      styleNumber: '120',
    },
    assembly,
  });
}

async function createPatternImportDxfProductGarmentMeshComposerRequestV2FixtureForGeometry(
  generation: number,
  geometry: ProductGarmentMeshFixtureGeometryV2,
  targetEdgeMm = geometry === 'annular-sector' ? 10 : 50,
  annularFixture: PatternImportDxfProductAnnularSectorFixtureV1 = PATTERN_IMPORT_DXF_PRODUCT_ANNULAR_SECTOR_FIXTURE_V1,
): Promise<PatternImportDxfProductGarmentMeshComposerRequestV2> {
  const source = await compositionFixture(generation, geometry, annularFixture);
  const ingress = await buildPatternImportDxfProductGarmentMeshNativeIngressV1({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_NATIVE_INGRESS_REQUEST_V1,
    compositionRequest: source.request,
    nativeRead: source.nativeRead.value,
    origin: 'fresh-import',
    targetEdgeMm,
  });
  if (!ingress.ok) throw new Error(JSON.stringify(ingress.blockers));
  return ingress.request;
}

export async function createPatternImportDxfProductGarmentMeshComposerRequestV2Fixture(
  generation = 1,
): Promise<PatternImportDxfProductGarmentMeshComposerRequestV2> {
  return createPatternImportDxfProductGarmentMeshComposerRequestV2FixtureForGeometry(
    generation,
    'square',
  );
}

export async function createPatternImportDxfProductAnnularSectorGarmentMeshComposerRequestV2Fixture(
  generation = 1,
): Promise<PatternImportDxfProductGarmentMeshComposerRequestV2> {
  return createPatternImportDxfProductGarmentMeshComposerRequestV2FixtureForGeometry(
    generation,
    'annular-sector',
  );
}

export async function createPatternImportDxfProductAnnularSectorGarmentMeshComposerRequestAtTargetV2Fixture(
  targetEdgeMm: number,
  generation = 1,
): Promise<PatternImportDxfProductGarmentMeshComposerRequestV2> {
  return createPatternImportDxfProductGarmentMeshComposerRequestV2FixtureForGeometry(
    generation,
    'annular-sector',
    targetEdgeMm,
  );
}

export async function createPatternImportDxfProductRefinedPositiveAnnularSectorRequestV2Fixture(
  generation = 1,
): Promise<PatternImportDxfProductGarmentMeshComposerRequestV2> {
  return createPatternImportDxfProductGarmentMeshComposerRequestV2FixtureForGeometry(
    generation,
    'annular-sector',
    12.5,
  );
}

export async function createPatternImportDxfProductCanonicalMediumBetaAnnularSectorRequestV2Fixture(
  generation = 1,
): Promise<PatternImportDxfProductGarmentMeshComposerRequestV2> {
  return createPatternImportDxfProductGarmentMeshComposerRequestV2FixtureForGeometry(
    generation,
    'annular-sector',
    12.5,
    PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1,
  );
}

export async function createPatternImportDxfProductGarmentMeshComposerOwnerV2Fixture(
  generation = 1,
) {
  const request =
    await createPatternImportDxfProductGarmentMeshComposerRequestV2Fixture(generation);
  const result = await buildPatternImportDxfProductGarmentMeshComposerV2(request);
  if (!result.ok) throw new Error(JSON.stringify(result.blockers));
  return { request, result };
}

export async function createPatternImportDxfProductAnnularSectorGarmentMeshComposerOwnerV2Fixture(
  generation = 1,
) {
  const request =
    await createPatternImportDxfProductAnnularSectorGarmentMeshComposerRequestV2Fixture(generation);
  const result = await buildPatternImportDxfProductGarmentMeshComposerV2(request);
  if (!result.ok) throw new Error(JSON.stringify(result.blockers));
  return { request, result };
}

export async function createPatternImportDxfProductCanonicalMediumBetaAnnularSectorOwnerV2Fixture(
  generation = 1,
) {
  const request =
    await createPatternImportDxfProductCanonicalMediumBetaAnnularSectorRequestV2Fixture(generation);
  const result = await buildPatternImportDxfProductGarmentMeshComposerV2(request);
  if (!result.ok) throw new Error(JSON.stringify(result.blockers));
  return { request, result };
}
