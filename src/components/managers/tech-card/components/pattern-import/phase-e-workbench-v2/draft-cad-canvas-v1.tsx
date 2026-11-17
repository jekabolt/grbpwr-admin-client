import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { BoxMm, PtMm } from 'lib/pattern-import/types';

import { SHEET_INK, SheetViewport, ptsAttr, vy } from '../sheet-viewport';
import {
  buildPatternImportDxfPhaseEDraftCadPreviewV1,
  type PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1,
} from './draft-cad-preview-v1';
import { PatternImportDxfPhaseEDraftCadGridRulersV1 } from './draft-cad-grid-rulers-v1';
import {
  recordPatternImportDxfPhaseEDraftCadTransactionV1,
  type PatternImportDxfPhaseEDraftCadCommandV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadToolV1,
} from './draft-cad-session-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_IDENTITY_TRANSFORM_V1,
  movePatternImportDxfPhaseEDraftCadArrangementPiecesV1,
  type PatternImportDxfPhaseEDraftCadArrangementScopeV1,
  type PatternImportDxfPhaseEDraftCadArrangementTransformV1,
} from './draft-cad-arrangement-v1';
import { PatternImportDxfPhaseEDraftCadTopologyOverlayV1 } from './draft-cad-topology-overlay-v1';
import type {
  PatternImportDxfPhaseEDraftCadTopologySessionV1,
  PatternImportDxfPhaseEDraftCadTopologyToolV1,
} from './draft-cad-topology-session-v1';
import type { PatternImportDxfPhaseEVertexAnchorV1 } from './measurement-v1';
import type { PatternImportDxfPhaseECadTableCrossScopeConnectSideV1 } from './cad-table-cross-scope-connect-v1';

const INPUT_TOOLS = new Set<PatternImportDxfPhaseEDraftCadToolV1>([
  'point-only',
  'draft-point',
  'mark',
  'rectangle',
  'circle',
  'pen',
  'cut',
  'dart',
  'guideline',
  'internal-line',
  'pattern-line',
  'french-curve',
  'ellipse',
  'add-point',
  'fish-eye',
  'spread',
  'gather',
  'pleat',
  'notch',
]);

const TWO_POINT_TOOLS = new Set<PatternImportDxfPhaseEDraftCadToolV1>([
  'rectangle',
  'circle',
  'pen',
  'cut',
  'guideline',
  'internal-line',
  'pattern-line',
  'spread',
]);

const THREE_POINT_TOOLS = new Set<PatternImportDxfPhaseEDraftCadToolV1>([
  'french-curve',
  'ellipse',
  'fish-eye',
  'pleat',
]);

const EXACT_EDGE_TOOLS = new Set<PatternImportDxfPhaseEDraftCadToolV1>([
  'dart',
  'add-point',
  'gather',
  'notch',
]);

export type PatternImportDxfPhaseEDraftCadCanvasPropsV1 = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  scopeKey?: string;
  activePieceIndex: number;
  activeTool: PatternImportDxfPhaseEDraftCadToolV1;
  arrangeActive?: boolean;
  panActive?: boolean;
  crossScopeConnectActive?: boolean;
  onActivePieceIndexChange?: (index: number) => void;
  selectedPieceIds?: readonly string[];
  onSelectedPieceIdsChange?: (pieceIds: readonly string[]) => void;
  arrangement?: PatternImportDxfPhaseEDraftCadArrangementScopeV1 | null;
  onArrangementChange?: (arrangement: PatternImportDxfPhaseEDraftCadArrangementScopeV1) => void;
  topologySession: PatternImportDxfPhaseEDraftCadTopologySessionV1;
  activeTopologyTool: PatternImportDxfPhaseEDraftCadTopologyToolV1 | null;
  onSessionChange: (session: PatternImportDxfPhaseEDraftCadSessionV1) => void;
  onTopologyAnchor: (anchor: PatternImportDxfPhaseEVertexAnchorV1) => void;
  onCrossScopeEdge?: (side: PatternImportDxfPhaseECadTableCrossScopeConnectSideV1) => void;
}>;

export type PatternImportDxfPhaseEDraftCadCanvasPointResultV1 = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  pendingPoints: readonly PtMm[];
  pendingDartBase: PatternImportDxfPhaseEDraftCadCanvasDartBaseV1 | null;
  sequence: number;
  recorded: boolean;
  blocker: string | null;
}>;

export type PatternImportDxfPhaseEDraftCadCanvasDartBaseV1 = Readonly<{
  key: string;
  anchor: Readonly<{
    contourId: string;
    boundaryVertexIds: readonly [string, string];
    progress: number;
  }>;
  fromMm: PtMm;
  toMm: PtMm;
  pointMm: PtMm;
}>;

export type PatternImportDxfPhaseEDraftCadExactVertexOptionV1 = Readonly<{
  key: string;
  anchor: PatternImportDxfPhaseEVertexAnchorV1;
  pointMm: Readonly<{ x: number; y: number }>;
}>;

type BoundaryPickInput = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  activePieceIndex: number;
  activeTool: PatternImportDxfPhaseEDraftCadToolV1;
  baseKey: string;
  sequence: number;
}>;

type PointInput = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  activePieceIndex: number;
  activeTool: PatternImportDxfPhaseEDraftCadToolV1;
  pointMm: PtMm;
  pendingPoints: readonly PtMm[];
  pendingDartBase?: PatternImportDxfPhaseEDraftCadCanvasDartBaseV1 | null;
  sequence: number;
}>;

type ProjectedPiece = PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number];

export type PatternImportDxfPhaseEDraftCadLocalPieceOffsetV1 = Readonly<{
  x: number;
  y: number;
}>;

function arrangementTransform(
  value:
    | PatternImportDxfPhaseEDraftCadArrangementTransformV1
    | PatternImportDxfPhaseEDraftCadLocalPieceOffsetV1
    | undefined,
): PatternImportDxfPhaseEDraftCadArrangementTransformV1 {
  return value && 'quarterTurns' in value && 'flipX' in value
    ? value
    : Object.freeze({
        ...PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_IDENTITY_TRANSFORM_V1,
        x: value?.x ?? 0,
        y: value?.y ?? 0,
      });
}

export function resolvePatternImportDxfPhaseEDraftCadLocalPieceOffsetV1(
  origin: PatternImportDxfPhaseEDraftCadLocalPieceOffsetV1,
  startSvg: Readonly<{ x: number; y: number }>,
  currentSvg: Readonly<{ x: number; y: number }>,
): PatternImportDxfPhaseEDraftCadLocalPieceOffsetV1 {
  return Object.freeze({
    x: origin.x + currentSvg.x - startSvg.x,
    y: origin.y - (currentSvg.y - startSvg.y),
  });
}

function projectionMatchesSession(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): boolean {
  return (
    projection.expectedCatalogCanonicalSha256 === session.source.catalog.canonicalSha256 &&
    projection.sizeSelectionCanonicalSha256 ===
      session.source.catalog.sizeSelectionCanonicalSha256 &&
    projection.sourceFileId === session.source.phaseD.sourceFileId &&
    projection.geometryPlacementApplied === false
  );
}

function activeProjectedPiece(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  activePieceIndex: number,
): ProjectedPiece | null {
  const sourcePiece = session.source.catalog.pieces[activePieceIndex];
  if (!sourcePiece || !projectionMatchesSession(session, projection)) return null;
  return (
    projection.pieces.find(
      (piece) =>
        piece.pieceId === sourcePiece.pieceId && piece.pieceLineKey === sourcePiece.pieceLineKey,
    ) ?? null
  );
}

/** Exact clickable boundary edges for Dart base selection; no coordinate proximity is consulted. */
export function buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  activePieceIndex: number,
): readonly PatternImportDxfPhaseEDraftCadCanvasDartBaseV1[] {
  const sourcePiece = session.source.catalog.pieces[activePieceIndex];
  const projectedPiece = activeProjectedPiece(session, projection, activePieceIndex);
  if (!sourcePiece || !projectedPiece) return Object.freeze([]);
  const bases: PatternImportDxfPhaseEDraftCadCanvasDartBaseV1[] = [];
  for (const sourceContour of sourcePiece.contours) {
    const projectedContour = projectedPiece.contours.find(
      ({ contourId }) => contourId === sourceContour.contourId,
    );
    if (!projectedContour) continue;
    const vertices = sourceContour.boundaryVertices;
    const segmentCount = sourceContour.closed ? vertices.length : Math.max(vertices.length - 1, 0);
    for (let index = 0; index < segmentCount; index += 1) {
      const fromVertex = vertices[index];
      const toVertex = vertices[(index + 1) % vertices.length];
      if (!fromVertex || !toVertex || fromVertex.vertexId === toVertex.vertexId) continue;
      const from = projectedContour.vertices.find(
        ({ vertexId }) => vertexId === fromVertex.vertexId,
      );
      const to = projectedContour.vertices.find(({ vertexId }) => vertexId === toVertex.vertexId);
      if (
        !from ||
        !to ||
        !Number.isFinite(from.pointMm.x) ||
        !Number.isFinite(from.pointMm.y) ||
        !Number.isFinite(to.pointMm.x) ||
        !Number.isFinite(to.pointMm.y)
      )
        continue;
      const fromMm = Object.freeze({ ...from.pointMm });
      const toMm = Object.freeze({ ...to.pointMm });
      bases.push(
        Object.freeze({
          key: `draft-dart-edge:${encodeURIComponent(sourceContour.contourId)}:${index}`,
          anchor: Object.freeze({
            contourId: sourceContour.contourId,
            boundaryVertexIds: Object.freeze([fromVertex.vertexId, toVertex.vertexId]) as readonly [
              string,
              string,
            ],
            progress: 0.5,
          }),
          fromMm,
          toMm,
          pointMm: Object.freeze({
            x: (fromMm.x + toMm.x) / 2,
            y: (fromMm.y + toMm.y) / 2,
          }),
        }),
      );
    }
  }
  return Object.freeze(bases);
}

/** Exact sealed-projection vertices only. No sheet point or proximity search enters this list. */
export function buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  activePieceIndex: number,
): readonly PatternImportDxfPhaseEDraftCadExactVertexOptionV1[] {
  const piece = activeProjectedPiece(session, projection, activePieceIndex);
  if (!piece) return Object.freeze([]);
  return Object.freeze(
    piece.contours.flatMap((contour) =>
      contour.vertices.map((vertex) =>
        Object.freeze({
          key: `draft-topology-vertex:${encodeURIComponent(contour.contourId)}:${encodeURIComponent(vertex.vertexId)}`,
          anchor: Object.freeze({
            pieceId: piece.pieceId,
            pieceLineKey: piece.pieceLineKey,
            contourId: contour.contourId,
            vertexId: vertex.vertexId,
          }),
          pointMm: Object.freeze({ ...vertex.pointMm }),
        }),
      ),
    ),
  );
}

function usedIds(session: PatternImportDxfPhaseEDraftCadSessionV1): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const transaction of session.history) {
    ids.add(transaction.transactionId);
    for (const command of transaction.commands) {
      ids.add(command.commandId);
      ids.add(command.payload.entityId);
    }
  }
  return ids;
}

function nextIds(session: PatternImportDxfPhaseEDraftCadSessionV1, sequence: number) {
  const ids = usedIds(session);
  let next = sequence + 1;
  while (
    ids.has(`draft-canvas/transaction/${next}`) ||
    ids.has(`draft-canvas/command/${next}`) ||
    ids.has(`draft-canvas/entity/${next}`)
  )
    next += 1;
  return {
    sequence: next,
    transactionId: `draft-canvas/transaction/${next}`,
    commandId: `draft-canvas/command/${next}`,
    entityId: `draft-canvas/entity/${next}`,
  } as const;
}

function activeCutLineEntityId(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
  target: Readonly<{ pieceId: string; pieceLineKey: string }>,
): string | null {
  const commands = session.history
    .slice(0, session.cursor)
    .flatMap((transaction) => transaction.commands);
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index];
    if (
      command.tool === 'cut' &&
      command.target.pieceId === target.pieceId &&
      command.target.pieceLineKey === target.pieceLineKey
    )
      return command.payload.entityId;
  }
  return null;
}

/**
 * Pure exact-edge reducer for tools whose authority is an explicit catalog segment. The edge key
 * comes only from the rendered sealed projection; sheet coordinates never select a nearest edge.
 */
export function recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1(
  input: BoundaryPickInput,
): PatternImportDxfPhaseEDraftCadCanvasPointResultV1 {
  if (!EXACT_EDGE_TOOLS.has(input.activeTool) || input.activeTool === 'dart')
    return {
      session: input.session,
      pendingPoints: [],
      pendingDartBase: null,
      sequence: input.sequence,
      recorded: false,
      blocker: 'The active tool does not record an exact-edge command from one boundary pick.',
    };
  const sourcePiece = input.session.source.catalog.pieces[input.activePieceIndex];
  const bases = buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(
    input.session,
    input.projection,
    input.activePieceIndex,
  );
  const base = bases.find(({ key }) => key === input.baseKey);
  if (!sourcePiece || !base)
    return {
      session: input.session,
      pendingPoints: [],
      pendingDartBase: null,
      sequence: input.sequence,
      recorded: false,
      blocker: 'Choose one exact highlighted boundary edge from the current sealed projection.',
    };

  const ids = nextIds(input.session, input.sequence);
  const target = { pieceId: sourcePiece.pieceId, pieceLineKey: sourcePiece.pieceLineKey } as const;
  const edgeLengthMm = Math.hypot(base.toMm.x - base.fromMm.x, base.toMm.y - base.fromMm.y);
  if (!(edgeLengthMm > 0))
    return {
      session: input.session,
      pendingPoints: [],
      pendingDartBase: null,
      sequence: input.sequence,
      recorded: false,
      blocker: 'The selected exact boundary edge has zero length.',
    };

  let command: PatternImportDxfPhaseEDraftCadCommandV1;
  let label: string;
  if (input.activeTool === 'add-point') {
    label = 'Add exact boundary point intent';
    command = {
      commandId: ids.commandId,
      tool: 'add-point',
      target,
      payload: {
        entityId: ids.entityId,
        contourId: base.anchor.contourId,
        afterVertexId: base.anchor.boundaryVertexIds[0],
        pointMm: base.pointMm,
        edge: base.anchor,
      },
    };
  } else if (input.activeTool === 'gather') {
    label = 'Add gather intent';
    command = {
      commandId: ids.commandId,
      tool: 'gather',
      target,
      payload: { entityId: ids.entityId, span: base.anchor, ratio: 1.5 },
    };
  } else {
    label = 'Add notch intent';
    command = {
      commandId: ids.commandId,
      tool: 'notch',
      target,
      payload: {
        entityId: ids.entityId,
        anchor: base.anchor,
        kind: 'single',
        depthMm: Math.min(3, edgeLengthMm / 4),
      },
    };
  }
  const result = recordPatternImportDxfPhaseEDraftCadTransactionV1(input.session, {
    transactionId: ids.transactionId,
    label,
    commands: [command],
  });
  if (!result.ok)
    return {
      session: input.session,
      pendingPoints: [],
      pendingDartBase: null,
      sequence: input.sequence,
      recorded: false,
      blocker: result.blocker.detail,
    };
  return {
    session: result.session,
    pendingPoints: [],
    pendingDartBase: null,
    sequence: ids.sequence,
    recorded: true,
    blocker: null,
  };
}

function failPointInput(
  input: PointInput,
  blocker: string,
  pendingPoints = input.pendingPoints,
): PatternImportDxfPhaseEDraftCadCanvasPointResultV1 {
  return {
    session: input.session,
    pendingPoints,
    pendingDartBase: input.pendingDartBase ?? null,
    sequence: input.sequence,
    recorded: false,
    blocker,
  };
}

function commandForPoint(
  input: PointInput,
  ids: ReturnType<typeof nextIds>,
  target: Readonly<{ pieceId: string; pieceLineKey: string }>,
): { command: PatternImportDxfPhaseEDraftCadCommandV1; label: string } | null {
  const common = { commandId: ids.commandId, target } as const;
  switch (input.activeTool) {
    case 'point-only':
      return {
        label: 'Add point',
        command: {
          ...common,
          tool: 'point-only',
          payload: { entityId: ids.entityId, pointMm: input.pointMm },
        },
      };
    case 'draft-point':
      return {
        label: 'Add draft point',
        command: {
          ...common,
          tool: 'draft-point',
          payload: { entityId: ids.entityId, pointMm: input.pointMm },
        },
      };
    case 'mark':
      return {
        label: 'Add drill mark',
        command: {
          ...common,
          tool: 'mark',
          payload: { entityId: ids.entityId, pointMm: input.pointMm, kind: 'drill' },
        },
      };
    case 'rectangle': {
      const from = input.pendingPoints[0];
      if (!from) return null;
      const pieceId = `DRAFTRECT${ids.sequence}`;
      const pieceLineKey = `draft-rectangle:${ids.sequence}`;
      return {
        label: 'Create rectangle piece',
        command: {
          ...common,
          tool: 'rectangle',
          payload: {
            entityId: ids.entityId,
            originMm: {
              x: Math.min(from.x, input.pointMm.x),
              y: Math.min(from.y, input.pointMm.y),
            },
            widthMm: Math.abs(input.pointMm.x - from.x),
            heightMm: Math.abs(input.pointMm.y - from.y),
            rotationDeg: 0,
            newPiece: {
              pieceId,
              pieceLineKey,
              contourId: `${pieceLineKey}:cut`,
              vertexIds: [
                `${pieceLineKey}:v0`,
                `${pieceLineKey}:v1`,
                `${pieceLineKey}:v2`,
                `${pieceLineKey}:v3`,
              ],
              displayName: `Rectangle ${ids.sequence}`,
              gradingPolicy: 'ungraded-current-size',
              placementPolicy: 'separate-writer-block',
            },
          },
        },
      };
    }
    case 'circle': {
      const centerMm = input.pendingPoints[0];
      if (!centerMm) return null;
      const pieceId = `DRAFTCIRCLE${ids.sequence}`;
      const pieceLineKey = `draft-circle:${ids.sequence}`;
      return {
        label: 'Create circle piece',
        command: {
          ...common,
          tool: 'circle',
          payload: {
            entityId: ids.entityId,
            centerMm,
            radiusMm: Math.hypot(input.pointMm.x - centerMm.x, input.pointMm.y - centerMm.y),
            newPiece: {
              pieceId,
              pieceLineKey,
              contourId: `${pieceLineKey}:cut`,
              vertexIdPrefix: `${pieceLineKey}:v`,
              displayName: `Circle ${ids.sequence}`,
              maxChordErrorMm: 0.25,
              gradingPolicy: 'ungraded-current-size',
              placementPolicy: 'separate-writer-block',
            },
          },
        },
      };
    }
    case 'pen': {
      const from = input.pendingPoints[0];
      if (!from) return null;
      return {
        label: 'Draw pen path',
        command: {
          ...common,
          tool: 'pen',
          payload: { entityId: ids.entityId, pointsMm: [from, input.pointMm], closed: false },
        },
      };
    }
    case 'cut': {
      const from = input.pendingPoints[0];
      if (!from) return null;
      return {
        label: 'Add cut split intent',
        command: {
          ...common,
          tool: 'cut',
          payload: { entityId: ids.entityId, pointsMm: [from, input.pointMm], keepSide: 'both' },
        },
      };
    }
    case 'guideline': {
      const fromMm = input.pendingPoints[0];
      if (!fromMm) return null;
      return {
        label: 'Add guideline',
        command: {
          ...common,
          tool: 'guideline',
          payload: { entityId: ids.entityId, fromMm, toMm: input.pointMm },
        },
      };
    }
    case 'internal-line': {
      const from = input.pendingPoints[0];
      if (!from) return null;
      return {
        label: 'Add internal line',
        command: {
          ...common,
          tool: 'internal-line',
          payload: { entityId: ids.entityId, pointsMm: [from, input.pointMm] },
        },
      };
    }
    case 'pattern-line': {
      const from = input.pendingPoints[0];
      if (!from) return null;
      return {
        label: 'Add pattern line',
        command: {
          ...common,
          tool: 'pattern-line',
          payload: { entityId: ids.entityId, pointsMm: [from, input.pointMm], closed: false },
        },
      };
    }
    case 'french-curve': {
      const from = input.pendingPoints[0];
      const control = input.pendingPoints[1];
      if (!from || !control) return null;
      return {
        label: 'Add French curve',
        command: {
          ...common,
          tool: 'french-curve',
          payload: {
            entityId: ids.entityId,
            controlPointsMm: [from, control, input.pointMm],
          },
        },
      };
    }
    case 'ellipse': {
      const centerMm = input.pendingPoints[0];
      const majorPoint = input.pendingPoints[1];
      if (!centerMm || !majorPoint) return null;
      const dx = majorPoint.x - centerMm.x;
      const dy = majorPoint.y - centerMm.y;
      const radiusXmm = Math.hypot(dx, dy);
      if (!radiusXmm) return null;
      const rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const radiusYmm = Math.abs(
        ((input.pointMm.x - centerMm.x) * -dy + (input.pointMm.y - centerMm.y) * dx) / radiusXmm,
      );
      const pieceId = `DRAFTELLIPSE${ids.sequence}`;
      const pieceLineKey = `draft-ellipse:${ids.sequence}`;
      return {
        label: 'Create ellipse piece',
        command: {
          ...common,
          tool: 'ellipse',
          payload: {
            entityId: ids.entityId,
            centerMm,
            radiusXmm,
            radiusYmm,
            rotationDeg,
            newPiece: {
              pieceId,
              pieceLineKey,
              contourId: `${pieceLineKey}:cut`,
              vertexIdPrefix: `${pieceLineKey}:v`,
              displayName: `Ellipse ${ids.sequence}`,
              maxChordErrorMm: 0.25,
              gradingPolicy: 'ungraded-current-size',
              placementPolicy: 'separate-writer-block',
            },
          },
        },
      };
    }
    case 'fish-eye': {
      const centerMm = input.pendingPoints[0];
      const axisPoint = input.pendingPoints[1];
      if (!centerMm || !axisPoint) return null;
      const dx = axisPoint.x - centerMm.x;
      const dy = axisPoint.y - centerMm.y;
      const axisMm = Math.hypot(dx, dy);
      if (!axisMm) return null;
      const intakeMm =
        2 *
        Math.abs(
          ((input.pointMm.x - centerMm.x) * -dy + (input.pointMm.y - centerMm.y) * dx) / axisMm,
        );
      return {
        label: 'Add fish-eye dart intent',
        command: {
          ...common,
          tool: 'fish-eye',
          payload: {
            entityId: ids.entityId,
            centerMm,
            axisMm,
            intakeMm,
            rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
          },
        },
      };
    }
    case 'spread': {
      const pivotMm = input.pendingPoints[0];
      if (!pivotMm) return null;
      const cutLineEntityId = activeCutLineEntityId(input.session, target);
      if (!cutLineEntityId) return null;
      return {
        label: 'Add spread intent',
        command: {
          ...common,
          tool: 'spread',
          payload: {
            entityId: ids.entityId,
            pivotMm,
            cutLineEntityId,
            amountMm: Math.hypot(input.pointMm.x - pivotMm.x, input.pointMm.y - pivotMm.y),
          },
        },
      };
    }
    case 'pleat': {
      const foldFromMm = input.pendingPoints[0];
      const foldToMm = input.pendingPoints[1];
      if (!foldFromMm || !foldToMm) return null;
      const dx = foldToMm.x - foldFromMm.x;
      const dy = foldToMm.y - foldFromMm.y;
      const lengthMm = Math.hypot(dx, dy);
      if (!lengthMm) return null;
      const signed =
        ((input.pointMm.x - foldFromMm.x) * -dy + (input.pointMm.y - foldFromMm.y) * dx) / lengthMm;
      return {
        label: 'Add pleat intent',
        command: {
          ...common,
          tool: 'pleat',
          payload: {
            entityId: ids.entityId,
            foldFromMm,
            foldToMm,
            intakeMm: Math.abs(signed),
            direction: signed < 0 ? 'right' : 'left',
          },
        },
      };
    }
    case 'dart': {
      const base = input.pendingDartBase;
      const apexMm = input.pendingPoints[0];
      if (!base || !apexMm) return null;
      const dx = base.toMm.x - base.fromMm.x;
      const dy = base.toMm.y - base.fromMm.y;
      const edgeLengthMm = Math.hypot(dx, dy);
      if (!edgeLengthMm) return null;
      const intakeMm =
        2 *
        Math.abs(
          (input.pointMm.x - base.pointMm.x) * (dx / edgeLengthMm) +
            (input.pointMm.y - base.pointMm.y) * (dy / edgeLengthMm),
        );
      return {
        label: 'Add dart intent',
        command: {
          ...common,
          tool: 'dart',
          payload: { entityId: ids.entityId, base: base.anchor, apexMm, intakeMm },
        },
      };
    }
    default:
      return null;
  }
}

/** Pure click reducer used by the canvas; it changes only the immutable local Draft CAD session. */
export function recordPatternImportDxfPhaseEDraftCadCanvasPointV1(
  input: PointInput,
): PatternImportDxfPhaseEDraftCadCanvasPointResultV1 {
  if (!Number.isFinite(input.pointMm.x) || !Number.isFinite(input.pointMm.y))
    return failPointInput(input, 'Draft input requires a finite point in millimetres.');
  if (!INPUT_TOOLS.has(input.activeTool))
    return failPointInput(
      input,
      `${input.activeTool} input is unavailable until a verified pattern geometry kernel is integrated.`,
    );
  const sourcePiece = input.session.source.catalog.pieces[input.activePieceIndex];
  const projectedPiece = activeProjectedPiece(
    input.session,
    input.projection,
    input.activePieceIndex,
  );
  if (!sourcePiece || !projectedPiece)
    return {
      ...failPointInput(
        input,
        'The active exact piece is not available in the projection sealed to this Draft session.',
        [],
      ),
      pendingDartBase: null,
    };
  if (EXACT_EDGE_TOOLS.has(input.activeTool) && input.activeTool !== 'dart')
    return failPointInput(
      input,
      'Select one highlighted exact boundary edge; free sheet coordinates are not accepted for this tool.',
      [],
    );
  if (
    input.activeTool === 'spread' &&
    !activeCutLineEntityId(input.session, {
      pieceId: sourcePiece.pieceId,
      pieceLineKey: sourcePiece.pieceLineKey,
    })
  )
    return failPointInput(
      input,
      'Spread requires one active session Cut intent on the current piece.',
      [],
    );
  if (input.activeTool === 'dart' && !input.pendingDartBase)
    return failPointInput(
      input,
      'Select one highlighted exact boundary edge before placing the dart apex.',
      [],
    );
  if (input.activeTool === 'dart' && input.pendingPoints.length === 0)
    return {
      session: input.session,
      pendingPoints: [input.pointMm],
      pendingDartBase: input.pendingDartBase ?? null,
      sequence: input.sequence,
      recorded: false,
      blocker: null,
    };
  if (TWO_POINT_TOOLS.has(input.activeTool) && input.pendingPoints.length === 0)
    return {
      session: input.session,
      pendingPoints: [input.pointMm],
      pendingDartBase: null,
      sequence: input.sequence,
      recorded: false,
      blocker: null,
    };
  if (THREE_POINT_TOOLS.has(input.activeTool) && input.pendingPoints.length < 2)
    return {
      session: input.session,
      pendingPoints: [...input.pendingPoints, input.pointMm],
      pendingDartBase: null,
      sequence: input.sequence,
      recorded: false,
      blocker: null,
    };

  const ids = nextIds(input.session, input.sequence);
  const nextCommand = commandForPoint(input, ids, {
    pieceId: sourcePiece.pieceId,
    pieceLineKey: sourcePiece.pieceLineKey,
  });
  if (!nextCommand)
    return failPointInput(input, 'The active Draft input does not have enough points.');
  if (
    nextCommand.command.tool === 'rectangle' &&
    (!nextCommand.command.payload.widthMm || !nextCommand.command.payload.heightMm)
  )
    return failPointInput(input, 'Rectangle width and height must both be greater than zero.');
  if (nextCommand.command.tool === 'circle' && !nextCommand.command.payload.radiusMm)
    return failPointInput(input, 'Circle radius must be greater than zero.');
  if (
    (nextCommand.command.tool === 'pen' ||
      nextCommand.command.tool === 'cut' ||
      nextCommand.command.tool === 'guideline' ||
      nextCommand.command.tool === 'internal-line' ||
      nextCommand.command.tool === 'pattern-line') &&
    Math.hypot(
      nextCommand.command.tool === 'guideline'
        ? nextCommand.command.payload.toMm.x - nextCommand.command.payload.fromMm.x
        : nextCommand.command.payload.pointsMm[1].x - nextCommand.command.payload.pointsMm[0].x,
      nextCommand.command.tool === 'guideline'
        ? nextCommand.command.payload.toMm.y - nextCommand.command.payload.fromMm.y
        : nextCommand.command.payload.pointsMm[1].y - nextCommand.command.payload.pointsMm[0].y,
    ) === 0
  )
    return failPointInput(input, 'Path length must be greater than zero.');
  if (nextCommand.command.tool === 'french-curve') {
    const [from, control, to] = nextCommand.command.payload.controlPointsMm;
    const totalLength =
      Math.hypot(control.x - from.x, control.y - from.y) +
      Math.hypot(to.x - control.x, to.y - control.y);
    if (!totalLength)
      return failPointInput(input, 'French curve control points must span a nonzero path.');
  }
  if (
    nextCommand.command.tool === 'ellipse' &&
    (!nextCommand.command.payload.radiusXmm || !nextCommand.command.payload.radiusYmm)
  )
    return failPointInput(input, 'Ellipse major and minor radii must both be greater than zero.');
  if (
    nextCommand.command.tool === 'fish-eye' &&
    (!nextCommand.command.payload.axisMm || !nextCommand.command.payload.intakeMm)
  )
    return failPointInput(input, 'Fish-eye axis and intake must both be greater than zero.');
  if (nextCommand.command.tool === 'spread' && !nextCommand.command.payload.amountMm)
    return failPointInput(input, 'Spread amount must be greater than zero.');
  if (nextCommand.command.tool === 'pleat' && !nextCommand.command.payload.intakeMm)
    return failPointInput(input, 'Pleat fold length and intake must both be greater than zero.');
  if (nextCommand.command.tool === 'dart') {
    const base = input.pendingDartBase;
    const edgeLengthMm = base
      ? Math.hypot(base.toMm.x - base.fromMm.x, base.toMm.y - base.fromMm.y)
      : 0;
    if (
      !nextCommand.command.payload.intakeMm ||
      nextCommand.command.payload.intakeMm > edgeLengthMm
    )
      return failPointInput(
        input,
        'Dart intake must be greater than zero and fit the selected exact edge.',
      );
  }

  const result = recordPatternImportDxfPhaseEDraftCadTransactionV1(input.session, {
    transactionId: ids.transactionId,
    label: nextCommand.label,
    commands: [nextCommand.command],
  });
  if (!result.ok) return failPointInput(input, result.blocker.detail);
  return {
    session: result.session,
    pendingPoints: [],
    pendingDartBase: null,
    sequence: ids.sequence,
    recorded: true,
    blocker: null,
  };
}

function rectangleCorners(
  originMm: PtMm,
  widthMm: number,
  heightMm: number,
  rotationDeg: number,
): readonly PtMm[] {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [0, 0],
    [widthMm, 0],
    [widthMm, heightMm],
    [0, heightMm],
  ].map(([x, y]) => ({
    x: originMm.x + x * cos - y * sin,
    y: originMm.y + x * sin + y * cos,
  }));
}

function primitiveBoundsPoints(
  primitive: PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1,
): readonly PtMm[] {
  switch (primitive.kind) {
    case 'path':
      return primitive.pointsMm;
    case 'curve':
      return primitive.controlPointsMm;
    case 'rectangle':
      return rectangleCorners(
        primitive.originMm,
        primitive.widthMm,
        primitive.heightMm,
        primitive.rotationDeg,
      );
    case 'circle':
      return [
        {
          x: primitive.centerMm.x - primitive.radiusMm,
          y: primitive.centerMm.y - primitive.radiusMm,
        },
        {
          x: primitive.centerMm.x + primitive.radiusMm,
          y: primitive.centerMm.y + primitive.radiusMm,
        },
      ];
    case 'ellipse': {
      const radians = (primitive.rotationDeg * Math.PI) / 180;
      const x = Math.hypot(
        primitive.radiusXmm * Math.cos(radians),
        primitive.radiusYmm * Math.sin(radians),
      );
      const y = Math.hypot(
        primitive.radiusXmm * Math.sin(radians),
        primitive.radiusYmm * Math.cos(radians),
      );
      return [
        { x: primitive.centerMm.x - x, y: primitive.centerMm.y - y },
        { x: primitive.centerMm.x + x, y: primitive.centerMm.y + y },
      ];
    }
    case 'point':
    case 'notch':
      return [primitive.pointMm];
    case 'dart':
      return [primitive.baseLeftMm, primitive.baseRightMm, primitive.apexMm];
  }
}

function viewportBounds(
  piece: ProjectedPiece | null,
  primitives: readonly PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1[],
  pendingPoints: readonly PtMm[],
): BoxMm {
  let minX = piece?.cameraMm.minX ?? Number.POSITIVE_INFINITY;
  let minY = piece?.cameraMm.minY ?? Number.POSITIVE_INFINITY;
  let maxX = piece?.cameraMm.maxX ?? Number.NEGATIVE_INFINITY;
  let maxY = piece?.cameraMm.maxY ?? Number.NEGATIVE_INFINITY;
  for (const point of [...primitives.flatMap(primitiveBoundsPoints), ...pendingPoints]) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite))
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

function arrangementViewportBounds(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  transforms: Readonly<Record<string, PatternImportDxfPhaseEDraftCadArrangementTransformV1>>,
): BoxMm {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const piece of projection.pieces) {
    const bounds = arrangedPieceBounds(
      piece,
      transforms[piece.pieceId] ?? PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_IDENTITY_TRANSFORM_V1,
    );
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite))
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

function arrangedPieceBounds(
  piece: ProjectedPiece,
  transform: PatternImportDxfPhaseEDraftCadArrangementTransformV1,
): BoxMm {
  const centerX = (piece.cameraMm.minX + piece.cameraMm.maxX) / 2;
  const centerY = (piece.cameraMm.minY + piece.cameraMm.maxY) / 2;
  const radians = (transform.quarterTurns * Math.PI) / 2;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [piece.cameraMm.minX, piece.cameraMm.minY],
    [piece.cameraMm.maxX, piece.cameraMm.minY],
    [piece.cameraMm.maxX, piece.cameraMm.maxY],
    [piece.cameraMm.minX, piece.cameraMm.maxY],
  ].map(([x, y]) => {
    const localX = transform.flipX ? -(x! - centerX) : x! - centerX;
    const localY = y! - centerY;
    return {
      x: centerX + localX * cosine - localY * sine + transform.x,
      y: centerY + localX * sine + localY * cosine + transform.y,
    };
  });
  return {
    minX: Math.min(...corners.map(({ x }) => x)),
    minY: Math.min(...corners.map(({ y }) => y)),
    maxX: Math.max(...corners.map(({ x }) => x)),
    maxY: Math.max(...corners.map(({ y }) => y)),
  };
}

export function patternImportDxfPhaseEDraftCadArrangementSvgTransformV1(
  piece: ProjectedPiece,
  transform: PatternImportDxfPhaseEDraftCadArrangementTransformV1,
): string {
  const centerX = (piece.cameraMm.minX + piece.cameraMm.maxX) / 2;
  const centerY = vy((piece.cameraMm.minY + piece.cameraMm.maxY) / 2);
  const rotation = transform.quarterTurns * -90;
  return [
    `translate(${transform.x} ${vy(transform.y)})`,
    `rotate(${rotation} ${centerX} ${centerY})`,
    transform.flipX ? `translate(${centerX * 2} 0) scale(-1 1)` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function pointerSvgPoint(
  event: ReactPointerEvent<SVGGElement>,
): Readonly<{ x: number; y: number }> | null {
  const svg = event.currentTarget.ownerSVGElement;
  const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(matrix.inverse());
  return Object.freeze({ x: transformed.x, y: transformed.y });
}

export function selectPatternImportDxfPhaseEDraftCadPiecesInLassoV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  transforms: Readonly<
    Record<
      string,
      | PatternImportDxfPhaseEDraftCadArrangementTransformV1
      | PatternImportDxfPhaseEDraftCadLocalPieceOffsetV1
    >
  >,
  pointsMm: readonly PtMm[],
): readonly string[] {
  if (pointsMm.length < 3) return Object.freeze([]);
  const minX = Math.min(...pointsMm.map(({ x }) => x));
  const minY = Math.min(...pointsMm.map(({ y }) => y));
  const maxX = Math.max(...pointsMm.map(({ x }) => x));
  const maxY = Math.max(...pointsMm.map(({ y }) => y));
  return Object.freeze(
    projection.pieces
      .filter((piece) => {
        const bounds = arrangedPieceBounds(piece, arrangementTransform(transforms[piece.pieceId]));
        return !(
          bounds.maxX < minX ||
          bounds.minX > maxX ||
          bounds.maxY < minY ||
          bounds.minY > maxY
        );
      })
      .map(({ pieceId }) => pieceId),
  );
}

function togglePieceIds(current: readonly string[], next: readonly string[]): readonly string[] {
  const toggled = new Set(current);
  for (const pieceId of next) {
    if (toggled.has(pieceId)) toggled.delete(pieceId);
    else toggled.add(pieceId);
  }
  return Object.freeze([...toggled]);
}

function PreviewPrimitive({
  primitive,
  unit,
}: {
  primitive: PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1;
  unit: number;
}) {
  const common = {
    'data-draft-cad-preview-primitive': primitive.kind,
    'data-command-id': primitive.commandId,
    fill: 'none',
    stroke: SHEET_INK.blue,
    strokeWidth: 1.35,
    vectorEffect: 'non-scaling-stroke' as const,
    pointerEvents: 'none' as const,
  };
  switch (primitive.kind) {
    case 'path': {
      const points =
        primitive.closed && primitive.pointsMm.length > 0
          ? [...primitive.pointsMm, primitive.pointsMm[0]]
          : primitive.pointsMm;
      return (
        <polyline
          {...common}
          points={ptsAttr(points)}
          stroke={primitive.role === 'cut-intent' ? SHEET_INK.red : SHEET_INK.blue}
          strokeDasharray={primitive.stroke === 'dashed' ? `${unit * 7} ${unit * 4}` : undefined}
        />
      );
    }
    case 'curve': {
      const [from, control, to] = primitive.controlPointsMm;
      return from && control && to && primitive.controlPointsMm.length === 3 ? (
        <path
          {...common}
          d={`M ${from.x} ${vy(from.y)} Q ${control.x} ${vy(control.y)} ${to.x} ${vy(to.y)}`}
          data-curve-role={primitive.role}
        />
      ) : (
        <polyline {...common} points={ptsAttr(primitive.controlPointsMm)} />
      );
    }
    case 'rectangle': {
      const points = rectangleCorners(
        primitive.originMm,
        primitive.widthMm,
        primitive.heightMm,
        primitive.rotationDeg,
      );
      return <polygon {...common} points={ptsAttr(points)} />;
    }
    case 'circle':
      return (
        <circle
          {...common}
          cx={primitive.centerMm.x}
          cy={vy(primitive.centerMm.y)}
          r={primitive.radiusMm}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          {...common}
          cx={primitive.centerMm.x}
          cy={vy(primitive.centerMm.y)}
          rx={primitive.radiusXmm}
          ry={primitive.radiusYmm}
          transform={`rotate(${-primitive.rotationDeg} ${primitive.centerMm.x} ${vy(primitive.centerMm.y)})`}
        />
      );
    case 'point': {
      const r = unit * 3.5;
      return (
        <g {...common} data-point-indicator={primitive.indicator}>
          <circle cx={primitive.pointMm.x} cy={vy(primitive.pointMm.y)} r={r} />
          <path
            d={`M ${primitive.pointMm.x - r * 1.6} ${vy(primitive.pointMm.y)} H ${
              primitive.pointMm.x + r * 1.6
            } M ${primitive.pointMm.x} ${vy(primitive.pointMm.y) - r * 1.6} V ${
              vy(primitive.pointMm.y) + r * 1.6
            }`}
          />
        </g>
      );
    }
    case 'notch': {
      const r = unit * 4;
      return (
        <path
          {...common}
          data-notch-indicator={primitive.indicator}
          d={`M ${primitive.pointMm.x - r} ${vy(primitive.pointMm.y) - r} L ${
            primitive.pointMm.x
          } ${vy(primitive.pointMm.y) + r} L ${primitive.pointMm.x + r} ${
            vy(primitive.pointMm.y) - r
          }`}
        />
      );
    }
    case 'dart': {
      const points = [
        primitive.baseLeftMm,
        primitive.apexMm,
        primitive.baseRightMm,
        primitive.baseLeftMm,
      ];
      return (
        <polyline
          {...common}
          data-dart-intake-mm={primitive.intakeMm}
          points={ptsAttr(points)}
          stroke={SHEET_INK.green}
        />
      );
    }
  }
}

function toolInstruction(tool: PatternImportDxfPhaseEDraftCadToolV1, sizeToken: string): string {
  if (tool === 'pen') return 'Click two points to record one open Pen path intent.';
  if (tool === 'cut') return 'Click two points to split the piece across its grade.';
  if (tool === 'dart')
    return `For size ${sizeToken}, pick an exact edge, then click the apex and intake.`;
  if (tool === 'guideline') return 'Click two points to record one dashed construction guideline.';
  if (tool === 'internal-line')
    return `Click two points to add an internal line in size ${sizeToken}.`;
  if (tool === 'pattern-line')
    return `Click two points to add a pattern line in size ${sizeToken}.`;
  if (tool === 'french-curve')
    return `Click the start, control and end points to add a French curve in size ${sizeToken}.`;
  if (tool === 'ellipse')
    return 'Click the centre, major-axis point and minor-radius point to record one ellipse intent.';
  if (tool === 'add-point')
    return 'Select an exact edge to insert its midpoint across the piece’s grade.';
  if (tool === 'fish-eye')
    return 'Click the centre, axis end and intake side to record one fish-eye dart intent.';
  if (tool === 'spread')
    return 'After a cut, click the pivot and a second point to set the spread across the grade.';
  if (tool === 'gather')
    return 'Select an exact highlighted boundary edge to record a visible default 1.5 gather ratio.';
  if (tool === 'pleat')
    return 'Click both fold-line ends and an intake-side point to record a left/right pleat intent.';
  if (tool === 'notch')
    return `Select an exact boundary edge to add a single notch in size ${sizeToken}.`;
  if (tool === 'rectangle')
    return `Click opposite corners to create an ungraded piece in size ${sizeToken}.`;
  if (tool === 'circle') return 'Click a centre and then its radius to record one circle intent.';
  if (tool === 'mark') return `Click the piece to place a drill mark in size ${sizeToken}.`;
  if (tool === 'point-only' || tool === 'draft-point')
    return 'Click the exact sheet to record one local Draft intent.';
  return `${tool} input is unavailable until a verified pattern geometry kernel is integrated. No command will be recorded.`;
}

export function PatternImportDxfPhaseEDraftCadCanvasV1({
  session,
  projection,
  scopeKey,
  activePieceIndex,
  activeTool,
  arrangeActive = false,
  panActive = false,
  crossScopeConnectActive = false,
  onActivePieceIndexChange,
  selectedPieceIds = [],
  onSelectedPieceIdsChange,
  arrangement = null,
  onArrangementChange,
  topologySession,
  activeTopologyTool,
  onSessionChange,
  onTopologyAnchor,
  onCrossScopeEdge,
}: PatternImportDxfPhaseEDraftCadCanvasPropsV1) {
  const [pendingPoints, setPendingPoints] = useState<readonly PtMm[]>([]);
  const [pendingDartBase, setPendingDartBase] =
    useState<PatternImportDxfPhaseEDraftCadCanvasDartBaseV1 | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const arrangeGesture = useRef<{
    pieceId: string;
    startSvg: Readonly<{ x: number; y: number }>;
    origins: Readonly<
      Record<string, Pick<PatternImportDxfPhaseEDraftCadArrangementTransformV1, 'x' | 'y'>>
    >;
  } | null>(null);
  const sequence = useRef(0);
  const preview = useMemo(
    () => buildPatternImportDxfPhaseEDraftCadPreviewV1(session, projection),
    [projection, session],
  );
  const piece = activeProjectedPiece(session, projection, activePieceIndex);
  const sourcePiece = session.source.catalog.pieces[activePieceIndex];
  const primitives = preview.primitives.filter(
    (primitive) =>
      primitive.target.pieceId === sourcePiece?.pieceId &&
      primitive.target.pieceLineKey === sourcePiece?.pieceLineKey,
  );
  const sourceMismatch = preview.blockers.some(
    (blocker) => blocker.code === 'source-projection-mismatch',
  );
  const dartBases = useMemo(
    () =>
      buildPatternImportDxfPhaseEDraftCadCanvasDartBasesV1(session, projection, activePieceIndex),
    [activePieceIndex, projection, session],
  );
  const exactVertexOptions = useMemo(
    () =>
      buildPatternImportDxfPhaseEDraftCadExactVertexOptionsV1(
        session,
        projection,
        activePieceIndex,
      ),
    [activePieceIndex, projection, session],
  );
  const interactionEnabled =
    !arrangeActive &&
    !panActive &&
    (crossScopeConnectActive || !!activeTopologyTool || INPUT_TOOLS.has(activeTool)) &&
    !!piece &&
    !sourceMismatch;
  const resetKey = `${activeTool}|${activeTopologyTool ?? ''}|${activePieceIndex}|${session.cursor}|${session.source.revision}|${session.source.catalog.canonicalSha256}|${projection.expectedCatalogCanonicalSha256}|${projection.sizeSelectionCanonicalSha256}|${projection.sourceFileId}`;

  useEffect(() => {
    setPendingPoints([]);
    setPendingDartBase(null);
    setInputError(null);
  }, [arrangeActive, resetKey]);

  const unavailable = !piece
    ? 'The active exact piece is not available in the projection sealed to this Draft session.'
    : !activeTopologyTool && !INPUT_TOOLS.has(activeTool)
      ? toolInstruction(activeTool, projection.sizeToken)
      : sourceMismatch
        ? 'The exact projection does not match this Draft session source.'
        : null;
  const bbox = arrangeActive
    ? arrangementViewportBounds(projection, arrangement?.transforms ?? {})
    : viewportBounds(piece, primitives, pendingPoints);
  const displayTransforms = arrangeActive ? arrangement?.transforms : undefined;
  const overlayTransform = piece && displayTransforms?.[piece.pieceId];
  const renderedPieces = arrangeActive ? projection.pieces : piece ? [piece] : [];

  return (
    <section
      data-draft-cad-canvas-v1=''
      data-active-tool={activeTool}
      data-active-topology-tool={activeTopologyTool ?? undefined}
      data-draft-cad-input={interactionEnabled ? 'enabled' : 'blocked'}
      data-draft-cad-history-cursor={session.cursor}
      className='flex h-full min-h-0 flex-col gap-2'
    >
      <div className='relative min-h-0 flex-1 overflow-hidden bg-bgColor'>
        <SheetViewport
          bbox={bbox}
          tool={arrangeActive ? 'lasso' : panActive ? 'pan' : interactionEnabled ? 'point' : 'pan'}
          onLasso={(pointsMm, modifiers) => {
            if (!arrangeActive) return;
            const next = selectPatternImportDxfPhaseEDraftCadPiecesInLassoV1(
              projection,
              arrangement?.transforms ?? {},
              pointsMm,
            );
            onSelectedPieceIdsChange?.(
              modifiers.shiftKey ? togglePieceIds(selectedPieceIds, next) : next,
            );
            const first = projection.pieces.findIndex(({ pieceId }) => pieceId === next[0]);
            if (first >= 0) onActivePieceIndexChange?.(first);
          }}
          className='min-h-0'
          onPick={(key, modifiers) => {
            if (arrangeActive) {
              if (!key) onSelectedPieceIdsChange?.([]);
              return;
            }
            if (!interactionEnabled) return;
            if (crossScopeConnectActive) {
              const base = dartBases.find((candidate) => candidate.key === key);
              if (base && sourcePiece && scopeKey)
                onCrossScopeEdge?.({
                  scopeKey,
                  pieceId: sourcePiece.pieceId,
                  pieceLineKey: sourcePiece.pieceLineKey,
                  contourId: base.anchor.contourId,
                  boundaryVertexIds: base.anchor.boundaryVertexIds,
                  direction: modifiers.shiftKey ? 'reverse' : 'forward',
                });
              return;
            }
            if (activeTopologyTool) {
              const option = exactVertexOptions.find((candidate) => candidate.key === key);
              if (option) onTopologyAnchor(option.anchor);
              return;
            }
            if (!EXACT_EDGE_TOOLS.has(activeTool)) return;
            const base = dartBases.find((candidate) => candidate.key === key) ?? null;
            if (activeTool !== 'dart') {
              const result = recordPatternImportDxfPhaseEDraftCadCanvasBoundaryPickV1({
                session,
                projection,
                activePieceIndex,
                activeTool,
                baseKey: key,
                sequence: sequence.current,
              });
              setPendingDartBase(null);
              setPendingPoints([]);
              setInputError(result.blocker);
              sequence.current = result.sequence;
              if (result.recorded) onSessionChange(result.session);
              return;
            }
            setPendingDartBase(base);
            setPendingPoints([]);
            setInputError(
              base ? null : 'Select one highlighted exact boundary edge for the dart base.',
            );
          }}
          onPoint={(pointMm) => {
            if (!interactionEnabled || activeTopologyTool) return;
            const result = recordPatternImportDxfPhaseEDraftCadCanvasPointV1({
              session,
              projection,
              activePieceIndex,
              activeTool,
              pointMm,
              pendingPoints,
              pendingDartBase,
              sequence: sequence.current,
            });
            setPendingPoints(result.pendingPoints);
            setPendingDartBase(result.pendingDartBase);
            setInputError(result.blocker);
            sequence.current = result.sequence;
            if (result.recorded) onSessionChange(result.session);
          }}
        >
          {({ box, unit }) => (
            <>
              <PatternImportDxfPhaseEDraftCadGridRulersV1 box={box} unit={unit} layer='grid' />
              <line
                data-draft-cad-floor-reference=''
                x1={box.x}
                y1={vy(bbox.minY)}
                x2={box.x + box.w}
                y2={vy(bbox.minY)}
                stroke='var(--color-labelColor)'
                strokeOpacity='0.4'
                strokeWidth={0.75}
                vectorEffect='non-scaling-stroke'
                pointerEvents='none'
              />
              {renderedPieces.map((renderedPiece) => {
                const transform =
                  displayTransforms?.[renderedPiece.pieceId] ??
                  PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_IDENTITY_TRANSFORM_V1;
                const projectionIndex = projection.pieces.findIndex(
                  (candidate) => candidate.pieceId === renderedPiece.pieceId,
                );
                return (
                  <g
                    key={renderedPiece.pieceId}
                    data-draft-cad-exact-piece={renderedPiece.pieceId}
                    data-piece-line-key={renderedPiece.pieceLineKey}
                    data-local-piece-offset-x={transform.x}
                    data-local-piece-offset-y={transform.y}
                    data-local-piece-quarter-turns={transform.quarterTurns}
                    data-local-piece-flip-x={transform.flipX}
                    data-arrange-selected={
                      arrangeActive && selectedPieceIds.includes(renderedPiece.pieceId)
                        ? ''
                        : undefined
                    }
                    aria-label='Exact Phase E source geometry, read only'
                    transform={patternImportDxfPhaseEDraftCadArrangementSvgTransformV1(
                      renderedPiece,
                      transform,
                    )}
                    className={arrangeActive ? 'cursor-move' : undefined}
                    onPointerDown={(event) => {
                      if (!arrangeActive) return;
                      const startSvg = pointerSvgPoint(event);
                      if (!startSvg) return;
                      event.stopPropagation();
                      const nextSelection = event.shiftKey
                        ? togglePieceIds(selectedPieceIds, [renderedPiece.pieceId])
                        : selectedPieceIds.includes(renderedPiece.pieceId)
                          ? selectedPieceIds
                          : Object.freeze([renderedPiece.pieceId]);
                      onSelectedPieceIdsChange?.(nextSelection);
                      const movedIds = nextSelection.includes(renderedPiece.pieceId)
                        ? nextSelection
                        : [renderedPiece.pieceId];
                      arrangeGesture.current = {
                        pieceId: renderedPiece.pieceId,
                        startSvg,
                        origins: Object.freeze(
                          Object.fromEntries(
                            movedIds.map((pieceId) => [
                              pieceId,
                              arrangement?.transforms[pieceId] ??
                                PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_IDENTITY_TRANSFORM_V1,
                            ]),
                          ),
                        ),
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                      if (projectionIndex >= 0) onActivePieceIndexChange?.(projectionIndex);
                    }}
                    onPointerMove={(event) => {
                      const gesture = arrangeGesture.current;
                      if (!arrangeActive || gesture?.pieceId !== renderedPiece.pieceId) return;
                      const currentSvg = pointerSvgPoint(event);
                      if (!currentSvg) return;
                      event.stopPropagation();
                      if (!arrangement || !onArrangementChange) return;
                      onArrangementChange(
                        movePatternImportDxfPhaseEDraftCadArrangementPiecesV1(
                          arrangement,
                          gesture.origins,
                          {
                            x: currentSvg.x - gesture.startSvg.x,
                            y: -(currentSvg.y - gesture.startSvg.y),
                          },
                        ),
                      );
                    }}
                    onPointerUp={(event) => {
                      if (arrangeGesture.current?.pieceId !== renderedPiece.pieceId) return;
                      event.stopPropagation();
                      arrangeGesture.current = null;
                      if (event.currentTarget.hasPointerCapture(event.pointerId))
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onPointerCancel={() => {
                      arrangeGesture.current = null;
                    }}
                  >
                    {arrangeActive ? (
                      <rect
                        x={renderedPiece.cameraMm.minX}
                        y={vy(renderedPiece.cameraMm.maxY)}
                        width={renderedPiece.cameraMm.maxX - renderedPiece.cameraMm.minX}
                        height={renderedPiece.cameraMm.maxY - renderedPiece.cameraMm.minY}
                        fill='transparent'
                        stroke={
                          selectedPieceIds.includes(renderedPiece.pieceId)
                            ? SHEET_INK.blue
                            : 'transparent'
                        }
                        strokeWidth={1}
                        strokeDasharray={`${unit * 4} ${unit * 3}`}
                        vectorEffect='non-scaling-stroke'
                        pointerEvents='all'
                      />
                    ) : null}
                    {renderedPiece.contours.map((contour) => {
                      const points = contour.vertices.map(({ pointMm }) => pointMm);
                      const closed =
                        contour.closed && points.length > 0 ? [...points, points[0]] : points;
                      return (
                        <polyline
                          key={contour.contourId}
                          data-draft-cad-exact-contour={contour.contourId}
                          data-contour-role={contour.role}
                          points={ptsAttr(closed)}
                          fill='none'
                          stroke={
                            contour.role === 'sewing-boundary' ? SHEET_INK.ink : SHEET_INK.mut
                          }
                          strokeWidth={1.1}
                          strokeDasharray={
                            contour.role === 'cut-boundary' ? `${unit * 6} ${unit * 3}` : undefined
                          }
                          vectorEffect='non-scaling-stroke'
                          pointerEvents='none'
                        />
                      );
                    })}
                  </g>
                );
              })}
              {interactionEnabled &&
                !activeTopologyTool &&
                (crossScopeConnectActive || EXACT_EDGE_TOOLS.has(activeTool)) && (
                  <g
                    data-draft-cad-exact-edge-options=''
                    data-draft-cad-cross-scope-edge-options={
                      crossScopeConnectActive ? '' : undefined
                    }
                    data-draft-cad-dart-edge-options={activeTool === 'dart' ? '' : undefined}
                  >
                    {dartBases.map((base) => {
                      const selected = pendingDartBase?.key === base.key;
                      return (
                        <g key={base.key} data-selected={selected ? '' : undefined}>
                          <line
                            data-draft-cad-exact-edge-ink={base.key}
                            data-screen-stroke-px='1.5'
                            x1={base.fromMm.x}
                            y1={vy(base.fromMm.y)}
                            x2={base.toMm.x}
                            y2={vy(base.toMm.y)}
                            stroke={selected ? SHEET_INK.green : SHEET_INK.blue}
                            strokeOpacity={selected ? 0.9 : 0.7}
                            strokeWidth={1.5}
                            vectorEffect='non-scaling-stroke'
                            pointerEvents='none'
                          />
                          <line
                            data-key={base.key}
                            data-draft-cad-dart-edge={
                              crossScopeConnectActive ? undefined : base.key
                            }
                            data-draft-cad-cross-scope-edge={
                              crossScopeConnectActive ? base.key : undefined
                            }
                            data-draft-cad-exact-edge={base.key}
                            data-screen-hit-px='12'
                            x1={base.fromMm.x}
                            y1={vy(base.fromMm.y)}
                            x2={base.toMm.x}
                            y2={vy(base.toMm.y)}
                            stroke='transparent'
                            strokeWidth={12}
                            vectorEffect='non-scaling-stroke'
                            pointerEvents='stroke'
                          />
                        </g>
                      );
                    })}
                  </g>
                )}
              {interactionEnabled && activeTopologyTool ? (
                <g data-draft-cad-exact-vertex-options=''>
                  {exactVertexOptions.map((option) => {
                    const selected = topologySession.pendingAnchors.some(
                      (anchor) =>
                        anchor.pieceId === option.anchor.pieceId &&
                        anchor.contourId === option.anchor.contourId &&
                        anchor.vertexId === option.anchor.vertexId,
                    );
                    return (
                      <g key={option.key} data-selected={selected ? '' : undefined}>
                        <circle
                          data-draft-cad-exact-vertex-ink={option.anchor.vertexId}
                          data-screen-radius-px='4.5'
                          cx={option.pointMm.x}
                          cy={vy(option.pointMm.y)}
                          r={unit * 4.5}
                          fill={selected ? SHEET_INK.red : 'var(--color-bgColor)'}
                          fillOpacity={selected ? 0.35 : 0.92}
                          stroke={selected ? SHEET_INK.red : SHEET_INK.ink}
                          strokeWidth={1.25}
                          vectorEffect='non-scaling-stroke'
                          pointerEvents='none'
                        />
                        <circle
                          data-key={option.key}
                          data-draft-cad-exact-vertex={option.anchor.vertexId}
                          data-screen-hit-radius-px='10'
                          cx={option.pointMm.x}
                          cy={vy(option.pointMm.y)}
                          r={unit * 10}
                          fill='transparent'
                          stroke='none'
                          pointerEvents='all'
                        />
                      </g>
                    );
                  })}
                </g>
              ) : null}
              <g
                transform={
                  piece && overlayTransform
                    ? patternImportDxfPhaseEDraftCadArrangementSvgTransformV1(
                        piece,
                        overlayTransform,
                      )
                    : undefined
                }
              >
                <g data-draft-cad-committed-preview=''>
                  {primitives.map((primitive) => (
                    <PreviewPrimitive
                      key={`${primitive.commandId}:${primitive.entityId}`}
                      primitive={primitive}
                      unit={unit}
                    />
                  ))}
                </g>
                {piece ? (
                  <PatternImportDxfPhaseEDraftCadTopologyOverlayV1
                    projection={projection}
                    state={topologySession}
                    pieceId={piece.pieceId}
                    unit={unit}
                  />
                ) : null}
              </g>
              <g
                data-draft-cad-pending-input=''
                pointerEvents='none'
                visibility={arrangeActive ? 'hidden' : undefined}
              >
                {pendingPoints.length > 1 ? (
                  <polyline
                    data-draft-cad-stage-path=''
                    points={ptsAttr(pendingPoints)}
                    fill='none'
                    stroke={SHEET_INK.blue}
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    strokeDasharray={`${unit * 4} ${unit * 3}`}
                    vectorEffect='non-scaling-stroke'
                  />
                ) : null}
                {pendingDartBase && (
                  <circle
                    data-draft-cad-dart-base-point=''
                    cx={pendingDartBase.pointMm.x}
                    cy={vy(pendingDartBase.pointMm.y)}
                    r={unit * 5}
                    fill={SHEET_INK.green}
                    fillOpacity={0.2}
                    stroke={SHEET_INK.green}
                    strokeWidth={1}
                    vectorEffect='non-scaling-stroke'
                  />
                )}
                {pendingPoints.map((point, index) => (
                  <circle
                    key={`${point.x}:${point.y}:${index}`}
                    data-draft-cad-stage-point={index}
                    cx={point.x}
                    cy={vy(point.y)}
                    r={unit * 4}
                    fill={SHEET_INK.blue}
                    fillOpacity={0.18}
                    stroke={SHEET_INK.blue}
                    strokeWidth={1}
                    vectorEffect='non-scaling-stroke'
                  />
                ))}
              </g>
              <PatternImportDxfPhaseEDraftCadGridRulersV1 box={box} unit={unit} layer='rulers' />
            </>
          )}
        </SheetViewport>
      </div>
      <div
        data-draft-cad-input-blocker={unavailable || inputError ? '' : undefined}
        aria-live='polite'
        className={
          unavailable || inputError ? 'text-small text-warning' : 'text-small text-labelColor'
        }
      >
        {panActive
          ? 'Drag the canvas to pan. Wheel zooms at the pointer; double-click fits.'
          : arrangeActive
            ? `${selectedPieceIds.length} selected · drag a selected piece to move the set; drag empty canvas to select; Shift toggles. Wheel zooms and double-click fits.`
            : inputError ??
              unavailable ??
              (activeTopologyTool
                ? 'Choose an exact highlighted vertex from the sealed projection.'
                : toolInstruction(activeTool, projection.sizeToken))}
      </div>
      {preview.blockers.length > 0 && (
        <ul data-draft-cad-preview-blockers='' className='space-y-1 text-small text-warning'>
          {preview.blockers.map((blocker, index) => (
            <li key={`${blocker.code}:${blocker.commandId ?? index}`}>
              {blocker.code}: {blocker.detail}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
