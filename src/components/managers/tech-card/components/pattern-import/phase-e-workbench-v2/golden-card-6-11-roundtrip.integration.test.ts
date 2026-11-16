import { describe, expect, it, vi } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1,
  type PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1,
  type PatternImportDxfPhaseEGoldenCardFullExactConnectionV1,
} from './golden-card-full-exact-capture-aggregator-v1';
import {
  projectPatternImportDxfPhaseEGoldenCardAuthoritativeBaselineV1,
  type PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
} from './golden-card-authoritative-baseline-projector-v1';
import {
  runPatternImportDxfPhaseEGoldenCardPostSaveRoundtripV1,
  type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripCapabilitiesV1,
  type PatternImportDxfPhaseEGoldenCardRoundtripEvidenceV1,
} from './golden-card-post-save-roundtrip-owner-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1,
  appendPatternImportDxfPhaseEGoldenCardReconstructionOperationV1,
  finalizePatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
  startPatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1,
  type PatternImportDxfPhaseEGoldenCardSuiteProfileV1,
} from './golden-card-suite-profiles-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1 } from './stitch-visual-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
  type PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1,
} from './golden-whole-card-baseline-v1';

const CATALOG_SHA = 'a'.repeat(64);
const SIZE_SHA = 'b'.repeat(64);
const TOPOLOGY_SHA = 'c'.repeat(64);
const SOURCE_SHA = 'd'.repeat(64);
const RECEIPT_SHA = 'e'.repeat(64);
const THREAD_BOM_KEY = 'bom-thread';

const STITCH = Object.freeze({
  schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
  seam: Object.freeze({ kind: 'join', classValue: '301', classLabel: 'Plain seam' }),
  stitch: Object.freeze({ densityPerCm: 4, widthMm: 1 }),
  topstitch: Object.freeze({
    mode: 'OS_TOPSTITCH',
    modeLabel: 'Topstitch',
    offsetMm: 6,
    offsetLabel: '6 mm',
    rows: 1,
  }),
  machine: Object.freeze({ needleGaugeMm: 4.8, rowSpacingMm: 4.8 }),
  thread: Object.freeze({ bomLineKey: THREAD_BOM_KEY }),
});

type Scenario = Readonly<{
  profile: PatternImportDxfPhaseEGoldenCardSuiteProfileV1;
  beforeRequest: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1;
  coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1;
  tableReconstruction: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
}>;

function connection(
  profile: PatternImportDxfPhaseEGoldenCardSuiteProfileV1,
  index: number,
  pieceIds: readonly string[],
  pieceLineKeys: readonly string[],
): PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 {
  const connectionRef = `seam-${profile.facts.techCardId}-${index}`;
  const side = (sideIndex: 0 | 1) => {
    const pieceIndex = index * 2 + sideIndex;
    return Object.freeze({
      seamId: connectionRef,
      sideIndex,
      pieceId: pieceIds[pieceIndex],
      pieceLineKey: pieceLineKeys[pieceIndex],
      contourId: `contour-${profile.facts.techCardId}-${pieceIndex + 1}`,
      boundaryVertexIds: Object.freeze([
        `vertex-${profile.facts.techCardId}-${pieceIndex + 1}-0`,
        `vertex-${profile.facts.techCardId}-${pieceIndex + 1}-1`,
      ] as const),
      direction: sideIndex === 0 ? ('forward' as const) : ('reverse' as const),
    });
  };
  return Object.freeze({
    connectionRef,
    operationNumber: 1,
    authoringOperationId: `operation-${profile.facts.techCardId}-1`,
    row: Object.freeze({
      techCardId: profile.facts.techCardId,
      scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
      patternLineKey: `pattern-main-${profile.facts.techCardId}`,
      revision: 1,
      cardLockVersion: profile.facts.cardVersion,
      url: `https://objects.example/card-${profile.facts.techCardId}/main.dxf`,
      sizeBytes: 1,
      sha256: SOURCE_SHA,
    }),
    serverTopologySha256: TOPOLOGY_SHA,
    catalogCanonicalSha256: CATALOG_SHA,
    sides: Object.freeze([side(0), side(1)] as const),
  });
}

function requestFor(
  profile: PatternImportDxfPhaseEGoldenCardSuiteProfileV1,
  serverAssemblyRevision: string,
): PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1 {
  const pieceIds = Array.from(
    { length: profile.facts.listedPieceRefCount },
    (_, index) => `piece-${profile.facts.techCardId}-${index + 1}`,
  );
  const pieceLineKeys = pieceIds.map(
    (_, index) => `piece-line-${profile.facts.techCardId}-${index + 1}`,
  );
  const pieces = pieceIds.map((pieceId, index) => ({
    pieceId,
    pieceLineKey: pieceLineKeys[index],
    contours: [
      {
        contourId: `contour-${profile.facts.techCardId}-${index + 1}`,
        role: 'sewing-boundary' as const,
        geometry: { kind: 'seam' as const },
        closed: true,
        boundaryVertices: [0, 1, 2].map((ordinal) => ({
          ordinal,
          vertexId: `vertex-${profile.facts.techCardId}-${index + 1}-${ordinal}`,
          normalizedArc: ordinal / 2,
        })),
      },
    ],
  }));
  const connections = Object.freeze([
    connection(profile, 0, pieceIds, pieceLineKeys),
    connection(profile, 1, pieceIds, pieceLineKeys),
  ]);
  const operations = Array.from({ length: profile.facts.operationCount }, (_, index) => {
    const operationNumber = index + 1;
    const seamKeys =
      operationNumber === 1 ? connections.map(({ connectionRef }) => connectionRef) : [];
    return Object.freeze({
      operationNumber,
      work: `operation-family-${operationNumber}`,
      inputKeys: Object.freeze([pieceLineKeys[index % pieceLineKeys.length]]),
      outputUnitKey: '',
      outputUnitName: '',
      seamKeys: Object.freeze(seamKeys),
      exactConnections: operationNumber === 1 ? connections : Object.freeze([]),
    });
  });
  const currentOperations = operations.map((operation) => ({
    operationNumber: operation.operationNumber,
    work: operation.work,
    inputKeys: operation.inputKeys,
    outputUnitKey: operation.outputUnitKey,
    outputUnitName: operation.outputUnitName,
    seamKeys: operation.seamKeys,
    stitch: operation.operationNumber === 1 ? STITCH : null,
  }));

  return structuredClone({
    observedFacts: profile.facts,
    expectedCardLockVersion: profile.facts.cardVersion,
    expectedServerAssemblyRevision: serverAssemblyRevision,
    graph: {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1,
      cardRef: profile.cardRef,
      techCardId: profile.facts.techCardId,
      cardLockVersion: profile.facts.cardVersion,
      serverAssemblyRevision,
      operations,
      connections,
      claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1,
    } satisfies PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1,
    currentCard: {
      techCardId: profile.facts.techCardId,
      cardLockVersion: profile.facts.cardVersion,
      operationCount: profile.facts.operationCount,
      materialAssignmentCount: 1,
      bomRefCount: 1,
      colorwayCount: 1,
      catalog: {
        canonicalSha256: CATALOG_SHA,
        sizeSelectionCanonicalSha256: SIZE_SHA,
        sourceFileId: `source-file-${profile.facts.techCardId}`,
        pieces,
      },
      currentOperations,
      operationBindings: operations.map((operation) => ({
        operationNumber: operation.operationNumber,
        operationRef: `operation-${profile.facts.techCardId}-${operation.operationNumber}`,
        stage: 0,
        kind: operation.operationNumber === 1 ? ('stitch' as const) : ('place' as const),
      })),
      connectionRecipes: connections.map(({ connectionRef }) => ({
        connectionRef,
        mapping: 'equal' as const,
        lengthRatio: 1,
      })),
      materials: [
        {
          id: `material-${profile.facts.techCardId}`,
          pieceIds,
          materialRevision: `material-revision-${profile.facts.techCardId}`,
        },
      ],
      bomRefs: [
        {
          lineKey: THREAD_BOM_KEY,
          section: 'TECH_CARD_BOM_SECTION_THREAD',
          kind: 'TECH_CARD_BOM_KIND_SEWING_THREAD',
          materialAssignmentRef: `material-${profile.facts.techCardId}`,
        },
      ],
      colorways: [
        {
          colorwayRef: `colorway-${profile.facts.techCardId}`,
          usages: [
            {
              bomLineKey: THREAD_BOM_KEY,
              pieceLineKey: pieceLineKeys[0],
              materialAssignmentRef: `material-${profile.facts.techCardId}`,
            },
          ],
        },
      ],
    },
  });
}

function coverageFor(
  profile: PatternImportDxfPhaseEGoldenCardSuiteProfileV1,
): PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
    cardRef: profile.cardRef,
    exactCoverageStatus: 'complete' as const,
    structuralOperationCount: profile.facts.operationCount,
    stylingOperationCount: profile.facts.operationCount,
    seamBearingOperationCount: 1,
    exactEligibleOperationCount: 1,
    exactOperationCount: 1,
    missingExactOperationCount: 0,
    unsupportedExactOperationCount: 0,
    operations: Object.freeze(
      Array.from({ length: profile.facts.operationCount }, (_, index) =>
        index === 0
          ? Object.freeze({
              operationNumber: 1,
              seamCount: 2,
              status: 'exact' as const,
              reason: 'exact-selected-operation-projection-provided' as const,
            })
          : Object.freeze({
              operationNumber: index + 1,
              seamCount: 0,
              status: 'not-applicable' as const,
              reason: 'operation-has-no-seams' as const,
            }),
      ),
    ),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1,
  });
}

function reconstructFromTable(
  baseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 {
  const started = startPatternImportDxfPhaseEGoldenCardReconstructionHarnessV1(baseline);
  if (!started.ok) throw new Error(started.blocker.detail);
  let session = started.session;
  for (const operation of baseline.operations) {
    const ownedConnections = baseline.connections.filter(
      ({ operationRef }) => operationRef === operation.operationRef,
    );
    const appended = appendPatternImportDxfPhaseEGoldenCardReconstructionOperationV1(
      session,
      operation,
      ownedConnections,
    );
    if (!appended.ok) throw new Error(appended.blocker.detail);
    session = appended.session;
  }
  const verified = finalizePatternImportDxfPhaseEGoldenCardReconstructionHarnessV1(
    session,
    baseline,
  );
  if (!verified.ok || verified.report.status !== 'match')
    throw new Error(verified.ok ? 'table reconstruction mismatched' : verified.blocker.detail);
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1,
    cardRef: session.cardRef,
    catalog: session.catalog,
    connections: session.connections,
    operations: session.operations,
    materials: session.materials,
    bomRefs: session.bomRefs,
    colorways: session.colorways,
  });
}

function scenario(profile: PatternImportDxfPhaseEGoldenCardSuiteProfileV1): Scenario {
  const beforeRequest = requestFor(profile, `assembly-${profile.facts.techCardId}-before`);
  const projected = projectPatternImportDxfPhaseEGoldenCardAuthoritativeBaselineV1(beforeRequest);
  if (!projected.ok) throw new Error(projected.blockers[0].detail);
  return Object.freeze({
    profile,
    beforeRequest,
    coverage: coverageFor(profile),
    tableReconstruction: reconstructFromTable(projected.baseline),
  });
}

function evidence(
  item: Scenario,
  projectorRequest: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
): PatternImportDxfPhaseEGoldenCardRoundtripEvidenceV1 {
  return Object.freeze({
    projectorRequest,
    wholeCardCoverage: item.coverage,
    observedOperationFamilies: item.profile.requiredOperationFamilies,
  });
}

function mutateFirstSavedEdgeDirection(
  request: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
): PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1 {
  const changed = structuredClone(request);
  const first = changed.graph.connections[0];
  const direction = first.sides[0].direction === 'forward' ? 'reverse' : 'forward';
  const mutatedConnection: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1 = {
    ...first,
    sides: [{ ...first.sides[0], direction }, first.sides[1]],
  };
  return {
    ...changed,
    graph: {
      ...changed.graph,
      connections: [mutatedConnection, ...changed.graph.connections.slice(1)],
      operations: changed.graph.operations.map((operation, index) =>
        index === 0
          ? {
              ...operation,
              exactConnections: [mutatedConnection, ...operation.exactConnections.slice(1)],
            }
          : operation,
      ),
    },
  };
}

describe('production cards 6 and 11 Assembly Table round-trip gate', () => {
  it.each(PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1)(
    'reconstructs every operation and accepts verified save/readback for $cardRef',
    async (profile) => {
      const item = scenario(profile);
      const freshRevision = `assembly-${profile.facts.techCardId}-after`;
      const freshRequest = requestFor(profile, freshRevision);
      const saveThroughExistingOwner = vi.fn(async () => ({
        ok: true as const,
        status: 'verified' as const,
        techCardId: profile.facts.techCardId,
        cardRef: profile.cardRef,
        cardLockVersion: profile.facts.cardVersion,
        serverAssemblyRevision: freshRevision,
        postSaveReceiptSha256: RECEIPT_SHA,
      }));
      const readFreshAfterSave = vi.fn(async () => evidence(item, freshRequest));
      const capabilities: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripCapabilitiesV1 = {
        saveThroughExistingOwner,
        readFreshAfterSave,
      };

      const result = await runPatternImportDxfPhaseEGoldenCardPostSaveRoundtripV1(
        capabilities,
        {
          beforeSave: evidence(item, item.beforeRequest),
          tableReconstruction: item.tableReconstruction,
        },
        new AbortController().signal,
      );

      expect(result).toMatchObject({
        status: 'accepted',
        techCardId: profile.facts.techCardId,
        cardRef: profile.cardRef,
        blocker: null,
        acceptance: { status: 'accepted', blockers: [] },
      });
      expect(item.tableReconstruction.operations).toHaveLength(profile.facts.operationCount);
      expect(item.tableReconstruction.catalog.pieces).toHaveLength(
        profile.facts.listedPieceRefCount,
      );
      expect(item.tableReconstruction.connections).toHaveLength(2);
      expect(saveThroughExistingOwner).toHaveBeenCalledTimes(1);
      expect(readFreshAfterSave).toHaveBeenCalledWith(
        {
          techCardId: profile.facts.techCardId,
          cardRef: profile.cardRef,
          cardLockVersion: profile.facts.cardVersion,
          serverAssemblyRevision: freshRevision,
          postSaveReceiptSha256: RECEIPT_SHA,
        },
        expect.any(AbortSignal),
      );
    },
  );

  it('blocks card 11 when fresh readback changes a connected edge direction', async () => {
    const profile = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
      ({ facts }) => facts.techCardId === 11,
    )!;
    const item = scenario(profile);
    const freshRevision = 'assembly-11-after-mutated-edge';
    const changedFreshRequest = mutateFirstSavedEdgeDirection(requestFor(profile, freshRevision));
    const capabilities: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripCapabilitiesV1 = {
      saveThroughExistingOwner: async () => ({
        ok: true,
        status: 'verified',
        techCardId: 11,
        cardRef: profile.cardRef,
        cardLockVersion: profile.facts.cardVersion,
        serverAssemblyRevision: freshRevision,
        postSaveReceiptSha256: RECEIPT_SHA,
      }),
      readFreshAfterSave: async () => evidence(item, changedFreshRequest),
    };

    const result = await runPatternImportDxfPhaseEGoldenCardPostSaveRoundtripV1(
      capabilities,
      {
        beforeSave: evidence(item, item.beforeRequest),
        tableReconstruction: item.tableReconstruction,
      },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      status: 'blocked',
      blocker: { code: 'post-save-acceptance-blocked' },
      acceptance: {
        status: 'blocked',
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: 'post-save-reload-mismatch' }),
        ]),
      },
    });
  });
});
