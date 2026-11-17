import type {
  CardContext,
  ImportClient,
  StageProgress,
} from 'components/managers/tech-card/components/pattern-import/client';
import { adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-dxf-reprocess-host-v1';
import {
  createPatternImportDxfProductSavedGarmentMeshCompileSessionV1,
  type PatternImportDxfProductSavedGarmentMeshCompileResultV1,
} from './pattern-import-dxf-product-saved-garment-mesh-compile-session-v1';
import {
  buildPatternImportDxfProductSavedGarmentMeshIngressV1,
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
  type PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
} from './pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import {
  buildPatternImportDxfProductGarmentMeshComposerV2,
  disposePatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V3,
  buildPatternImportDxfProductGarmentMeshComposerV3,
  disposePatternImportDxfProductGarmentMeshComposerV3,
  type PatternImportDxfProductGarmentMeshComposerOwnerV3,
} from './pattern-import-dxf-product-garment-mesh-composer-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_REQUEST_V2,
  buildPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2,
  disposePatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2,
  type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-saved-local-frame-garment-mesh-composer-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1,
  evaluatePatternImportDxfProductSavedCanonicalMediumPlacementPreflightV1,
  type PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1,
} from './pattern-import-dxf-product-saved-canonical-medium-placement-preflight-v1';
import {
  buildPatternImportDxfProductPhaseEAuthoringCatalogV1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from './pattern-import-dxf-product-draft-phase-d-selection-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1,
  createPatternImportDxfProductCanonicalMediumBetaAnnularSectorRequestV2Fixture,
} from './pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_WRITER_FRAME_RECEIPT_V2,
  evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2,
  type PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2,
  type PatternImportDxfProductSavedAnnularWriterFramePieceV2,
  type PatternImportDxfProductSavedAnnularWriterFrameReceiptV2,
} from './pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';
import {
  createPatternImportDxfProductSavedAnnularFrameReplayAnswerV3,
  mergePatternImportDxfProductSavedAnnularFrameReplayV3,
  readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3,
} from './pattern-import-dxf-product-saved-annular-frame-replay-carrier-v3';
import {
  createDxfProductSavedNativeReprocessOwnerV1,
  type DxfProductSavedNativeReprocessResultV1,
} from '../../pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
  type DxfProductSavedRowIdentityV1,
} from '../../pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  buildPatternImportDxfProductPhaseEMultiseamChoicesV2,
  createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
  proposePatternImportDxfProductPhaseEMultiseamAssemblyV2,
  type PatternImportDxfProductPhaseEMultiseamProposalV2,
  type PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from '../../pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import type {
  AssemblyContext,
  CardDraft,
  PatternImportOpenFile,
  StageIO,
  StageName,
} from '../../pattern-import/types';
import { Session } from '../../pattern-import/worker/session';
import { writeDxfDetailed } from '../../pattern-import/write';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ANNULAR_EVIDENCE_V1 =
  'pattern-import-dxf-product-saved-canonical-medium-annular-evidence/1' as const;

const DOWNLOAD_URL = 'https://annular-evidence.invalid/card-120/main.dxf';
const DOCUMENT_ID = 'saved-document:canonical-medium-annular:card-120';
const DOCUMENT_REVISION = 'saved-revision:7';
const TARGET_EDGE_MM = 12.5;

type MaterialOption = Readonly<{
  id: string;
  label: string;
  materialRevision: string;
}>;

const MATERIALS = Object.freeze([
  Object.freeze({ id: 'front-material', label: 'Front', materialRevision: 'cotton/front/r1' }),
  Object.freeze({ id: 'back-material', label: 'Back', materialRevision: 'cotton/back/r1' }),
] satisfies readonly MaterialOption[]);

export type PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  savedDxfBytes: Uint8Array<ArrayBuffer>;
  card: CardContext;
  assembly: AssemblyContext;
  writerFrameSeed: Readonly<{
    sourceFileSha256: string;
    pieces: readonly [
      Omit<PatternImportDxfProductSavedAnnularWriterFramePieceV2, 'sourcePathIds'>,
      Omit<PatternImportDxfProductSavedAnnularWriterFramePieceV2, 'sourcePathIds'>,
    ];
  }>;
  expected: Readonly<{
    pieceIds: readonly ['FRONT', 'BACK'];
    seamIds: readonly ['side-open', 'side-close'];
    waistSlantRadiusMm: 700;
    hemSlantRadiusMm: 900;
    sectorSpanRad: 0.64;
    targetEdgeMm: 12.5;
  }>;
}>;

export type PatternImportDxfProductSavedCanonicalMediumAnnularEvidenceV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ANNULAR_EVIDENCE_V1;
  sourceFileId: string;
  sourceSha256: string;
  savedFetchCount: 2;
  inProcessWorkerSessionCount: 2;
  composerCompileCount: 2;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  compile: Extract<PatternImportDxfProductSavedGarmentMeshCompileResultV1, { ok: true }>;
  deterministicReplay: Readonly<{
    composerCanonicalSha256: string;
    phase2ArtifactSha256: string;
    meshDeterministicFingerprint: string;
    restPositions2Sha256: string;
    trianglesSha256: string;
  }>;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
  savedReplayFrameProbe: Readonly<{
    replaySha256: string;
    frameRecoverableWithoutInference: true;
    carrierVersion: 'pattern-import-dxf-product-saved-annular-frame-replay-carrier/3';
    pieces: readonly Readonly<{
      pieceId: string;
      blockName: string;
      sourceApexMm: readonly [number, number];
      persistedSourceToWrittenAffine: readonly [number, number, number, number, number, number];
      replaySourceToWrittenAffine: readonly [number, number, number, number, number, number];
    }>[];
  }>;
  localFrameHostileChecks: Readonly<{
    shiftedAffineRejected: true;
    forgedSourceShaRejected: true;
    oversizedSourcePathListRejected: true;
    requestAccessorRejectedWithoutCall: true;
    receiptPieceAccessorRejectedWithoutCall: true;
    hostileReceiptProxyRejected: true;
    oversizedSourceApexRejected: true;
  }>;
  placementPreflight: PatternImportDxfProductSavedCanonicalMediumPlacementPreflightReportV1;
  localFramePreflight: PatternImportDxfProductSavedAnnularLocalFramePreflightReportV2;
  sourcePathLineage: Readonly<{
    sourcePathCoordinateSha256: string;
    boundarySourceCurveIdentitySha256: string;
    boundarySourceCurveCounts: readonly Readonly<{ pieceId: string; sourceCurveCount: number }>[];
    seams: readonly Readonly<{
      seamId: string;
      sides: readonly Readonly<{
        pieceId: string;
        sourcePathId: number;
        authoredAnchors: readonly [string, string];
      }>[];
    }>[];
  }>;
  native: Extract<DxfProductSavedNativeReprocessResultV1, { ok: true }>;
}>;

function exactRow(
  left: DxfProductSavedRowIdentityV1,
  right: DxfProductSavedRowIdentityV1,
): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function samples(): [number, number][] {
  return [
    [0, 0],
    [0.25, 0],
    [0.5, 0],
    [0.75, 0],
    [1, 0],
  ];
}

function anchor(pieceLineKey: string, edgeHint: string) {
  return {
    pieceLineKey,
    edgeHint,
    range: [0, 1] as [number, number],
    lenMm: 200,
    contourSig: `${pieceLineKey}:${edgeHint}:canonical-medium-annular`,
    samples: samples(),
  };
}

/**
 * Builds the saved row from the exact writer bytes of the existing canonical-medium annular
 * source. The returned value contains no Composer owner and cannot bypass saved reprocessing.
 */
export async function createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1(): Promise<PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1> {
  const request =
    await createPatternImportDxfProductCanonicalMediumBetaAnnularSectorRequestV2Fixture();
  const composition = request.compositionRequest;
  const scope = composition.draft.scopes.find(({ target }) => target.scopeKey === 'main');
  const replay = scope?.writerReplay;
  if (!scope || !replay)
    throw new Error('Canonical-medium annular source has no writer-backed main scope.');
  const writerJob = structuredClone(replay.job);
  const hemSegments =
    PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1.hemArcSegmentCount ??
    PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1.arcSegmentCount;
  const outerEndIndex = 1 + hemSegments;
  const innerEndIndex = outerEndIndex + 1;
  // Six-decimal points stay within the canonical 700/900 mm and 0.64 rad bands, make the radial
  // source curve angularly straight, and survive the product writer's shelf translations with
  // bit-identical FRONT/BACK Float64 edge lengths. The unadjusted polar rounding differs by one
  // ULP after saved-row layout and is correctly rejected by the exact Phase-1 seam policy.
  const exactEnd = Object.freeze({
    inner: Object.freeze({ x: 561.461727, y: 418.027188 }),
    outer: Object.freeze({ x: 721.88058, y: 537.466677 }),
  });
  for (const piece of writerJob.pieces) {
    const size = piece.sizes.find(({ sizeToken }) => sizeToken === 'M');
    const seam = size?.seam;
    if (!size || !seam || size.cut.length <= innerEndIndex || seam.length <= innerEndIndex)
      throw new Error(`${piece.identity} has no exact canonical annular endpoint pair.`);
    const sign = piece.identity === 'FRONT' ? 1 : piece.identity === 'BACK' ? -1 : 0;
    if (sign === 0) throw new Error(`Unexpected canonical annular piece ${piece.identity}.`);
    const outer = { x: sign * exactEnd.outer.x, y: sign * exactEnd.outer.y };
    const inner = { x: sign * exactEnd.inner.x, y: sign * exactEnd.inner.y };
    size.cut[outerEndIndex] = { ...outer };
    size.cut[innerEndIndex] = { ...inner };
    seam[outerEndIndex] = { ...outer };
    seam[innerEndIndex] = { ...inner };
  }
  const preliminary = writeDxfDetailed(writerJob, { now: () => new Date(replay.createdAt) });
  const frameSeedPiece = (pieceId: 'FRONT' | 'BACK') => {
    const block = preliminary.plan.blocks.find(
      (candidate) => candidate.identity === pieceId && candidate.sizeToken === 'M',
    );
    const transform = block ? preliminary.transforms[block.name] : null;
    if (!block || !transform)
      throw new Error(`${pieceId} has no exact seed-writer frame transform.`);
    return Object.freeze({
      pieceId,
      blockName: block.name,
      sourceApexMm: Object.freeze([0, 0] as const),
      sourceToWrittenAffine: Object.freeze([
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.e,
        transform.f,
      ] as const),
    });
  };
  const frameSeedPieces = Object.freeze([frameSeedPiece('FRONT'), frameSeedPiece('BACK')] as const);
  const frameAnswer = createPatternImportDxfProductSavedAnnularFrameReplayAnswerV3(frameSeedPieces);
  writerJob.replay = mergePatternImportDxfProductSavedAnnularFrameReplayV3(
    writerJob.replay,
    frameAnswer,
  );
  const written = writeDxfDetailed(writerJob, { now: () => new Date(replay.createdAt) });
  const savedDxfBytes = new TextEncoder().encode(written.dxfText) as Uint8Array<ArrayBuffer>;
  const sourceSha256 = await sha256(savedDxfBytes);
  const writerFrameSeed = Object.freeze({
    sourceFileSha256: sourceSha256,
    pieces: frameSeedPieces,
  });
  const row: DxfProductSavedRowIdentityV1 = Object.freeze({
    techCardId: 120,
    scopeKey: 'main',
    patternLineKey: 'pattern:main:canonical-medium-annular',
    revision: 7,
    cardLockVersion: 11,
    url: DOWNLOAD_URL,
    sizeBytes: savedDxfBytes.byteLength,
    sha256: sourceSha256,
  });
  const assembly: AssemblyContext = {
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
        kind: 'edge',
        direction: 'same',
        source: 'order',
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'radial-start')],
        sideB: [anchor('piece-back', 'radial-start')],
      },
      {
        pieces: ['piece-front', 'piece-back'],
        confirmed: true,
        seamKey: 'side-close',
        stale: false,
        kind: 'edge',
        direction: 'same',
        source: 'order',
        anchoredSize: 'M',
        sideA: [anchor('piece-front', 'radial-end')],
        sideB: [anchor('piece-back', 'radial-end')],
      },
    ],
  };
  const card: CardContext = {
    techCardId: 120,
    sizes: [{ sizeId: 7, token: 'M', name: 'Medium', rank: 0, spellings: ['M', 'Medium'] }],
    scopes: [structuredClone(writerJob.scope)],
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
        manifest: structuredClone(written.manifest),
      },
    ],
    styleLabel: 'Canonical medium annular evidence 120',
    cardName: 'Canonical medium two-panel annular skirt',
    styleNumber: '120',
    assembly,
  };
  return Object.freeze({
    row,
    savedDxfBytes: savedDxfBytes.slice() as Uint8Array<ArrayBuffer>,
    card: structuredClone(card),
    assembly: structuredClone(assembly),
    writerFrameSeed,
    expected: Object.freeze({
      pieceIds: Object.freeze(['FRONT', 'BACK'] as const),
      seamIds: Object.freeze(['side-open', 'side-close'] as const),
      waistSlantRadiusMm: 700 as const,
      hemSlantRadiusMm: 900 as const,
      sectorSpanRad: 0.64 as const,
      targetEdgeMm: TARGET_EDGE_MM,
    }),
  });
}

class InProcessImportClient implements ImportClient {
  readonly kind = 'worker' as const;
  private nextSessionId = 1;
  private cancelled = false;
  private readonly sessions = new Map<number, Session>();

  constructor(private readonly onOpen: () => void) {}

  async open(files: PatternImportOpenFile[]) {
    if (this.cancelled) throw new DOMException('cancelled', 'AbortError');
    const sessionId = this.nextSessionId++;
    const session = new Session(sessionId, files);
    this.sessions.set(sessionId, session);
    this.onOpen();
    return { sessionId, files: session.files };
  }

  async run<S extends StageName>(
    sessionId: number,
    stage: S,
    input: StageIO[S]['in'],
    onProgress?: (progress: StageProgress) => void,
  ): Promise<StageIO[S]['out']> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('in-process import session is unavailable');
    return session.runStage(stage, input, {
      checkCancel: () => {
        if (this.cancelled) throw new DOMException('cancelled', 'AbortError');
      },
      progress: (done, total, note) => onProgress?.({ done, total, note }),
    });
  }

  cancel(): void {
    this.cancelled = true;
  }

  async close(sessionId: number): Promise<void> {
    this.sessions.get(sessionId)?.close();
    this.sessions.delete(sessionId);
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}

function exactBoundary(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  pieceId: 'FRONT' | 'BACK',
): readonly string[] {
  const piece = catalog.pieces.find((candidate) => candidate.pieceId === pieceId);
  const contours = piece?.contours.filter(({ role, closed }) => role === 'cut-boundary' && closed);
  if (!contours || contours.length !== 1)
    throw new Error(`${pieceId} has no unique saved cut boundary.`);
  const vertices = [...contours[0].boundaryVertices]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map(({ vertexId }) => vertexId);
  const fixture = PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1;
  const expectedCount =
    2 +
    (fixture.hemArcSegmentCount ?? fixture.arcSegmentCount) +
    1 +
    (fixture.waistArcSegmentCount ?? fixture.arcSegmentCount) -
    1;
  if (vertices.length !== expectedCount)
    throw new Error(`${pieceId} boundary vertex count drifted from ${String(expectedCount)}.`);
  return vertices;
}

function exactContourId(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  pieceId: 'FRONT' | 'BACK',
): string {
  const contours = catalog.pieces
    .find((candidate) => candidate.pieceId === pieceId)
    ?.contours.filter(({ role, closed }) => role === 'cut-boundary' && closed);
  if (!contours || contours.length !== 1)
    throw new Error(`${pieceId} has no unique saved cut contour identity.`);
  return contours[0].contourId;
}

async function buildChoices(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2,
) {
  const front = exactBoundary(catalog, 'FRONT');
  const back = exactBoundary(catalog, 'BACK');
  const frontContourId = exactContourId(catalog, 'FRONT');
  const backContourId = exactContourId(catalog, 'BACK');
  const hemSegments =
    PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1.hemArcSegmentCount ??
    PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1.arcSegmentCount;
  const endStart = 1 + hemSegments;
  const initial = createPatternImportDxfProductPhaseEMultiseamWorkbenchStateV2(
    catalog,
    proposal,
    { documentId: DOCUMENT_ID, revision: DOCUMENT_REVISION },
    1,
  );
  const state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 = {
    ...initial,
    documentRevisionConfirmed: true,
    physicalSurface: { mode: 'cut-surface', seamAllowancePhysical: true },
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
            contourId: frontContourId,
            boundaryVertexIds: [front[0]!, front[1]!],
            direction: 'forward',
            confirmed: true,
          },
          {
            pieceId: 'BACK',
            contourId: backContourId,
            boundaryVertexIds: [back[0]!, back[1]!],
            direction: 'forward',
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
            contourId: frontContourId,
            boundaryVertexIds: [front[endStart]!, front[endStart + 1]!],
            direction: 'forward',
            confirmed: true,
          },
          {
            pieceId: 'BACK',
            contourId: backContourId,
            boundaryVertexIds: [back[endStart]!, back[endStart + 1]!],
            direction: 'forward',
            confirmed: true,
          },
        ],
      },
    ],
    materialSelections: [
      { pieceId: 'FRONT', optionId: MATERIALS[0].id, confirmed: true },
      { pieceId: 'BACK', optionId: MATERIALS[1].id, confirmed: true },
    ],
    tolerance: {
      endpointMm: 0,
      fullLengthMm: 0.000001,
      fullLengthRelative: 0,
      confirmed: true,
    },
  };
  const result = await buildPatternImportDxfProductPhaseEMultiseamChoicesV2(
    catalog,
    proposal,
    state,
    MATERIALS,
  );
  if (!result.ok) throw new Error(`${result.blockers[0].code}: ${result.blockers[0].detail}`);
  return result.choices;
}

async function compositionRequest(
  draft: CardDraft,
  seed: PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
): Promise<PatternImportDxfProductMultiseamMappingCompositionRequestV2> {
  const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, 'main', 'M');
  if (!selected.ok) throw new Error(`${selected.blockers[0].code}: ${selected.blockers[0].detail}`);
  const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    draft,
    'main',
    'M',
  );
  if (!catalogResult.ok)
    throw new Error(`${catalogResult.blockers[0].code}: ${catalogResult.blockers[0].detail}`);
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
    seed.assembly,
    120,
  );
  if (!adapted.ok) throw new Error(`${adapted.blockers[0].code}: ${adapted.blockers[0].detail}`);
  const proposed = proposePatternImportDxfProductPhaseEMultiseamAssemblyV2(
    catalogResult.catalog,
    adapted.existingAssembly,
  );
  if (!proposed.ok) throw new Error(`${proposed.blockers[0].code}: ${proposed.blockers[0].detail}`);
  const choices = await buildChoices(catalogResult.catalog, proposed.proposal);
  const row = {
    techCardId: seed.row.techCardId,
    scopeKey: seed.row.scopeKey,
    patternLineKey: seed.row.patternLineKey,
    dxfSha256: seed.row.sha256,
    patternVersion: seed.row.revision,
    cardLockVersion: seed.row.cardLockVersion,
  };
  const preparedRow = Object.freeze({ ...row });
  const currentRow = Object.freeze({ ...row });
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_MAPPING_COMPOSITION_REQUEST_V2,
    draft,
    selection: selected.selection,
    catalog: catalogResult.catalog,
    proposal: proposed.proposal,
    choices,
    prepared: Object.freeze({
      importGeneration: 1,
      row: preparedRow,
      sizeSelectionSha256: selected.selection.selection.canonicalSha256,
      catalogCanonicalSha256: catalogResult.catalog.canonicalSha256,
      proposalFingerprint: proposed.proposal.deterministicFingerprint,
      phaseEPlanSha256: choices.aggregatePlanSeal.canonicalSha256,
      documentId: choices.documentId,
      revision: choices.revision,
    }),
    current: Object.freeze({ importGeneration: 1, row: currentRow }),
  });
}

type SuccessfulComposition = Extract<
  Awaited<ReturnType<typeof buildPatternImportDxfProductMultiseamMappingCompositionV2>>,
  { ok: true }
>;

async function savedWriterReplayFrameProbe(draft: CardDraft, row: DxfProductSavedRowIdentityV1) {
  const scopes = draft.scopes.filter(({ target }) => target.scopeKey === row.scopeKey);
  const replay = scopes.length === 1 ? scopes[0]!.writerReplay : null;
  if (!replay) throw new Error('Verified saved draft has no exact-bound writer replay.');
  const written = writeDxfDetailed(replay.job, { now: () => new Date(replay.createdAt) });
  const replayBytes = new TextEncoder().encode(written.dxfText) as Uint8Array<ArrayBuffer>;
  const replaySha256 = await sha256(replayBytes);
  if (replaySha256 !== row.sha256 || replayBytes.byteLength !== row.sizeBytes) {
    throw new Error('saved-writer-replay-byte-binding-mismatch');
  }
  const persisted = readPatternImportDxfProductSavedAnnularFrameReplayCarrierV3(replay.job.replay);
  if (!persisted.ok)
    throw new Error(`saved-frame-carrier ${persisted.blocker.code}: ${persisted.blocker.detail}`);
  const framePiece = (pieceId: 'FRONT' | 'BACK') => {
    const block = written.plan.blocks.find(
      (candidate) => candidate.identity === pieceId && candidate.sizeToken === 'M',
    );
    const transform = block ? written.transforms[block.name] : null;
    if (!block || !transform || !block.seam || block.cut.length !== block.seam.length) {
      throw new Error(`${pieceId} has no exact zero-allowance saved writer frame.`);
    }
    if (
      block.cut.some(
        (point, index) => point.x !== block.seam![index]!.x || point.y !== block.seam![index]!.y,
      )
    ) {
      throw new Error(`${pieceId} saved writer cut and seam rings are not exact-equal.`);
    }
    const stored = persisted.carrier.pieces.find((piece) => piece.pieceId === pieceId);
    if (!stored || stored.blockName !== block.name)
      throw new Error(`${pieceId} persisted writer frame lost its exact block identity.`);
    return Object.freeze({
      pieceId,
      blockName: block.name,
      sourceApexMm: stored.sourceApexMm,
      persistedSourceToWrittenAffine: stored.sourceToWrittenAffine,
      replaySourceToWrittenAffine: Object.freeze([
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.e,
        transform.f,
      ] as const),
    });
  };
  return Object.freeze({
    replaySha256,
    frameRecoverableWithoutInference: true as const,
    carrierVersion: persisted.carrier.schemaVersion,
    pieces: Object.freeze([framePiece('FRONT'), framePiece('BACK')] as const),
  });
}

type SavedWriterReplayFrameProbe = Awaited<ReturnType<typeof savedWriterReplayFrameProbe>>;

function persistedWriterFrameReceipt(
  probe: SavedWriterReplayFrameProbe,
  row: DxfProductSavedRowIdentityV1,
  composed: SuccessfulComposition,
): PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 {
  if (probe.replaySha256 !== row.sha256)
    throw new Error('persisted-writer-frame-row-sha-binding-mismatch');
  const framePiece = (pieceId: 'FRONT' | 'BACK') => {
    const source = probe.pieces.find((piece) => piece.pieceId === pieceId);
    if (!source) throw new Error(`${pieceId} has no persisted saved writer frame.`);
    const sourcePathIds = [
      ...new Set(
        composed.aggregate.seams.flatMap(({ sides }) =>
          sides.filter((side) => side.pieceId === pieceId).map(({ sourcePathId }) => sourcePathId),
        ),
      ),
    ];
    if (sourcePathIds.length === 0)
      throw new Error(`${pieceId} has no aggregate-bound source PathId.`);
    return Object.freeze({
      pieceId: source.pieceId,
      blockName: source.blockName,
      sourceApexMm: source.sourceApexMm,
      sourceToWrittenAffine: source.persistedSourceToWrittenAffine,
      sourcePathIds: Object.freeze(sourcePathIds) as readonly [number, ...number[]],
    });
  };
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_WRITER_FRAME_RECEIPT_V2,
    sourceFileSha256: probe.replaySha256,
    writerExportSha256: row.sha256,
    aggregateCanonicalSha256: composed.aggregateSeal.canonicalSha256,
    sourcePathCoordinateSha256: composed.aggregate.sourceBinding.sourcePathCoordinateSha256,
    provenance: 'saved-replay-answer-byte-bound',
    pieces: Object.freeze([framePiece('FRONT'), framePiece('BACK')] as const),
  });
}

export type PatternImportDxfProductSavedCanonicalMediumAnnularLegacyGlobalPlacementInputsV2 =
  Readonly<{
    compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
    writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
    composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
    composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
  }>;

/** Genuine owners live only for this test-fixture callback and are revoked on return. */
export async function withPatternImportDxfProductSavedCanonicalMediumAnnularLegacyGlobalPlacementInputsV2<
  T,
>(
  seed: PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  consume: (
    input: PatternImportDxfProductSavedCanonicalMediumAnnularLegacyGlobalPlacementInputsV2,
  ) => Promise<T>,
): Promise<T> {
  let opened = 0;
  const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
    resolveCard: async (expected) => {
      if (!exactRow(expected, seed.row)) throw new Error('saved row moved');
      return { card: structuredClone(seed.card), cardLockVersion: seed.row.cardLockVersion };
    },
    readAuthoritativeRow: async (expected) => {
      if (!exactRow(expected, seed.row)) throw new Error('saved row moved');
      return { row: seed.row, downloadUrl: DOWNLOAD_URL };
    },
    createClient: () =>
      new InProcessImportClient(() => {
        opened += 1;
      }),
    fetch: (async (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== DOWNLOAD_URL) return new Response('not found', { status: 404 });
      return new Response(seed.savedDxfBytes.slice(), {
        status: 200,
        headers: { 'content-length': String(seed.savedDxfBytes.byteLength) },
      });
    }) as typeof globalThis.fetch,
  });
  const nativeOwner = createDxfProductSavedNativeReprocessOwnerV1(host);
  let composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2 | null = null;
  let composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3 | null = null;
  try {
    const native = await nativeOwner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row: seed.row,
    });
    if (!native.ok)
      throw new Error(`native ${native.blockers[0].code}: ${native.blockers[0].detail}`);
    const request = await compositionRequest(native.draft, seed);
    const composed = await buildPatternImportDxfProductMultiseamMappingCompositionV2(request);
    if (!composed.ok)
      throw new Error(`composition ${composed.blockers[0].code}: ${composed.blockers[0].detail}`);
    const probe = await savedWriterReplayFrameProbe(native.draft, seed.row);
    const receipt = persistedWriterFrameReceipt(probe, seed.row, composed);
    const ingress = await buildPatternImportDxfProductSavedGarmentMeshIngressV1({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
      sourceOwner: native.sourceOwner,
      compositionRequest: request,
      targetEdgeMm: TARGET_EDGE_MM,
    });
    if (!ingress.ok)
      throw new Error(`ingress ${ingress.blockers[0].code}: ${ingress.blockers[0].detail}`);
    const composerV2 = await buildPatternImportDxfProductGarmentMeshComposerV2(ingress.request);
    if (!composerV2.ok)
      throw new Error(
        `composer-v2 ${composerV2.blockers[0].code}: ${composerV2.blockers[0].detail}`,
      );
    composerV2Owner = composerV2.owner;
    const composerV3 = await buildPatternImportDxfProductGarmentMeshComposerV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_GARMENT_MESH_COMPOSER_REQUEST_V3,
      composerV2Owner,
    });
    if (!composerV3.ok)
      throw new Error(
        `composer-v3 ${composerV3.blockers[0].code}: ${composerV3.blockers[0].detail}`,
      );
    composerV3Owner = composerV3.owner;
    if (opened !== 1)
      throw new Error(`expected one saved worker session, observed ${String(opened)}`);
    return await consume(
      Object.freeze({
        compositionRequest: request,
        writerFrameReceipt: receipt,
        composerV2Owner,
        composerV3Owner,
      }),
    );
  } finally {
    if (composerV3Owner) {
      disposePatternImportDxfProductGarmentMeshComposerV3(composerV3Owner);
      composerV2Owner = null;
    }
    if (composerV2Owner) disposePatternImportDxfProductGarmentMeshComposerV2(composerV2Owner);
    nativeOwner.dispose();
    host.dispose();
  }
}

export type PatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2 = Readonly<{
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  composerV3Owner: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2;
}>;

/** Genuine saved-local 580/912 owner seam used by placement/session production-path tests. */
export async function withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2<T>(
  seed: PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  consume: (
    input: PatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
  ) => Promise<T>,
): Promise<T> {
  return withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
    seed,
    async ({ sourceOwner, compositionRequest, writerFrameReceipt, targetEdgeMm }) => {
      let composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2 | null = null;
      let composerV3Owner: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2 | null =
        null;
      try {
        const ingress = await buildPatternImportDxfProductSavedGarmentMeshIngressV1({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
          sourceOwner,
          compositionRequest,
          targetEdgeMm,
        });
        if (!ingress.ok)
          throw new Error(`ingress ${ingress.blockers[0].code}: ${ingress.blockers[0].detail}`);
        const composerV2 = await buildPatternImportDxfProductGarmentMeshComposerV2(ingress.request);
        if (!composerV2.ok)
          throw new Error(
            `composer-v2 ${composerV2.blockers[0].code}: ${composerV2.blockers[0].detail}`,
          );
        composerV2Owner = composerV2.owner;
        const composerV3 = await buildPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2({
          schemaVersion:
            PATTERN_IMPORT_DXF_PRODUCT_SAVED_LOCAL_FRAME_GARMENT_MESH_COMPOSER_REQUEST_V2,
          composerV2Owner,
          compositionRequest,
          writerFrameReceipt,
        });
        if (!composerV3.ok)
          throw new Error(
            `saved-local-composer-v3 ${composerV3.blockers[0].code}: ${composerV3.blockers[0].detail}`,
          );
        composerV3Owner = composerV3.owner;
        return await consume(
          Object.freeze({
            compositionRequest,
            writerFrameReceipt,
            composerV2Owner,
            composerV3Owner,
          }),
        );
      } finally {
        if (composerV3Owner) {
          disposePatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(composerV3Owner);
          composerV2Owner = null;
        }
        if (composerV2Owner) disposePatternImportDxfProductGarmentMeshComposerV2(composerV2Owner);
      }
    },
  );
}

export type PatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2 = Readonly<{
  sourceOwner: PatternImportDxfProductSavedGarmentMeshIngressRequestV1['sourceOwner'];
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
  targetEdgeMm: 12.5;
}>;

/**
 * Genuine production-default session seam. The saved source capability stays live only for the
 * callback and is revoked transitively with the native reprocess owner on return.
 */
export async function withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2<T>(
  seed: PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  consume: (
    input: PatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
  ) => Promise<T>,
): Promise<T> {
  let opened = 0;
  const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
    resolveCard: async (expected) => {
      if (!exactRow(expected, seed.row)) throw new Error('saved row moved');
      return { card: structuredClone(seed.card), cardLockVersion: seed.row.cardLockVersion };
    },
    readAuthoritativeRow: async (expected) => {
      if (!exactRow(expected, seed.row)) throw new Error('saved row moved');
      return { row: seed.row, downloadUrl: DOWNLOAD_URL };
    },
    createClient: () =>
      new InProcessImportClient(() => {
        opened += 1;
      }),
    fetch: (async (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== DOWNLOAD_URL) return new Response('not found', { status: 404 });
      return new Response(seed.savedDxfBytes.slice(), {
        status: 200,
        headers: { 'content-length': String(seed.savedDxfBytes.byteLength) },
      });
    }) as typeof globalThis.fetch,
  });
  const nativeOwner = createDxfProductSavedNativeReprocessOwnerV1(host);
  try {
    const native = await nativeOwner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row: seed.row,
    });
    if (!native.ok)
      throw new Error(`native ${native.blockers[0].code}: ${native.blockers[0].detail}`);
    const request = await compositionRequest(native.draft, seed);
    const composed = await buildPatternImportDxfProductMultiseamMappingCompositionV2(request);
    if (!composed.ok)
      throw new Error(`composition ${composed.blockers[0].code}: ${composed.blockers[0].detail}`);
    const probe = await savedWriterReplayFrameProbe(native.draft, seed.row);
    const receipt = persistedWriterFrameReceipt(probe, seed.row, composed);
    if (opened !== 1)
      throw new Error(`expected one saved worker session, observed ${String(opened)}`);
    return await consume(
      Object.freeze({
        sourceOwner: native.sourceOwner,
        compositionRequest: request,
        writerFrameReceipt: receipt,
        targetEdgeMm: TARGET_EDGE_MM,
      }),
    );
  } finally {
    nativeOwner.dispose();
    host.dispose();
  }
}

function bytesOf(view: ArrayBufferView): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(view.byteLength);
  result.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return result as Uint8Array<ArrayBuffer>;
}

async function boundarySourceCurveIdentitySha256(
  projection: NonNullable<
    ReturnType<
      ReturnType<
        typeof createPatternImportDxfProductSavedGarmentMeshCompileSessionV1
      >['projectLatest']
    >
  >,
): Promise<string> {
  return sha256(
    new TextEncoder().encode(
      JSON.stringify(
        projection.mesh.boundarySamples.map(
          ({ pieceId, contourId, sourceCurveId, sourceCurveT, normalizedArc, vertexIndex }) => ({
            pieceId,
            contourId,
            sourceCurveId,
            sourceCurveT,
            normalizedArc,
            vertexIndex,
          }),
        ),
      ),
    ) as Uint8Array<ArrayBuffer>,
  );
}

export async function runPatternImportDxfProductSavedCanonicalMediumAnnularEvidenceV1(
  seed: PatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
): Promise<PatternImportDxfProductSavedCanonicalMediumAnnularEvidenceV1> {
  let savedFetchCount = 0;
  let inProcessWorkerSessionCount = 0;
  const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
    resolveCard: async (expected) => {
      if (!exactRow(expected, seed.row)) throw new Error('saved row moved');
      return { card: structuredClone(seed.card), cardLockVersion: seed.row.cardLockVersion };
    },
    readAuthoritativeRow: async (expected) => {
      if (!exactRow(expected, seed.row)) throw new Error('saved row moved');
      return { row: seed.row, downloadUrl: DOWNLOAD_URL };
    },
    createClient: () =>
      new InProcessImportClient(() => {
        inProcessWorkerSessionCount += 1;
      }),
    fetch: (async (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== DOWNLOAD_URL) return new Response('not found', { status: 404 });
      savedFetchCount += 1;
      return new Response(seed.savedDxfBytes.slice(), {
        status: 200,
        headers: { 'content-length': String(seed.savedDxfBytes.byteLength) },
      });
    }) as typeof globalThis.fetch,
  });
  const firstNativeOwner = createDxfProductSavedNativeReprocessOwnerV1(host);
  const secondNativeOwner = createDxfProductSavedNativeReprocessOwnerV1(host);
  const firstSession = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1();
  const secondSession = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1();
  try {
    const firstNative = await firstNativeOwner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row: seed.row,
    });
    if (!firstNative.ok)
      throw new Error(
        `first native ${firstNative.blockers[0].code}: ${firstNative.blockers[0].detail}`,
      );
    const secondNative = await secondNativeOwner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row: seed.row,
    });
    if (!secondNative.ok)
      throw new Error(
        `second native ${secondNative.blockers[0].code}: ${secondNative.blockers[0].detail}`,
      );
    const firstComposition = await compositionRequest(firstNative.draft, seed);
    const secondComposition = await compositionRequest(secondNative.draft, seed);
    const firstComposed =
      await buildPatternImportDxfProductMultiseamMappingCompositionV2(firstComposition);
    const secondComposed =
      await buildPatternImportDxfProductMultiseamMappingCompositionV2(secondComposition);
    if (!firstComposed.ok || !secondComposed.ok) {
      const blocker = firstComposed.ok ? secondComposed.blockers[0] : firstComposed.blockers[0];
      if (!blocker) throw new Error('composition blocked without one diagnostic blocker');
      throw new Error(`composition ${blocker.code}: ${blocker.detail}`);
    }
    const firstReplayFrameProbe = await savedWriterReplayFrameProbe(firstNative.draft, seed.row);
    const secondReplayFrameProbe = await savedWriterReplayFrameProbe(secondNative.draft, seed.row);
    const firstWriterFrameReceipt = persistedWriterFrameReceipt(
      firstReplayFrameProbe,
      seed.row,
      firstComposed,
    );
    const secondWriterFrameReceipt = persistedWriterFrameReceipt(
      secondReplayFrameProbe,
      seed.row,
      secondComposed,
    );
    if (JSON.stringify(firstWriterFrameReceipt) !== JSON.stringify(secondWriterFrameReceipt)) {
      throw new Error('independent-saved-writer-frame-replay-mismatch');
    }
    if (JSON.stringify(firstReplayFrameProbe) !== JSON.stringify(secondReplayFrameProbe)) {
      throw new Error('independent-saved-replay-frame-probe-mismatch');
    }
    const firstIngress: PatternImportDxfProductSavedGarmentMeshIngressRequestV1 = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
      sourceOwner: firstNative.sourceOwner,
      compositionRequest: firstComposition,
      targetEdgeMm: TARGET_EDGE_MM,
    };
    const secondIngress: PatternImportDxfProductSavedGarmentMeshIngressRequestV1 = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
      sourceOwner: secondNative.sourceOwner,
      compositionRequest: secondComposition,
      targetEdgeMm: TARGET_EDGE_MM,
    };
    const firstCompile = await firstSession.consume(firstIngress);
    const secondCompile = await secondSession.consume(secondIngress);
    if (!firstCompile.ok || !secondCompile.ok) {
      const blocker = firstCompile.ok ? secondCompile.blockers[0] : firstCompile.blockers[0];
      if (!blocker) throw new Error('compile blocked without one diagnostic blocker');
      throw new Error(`compile ${blocker.code}: ${blocker.detail}`);
    }
    const firstProjection = firstSession.projectLatest();
    const secondProjection = secondSession.projectLatest();
    if (!firstProjection || !secondProjection)
      throw new Error('independent saved compile session published no projection');
    const firstRestSha256 = await sha256(bytesOf(firstProjection.mesh.restPositions2Mm));
    const secondRestSha256 = await sha256(bytesOf(secondProjection.mesh.restPositions2Mm));
    const firstTrianglesSha256 = await sha256(bytesOf(firstProjection.mesh.triangles));
    const secondTrianglesSha256 = await sha256(bytesOf(secondProjection.mesh.triangles));
    if (
      firstCompile.composerSnapshot.seal.canonicalSha256 !==
        secondCompile.composerSnapshot.seal.canonicalSha256 ||
      firstCompile.composerSnapshot.seals.phase2ArtifactSha256 !==
        secondCompile.composerSnapshot.seals.phase2ArtifactSha256 ||
      firstCompile.composerSnapshot.mesh.deterministicFingerprint !==
        secondCompile.composerSnapshot.mesh.deterministicFingerprint ||
      firstRestSha256 !== secondRestSha256 ||
      firstTrianglesSha256 !== secondTrianglesSha256
    ) {
      throw new Error('independent-saved-composer-determinism-mismatch');
    }
    const preflight = evaluatePatternImportDxfProductSavedCanonicalMediumPlacementPreflightV1({
      schemaVersion:
        PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_PLACEMENT_PREFLIGHT_REQUEST_V1,
      composerSnapshot: secondCompile.composerSnapshot,
      projection: secondProjection,
    });
    if (!preflight.ok) throw new Error(`${preflight.blocker.code}: ${preflight.blocker.detail}`);
    const localFramePreflight = evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
      composerSnapshot: secondCompile.composerSnapshot,
      projection: secondProjection,
      writerFrameReceipt: secondWriterFrameReceipt,
    });
    if (!localFramePreflight.ok)
      throw new Error(`${localFramePreflight.blocker.code}: ${localFramePreflight.blocker.detail}`);
    const localFrameRequest = (writerFrameReceipt: unknown) =>
      evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
        composerSnapshot: secondCompile.composerSnapshot,
        projection: secondProjection,
        writerFrameReceipt,
      });
    const shiftedReceipt = structuredClone(secondWriterFrameReceipt) as unknown as {
      pieces: [{ sourceToWrittenAffine: number[] }, { sourceToWrittenAffine: number[] }];
    };
    shiftedReceipt.pieces[0].sourceToWrittenAffine[4]! += 1;
    const shifted = localFrameRequest(shiftedReceipt);
    if (!shifted.ok || shifted.report.status !== 'canonical-medium-local-geometry-incompatible') {
      throw new Error('shifted-writer-affine-was-not-rejected');
    }
    const forgedSource = structuredClone(secondWriterFrameReceipt) as unknown as {
      sourceFileSha256: string;
    };
    forgedSource.sourceFileSha256 = '0'.repeat(64);
    const forged = localFrameRequest(forgedSource);
    if (forged.ok || forged.blocker.code !== 'writer-frame-binding-mismatch') {
      throw new Error('forged-writer-source-sha-was-not-rejected');
    }
    const oversizedPaths = structuredClone(secondWriterFrameReceipt) as unknown as {
      pieces: [{ sourcePathIds: number[] }, { sourcePathIds: number[] }];
    };
    oversizedPaths.pieces[0].sourcePathIds = [0, 1, 2, 3, 4];
    const oversized = localFrameRequest(oversizedPaths);
    if (oversized.ok || oversized.blocker.code !== 'invalid-input') {
      throw new Error('oversized-source-path-list-was-not-rejected');
    }
    let requestGetterCalls = 0;
    const accessorRequest: Record<string, unknown> = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_LOCAL_FRAME_PREFLIGHT_REQUEST_V2,
      composerSnapshot: secondCompile.composerSnapshot,
      projection: secondProjection,
    };
    Object.defineProperty(accessorRequest, 'writerFrameReceipt', {
      enumerable: true,
      get: () => {
        requestGetterCalls += 1;
        return secondWriterFrameReceipt;
      },
    });
    const accessorRequestResult =
      evaluatePatternImportDxfProductSavedAnnularLocalFramePreflightV2(accessorRequest);
    if (
      accessorRequestResult.ok ||
      accessorRequestResult.blocker.code !== 'invalid-input' ||
      requestGetterCalls !== 0
    ) {
      throw new Error('local-frame-request-accessor-was-not-rejected-without-call');
    }
    let receiptPieceGetterCalls = 0;
    const accessorReceipt = structuredClone(secondWriterFrameReceipt) as unknown as {
      pieces: [Record<string, unknown>, Record<string, unknown>];
    };
    Object.defineProperty(accessorReceipt.pieces[0], 'sourceApexMm', {
      enumerable: true,
      get: () => {
        receiptPieceGetterCalls += 1;
        return [0, 0];
      },
    });
    const accessorReceiptResult = localFrameRequest(accessorReceipt);
    if (
      accessorReceiptResult.ok ||
      accessorReceiptResult.blocker.code !== 'invalid-input' ||
      receiptPieceGetterCalls !== 0
    ) {
      throw new Error('writer-frame-piece-accessor-was-not-rejected-without-call');
    }
    const hostileReceipt = new Proxy(structuredClone(secondWriterFrameReceipt), {
      ownKeys: () => {
        throw new Error('hostile receipt ownKeys');
      },
    });
    const hostileReceiptResult = localFrameRequest(hostileReceipt);
    if (hostileReceiptResult.ok || hostileReceiptResult.blocker.code !== 'invalid-input') {
      throw new Error('hostile-writer-frame-receipt-proxy-was-not-rejected');
    }
    const oversizedSourceApex = structuredClone(secondWriterFrameReceipt) as unknown as {
      pieces: [{ sourceApexMm: number[] }, { sourceApexMm: number[] }];
    };
    oversizedSourceApex.pieces[0].sourceApexMm[0] = 1_000_001;
    const oversizedSourceApexResult = localFrameRequest(oversizedSourceApex);
    if (
      oversizedSourceApexResult.ok ||
      oversizedSourceApexResult.blocker.code !== 'invalid-input'
    ) {
      throw new Error('oversized-writer-frame-source-apex-was-not-rejected');
    }
    const firstBoundarySourceCurveIdentitySha256 =
      await boundarySourceCurveIdentitySha256(firstProjection);
    const secondBoundarySourceCurveIdentitySha256 =
      await boundarySourceCurveIdentitySha256(secondProjection);
    if (firstBoundarySourceCurveIdentitySha256 !== secondBoundarySourceCurveIdentitySha256) {
      throw new Error('independent-saved-source-curve-lineage-mismatch');
    }
    const boundarySourceCurveCounts = secondProjection.mesh.pieceRanges.map(({ pieceId }) => ({
      pieceId,
      sourceCurveCount: new Set(
        secondProjection.mesh.boundarySamples
          .filter((sample) => sample.pieceId === pieceId)
          .map(({ sourceCurveId }) => sourceCurveId),
      ).size,
    }));
    const sourcePathLineage = Object.freeze({
      sourcePathCoordinateSha256: secondComposed.aggregate.sourceBinding.sourcePathCoordinateSha256,
      boundarySourceCurveIdentitySha256: secondBoundarySourceCurveIdentitySha256,
      boundarySourceCurveCounts: Object.freeze(
        boundarySourceCurveCounts.map((entry) => Object.freeze(entry)),
      ),
      seams: Object.freeze(
        secondComposed.aggregate.seams.map((seam) =>
          Object.freeze({
            seamId: seam.id,
            sides: Object.freeze(
              seam.sides.map((side) =>
                Object.freeze({
                  pieceId: side.pieceId,
                  sourcePathId: side.sourcePathId,
                  authoredAnchors: Object.freeze([...side.authoredAnchors]) as readonly [
                    string,
                    string,
                  ],
                }),
              ),
            ),
          }),
        ),
      ),
    });
    if (savedFetchCount !== 2 || inProcessWorkerSessionCount !== 2)
      throw new Error(
        `expected two saved reprocesses, observed fetch/session ${String(savedFetchCount)}/${String(inProcessWorkerSessionCount)}`,
      );
    return Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ANNULAR_EVIDENCE_V1,
      sourceFileId: secondNative.sourceFileId,
      sourceSha256: seed.row.sha256,
      savedFetchCount: 2 as const,
      inProcessWorkerSessionCount: 2 as const,
      composerCompileCount: 2 as const,
      compositionRequest: secondComposition,
      compile: secondCompile,
      deterministicReplay: Object.freeze({
        composerCanonicalSha256: secondCompile.composerSnapshot.seal.canonicalSha256,
        phase2ArtifactSha256: secondCompile.composerSnapshot.seals.phase2ArtifactSha256,
        meshDeterministicFingerprint: secondCompile.composerSnapshot.mesh.deterministicFingerprint,
        restPositions2Sha256: secondRestSha256,
        trianglesSha256: secondTrianglesSha256,
      }),
      writerFrameReceipt: secondWriterFrameReceipt,
      savedReplayFrameProbe: secondReplayFrameProbe,
      localFrameHostileChecks: Object.freeze({
        shiftedAffineRejected: true as const,
        forgedSourceShaRejected: true as const,
        oversizedSourcePathListRejected: true as const,
        requestAccessorRejectedWithoutCall: true as const,
        receiptPieceAccessorRejectedWithoutCall: true as const,
        hostileReceiptProxyRejected: true as const,
        oversizedSourceApexRejected: true as const,
      }),
      placementPreflight: preflight.report,
      localFramePreflight: localFramePreflight.report,
      sourcePathLineage,
      native: secondNative,
    });
  } finally {
    secondSession.dispose();
    firstSession.dispose();
    secondNativeOwner.dispose();
    firstNativeOwner.dispose();
    host.dispose();
  }
}
