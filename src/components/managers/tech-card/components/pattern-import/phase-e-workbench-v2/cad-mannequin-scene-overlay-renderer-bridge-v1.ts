import type { MeasurementSurfacePatternPieceOverlayV1 } from 'components/shared/measurement-watertight-surface-v1-stage';

import type { PatternImportDxfPhaseECadMannequinPatternOverlayDecorationV1 } from './cad-mannequin-pattern-piece-overlay-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_V1,
  type PatternImportDxfPhaseECadMannequinSceneEdgeHighlightV1,
  type PatternImportDxfPhaseECadMannequinSceneGuideEndpointV1,
  type PatternImportDxfPhaseECadMannequinSceneOverlayV1,
  type PatternImportDxfPhaseECadMannequinScenePiecePlaneV1,
} from './cad-mannequin-scene-overlay-adapter-v1';
import { CAD_WORKBENCH_SEAM_SIDE_COLORS } from './cad-workbench-seam-colors-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-scene-overlay-renderer-bridge/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_CLAIMS_V1 =
  Object.freeze({
    existingSceneOverlayOnly: true,
    exactOrderedEdgeIdentitiesPreserved: true,
    correspondenceGuidesMapped: true,
    threadGuidesMapped: true,
    stableSemanticSideColoursVerified: true,
    pinCapabilityRemainsUnavailable: true,
    unknownOrDuplicatedIdentityFailsClosed: true,
    staleOverlayFailsClosed: true,
    createsGeometryOwner: false,
    createsAssemblyAuthority: false,
    mutatesRenderer: false,
  } as const);

export type PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_V1;
  decorations: readonly PatternImportDxfPhaseECadMannequinPatternOverlayDecorationV1[];
  guides: NonNullable<MeasurementSurfacePatternPieceOverlayV1['guides']>;
  capabilities: Readonly<{
    pins: Readonly<{ available: false; emitted: false }>;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeBlockerV1 = Readonly<{
  code:
    | 'invalid-overlay'
    | 'stale-overlay'
    | 'duplicate-identity'
    | 'unknown-piece'
    | 'unknown-contour'
    | 'unknown-vertex'
    | 'pin-authority-conflict';
  detail: string;
}>;

export type PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeResultV1 =
  | Readonly<{
      ok: true;
      bridge: PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      bridge: null;
      blocker: PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeBlockerV1;
    }>;

type Guide = NonNullable<MeasurementSurfacePatternPieceOverlayV1['guides']>[number];
type Code = PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeBlockerV1['code'];

const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const THREAD_COLOR = /^#[0-9A-F]{6}$/;

function blocked(
  code: Code,
  detail: string,
): PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeResultV1 {
  return Object.freeze({
    ok: false as const,
    bridge: null,
    blocker: Object.freeze({ code, detail: detail.slice(0, 2_048) }),
  });
}

function stable(value: unknown): value is string {
  return typeof value === 'string' && STABLE_REF.test(value);
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function samePoint(
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameClaims(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const expected = PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_CLAIMS_V1;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(expected);
  return (
    Object.keys(candidate).length === keys.length &&
    keys.every((key) => candidate[key] === expected[key as keyof typeof expected])
  );
}

function planeIssue(
  planes: readonly PatternImportDxfPhaseECadMannequinScenePiecePlaneV1[],
): PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeBlockerV1 | null {
  if (planes.length === 0)
    return { code: 'invalid-overlay', detail: 'The exact scene overlay has no piece planes.' };
  if (!unique(planes.map(({ piecePlaneKey }) => piecePlaneKey)))
    return { code: 'duplicate-identity', detail: 'Piece plane identities are duplicated.' };
  for (const plane of planes) {
    if (
      !stable(plane.piecePlaneKey) ||
      !stable(plane.scopeKey) ||
      !stable(plane.pieceId) ||
      !stable(plane.pieceLineKey) ||
      !Array.isArray(plane.contours) ||
      plane.contours.length === 0
    )
      return { code: 'invalid-overlay', detail: 'A piece plane has no stable exact identity.' };
    const contours: PatternImportDxfPhaseECadMannequinScenePiecePlaneV1['contours'] =
      plane.contours;
    if (!unique(contours.map(({ contourId }) => contourId)))
      return {
        code: 'duplicate-identity',
        detail: `Piece plane ${plane.piecePlaneKey} duplicates a contour identity.`,
      };
    const planeVertexIds = contours.flatMap(({ orderedVertexIds }) => orderedVertexIds);
    if (!unique(planeVertexIds))
      return {
        code: 'duplicate-identity',
        detail: `Piece plane ${plane.piecePlaneKey} duplicates a vertex identity.`,
      };
    for (const contour of contours) {
      if (
        !stable(contour.contourId) ||
        !contour.closed ||
        contour.orderedVertexIds.length < 3 ||
        contour.orderedVertexIds.length !== contour.orderedPointsMm.length ||
        !unique(contour.orderedVertexIds) ||
        contour.orderedVertexIds.some((vertexId) => !stable(vertexId)) ||
        contour.orderedPointsMm.some(
          ({ x, y }) =>
            !Number.isFinite(x) || !Number.isFinite(y) || Object.is(x, -0) || Object.is(y, -0),
        )
      )
        return {
          code: 'invalid-overlay',
          detail: `Contour ${contour.contourId} is not one closed exact identity sequence.`,
        };
    }
  }
  return null;
}

function resolvePlane(
  planes: readonly PatternImportDxfPhaseECadMannequinScenePiecePlaneV1[],
  piecePlaneKey: string,
): PatternImportDxfPhaseECadMannequinScenePiecePlaneV1 | null {
  const matches = planes.filter((plane) => plane.piecePlaneKey === piecePlaneKey);
  return matches.length === 1 ? matches[0] : null;
}

function resolveEndpoint(
  planes: readonly PatternImportDxfPhaseECadMannequinScenePiecePlaneV1[],
  endpoint: PatternImportDxfPhaseECadMannequinSceneGuideEndpointV1,
):
  | Readonly<{
      ok: true;
      value: Guide['from'];
    }>
  | Readonly<{
      ok: false;
      blocker: PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeBlockerV1;
    }> {
  const plane = resolvePlane(planes, endpoint.piecePlaneKey);
  if (!plane || plane.scopeKey !== endpoint.scopeKey || plane.pieceId !== endpoint.pieceId)
    return {
      ok: false,
      blocker: {
        code: 'unknown-piece',
        detail: `Guide endpoint references unknown or stale piece ${endpoint.piecePlaneKey}.`,
      },
    };
  const matches = plane.contours.flatMap((contour) =>
    contour.orderedVertexIds.flatMap((vertexId, index) =>
      vertexId === endpoint.vertexId ? [{ contour, index }] : [],
    ),
  );
  if (matches.length !== 1)
    return {
      ok: false,
      blocker: {
        code: matches.length === 0 ? 'unknown-vertex' : 'duplicate-identity',
        detail: `Guide endpoint vertex ${endpoint.vertexId} is missing or ambiguous.`,
      },
    };
  const match = matches[0];
  if (!samePoint(match.contour.orderedPointsMm[match.index], endpoint.pointMm))
    return {
      ok: false,
      blocker: {
        code: 'stale-overlay',
        detail: `Guide endpoint ${endpoint.vertexId} has stale millimetre coordinates.`,
      },
    };
  return {
    ok: true,
    value: Object.freeze({
      pieceKey: plane.piecePlaneKey,
      contourId: match.contour.contourId,
      vertexId: endpoint.vertexId,
    }),
  };
}

function edgeIssue(
  edge: PatternImportDxfPhaseECadMannequinSceneEdgeHighlightV1,
  overlay: PatternImportDxfPhaseECadMannequinSceneOverlayV1,
): PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeBlockerV1 | null {
  if (
    !stable(edge.primitiveId) ||
    !stable(edge.connectionRef) ||
    edge.primitiveId !== `edge:${edge.connectionRef}:${edge.side}` ||
    edge.semanticColorHex !== CAD_WORKBENCH_SEAM_SIDE_COLORS[edge.side] ||
    edge.operationNumber !== overlay.focus.currentOperationNumber ||
    !Number.isSafeInteger(edge.seamOrdinal) ||
    edge.seamOrdinal < 1 ||
    edge.authoringOperationId !== overlay.focus.currentOperationId
  )
    return { code: 'stale-overlay', detail: `Edge ${edge.primitiveId} is stale or recoloured.` };
  const plane = resolvePlane(overlay.piecePlanes, edge.piecePlaneKey);
  if (
    !plane ||
    plane.scopeKey !== edge.scopeKey ||
    plane.pieceId !== edge.pieceId ||
    plane.pieceLineKey !== edge.pieceLineKey
  )
    return {
      code: 'unknown-piece',
      detail: `Edge ${edge.primitiveId} references an unknown piece.`,
    };
  const contours = plane.contours.filter(({ contourId }) => contourId === edge.contourId);
  if (contours.length !== 1)
    return {
      code: contours.length === 0 ? 'unknown-contour' : 'duplicate-identity',
      detail: `Edge ${edge.primitiveId} contour is missing or ambiguous.`,
    };
  const contour = contours[0];
  if (
    edge.orderedVertexIds.length !== 2 ||
    edge.boundaryVertexIds.length !== 2 ||
    edge.orderedPointsMm.length !== 2 ||
    !unique(edge.orderedVertexIds) ||
    new Set(edge.orderedVertexIds).size !== new Set(edge.boundaryVertexIds).size ||
    edge.orderedVertexIds.some((vertexId) => !edge.boundaryVertexIds.includes(vertexId))
  )
    return { code: 'stale-overlay', detail: `Edge ${edge.primitiveId} ordering is stale.` };
  const expectedOrder =
    edge.direction === 'forward'
      ? edge.boundaryVertexIds
      : ([edge.boundaryVertexIds[1], edge.boundaryVertexIds[0]] as const);
  if (edge.orderedVertexIds.some((vertexId, index) => vertexId !== expectedOrder[index]))
    return { code: 'stale-overlay', detail: `Edge ${edge.primitiveId} direction is stale.` };
  for (let index = 0; index < 2; index += 1) {
    const vertexIndex = contour.orderedVertexIds.indexOf(edge.orderedVertexIds[index]);
    if (vertexIndex < 0)
      return { code: 'unknown-vertex', detail: `Edge ${edge.primitiveId} vertex is unknown.` };
    if (!samePoint(contour.orderedPointsMm[vertexIndex], edge.orderedPointsMm[index]))
      return { code: 'stale-overlay', detail: `Edge ${edge.primitiveId} coordinates are stale.` };
  }
  const indices = edge.orderedVertexIds.map((vertexId) =>
    contour.orderedVertexIds.indexOf(vertexId),
  );
  const distance = Math.abs(indices[0] - indices[1]);
  if (distance !== 1 && distance !== contour.orderedVertexIds.length - 1)
    return { code: 'stale-overlay', detail: `Edge ${edge.primitiveId} vertices are not adjacent.` };
  return null;
}

export function bridgePatternImportDxfPhaseECadMannequinSceneOverlayToRendererV1(
  overlay: PatternImportDxfPhaseECadMannequinSceneOverlayV1,
): PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeResultV1 {
  if (
    !overlay ||
    overlay.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_V1 ||
    overlay.status !== 'read-only-exact-scene-overlay' ||
    !sameClaims(overlay.claims) ||
    !Array.isArray(overlay.piecePlanes) ||
    !Array.isArray(overlay.edgeHighlights) ||
    !Array.isArray(overlay.correspondenceGuides) ||
    !Array.isArray(overlay.threadGuides) ||
    !Array.isArray(overlay.pinGuides)
  )
    return blocked('invalid-overlay', 'A genuine read-only exact scene overlay is required.');
  if (
    !Number.isSafeInteger(overlay.context.techCardId) ||
    overlay.context.techCardId < 1 ||
    !stable(overlay.context.cardRef) ||
    !Number.isSafeInteger(overlay.context.cardLockVersion) ||
    overlay.context.cardLockVersion < 0 ||
    !overlay.context.serverAssemblyRevision.trim() ||
    !Number.isSafeInteger(overlay.context.importGeneration) ||
    overlay.context.importGeneration < 1
  )
    return blocked('invalid-overlay', 'The scene overlay context is incomplete or invalid.');
  const invalidPlane = planeIssue(overlay.piecePlanes);
  if (invalidPlane) return blocked(invalidPlane.code, invalidPlane.detail);
  if (
    overlay.pinGuides.length !== 0 ||
    overlay.visibility.pinGuides !== false ||
    overlay.capabilities.pinGuides.available !== false ||
    overlay.capabilities.pinGuides.status !== 'unavailable'
  )
    return blocked(
      'pin-authority-conflict',
      'The source overlay unexpectedly claims pin authority.',
    );
  if (
    overlay.visibility.piecePlanes !== true ||
    overlay.visibility.exactSeamEdges !== overlay.edgeHighlights.length > 0 ||
    overlay.visibility.seamCorrespondence !== overlay.correspondenceGuides.length > 0 ||
    overlay.visibility.threadGuides !== overlay.threadGuides.length > 0
  )
    return blocked('stale-overlay', 'Scene layer visibility is stale relative to its primitives.');
  if (
    (overlay.focus.selectedPiecePlaneKey !== null &&
      !resolvePlane(overlay.piecePlanes, overlay.focus.selectedPiecePlaneKey)) ||
    (overlay.focus.selectedConnectionRef !== null &&
      !overlay.edgeHighlights.some(
        ({ connectionRef }) => connectionRef === overlay.focus.selectedConnectionRef,
      ))
  )
    return blocked('stale-overlay', 'Scene focus references a stale piece or connection.');
  const primitiveIds = [
    ...overlay.edgeHighlights.map(({ primitiveId }) => primitiveId),
    ...overlay.correspondenceGuides.map(({ primitiveId }) => primitiveId),
    ...overlay.threadGuides.map(({ primitiveId }) => primitiveId),
  ];
  if (!unique(primitiveIds))
    return blocked('duplicate-identity', 'Scene primitive identities are duplicated.');

  const decorations: PatternImportDxfPhaseECadMannequinPatternOverlayDecorationV1[] = [];
  const edgesByConnection = new Map<
    string,
    Map<'A' | 'B', PatternImportDxfPhaseECadMannequinSceneEdgeHighlightV1>
  >();
  for (const edge of overlay.edgeHighlights) {
    const invalidEdge = edgeIssue(edge, overlay);
    if (invalidEdge) return blocked(invalidEdge.code, invalidEdge.detail);
    const sides = edgesByConnection.get(edge.connectionRef) ?? new Map();
    if (sides.has(edge.side))
      return blocked(
        'duplicate-identity',
        `Connection ${edge.connectionRef} duplicates side ${edge.side}.`,
      );
    sides.set(edge.side, edge);
    edgesByConnection.set(edge.connectionRef, sides);
    decorations.push(
      Object.freeze({
        seamId: edge.connectionRef,
        side: edge.side,
        scopeKey: edge.scopeKey,
        pieceId: edge.pieceId,
        contourId: edge.contourId,
        operationSeam: Object.freeze({
          operationNumber: edge.operationNumber,
          ordinal: edge.seamOrdinal,
        }),
        ordinalBadgeVisible: overlay.focus.selectedConnectionRef === edge.connectionRef,
        semanticColorCss: edge.semanticColorHex,
        orderedVertexIds: Object.freeze([...edge.orderedVertexIds]),
        thread: null,
        pins: Object.freeze([]),
      }),
    );
  }
  const seamOrdinals = new Set<number>();
  for (const [connectionRef, sides] of edgesByConnection) {
    const a = sides.get('A');
    const b = sides.get('B');
    if (sides.size !== 2 || !a || !b)
      return blocked('stale-overlay', `Connection ${connectionRef} does not have exact A/B edges.`);
    if (
      a.seamOrdinal !== b.seamOrdinal ||
      a.seamOrdinal > edgesByConnection.size ||
      seamOrdinals.has(a.seamOrdinal)
    )
      return blocked(
        'stale-overlay',
        `Connection ${connectionRef} has an inconsistent operation position.`,
      );
    seamOrdinals.add(a.seamOrdinal);
  }

  const guides: Guide[] = [];
  const correspondenceByKey = new Map<string, (typeof overlay.correspondenceGuides)[number]>();
  for (const guide of overlay.correspondenceGuides) {
    const key = `${guide.connectionRef}:${guide.ordinal}`;
    const sides = edgesByConnection.get(guide.connectionRef);
    const a = sides?.get('A');
    const b = sides?.get('B');
    if (
      !stable(guide.primitiveId) ||
      guide.primitiveId !== `correspondence:${key}` ||
      correspondenceByKey.has(key) ||
      !a ||
      !b ||
      guide.operationNumber !== overlay.focus.currentOperationNumber ||
      guide.directionRelation !== (a.direction === b.direction ? 'same' : 'reversed') ||
      guide.focused !== a.focused ||
      guide.focused !== b.focused
    )
      return blocked(
        'stale-overlay',
        `Correspondence ${guide.primitiveId} is duplicated or stale.`,
      );
    const from = resolveEndpoint(overlay.piecePlanes, guide.from);
    const to = resolveEndpoint(overlay.piecePlanes, guide.to);
    if (!from.ok) return blocked(from.blocker.code, from.blocker.detail);
    if (!to.ok) return blocked(to.blocker.code, to.blocker.detail);
    if (
      from.value.pieceKey !== a.piecePlaneKey ||
      from.value.contourId !== a.contourId ||
      from.value.vertexId !== a.orderedVertexIds[guide.ordinal] ||
      to.value.pieceKey !== b.piecePlaneKey ||
      to.value.contourId !== b.contourId ||
      to.value.vertexId !== b.orderedVertexIds[guide.ordinal]
    )
      return blocked('stale-overlay', `Correspondence ${guide.primitiveId} does not join A to B.`);
    correspondenceByKey.set(key, guide);
    guides.push(
      Object.freeze({
        guideId: guide.primitiveId,
        kind: 'correspondence' as const,
        seamId: guide.connectionRef,
        from: from.value,
        to: to.value,
        thread: null,
      }),
    );
  }
  for (const connectionRef of edgesByConnection.keys()) {
    if (
      !correspondenceByKey.has(`${connectionRef}:0`) ||
      !correspondenceByKey.has(`${connectionRef}:1`)
    )
      return blocked(
        'stale-overlay',
        `Connection ${connectionRef} lacks exact correspondence guides.`,
      );
  }

  const threadKeys = new Set<string>();
  for (const guide of overlay.threadGuides) {
    const key = `${guide.connectionRef}:${guide.ordinal}`;
    const correspondence = correspondenceByKey.get(key);
    if (
      !correspondence ||
      guide.primitiveId !== `thread:${key}` ||
      threadKeys.has(key) ||
      guide.operationNumber !== overlay.focus.currentOperationNumber ||
      !stable(guide.bomLineKey) ||
      !THREAD_COLOR.test(guide.colorHex) ||
      guide.from.piecePlaneKey !== correspondence.from.piecePlaneKey ||
      guide.from.vertexId !== correspondence.from.vertexId ||
      guide.to.piecePlaneKey !== correspondence.to.piecePlaneKey ||
      guide.to.vertexId !== correspondence.to.vertexId ||
      guide.focused !== correspondence.focused
    )
      return blocked('stale-overlay', `Thread guide ${guide.primitiveId} is duplicated or stale.`);
    const from = resolveEndpoint(overlay.piecePlanes, guide.from);
    const to = resolveEndpoint(overlay.piecePlanes, guide.to);
    if (!from.ok) return blocked(from.blocker.code, from.blocker.detail);
    if (!to.ok) return blocked(to.blocker.code, to.blocker.detail);
    threadKeys.add(key);
    guides.push(
      Object.freeze({
        guideId: guide.primitiveId,
        kind: 'thread' as const,
        seamId: guide.connectionRef,
        from: from.value,
        to: to.value,
        thread: Object.freeze({ bomLineKey: guide.bomLineKey, colorCss: guide.colorHex }),
      }),
    );
  }
  if (
    overlay.threadGuides.length > 0 &&
    [...correspondenceByKey.keys()].some((key) => !threadKeys.has(key))
  )
    return blocked(
      'stale-overlay',
      'Thread guide coverage is incomplete for current correspondence.',
    );

  decorations.sort(
    (left, right) =>
      left.seamId.localeCompare(right.seamId) ||
      (left.side === right.side ? 0 : left.side === 'A' ? -1 : 1),
  );
  guides.sort((left, right) => left.guideId.localeCompare(right.guideId));

  return Object.freeze({
    ok: true as const,
    bridge: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_V1,
      decorations: Object.freeze(decorations),
      guides: Object.freeze(guides),
      capabilities: Object.freeze({ pins: Object.freeze({ available: false, emitted: false }) }),
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_SCENE_OVERLAY_RENDERER_BRIDGE_CLAIMS_V1,
    }),
    blocker: null,
  });
}
