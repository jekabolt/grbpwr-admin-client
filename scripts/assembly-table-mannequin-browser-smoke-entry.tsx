import type { common_BodyMeasurementName, common_Model } from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_V1,
  type PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-mannequin-scene-overlay-renderer-bridge-v1';
import type { PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-mannequin-dxf-staging-v1';
import {
  PatternImportDxfPhaseECadMannequinModelPickerViewV1,
  usePatternImportDxfPhaseECadMannequinPoseSessionV1,
  type PatternImportDxfPhaseECadMannequinPatternPieceSceneV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-mannequin-model-picker-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui';

const measurements = (
  [
    ['BODY_MEASUREMENT_NAME_HEIGHT', 1720],
    ['BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', 420],
    ['BODY_MEASUREMENT_NAME_CHEST', 920],
    ['BODY_MEASUREMENT_NAME_WAIST', 740],
    ['BODY_MEASUREMENT_NAME_HIP', 980],
    ['BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', 600],
    ['BODY_MEASUREMENT_NAME_INSEAM', 800],
  ] satisfies readonly (readonly [common_BodyMeasurementName, number])[]
).map(([name, valueMm]) => ({ name, valueMm, metadata: undefined }));

const models: readonly common_Model[] = Object.freeze([
  Object.freeze({
    id: 1,
    model: Object.freeze({
      name: 'Vera',
      comment: 'Assembly Table sealed model fixture',
      gender: 'GENDER_ENUM_FEMALE' as const,
      bodyMeasurementSchemaVersion: 1,
      measurements,
      thumbnailId: 0,
      mediaIds: [],
      defaultSizeIds: [1],
    }),
    createdAt: '2026-11-16T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    thumbnail: undefined,
    media: [],
  }),
]);

function contour(pieceId: string, x: number) {
  return {
    contourId: `${pieceId}:cut`,
    role: 'cut-boundary' as const,
    closed: true,
    vertices: [
      { ordinal: 0, vertexId: `${pieceId}:v0`, normalizedArc: 0, pointMm: { x, y: 0 } },
      {
        ordinal: 1,
        vertexId: `${pieceId}:v1`,
        normalizedArc: 0.25,
        pointMm: { x: x + 180, y: 0 },
      },
      {
        ordinal: 2,
        vertexId: `${pieceId}:v2`,
        normalizedArc: 0.5,
        pointMm: { x: x + 180, y: 360 },
      },
      {
        ordinal: 3,
        vertexId: `${pieceId}:v3`,
        normalizedArc: 0.75,
        pointMm: { x, y: 360 },
      },
    ],
  };
}

const projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 = Object.freeze({
  schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  expectedCatalogCanonicalSha256: 'a'.repeat(64),
  sizeSelectionCanonicalSha256: 'b'.repeat(64),
  sourceFileId: 'assembly-table-mannequin-browser-smoke.dxf',
  sizeToken: 'M',
  joinMode: 'catalog-ordinal-to-phase-d-point',
  geometryPlacementApplied: false,
  pieces: Object.freeze([
    Object.freeze({
      pieceId: 'front',
      pieceLineKey: 'FRONT',
      contours: Object.freeze([contour('front', 0)]),
      cameraMm: Object.freeze({ minX: -20, minY: -20, maxX: 200, maxY: 380, padding: 20 }),
    }),
    Object.freeze({
      pieceId: 'back',
      pieceLineKey: 'BACK',
      contours: Object.freeze([contour('back', 240)]),
      cameraMm: Object.freeze({ minX: 220, minY: -20, maxX: 440, maxY: 380, padding: 20 }),
    }),
  ]),
});

const scopeKey = 'TECH_CARD_BOM_PURPOSE_MAIN';
const frontPieceKey = `${scopeKey}:front:FRONT`;
const backPieceKey = `${scopeKey}:back:BACK`;

const bridge: PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeV1 = Object.freeze({
  schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_V1,
  decorations: Object.freeze([
    Object.freeze({
      seamId: 'side-seam',
      side: 'A' as const,
      scopeKey,
      pieceId: 'front',
      contourId: 'front:cut',
      semanticColorCss: '#2563EB',
      orderedVertexIds: Object.freeze(['front:v1', 'front:v2']),
      thread: Object.freeze({ bomLineKey: 'THREAD_BLACK', colorCss: '#111111' }),
    }),
    Object.freeze({
      seamId: 'side-seam',
      side: 'B' as const,
      scopeKey,
      pieceId: 'back',
      contourId: 'back:cut',
      semanticColorCss: '#F97316',
      orderedVertexIds: Object.freeze(['back:v3', 'back:v0']),
      thread: Object.freeze({ bomLineKey: 'THREAD_BLACK', colorCss: '#111111' }),
    }),
  ]),
  guides: Object.freeze([
    Object.freeze({
      guideId: 'correspondence:side-seam',
      kind: 'correspondence' as const,
      seamId: 'side-seam',
      from: Object.freeze({
        pieceKey: frontPieceKey,
        contourId: 'front:cut',
        vertexId: 'front:v1',
      }),
      to: Object.freeze({
        pieceKey: backPieceKey,
        contourId: 'back:cut',
        vertexId: 'back:v0',
      }),
      thread: null,
    }),
    Object.freeze({
      guideId: 'thread:side-seam',
      kind: 'thread' as const,
      seamId: 'side-seam',
      from: Object.freeze({
        pieceKey: frontPieceKey,
        contourId: 'front:cut',
        vertexId: 'front:v2',
      }),
      to: Object.freeze({
        pieceKey: backPieceKey,
        contourId: 'back:cut',
        vertexId: 'back:v3',
      }),
      thread: Object.freeze({ bomLineKey: 'THREAD_BLACK', colorCss: '#111111' }),
    }),
  ]),
  capabilities: Object.freeze({
    pins: Object.freeze({ available: false as const, emitted: false as const }),
  }),
  claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_CLAIMS_V1,
});

function MannequinBrowserSmoke() {
  const [modelId, setModelId] = useState(0);
  const [selection, setSelection] =
    useState<PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null>(null);
  const poseSession = usePatternImportDxfPhaseECadMannequinPoseSessionV1(modelId);
  const scene: PatternImportDxfPhaseECadMannequinPatternPieceSceneV1 = {
    sources: Object.freeze([Object.freeze({ scopeKey, label: 'Main fabric', projection })]),
    activeScopeKey: scopeKey,
    selection,
    swatchesByScope: Object.freeze({ [scopeKey]: '#F5F0E8' }),
    sceneOverlay: Object.freeze({ status: 'available' as const, bridge, blocker: null }),
    onFocus: setSelection,
  };

  return (
    <MemoryRouter>
      <TooltipProvider>
        <main
          className='h-screen overflow-hidden bg-pageBg p-3'
          data-mannequin-browser-smoke-root=''
          data-selected-model-id={modelId || undefined}
          data-selected-piece-id={selection?.pieceId}
        >
          <PatternImportDxfPhaseECadMannequinModelPickerViewV1
            models={models}
            modelId={modelId}
            sizeName={() => 'M'}
            onModelChange={setModelId}
            patternPieceScene={scene}
            poseBinding={poseSession.binding}
            poseLoading={poseSession.loading}
            poseError={poseSession.error}
            onRetryPose={poseSession.retry}
          />
        </main>
      </TooltipProvider>
    </MemoryRouter>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Assembly Table mannequin browser smoke root is unavailable.');
createRoot(root).render(<MannequinBrowserSmoke />);
