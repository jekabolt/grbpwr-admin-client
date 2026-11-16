import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { TooltipProvider } from 'ui';

import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type {
  PatternImportDxfProductPhaseEAssemblyProjectionV1,
  PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type {
  PatternImportDxfProductPhaseEMultiseamProposalV2,
  PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import { PatternImportDxfPhaseECadMannequinDxfStagingV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-mannequin-dxf-staging-v1';
import {
  PatternImportDxfPhaseECadWorkbenchSplitShellV1,
  type PatternImportDxfPhaseECadWorkbenchSelectionV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-split-shell-v1';
import { PatternImportDxfProductPhaseEMultiseamWorkbenchV2 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/workbench';

const SHA = 'a'.repeat(64);
const PROPOSAL_SHA = 'b'.repeat(64);
const REQUIRED_FIELDS = [
  'documentId-and-revision',
  'physical-surface',
  'two-seam-sides-and-anchor-ranges',
  'side-directions',
  'mapping-and-length-ratio',
  'operation-stage-and-order',
  'immutable-material-revisions',
  'tolerances',
] as const;

const rectangles = [
  { pieceId: 'piece-front', pieceLineKey: 'FRONT', x: 0, y: 0, width: 220, height: 420 },
  { pieceId: 'piece-back', pieceLineKey: 'BACK', x: 300, y: 30, width: 210, height: 390 },
] as const;

function vertices(x: number, y: number, width: number, height: number, prefix: string) {
  return [
    { ordinal: 0, vertexId: `${prefix}:v0`, normalizedArc: 0, pointMm: { x, y } },
    { ordinal: 1, vertexId: `${prefix}:v1`, normalizedArc: 0.25, pointMm: { x: x + width, y } },
    {
      ordinal: 2,
      vertexId: `${prefix}:v2`,
      normalizedArc: 0.5,
      pointMm: { x: x + width, y: y + height },
    },
    {
      ordinal: 3,
      vertexId: `${prefix}:v3`,
      normalizedArc: 0.75,
      pointMm: { x, y: y + height },
    },
  ] as const;
}

const catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1 = {
  schemaVersion: 'pattern-import-dxf-product-phase-e-authoring-catalog/1',
  techCardId: 6,
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  sizeToken: 'M',
  sourceFileId: 'assembly-table-browser-smoke.dxf',
  sizeSelectionCanonicalSha256: SHA,
  pieces: rectangles.map(({ pieceId, pieceLineKey, x, y, width, height }) => {
    const sewing = vertices(x, y, width, height, `${pieceId}:sewing`);
    const cut = vertices(x - 8, y - 8, width + 16, height + 16, `${pieceId}:cut`);
    return {
      pieceId,
      pieceLineKey,
      contours: [
        {
          contourId: `${pieceId}:cut`,
          role: 'cut-boundary' as const,
          geometry: { kind: 'cut' as const },
          closed: true,
          boundaryVertices: cut.map(({ ordinal, vertexId, normalizedArc }) => ({
            ordinal,
            vertexId,
            normalizedArc,
          })),
        },
        {
          contourId: `${pieceId}:sewing`,
          role: 'sewing-boundary' as const,
          geometry: { kind: 'seam' as const },
          closed: true,
          boundaryVertices: sewing.map(({ ordinal, vertexId, normalizedArc }) => ({
            ordinal,
            vertexId,
            normalizedArc,
          })),
        },
      ],
    };
  }),
  requiredExplicitFields: REQUIRED_FIELDS,
  canonicalSha256: SHA,
  geometryCoordinatesExposed: false,
  rawDxfExposed: false,
  assemblyInferred: false,
  productionReady: false,
};

const projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 = {
  schemaVersion: 'pattern-import-dxf-product-phase-e-assembly-projection/1',
  expectedCatalogCanonicalSha256: SHA,
  sizeSelectionCanonicalSha256: SHA,
  sourceFileId: 'assembly-table-browser-smoke.dxf',
  sizeToken: 'M',
  joinMode: 'catalog-ordinal-to-phase-d-point',
  pieces: rectangles.map(({ pieceId, pieceLineKey, x, y, width, height }) => ({
    pieceId,
    pieceLineKey,
    contours: [
      {
        contourId: `${pieceId}:cut`,
        role: 'cut-boundary' as const,
        closed: true,
        vertices: vertices(x - 8, y - 8, width + 16, height + 16, `${pieceId}:cut`),
      },
      {
        contourId: `${pieceId}:sewing`,
        role: 'sewing-boundary' as const,
        closed: true,
        vertices: vertices(x, y, width, height, `${pieceId}:sewing`),
      },
    ],
    cameraMm: {
      minX: x - 20,
      minY: y - 20,
      maxX: x + width + 20,
      maxY: y + height + 20,
      padding: 20,
    },
  })),
  geometryPlacementApplied: false,
};

const front = rectangles[0];
const back = rectangles[1];
const proposalSide = (piece: (typeof rectangles)[number], sourceSide: 'A' | 'B', edge: 0 | 2) => ({
  pieceId: piece.pieceId,
  pieceLineKey: piece.pieceLineKey,
  sourceSide,
  requiredDirection: sourceSide === 'A' ? ('forward' as const) : ('reverse' as const),
  evidence: {
    pieceLineKey: piece.pieceLineKey,
    edgeHint: `${piece.pieceId}:sewing#${edge}`,
    range: [0, 1] as const,
    lenMm: piece.width,
    contourSig: `${piece.pieceId}:sewing`,
  },
});

const proposal: PatternImportDxfProductPhaseEMultiseamProposalV2 = {
  schemaVersion: 'pattern-import-dxf-product-phase-e-multiseam-proposal/2',
  status: 'proposal-not-authority',
  expectedCatalogCanonicalSha256: SHA,
  operation: {
    authoringOperationId: 'operation-10',
    sourceOperationNumber: 10,
    order: 0,
    work: 'Join side seams',
    inputKeys: [front.pieceLineKey, back.pieceLineKey],
    outputUnitKey: 'body',
    outputUnitName: 'Body',
    kind: 'stitch',
    seamIds: ['side-left', 'side-right'],
  },
  seams: [
    {
      id: 'side-left',
      kind: 'edge',
      anchoredSize: 'M',
      sourceDirection: 'reversed',
      sides: [proposalSide(front, 'A', 0), proposalSide(back, 'B', 0)],
    },
    {
      id: 'side-right',
      kind: 'edge',
      anchoredSize: 'M',
      sourceDirection: 'reversed',
      sides: [proposalSide(front, 'A', 2), proposalSide(back, 'B', 2)],
    },
  ],
  deterministicFingerprint: PROPOSAL_SHA,
};

const sideState = (pieceId: string, edge: 0 | 2, direction: 'forward' | 'reverse') => ({
  pieceId,
  contourId: `${pieceId}:sewing`,
  boundaryVertexIds: [`${pieceId}:sewing:v${edge}`, `${pieceId}:sewing:v${edge + 1}`],
  direction,
  confirmed: true,
});

const initialState: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2 = {
  schemaVersion: 'pattern-import-dxf-product-phase-e-multiseam-workbench-state/2',
  expectedCatalogCanonicalSha256: SHA,
  expectedProposalFingerprint: PROPOSAL_SHA,
  expectedImportGeneration: 1,
  documentId: 'tech-card:6',
  revision: 'fixture:1',
  expectedDocumentId: 'tech-card:6',
  expectedRevision: 'fixture:1',
  documentRevisionConfirmed: true,
  physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
  physicalSurfaceConfirmed: true,
  operationStage: 0,
  operationConfirmed: true,
  seams: [
    {
      seamId: 'side-left',
      mapping: 'equal',
      lengthRatio: 1,
      confirmed: true,
      sides: [sideState(front.pieceId, 0, 'forward'), sideState(back.pieceId, 0, 'reverse')],
    },
    {
      seamId: 'side-right',
      mapping: 'equal',
      lengthRatio: 1,
      confirmed: true,
      sides: [sideState(front.pieceId, 2, 'forward'), sideState(back.pieceId, 2, 'reverse')],
    },
  ],
  materialSelections: [
    { pieceId: front.pieceId, optionId: 'material-main', confirmed: true },
    { pieceId: back.pieceId, optionId: 'material-main', confirmed: true },
  ],
  tolerance: { endpointMm: 1, fullLengthMm: 2, fullLengthRelative: 0.01, confirmed: true },
};

const materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[] = [
  { id: 'material-main', label: 'Main fabric', materialRevision: 'main:1' },
];

function BrowserSmoke() {
  const [state, setState] = useState(initialState);
  const [activeSeamIndex, setActiveSeamIndex] = useState<0 | 1>(0);
  const [activePieceIndex, setActivePieceIndex] = useState<0 | 1>(0);
  const [shellSelection, setShellSelection] =
    useState<PatternImportDxfPhaseECadWorkbenchSelectionV1 | null>({
      operationNumber: 10,
      pieceId: null,
      seamId: null,
    });

  return (
    <TooltipProvider>
      <main className='h-screen min-h-0 overflow-hidden bg-pageBg' data-browser-smoke-root=''>
        <PatternImportDxfPhaseECadWorkbenchSplitShellV1
          selection={shellSelection}
          onSelectionFocus={({ selection }) => setShellSelection(selection)}
          defaultSplitPercent={64}
          defaultOperationsWidthPx={320}
          desktop={
            <PatternImportDxfProductPhaseEMultiseamWorkbenchV2
              catalog={catalog}
              projection={projection}
              proposal={proposal}
              state={state}
              materialOptions={materialOptions}
              colorwayOptions={[
                { id: 1, label: 'Black', swatchHex: '#111111' },
                { id: 2, label: 'Natural', swatchHex: '#e5ddc8' },
                { id: 3, label: 'Unspecified' },
              ]}
              activeSeamIndex={activeSeamIndex}
              activePieceIndex={activePieceIndex}
              onActiveSeamIndexChange={setActiveSeamIndex}
              onActivePieceIndexChange={setActivePieceIndex}
              onStateChange={setState}
              onConfirm={() => undefined}
            />
          }
          mannequin={({ selection, focusSelection }) => (
            <div
              className='relative h-full min-h-0 overflow-hidden bg-pageBg'
              data-browser-smoke-mannequin='model-free'
            >
              <div
                className='absolute inset-0 flex items-center justify-center text-micro text-labelColor'
                aria-label='No mannequin selected'
              >
                Select a mannequin
              </div>
              <PatternImportDxfPhaseECadMannequinDxfStagingV1
                sources={[
                  {
                    scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
                    label: 'Main fabric',
                    projection,
                  },
                ]}
                activeScopeKey='TECH_CARD_BOM_PURPOSE_MAIN'
                selection={{
                  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
                  pieceId: selection?.pieceId ?? null,
                  seamId: selection?.seamId ?? null,
                }}
                onFocus={(next) =>
                  focusSelection({
                    operationNumber: selection?.operationNumber ?? 10,
                    pieceId: next.pieceId ?? null,
                    seamId: next.seamId ?? null,
                  })
                }
              />
            </div>
          )}
          operationsPanel={
            <div className='h-full p-3' data-browser-smoke-operation-panel=''>
              <p className='text-micro font-bold uppercase'>Current operation · 10</p>
              <p className='mt-2 text-micro text-labelColor'>Join side seams</p>
            </div>
          }
        />
      </main>
    </TooltipProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Assembly Table smoke root is unavailable.');
createRoot(root).render(<BrowserSmoke />);
