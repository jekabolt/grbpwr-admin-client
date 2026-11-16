import { useState } from 'react';
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

const TECH_CARD_ID = 6;
const IMPORT_GENERATION = 12;
const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const POCKETING = 'TECH_CARD_BOM_PURPOSE_POCKETING';
const LINING = 'TECH_CARD_BOM_PURPOSE_LINING';
const SHA = 'a'.repeat(64);

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
  ],
  current,
});
if (!allScope.ok) throw new Error(allScope.blocker.detail);

function MaterialScopeBrowserSmoke() {
  const [activeScopeKey, setActiveScopeKey] = useState(MAIN);
  const [selection, setSelection] =
    useState<PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null>(null);

  return (
    <TooltipProvider>
      <main
        className='h-screen overflow-hidden bg-pageBg p-3'
        data-material-scope-browser-smoke=''
        data-active-scope={activeScopeKey}
        data-selected-scope={selection?.scopeKey ?? undefined}
        data-selected-piece={selection?.pieceId ?? undefined}
      >
        <section className='flex h-full min-h-0 flex-col border border-borderColor bg-bgColor'>
          <header className='border-b border-borderColor p-2'>
            <PatternImportDxfPhaseECadMaterialScopeBrowserV1
              catalog={uiCatalog}
              active={{ techCardId: TECH_CARD_ID, scopeKey: activeScopeKey }}
              preparedScopeKeys={[MAIN, POCKETING]}
              onSelectPreparedScope={setActiveScopeKey}
            />
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
