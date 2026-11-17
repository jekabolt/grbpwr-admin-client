import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  act,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type PointerEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { abortableAdminService } from 'api/api';
import type {
  GetTechCardSavedAssemblySnapshotRequest,
  PutTechCardPatternSemanticSidecarRequest,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import { createXpbdDeviceSession } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import { createSavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import * as bodyApi from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import {
  sessionFixture,
  deferredSessionValue,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2.test-fixture';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  savedThreePanelCompileRequestV1,
  fullAssemblyFixtureWireV1,
  type SavedThreePanelFixtureV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-compile-session-v1.test-fixture';
import * as snapshotApi from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-snapshot-production-v1';
import * as physicalReader from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-snapshot-production-v1';
import * as V3 from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import * as V4 from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v4';
import * as V5 from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v5';
import * as V6 from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v6';
import * as V7 from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-v7';
import * as component from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-component-v1';
import * as arrangement from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-mannequin-arrangement-document-v1';
import { buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/exact-n-seam-consistency-carrier-v2';
import {
  bytesOf,
  semanticDocument,
  candidate,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1.test-fixture';
import {
  DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
  DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
  encodeDxfGarmentPhysicalInitializationV1,
  type DxfGarmentPhysicalInitializationV1,
} from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import {
  createSavedGenericObservedPhysicalHostV1,
  projectSavedGenericObservedPhysicalHostPersistenceContextV1,
} from './saved-generic-observed-physical-host-v1';
import { createSavedGenericDurablePhysicalHostV1 } from './saved-generic-durable-physical-host-v1';
import type { DxfGarmentObservedPreviewHitV1 } from './dxf-garment-observed-strain-heatmap-preview-v1';
import { bindCadWorkbenchPhysicalPreviewSelectionV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-physical-host-v1';
import { CadWorkbenchPhysicalHostControlsV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-physical-host-controls-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
  restorePatternImportDxfProductCompositeSidecarDurableV4,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-restore-authority-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3,
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2,
  projectPatternImportDxfProductExactNSeamSavedCardV2,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/exact-n-seam-saved-card-projection-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_REQUEST_V2,
  applyPatternImportDxfProductExactNSeamUiSelectionV2,
  createPatternImportDxfProductExactNSeamInitialUiStateV2,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/exact-n-seam-atomic-ui-selection-v2';
import {
  createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5,
  type PatternImportDxfPhaseETopologyAnnotationSourceV5,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/topology-annotation-application-transaction-v5';
import { PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/callout-session-v1';
import {
  PatternImportDxfProductExactNSeamProductionMountV2,
  type PatternImportDxfProductExactNDesktopGeometryV2,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/exact-n-seam-production-mount-v2';
import {
  PatternImportDxfPhaseECadTableZeroConnectCanvasV1,
  type PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-table-zero-connect-canvas-v1';
import { createPatternImportDxfPhaseERestoredTopologyAnnotationReaderV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/restored-topology-annotation-reader-v1';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-assembly-snapshot-production-rpc-v1';

import { createPatternImportDxfProductCompositeSidecarApplicationTransactionV4 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-sidecar-production-transaction-v4';
import { PatternImportDxfPhaseESavedTopologyAnnotationEditControlV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-topology-annotation-edit-control-v1';
import { PatternImportDxfPhaseEExactNTopologyAnnotationEditorV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/exact-n-topology-annotation-editor-v1';

// Real native DXF/worker/compiler, V3→V7 encoders, fixed fresh reader and genuine body session.
// HTTP storage, declared synthetic observed triangle geometry, and GPU/preview lifecycle ports are fixtures.
// Native/compiler/body ownership and durable verification are real; this is not GPU/V11/fit acceptance.
vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
const ports = vi.hoisted(() => ({
  calls: [] as Array<{ frame: number; request: Record<string, unknown>; prior: unknown }>,
  live: new Map<object, AbortController>(),
  pause: null as Promise<void> | null,
  after: null as (() => void) | null,
  previewDisposed: 0,
  previewEvents: [] as string[],
  previewSignals: [] as AbortSignal[],
  previewPick: null as
    | ((x: number, y: number, runtimeSeamId?: string) => DxfGarmentObservedPreviewHitV1 | null)
    | null,
  previewSelect: null as ((pieceId: string | null) => boolean) | null,
}));
vi.mock('./dxf-garment-observed-webgpu-replay-v1', () => {
  const run = async (
    request: Record<string, unknown>,
    frame: number,
    prior: unknown,
    signal: AbortSignal,
  ) => {
    const controller = new AbortController(),
      owner = Object.freeze({ syntheticNumericFrame: frame });
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    controller.signal.addEventListener('abort', () => signal.removeEventListener('abort', cancel), {
      once: true,
    });
    if (signal.aborted) controller.abort();
    ports.live.set(owner, controller);
    ports.calls.push({ frame, request, prior });
    ports.after?.();
    if (ports.pause) await ports.pause;
    return {
      ok: true,
      owner,
      report: {
        status: 'diagnostic-completed',
        frameCount: frame,
        reportSha256: String(frame === 16 ? 1 : 2).repeat(64),
        checkpoint16Matched: frame === 32,
        claims: { numericReplayOnly: true, runtimeAuthority: false, productAuthority: false },
      },
      blockers: [],
    };
  };
  return {
    DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1: 'dxf-garment-observed-webgpu-replay/1',
    DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1: 'garment-material-contact-replay/1',
    runDxfGarmentObservedWebgpu16ReplayV1: (
      r: Record<string, unknown>,
      _l: unknown,
      s: AbortSignal,
    ) => run(r, 16, null, s),
    runDxfGarmentObservedWebgpu32ReplayV1: (
      r: Record<string, unknown>,
      p: unknown,
      _l: unknown,
      s: AbortSignal,
    ) => run(r, 32, p, s),
    getDxfGarmentObservedWebgpuReplayLifetimeV1: (o: object) =>
      ports.live.get(o)?.signal.aborted === false ? ports.live.get(o)!.signal : null,
    disposeDxfGarmentObservedWebgpuReplayV1: (o: object) => {
      ports.live.get(o)?.abort();
      return true;
    },
    projectDxfGarmentObservedWebgpuRenderV1: async (o: object) =>
      ports.live.get(o)?.signal.aborted === false ? { declaredSyntheticRender: true } : null,
  };
});
vi.mock('./dxf-garment-observed-strain-heatmap-preview-v1', () => ({
  createDxfGarmentObservedStrainHeatmapPreviewV1: async (
    _canvas: unknown,
    _owner: unknown,
    signal: AbortSignal,
  ) => {
    ports.previewSignals.push(signal);
    ports.previewEvents.push('create');
    const controller = new AbortController();
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      ports.previewDisposed++;
      ports.previewEvents.push('dispose');
      controller.abort();
      signal.removeEventListener('abort', dispose);
    };
    signal.addEventListener('abort', dispose, { once: true });
    if (signal.aborted) dispose();
    return {
      receipt: { declaredSyntheticPreview: true, frameReportSha256: '2'.repeat(64) },
      lifetime: controller.signal,
      pick: (x: number, y: number, runtimeSeamId?: string) =>
        ports.previewPick?.(x, y, runtimeSeamId) ?? null,
      setSelectedPiece: (pieceId: string | null) => ports.previewSelect?.(pieceId) ?? true,
      dispose,
    };
  },
}));

let seed: SavedThreePanelFixtureV1;
let outer: TechCardPatternSemanticSidecar | undefined;
let readCount = 0;
let beforeWireRead: (() => void | Promise<void>) | null = null;
let editWire: ((wire: Awaited<ReturnType<typeof fullAssemblyFixtureWireV1>>) => void) | null = null;
const cleanup: Array<() => unknown> = [];
beforeAll(async () => {
  seed = await createSavedThreePanelFixtureV1();
});
beforeEach(() => {
  outer = undefined;
  readCount = 0;
  beforeWireRead = null;
  editWire = null;
  ports.calls.length = 0;
  ports.live.clear();
  ports.pause = null;
  ports.after = null;
  ports.previewDisposed = 0;
  ports.previewEvents.length = 0;
  ports.previewSignals.length = 0;
  ports.previewPick = null;
  ports.previewSelect = null;
  vi.mocked(abortableAdminService).mockImplementation(
    () =>
      ({
        GetTechCardSavedAssemblySnapshot: async (r: GetTechCardSavedAssemblySnapshotRequest) => {
          readCount++;
          await beforeWireRead?.();
          const wire = await fullAssemblyFixtureWireV1(seed, r.selectedOperationNumber!);
          editWire?.(wire);
          return { ...wire, semanticSidecar: outer ? structuredClone(outer) : undefined };
        },
      }) as unknown as ReturnType<typeof abortableAdminService>,
  );
});
afterEach(async () => {
  beforeWireRead = null;
  editWire = null;
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
function requireOk<T extends { ok: boolean }>(v: T): Extract<T, { ok: true }> {
  if (!v.ok) throw new Error(JSON.stringify(v));
  return v as Extract<T, { ok: true }>;
}
/** Nested legacy metadata is only a declared storage transport anchor, never graph/body authority. */
async function encodedStorage(
  context: Extract<
    Awaited<ReturnType<typeof projectSavedGenericObservedPhysicalHostPersistenceContextV1>>,
    { ok: true }
  >['context'],
  withAnnotations: boolean,
) {
  const fullReceipt = await snapshotApi.readSavedFullAssemblySnapshotV1({
    row: seed.row,
    seedOperationNumber: 10,
  });
  let full;
  try {
    full = snapshotApi.projectSavedFullAssemblySnapshotV1(fullReceipt);
  } finally {
    snapshotApi.disposeSavedFullAssemblySnapshotV1(fullReceipt);
  }
  const selectedOperationNumber = withAnnotations ? 20 : 10;
  const bindings = {
    row: seed.row,
    serverAssemblyRevision: full.serverAssemblyRevision,
    assemblyTopologySha256: full.selectedTopologyReceipts.find(
      (x) => x.sourceOperationNumber === selectedOperationNumber,
    )!.sha256,
  };
  const v3 = requireOk(
    await V3.buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: V3.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(seed.row)),
      placementV2Bytes: null,
      exactTopologyBytes: null,
    }),
  );
  const e3 = requireOk(V3.encodePatternImportDxfProductCompositeSidecarV3(v3.owner));
  const exactCandidate = candidate(1);
  const unsignedCatalog = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
    techCardId: seed.row.techCardId,
    scopeKey: seed.row.scopeKey,
    sizeToken: 'M',
    sourceFileId: 'saved-source',
    sizeSelectionCanonicalSha256: 'e'.repeat(64),
    pieces: exactCandidate.sides.map((side) => ({
      pieceId: side.pieceId,
      pieceLineKey: side.pieceLineKey,
      contours: [
        {
          contourId: side.contourId,
          role: 'sewing-boundary',
          geometry: { kind: 'seam' },
          closed: true,
          boundaryVertices: [...side.boundaryVertexIds, `${side.pieceId}:third-vertex`].map(
            (vertexId, ordinal) => ({
              ordinal,
              vertexId,
              normalizedArc: ordinal / 3,
            }),
          ),
        },
      ],
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
    geometryCoordinatesExposed: false,
    rawDxfExposed: false,
    assemblyInferred: false,
    productionReady: false,
  } satisfies Omit<PatternImportDxfProductPhaseEAuthoringCatalogV1, 'canonicalSha256'>;
  const canonicalSha256 = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
    unsignedCatalog,
    globalThis.crypto,
  );
  if (!canonicalSha256) throw new Error('Could not bind the storage fixture catalog');
  const catalog = { ...unsignedCatalog, canonicalSha256 };
  const exact = requireOk(
    await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2({
      ...exactCandidate,
      ...bindings,
      catalogCanonicalSha256: catalog.canonicalSha256,
      selectedOperation: {
        ...exactCandidate.selectedOperation,
        sourceOperationNumber: selectedOperationNumber,
        seamIds: seed.operations.find(
          ({ operationNumber }) => operationNumber === selectedOperationNumber,
        )!.seamKeys,
      },
      sides: exactCandidate.sides.map((side) => ({
        ...side,
        seamId: seed.operations.find(
          ({ operationNumber }) => operationNumber === selectedOperationNumber,
        )!.seamKeys[0],
      })),
    }),
  );
  const eExact = requireOk(
    await V4.encodePatternImportDxfProductExactNSeamComponentV4({
      carrier: exact.carrier,
      seal: exact.seal,
    }),
  );
  const v4 = requireOk(
    await V4.buildPatternImportDxfProductCompositeSidecarV4({
      schemaVersion: V4.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
      bindings,
      expectedPreviousSidecarSha256: e3.canonicalSha256,
      compositeV3Bytes: e3.bytes,
      exactNSeamConsistencyBytes: eExact.bytes,
    }),
  );
  const e4 = requireOk(V4.encodePatternImportDxfProductCompositeSidecarV4(v4.owner));
  const source: PatternImportDxfPhaseETopologyAnnotationSourceV5 = {
    identity: 'declared-storage-anchor',
    revision: String(seed.row.revision),
    sha256: seed.row.sha256,
    projection: {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
      expectedCatalogCanonicalSha256: catalog.canonicalSha256,
      sourceFileId: catalog.sourceFileId,
      sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
      sizeToken: catalog.sizeToken,
      joinMode: 'catalog-ordinal-to-phase-d-point',
      geometryPlacementApplied: false,
      pieces: catalog.pieces.map((piece) => ({
        pieceId: piece.pieceId,
        pieceLineKey: piece.pieceLineKey,
        cameraMm: { minX: 0, minY: 0, maxX: 20, maxY: 20, padding: 1 },
        contours: piece.contours.map((contour) => ({
          contourId: contour.contourId,
          closed: contour.closed,
          role: contour.role,
          vertices: contour.boundaryVertices.map((vertex) => ({
            ...vertex,
            pointMm: { x: 10 * vertex.ordinal, y: 10 * (vertex.ordinal % 2) },
          })),
        })),
      })),
    },
  };
  const [side] = exactCandidate.sides;
  const anchor = {
    pieceId: side.pieceId,
    pieceLineKey: side.pieceLineKey,
    contourId: side.contourId,
    vertexId: side.boundaryVertexIds[0],
    pointMm: { x: 0, y: 0 },
  };
  const annotation = requireOk(
    await V5.encodePatternImportDxfPhaseETopologyAnnotationsV1({
      schemaVersion: V5.PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1,
      bindings: V5.derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1(bindings, {
        identity: source.identity,
        revision: source.revision,
        sha256: source.sha256,
      }),
      measurements: withAnnotations
        ? [{ id: 'measurement:1', kind: 'point', anchors: [anchor], valueMm: null, label: 'Point' }]
        : [],
      callouts: withAnnotations
        ? [
            {
              schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1,
              id: 'callout:1',
              anchor,
              text: 'Controllo cucitura',
            },
          ]
        : [],
    }),
  );
  const v5 = requireOk(
    await V5.buildPatternImportDxfProductCompositeSidecarV5({
      schemaVersion: V5.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
      bindings,
      expectedPreviousSidecarSha256: e4.canonicalSha256,
      compositeV4Bytes: e4.bytes,
      topologyAnnotationsBytes: annotation.bytes,
    }),
  );
  const e5 = requireOk(V5.encodePatternImportDxfProductCompositeSidecarV5(v5.owner));
  const target = context.physicalInitialization.document.observedTarget.target;
  const arrangementDoc = arrangement.createCadMannequinArrangementDocumentV1({
    bindings: {
      card: { techCardId: seed.row.techCardId, cardLockVersion: seed.row.cardLockVersion },
      scope: {
        scopeKey: seed.row.scopeKey,
        patternLineKey: seed.row.patternLineKey,
        sizeToken: context.graph.source.sizeToken,
      },
      savedRow: { revision: seed.row.revision, dxfSha256: seed.row.sha256 },
      source: {
        catalogCanonicalSha256: context.graphCanonicalSha256,
        sizeSelectionCanonicalSha256: context.compileInputSha256,
      },
      mannequin: {
        baseModelId: target.persistedModel.id,
        modelFormRevisionKeyV1: target.displayedModel.modelContentRevision,
        poseBinding: { canonicalKey: JSON.stringify(target.pose.document) },
      },
    },
    pieces: context.graph.pieces.map((p) => ({
      pieceKey: `fixture:${p.pieceId}`,
      scopeKey: seed.row.scopeKey,
      pieceId: p.pieceId,
      pieceLineKey: p.pieceLineKey,
      transform: withAnnotations
        ? { offsetM: [0.125, -0.0625, 0.25], rotationRad: 0.5 }
        : { offsetM: [0, 0, 0], rotationRad: 0 },
    })),
  });
  const v6 = requireOk(
    await V6.buildPatternImportDxfProductCompositeSidecarV6({
      schemaVersion: V6.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
      expectedPreviousSidecarSha256: e5.canonicalSha256,
      compositeV5Bytes: e5.bytes,
      mannequinArrangementBytes: new TextEncoder().encode(
        arrangement.encodeCadMannequinArrangementDocumentV1(arrangementDoc),
      ),
    }),
  );
  const e6 = requireOk(V6.encodePatternImportDxfProductCompositeSidecarV6(v6.owner));
  const physical = await encodeDxfGarmentPhysicalInitializationV1({
    document: context.physicalInitialization.document,
    graph: context.graph,
    assemblySnapshot: context.assemblySnapshot,
  });
  const part = requireOk(
    await component.buildSavedFullAssemblyPhysicalComponentV1({
      bindings: { row: seed.row, serverAssemblyRevision: full.serverAssemblyRevision },
      graph: context.graph,
      graphCanonicalSha256: context.graphCanonicalSha256,
      compileInputSha256: context.compileInputSha256,
      physicalInitializationBytes: physical.bytes,
      assemblySnapshot: full,
    }),
  );
  const encodedPart = requireOk(component.encodeSavedFullAssemblyPhysicalComponentV1(part.owner));
  const v7 = requireOk(
    await V7.buildPatternImportDxfProductCompositeSidecarV7({
      schemaVersion: V7.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
      expectedPreviousSidecarSha256: e6.canonicalSha256,
      bindings: {
        ...bindings,
        assemblyTopologySha256: full.selectedTopologyReceipts.find(
          (receipt) => receipt.sourceOperationNumber === 10,
        )!.sha256,
      },
      compositeV6Bytes: e6.bytes,
      fullAssemblyPhysicalBytes: encodedPart.bytes,
    }),
  );
  const e7 = requireOk(V7.encodePatternImportDxfProductCompositeSidecarV7(v7.owner));
  const stored = (
    mediaType: string,
    encoded: Readonly<{ canonicalSha256: string; bytes: Uint8Array }>,
  ): TechCardPatternSemanticSidecar => ({
    techCardId: seed.row.techCardId,
    patternLineKey: seed.row.patternLineKey,
    dxfSha256: seed.row.sha256,
    patternVersion: 4,
    cardLockVersion: seed.row.cardLockVersion,
    savedRowRevision: seed.row.revision,
    sidecarSha256: encoded.canonicalSha256,
    mediaType,
    byteLength: encoded.bytes.length,
    sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
    postSaveReceiptSha256: undefined,
    createdAt: undefined,
    createdBy: undefined,
  });
  return {
    v6: stored(V6.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6, e6),
    v7: stored(V7.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7, e7),
    v7TopologySha256: v7.document.bindings.assemblyTopologySha256,
    catalog,
    source,
    current: exact.carrier.bindings,
  };
}
async function fixture(withAnnotations = false) {
  const observed = await sessionFixture();
  cleanup.push(() => observed.input.dispose());
  const body = createSavedModelDisplayedTriangleBodySessionV2(async () =>
    structuredClone(observed.state.model),
  );
  await body.observe(observed.input);
  cleanup.push(() => body.dispose());
  const native = await createSavedThreePanelSourceV1(seed);
  cleanup.push(native.dispose);
  const pre = createSavedGenericObservedPhysicalHostV1({ row: seed.row, bodySession: body });
  cleanup.push(() => pre.dispose());
  const raw = await savedThreePanelCompileRequestV1(seed, native);
  // Explicitly authored isotropic materials; no conversion or fallback from anisotropic source.
  const materialIds = new Map(
    raw.intent.compile.materials.map((m) => [m.id, `explicit-durable-fixture-isotropic-${m.id}`]),
  );
  const intent = {
    ...structuredClone(raw.intent),
    pieces: raw.intent.pieces.map((p) => ({ ...p, materialId: materialIds.get(p.materialId)! })),
    compile: {
      ...structuredClone(raw.intent.compile),
      materials: raw.intent.compile.materials.map((m, i) => ({
        ...m,
        id: materialIds.get(m.id)!,
        label: 'Explicit isotropic durable-host lifecycle fixture',
        bendComplianceInvNm: { warp: i ? 0.0011 : 0.0006, weft: i ? 0.0011 : 0.0006 },
      })),
      continuumMaterials: raw.intent.compile.continuumMaterials.map((m) => ({
        ...m,
        materialId: materialIds.get(m.materialId)!,
      })),
    },
  };
  requireOk(await pre.consume({ ...raw, intent }));
  const author = requireOk(await pre.projectAuthoringContext(1));
  const doc: DxfGarmentPhysicalInitializationV1 = {
    schemaVersion: DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
    graphCanonicalSha256: author.graphCanonicalSha256,
    compileInputSha256: author.compileInputSha256,
    convention: DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
    placements: ['FRONT', 'BACK', 'SIDE'].map((pieceId, i) => ({
      pieceId,
      sourceOriginM: [i * 0.15, 0, 0],
      rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      translationM: [1 + i * 0.1, 0.5, 0],
    })),
    observedTarget: author.observedTarget,
    support: 'none',
    replayProfile: 'garment-material-contact-replay/1',
  };
  requireOk(await pre.bindInitialization(doc, 1));
  const context = requireOk(
    await projectSavedGenericObservedPhysicalHostPersistenceContextV1(pre, 1),
  ).context;
  const storage = await encodedStorage(context, withAnnotations);
  outer = storage.v7;
  // Real persisted outer changes the full snapshot; old source is correctly no longer usable.
  expect((await pre.projectAuthoringContext(1)).ok).toBe(false);
  await pre.dispose();
  const nextNative = await createSavedThreePanelSourceV1(seed);
  cleanup.push(nextNative.dispose);
  const next = await savedThreePanelCompileRequestV1(seed, nextNative);
  const reader = await physicalReader.readSavedFullAssemblyPhysicalSnapshotV1(
    { row: seed.row, seedOperationNumber: 10 },
    new AbortController().signal,
  );
  cleanup.push(() => physicalReader.disposeSavedFullAssemblyPhysicalSnapshotV1(reader));
  const host = createSavedGenericDurablePhysicalHostV1({ row: seed.row, bodySession: body });
  cleanup.push(() => host.dispose());
  return {
    host,
    body,
    observed,
    native: nextNative,
    context,
    reader,
    storage,
    request: {
      verifiedReceipt: reader,
      sourceOwner: next.sourceOwner,
      sourceRequest: next.sourceRequest,
    },
  };
}
async function borrowedLease() {
  const device = Object.assign(new EventTarget(), {
    limits: {
      maxBufferSize: 268435456,
      maxStorageBufferBindingSize: 134217728,
      maxUniformBufferBindingSize: 65536,
      maxComputeWorkgroupsPerDimension: 65535,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupSizeX: 256,
      maxBindingsPerBindGroup: 8,
      maxStorageBuffersPerShaderStage: 8,
      maxUniformBuffersPerShaderStage: 4,
      maxBindGroups: 4,
    },
    lost: new Promise<never>(() => {}),
    queue: { onSubmittedWorkDone: vi.fn(async () => {}) },
    destroy: vi.fn(),
  });
  const session = await createXpbdDeviceSession(
    { getContext: () => ({ configure() {}, unconfigure() {} }) } as unknown as HTMLCanvasElement,
    {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({ requestDevice: async () => device }),
      } as never,
    },
  );
  cleanup.push(() => session.dispose().then(() => {}));
  const lease = session.acquireExclusive();
  cleanup.push(() => lease.release());
  return { lease, device };
}

async function openExactAnnotationFixture(
  storage: Awaited<ReturnType<typeof encodedStorage>>,
  version: 'v6' | 'v7',
  row = storage[version],
) {
  const { catalog, current } = storage;
  const restored = requireOk(
    await restorePatternImportDxfProductCompositeSidecarDurableV4({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
      current,
      readback: {
        status: 'present',
        source: 'fresh-current-sidecar-get',
        mediaType:
          version === 'v6'
            ? V6.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6
            : V7.PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
        sha256: row.sidecarSha256!,
        byteLength: row.byteLength!,
        bytes: new Uint8Array(Buffer.from(row.sidecarBytes!, 'base64')),
      },
    }),
  );
  const projection = requireOk(
    await projectPatternImportDxfProductExactNSeamSavedCardV2({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2,
      restoreOwner: restored.owner,
      catalog,
      preparedProposal: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3,
        status: 'current-saved-card-proposal',
        expectedCatalogCanonicalSha256: catalog.canonicalSha256,
        phaseEAggregatePlanSha256: current.phaseEAggregatePlanSha256,
        operation: current.selectedOperation,
        seams: [
          {
            seamId: current.selectedOperation.seamIds[0],
            sides: candidate(1).sides.map(({ pieceId, pieceLineKey, direction }) => ({
              pieceId,
              pieceLineKey,
              requiredDirection: direction,
            })) as unknown as readonly [
              {
                pieceId: string;
                pieceLineKey: string;
                requiredDirection: 'forward' | 'reverse';
              },
              {
                pieceId: string;
                pieceLineKey: string;
                requiredDirection: 'forward' | 'reverse';
              },
            ],
          },
        ],
      },
    }),
  );
  const selected = requireOk(
    applyPatternImportDxfProductExactNSeamUiSelectionV2({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_REQUEST_V2,
      projectionOwner: projection.owner,
      current,
      currentState: createPatternImportDxfProductExactNSeamInitialUiStateV2(projection.owner)!,
    }),
  );
  return { selectionOwner: selected.owner, current };
}

function visitMountedTree(
  tree: ReactNode,
  predicate: (props: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  if (Array.isArray(tree)) {
    for (const item of tree) {
      const result = visitMountedTree(item, predicate);
      if (result) return result;
    }
  } else if (isValidElement<Record<string, unknown>>(tree)) {
    if (predicate(tree.props)) return tree.props;
    return visitMountedTree(tree.props.children as ReactNode, predicate);
  }
  return null;
}

function reactMountContainer() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  class HTMLIFrameElement {}
  return {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: {
      nodeType: 9,
      defaultView: { document: { activeElement: null }, HTMLIFrameElement },
      ...listeners,
    },
    ...listeners,
  };
}

function mountAnnotationFixtureView<Props>(View: (props: Props) => ReactNode) {
  const root = createRoot(reactMountContainer() as never);
  let props: Props;
  let output: ReactNode;
  let mounted = true;
  function Harness() {
    output = View(props);
    return null;
  }
  const unmount = async () => {
    if (!mounted) return;
    mounted = false;
    await act(async () => root.unmount());
  };
  cleanup.push(unmount);
  return {
    async render(next: Props) {
      props = next;
      await act(async () => root.render(createElement(Harness)));
    },
    output: () => output,
    unmount,
  };
}

async function wrappedAnnotationSaveFixture(version: 'v6' | 'v7') {
  const { storage } = await fixture(true);
  const session = await openExactAnnotationFixture(storage, version);
  const current = {
    ...storage[version],
    postSaveReceiptSha256: semanticDocument(seed.row).persistence.receiptSealSha256,
  };
  outer = current;
  const get = vi.fn(async (): Promise<{ semanticSidecar: TechCardPatternSemanticSidecar }> => {
    return { semanticSidecar: structuredClone(outer!) };
  });
  const put = vi.fn(async (request: PutTechCardPatternSemanticSidecarRequest) => {
    expect(request).toMatchObject({
      techCardId: current.techCardId,
      patternLineKey: current.patternLineKey,
      expectedCardLockVersion: current.cardLockVersion,
      expectedSavedRowRevision: current.savedRowRevision,
      expectedDxfSha256: current.dxfSha256,
      expectedPreviousSidecarSha256: outer!.sidecarSha256,
      expectedServerAssemblyRevision: session.current.serverAssemblyRevision,
      expectedAssemblyTopologySha256:
        version === 'v6' ? session.current.assemblyTopologySha256 : storage.v7TopologySha256,
      selectedOperationNumber: version === 'v6' ? 20 : 10,
      mediaType: current.mediaType,
    });
    outer = {
      ...current,
      sidecarBytes: request.sidecarBytes,
      sidecarSha256: request.sidecarSha256,
      byteLength: Buffer.from(request.sidecarBytes!, 'base64').length,
    };
    return { semanticSidecar: structuredClone(outer) };
  });
  const application = createPatternImportDxfProductCompositeSidecarApplicationTransactionV4({
    createClient: () => ({
      GetTechCardPatternSemanticSidecar: get,
      PutTechCardPatternSemanticSidecar: put,
    }),
  });
  const anchor = {
    pieceId: 'piece:0:front',
    pieceLineKey: 'line:0:front',
    contourId: 'contour:0:front',
    vertexId: 'vertex:0:front:0',
  };
  const input = {
    session,
    geometry: {
      catalog: storage.catalog,
      projection: storage.source.projection,
      annotationSource: storage.source,
    },
    expectedPreviousSidecarSha256: current.sidecarSha256!,
    draft: {
      measurements: [
        {
          id: 'measurement:1',
          kind: 'point' as const,
          anchors: [anchor],
          valueMm: null,
          label: 'Point',
        },
      ],
      callouts: [
        {
          schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1,
          id: 'callout:1',
          anchor,
          text: 'Misura aggiornata',
        },
      ],
    },
  };
  const signal = new AbortController().signal;
  return {
    current,
    get,
    input,
    put,
    signal,
    storage,
    application,
    save: application.saveWrappedTopologyAnnotations,
  };
}

async function unwrapAnnotationSaveFixture(
  version: 'v6' | 'v7',
  row: TechCardPatternSemanticSidecar,
) {
  const bytes = new Uint8Array(Buffer.from(row.sidecarBytes!, 'base64'));
  const v7 =
    version === 'v7'
      ? requireOk(await V7.decodePatternImportDxfProductCompositeSidecarV7(bytes))
      : null;
  const v6 =
    v7?.nestedCompositeV6 ??
    requireOk(await V6.decodePatternImportDxfProductCompositeSidecarV6(bytes));
  return {
    v5: v6.nestedCompositeV5,
    v6,
    v7,
    exactV4: V5.readPatternImportDxfProductCompositeComponentBytesV5(
      v6.nestedCompositeV5.owner,
      'composite-v4',
    ),
    arrangement: V6.readPatternImportDxfProductCompositeComponentBytesV6(
      v6.owner,
      'cad-mannequin-arrangement-v1',
    ),
    physical:
      v7 &&
      V7.readPatternImportDxfProductCompositeComponentBytesV7(
        v7.owner,
        component.SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
      ),
  };
}

function advanceAssemblyRevision(wire: Awaited<ReturnType<typeof fullAssemblyFixtureWireV1>>) {
  wire.serverAssemblyRevision += ':advanced';
}
function advanceSavedRowRevision(wire: Awaited<ReturnType<typeof fullAssemblyFixtureWireV1>>) {
  wire.row.savedRowRevision += 1;
}

describe('same-row wrapped annotation CAS', () => {
  it.each(['v6', 'v7'] as const)(
    'updates only the annotation chain through the existing CAS for %s',
    async (version) => {
      const { current, input, put, save, signal } = await wrappedAnnotationSaveFixture(version);
      const before = await unwrapAnnotationSaveFixture(version, current);
      const saved = requireOk(await save(input, signal));
      expect(saved.readback.callouts[0].text).toBe('Misura aggiornata');
      expect(saved.sidecarSha256).not.toBe(current.sidecarSha256);
      expect(put).toHaveBeenCalledTimes(1);
      const after = await unwrapAnnotationSaveFixture(version, outer!);
      expect(after.exactV4).toEqual(before.exactV4);
      expect(after.arrangement).toEqual(before.arrangement);
      expect(after.v6.mannequinArrangement.pieces[0].transform).toEqual({
        offsetM: [0.125, -0.0625, 0.25],
        rotationRad: 0.5,
      });
      expect(after.v5.document.writeCas.expectedPreviousSidecarSha256).toBe(
        before.v5.seal.canonicalSha256,
      );
      expect(after.v6.document.writeCas.expectedPreviousSidecarSha256).toBe(
        before.v6.seal.canonicalSha256,
      );
      expect(after.v5.seal.canonicalSha256).not.toBe(before.v5.seal.canonicalSha256);
      expect(after.v6.seal.canonicalSha256).not.toBe(before.v6.seal.canonicalSha256);
      expect(after.v5.topologyAnnotations.bindings).toEqual(before.v5.topologyAnnotations.bindings);
      expect(after.physical).toEqual(before.physical);
      if (version === 'v7') {
        expect(after.v7!.fullAssemblyPhysicalEnvelope.document.physicalInitialization).toEqual(
          before.v7!.fullAssemblyPhysicalEnvelope.document.physicalInitialization,
        );
        expect(after.v7!.fullAssemblyPhysicalEnvelope.document.bindings.aoContentSha256).toBe(
          before.v7!.fullAssemblyPhysicalEnvelope.document.bindings.aoContentSha256,
        );
        expect(after.v7!.document.writeCas.expectedPreviousSidecarSha256).toBe(
          before.v7!.seal.canonicalSha256,
        );
      }
    },
  );

  it.each(['v6', 'v7'] as const)(
    'refuses a stale baseline or an invalidation during %s pre-PUT planning',
    async (version) => {
      const { current, get, input, put, save, signal } =
        await wrappedAnnotationSaveFixture(version);
      expect(
        await save({ ...input, expectedPreviousSidecarSha256: '9'.repeat(64) }, signal),
      ).toMatchObject({
        ok: false,
        writeOutcome: 'not-attempted',
        detail: expect.stringContaining('envelope changed'),
      });
      for (const invalidate of [advanceAssemblyRevision, advanceSavedRowRevision]) {
        get.mockImplementationOnce(async () => {
          editWire = invalidate;
          return { semanticSidecar: current };
        });
        expect(await save(input, signal)).toMatchObject({
          ok: false,
          writeOutcome: 'not-attempted',
          detail: expect.stringContaining('pre-PUT currentness check failed'),
        });
        editWire = null;
      }
      expect(put).not.toHaveBeenCalled();
      expect(outer!.sidecarSha256).toBe(current.sidecarSha256);
    },
  );

  it.each([
    ['v6', 'row', advanceSavedRowRevision],
    ['v6', 'operation', advanceAssemblyRevision],
    ['v7', 'row', advanceSavedRowRevision],
    ['v7', 'operation', advanceAssemblyRevision],
  ] as const)(
    'withholds verified readback after %s %s drift without retrying PUT',
    async (version, _authority, invalidate) => {
      const { current, get, input, put, save, signal } =
        await wrappedAnnotationSaveFixture(version);
      get.mockImplementationOnce(async () => ({ semanticSidecar: current }));
      get.mockImplementationOnce(async () => {
        editWire = invalidate;
        return { semanticSidecar: structuredClone(outer!) };
      });
      expect(await save(input, signal)).toMatchObject({
        ok: false,
        writeOutcome: 'acknowledged-unverified',
      });
      expect(put).toHaveBeenCalledTimes(1);
    },
  );
});

describe('mounted exact annotation Save and remount', () => {
  async function mountedFixture(version: 'v6' | 'v7') {
    const saved = await wrappedAnnotationSaveFixture(version);
    const read = vi.fn(
      createPatternImportDxfPhaseERestoredTopologyAnnotationReaderV1(
        createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
          saved.input.session.current.selectedOperation.sourceOperationNumber,
        ).authorityAdapter,
        saved.application.topologyAnnotations,
      ),
    );
    const save = vi.fn(saved.save);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', { event: undefined });
    cleanup.push(() => vi.unstubAllGlobals());
    const routeProps = {
      session: saved.input.session,
      desktopGeometry: saved.input.geometry,
      activeSeamIndex: 0,
      onActiveSeamIndexChange: () => {},
      mannequin: null,
      operationsPanel: null,
      readSavedTopologyAnnotations: read,
      saveWrappedTopologyAnnotations: save,
    };
    const route = mountAnnotationFixtureView(PatternImportDxfProductExactNSeamProductionMountV2);
    const control = mountAnnotationFixtureView(
      PatternImportDxfPhaseESavedTopologyAnnotationEditControlV1,
    );
    const editor = mountAnnotationFixtureView(
      PatternImportDxfPhaseEExactNTopologyAnnotationEditorV1,
    );
    function desktopOf(view: ReactNode) {
      expect(
        isValidElement<{
          desktop: ReactElement<PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1>;
        }>(view),
      ).toBe(true);
      return (
        view as ReactElement<{
          desktop: ReactElement<PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1>;
        }>
      ).props.desktop;
    }
    function button(label: string) {
      const button = visitMountedTree(control.output(), (props) => props.children === label);
      expect(button).toBeTruthy();
      return button!;
    }
    async function renderEditor() {
      const props = visitMountedTree(
        control.output(),
        (props) => !!props.source && !!props.onDraftChange,
      );
      await editor.render(
        props as Parameters<typeof PatternImportDxfPhaseEExactNTopologyAnnotationEditorV1>[0],
      );
    }
    async function pickAnnotationVertex(vertexId: string) {
      const viewport = visitMountedTree(editor.output(), (props) => !!props.onPick);
      expect(viewport).toBeTruthy();
      const geometry = (viewport!.children as (props: { unit: number }) => ReactNode)({
        unit: 1,
      });
      const vertex = visitMountedTree(
        geometry,
        (props) => props['data-exact-n-topology-vertex'] === vertexId,
      );
      expect(vertex).toBeTruthy();
      await act(async () =>
        (viewport!.onPick as (key: string) => void)(vertex!['data-key'] as string),
      );
    }
    async function addLineMeasurement() {
      await renderEditor();
      const tool = visitMountedTree(editor.output(), (props) => props.children === 'Line');
      expect(tool).toBeTruthy();
      await act(async () => (tool!.onClick as () => void)());
      await pickAnnotationVertex('vertex:0:front:0');
      await pickAnnotationVertex('vertex:0:front:1');
    }
    async function startReanchor(kind: 'measurement' | 'callout', ordinal: number) {
      await renderEditor();
      const button = visitMountedTree(
        editor.output(),
        (props) => props['aria-label'] === `Re-anchor annotation ${kind} ${ordinal}`,
      );
      expect(button).toBeTruthy();
      await act(async () => (button!.onClick as () => void)());
    }
    async function typeCallout(text: string) {
      await renderEditor();
      const input = visitMountedTree(
        editor.output(),
        (props) => props['aria-label'] === 'Annotation callout 1 text',
      );
      expect(input).toBeTruthy();
      await act(async () =>
        (input!.onChange as (event: { target: { value: string } }) => void)({
          target: { value: text },
        }),
      );
    }
    async function deleteAnnotation(kind: 'measurement' | 'callout') {
      await renderEditor();
      const button = visitMountedTree(
        editor.output(),
        (props) => props['aria-label'] === `Delete annotation ${kind} 1`,
      );
      expect(button).toBeTruthy();
      await act(async () => (button!.onClick as () => void)());
    }
    await route.render(routeProps);
    await act(async () => {
      await read.mock.results[0].value;
    });
    const desktop = desktopOf(route.output());
    expect(desktop.type).toBe(PatternImportDxfPhaseECadTableZeroConnectCanvasV1);
    const controlElement = desktop.props.savedAnnotationEditControl as ReactElement<
      Parameters<typeof PatternImportDxfPhaseESavedTopologyAnnotationEditControlV1>[0]
    >;
    expect(controlElement.type).toBe(PatternImportDxfPhaseESavedTopologyAnnotationEditControlV1);
    await control.render(controlElement.props);
    expect(renderToStaticMarkup(control.output())).toContain('aria-label="Edit annotations"');
    const dialog = control.output() as ReactElement<{ onOpenChange(open: boolean): void }>;
    await act(async () => dialog.props.onOpenChange(true));

    return {
      ...saved,
      read,
      save,
      routeProps,
      route,
      control,
      editor,
      desktopOf,
      button,
      addLineMeasurement,
      startReanchor,
      pickAnnotationVertex,
      deleteAnnotation,
      typeCallout,
    };
  }

  it.each(['v6', 'v7'] as const)(
    'saves %s measurements and callouts explicitly and restores them under a freshly rebuilt exact owner',
    async (version) => {
      const view = await mountedFixture(version);
      expect(view.button('Save annotations').disabled).toBe(true);
      await view.typeCallout('Filo di controllo');
      await view.addLineMeasurement();
      expect(view.button('Save annotations').disabled).toBe(false);
      expect(view.put).not.toHaveBeenCalled();
      const click = view.button('Save annotations').onClick as () => void;
      await act(async () => {
        click();
        click();
        await view.save.mock.results[0].value;
      });
      expect(view.save).toHaveBeenCalledTimes(1);
      expect(view.put).toHaveBeenCalledTimes(1);
      expect(view.save.mock.calls[0][0].expectedPreviousSidecarSha256).toBe(
        view.current.sidecarSha256,
      );
      expect(
        visitMountedTree(
          view.control.output(),
          (props) => props.children === 'Saved and verified by fresh readback.',
        ),
      ).toBeTruthy();
      expect(view.button('Save annotations').disabled).toBe(true);
      expect(view.desktopOf(view.route.output()).props.savedAnnotations?.callouts[0].text).toBe(
        'Filo di controllo',
      );
      expect(view.get.mock.calls.length).toBeGreaterThanOrEqual(3);

      const savedRow = outer!;
      expect(savedRow.sidecarSha256).not.toBe(view.current.sidecarSha256);
      const before = await unwrapAnnotationSaveFixture(version, view.current);
      const after = await unwrapAnnotationSaveFixture(version, savedRow);
      expect(after.exactV4).toEqual(before.exactV4);
      expect(after.arrangement).toEqual(before.arrangement);
      expect(after.physical).toEqual(before.physical);

      await view.editor.unmount();
      await view.control.unmount();
      await view.route.unmount();
      const session = await openExactAnnotationFixture(view.storage, version, savedRow);
      expect(session.selectionOwner).not.toBe(view.routeProps.session.selectionOwner);
      const fresh = mountAnnotationFixtureView(PatternImportDxfProductExactNSeamProductionMountV2);
      await fresh.render({ ...view.routeProps, session });
      await act(async () => {
        await view.read.mock.results.at(-1)!.value;
      });
      const desktop = view.desktopOf(fresh.output());
      const markup = renderToStaticMarkup(desktop);
      expect(markup).toContain('Filo di controllo');
      expect(markup).toContain('data-draft-cad-measurement="point"');
      expect(markup).toContain('data-draft-cad-measurement="line"');
      expect(markup).toContain('14.1 mm');
      expect(markup).toContain('aria-label="Show callouts" aria-pressed="true"');
      expect(view.put).toHaveBeenCalledTimes(1);
    },
  );

  it('cancels an incomplete replacement and saves exact re-anchors through V7 and remount', async () => {
    const view = await mountedFixture('v7');
    const starting = view.desktopOf(view.route.output()).props.savedAnnotations!;
    await view.addLineMeasurement();
    await view.startReanchor('measurement', 2);
    await view.pickAnnotationVertex('vertex:0:front:1');
    expect(view.button('Save annotations').disabled).toBe(true);
    const dialogContent = visitMountedTree(
      view.control.output(),
      (props) => !!props.onEscapeKeyDown,
    );
    const preventDefault = vi.fn();
    await act(async () =>
      (dialogContent!.onEscapeKeyDown as (event: { preventDefault(): void }) => void)({
        preventDefault,
      }),
    );
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(view.button('Save annotations').disabled).toBe(false);
    expect(view.put).not.toHaveBeenCalled();
    const draftAfterCancel = visitMountedTree(
      view.control.output(),
      (props) => !!props.draft,
    )?.draft;
    expect(draftAfterCancel).toMatchObject({
      measurements: [
        { id: 'measurement:1', anchors: [{ vertexId: 'vertex:0:front:0' }] },
        { anchors: [{ vertexId: 'vertex:0:front:0' }, { vertexId: 'vertex:0:front:1' }] },
      ],
      callouts: starting.callouts,
    });

    await view.startReanchor('callout', 1);
    await view.pickAnnotationVertex('vertex:0:front:1');
    await view.startReanchor('measurement', 1);
    await view.pickAnnotationVertex('vertex:0:front:1');
    expect(view.desktopOf(view.route.output()).props.savedAnnotations).toBe(starting);
    expect(view.put).not.toHaveBeenCalled();

    const click = view.button('Save annotations').onClick as () => void;
    await act(async () => {
      click();
      await view.save.mock.results[0].value;
    });
    expect(view.put).toHaveBeenCalledTimes(1);
    const stored = outer!;
    const before = await unwrapAnnotationSaveFixture('v7', view.current);
    const after = await unwrapAnnotationSaveFixture('v7', stored);
    expect(after.exactV4).toEqual(before.exactV4);
    expect(after.arrangement).toEqual(before.arrangement);
    expect(after.physical).toEqual(before.physical);
    await view.editor.unmount();
    await view.control.unmount();
    await view.route.unmount();
    const session = await openExactAnnotationFixture(view.storage, 'v7', stored);
    const fresh = mountAnnotationFixtureView(PatternImportDxfProductExactNSeamProductionMountV2);
    await fresh.render({ ...view.routeProps, session });
    await act(async () => {
      await view.read.mock.results.at(-1)!.value;
    });
    const restored = view.desktopOf(fresh.output()).props.savedAnnotations;
    expect(restored).toMatchObject({
      measurements: [
        {
          id: 'measurement:1',
          anchors: [{ vertexId: 'vertex:0:front:1' }],
          label: 'x 10.0 · y 10.0 mm',
        },
        { anchors: [{ vertexId: 'vertex:0:front:0' }, { vertexId: 'vertex:0:front:1' }] },
      ],
      callouts: [
        { id: 'callout:1', anchor: { vertexId: 'vertex:0:front:1' }, text: 'Controllo cucitura' },
      ],
    });
    expect(view.put).toHaveBeenCalledTimes(1);
  });

  it('deletes both saved annotations from V7 through Save and a fresh exact remount', async () => {
    const view = await mountedFixture('v7');
    await view.deleteAnnotation('measurement');
    await view.deleteAnnotation('callout');
    expect(view.put).not.toHaveBeenCalled();
    expect(view.desktopOf(view.route.output()).props.savedAnnotations).toMatchObject({
      measurements: [{ id: 'measurement:1' }],
      callouts: [{ id: 'callout:1' }],
    });
    const click = view.button('Save annotations').onClick as () => void;
    await act(async () => {
      click();
      await view.save.mock.results[0].value;
    });
    expect(view.put).toHaveBeenCalledTimes(1);
    expect(view.desktopOf(view.route.output()).props.savedAnnotations).toEqual({
      measurements: [],
      callouts: [],
    });
    const stored = outer!;
    const before = await unwrapAnnotationSaveFixture('v7', view.current);
    const after = await unwrapAnnotationSaveFixture('v7', stored);
    expect(after.exactV4).toEqual(before.exactV4);
    expect(after.arrangement).toEqual(before.arrangement);
    expect(after.physical).toEqual(before.physical);
    await view.editor.unmount();
    await view.control.unmount();
    await view.route.unmount();
    const session = await openExactAnnotationFixture(view.storage, 'v7', stored);
    const fresh = mountAnnotationFixtureView(PatternImportDxfProductExactNSeamProductionMountV2);
    await fresh.render({ ...view.routeProps, session });
    await act(async () => {
      await view.read.mock.results.at(-1)!.value;
    });
    const markup = renderToStaticMarkup(view.desktopOf(fresh.output()));
    expect(markup).toContain('aria-label="Edit annotations"');
    expect(markup).not.toContain('aria-label="Show callouts"');
    expect(markup).not.toContain('aria-label="Show measurements"');
    expect(view.put).toHaveBeenCalledTimes(1);
  });

  it('retains the local draft on a stale captured digest and reloads the concurrent V7 edit without a second PUT', async () => {
    const view = await mountedFixture('v7');
    await view.typeCallout('Local draft');
    const concurrent = requireOk(
      await view.application.saveWrappedTopologyAnnotations(view.input, view.signal),
    );
    expect(concurrent.readback.callouts[0].text).toBe('Misura aggiornata');
    const click = view.button('Save annotations').onClick as () => void;
    await act(async () => {
      click();
      await view.save.mock.results[0].value;
    });
    expect(view.put).toHaveBeenCalledTimes(1);
    expect(view.save.mock.calls[0][0].expectedPreviousSidecarSha256).toBe(
      view.current.sidecarSha256,
    );
    expect(view.button('Save annotations').disabled).toBe(true);
    expect(visitMountedTree(view.control.output(), (props) => !!props.draft)?.draft).toMatchObject({
      callouts: [{ text: 'Local draft' }],
    });
    expect(
      visitMountedTree(
        view.control.output(),
        (props) =>
          typeof props.children === 'string' && props.children.includes('envelope changed'),
      ),
    ).toBeTruthy();

    const reload = view.button('Reload saved annotations').onClick as () => void;
    await act(async () => reload());
    await act(async () => {
      await view.read.mock.results.at(-1)!.value;
    });
    expect(view.desktopOf(view.route.output()).props.savedAnnotations?.callouts[0].text).toBe(
      'Misura aggiornata',
    );
    expect(view.put).toHaveBeenCalledTimes(1);
  });
});

describe('exact saved annotations in durable Composite envelopes', () => {
  it('renders genuine saved V6 annotations on the restored exact desktop and keeps visibility local', async () => {
    const { storage } = await fixture(true);
    const session = await openExactAnnotationFixture(storage, 'v6');
    outer = storage.v6;
    const { catalog, source } = storage;
    const originalGeometry = { catalog, projection: source.projection, annotationSource: source };
    let geometry: PatternImportDxfProductExactNDesktopGeometryV2 = originalGeometry;
    const persist = vi.fn();
    const get = vi.fn().mockResolvedValue({ semanticSidecar: storage.v6 });
    const transaction = createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5({
      createClient: () => ({ GetTechCardPatternSemanticSidecar: get }),
      persistence: { adapter: { persist } } as never,
    });
    const read = vi.fn(
      createPatternImportDxfPhaseERestoredTopologyAnnotationReaderV1(
        createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
          session.current.selectedOperation.sourceOperationNumber,
        ).authorityAdapter,
        transaction,
      ),
    );

    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', { event: undefined });
    let route = createRoot(reactMountContainer() as never);
    const canvas = createRoot(reactMountContainer() as never);
    let desktop: ReactElement<PatternImportDxfPhaseECadTableZeroConnectCanvasPropsV1> | undefined;
    let mountedCanvas: ReactNode;
    cleanup.push(async () => {
      await act(async () => {
        canvas.unmount();
        route.unmount();
      });
      vi.unstubAllGlobals();
    });

    function Route() {
      const view = PatternImportDxfProductExactNSeamProductionMountV2({
        session,
        desktopGeometry: geometry,
        activeSeamIndex: 0,
        onActiveSeamIndexChange: () => {},
        mannequin: null,
        operationsPanel: null,
        readSavedTopologyAnnotations: read,
      });
      if (!isValidElement<{ desktop: typeof desktop }>(view))
        throw new Error('Exact view is absent');
      desktop = view.props.desktop;
      return null;
    }
    function Canvas() {
      // Mount the actual canvas hooks and inspect the resulting JSX. No actual DOM or WebGPU.
      const child = PatternImportDxfPhaseECadTableZeroConnectCanvasV1(desktop!.props);
      const Present = child.type as (props: typeof child.props) => ReactNode;
      mountedCanvas = Present(child.props);
      return null;
    }
    async function renderRoute() {
      await act(async () => route.render(createElement(Route)));
      await act(async () => {
        await read.mock.results.at(-1)?.value.catch(() => {});
      });
      expect(desktop?.type).toBe(PatternImportDxfPhaseECadTableZeroConnectCanvasV1);
      await act(async () => canvas.render(createElement(Canvas)));
    }
    async function toggle(label: string) {
      const tool = visitMountedTree(mountedCanvas, (props) => props.label === label);
      expect(tool).not.toBeNull();
      await act(async () => (tool!.onClick as () => void)());
    }
    function markup() {
      return renderToStaticMarkup(mountedCanvas);
    }

    await renderRoute();
    expect(markup()).toContain('data-draft-cad-measurement="point"');
    expect(markup()).toContain('Controllo cucitura');
    expect(markup()).toContain('aria-label="Show measurements" aria-pressed="true"');
    await toggle('Show measurements');
    expect(markup()).not.toContain('data-draft-cad-measurement="point"');
    expect(markup()).toContain('Controllo cucitura');
    await toggle('Show callouts');
    expect(markup()).not.toContain('Controllo cucitura');
    expect(markup()).toContain('aria-label="Show callouts" aria-pressed="false"');
    await toggle('Show measurements');
    await toggle('Show callouts');
    expect(markup()).toContain('data-draft-cad-measurement="point"');
    expect(markup()).toContain('Controllo cucitura');
    expect(get).toHaveBeenCalledTimes(1);

    const oldGeometry = geometry;
    geometry = {
      ...oldGeometry,
      projection: {
        ...oldGeometry.projection,
        pieces: oldGeometry.projection.pieces.map((piece) => ({
          ...piece,
          contours: piece.contours.map((contour) => ({
            ...contour,
            vertices: contour.vertices.filter(({ vertexId }) => vertexId !== 'vertex:0:front:0'),
          })),
        })),
      },
    };
    await renderRoute();
    expect(markup()).not.toContain('Controllo cucitura');
    expect(markup()).toContain('no longer present in the exact Phase-D projection');

    geometry = originalGeometry;
    editWire = (wire) => {
      wire.serverAssemblyRevision += ':advanced';
    };
    await renderRoute();
    expect(markup()).not.toContain('Controllo cucitura');
    expect(markup()).toContain('Assembly Order changed while reading saved annotations');

    editWire = null;
    const pending = deferredSessionValue<{ semanticSidecar: TechCardPatternSemanticSidecar }>();
    get.mockImplementationOnce(() => pending.promise);
    geometry = { ...originalGeometry };
    await act(async () => route.render(createElement(Route)));
    const held = read.mock.lastCall![2];
    await act(async () => route.unmount());
    route = createRoot(reactMountContainer() as never);
    expect(held.aborted).toBe(true);
    await act(async () => {
      pending.resolve({ semanticSidecar: storage.v6 });
      await read.mock.results.at(-1)!.value.catch(() => {});
    });

    await renderRoute();
    expect(markup()).toContain('data-draft-cad-measurement="point"');
    expect(markup()).toContain('Controllo cucitura');
    expect(persist).not.toHaveBeenCalled();
  });

  it('hydrates saved exact annotations from genuine V6 and V7 without writing', async () => {
    const { storage, context } = await fixture(true);
    const otherOperation = await encodedStorage(context, false);
    const { current, source } = storage;
    expect(storage.v7TopologySha256).not.toBe(current.assemblyTopologySha256);
    const persist = vi.fn();
    const get = vi.fn();
    const transaction = createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5({
      createClient: () => ({ GetTechCardPatternSemanticSidecar: get }),
      persistence: { adapter: { persist } } as never,
    });
    const signal = new AbortController().signal;

    for (const [version, row] of [
      ['v6', storage.v6],
      ['v7', storage.v7],
    ] as const) {
      const session = await openExactAnnotationFixture(storage, version);
      get.mockResolvedValue({ semanticSidecar: row });

      expect(requireOk(await transaction.load(session, source, signal))).toMatchObject({
        mediaType: row.mediaType,
        readback: {
          sidecarSha256: row.sidecarSha256,
          measurements: [
            { id: 'measurement:1', label: 'Point', anchors: [{ vertexId: 'vertex:0:front:0' }] },
          ],
          callouts: [
            {
              id: 'callout:1',
              text: 'Controllo cucitura',
              anchor: { vertexId: 'vertex:0:front:0' },
            },
          ],
        },
      });
      for (const stale of [
        { ...source, revision: '999' },
        { ...source, identity: 'foreign-import-session' },
        { ...source, sha256: 'f'.repeat(64) },
      ]) {
        expect(await transaction.load(session, stale, signal)).toMatchObject({
          ok: false,
          readback: null,
          blockers: [{ detail: expect.stringContaining('source revision or SHA') }],
        });
      }
      expect(
        await transaction.save(session, source, { measurements: [], callouts: [] }, signal),
      ).toMatchObject({ ok: false, readback: null });
      get.mockResolvedValue({
        semanticSidecar: { ...row, savedRowRevision: seed.row.revision + 1 },
      });
      expect(await transaction.load(session, source, signal)).toMatchObject({
        ok: false,
        readback: null,
        blockers: [{ detail: expect.stringContaining('differs from exact authority') }],
      });
      get.mockResolvedValue({ semanticSidecar: otherOperation[version] });
      expect(await transaction.load(session, source, signal)).toMatchObject({
        ok: false,
        readback: null,
        blockers: [{ detail: expect.stringContaining('readback is invalid') }],
      });
    }
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('durable facade refusal before any stored V7 authority exists', () => {
  it('rejects arbitrary receipt DTOs, proxies and getters before source work or RPC', async () => {
    const host = createSavedGenericDurablePhysicalHostV1({ row: seed.row, bodySession: {} });
    cleanup.push(() => host.dispose());
    const getter = vi.fn();
    const receipts = [
      {
        version: 'saved-full-assembly-physical-snapshot/1',
        opaque: 'module-private-full-assembly-physical-read-receipt',
      },
      new Proxy({}, { get: getter }),
      Object.defineProperty({}, 'version', { get: getter }),
    ];
    for (const verifiedReceipt of receipts) {
      expect(
        (
          await host.restore({
            verifiedReceipt,
            sourceOwner: {} as never,
            sourceRequest: {
              schemaVersion: 'dxf-product-saved-native-compiler-source-request/1',
              sourceFileId: 'fixture',
              sourceSha256: seed.row.sha256,
              techCardId: seed.row.techCardId,
              scopeKey: seed.row.scopeKey,
              patternLineKey: seed.row.patternLineKey,
              cardLockVersion: seed.row.cardLockVersion,
              draft: {},
            } as never,
          })
        ).ok,
      ).toBe(false);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(readCount).toBe(0);
    expect(host.getSnapshot()).toMatchObject({ status: 'idle', binding: null });
  });
  it('pre-abort refuses without reading a request accessor or consuming source', async () => {
    const host = createSavedGenericDurablePhysicalHostV1({ row: seed.row, bodySession: {} });
    cleanup.push(() => host.dispose());
    const getter = vi.fn(),
      request = Object.defineProperty({}, 'verifiedReceipt', { get: getter }),
      caller = new AbortController();
    caller.abort();
    expect((await host.restore(request as never, caller.signal)).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(readCount).toBe(0);
    expect(host.getSnapshot()).toMatchObject({ status: 'idle', binding: null });
  });
  it('never dispatches numeric or render work before a genuine restore, including structural leases', async () => {
    const host = createSavedGenericDurablePhysicalHostV1({ row: seed.row, bodySession: {} });
    cleanup.push(() => host.dispose());
    expect((await host.run16({} as never)).ok).toBe(false);
    expect((await host.run32({} as never)).ok).toBe(false);
    expect((await host.mountPreview({} as HTMLCanvasElement)).ok).toBe(false);
    expect((await host.projectLatestRender()).ok).toBe(false);
    expect(ports.calls).toHaveLength(0);
    expect(readCount).toBe(0);
    expect(host.getSnapshot().binding).toBeNull();
  });
});

describe('fixed durable generic host, real encoded V7 and genuine fresh receipts', () => {
  it('restores exact complete intent through a fresh one-shot native owner and genuine reader', async () => {
    const f = await fixture();
    const result = await f.host.restore(f.request);
    expect(result).toMatchObject({
      ok: true,
      binding: {
        sourceGeneration: 1,
        graphCanonicalSha256: f.context.graphCanonicalSha256,
        compileInputSha256: f.context.compileInputSha256,
        physicalInitializationCanonicalSha256: f.context.physicalInitialization.canonicalSha256,
        outerSha256: outer!.sidecarSha256,
      },
    });
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'ready',
      claims: {
        numericSnapshotIsCurrentAdmission: false,
        fitQualified: false,
        continuationQualified: false,
      },
    });
    expect(
      physicalReader.projectSavedFullAssemblyPhysicalSnapshotV1(f.reader).compileInputSha256,
    ).toBe(f.context.compileInputSha256);
    expect(Object.keys(f.host)).not.toContain('sourceOwner');
    expect(Object.keys(f.host)).not.toContain('bodyOwner');
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);

  it('rejects copied and proxy receipts without invoking getters, without consuming the native source', async () => {
    const f = await fixture(),
      getter = vi.fn();
    for (const receipt of [
      { ...f.reader },
      new Proxy(f.reader, { get: getter }),
      Object.defineProperty({}, 'version', { get: getter }),
    ]) {
      expect((await f.host.restore({ ...f.request, verifiedReceipt: receipt })).ok).toBe(false);
    }
    expect(getter).not.toHaveBeenCalled();
    expect((await f.host.restore(f.request)).ok).toBe(true);
  }, 120000);

  it('keeps actual numeric ownership private, runs fixed16/fresh32 and mounts only after fresh durable checks', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease, device } = await borrowedLease();
    const count = readCount;
    expect((await f.host.run16(lease)).ok).toBe(true);
    expect((await f.host.run32(lease)).ok).toBe(true);
    expect((await f.host.mountPreview({} as HTMLCanvasElement)).ok).toBe(true);
    expect((await f.host.projectLatestRender()).ok).toBe(true);
    expect(readCount).toBeGreaterThan(count + 20);
    expect(ports.calls.map((x) => x.frame)).toEqual([16, 32]);
    expect(f.host.getSnapshot().status).toBe('preview-ready');
    await f.host.stopPreview();
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'ready',
      binding: { sourceGeneration: 1 },
      numeric: { previewReceipt: null },
    });
    expect(device.destroy).not.toHaveBeenCalled();
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);

  it('preserves current binding and borrowed body when an explicit Stop cancels a held fresh read', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    const gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const reading = f.host.projectLatestRender();
    await started.promise;
    expect((await f.host.projectLatestRender()).ok).toBe(false); // busy must not revoke current state
    await f.host.stopPreview();
    expect((await reading).ok).toBe(false);
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'ready',
      binding: { sourceGeneration: 1 },
    });
    beforeWireRead = null;
    gate.resolve();
    await Promise.resolve();
    expect((await f.host.run16(lease)).ok).toBe(true);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);

  it('local read cancellation preserves current admission and frames; preabort has no effect', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    const caller = new AbortController(),
      gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const reading = f.host.projectLatestRender(caller.signal);
    await started.promise;
    caller.abort();
    expect((await reading).ok).toBe(false);
    expect(f.host.getSnapshot().binding).not.toBeNull();
    beforeWireRead = null;
    gate.resolve();
    expect((await f.host.run16(lease, caller.signal)).ok).toBe(false);
    expect(f.host.getSnapshot().binding).not.toBeNull();
    expect((await f.host.projectLatestRender()).ok).toBe(true);
  }, 120000);

  it('revokes frames and durable binding when the persisted complete outer changes', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    outer = undefined;
    expect((await f.host.run32(lease)).ok).toBe(false);
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'blocked',
      binding: null,
      numeric: { previewReceipt: null },
    });
    expect(ports.live.size).toBeGreaterThan(0);
    expect([...ports.live.values()].every((x) => x.signal.aborted)).toBe(true);
    expect((await f.host.run16(lease)).ok).toBe(false);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);

  it('checks caller-owned restore receipt again before publication and never disposes a borrowed live receipt', async () => {
    const f = await fixture();
    const gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const pending = f.host.restore(f.request);
    await started.promise;
    physicalReader.disposeSavedFullAssemblyPhysicalSnapshotV1(f.reader);
    beforeWireRead = null;
    gate.resolve();
    expect((await pending).ok).toBe(false);
    expect(f.host.getSnapshot().binding).toBeNull();
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);
  it('rejects a same-content body turn rebound after the last genuine target projection and keeps the source', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    requireOk(await f.host.run32(lease));
    requireOk(await f.host.mountPreview({} as HTMLCanvasElement));
    const original = bodyApi.projectCurrentSavedModelGenericObservedTargetV1;
    let reads = 0,
      terminal = Infinity;
    const spy = vi
      .spyOn(bodyApi, 'projectCurrentSavedModelGenericObservedTargetV1')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++reads === terminal) {
          await f.body.observe(null);
          await f.body.observe(f.observed.input);
          const replacement = await original(...args);
          if (!result.ok || !replacement.ok)
            throw new Error('Genuine target fixture unexpectedly unavailable.');
          expect(replacement.canonicalSha256).toBe(result.canonicalSha256);
          expect(replacement.target).toEqual(result.target);
        }
        return result;
      });
    try {
      requireOk(await f.host.projectLatestRender());
      terminal = reads;
      reads = 0;
      expect(terminal).toBeGreaterThan(0);
      expect((await f.host.projectLatestRender()).ok).toBe(false);
      expect(reads).toBe(terminal);
      expect(f.host.getSnapshot()).toMatchObject({
        status: 'blocked',
        binding: null,
        numeric: { sourceGeneration: 1, previewReceipt: null },
      });
      expect((await f.host.run16(lease)).ok).toBe(false);
      expect((await f.body.projectCurrentBody()).status).toBe('projected');
    } finally {
      spy.mockRestore();
    }
  }, 120000);

  it('refuses disposal reentrantly triggered by the last synchronous body-currentness poll', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    const original = bodyApi.isCurrentSavedModelGenericObservedTargetV1;
    let polls = 0,
      terminal = Infinity,
      disposed: Promise<boolean> | null = null;
    const spy = vi
      .spyOn(bodyApi, 'isCurrentSavedModelGenericObservedTargetV1')
      .mockImplementation((...args) => {
        const current = original(...args);
        if (++polls === terminal) disposed = f.host.dispose();
        return current;
      });
    try {
      requireOk(await f.host.projectLatestRender());
      terminal = polls;
      polls = 0;
      expect(terminal).toBeGreaterThan(0);
      expect((await f.host.projectLatestRender()).ok).toBe(false);
      expect(disposed).not.toBeNull();
      await disposed;
      expect(f.host.getSnapshot()).toMatchObject({ status: 'disposed', binding: null });
      expect((await f.body.projectCurrentBody()).status).toBe('projected');
    } finally {
      spy.mockRestore();
    }
  }, 120000);

  it('preview cleanup during pending restore does not cancel the one-shot upstream native compile', async () => {
    const f = await fixture(),
      gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const pending = f.host.restore(f.request);
    await started.promise;
    await f.host.stopPreview();
    expect(f.host.getSnapshot().status).toBe('restoring');
    beforeWireRead = null;
    gate.resolve();
    expect((await pending).ok).toBe(true);
  }, 120000);

  it('source caller cancellation revokes restored admission but never the borrowed displayed body', async () => {
    const f = await fixture(),
      caller = new AbortController();
    requireOk(await f.host.restore(f.request, caller.signal));
    caller.abort();
    expect(f.host.getSnapshot()).toMatchObject({ status: 'blocked', binding: null });
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);
  it('captures all restore intent fields before the first fresh-read await without cloning the native draft', async () => {
    const f = await fixture(),
      gate = deferredSessionValue<void>(),
      started = deferredSessionValue<void>();
    const request = { ...f.request, sourceRequest: { ...f.request.sourceRequest } };
    beforeWireRead = () => {
      started.resolve();
      return gate.promise;
    };
    const pending = f.host.restore(request);
    await started.promise;
    (request as unknown as Record<string, unknown>).verifiedReceipt = {};
    (request as unknown as Record<string, unknown>).sourceOwner = {};
    (request.sourceRequest as unknown as Record<string, unknown>).sourceFileId =
      'caller-mutated-after-admission';
    beforeWireRead = null;
    gate.resolve();
    expect((await pending).ok).toBe(true);
    expect(f.host.getSnapshot().binding?.compileInputSha256).toBe(f.context.compileInputSha256);
  }, 120000);

  it('refuses invalid or missing16 leases before changing an existing durable admission', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const binding = f.host.getSnapshot().binding;
    expect((await f.host.run16({} as never)).ok).toBe(false);
    const { lease } = await borrowedLease();
    expect((await f.host.run32(lease)).ok).toBe(false);
    expect(f.host.getSnapshot().binding).toBe(binding);
    expect((await f.host.run16(lease)).ok).toBe(true);
  }, 120000);

  it('routes current preview face identity through the saved graph and refuses stale or mismatched views', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    requireOk(await f.host.run32(lease));
    const saved = physicalReader.projectSavedFullAssemblyPhysicalSnapshotV1(f.reader);
    if (!saved) throw new Error('Current saved physical projection missing.');
    const { row, graph } = saved;
    const scope = {
      row,
      sourceFileId: graph.source.sourceFileId,
      sizeToken: graph.source.sizeToken,
    };
    const operation = graph.operations.find(({ seamIds }) => seamIds.length === 1)!;
    const runtimeSeam = graph.seams.find(({ id }) => id === operation.seamIds[0])!;
    const side = runtimeSeam.sides[0];
    const piece = graph.pieces.find(({ pieceId }) => pieceId === side.pieceId)!;
    const savedSeam = {
      operationNumber: operation.sourceOperationNumber,
      seamId: runtimeSeam.sourceSeamKey,
      sides: runtimeSeam.sides.map(({ anchors, ...identity }) => ({
        ...identity,
        boundaryVertexIds: anchors,
      })),
    };
    const canvas = { setPointerCapture: vi.fn() } as unknown as HTMLCanvasElement;
    const caller = new AbortController();
    const mounted = requireOk(await f.host.mountPreview(canvas, caller.signal));
    const frameReportSha256 = mounted.receipt.frameReportSha256;
    const garment = {
      kind: 'garment',
      frameReportSha256,
      triangleIndex: 7,
      pieceId: piece.pieceId,
    } as const;
    const pick = vi.fn<
      (x: number, y: number, runtimeSeamId?: string) => DxfGarmentObservedPreviewHitV1 | null
    >(() => garment);
    ports.previewPick = pick;
    for (const wrongScope of [
      { ...scope, row: { ...row, scopeKey: 'different-scope' } },
      { ...scope, row: { ...row, cardLockVersion: row.cardLockVersion + 1 } },
      { ...scope, sourceFileId: 'different-source' },
      { ...scope, sizeToken: 'different-size' },
    ])
      expect(f.host.pickPreview(canvas, wrongScope, 100, 200)).toBeNull();
    expect(f.host.pickPreview({} as HTMLCanvasElement, scope, 100, 200)).toBeNull();
    expect(pick).not.toHaveBeenCalled();
    pick.mockReturnValueOnce({ ...garment, frameReportSha256: '1'.repeat(64) });
    expect(f.host.pickPreview(canvas, scope, 100, 200)).toBeNull();
    pick.mockReturnValueOnce({ ...garment, pieceId: 'another-piece' });
    expect(f.host.pickPreview(canvas, scope, 100, 200)).toBeNull();

    const seamHit = {
      ...garment,
      seamSide: { runtimeSeamId: runtimeSeam.id, sideIndex: 0 as const },
    };
    pick.mockReturnValueOnce(seamHit);
    expect(f.host.pickPreview(canvas, scope, 100, 200, savedSeam)).toMatchObject({
      seamSide: {
        seamId: savedSeam.seamId,
        sideIndex: 0,
        contourId: side.contourId,
        boundaryVertexIds: side.anchors,
      },
    });
    expect(pick).toHaveBeenLastCalledWith(100, 200, runtimeSeam.id);
    for (const forged of [
      { ...savedSeam, operationNumber: -1 },
      { ...savedSeam, sides: [...savedSeam.sides].reverse() },
      {
        ...savedSeam,
        sides: [
          { ...savedSeam.sides[0]!, boundaryVertexIds: ['wrong', 'anchor'] },
          savedSeam.sides[1]!,
        ],
      },
    ]) {
      pick.mockReturnValueOnce(seamHit);
      expect(f.host.pickPreview(canvas, scope, 100, 200, forged)).not.toHaveProperty('seamSide');
      expect(pick).toHaveBeenLastCalledWith(100, 200, undefined);
    }

    const focusSelection = vi.fn();
    const selectOutline = vi.fn<(pieceId: string | null) => boolean>(() => true);
    ports.previewSelect = selectOutline;
    let interaction = bindCadWorkbenchPhysicalPreviewSelectionV1(
      scope,
      savedSeam.operationNumber,
      focusSelection,
      null,
      savedSeam,
    );
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', { event: undefined });
    const route = createRoot(reactMountContainer() as never);
    cleanup.push(async () => {
      await act(async () => route.unmount());
      vi.unstubAllGlobals();
    });
    let controls: ReactNode;
    function Controls() {
      // Run the actual React control hooks in the same CPU-only harness as the saved route test.
      const state = {
        host: f.host,
        sourceStatus: 'ready',
        durableSnapshot: f.host.getSnapshot(),
      } as ComponentProps<typeof CadWorkbenchPhysicalHostControlsV1>['state'];
      controls = CadWorkbenchPhysicalHostControlsV1({ state, interaction });
      const props = visitMountedTree(
        controls,
        (item) => item['aria-label'] === 'Cloth simulation on the selected mannequin',
      );
      const ref = props?.ref as RefObject<HTMLCanvasElement | null> | undefined;
      if (ref) ref.current = canvas;
      return null;
    }
    await act(async () => route.render(createElement(Controls)));
    const canvasProps = visitMountedTree(
      controls,
      (props) => props['aria-label'] === 'Cloth simulation on the selected mannequin',
    ) as ComponentProps<'canvas'> | null;
    if (!canvasProps) throw new Error('Mounted physical preview canvas is absent.');
    const pointer = (clientX: number, button = 0) =>
      ({
        isPrimary: true,
        button,
        pointerId: 1,
        clientX,
        clientY: 200,
        currentTarget: canvas,
      }) as PointerEvent<HTMLCanvasElement>;

    canvasProps.onPointerDown?.(pointer(100, 2));
    canvasProps.onPointerUp?.(pointer(100, 2));
    canvasProps.onPointerDown?.(pointer(100));
    canvasProps.onPointerMove?.(pointer(120));
    canvasProps.onPointerUp?.(pointer(100));
    expect(focusSelection).not.toHaveBeenCalled();

    const readCountBeforeClick = readCount;
    const hit = f.host.pickPreview(canvas, scope, 100, 200);
    expect(hit).toEqual({ ...garment, scopeKey: row.scopeKey, pieceLineKey: piece.pieceLineKey });
    expect(readCount).toBe(readCountBeforeClick);
    pick.mockReturnValueOnce(seamHit);
    canvasProps.onPointerDown?.(pointer(100));
    canvasProps.onPointerUp?.(pointer(100));
    expect(focusSelection).toHaveBeenCalledExactlyOnceWith({
      operationNumber: savedSeam.operationNumber,
      scopeKey: row.scopeKey,
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
      seamId: savedSeam.seamId,
      seamSideIndex: 0,
    });

    const body = {
      kind: 'body',
      frameReportSha256,
      triangleIndex: 3,
      persistedModel: { id: 11, updatedAt: '2026-11-01T00:00:00Z', revision: 'r1' },
      observedBodyContentSha256: 'a'.repeat(64),
    } as const;
    pick.mockReturnValueOnce(body);
    const bodyHit = f.host.pickPreview(canvas, scope, 100, 200);
    expect(bodyHit).toEqual(body);
    interaction?.onPick(bodyHit!);
    expect(focusSelection).toHaveBeenCalledTimes(1);

    const selected = {
      scopeKey: row.scopeKey,
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
    };
    interaction = bindCadWorkbenchPhysicalPreviewSelectionV1(scope, 120, focusSelection, {
      ...selected,
      operationNumber: 120,
    });
    await act(async () => route.render(createElement(Controls)));
    expect(selectOutline).toHaveBeenLastCalledWith(piece.pieceId);
    expect(readCount).toBe(readCountBeforeClick);
    expect(f.host.setPreviewSelectedPiece({} as HTMLCanvasElement, scope, selected)).toBe(false);
    expect(selectOutline).toHaveBeenLastCalledWith(piece.pieceId);

    expect(
      f.host.setPreviewSelectedPiece(canvas, scope, { ...selected, pieceLineKey: 'wrong-line' }),
    ).toBe(false);
    expect(selectOutline).toHaveBeenLastCalledWith(null);
    expect(f.host.setPreviewSelectedPiece(canvas, scope, selected)).toBe(true);
    expect(
      f.host.setPreviewSelectedPiece(canvas, { ...scope, sizeToken: 'wrong-size' }, selected),
    ).toBe(false);
    expect(selectOutline).toHaveBeenLastCalledWith(null);
    expect(f.host.setPreviewSelectedPiece(canvas, scope, selected)).toBe(true);
    interaction = null;
    await act(async () => route.render(createElement(Controls)));
    expect(selectOutline).toHaveBeenLastCalledWith(null);

    pick.mockImplementationOnce(() => {
      caller.abort();
      return garment;
    });
    expect(f.host.pickPreview(canvas, scope, 100, 200)).toBeNull();
    expect(f.host.pickPreview(canvas, scope, 100, 200)).toBeNull();
    selectOutline.mockClear();
    expect(f.host.setPreviewSelectedPiece(canvas, scope, selected)).toBe(false);
    expect(selectOutline).not.toHaveBeenCalled();
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'frame32-ready',
      binding: { sourceGeneration: 1 },
      numeric: { previewReceipt: null },
    });
    expect((await f.host.projectLatestRender()).ok).toBe(true);
  }, 120000);

  it('refuses fresh saved-row drift and clears physical children without revoking the borrowed body', async () => {
    const f = await fixture();
    requireOk(await f.host.restore(f.request));
    const { lease } = await borrowedLease();
    requireOk(await f.host.run16(lease));
    editWire = (wire) => {
      wire.row.savedRowRevision++;
    };
    expect((await f.host.projectLatestRender()).ok).toBe(false);
    expect(f.host.getSnapshot()).toMatchObject({
      status: 'blocked',
      binding: null,
      numeric: { previewReceipt: null },
    });
    expect([...ports.live.values()].every((x) => x.signal.aborted)).toBe(true);
    expect((await f.body.projectCurrentBody()).status).toBe('projected');
  }, 120000);
});
