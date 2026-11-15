import { identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';
import type { PieceSpec, PtMm, WriteJob } from 'lib/pattern-import/types';

import type { PatternImportDxfPhaseEDraftCadCommandV1 } from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_RECTANGLE_PIECE_EXECUTOR_V1 =
  'pattern-import-dxf-phase-e-draft-cad-rectangle-piece-executor/1' as const;

type RectangleCommand = Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'rectangle' }>;

export type PatternImportDxfPhaseEDraftCadRectanglePieceBlockerCodeV1 =
  | 'invalid-input'
  | 'stale-source'
  | 'invalid-dimensions'
  | 'off-canvas'
  | 'unsupported-rotation'
  | 'duplicate-identity'
  | 'overlap-policy-ambiguous'
  | 'grading-requirement';

export type PatternImportDxfPhaseEDraftCadRectanglePieceResultV1 =
  | Readonly<{
      ok: true;
      job: WriteJob;
      createdPiece: Readonly<{
        pieceId: string;
        pieceLineKey: string;
        contourId: string;
        vertexIds: readonly [string, string, string, string];
        sizeToken: string;
        gradingPolicy: 'ungraded-current-size';
      }>;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      job: null;
      createdPiece: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseEDraftCadRectanglePieceBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_RECTANGLE_PIECE_CLAIMS_V1 = Object.freeze({
  exactTwoCornerGeometryOnly: true,
  coordinateProximitySearchUsed: false,
  explicitSeparateWriterBlockPolicy: true,
  explicitUngradedCurrentSizePolicy: true,
  syntheticGradingCreated: false,
  sourceJobMutated: false,
  deterministicPieceOrder: true,
  retainedPieceSpecWriterReused: true,
  persistenceIntegrated: false,
} as const);

const MIN_DIMENSION_MM = 0.1;
const MAX_ABS_COORDINATE_MM = 1_000_000;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: PatternImportDxfPhaseEDraftCadRectanglePieceBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseEDraftCadRectanglePieceResultV1 {
  return deepFreeze({
    ok: false as const,
    job: null,
    createdPiece: null,
    blockers: [{ code, detail }] as const,
  });
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function finitePoint(value: unknown): value is PtMm {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PtMm>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

function deterministicSeed(identity: string, used: ReadonlySet<number>): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  let candidate = hash >>> 0;
  while (used.has(candidate)) candidate = (candidate + 1) >>> 0;
  return candidate;
}

function validNewPiece(command: RectangleCommand): boolean {
  const piece = command.payload.newPiece as
    | (Partial<NonNullable<RectangleCommand['payload']['newPiece']>> & Record<string, unknown>)
    | undefined;
  return Boolean(
    piece &&
    stableId(piece.pieceId) &&
    stableId(piece.pieceLineKey) &&
    stableId(piece.contourId) &&
    Array.isArray(piece.vertexIds) &&
    piece.vertexIds.length === 4 &&
    piece.vertexIds.every(stableId) &&
    new Set(piece.vertexIds).size === 4 &&
    typeof piece.displayName === 'string' &&
    piece.displayName.trim() === piece.displayName &&
    piece.displayName.length > 0 &&
    piece.displayName.length <= 256 &&
    typeof piece.gradingPolicy === 'string' &&
    typeof piece.placementPolicy === 'string',
  );
}

/**
 * Creates one detached ungraded PieceSpec from exact axis-aligned rectangle coordinates. The new
 * geometry is deliberately a separate writer block: sheet placement/overlap remains the layout
 * session's concern and no implicit overlap resolution or snapping is attempted here.
 */
export function executePatternImportDxfPhaseEDraftCadRectanglePieceV1(
  source: WriteJob,
  command: RectangleCommand,
  selectedSizeToken: string,
): PatternImportDxfPhaseEDraftCadRectanglePieceResultV1 {
  let job: WriteJob;
  try {
    job = structuredClone(source);
  } catch {
    return blocked('invalid-input', 'Rectangle source could not be detached safely.');
  }

  if (
    !job ||
    !Array.isArray(job.pieces) ||
    !Array.isArray(job.sizes) ||
    !command ||
    command.tool !== 'rectangle' ||
    !stableId(command.commandId) ||
    !stableId(command.payload?.entityId) ||
    !stableId(command.target?.pieceId) ||
    !stableId(command.target?.pieceLineKey) ||
    !stableId(selectedSizeToken) ||
    !finitePoint(command.payload.originMm) ||
    !validNewPiece(command)
  )
    return blocked(
      'invalid-input',
      'Rectangle requires finite exact geometry and complete stable piece topology identities.',
    );

  const newPiece = command.payload.newPiece!;
  if (newPiece.placementPolicy !== 'separate-writer-block')
    return blocked(
      'overlap-policy-ambiguous',
      'Rectangle creation requires the explicit separate-writer-block overlap policy.',
    );
  if (newPiece.gradingPolicy !== 'ungraded-current-size')
    return blocked(
      'grading-requirement',
      'Rectangle creation cannot invent grading; choose the explicit current-size ungraded policy.',
    );

  const widthMm = command.payload.widthMm;
  const heightMm = command.payload.heightMm;
  if (
    !Number.isFinite(widthMm) ||
    !Number.isFinite(heightMm) ||
    widthMm < MIN_DIMENSION_MM ||
    heightMm < MIN_DIMENSION_MM
  )
    return blocked(
      'invalid-dimensions',
      `Rectangle width and height must each be at least ${MIN_DIMENSION_MM} mm.`,
    );
  if (!Number.isFinite(command.payload.rotationDeg) || command.payload.rotationDeg !== 0)
    return blocked(
      'unsupported-rotation',
      'Create piece currently accepts exact axis-aligned corner geometry only.',
    );

  const maxX = command.payload.originMm.x + widthMm;
  const maxY = command.payload.originMm.y + heightMm;
  if (
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    [command.payload.originMm.x, command.payload.originMm.y, maxX, maxY].some(
      (coordinate) => Math.abs(coordinate) > MAX_ABS_COORDINATE_MM,
    )
  )
    return blocked(
      'off-canvas',
      `Rectangle coordinates must stay inside the ±${MAX_ABS_COORDINATE_MM} mm authoring envelope.`,
    );

  const contextPieces = job.pieces.filter(({ identity }) => identity === command.target.pieceId);
  const selectedSizes = job.sizes.filter(({ token }) => token === selectedSizeToken);
  const contextSizes = contextPieces[0]?.sizes.filter(
    ({ sizeToken }) => sizeToken === selectedSizeToken,
  );
  if (contextPieces.length !== 1 || selectedSizes.length !== 1 || contextSizes?.length !== 1)
    return blocked(
      'stale-source',
      'Rectangle context and selected size must resolve exactly once in the retained writer job.',
    );

  if (
    new Set(job.pieces.map(({ identity }) => identity)).size !== job.pieces.length ||
    job.pieces.some(({ identity }) => identity === newPiece.pieceId)
  )
    return blocked(
      'duplicate-identity',
      `Rectangle piece identity ${newPiece.pieceId} is already present or the source is ambiguous.`,
    );

  const identityIssue = identityProblem(newPiece.pieceId, {
    isSizeToken: sizeTokenTest(job.sizes.map(({ token }) => token)),
    pair: null,
  });
  if (identityIssue)
    return blocked(
      'invalid-input',
      `Rectangle piece identity ${newPiece.pieceId} is not writer-safe: ${identityIssue}.`,
    );
  if (!/^[A-Z][A-Z0-9]*$/.test(newPiece.pieceId))
    return blocked(
      'invalid-input',
      'Rectangle piece identity must be one writer-safe code word; modifiers are not inferred.',
    );

  const origin = command.payload.originMm;
  const cut = [
    { x: origin.x, y: origin.y },
    { x: maxX, y: origin.y },
    { x: maxX, y: maxY },
    { x: origin.x, y: maxY },
  ];
  const selectedSize = selectedSizes[0]!;
  const contextPiece = contextPieces[0]!;
  const piece: PieceSpec = {
    identity: newPiece.pieceId,
    code: newPiece.pieceId,
    mods: [],
    displayName: newPiece.displayName,
    nameOrigin: 'operator',
    seed: deterministicSeed(newPiece.pieceId, new Set(job.pieces.map(({ seed }) => seed))),
    variant: null,
    pairHand: null,
    pairOf: null,
    unfoldedFold: false,
    piecesPerGarment: 1,
    allowance: {
      meaning: 'cut',
      allowanceMm: 0,
      origin: 'operator',
      evidence: ['draft-cad:rectangle:create-piece:ungraded-current-size'],
    },
    fabrics: [...contextPiece.fabrics],
    fused: false,
    ungraded: true,
    sizes: [
      {
        rank: selectedSize.rank,
        sizeToken: selectedSize.token,
        sizeId: selectedSize.sizeId,
        cut: cut.map((point) => ({ ...point })),
        seam: cut.map((point) => ({ ...point })),
        grain: null,
        notches: [],
        drills: [],
        internal: [],
        fold: null,
        offset: null,
        walls: [],
        bbox: { minX: origin.x, minY: origin.y, maxX, maxY },
        areaMm2: widthMm * heightMm,
      },
    ],
  };

  // Existing replay order is retained. New pieces are appended in active command order.
  job.pieces.push(piece);
  return deepFreeze({
    ok: true as const,
    job,
    createdPiece: {
      pieceId: newPiece.pieceId,
      pieceLineKey: newPiece.pieceLineKey,
      contourId: newPiece.contourId,
      vertexIds: [...newPiece.vertexIds] as [string, string, string, string],
      sizeToken: selectedSizeToken,
      gradingPolicy: newPiece.gradingPolicy,
    },
    blockers: [] as const,
  });
}
