import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from 'ui';

import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1,
  type PatternImportDxfPhaseECadMaterialScopeCatalogResultV1,
  type PatternImportDxfPhaseECadMaterialScopeV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-material-scope-catalog-v1';
import { PatternImportDxfPhaseECadMaterialScopeBrowserV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-material-scope-browser-v1';
import {
  collectPatternImportDxfPhaseECadMannequinPreparedScopeStagingV1,
  type PatternImportDxfPhaseECadMannequinMaterialScopeV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-mannequin-all-scope-staging-v1';
import {
  PatternImportDxfPhaseECadMannequinDxfStagingV1,
  type PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1,
  type PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-mannequin-dxf-staging-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  applyPatternImportDxfPhaseEDraftCadArrangementActionV1,
  reconcilePatternImportDxfPhaseEDraftCadArrangementScopeV1,
  selectPatternImportDxfPhaseEDraftCadArrangementPiecesV1,
  updatePatternImportDxfPhaseEDraftCadArrangementScopeMapV1,
  type PatternImportDxfPhaseEDraftCadArrangementByScopeV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-arrangement-v1';
import {
  createPatternImportDxfPhaseEDraftCadSessionV1,
  recordPatternImportDxfPhaseEDraftCadTransactionV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-session-v1';
import {
  derivePatternImportDxfPhaseEDraftCadTopologySourceIdentityV1,
  selectPatternImportDxfPhaseEDraftCadTopologyAnchorV1,
  selectPatternImportDxfPhaseEDraftCadTopologyToolV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-topology-session-v1';
import {
  publishPatternImportDxfPhaseEDraftCadTopologyScopeV1,
  reconcilePatternImportDxfPhaseEDraftCadTopologyScopeMapV1,
  updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1,
  type PatternImportDxfPhaseEDraftCadTopologyByScopeV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-topology-scope-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
  requestPatternImportDxfPhaseECadCommandCompiledReimportV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-command-compiled-reimport-handoff-v1';
import type { PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-geometry-compile-v1';
import { registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/patterns-field-compiled-reimport-owner-v1';

const TECH_CARD_ID = 6;
const IMPORT_GENERATION = 12;
const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const POCKETING = 'TECH_CARD_BOM_PURPOSE_POCKETING';
const LINING = 'TECH_CARD_BOM_PURPOSE_LINING';
const SHA = 'a'.repeat(64);

const secondaryCompiledArtifact = Object.freeze({
  schemaVersion: 'pattern-import-dxf-phase-e-draft-cad-geometry-compile/1',
  status: 'compiled-reimport-required',
  source: Object.freeze({
    revision: 7,
    sourceFileId: 'card11-LINING.dxf',
    sourceSha256: SHA,
    selectedGeometrySha256: 'b'.repeat(64),
    catalogCanonicalSha256: 'c'.repeat(64),
    sizeSelectionCanonicalSha256: 'd'.repeat(64),
  }),
  scope: Object.freeze({ techCardId: TECH_CARD_ID, scopeKey: LINING, sizeToken: 'M' }),
  compiledJob: Object.freeze({}) as never,
  dxfText: '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n',
  manifest: Object.freeze({}) as never,
  warnings: Object.freeze([]),
  compiledFeatures: Object.freeze([]),
  reimport: Object.freeze({
    required: true,
    boundary: 'ordinary-import-semantics-phase-d-phase-e',
    applyEligible: false,
  }),
  claims: Object.freeze({}) as never,
}) as PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1;

const piece = (pieceId: string, pieceLineKey: string, x: number) => ({
  pieceId,
  pieceLineKey,
  contours: [
    {
      contourId: `${pieceId}:cut`,
      role: 'cut-boundary' as const,
      closed: true,
      vertices: [
        { ordinal: 0, vertexId: `${pieceId}:v0`, normalizedArc: 0, pointMm: { x, y: 0 } },
        {
          ordinal: 1,
          vertexId: `${pieceId}:v1`,
          normalizedArc: 0.25,
          pointMm: { x: x + 40, y: 0 },
        },
        {
          ordinal: 2,
          vertexId: `${pieceId}:v2`,
          normalizedArc: 0.5,
          pointMm: { x: x + 40, y: 80 },
        },
        {
          ordinal: 3,
          vertexId: `${pieceId}:v3`,
          normalizedArc: 0.75,
          pointMm: { x, y: 80 },
        },
      ],
    },
  ],
  cameraMm: { minX: x, minY: 0, maxX: x + 40, maxY: 80, padding: 4 },
});

const projection = (
  sourceFileId: string,
  pieces: PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'],
): PatternImportDxfProductPhaseEAssemblyProjectionV1 => ({
  schemaVersion: 'pattern-import-dxf-product-phase-e-assembly-projection/1',
  expectedCatalogCanonicalSha256: SHA,
  sizeSelectionCanonicalSha256: SHA,
  sourceFileId,
  sizeToken: 'M',
  joinMode: 'catalog-ordinal-to-phase-d-point',
  pieces,
  geometryPlacementApplied: false,
});

const mainProjection = projection('card6-MAIN.dxf', [
  piece('front', 'FRONT', 0),
  piece('back', 'BACK', 60),
]);
const pocketingProjection = projection('card6-POCKETING.dxf', [piece('pocket', 'PCK_L', 0)]);
const liningProjection = projection('card11-LINING.dxf', [piece('lining', 'LINING_FRONT', 0)]);

const scope = (
  scopeKey: string,
  label: string,
  pieceLineKeys: readonly string[],
): PatternImportDxfPhaseECadMaterialScopeV1 =>
  Object.freeze({
    scopeKey,
    label,
    fabricPurpose: scopeKey,
    bomLineKey: `BOM:${scopeKey}`,
    isInterlining: false,
    filename: `${label}.dxf`,
    pieceLineKeys: Object.freeze(pieceLineKeys),
    blockNames: Object.freeze(pieceLineKeys.map((key) => `${key}_M`)),
  });

const uiCatalog: PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 = Object.freeze({
  ok: true as const,
  techCardId: TECH_CARD_ID,
  scopes: Object.freeze([
    scope(MAIN, 'Main', ['FRONT', 'BACK']),
    scope(POCKETING, 'Pocketing', ['PCK_L']),
    scope(LINING, 'Lining', ['LINING_FRONT']),
  ]),
  pieceScopeKeys: Object.freeze({
    FRONT: Object.freeze([MAIN]),
    BACK: Object.freeze([MAIN]),
    PCK_L: Object.freeze([POCKETING]),
    LINING_FRONT: Object.freeze([LINING]),
  }),
  blocker: null,
  claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1,
});

const preparedCatalogScopes: readonly PatternImportDxfPhaseECadMannequinMaterialScopeV1[] =
  Object.freeze([
    Object.freeze({ scopeKey: MAIN, label: 'Main' }),
    Object.freeze({ scopeKey: POCKETING, label: 'Pocketing' }),
    Object.freeze({ scopeKey: LINING, label: 'Lining' }),
  ]);

const current: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 = Object.freeze({
  scopeKey: MAIN,
  label: 'Main',
  projection: mainProjection,
});
const allScope = collectPatternImportDxfPhaseECadMannequinPreparedScopeStagingV1({
  techCardId: TECH_CARD_ID,
  importGeneration: IMPORT_GENERATION,
  catalogScopes: preparedCatalogScopes,
  preparedScopes: [
    {
      scopeKey: MAIN,
      sourceRevision: IMPORT_GENERATION,
      documentEvidence: { techCardId: TECH_CARD_ID, scopeKey: MAIN },
      projection: mainProjection,
    },
    {
      scopeKey: POCKETING,
      sourceRevision: IMPORT_GENERATION,
      documentEvidence: { techCardId: TECH_CARD_ID, scopeKey: POCKETING },
      projection: pocketingProjection,
    },
    {
      scopeKey: LINING,
      sourceRevision: IMPORT_GENERATION,
      documentEvidence: { techCardId: TECH_CARD_ID, scopeKey: LINING },
      projection: liningProjection,
    },
  ],
  current,
});
if (!allScope.ok) throw new Error(allScope.blocker.detail);

function draftSession(
  scopeKey: string,
  scopeProjection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): PatternImportDxfPhaseEDraftCadSessionV1 {
  const result = createPatternImportDxfPhaseEDraftCadSessionV1({
    phaseD: {
      sourceFileId: scopeProjection.sourceFileId,
      sourceSha256: SHA,
      selectedGeometrySha256: SHA,
    },
    catalog: {
      canonicalSha256: SHA,
      sizeSelectionCanonicalSha256: SHA,
      pieces: scopeProjection.pieces.map(({ pieceId, pieceLineKey }) => ({
        pieceId,
        pieceLineKey,
      })) as never,
    },
    revision: IMPORT_GENERATION,
  });
  if (!result.ok) throw new Error(`${scopeKey}: ${result.blocker.detail}`);
  return result.session;
}

const initialDraftSessions = Object.freeze({
  [MAIN]: draftSession(MAIN, mainProjection),
  [POCKETING]: draftSession(POCKETING, pocketingProjection),
  [LINING]: draftSession(LINING, liningProjection),
});

const projectionByScope = Object.freeze({
  [MAIN]: mainProjection,
  [POCKETING]: pocketingProjection,
  [LINING]: liningProjection,
});

function MaterialScopeBrowserSmoke() {
  const [activeScopeKey, setActiveScopeKey] = useState(MAIN);
  const [selection, setSelection] =
    useState<PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null>(null);
  const [draftSessions, setDraftSessions] = useState(initialDraftSessions);
  const [arrangements, setArrangements] =
    useState<PatternImportDxfPhaseEDraftCadArrangementByScopeV1>({});
  const [topology, setTopology] = useState<PatternImportDxfPhaseEDraftCadTopologyByScopeV1>({});
  const [compiledReview, setCompiledReview] = useState<{
    scopeKey: string;
    fileName: string;
  } | null>(null);
  const compiledReviewOpen = useRef(false);
  const activeProjection = projectionByScope[activeScopeKey as keyof typeof projectionByScope];
  const activeSession = draftSessions[activeScopeKey as keyof typeof draftSessions];

  useEffect(
    () =>
      registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1({
        techCardId: TECH_CARD_ID,
        readConfirmedImportGeneration: () => 0,
        scopeAvailable: (scopeKey) => [MAIN, POCKETING, LINING].includes(scopeKey),
        reviewAlreadyOpen: () => compiledReviewOpen.current,
        openExistingImportReview: ({ scopeKey, files }) => {
          compiledReviewOpen.current = true;
          setCompiledReview({ scopeKey, fileName: files[0].name });
        },
      }),
    [],
  );

  const recordActiveEdit = () => {
    const target = activeSession.source.catalog.pieces[0];
    if (!target) return;
    const recorded = recordPatternImportDxfPhaseEDraftCadTransactionV1(activeSession, {
      transactionId: `${activeScopeKey}:browser-edit:${activeSession.cursor + 1}`,
      label: 'Browser saved-scope edit',
      commands: [
        {
          commandId: `${activeScopeKey}:mark:${activeSession.cursor + 1}`,
          tool: 'mark',
          target,
          payload: {
            entityId: `${activeScopeKey}:entity:${activeSession.cursor + 1}`,
            pointMm: { x: 10, y: 10 },
            kind: 'drill',
          },
        },
      ],
    });
    if (!recorded.ok) throw new Error(recorded.blocker.detail);
    setDraftSessions((current) =>
      Object.freeze({ ...current, [activeScopeKey]: recorded.session }),
    );
  };

  const arrangeActive = () => {
    const pieceIds = activeProjection.pieces.map(({ pieceId }) => pieceId);
    const current = reconcilePatternImportDxfPhaseEDraftCadArrangementScopeV1(
      arrangements[activeScopeKey],
      activeScopeKey,
      pieceIds,
    );
    const selected = selectPatternImportDxfPhaseEDraftCadArrangementPiecesV1(
      current,
      pieceIds.slice(0, 1),
      pieceIds,
    );
    setArrangements((map) =>
      updatePatternImportDxfPhaseEDraftCadArrangementScopeMapV1(
        map,
        applyPatternImportDxfPhaseEDraftCadArrangementActionV1(selected, 'rotate-90'),
      ),
    );
  };

  const annotateActive = () => {
    const sourceIdentity = derivePatternImportDxfPhaseEDraftCadTopologySourceIdentityV1(
      activeSession,
      activeProjection,
    );
    const resolved = reconcilePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(
      topology,
      activeScopeKey,
      sourceIdentity,
    );
    const vertex = activeProjection.pieces[0]?.contours[0]?.vertices[0];
    const piece = activeProjection.pieces[0];
    const contour = piece?.contours[0];
    if (!piece || !contour || !vertex) return;
    const selected = selectPatternImportDxfPhaseEDraftCadTopologyAnchorV1(
      activeProjection,
      selectPatternImportDxfPhaseEDraftCadTopologyToolV1(resolved.scope.session, 'callout'),
      {
        pieceId: piece.pieceId,
        pieceLineKey: piece.pieceLineKey,
        contourId: contour.contourId,
        vertexId: vertex.vertexId,
      },
    );
    setTopology(
      updatePatternImportDxfPhaseEDraftCadTopologyScopeMapV1(
        resolved.map,
        publishPatternImportDxfPhaseEDraftCadTopologyScopeV1(resolved.scope, selected),
      ),
    );
  };

  return (
    <TooltipProvider>
      <main
        className='h-screen overflow-hidden bg-pageBg p-3'
        data-material-scope-browser-smoke=''
        data-active-scope={activeScopeKey}
        data-selected-scope={selection?.scopeKey ?? undefined}
        data-selected-piece={selection?.pieceId ?? undefined}
        data-main-session-cursor={draftSessions[MAIN].cursor}
        data-pocketing-session-cursor={draftSessions[POCKETING].cursor}
        data-main-arrangement-quarter-turns={
          arrangements[MAIN]?.transforms.front?.quarterTurns ?? 0
        }
        data-pocketing-arrangement-quarter-turns={
          arrangements[POCKETING]?.transforms.pocket?.quarterTurns ?? 0
        }
        data-main-topology-callouts={topology[MAIN]?.session.callouts.length ?? 0}
        data-pocketing-topology-callouts={topology[POCKETING]?.session.callouts.length ?? 0}
        data-lining-session-cursor={draftSessions[LINING].cursor}
        data-lining-arrangement-quarter-turns={
          arrangements[LINING]?.transforms.lining?.quarterTurns ?? 0
        }
        data-lining-topology-callouts={topology[LINING]?.session.callouts.length ?? 0}
        data-compiled-review-scope={compiledReview?.scopeKey ?? undefined}
        data-compiled-review-file={compiledReview?.fileName ?? undefined}
      >
        <section className='flex h-full min-h-0 flex-col border border-borderColor bg-bgColor'>
          <header className='border-b border-borderColor p-2'>
            <div className='flex items-center gap-2'>
              <PatternImportDxfPhaseECadMaterialScopeBrowserV1
                catalog={uiCatalog}
                active={{ techCardId: TECH_CARD_ID, scopeKey: activeScopeKey }}
                preparedScopeKeys={[MAIN, POCKETING, LINING]}
                onSelectPreparedScope={setActiveScopeKey}
              />
              <button type='button' data-smoke-edit-active='' onClick={recordActiveEdit}>
                Edit active
              </button>
              <button type='button' data-smoke-arrange-active='' onClick={arrangeActive}>
                Arrange active
              </button>
              <button type='button' data-smoke-topology-active='' onClick={annotateActive}>
                Annotate active
              </button>
              <button
                type='button'
                data-smoke-compile-secondary=''
                onClick={() =>
                  requestPatternImportDxfPhaseECadCommandCompiledReimportV1({
                    schemaVersion:
                      PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1,
                    artifact: secondaryCompiledArtifact,
                    confirmedImportGenerationAtCompile: 0,
                    cadSessionCursorAtCompile: 1,
                  })
                }
              >
                Compile secondary saved scope
              </button>
            </div>
          </header>
          <div className='relative min-h-0 flex-1 bg-pageBg' data-material-scope-stage=''>
            <PatternImportDxfPhaseECadMannequinDxfStagingV1
              sources={allScope.sources}
              activeScopeKey={activeScopeKey}
              selection={selection}
              onFocus={setSelection}
            />
          </div>
        </section>
      </main>
    </TooltipProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Material scope browser smoke root is unavailable.');
createRoot(root).render(<MaterialScopeBrowserSmoke />);
