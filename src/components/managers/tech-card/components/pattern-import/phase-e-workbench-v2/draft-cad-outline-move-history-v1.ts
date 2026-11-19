import type { PatternImportDxfProductPhaseEAssemblyProjectionContourV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PieceSpec, PtMm } from 'lib/pattern-import/types';
import { blockNameOf } from 'lib/pattern-import/write/plan';
import type { PatternImportDxfPhaseEDraftCadCommandV1 } from './draft-cad-session-v1';

export type DraftOutlineMoveV1 = Extract<
  PatternImportDxfPhaseEDraftCadCommandV1,
  { tool: 'move-point' }
>;

export function draftOutlineMoveHistoryV1(
  commands: readonly PatternImportDxfPhaseEDraftCadCommandV1[],
): readonly DraftOutlineMoveV1[] | null {
  const first = commands[0];
  if (first?.tool !== 'move-point') return null;
  return commands.every(
    (command): command is DraftOutlineMoveV1 =>
      command.tool === 'move-point' &&
      command.target.pieceId === first.target.pieceId &&
      command.target.pieceLineKey === first.target.pieceLineKey &&
      command.payload.contourId === first.payload.contourId &&
      command.payload.sizeToken === first.payload.sizeToken,
  )
    ? commands
    : null;
}

/** Only native source vertex IDs survive each edit; Draft coordinates never identify a vertex. */
export function draftOutlineMovePositionsV1(
  moves: readonly DraftOutlineMoveV1[],
  contour: PatternImportDxfProductPhaseEAssemblyProjectionContourV1,
) {
  const vertexIds = new Set(contour.vertices.map(({ vertexId }) => vertexId));
  const positions = new Map<string, PtMm>();
  for (const { payload } of moves) {
    if (
      payload.contourId !== contour.contourId ||
      !vertexIds.has(payload.vertexId) ||
      !Number.isFinite(payload.pointMm.x) ||
      !Number.isFinite(payload.pointMm.y)
    )
      return null;
    positions.set(payload.vertexId, payload.pointMm);
  }
  return positions;
}

/** The authoring rank remains the persisted label. The writer still emits one shared UNI block. */
export function sharedOutlineBlockForWriterPieceV1(
  piece: PieceSpec | undefined,
  sizeToken: string,
) {
  const size = piece?.sizes[0];
  return piece?.ungraded && piece.sizes.length === 1 && size?.sizeToken === sizeToken
    ? blockNameOf(piece, size)
    : null;
}
