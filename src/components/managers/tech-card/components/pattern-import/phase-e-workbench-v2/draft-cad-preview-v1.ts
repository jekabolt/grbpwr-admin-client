import { adjustedSavedDartFeetV1, movedSavedFishEyePointsV1 } from './draft-cad-saved-dart-tip-v1';
import { activeDraftCadTransactionsV1, parallelOpeningAxisV1 } from './draft-cad-session-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { signedArea } from 'lib/pattern-import/semantics/geom';
import type { AuthoredNotchShape, PtMm } from 'lib/pattern-import/types';

import type {
  PatternImportDxfPhaseEDraftCadBoundaryAnchorV1,
  PatternImportDxfPhaseEDraftCadCommandV1,
  PatternImportDxfPhaseEDraftCadSessionV1,
  PatternImportDxfPhaseEDraftCadTargetV1,
  PatternImportDxfPhaseEDraftCadToolV1,
} from './draft-cad-session-v1';

import {
  resizeDraftStraightEdgeV1,
  selectDraftSharpCornerV1,
} from './draft-cad-edge-length-geometry-v1';
import { selectDraftCutAllowanceOffsetV1 } from './draft-cad-allowance-offset-geometry-v1';
import {
  draftOutlineMoveHistoryV1,
  draftOutlineMovePositionsV1,
} from './draft-cad-outline-move-history-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PREVIEW_V1 =
  'pattern-import-dxf-phase-e-draft-cad-preview/1' as const;

export type PatternImportDxfPhaseEDraftCadPreviewBoundsV1 = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

type PrimitiveBase<Kind extends string> = Readonly<{
  kind: Kind;
  commandId: string;
  entityId: string;
  tool: PatternImportDxfPhaseEDraftCadToolV1;
  target: PatternImportDxfPhaseEDraftCadTargetV1;
}>;

export type PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1 =
  | (PrimitiveBase<'path'> &
      Readonly<{
        pointsMm: readonly PtMm[];
        closed: boolean;
        role: 'outline' | 'internal' | 'construction' | 'pattern' | 'cut-intent';
        stroke: 'solid' | 'dashed';
      }>)
  | (PrimitiveBase<'curve'> &
      Readonly<{
        controlPointsMm: readonly PtMm[];
        role: 'french-curve';
      }>)
  | (PrimitiveBase<'rectangle'> &
      Readonly<{
        originMm: PtMm;
        widthMm: number;
        heightMm: number;
        rotationDeg: number;
      }>)
  | (PrimitiveBase<'circle'> & Readonly<{ centerMm: PtMm; radiusMm: number }>)
  | (PrimitiveBase<'ellipse'> &
      Readonly<{
        centerMm: PtMm;
        radiusXmm: number;
        radiusYmm: number;
        rotationDeg: number;
      }>)
  | (PrimitiveBase<'point'> &
      Readonly<{
        pointMm: PtMm;
        indicator: 'draft' | 'point-only' | 'drill' | 'cross' | 'text';
        text?: string;
      }>)
  | (PrimitiveBase<'notch'> &
      Readonly<{
        pointMm: PtMm;
        indicator: 'single' | 'double' | 'triple' | 'v';
        depthMm: number;
        sourceAnchor: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1;
        strokes?: readonly (readonly [PtMm, PtMm])[];
      }>)
  | (PrimitiveBase<'dart'> &
      Readonly<{
        baseLeftMm: PtMm;
        baseRightMm: PtMm;
        apexMm: PtMm;
        intakeMm: number;
        sourceAnchor: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1;
      }>);

export type PatternImportDxfPhaseEDraftCadPreviewBlockerV1 = Readonly<{
  code:
    | 'source-projection-mismatch'
    | 'invalid-command-geometry'
    | 'anchor-unavailable'
    | 'geometry-kernel-unavailable';
  commandId: string | null;
  tool: PatternImportDxfPhaseEDraftCadToolV1 | null;
  detail: string;
}>;

export type PatternImportDxfPhaseEDraftCadPreviewV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PREVIEW_V1;
  sourceRevision: number;
  sourceCatalogCanonicalSha256: string;
  cursor: number;
  primitives: readonly PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1[];
  bounds: PatternImportDxfPhaseEDraftCadPreviewBoundsV1 | null;
  blockers: readonly PatternImportDxfPhaseEDraftCadPreviewBlockerV1[];
  previewReady: boolean;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PREVIEW_CLAIMS_V1 = Object.freeze({
  activeTransactionsThroughCursorOnly: true,
  exactAnchorCoordinatesFromExistingProjectionOnly: true,
  sourceMillimetresPreserved: true,
  createsCoordinateAuthority: false,
  createsDocumentModel: false,
  createsPersistenceModel: false,
  createsApplyAuthority: false,
  productionReady: false,
} as const);

type MutableBounds = { minX: number; minY: number; maxX: number; maxY: number };

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function clonePoint(value: PtMm): PtMm {
  return Object.freeze({ x: value.x, y: value.y });
}

function finitePoint(value: PtMm): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function extend(bounds: MutableBounds | null, point: PtMm): MutableBounds {
  if (!bounds) return { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
  return bounds;
}

function extendPoints(bounds: MutableBounds | null, points: readonly PtMm[]): MutableBounds | null {
  let next = bounds;
  for (const value of points) next = extend(next, value);
  return next;
}

function commandBlocker(
  command: PatternImportDxfPhaseEDraftCadCommandV1,
  code: PatternImportDxfPhaseEDraftCadPreviewBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEDraftCadPreviewBlockerV1 {
  return Object.freeze({ code, commandId: command.commandId, tool: command.tool, detail });
}

function primitiveBase(command: PatternImportDxfPhaseEDraftCadCommandV1) {
  return {
    commandId: command.commandId,
    entityId: command.payload.entityId,
    tool: command.tool,
    target: deepFreeze(structuredClone(command.target)),
  };
}

function rectangleCorners(
  origin: PtMm,
  widthMm: number,
  heightMm: number,
  rotationDeg: number,
): readonly PtMm[] {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return Object.freeze(
    [
      [0, 0],
      [widthMm, 0],
      [widthMm, heightMm],
      [0, heightMm],
    ].map(([x, y]) =>
      clonePoint({ x: origin.x + x * cos - y * sin, y: origin.y + x * sin + y * cos }),
    ),
  );
}

type ExactAnchorSegment = Readonly<{
  fromMm: PtMm;
  toMm: PtMm;
  pointMm: PtMm;
  cutOrientation: number;
}>;

function exactAnchorSegment(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
  anchor: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1,
  includeCutOrientation = false,
): ExactAnchorSegment | null {
  const catalogPiece = session.source.catalog.pieces.find(
    (piece) => piece.pieceId === target.pieceId && piece.pieceLineKey === target.pieceLineKey,
  );
  const catalogContour = catalogPiece?.contours.find(
    (contour) => contour.contourId === anchor.contourId,
  );
  if (!catalogContour) return null;
  const indexes = anchor.boundaryVertexIds.map((vertexId) =>
    catalogContour.boundaryVertices.findIndex((vertex) => vertex.vertexId === vertexId),
  );
  if (indexes.some((index) => index < 0)) return null;
  const delta = Math.abs(indexes[0] - indexes[1]);
  const closing =
    catalogContour.closed &&
    catalogContour.boundaryVertices.length > 2 &&
    delta === catalogContour.boundaryVertices.length - 1;
  if (delta !== 1 && !closing) return null;

  const projectedPiece = projection.pieces.find(
    (piece) => piece.pieceId === target.pieceId && piece.pieceLineKey === target.pieceLineKey,
  );
  const projectedContour = projectedPiece?.contours.find(
    (contour) => contour.contourId === anchor.contourId,
  );
  const vertices = anchor.boundaryVertexIds.map((vertexId) =>
    projectedContour?.vertices.find((vertex) => vertex.vertexId === vertexId),
  );
  const [from, to] = vertices;
  if (!from || !to || !finitePoint(from.pointMm) || !finitePoint(to.pointMm)) return null;
  const fromMm = clonePoint(from.pointMm);
  const toMm = clonePoint(to.pointMm);
  const ordered = (indexes[0]! + 1) % catalogContour.boundaryVertices.length === indexes[1];
  return Object.freeze({
    fromMm,
    toMm,
    cutOrientation:
      includeCutOrientation && projectedContour?.closed && projectedContour.role === 'cut-boundary'
        ? Math.sign(signedArea(projectedContour.vertices.map(({ pointMm }) => pointMm))) *
          (ordered ? 1 : -1)
        : 0,
    pointMm: clonePoint({
      x: fromMm.x + (toMm.x - fromMm.x) * anchor.progress,
      y: fromMm.y + (toMm.y - fromMm.y) * anchor.progress,
    }),
  });
}

function compoundNotchStrokes(
  shape: AuthoredNotchShape,
  depthMm: number,
  progress: number,
  { fromMm, toMm, pointMm, cutOrientation }: ExactAnchorSegment,
) {
  const dx = toMm.x - fromMm.x;
  const dy = toMm.y - fromMm.y;
  const length = Math.hypot(dx, dy);
  const spacingMm = 3;
  const extent = shape === 'triple' ? spacingMm : spacingMm / 2;
  if (!cutOrientation || Math.min(progress, 1 - progress) * length <= extent) return null;
  const x = dx / length;
  const y = dy / length;
  const offsets = shape === 'triple' ? [-extent, 0, extent] : [-extent, extent];
  return offsets.map((offset) => {
    const at = { x: pointMm.x + offset * x, y: pointMm.y + offset * y };
    const start = shape === 'v' ? pointMm : at;
    return [
      at,
      { x: start.x - y * depthMm * cutOrientation, y: start.y + x * depthMm * cutOrientation },
    ] as const;
  });
}

export function buildPatternImportDxfPhaseEDraftCadPreviewV1(
  session: PatternImportDxfPhaseEDraftCadSessionV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): PatternImportDxfPhaseEDraftCadPreviewV1 {
  const projectionMatches =
    projection.expectedCatalogCanonicalSha256 === session.source.catalog.canonicalSha256 &&
    projection.sizeSelectionCanonicalSha256 ===
      session.source.catalog.sizeSelectionCanonicalSha256 &&
    projection.sourceFileId === session.source.phaseD.sourceFileId;
  if (!projectionMatches)
    return deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PREVIEW_V1,
      sourceRevision: session.source.revision,
      sourceCatalogCanonicalSha256: session.source.catalog.canonicalSha256,
      cursor: session.cursor,
      primitives: [],
      bounds: null,
      blockers: [
        {
          code: 'source-projection-mismatch' as const,
          commandId: null,
          tool: null,
          detail: 'Draft preview requires the existing projection sealed to this source catalog.',
        },
      ],
      previewReady: false,
    });

  const commands = activeDraftCadTransactionsV1(session).flatMap(({ commands }) => commands);
  const outlineMoves = draftOutlineMoveHistoryV1(commands);
  const lastOutlineMove = outlineMoves?.at(-1);
  const primitives: PatternImportDxfPhaseEDraftCadPreviewPrimitiveV1[] = [];
  const blockers: PatternImportDxfPhaseEDraftCadPreviewBlockerV1[] = [];
  let bounds: MutableBounds | null = null;

  for (const command of commands) {
    const base = primitiveBase(command);
    switch (command.tool) {
      case 'pen':
      case 'internal-line':
      case 'pattern-line': {
        const pointsMm = command.payload.pointsMm.map(clonePoint);
        if (!pointsMm.every(finitePoint)) {
          blockers.push(
            commandBlocker(command, 'invalid-command-geometry', 'Path points must be finite.'),
          );
          break;
        }
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm,
            closed: command.tool === 'internal-line' ? false : command.payload.closed,
            role:
              command.tool === 'pen'
                ? ('outline' as const)
                : command.tool === 'internal-line'
                  ? ('internal' as const)
                  : ('pattern' as const),
            stroke: 'solid' as const,
          }),
        );
        bounds = extendPoints(bounds, pointsMm);
        break;
      }
      case 'cut': {
        const pointsMm = command.payload.pointsMm.map(clonePoint);
        if (!pointsMm.every(finitePoint)) {
          blockers.push(
            commandBlocker(command, 'invalid-command-geometry', 'Cut points must be finite.'),
          );
          break;
        }
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm,
            closed: false,
            role: 'cut-intent' as const,
            stroke: 'dashed' as const,
          }),
        );
        bounds = extendPoints(bounds, pointsMm);
        break;
      }
      case 'guideline': {
        const pointsMm = [clonePoint(command.payload.fromMm), clonePoint(command.payload.toMm)];
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm,
            closed: false,
            role: 'construction' as const,
            stroke: 'dashed' as const,
          }),
        );
        bounds = extendPoints(bounds, pointsMm);
        break;
      }
      case 'french-curve': {
        const controlPointsMm = command.payload.controlPointsMm.map(clonePoint);
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'curve' as const,
            controlPointsMm,
            role: 'french-curve' as const,
          }),
        );
        bounds = extendPoints(bounds, controlPointsMm);
        break;
      }
      case 'rectangle': {
        const originMm = clonePoint(command.payload.originMm);
        primitives.push(
          deepFreeze({ ...base, kind: 'rectangle' as const, ...command.payload, originMm }),
        );
        bounds = extendPoints(
          bounds,
          rectangleCorners(
            originMm,
            command.payload.widthMm,
            command.payload.heightMm,
            command.payload.rotationDeg,
          ),
        );
        break;
      }
      case 'circle': {
        const centerMm = clonePoint(command.payload.centerMm);
        primitives.push(
          deepFreeze({ ...base, kind: 'circle' as const, ...command.payload, centerMm }),
        );
        bounds = extendPoints(bounds, [
          { x: centerMm.x - command.payload.radiusMm, y: centerMm.y - command.payload.radiusMm },
          { x: centerMm.x + command.payload.radiusMm, y: centerMm.y + command.payload.radiusMm },
        ]);
        break;
      }
      case 'ellipse': {
        const centerMm = clonePoint(command.payload.centerMm);
        primitives.push(
          deepFreeze({ ...base, kind: 'ellipse' as const, ...command.payload, centerMm }),
        );
        const radians = (command.payload.rotationDeg * Math.PI) / 180;
        const xExtent = Math.hypot(
          command.payload.radiusXmm * Math.cos(radians),
          command.payload.radiusYmm * Math.sin(radians),
        );
        const yExtent = Math.hypot(
          command.payload.radiusXmm * Math.sin(radians),
          command.payload.radiusYmm * Math.cos(radians),
        );
        bounds = extendPoints(bounds, [
          { x: centerMm.x - xExtent, y: centerMm.y - yExtent },
          { x: centerMm.x + xExtent, y: centerMm.y + yExtent },
        ]);
        break;
      }
      case 'draft-point':
      case 'point-only':
      case 'mark': {
        const pointMm = clonePoint(command.payload.pointMm);
        const indicator =
          command.tool === 'draft-point'
            ? ('draft' as const)
            : command.tool === 'point-only'
              ? ('point-only' as const)
              : command.payload.kind;
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'point' as const,
            pointMm,
            indicator,
            ...(command.tool === 'mark' && command.payload.kind === 'text' && command.payload.text
              ? { text: command.payload.text }
              : {}),
          }),
        );
        bounds = extend(bounds, pointMm);
        break;
      }
      case 'notch': {
        const segment = exactAnchorSegment(
          session,
          projection,
          command.target,
          command.payload.anchor,
          command.payload.kind !== 'single',
        );
        if (!segment) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Notch preview requires one exact adjacent catalog edge in the current projection.',
            ),
          );
          break;
        }
        const { kind, depthMm, anchor } = command.payload;
        const strokes =
          kind === 'single' ? null : compoundNotchStrokes(kind, depthMm, anchor.progress, segment);
        if (kind !== 'single' && !strokes) {
          blockers.push(
            commandBlocker(
              command,
              'invalid-command-geometry',
              'Choose a cut edge with room for the full notch.',
            ),
          );
          break;
        }
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'notch' as const,
            pointMm: segment.pointMm,
            indicator: kind,
            depthMm,
            sourceAnchor: structuredClone(anchor),
            ...(strokes ? { strokes } : {}),
          }),
        );
        bounds = extend(bounds, segment.pointMm);
        if (strokes) bounds = extendPoints(bounds, strokes.flat());
        break;
      }
      case 'dart': {
        const segment = exactAnchorSegment(
          session,
          projection,
          command.target,
          command.payload.base,
        );
        if (!segment) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Dart preview requires one exact adjacent catalog edge in the current projection.',
            ),
          );
          break;
        }
        const dx = segment.toMm.x - segment.fromMm.x;
        const dy = segment.toMm.y - segment.fromMm.y;
        const edgeLengthMm = Math.hypot(dx, dy);
        const maxIntakeMm =
          2 *
          Math.min(command.payload.base.progress, 1 - command.payload.base.progress) *
          edgeLengthMm;
        if (
          !edgeLengthMm ||
          command.payload.intakeMm > maxIntakeMm ||
          !finitePoint(command.payload.apexMm)
        ) {
          blockers.push(
            commandBlocker(
              command,
              'invalid-command-geometry',
              'Dart intake must fit its exact boundary edge and its apex must be finite.',
            ),
          );
          break;
        }
        const { savedTip, savedIntakeSourcePathId, intakeMm } = command.payload;
        const adjusted =
          savedIntakeSourcePathId !== undefined && savedTip
            ? adjustedSavedDartFeetV1([segment.fromMm, segment.toMm], savedTip.original, intakeMm)
            : null;
        if (
          savedIntakeSourcePathId !== undefined &&
          (!adjusted ||
            savedTip?.original[1]?.x !== command.payload.apexMm.x ||
            savedTip?.original[1]?.y !== command.payload.apexMm.y)
        ) {
          blockers.push(
            commandBlocker(
              command,
              'invalid-command-geometry',
              'The new intake must keep the saved apex and center on the original cut edge.',
            ),
          );
          break;
        }
        const ux = dx / edgeLengthMm;
        const uy = dy / edgeLengthMm;
        const half = intakeMm / 2;
        const baseLeftMm = clonePoint(
          adjusted?.[0] ?? {
            x: segment.pointMm.x - ux * half,
            y: segment.pointMm.y - uy * half,
          },
        );
        const baseRightMm = clonePoint(
          adjusted?.[1] ?? {
            x: segment.pointMm.x + ux * half,
            y: segment.pointMm.y + uy * half,
          },
        );
        const apexMm = clonePoint(command.payload.apexMm);
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'dart' as const,
            baseLeftMm,
            baseRightMm,
            apexMm,
            intakeMm: command.payload.intakeMm,
            sourceAnchor: structuredClone(command.payload.base),
          }),
        );
        bounds = extendPoints(bounds, [baseLeftMm, baseRightMm, apexMm]);
        break;
      }
      case 'move-point':
      case 'delete-point': {
        const { contourId, vertexId, sizeToken } = command.payload;
        const destination = command.tool === 'move-point' ? command.payload.pointMm : null;
        const piece = projection.pieces.find(
          ({ pieceId, pieceLineKey }) =>
            pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
        );
        const contour = piece?.contours.find((item) => item.contourId === contourId);
        const index = contour?.vertices.findIndex((vertex) => vertex.vertexId === vertexId) ?? -1;
        if (
          !contour?.closed ||
          contour.role === 'hole' ||
          index < 0 ||
          projection.sizeToken !== sizeToken ||
          (destination && !finitePoint(destination))
        ) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Choose one exact outline vertex in the active size.',
            ),
          );
          break;
        }
        const count = contour.vertices.length;
        const pointsMm = [
          contour.vertices[(index + count - 1) % count]!.pointMm,
          ...(destination ? [destination] : []),
          contour.vertices[(index + 1) % count]!.pointMm,
        ].map(clonePoint);
        const finalPositions =
          command === lastOutlineMove && outlineMoves
            ? draftOutlineMovePositionsV1(outlineMoves, contour)
            : null;
        const path = finalPositions
          ? contour.vertices.map(({ vertexId, pointMm }) =>
              clonePoint(finalPositions.get(vertexId) ?? pointMm),
            )
          : pointsMm;
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm: path,
            closed: Boolean(finalPositions),
            role: 'outline' as const,
            stroke: 'solid' as const,
          }),
        );
        if (!outlineMoves || command === lastOutlineMove) bounds = extendPoints(bounds, path);
        break;
      }
      case 'sharpen-corner': {
        const { edge, sizeToken } = command.payload;
        const piece = projection.pieces.find(
          ({ pieceId, pieceLineKey }) =>
            pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
        );
        const contour = piece?.contours.find(({ contourId }) => contourId === edge.contourId);
        const candidate =
          projection.sizeToken === sizeToken &&
          exactAnchorSegment(session, projection, command.target, edge) &&
          selectDraftSharpCornerV1(contour, edge.boundaryVertexIds);
        if (!candidate) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Choose an exact bevel between perpendicular straight sides in the current size.',
            ),
          );
          break;
        }
        const { before, corner, after } = candidate;
        const pointsMm = [before, corner, after].map(clonePoint);
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm,
            closed: false,
            role: 'outline' as const,
            stroke: 'solid' as const,
          }),
        );
        bounds = extendPoints(bounds, pointsMm);
        break;
      }
      case 'edge-length': {
        const { edge, fixed, lengthMm, sizeToken } = command.payload;
        const segment = exactAnchorSegment(session, projection, command.target, edge);
        const resized =
          segment && projection.sizeToken === sizeToken
            ? resizeDraftStraightEdgeV1(segment.fromMm, segment.toMm, fixed, lengthMm)
            : null;
        if (!resized) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Edge length requires its exact endpoints in the current size.',
            ),
          );
          break;
        }
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm: resized.map(clonePoint),
            closed: false,
            role: 'outline' as const,
            stroke: 'dashed' as const,
          }),
        );
        bounds = extendPoints(bounds, resized);
        break;
      }
      case 'allowance-offset': {
        const { edge, offsetMm, sizeToken } = command.payload;
        const piece = projection.pieces.find(
          ({ pieceId, pieceLineKey }) =>
            pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
        );
        const contour = piece?.contours.find(({ contourId }) => contourId === edge.contourId);
        const offset =
          sizeToken === projection.sizeToken &&
          selectDraftCutAllowanceOffsetV1(contour, edge.boundaryVertexIds, offsetMm);
        if (!offset) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Choose a cut edge with two exact right-angle joins and a representable offset.',
            ),
          );
          break;
        }
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm: offset.ring.map(clonePoint),
            closed: true,
            role: 'outline' as const,
            stroke: 'dashed' as const,
          }),
        );
        bounds = extendPoints(bounds, offset.ring);
        break;
      }
      case 'add-point': {
        const catalogPiece = session.source.catalog.pieces.find(
          ({ pieceId, pieceLineKey }) =>
            pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
        );
        const contour = catalogPiece?.contours.find(
          ({ contourId }) => contourId === command.payload.contourId,
        );
        const pointMm = clonePoint(command.payload.pointMm);
        if (
          !contour?.boundaryVertices.some(
            ({ vertexId }) => vertexId === command.payload.afterVertexId,
          ) ||
          !finitePoint(pointMm)
        ) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Add-point preview requires one retained contour vertex and one finite exact point.',
            ),
          );
          break;
        }
        primitives.push(
          deepFreeze({ ...base, kind: 'point' as const, pointMm, indicator: 'draft' as const }),
        );
        bounds = extend(bounds, pointMm);
        break;
      }
      case 'fish-eye': {
        if (command.payload.savedMove) {
          const pointsMm = movedSavedFishEyePointsV1(
            command.payload.savedMove.original,
            command.payload.centerMm,
          );
          if (!pointsMm) {
            blockers.push(
              commandBlocker(
                command,
                'invalid-command-geometry',
                'Choose a different exact centre for the saved fish-eye.',
              ),
            );
            break;
          }
          primitives.push(
            deepFreeze({
              ...base,
              kind: 'path' as const,
              pointsMm,
              closed: true,
              role: 'internal' as const,
              stroke: 'dashed' as const,
            }),
          );
          bounds = extendPoints(bounds, pointsMm);
          break;
        }
        const centerMm = clonePoint(command.payload.centerMm);
        if (
          !finitePoint(centerMm) ||
          !(command.payload.axisMm > 0) ||
          !(command.payload.intakeMm > 0) ||
          !Number.isFinite(command.payload.rotationDeg)
        ) {
          blockers.push(
            commandBlocker(
              command,
              'invalid-command-geometry',
              'Fish-eye preview requires finite centre, axis, intake and rotation.',
            ),
          );
          break;
        }
        const { axisMm, intakeMm, rotationDeg } = command.payload;
        const radians = (rotationDeg * Math.PI) / 180;
        const ux = Math.cos(radians);
        const uy = Math.sin(radians);
        const half = intakeMm / 2;
        const pointsMm = [
          { x: centerMm.x + ux * axisMm, y: centerMm.y + uy * axisMm },
          { x: centerMm.x - uy * half, y: centerMm.y + ux * half },
          { x: centerMm.x - ux * axisMm, y: centerMm.y - uy * axisMm },
          { x: centerMm.x + uy * half, y: centerMm.y - ux * half },
        ];
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm,
            closed: true,
            role: 'internal' as const,
            stroke: 'dashed' as const,
          }),
        );
        bounds = extendPoints(bounds, pointsMm);
        break;
      }
      case 'spread': {
        const cut = commands.find(
          (candidate) =>
            candidate.tool === 'cut' &&
            candidate.payload.entityId === command.payload.cutLineEntityId &&
            candidate.target.pieceId === command.target.pieceId &&
            candidate.target.pieceLineKey === command.target.pieceLineKey,
        );
        if (command.payload.mode === 'parallel') {
          const axis = cut?.tool === 'cut' && parallelOpeningAxisV1(cut.payload.pointsMm);
          if (!axis || cut?.tool !== 'cut' || !(command.payload.amountMm > 0)) {
            blockers.push(
              commandBlocker(
                command,
                'anchor-unavailable',
                'Choose a registered horizontal or vertical Cut on this piece.',
              ),
            );
            break;
          }
          const delta =
            command.payload.amountMm * (command.payload.movingSide === 'positive' ? 1 : -1);
          const pointsMm = cut.payload.pointsMm.map((p) => ({ ...p, [axis]: p[axis] + delta }));
          primitives.push(
            deepFreeze({
              ...base,
              kind: 'path' as const,
              pointsMm,
              closed: false,
              role: 'construction' as const,
              stroke: 'dashed' as const,
            }),
          );
          bounds = extendPoints(bounds, pointsMm);
          break;
        }
        const pivotMm = clonePoint(command.payload.pivotMm);
        if (!cut || !finitePoint(pivotMm) || !(command.payload.amountMm > 0)) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Spread preview requires one active Cut intent on the same piece and a positive amount.',
            ),
          );
          break;
        }
        primitives.push(
          deepFreeze({ ...base, kind: 'point' as const, pointMm: pivotMm, indicator: 'cross' }),
        );
        bounds = extend(bounds, pivotMm);
        break;
      }
      case 'gather': {
        const segment = exactAnchorSegment(
          session,
          projection,
          command.target,
          command.payload.span,
        );
        if (!segment || !(command.payload.ratio > 0)) {
          blockers.push(
            commandBlocker(
              command,
              'anchor-unavailable',
              'Gather preview requires one exact adjacent boundary edge and a positive ratio.',
            ),
          );
          break;
        }
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm: [segment.fromMm, segment.toMm],
            closed: false,
            role: 'construction' as const,
            stroke: 'dashed' as const,
          }),
        );
        bounds = extendPoints(bounds, [segment.fromMm, segment.toMm]);
        break;
      }
      case 'pleat': {
        const pointsMm = [
          clonePoint(command.payload.foldFromMm),
          clonePoint(command.payload.foldToMm),
        ];
        if (!pointsMm.every(finitePoint) || !(command.payload.intakeMm > 0)) {
          blockers.push(
            commandBlocker(
              command,
              'invalid-command-geometry',
              'Pleat preview requires one finite fold line and a positive intake.',
            ),
          );
          break;
        }
        primitives.push(
          deepFreeze({
            ...base,
            kind: 'path' as const,
            pointsMm,
            closed: false,
            role: 'construction' as const,
            stroke: 'dashed' as const,
          }),
        );
        bounds = extendPoints(bounds, pointsMm);
        break;
      }
    }
  }

  const frozenBounds = bounds ? Object.freeze({ ...bounds }) : null;
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_PREVIEW_V1,
    sourceRevision: session.source.revision,
    sourceCatalogCanonicalSha256: session.source.catalog.canonicalSha256,
    cursor: session.cursor,
    primitives,
    bounds: frozenBounds,
    blockers,
    previewReady: blockers.length === 0,
  });
}
