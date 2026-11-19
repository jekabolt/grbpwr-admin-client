import type { PatternImportDxfProductPhaseEExactTopologySideBindingV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionContourV1,
  type PatternImportDxfProductPhaseEAssemblyProjectionVertexV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { isTopstitchThreadLine, type TopstitchBomLine } from '../../topstitch-lines';
import { resolvePatternImportDxfPhaseECadWorkbenchThreadCatalogV1 } from './cad-workbench-bom-visual-authority-v1';
import { CAD_WORKBENCH_SEAM_SIDE_COLORS } from './cad-workbench-seam-colors-v1';
import { cadWorkbenchOperationSeamOrdinal } from './cad-workbench-seam-ordinal-v1';
import type {
  PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1,
  PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
} from './cad-mannequin-dxf-staging-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1,
  type PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1,
  type PatternImportDxfPhaseEGoldenCardFullExactConnectionV1,
} from './golden-card-full-exact-capture-aggregator-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
  type PatternImportDxfPhaseEStitchVisualV1,
} from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-scene-overlay/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_CLAIMS_V1 = Object.freeze({
  existingAllScopeProjectionReused: true,
  existingExactAssemblyConnectionsReused: true,
  existingStitchVisualAndBomThreadReused: true,
  exactLocalPlaneCoordinatesOnly: true,
  exactAdjacentVerticesRequired: true,
  nearestPointRecoveryUsed: false,
  snappingUsed: false,
  geometryOwnerCreated: false,
  clothOwnerCreated: false,
  operationOwnerCreated: false,
  missingLayerAuthorityFailsClosed: true,
  pinAuthorityAvailable: false,
} as const);

const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PIN_AUTHORITY_UNAVAILABLE_REASON =
  'No current exact pin-coordinate owner exists; pin guides are hidden.' as const;

export type PatternImportDxfPhaseECadMannequinScenePointMmV1 = Readonly<{
  x: number;
  y: number;
}>;

export type PatternImportDxfPhaseECadMannequinScenePiecePlaneV1 = Readonly<{
  piecePlaneKey: string;
  scopeKey: string;
  scopeLabel: string;
  sourceFileId: string;
  sizeToken: string;
  expectedCatalogCanonicalSha256: string;
  pieceId: string;
  pieceLineKey: string;
  contours: readonly Readonly<{
    contourId: string;
    role: PatternImportDxfProductPhaseEAssemblyProjectionContourV1['role'];
    closed: boolean;
    orderedVertexIds: readonly string[];
    orderedPointsMm: readonly PatternImportDxfPhaseECadMannequinScenePointMmV1[];
  }>[];
  focused: boolean;
}>;

export type PatternImportDxfPhaseECadMannequinSceneEdgeHighlightV1 = Readonly<{
  primitiveId: string;
  connectionRef: string;
  operationNumber: number;
  seamOrdinal: number;
  authoringOperationId: string;
  side: 'A' | 'B';
  semanticColorHex: (typeof CAD_WORKBENCH_SEAM_SIDE_COLORS)[keyof typeof CAD_WORKBENCH_SEAM_SIDE_COLORS];
  piecePlaneKey: string;
  scopeKey: string;
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  direction: 'forward' | 'reverse';
  boundaryVertexIds: readonly [string, string];
  orderedVertexIds: readonly [string, string];
  orderedPointsMm: readonly [
    PatternImportDxfPhaseECadMannequinScenePointMmV1,
    PatternImportDxfPhaseECadMannequinScenePointMmV1,
  ];
  focused: boolean;
}>;

export type PatternImportDxfPhaseECadMannequinSceneGuideEndpointV1 = Readonly<{
  piecePlaneKey: string;
  scopeKey: string;
  pieceId: string;
  vertexId: string;
  pointMm: PatternImportDxfPhaseECadMannequinScenePointMmV1;
}>;

export type PatternImportDxfPhaseECadMannequinSceneCorrespondenceGuideV1 = Readonly<{
  primitiveId: string;
  connectionRef: string;
  operationNumber: number;
  directionRelation: 'same' | 'reversed';
  ordinal: 0 | 1;
  from: PatternImportDxfPhaseECadMannequinSceneGuideEndpointV1;
  to: PatternImportDxfPhaseECadMannequinSceneGuideEndpointV1;
  focused: boolean;
}>;

export type PatternImportDxfPhaseECadMannequinSceneThreadGuideV1 = Readonly<{
  primitiveId: string;
  connectionRef: string;
  operationNumber: number;
  bomLineKey: string;
  colorHex: string;
  ordinal: 0 | 1;
  from: PatternImportDxfPhaseECadMannequinSceneGuideEndpointV1;
  to: PatternImportDxfPhaseECadMannequinSceneGuideEndpointV1;
  focused: boolean;
}>;

export type PatternImportDxfPhaseECadMannequinSceneUnavailableLayerV1 = Readonly<{
  layer: 'exact-seam-edges' | 'seam-correspondence' | 'thread-guides' | 'pin-guides' | 'focus';
  code:
    | 'no-active-operation'
    | 'no-active-exact-seams'
    | 'exact-side-piece-unavailable'
    | 'exact-side-piece-ambiguous'
    | 'exact-side-catalog-mismatch'
    | 'exact-contour-unavailable'
    | 'exact-vertex-unavailable'
    | 'exact-vertices-not-adjacent'
    | 'thread-operation-ambiguous'
    | 'thread-visual-unavailable'
    | 'thread-reference-unavailable'
    | 'thread-color-unavailable'
    | 'pin-authority-unavailable'
    | 'selection-stale';
  detail: string;
}>;

export type PatternImportDxfPhaseECadMannequinSceneOverlayV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_V1;
  status: 'read-only-exact-scene-overlay';
  context: Readonly<{
    techCardId: number;
    cardRef: string;
    cardLockVersion: number;
    serverAssemblyRevision: string;
    importGeneration: number;
  }>;
  piecePlanes: readonly PatternImportDxfPhaseECadMannequinScenePiecePlaneV1[];
  edgeHighlights: readonly PatternImportDxfPhaseECadMannequinSceneEdgeHighlightV1[];
  correspondenceGuides: readonly PatternImportDxfPhaseECadMannequinSceneCorrespondenceGuideV1[];
  threadGuides: readonly PatternImportDxfPhaseECadMannequinSceneThreadGuideV1[];
  pinGuides: readonly [];
  focus: Readonly<{
    currentOperationNumber: number | null;
    currentOperationId: string | null;
    selectedPiecePlaneKey: string | null;
    selectedConnectionRef: string | null;
  }>;
  visibility: Readonly<{
    piecePlanes: boolean;
    exactSeamEdges: boolean;
    seamCorrespondence: boolean;
    threadGuides: boolean;
    pinGuides: false;
  }>;
  capabilities: Readonly<{
    pinGuides: Readonly<{
      available: false;
      status: 'unavailable';
      blocker: Readonly<{
        code: 'pin-authority-unavailable';
        reason: typeof PIN_AUTHORITY_UNAVAILABLE_REASON;
      }>;
    }>;
  }>;
  unavailableLayers: readonly PatternImportDxfPhaseECadMannequinSceneUnavailableLayerV1[];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadMannequinSceneOverlayBlockerV1 = Readonly<{
  code:
    | 'context-invalid'
    | 'staging-stale'
    | 'staging-invalid'
    | 'assembly-graph-stale'
    | 'assembly-graph-invalid';
  detail: string;
}>;

export type PatternImportDxfPhaseECadMannequinSceneOverlayResultV1 =
  | Readonly<{
      ok: true;
      overlay: PatternImportDxfPhaseECadMannequinSceneOverlayV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      overlay: null;
      blocker: PatternImportDxfPhaseECadMannequinSceneOverlayBlockerV1;
    }>;

export type PatternImportDxfPhaseECadMannequinSceneOverlayRequestV1 = Readonly<{
  current: Readonly<{
    techCardId: number;
    cardRef: string;
    cardLockVersion: number;
    serverAssemblyRevision: string;
    importGeneration: number;
  }>;
  staging: Readonly<{
    techCardId: number;
    importGeneration: number;
    sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
  }>;
  graph: PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1;
  activeOperationNumber: number | null;
  selection?: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null;
  stitchVisuals: readonly Readonly<{
    operationNumber: number;
    visual: PatternImportDxfPhaseEStitchVisualV1;
  }>[];
  bomItems: readonly TopstitchBomLine[];
}>;

/**
 * The minimum exact authority consumed by the renderer-neutral scene compiler. Unlike the legacy
 * V1 ingress, this contract is not a FullExactCaptureGraph and does not claim to own or recreate
 * the card-wide capture receipt.
 */
export type PatternImportDxfPhaseECadMannequinSceneExactOperationAuthorityV2 = Readonly<{
  operationNumber: number;
  seamKeys: readonly string[];
  exactConnections: readonly PatternImportDxfPhaseEGoldenCardFullExactConnectionV1[];
}>;

export type PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2 = Readonly<{
  techCardId: number;
  cardRef: string;
  cardLockVersion: number;
  serverAssemblyRevision: string;
  operations: readonly PatternImportDxfPhaseECadMannequinSceneExactOperationAuthorityV2[];
  connections: readonly PatternImportDxfPhaseEGoldenCardFullExactConnectionV1[];
}>;

export type PatternImportDxfPhaseECadMannequinSceneOverlayAuthorityRequestV2 = Omit<
  PatternImportDxfPhaseECadMannequinSceneOverlayRequestV1,
  'graph'
> &
  Readonly<{ authority: PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2 }>;

type PlaneCandidate = Readonly<{
  source: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1;
  piece: PatternImportDxfPhaseECadMannequinDxfStagingSourceV1['projection']['pieces'][number];
  piecePlaneKey: string;
}>;

type ResolvedSide = Readonly<{
  side: 'A' | 'B';
  binding: PatternImportDxfProductPhaseEExactTopologySideBindingV1;
  candidate: PlaneCandidate;
  orderedVertexIds: readonly [string, string];
  orderedPointsMm: readonly [
    PatternImportDxfPhaseECadMannequinScenePointMmV1,
    PatternImportDxfPhaseECadMannequinScenePointMmV1,
  ];
}>;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: PatternImportDxfPhaseECadMannequinSceneOverlayBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseECadMannequinSceneOverlayResultV1 {
  return Object.freeze({
    ok: false as const,
    overlay: null,
    blocker: Object.freeze({ code, detail }),
  });
}

const stableRef = (value: unknown): value is string =>
  typeof value === 'string' && STABLE_REF.test(value);
const exactInteger = (value: unknown, minimum: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= minimum;
const unique = (values: readonly string[]): boolean => values.length === new Set(values).size;

function finitePoint(point: unknown): point is PatternImportDxfPhaseECadMannequinScenePointMmV1 {
  if (!point || typeof point !== 'object') return false;
  const candidate = point as Readonly<{ x?: unknown; y?: unknown }>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const source = value.trim();
  if (!/^#?[0-9a-f]{6}$/i.test(source)) return null;
  return `#${source.replace(/^#/, '').toUpperCase()}`;
}

const connectionSignature = (connection: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1) =>
  JSON.stringify({
    connectionRef: connection.connectionRef,
    operationNumber: connection.operationNumber,
    authoringOperationId: connection.authoringOperationId,
    row: connection.row,
    serverTopologySha256: connection.serverTopologySha256,
    catalogCanonicalSha256: connection.catalogCanonicalSha256,
    sides: connection.sides,
  });

function stagingIssue(
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[],
): string | null {
  if (!Array.isArray(sources) || sources.length === 0) return 'No prepared material scope exists.';
  if (
    !unique(sources.map(({ scopeKey }) => scopeKey)) ||
    sources.some(({ scopeKey }) => !stableRef(scopeKey))
  )
    return 'Prepared material scope identities are empty or duplicated.';
  const pieceKeys = new Set<string>();
  for (const source of sources) {
    const projection = source.projection;
    if (
      projection?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1 ||
      !SHA256.test(projection.expectedCatalogCanonicalSha256 ?? '') ||
      !SHA256.test(projection.sizeSelectionCanonicalSha256 ?? '') ||
      !stableRef(projection.sourceFileId) ||
      typeof projection.sizeToken !== 'string' ||
      !projection.sizeToken.trim() ||
      projection.joinMode !== 'catalog-ordinal-to-phase-d-point' ||
      projection.geometryPlacementApplied !== false ||
      !Array.isArray(projection.pieces)
    )
      return `Scope ${source.scopeKey} does not carry one exact prepared projection.`;
    for (const piece of projection.pieces) {
      if (!stableRef(piece.pieceId) || !stableRef(piece.pieceLineKey))
        return `Scope ${source.scopeKey} contains an invalid piece identity.`;
      const pieceKey = `${source.scopeKey}\u0000${piece.pieceId}\u0000${piece.pieceLineKey}`;
      if (pieceKeys.has(pieceKey)) return `Prepared piece ${pieceKey} is duplicated.`;
      pieceKeys.add(pieceKey);
      if (!Array.isArray(piece.contours) || piece.contours.length === 0)
        return `Prepared piece ${pieceKey} has no exact contours.`;
      const contourIds = piece.contours.map(
        ({ contourId }: PatternImportDxfProductPhaseEAssemblyProjectionContourV1) => contourId,
      );
      if (!unique(contourIds) || contourIds.some((contourId: string) => !stableRef(contourId)))
        return `Prepared piece ${pieceKey} has invalid or duplicated contours.`;
      for (const contour of piece.contours) {
        if (!Array.isArray(contour.vertices) || contour.vertices.length < 2)
          return `Contour ${contour.contourId} has no renderable exact vertices.`;
        const vertexIds = contour.vertices.map(
          ({ vertexId }: PatternImportDxfProductPhaseEAssemblyProjectionVertexV1) => vertexId,
        );
        if (!unique(vertexIds) || vertexIds.some((vertexId: string) => !stableRef(vertexId)))
          return `Contour ${contour.contourId} has invalid or duplicated vertex identities.`;
        if (
          contour.vertices.some(
            (vertex: PatternImportDxfProductPhaseEAssemblyProjectionVertexV1, index: number) =>
              vertex.ordinal !== index ||
              !Number.isFinite(vertex.normalizedArc) ||
              vertex.normalizedArc < 0 ||
              vertex.normalizedArc > 1 ||
              !finitePoint(vertex.pointMm),
          )
        )
          return `Contour ${contour.contourId} has stale ordinal or coordinate evidence.`;
      }
    }
  }
  return null;
}

function authorityIssue(
  graph: PatternImportDxfPhaseECadMannequinSceneExactAuthorityV2,
): string | null {
  if (!graph || !Array.isArray(graph.operations) || !Array.isArray(graph.connections))
    return 'The Assembly Order exact authority is unavailable.';
  if (
    graph.operations.some(({ operationNumber }) => !exactInteger(operationNumber, 1)) ||
    !unique(graph.operations.map(({ operationNumber }) => String(operationNumber)))
  )
    return 'Assembly operation identities are invalid or duplicated.';
  const seamOwners = new Set<string>();
  for (const operation of graph.operations) {
    if (!Array.isArray(operation.seamKeys) || !Array.isArray(operation.exactConnections))
      return `Assembly operation ${operation.operationNumber} has no exact connection carrier.`;
    if (
      !unique(operation.seamKeys) ||
      operation.seamKeys.some((seamId: string) => !stableRef(seamId))
    )
      return `Assembly operation ${operation.operationNumber} has duplicated seam identities.`;
    for (const seamId of operation.seamKeys) {
      if (seamOwners.has(seamId)) return `Assembly seam ${seamId} has more than one owner.`;
      seamOwners.add(seamId);
    }
    const connectionRefs = operation.exactConnections.map(
      ({ connectionRef }: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1) => connectionRef,
    );
    if (!unique(connectionRefs))
      return `Assembly operation ${operation.operationNumber} duplicates an exact connection.`;
    if (
      connectionRefs.length !== operation.seamKeys.length ||
      operation.seamKeys.some((seamId: string) => !connectionRefs.includes(seamId))
    )
      return `Assembly operation ${operation.operationNumber} has stale exact seam coverage.`;
  }
  if (!unique(graph.connections.map(({ connectionRef }) => connectionRef)))
    return 'The exact graph duplicates a connection identity.';
  const flattened = graph.operations.flatMap(({ exactConnections }) => exactConnections);
  if (flattened.length !== graph.connections.length)
    return 'The exact graph connection index is stale.';
  for (const connection of flattened) {
    const indexed = graph.connections.filter(
      ({ connectionRef }) => connectionRef === connection.connectionRef,
    );
    if (indexed.length !== 1 || connectionSignature(indexed[0]) !== connectionSignature(connection))
      return `Exact connection ${connection.connectionRef} is stale in the graph index.`;
  }
  return null;
}

const buildPlaneCandidates = (
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[],
): readonly PlaneCandidate[] =>
  sources.flatMap((source) =>
    source.projection.pieces.map((piece) => ({
      source,
      piece,
      piecePlaneKey: `${source.scopeKey}:${piece.pieceId}:${piece.pieceLineKey}`,
    })),
  );

function selectedPiecePlaneKey(
  candidates: readonly PlaneCandidate[],
  selection: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null | undefined,
): string | null {
  if (!selection?.pieceId) return null;
  const matches = candidates.filter(
    ({ source, piece }) =>
      piece.pieceId === selection.pieceId &&
      (!selection.scopeKey || source.scopeKey === selection.scopeKey) &&
      (selection.pieceLineKey == null || piece.pieceLineKey === selection.pieceLineKey),
  );
  return matches.length === 1 ? matches[0].piecePlaneKey : null;
}

const layerIssue = (
  layer: PatternImportDxfPhaseECadMannequinSceneUnavailableLayerV1['layer'],
  code: PatternImportDxfPhaseECadMannequinSceneUnavailableLayerV1['code'],
  detail: string,
): PatternImportDxfPhaseECadMannequinSceneUnavailableLayerV1 =>
  Object.freeze({ layer, code, detail });

function resolveSide(
  connection: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1,
  binding: PatternImportDxfProductPhaseEExactTopologySideBindingV1,
  side: 'A' | 'B',
  candidates: readonly PlaneCandidate[],
):
  | Readonly<{ ok: true; value: ResolvedSide }>
  | Readonly<{
      ok: false;
      code: PatternImportDxfPhaseECadMannequinSceneUnavailableLayerV1['code'];
      detail: string;
    }> {
  const matches = candidates.filter(
    ({ piece }) => piece.pieceId === binding.pieceId && piece.pieceLineKey === binding.pieceLineKey,
  );
  if (matches.length === 0)
    return {
      ok: false,
      code: 'exact-side-piece-unavailable',
      detail: `Exact side ${side} of ${connection.connectionRef} has no staged piece.`,
    };
  if (matches.length !== 1)
    return {
      ok: false,
      code: 'exact-side-piece-ambiguous',
      detail: `Exact side ${side} of ${connection.connectionRef} resolves across more than one material scope.`,
    };
  const candidate = matches[0];
  if (
    candidate.source.projection.expectedCatalogCanonicalSha256 !== connection.catalogCanonicalSha256
  )
    return {
      ok: false,
      code: 'exact-side-catalog-mismatch',
      detail: `Exact side ${side} of ${connection.connectionRef} belongs to another prepared catalog.`,
    };
  const contours = candidate.piece.contours.filter(
    ({ contourId }) => contourId === binding.contourId,
  );
  if (contours.length !== 1)
    return {
      ok: false,
      code: 'exact-contour-unavailable',
      detail: `Exact contour ${binding.contourId} is unavailable on ${candidate.piecePlaneKey}.`,
    };
  const contour = contours[0];
  const indices = binding.boundaryVertexIds.map((vertexId) =>
    contour.vertices.findIndex((vertex) => vertex.vertexId === vertexId),
  ) as [number, number];
  if (
    indices.some((index) => index < 0) ||
    binding.boundaryVertexIds[0] === binding.boundaryVertexIds[1]
  )
    return {
      ok: false,
      code: 'exact-vertex-unavailable',
      detail: `Exact boundary vertices are missing or duplicated on ${binding.contourId}.`,
    };
  const distance = Math.abs(indices[0] - indices[1]);
  if (distance !== 1 && !(contour.closed && distance === contour.vertices.length - 1))
    return {
      ok: false,
      code: 'exact-vertices-not-adjacent',
      detail: `Exact boundary vertices are not adjacent on ${binding.contourId}.`,
    };
  const boundaryVertices = binding.boundaryVertexIds.map((vertexId) =>
    contour.vertices.find((vertex) => vertex.vertexId === vertexId),
  ) as [(typeof contour.vertices)[number], (typeof contour.vertices)[number]];
  const orderedVertices =
    binding.direction === 'forward'
      ? boundaryVertices
      : ([boundaryVertices[1], boundaryVertices[0]] as const);
  return {
    ok: true,
    value: {
      side,
      binding,
      candidate,
      orderedVertexIds: [orderedVertices[0].vertexId, orderedVertices[1].vertexId],
      orderedPointsMm: [orderedVertices[0].pointMm, orderedVertices[1].pointMm],
    },
  };
}

function endpoint(
  side: ResolvedSide,
  ordinal: 0 | 1,
): PatternImportDxfPhaseECadMannequinSceneGuideEndpointV1 {
  return {
    piecePlaneKey: side.candidate.piecePlaneKey,
    scopeKey: side.candidate.source.scopeKey,
    pieceId: side.binding.pieceId,
    vertexId: side.orderedVertexIds[ordinal],
    pointMm: side.orderedPointsMm[ordinal],
  };
}

function threadStyle(
  activeOperationNumber: number,
  stitchVisuals: PatternImportDxfPhaseECadMannequinSceneOverlayRequestV1['stitchVisuals'],
  bomItems: readonly TopstitchBomLine[],
):
  | Readonly<{ ok: true; bomLineKey: string; colorHex: string }>
  | Readonly<{
      ok: false;
      code: PatternImportDxfPhaseECadMannequinSceneUnavailableLayerV1['code'];
      detail: string;
    }> {
  const visuals = stitchVisuals.filter(
    ({ operationNumber }) => operationNumber === activeOperationNumber,
  );
  if (visuals.length > 1)
    return {
      ok: false,
      code: 'thread-operation-ambiguous',
      detail: `Operation ${activeOperationNumber} has duplicated stitch visual projections.`,
    };
  const visual = visuals[0]?.visual;
  if (visual?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1)
    return {
      ok: false,
      code: 'thread-visual-unavailable',
      detail: `Operation ${activeOperationNumber} has no current StitchVisual.`,
    };
  const catalog = resolvePatternImportDxfPhaseECadWorkbenchThreadCatalogV1(bomItems);
  const bomLineKey = visual.thread.bomLineKey;
  if (!catalog.ok || !bomLineKey || !catalog.keys.includes(bomLineKey))
    return {
      ok: false,
      code: 'thread-reference-unavailable',
      detail: `Operation ${activeOperationNumber} has no unique current BOM thread reference.`,
    };
  const rows = bomItems.filter(
    (item) => item.lineKey?.trim() === bomLineKey && isTopstitchThreadLine(item),
  );
  if (rows.length !== 1)
    return {
      ok: false,
      code: 'thread-reference-unavailable',
      detail: `BOM thread ${bomLineKey} is unavailable or duplicated.`,
    };
  const colorHex = normalizeHex(rows[0].color);
  if (!colorHex)
    return {
      ok: false,
      code: 'thread-color-unavailable',
      detail: `BOM thread ${bomLineKey} has no exact hex colour.`,
    };
  return { ok: true, bomLineKey, colorHex };
}

/**
 * Renderer-neutral overlay adapter. Points stay in exact piece-local millimetre planes; a 3D
 * renderer may transform those planes but this adapter never places, snaps or fits geometry.
 */
export function buildPatternImportDxfPhaseECadMannequinSceneOverlayV1(
  request: PatternImportDxfPhaseECadMannequinSceneOverlayRequestV1,
): PatternImportDxfPhaseECadMannequinSceneOverlayResultV1 {
  if (
    request?.graph?.schemaVersion !==
    PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1
  )
    return blocked('assembly-graph-invalid', 'The Assembly Order exact graph is unavailable.');
  return buildPatternImportDxfPhaseECadMannequinSceneOverlayFromExactAuthorityV2({
    ...request,
    authority: request.graph,
  });
}

/**
 * Compiles scene primitives from a caller-verified narrow exact authority. The caller remains
 * responsible for proving how row, topology, catalog and operation bindings were obtained.
 */
export function buildPatternImportDxfPhaseECadMannequinSceneOverlayFromExactAuthorityV2(
  request: PatternImportDxfPhaseECadMannequinSceneOverlayAuthorityRequestV2,
): PatternImportDxfPhaseECadMannequinSceneOverlayResultV1 {
  const current = request?.current;
  if (
    !current ||
    !exactInteger(current.techCardId, 1) ||
    !stableRef(current.cardRef) ||
    !exactInteger(current.cardLockVersion, 0) ||
    !current.serverAssemblyRevision?.trim() ||
    !exactInteger(current.importGeneration, 1) ||
    (request.activeOperationNumber !== null && !exactInteger(request.activeOperationNumber, 1))
  )
    return blocked(
      'context-invalid',
      'A bounded current card, Assembly and import context is required.',
    );
  if (
    request.staging.techCardId !== current.techCardId ||
    request.staging.importGeneration !== current.importGeneration
  )
    return blocked(
      'staging-stale',
      'The all-scope staging set belongs to another card or import generation.',
    );
  const invalidStaging = stagingIssue(request.staging.sources);
  if (invalidStaging) return blocked('staging-invalid', invalidStaging);
  if (
    request.authority.techCardId !== current.techCardId ||
    request.authority.cardRef !== current.cardRef ||
    request.authority.cardLockVersion !== current.cardLockVersion ||
    request.authority.serverAssemblyRevision !== current.serverAssemblyRevision
  )
    return blocked(
      'assembly-graph-stale',
      'The exact Assembly Order graph is not current for this card lock.',
    );
  const invalidGraph = authorityIssue(request.authority);
  if (invalidGraph) return blocked('assembly-graph-invalid', invalidGraph);

  const candidates = buildPlaneCandidates(request.staging.sources);
  const selectedPlaneKey = selectedPiecePlaneKey(candidates, request.selection);
  const unavailableLayers: PatternImportDxfPhaseECadMannequinSceneUnavailableLayerV1[] = [];
  if (request.selection?.pieceId && !selectedPlaneKey)
    unavailableLayers.push(
      layerIssue(
        'focus',
        'selection-stale',
        'The selected piece is missing or ambiguous in all-scope staging.',
      ),
    );
  const activeOperation =
    request.activeOperationNumber === null
      ? null
      : request.authority.operations.find(
          ({ operationNumber }) => operationNumber === request.activeOperationNumber,
        ) ?? null;
  if (request.activeOperationNumber !== null && !activeOperation)
    return blocked(
      'assembly-graph-stale',
      'The selected Assembly Order operation is absent from the exact graph.',
    );

  const selectedConnectionRef =
    request.selection?.seamId &&
    activeOperation?.exactConnections.some(
      ({ connectionRef }) => connectionRef === request.selection?.seamId,
    )
      ? request.selection.seamId
      : null;
  if (request.selection?.seamId && !selectedConnectionRef)
    unavailableLayers.push(
      layerIssue(
        'focus',
        'selection-stale',
        'The selected seam does not belong to the current operation.',
      ),
    );

  const edgeHighlights: PatternImportDxfPhaseECadMannequinSceneEdgeHighlightV1[] = [];
  const correspondenceGuides: PatternImportDxfPhaseECadMannequinSceneCorrespondenceGuideV1[] = [];
  let currentOperationId: string | null = null;
  let exactLayerAvailable = false;
  const connections = activeOperation?.exactConnections ?? [];
  if (!activeOperation) {
    unavailableLayers.push(
      layerIssue(
        'exact-seam-edges',
        'no-active-operation',
        'No Assembly Order operation is selected.',
      ),
      layerIssue(
        'seam-correspondence',
        'no-active-operation',
        'No Assembly Order operation is selected.',
      ),
    );
  } else if (connections.length === 0) {
    unavailableLayers.push(
      layerIssue(
        'exact-seam-edges',
        'no-active-exact-seams',
        'The current operation has no exact seams.',
      ),
      layerIssue(
        'seam-correspondence',
        'no-active-exact-seams',
        'The current operation has no exact seams.',
      ),
    );
  } else {
    const authoringIds = new Set(
      connections.map(({ authoringOperationId }) => authoringOperationId),
    );
    if (authoringIds.size !== 1 || !stableRef(connections[0].authoringOperationId))
      return blocked(
        'assembly-graph-invalid',
        'The current exact connections disagree on operation identity.',
      );
    currentOperationId = connections[0].authoringOperationId;
    const compiled: {
      connection: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1;
      sides: [ResolvedSide, ResolvedSide];
    }[] = [];
    for (const connection of connections) {
      if (
        connection.operationNumber !== activeOperation.operationNumber ||
        connection.row.techCardId !== current.techCardId ||
        connection.row.cardLockVersion !== current.cardLockVersion ||
        !SHA256.test(connection.serverTopologySha256) ||
        !SHA256.test(connection.catalogCanonicalSha256) ||
        connection.sides[0]?.sideIndex !== 0 ||
        connection.sides[1]?.sideIndex !== 1 ||
        connection.sides.some(({ seamId }) => seamId !== connection.connectionRef)
      )
        return blocked(
          'assembly-graph-invalid',
          `Exact connection ${connection.connectionRef} has a stale owner or side crosswalk.`,
        );
      const a = resolveSide(connection, connection.sides[0], 'A', candidates);
      const b = resolveSide(connection, connection.sides[1], 'B', candidates);
      if (!a.ok || !b.ok) {
        const issue = !a.ok ? a : !b.ok ? b : null;
        if (issue) unavailableLayers.push(layerIssue('exact-seam-edges', issue.code, issue.detail));
        compiled.length = 0;
        break;
      }
      compiled.push({ connection, sides: [a.value, b.value] });
    }
    if (compiled.length !== connections.length) {
      unavailableLayers.push(
        layerIssue(
          'seam-correspondence',
          'exact-vertex-unavailable',
          'Seam correspondence is hidden because one current exact side could not be projected.',
        ),
      );
    } else {
      exactLayerAvailable = true;
      for (const { connection, sides } of compiled) {
        const seamOrdinal = cadWorkbenchOperationSeamOrdinal(
          activeOperation.seamKeys,
          connection.connectionRef,
        );
        if (seamOrdinal === null)
          return blocked(
            'assembly-graph-invalid',
            'The exact seam has no unique operation position.',
          );
        const focused =
          !selectedConnectionRef || selectedConnectionRef === connection.connectionRef;
        for (const resolved of sides)
          edgeHighlights.push({
            primitiveId: `edge:${connection.connectionRef}:${resolved.side}`,
            connectionRef: connection.connectionRef,
            operationNumber: connection.operationNumber,
            seamOrdinal,
            authoringOperationId: connection.authoringOperationId,
            side: resolved.side,
            semanticColorHex: CAD_WORKBENCH_SEAM_SIDE_COLORS[resolved.side],
            piecePlaneKey: resolved.candidate.piecePlaneKey,
            scopeKey: resolved.candidate.source.scopeKey,
            pieceId: resolved.binding.pieceId,
            pieceLineKey: resolved.binding.pieceLineKey,
            contourId: resolved.binding.contourId,
            direction: resolved.binding.direction,
            boundaryVertexIds: resolved.binding.boundaryVertexIds,
            orderedVertexIds: resolved.orderedVertexIds,
            orderedPointsMm: resolved.orderedPointsMm,
            focused,
          });
        const directionRelation =
          sides[0].binding.direction === sides[1].binding.direction ? 'same' : 'reversed';
        for (const ordinal of [0, 1] as const)
          correspondenceGuides.push({
            primitiveId: `correspondence:${connection.connectionRef}:${ordinal}`,
            connectionRef: connection.connectionRef,
            operationNumber: connection.operationNumber,
            directionRelation,
            ordinal,
            from: endpoint(sides[0], ordinal),
            to: endpoint(sides[1], ordinal),
            focused,
          });
      }
    }
  }

  const threadGuides: PatternImportDxfPhaseECadMannequinSceneThreadGuideV1[] = [];
  if (!activeOperation || !exactLayerAvailable) {
    unavailableLayers.push(
      layerIssue(
        'thread-guides',
        'thread-visual-unavailable',
        'Thread guides require one current operation with projected exact seams.',
      ),
    );
  } else {
    const style = threadStyle(
      activeOperation.operationNumber,
      request.stitchVisuals,
      request.bomItems,
    );
    if (!style.ok) unavailableLayers.push(layerIssue('thread-guides', style.code, style.detail));
    else
      for (const guide of correspondenceGuides)
        threadGuides.push({
          primitiveId: `thread:${guide.connectionRef}:${guide.ordinal}`,
          connectionRef: guide.connectionRef,
          operationNumber: guide.operationNumber,
          bomLineKey: style.bomLineKey,
          colorHex: style.colorHex,
          ordinal: guide.ordinal,
          from: guide.from,
          to: guide.to,
          focused: guide.focused,
        });
  }
  unavailableLayers.push(
    layerIssue('pin-guides', 'pin-authority-unavailable', PIN_AUTHORITY_UNAVAILABLE_REASON),
  );

  const piecePlanes: PatternImportDxfPhaseECadMannequinScenePiecePlaneV1[] = candidates.map(
    ({ source, piece, piecePlaneKey }) => ({
      piecePlaneKey,
      scopeKey: source.scopeKey,
      scopeLabel: source.label,
      sourceFileId: source.projection.sourceFileId,
      sizeToken: source.projection.sizeToken,
      expectedCatalogCanonicalSha256: source.projection.expectedCatalogCanonicalSha256,
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
      contours: piece.contours.map((contour) => ({
        contourId: contour.contourId,
        role: contour.role,
        closed: contour.closed,
        orderedVertexIds: contour.vertices.map(({ vertexId }) => vertexId),
        orderedPointsMm: contour.vertices.map(({ pointMm }) => pointMm),
      })),
      focused: selectedPlaneKey === piecePlaneKey,
    }),
  );
  const overlay: PatternImportDxfPhaseECadMannequinSceneOverlayV1 = deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_V1,
    status: 'read-only-exact-scene-overlay' as const,
    context: { ...current },
    piecePlanes,
    edgeHighlights,
    correspondenceGuides,
    threadGuides,
    pinGuides: [] as const,
    focus: {
      currentOperationNumber: activeOperation?.operationNumber ?? null,
      currentOperationId,
      selectedPiecePlaneKey: selectedPlaneKey,
      selectedConnectionRef,
    },
    visibility: {
      piecePlanes: piecePlanes.length > 0,
      exactSeamEdges: exactLayerAvailable,
      seamCorrespondence: exactLayerAvailable,
      threadGuides: threadGuides.length > 0,
      pinGuides: false as const,
    },
    capabilities: {
      pinGuides: {
        available: false as const,
        status: 'unavailable' as const,
        blocker: {
          code: 'pin-authority-unavailable' as const,
          reason: PIN_AUTHORITY_UNAVAILABLE_REASON,
        },
      },
    },
    unavailableLayers,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_CLAIMS_V1,
  });
  return Object.freeze({ ok: true as const, overlay, blocker: null });
}
